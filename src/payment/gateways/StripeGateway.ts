import Stripe from "stripe";
import type { PaymentGateway } from "../../interfaces/PaymentGateway";
import type { BillingKitConfig } from "../../types/config";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundPaymentInput,
  RefundResult,
} from "../../types/payment";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from "../../types/subscription";
import type { WebhookEvent } from "../../types/webhook";
import { InvalidConfigError, WebhookVerificationError } from "../../utils/errors";
import { normalizeCurrency } from "../../utils/currency";

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

export class StripeGateway implements PaymentGateway {
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
      metadata: (intent.metadata as Record<string, string>) ?? undefined,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.capture(input.paymentId, {
      amount_to_capture: input.amount,
    });

    return {
      id: intent.id,
      status: mapPaymentStatus(intent.status),
      amount: intent.amount,
      currency: intent.currency,
      provider: this.name,
    };
  }

  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.cancel(paymentId);

    return {
      id: intent.id,
      status: "cancelled",
      amount: intent.amount,
      currency: intent.currency,
      provider: this.name,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentId);

    return {
      id: intent.id,
      status: mapPaymentStatus(intent.status),
      amount: intent.amount,
      currency: intent.currency,
      provider: this.name,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
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
      status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
      provider: this.name,
    };
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const product = await this.stripe.products.create({
      name: input.name,
      description: input.description,
      metadata: input.metadata,
    });

    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: input.amount,
      currency: normalizeCurrency(input.currency ?? this.currency),
      recurring: {
        interval: INTERVAL_MAP[input.interval] ?? "month",
        interval_count: INTERVAL_COUNT[input.interval] ?? 1,
      },
    });

    return {
      id: price.id,
      name: input.name,
      amount: input.amount,
      currency: price.currency,
      interval: input.interval,
      provider: this.name,
    };
  }

  async updatePlan(input: UpdatePlanInput): Promise<Plan> {
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
      interval: "monthly",
      provider: this.name,
    };
  }

  async cancelPlan(planId: string): Promise<Plan> {
    const price = await this.stripe.prices.retrieve(planId);
    const productId =
      typeof price.product === "string" ? price.product : price.product.id;

    const product = await this.stripe.products.update(productId, { active: false });

    return {
      id: price.id,
      name: product.name,
      amount: price.unit_amount ?? 0,
      currency: price.currency,
      interval: "monthly",
      provider: this.name,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: input.planId }],
      trial_period_days: input.trialDays,
      metadata: input.metadata,
    });

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      planId: input.planId,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      provider: this.name,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      planId: subscription.items.data[0]?.price.id ?? "",
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      provider: this.name,
    };
  }

  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      planId: subscription.items.data[0]?.price.id ?? "",
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      provider: this.name,
    };
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

      return {
        id: event.id,
        type: event.type,
        provider: this.name,
        data: event.data.object,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook verification failed";
      throw new WebhookVerificationError(message);
    }
  }
}
