import crypto from "crypto";
import Razorpay from "razorpay";
import type { PaymentGateway } from "../../interfaces/PaymentGateway";
import type { RazorpayBillingProvider } from "../../interfaces/RazorpayBillingProvider";
import type { BillingKitConfig } from "../../types/config";
import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../../types/order";
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
import type {
  CreateTransferInput,
  GetSettlementDetailsInput,
  ReverseTransferInput,
  SettlementDetails,
  SplitPaymentInput,
  SplitPaymentResult,
  TransferReversalResult,
  TransferResult,
  TransferSettlementStatus,
} from "../../types/route";
import {
  InvalidConfigError,
  PaymentError,
  WebhookVerificationError,
} from "../../utils/errors";
import { normalizeCurrency } from "../../utils/currency";
import { normalizeRazorpayWebhook } from "../../utils/webhook-normalize";
import { calculateSplitAllocations } from "../../utils/split";
function mapRazorpayStatus(status: string, captured: boolean): PaymentResult["status"] {
  if (captured) return "captured";
  if (status === "authorized") return "authorized";
  if (status === "created") return "pending";
  if (status === "failed") return "failed";
  if (status === "refunded") return "captured";
  return "pending";
}
function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
function mapOrder(order: {
  id: string;
  amount: number | string;
  currency: string;
  status?: string;
  receipt?: string | null;
  notes?: Record<string, string> | null;
}): OrderResult {
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency.toLowerCase(),
    status: order.status ?? "created",
    receipt: order.receipt ?? null,
    provider: "razorpay",
    notes: (order.notes as Record<string, string>) ?? undefined,
  };
}
export class RazorpayGateway implements PaymentGateway, RazorpayBillingProvider {
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
  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const order = await this.client.orders.create({
      amount: input.amount,
      currency: (input.currency ?? this.currency).toUpperCase(),
      receipt: input.receipt ?? `rcpt_${Date.now()}`,
      notes: input.notes,
      partial_payment: input.partialPayment,
    });
    return mapOrder(order as Parameters<typeof mapOrder>[0]);
  }
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const order = await this.createOrder({
      amount: input.amount,
      currency: input.currency,
      receipt: input.orderId,
      notes: input.metadata,
    });
    return {
      id: order.id,
      status: "pending",
      amount: order.amount,
      currency: order.currency,
      provider: this.name,
      presentmentCurrency: order.currency,
      presentmentAmount: order.amount,
      metadata: order.notes,
    };
  }
  async capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    const payment = await this.client.payments.capture(
      input.paymentId,
      input.amount ?? 0,
      this.currency.toUpperCase(),
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
    return this.fetchPayment(paymentId);
  }
  async getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.fetchPayment(paymentId);
  }
  async fetchPayment(paymentId: string): Promise<PaymentResult> {
    const payment = await this.client.payments.fetch(paymentId);
    return {
      id: payment.id,
      status: mapRazorpayStatus(payment.status, payment.captured),
      amount: Number(payment.amount),
      currency: payment.currency.toLowerCase(),
      provider: this.name,
      metadata: (payment.notes as Record<string, string>) ?? undefined,
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
  async fetchRefund(refundId: string): Promise<RefundResult> {
    const refund = await this.client.refunds.fetch(refundId);
    return {
      id: refund.id,
      paymentId: String(refund.payment_id),
      amount: Number(refund.amount),
      status: refund.status === "processed" ? "succeeded" : "pending",
      provider: this.name,
    };
  }
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean {
    const expected = crypto
      .createHmac("sha256", this.config.secretKey)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, input.signature);
  }
  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const period = input.interval === "yearly" ? "yearly" : ("monthly" as const);
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
    })) as {
      id: string;
    };
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
    const params: Record<string, unknown> = {
      plan_id: input.planId,
      customer_notify: 1,
      total_count: input.totalCount ?? 12,
      notes: input.metadata,
    };
    if (input.customerId) {
      params.customer_id = input.customerId;
    }
    const subscription = (await this.client.subscriptions.create(params as never)) as {
      id: string;
      status: string;
      plan_id: string;
      current_end?: number;
    };
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
      throw new WebhookVerificationError(
        "webhookSecret is required for Razorpay webhooks",
      );
    }
    const raw = typeof payload === "string" ? payload : Buffer.from(payload);
    const expected = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(raw)
      .digest("hex");
    if (!timingSafeEqualHex(expected, signature)) {
      throw new WebhookVerificationError("Invalid Razorpay webhook signature");
    }
    const body = typeof raw === "string" ? raw : raw.toString("utf8");
    return normalizeRazorpayWebhook(body, this.name);
  }

  async createTransfer(input: CreateTransferInput): Promise<TransferResult> {
    const currency = (input.currency ?? this.currency).toUpperCase();
    const client = this.client as unknown as {
      transfers: {
        create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
      };
      payments: {
        transfer: (
          paymentId: string,
          params: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
    };

    let raw: Record<string, unknown>;
    if (input.paymentId) {
      raw = await client.payments.transfer(input.paymentId, {
        transfers: [
          {
            account: input.linkedAccountId,
            amount: input.amount,
            currency,
            on_hold: input.onHold ?? false,
            notes: input.notes,
          },
        ],
      });
      const items = (raw.items as Array<Record<string, unknown>> | undefined) ?? [raw];
      const first = items[0] ?? raw;
      return mapTransfer(first, this.name, input.paymentId);
    }

    const request = {
      account: input.linkedAccountId,
      amount: input.amount,
      currency,
      on_hold: input.onHold ?? false,
      notes: input.notes,
    };
    raw = input.idempotencyKey
      ? await this.createIdempotentDirectTransfer(
          request,
          input.idempotencyKey,
        )
      : await client.transfers.create(request);
    return mapTransfer(raw, this.name);
  }

  private async createIdempotentDirectTransfer(
    request: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    const authorization = Buffer.from(
      `${this.config.keyId}:${this.config.secretKey}`,
    ).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/transfers", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
        "X-Transfer-Idempotency": idempotencyKey,
      },
      body: JSON.stringify(request),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
    if (!response.ok) {
      const body = payload as {
        error?: { description?: string };
        message?: string;
      };
      throw new PaymentError(
        body.error?.description ??
          body.message ??
          `Razorpay transfer request failed with status ${response.status}`,
      );
    }
    return payload as Record<string, unknown>;
  }

  async splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
    const currency = normalizeCurrency(input.currency ?? this.currency);
    const computed = calculateSplitAllocations(input);
    const client = this.client as unknown as {
      payments: {
        transfer: (
          paymentId: string,
          params: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
    };

    const raw = await client.payments.transfer(input.paymentId, {
      transfers: computed.allocations.map((a) => ({
        account: a.linkedAccountId,
        amount: a.amount,
        currency: currency.toUpperCase(),
        on_hold: a.onHold,
        notes: a.notes,
      })),
    });

    const items =
      (raw.items as Array<Record<string, unknown>> | undefined) ??
      (Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [raw]);

    const transfers = items.map((item) => mapTransfer(item, this.name, input.paymentId));
    const settlementStatus = transfers.some((t) => t.onHold)
      ? ("on_hold" as const)
      : transfers.every((t) => t.status === "settled")
        ? ("settled" as const)
        : ("pending" as const);

    return {
      paymentId: input.paymentId,
      grossAmount: input.amount,
      platformFee: computed.platformFee,
      vendorAmount: computed.vendorAmount,
      routedAmount: computed.routedAmount,
      currency,
      settlementStatus,
      transfers,
      allocations: computed.allocations,
    };
  }

  async reverseTransfer(input: ReverseTransferInput): Promise<TransferReversalResult> {
    const client = this.client as unknown as {
      transfers: {
        reverse: (
          transferId: string,
          params?: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
      };
    };

    const raw = await client.transfers.reverse(input.transferId, {
      amount: input.amount,
      notes: input.notes,
    });

    return {
      id: String(raw.id ?? `rev_${input.transferId}`),
      transferId: input.transferId,
      amount: Number(raw.amount ?? input.amount ?? 0),
      currency: String(raw.currency ?? this.currency).toLowerCase(),
      status: mapTransferStatus(String(raw.status ?? "processed")),
      provider: this.name,
      providerResponse: raw,
    };
  }

  async getSettlementDetails(
    input: GetSettlementDetailsInput,
  ): Promise<SettlementDetails> {
    const client = this.client as unknown as {
      settlements: {
        fetch: (id: string) => Promise<Record<string, unknown>>;
      };
      transfers: {
        fetch: (id: string) => Promise<Record<string, unknown>>;
      };
    };

    if (input.settlementId) {
      const raw = await client.settlements.fetch(input.settlementId);
      return {
        id: String(raw.id),
        amount: Number(raw.amount ?? 0),
        currency: String(raw.currency ?? this.currency).toLowerCase(),
        status: mapTransferStatus(String(raw.status ?? "pending")),
        fees: raw.fees !== undefined ? Number(raw.fees) : undefined,
        tax: raw.tax !== undefined ? Number(raw.tax) : undefined,
        utr: raw.utr ? String(raw.utr) : undefined,
        settledAt: raw.created_at
          ? new Date(Number(raw.created_at) * 1000)
          : undefined,
        provider: this.name,
        providerResponse: raw,
      };
    }

    if (input.transferId) {
      const raw = await client.transfers.fetch(input.transferId);
      return {
        id: String(raw.id),
        amount: Number(raw.amount ?? 0),
        currency: String(raw.currency ?? this.currency).toLowerCase(),
        status: mapTransferStatus(String(raw.status ?? "pending")),
        transferIds: [String(raw.id)],
        provider: this.name,
        providerResponse: raw,
      };
    }

    throw new InvalidConfigError(
      "settlementId or transferId is required for getSettlementDetails",
    );
  }
}

function mapTransferStatus(status: string): TransferSettlementStatus {
  switch (status) {
    case "processed":
    case "settled":
      return "settled";
    case "pending":
      return "pending";
    case "reversed":
    case "partially_reversed":
      return "reversed";
    case "failed":
      return "failed";
    case "on_hold":
    case "held":
      return "on_hold";
    default:
      return "processing";
  }
}

function mapTransfer(
  raw: Record<string, unknown>,
  provider: string,
  paymentId?: string,
): TransferResult {
  const onHold = Boolean(raw.on_hold);
  return {
    id: String(raw.id ?? ""),
    linkedAccountId: String(raw.recipient ?? raw.account ?? ""),
    amount: Number(raw.amount ?? 0),
    currency: String(raw.currency ?? "inr").toLowerCase(),
    status: onHold ? "on_hold" : mapTransferStatus(String(raw.status ?? "pending")),
    paymentId: paymentId ?? (raw.source ? String(raw.source) : undefined),
    onHold,
    provider,
    providerResponse: raw,
  };
}
