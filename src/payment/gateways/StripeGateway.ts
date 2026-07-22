import { mapStripeSubscriptionStatus } from "../../utils/subscription-status";
import Stripe from "stripe";
import type { PaymentGateway } from "../../interfaces/PaymentGateway";
import type { StripeBillingProvider } from "../../interfaces/StripeBillingProvider";
import type { BillingKitConfig } from "../../types/config";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundPaymentInput,
  RefundResult,
} from "../../types/payment";
import type {
  AttachPaymentMethodInput,
  CreateProviderCustomerInput,
  PaymentMethodResult,
  ProviderCustomer,
  ProviderInvoice,
  SetDefaultPaymentMethodInput,
} from "../../types/provider";
import type {
  AggregateUsage,
  BillingInterval,
  CreatePlanInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  Plan,
  ReportUsageInput,
  Subscription,
  UpdatePlanInput,
  UsageRecord,
  UsageType,
} from "../../types/subscription";
import type { WebhookEvent } from "../../types/webhook";
import { InvalidConfigError, WebhookVerificationError } from "../../utils/errors";
import { normalizeCurrency } from "../../utils/currency";
import { mapStripeError, withStripeErrors } from "../../utils/stripe-errors";
import { normalizeStripeWebhook } from "../../utils/webhook-normalize";
const INTERVAL_MAP: Record<string, Stripe.Price.Recurring.Interval> = {
  monthly: "month",
  quarterly: "month",
  yearly: "year",
};
const INTERVAL_COUNT: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 1,
};
function mapPaymentStatus(status: Stripe.PaymentIntent.Status): PaymentResult["status"] {
  switch (status) {
    case "succeeded":
      return "captured";
    case "requires_capture":
      return "authorized";
    case "canceled":
      return "cancelled";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "pending";
    default:
      return "failed";
  }
}
function mapIntervalFromStripe(
  interval?: Stripe.Price.Recurring.Interval | null,
  intervalCount?: number | null,
): BillingInterval {
  if (interval === "year") return "yearly";
  if (interval === "month" && intervalCount === 3) return "quarterly";
  return "monthly";
}
function mapSubscription(
  subscription: Stripe.Subscription,
  planId?: string,
): Subscription {
  const item = subscription.items.data[0];
  const priceId = planId ?? item?.price.id ?? "";
  const paused = Boolean(subscription.pause_collection);
  return {
    id: subscription.id,
    customerId:
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id,
    planId: priceId,
    status: mapStripeSubscriptionStatus(subscription.status, { paused }),
    providerStatus: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    provider: "stripe",
    subscriptionItemId: item?.id,
    paused,
  };
}
export class StripeGateway implements PaymentGateway, StripeBillingProvider {
  readonly name = "stripe";
  private readonly stripe: Stripe;
  private readonly currency: string;
  constructor(private readonly config: BillingKitConfig) {
    if (!config.secretKey) {
      throw new InvalidConfigError("secretKey is required for Stripe");
    }
    this.stripe = new Stripe(config.secretKey);
    this.currency = normalizeCurrency(config.currency);
  }
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return withStripeErrors(async () => {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amount,
          currency: normalizeCurrency(input.currency ?? this.currency),
          customer: input.customerId,
          description: input.description,
          metadata: input.metadata,
          capture_method: "manual",
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return {
        id: intent.id,
        status: mapPaymentStatus(intent.status),
        amount: intent.amount,
        currency: intent.currency,
        provider: this.name,
        presentmentCurrency: intent.currency,
        presentmentAmount: intent.amount,
        metadata: (intent.metadata as Record<string, string>) ?? undefined,
      };
    });
  }
  async capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    return withStripeErrors(async () => {
      const intent = await this.stripe.paymentIntents.capture(
        input.paymentId,
        {
          amount_to_capture: input.amount,
        },
        input.idempotencyKey
          ? { idempotencyKey: input.idempotencyKey }
          : undefined,
      );
      return {
        id: intent.id,
        status: mapPaymentStatus(intent.status),
        amount: intent.amount,
        currency: intent.currency,
        provider: this.name,
      };
    });
  }
  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    return withStripeErrors(async () => {
      const intent = await this.stripe.paymentIntents.cancel(paymentId);
      return {
        id: intent.id,
        status: "cancelled",
        amount: intent.amount,
        currency: intent.currency,
        provider: this.name,
      };
    });
  }
  async getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return withStripeErrors(async () => {
      const intent = await this.stripe.paymentIntents.retrieve(paymentId);
      return {
        id: intent.id,
        status: mapPaymentStatus(intent.status),
        amount: intent.amount,
        currency: intent.currency,
        provider: this.name,
      };
    });
  }
  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    return withStripeErrors(async () => {
      const refund = await this.stripe.refunds.create(
        {
          payment_intent: input.paymentId,
          amount: input.amount,
          reason: input.reason as Stripe.RefundCreateParams.Reason | undefined,
        },
        input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
      );
      return {
        id: refund.id,
        paymentId: input.paymentId,
        amount: refund.amount ?? input.amount ?? 0,
        status:
          refund.status === "succeeded"
            ? "succeeded"
            : refund.status === "failed"
              ? "failed"
              : "pending",
        provider: this.name,
      };
    });
  }
  async createPlan(input: CreatePlanInput): Promise<Plan> {
    return withStripeErrors(async () => {
      const usageType: UsageType = input.usageType ?? "licensed";
      const aggregateUsage: AggregateUsage | undefined =
        usageType === "metered" ? (input.aggregateUsage ?? "sum") : undefined;
      const product = await this.stripe.products.create({
        name: input.name,
        description: input.description,
        metadata: input.metadata,
      });
      const recurring: Stripe.PriceCreateParams.Recurring = {
        interval: INTERVAL_MAP[input.interval] ?? "month",
        interval_count: INTERVAL_COUNT[input.interval] ?? 1,
        usage_type: usageType,
      };
      if (aggregateUsage) {
        recurring.aggregate_usage = aggregateUsage;
      }
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: input.amount,
        currency: normalizeCurrency(input.currency ?? this.currency),
        recurring,
        metadata: input.metadata,
      });
      return {
        id: price.id,
        name: input.name,
        amount: input.amount,
        currency: price.currency,
        interval: input.interval,
        provider: this.name,
        usageType,
        aggregateUsage,
        productId: product.id,
      };
    });
  }
  async updatePlan(input: UpdatePlanInput): Promise<Plan> {
    return withStripeErrors(async () => {
      const price = await this.stripe.prices.retrieve(input.planId);
      const productId =
        typeof price.product === "string" ? price.product : price.product.id;
      const product = await this.stripe.products.update(productId, {
        name: input.name,
        description: input.description,
        active: input.active,
      });
      return {
        id: price.id,
        name: product.name,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        interval: mapIntervalFromStripe(
          price.recurring?.interval,
          price.recurring?.interval_count,
        ),
        provider: this.name,
        usageType: (price.recurring?.usage_type as UsageType | undefined) ?? "licensed",
        aggregateUsage: price.recurring?.aggregate_usage as AggregateUsage | undefined,
        productId,
      };
    });
  }
  async cancelPlan(planId: string): Promise<Plan> {
    return withStripeErrors(async () => {
      const price = await this.stripe.prices.retrieve(planId);
      const productId =
        typeof price.product === "string" ? price.product : price.product.id;
      const product = await this.stripe.products.update(productId, { active: false });
      return {
        id: price.id,
        name: product.name,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        interval: mapIntervalFromStripe(
          price.recurring?.interval,
          price.recurring?.interval_count,
        ),
        provider: this.name,
        usageType: (price.recurring?.usage_type as UsageType | undefined) ?? "licensed",
        aggregateUsage: price.recurring?.aggregate_usage as AggregateUsage | undefined,
        productId,
      };
    });
  }
  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.create({
        customer: input.customerId,
        items: [{ price: input.planId }],
        trial_period_days: input.trialDays,
        metadata: input.metadata,
        default_payment_method: input.defaultPaymentMethodId,
      });
      return mapSubscription(subscription, input.planId);
    });
  }
  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      return mapSubscription(subscription);
    });
  }
  async scheduleCancellation(subscriptionId: string): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return mapSubscription(subscription);
    });
  }
  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      return mapSubscription(subscription);
    });
  }
  async pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription> {
    return withStripeErrors(async () => {
      const pauseCollection: Stripe.SubscriptionUpdateParams.PauseCollection = {
        behavior: input.behavior ?? "mark_uncollectible",
      };
      if (input.resumesAt) {
        pauseCollection.resumes_at = Math.floor(input.resumesAt.getTime() / 1000);
      }
      const subscription = await this.stripe.subscriptions.update(input.subscriptionId, {
        pause_collection: pauseCollection,
      });
      return mapSubscription(subscription);
    });
  }
  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        pause_collection: "",
      });
      return mapSubscription(subscription);
    });
  }
  async retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    return withStripeErrors(async () => {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      return mapSubscription(subscription);
    });
  }
  async createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer> {
    return withStripeErrors(async () => {
      const customer = await this.stripe.customers.create({
        email: input.email,
        name: input.name,
        phone: input.phone,
        description: input.description,
        metadata: input.metadata,
        payment_method: input.paymentMethodId,
        invoice_settings:
          input.paymentMethodId && input.setAsDefaultPaymentMethod !== false
            ? { default_payment_method: input.paymentMethodId }
            : undefined,
      });
      const defaultPm = customer.invoice_settings?.default_payment_method;
      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        defaultPaymentMethodId:
          typeof defaultPm === "string" ? defaultPm : (defaultPm?.id ?? null),
        provider: this.name,
        metadata: customer.metadata as Record<string, string>,
      };
    });
  }
  async attachPaymentMethod(
    input: AttachPaymentMethodInput,
  ): Promise<PaymentMethodResult> {
    return withStripeErrors(async () => {
      const paymentMethod = await this.stripe.paymentMethods.attach(
        input.paymentMethodId,
        { customer: input.customerId },
      );
      return {
        id: paymentMethod.id,
        customerId: input.customerId,
        type: paymentMethod.type,
        provider: this.name,
      };
    });
  }
  async setDefaultPaymentMethod(
    input: SetDefaultPaymentMethodInput,
  ): Promise<ProviderCustomer> {
    return withStripeErrors(async () => {
      const customer = await this.stripe.customers.update(input.customerId, {
        invoice_settings: {
          default_payment_method: input.paymentMethodId,
        },
      });
      const defaultPm = customer.invoice_settings?.default_payment_method;
      return {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        defaultPaymentMethodId:
          typeof defaultPm === "string" ? defaultPm : (defaultPm?.id ?? null),
        provider: this.name,
        metadata: customer.metadata as Record<string, string>,
      };
    });
  }
  async retrieveProviderInvoice(invoiceId: string): Promise<ProviderInvoice> {
    return withStripeErrors(async () => {
      const invoice = await this.stripe.invoices.retrieve(invoiceId);
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : (invoice.customer?.id ?? "");
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : (invoice.subscription?.id ?? null);
      return {
        id: invoice.id,
        customerId,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdfUrl: invoice.invoice_pdf,
        subscriptionId,
        provider: this.name,
      };
    });
  }
  async reportUsage(input: ReportUsageInput): Promise<UsageRecord> {
    return withStripeErrors(async () => {
      const record = await this.stripe.subscriptionItems.createUsageRecord(
        input.subscriptionItemId,
        {
          quantity: input.quantity,
          timestamp: input.timestamp
            ? Math.floor(input.timestamp.getTime() / 1000)
            : undefined,
          action: input.action,
        },
      );
      return {
        id: record.id,
        subscriptionItemId: input.subscriptionItemId,
        quantity: record.quantity,
        timestamp: new Date(record.timestamp * 1000),
        provider: this.name,
      };
    });
  }
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    if (!this.config.webhookSecret) {
      throw new WebhookVerificationError("webhookSecret is required for Stripe webhooks");
    }
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.config.webhookSecret,
      );
      return normalizeStripeWebhook(
        event.id,
        event.type,
        event.data.object,
        this.name,
        event.created,
      );
    } catch (error) {
      mapStripeError(error);
    }
  }
}
