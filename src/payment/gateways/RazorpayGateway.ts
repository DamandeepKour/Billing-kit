import crypto from "crypto";
import Razorpay from "razorpay";
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

function mapRazorpayStatus(
  status: string,
  captured: boolean,
): PaymentResult["status"] {
  if (captured) return "captured";
  if (status === "authorized") return "authorized";
  if (status === "created") return "pending";
  if (status === "failed") return "failed";
  return "pending";
}

export class RazorpayGateway implements PaymentGateway {
  readonly name = "razorpay";
  private readonly client: Razorpay;
  private readonly currency: string;

  constructor(private readonly config: BillingKitConfig) {
    if (!config.keyId || !config.secretKey) {
      throw new InvalidConfigError("keyId and secretKey are required for Razorpay");
    }

    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.secretKey,
    });
    this.currency = normalizeCurrency(config.currency);
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const order = await this.client.orders.create({
      amount: input.amount,
      currency: (input.currency ?? this.currency).toUpperCase(),
      receipt: input.orderId ?? `rcpt_${Date.now()}`,
      notes: input.metadata,
    });

    return {
      id: order.id,
      status: "pending",
      amount: Number(order.amount),
      currency: order.currency.toLowerCase(),
      provider: this.name,
      metadata: (order.notes as Record<string, string>) ?? undefined,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    const payment = await this.client.payments.capture(
      input.paymentId,
      input.amount ?? 0,
      (this.currency).toUpperCase(),
    );

    return {
      id: payment.id,
      status: mapRazorpayStatus(payment.status, payment.captured),
      amount: Number(payment.amount),
      currency: payment.currency.toLowerCase(),
      provider: this.name,
    };
  }

  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    // Razorpay does not support cancel after authorization in the same way;
    // return current status for API consistency.
    return this.getPaymentStatus(paymentId);
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    const payment = await this.client.payments.fetch(paymentId);

    return {
      id: payment.id,
      status: mapRazorpayStatus(payment.status, payment.captured),
      amount: Number(payment.amount),
      currency: payment.currency.toLowerCase(),
      provider: this.name,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const refund = await this.client.payments.refund(input.paymentId, {
      amount: input.amount,
      notes: input.reason ? { reason: input.reason } : undefined,
    });

    return {
      id: refund.id,
      paymentId: input.paymentId,
      amount: Number(refund.amount),
      status: refund.status === "processed" ? "succeeded" : "pending",
      provider: this.name,
    };
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const period =
      input.interval === "yearly" ? "yearly" : ("monthly" as const);
    const interval =
      input.interval === "yearly" ? 1 : input.interval === "quarterly" ? 3 : 1;

    const plan = (await this.client.plans.create({
      period,
      interval,
      item: {
        name: input.name,
        amount: input.amount,
        currency: (input.currency ?? this.currency).toUpperCase(),
        description: input.description,
      },
      notes: input.metadata,
    })) as { id: string };

    return {
      id: plan.id,
      name: input.name,
      amount: input.amount,
      currency: normalizeCurrency(input.currency ?? this.currency),
      interval: input.interval,
      provider: this.name,
    };
  }

  async updatePlan(input: UpdatePlanInput): Promise<Plan> {
    const plan = await this.client.plans.fetch(input.planId);

    return {
      id: plan.id,
      name: input.name ?? plan.item.name,
      amount: Number(plan.item.amount),
      currency: plan.item.currency.toLowerCase(),
      interval: "monthly",
      provider: this.name,
    };
  }

  async cancelPlan(planId: string): Promise<Plan> {
    const plan = await this.client.plans.fetch(planId);

    return {
      id: plan.id,
      name: plan.item.name,
      amount: Number(plan.item.amount),
      currency: plan.item.currency.toLowerCase(),
      interval: "monthly",
      provider: this.name,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    const subscription = await this.client.subscriptions.create({
      plan_id: input.planId,
      customer_notify: 1,
      total_count: 12,
      notes: input.metadata,
    });

    return {
      id: subscription.id,
      customerId: input.customerId,
      planId: input.planId,
      status: subscription.status,
      currentPeriodEnd: new Date((subscription.current_end ?? Date.now() / 1000) * 1000),
      cancelAtPeriodEnd: false,
      provider: this.name,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.client.subscriptions.cancel(subscriptionId);

    return {
      id: subscription.id,
      customerId: "",
      planId: subscription.plan_id,
      status: subscription.status,
      currentPeriodEnd: new Date((subscription.current_end ?? Date.now() / 1000) * 1000),
      cancelAtPeriodEnd: true,
      provider: this.name,
    };
  }

  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await this.client.subscriptions.fetch(subscriptionId);

    return {
      id: subscription.id,
      customerId: "",
      planId: subscription.plan_id,
      status: subscription.status,
      currentPeriodEnd: new Date((subscription.current_end ?? Date.now() / 1000) * 1000),
      cancelAtPeriodEnd: false,
      provider: this.name,
    };
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    if (!this.config.webhookSecret) {
      throw new WebhookVerificationError("webhookSecret is required for Razorpay webhooks");
    }

    const body = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      throw new WebhookVerificationError("Invalid Razorpay webhook signature");
    }

    const parsed = JSON.parse(body) as {
      event: string;
      payload: { payment?: { entity: { id: string } } };
    };

    return {
      id: parsed.payload?.payment?.entity?.id ?? `evt_${Date.now()}`,
      type: parsed.event,
      provider: this.name,
      data: parsed.payload,
    };
  }
}
