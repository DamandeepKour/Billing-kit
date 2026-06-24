import Stripe from "stripe";
import type { BillingKitConfig } from "../../types/config";
import type {
  CreateInvoiceInput,
  Invoice,
  LineItem,
} from "../../types/invoice";
import type {
  CreatePaymentInput,
  Payment,
  Refund,
  RefundPaymentInput,
} from "../../types/payment";
import type {
  CreateSubscriptionInput,
  Subscription,
} from "../../types/subscription";
import type { TaxBreakdown } from "../../types/tax";
import type { WebhookEvent } from "../../types/webhook";
import { calculateGST } from "../../tax/GSTCalculator";
import { normalizeCurrency } from "../../utils/currency";
import { WebhookVerificationError } from "../../utils/errors";
import type { PaymentProvider } from "./PaymentProvider";

function emptyTaxBreakdown(amount: number): TaxBreakdown {
  return {
    taxableAmount: amount,
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalTax: 0,
    total: amount,
  };
}

function sumLineItems(lineItems: LineItem[]): number {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitAmount,
    0,
  );
}

function mapInvoiceStatus(
  status: Stripe.Invoice.Status | null,
): Invoice["status"] {
  switch (status) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "void":
      return "void";
    default:
      return "draft";
  }
}

function mapPaymentStatus(
  status: Stripe.PaymentIntent.Status,
): Payment["status"] {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "failed";
    default:
      return "pending";
  }
}

function mapRefundStatus(status: Stripe.Refund.Status | null): Refund["status"] {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

export class StripeProvider implements PaymentProvider {
  private readonly stripe: Stripe;
  private readonly config: BillingKitConfig;

  constructor(config: BillingKitConfig) {
    this.config = config;
    this.stripe = new Stripe(config.secretKey);
  }

  private get currency(): string {
    return normalizeCurrency(this.config.currency);
  }

  private computeTax(
    subtotal: number,
    input: CreateInvoiceInput,
  ): TaxBreakdown {
    if (!this.config.tax?.enabled || input.applyTax === false) {
      return emptyTaxBreakdown(subtotal);
    }

    const sellerState = this.config.tax.stateCode;
    const buyerState = input.buyerState ?? sellerState;

    if (!sellerState || !buyerState) {
      throw new Error(
        "seller state (config.tax.stateCode) and buyer state are required when tax is enabled",
      );
    }

    return calculateGST({
      amount: subtotal,
      rate: this.config.tax.defaultRate ?? 18,
      sellerState,
      buyerState,
    });
  }

  private toInvoice(
    stripeInvoice: Stripe.Invoice,
    tax: TaxBreakdown,
    subtotal: number,
  ): Invoice {
    return {
      id: stripeInvoice.id,
      number: stripeInvoice.number ?? stripeInvoice.id,
      status: mapInvoiceStatus(stripeInvoice.status),
      subtotal,
      tax,
      total: stripeInvoice.total ?? tax.total,
      currency: stripeInvoice.currency ?? this.currency,
      hostedInvoiceUrl: stripeInvoice.hosted_invoice_url ?? undefined,
    };
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const subtotal = sumLineItems(input.lineItems);
    const tax = this.computeTax(subtotal, input);

    const invoice = await this.stripe.invoices.create({
      customer: input.customerId,
      currency: this.currency,
      collection_method: "send_invoice",
      days_until_due: input.dueDate
        ? Math.max(
            1,
            Math.ceil(
              (input.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            ),
          )
        : 30,
      metadata: input.metadata,
      auto_advance: false,
    });

    for (const item of input.lineItems) {
      await this.stripe.invoiceItems.create({
        customer: input.customerId,
        invoice: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_amount: item.unitAmount,
        currency: this.currency,
      });
    }

    const refreshed = await this.stripe.invoices.retrieve(invoice.id);
    return this.toInvoice(refreshed, tax, subtotal);
  }

  async getInvoice(invoiceId: string): Promise<Invoice> {
    const stripeInvoice = await this.stripe.invoices.retrieve(invoiceId);
    const subtotal = stripeInvoice.subtotal ?? 0;
    const tax = emptyTaxBreakdown(subtotal);

    return this.toInvoice(stripeInvoice, tax, subtotal);
  }

  async finalizeInvoice(invoiceId: string): Promise<Invoice> {
    const stripeInvoice = await this.stripe.invoices.finalizeInvoice(invoiceId);
    const subtotal = stripeInvoice.subtotal ?? 0;
    const tax = emptyTaxBreakdown(subtotal);

    return this.toInvoice(stripeInvoice, tax, subtotal);
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amount,
        currency: normalizeCurrency(input.currency ?? this.currency),
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        metadata: input.metadata,
        confirm: Boolean(input.paymentMethodId),
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
    };
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentId);

    return {
      id: intent.id,
      status: mapPaymentStatus(intent.status),
      amount: intent.amount,
      currency: intent.currency,
    };
  }

  async refund(input: RefundPaymentInput): Promise<Refund> {
    const refund = await this.stripe.refunds.create(
      {
        payment_intent: input.paymentId,
        amount: input.amount,
        reason: input.reason,
      },
      input.idempotencyKey
        ? { idempotencyKey: input.idempotencyKey }
        : undefined,
    );

    return {
      id: refund.id,
      paymentId: input.paymentId,
      amount: refund.amount ?? input.amount ?? 0,
      status: mapRefundStatus(refund.status),
    };
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: input.customerId,
      items: [{ price: input.priceId }],
      trial_period_days: input.trialDays,
      metadata: input.metadata,
    });

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
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
      status: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    if (!this.config.webhookSecret) {
      throw new WebhookVerificationError(
        "webhookSecret is required to verify webhooks",
      );
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
        data: event.data.object,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Webhook verification failed";
      throw new WebhookVerificationError(message);
    }
  }
}
