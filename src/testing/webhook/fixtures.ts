export interface MockWebhookPayload {
  body: string;
  payload: Record<string, unknown>;
}

export interface RazorpayPaymentEntityOverrides {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: number;
  order_id?: string;
  method?: string;
}

export interface RazorpayRefundEntityOverrides {
  id?: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: number;
}

export interface RazorpaySubscriptionEntityOverrides {
  id?: string;
  customer_id?: string;
  plan_id?: string;
  status?: string;
  current_end?: number;
  created_at?: number;
}

export interface RazorpayInvoiceEntityOverrides {
  id?: string;
  payment_id?: string;
  subscription_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: number;
}

export interface StripeObjectOverrides {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  customer?: string;
  payment_intent?: string;
  subscription?: string;
  [key: string]: unknown;
}

function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

function asPayload(body: Record<string, unknown>): MockWebhookPayload {
  return {
    body: JSON.stringify(body),
    payload: body,
  };
}

export function createMockRazorpayPaymentCaptured(
  overrides: RazorpayPaymentEntityOverrides = {},
): MockWebhookPayload {
  const createdAt = overrides.created_at ?? unixNow();
  return asPayload({
    event: "payment.captured",
    created_at: createdAt,
    payload: {
      payment: {
        entity: {
          id: overrides.id ?? "pay_test_captured",
          amount: overrides.amount ?? 50000,
          currency: overrides.currency ?? "INR",
          status: overrides.status ?? "captured",
          created_at: createdAt,
          order_id: overrides.order_id ?? "order_test_1",
          method: overrides.method ?? "card",
        },
      },
    },
  });
}

export function createMockRazorpayPaymentFailed(
  overrides: RazorpayPaymentEntityOverrides = {},
): MockWebhookPayload {
  const createdAt = overrides.created_at ?? unixNow();
  return asPayload({
    event: "payment.failed",
    created_at: createdAt,
    payload: {
      payment: {
        entity: {
          id: overrides.id ?? "pay_test_failed",
          amount: overrides.amount ?? 50000,
          currency: overrides.currency ?? "INR",
          status: overrides.status ?? "failed",
          created_at: createdAt,
          order_id: overrides.order_id ?? "order_test_1",
          method: overrides.method ?? "card",
        },
      },
    },
  });
}

export function createMockRazorpayRefundProcessed(
  overrides: RazorpayRefundEntityOverrides = {},
): MockWebhookPayload {
  const createdAt = overrides.created_at ?? unixNow();
  return asPayload({
    event: "refund.processed",
    created_at: createdAt,
    payload: {
      refund: {
        entity: {
          id: overrides.id ?? "rfnd_test_1",
          payment_id: overrides.payment_id ?? "pay_test_captured",
          amount: overrides.amount ?? 10000,
          currency: overrides.currency ?? "INR",
          status: overrides.status ?? "processed",
          created_at: createdAt,
        },
      },
    },
  });
}

export function createMockRazorpaySubscription(
  event:
    | "subscription.activated"
    | "subscription.charged"
    | "subscription.cancelled"
    | "subscription.completed",
  overrides: RazorpaySubscriptionEntityOverrides = {},
): MockWebhookPayload {
  const createdAt = overrides.created_at ?? unixNow();
  const status =
    overrides.status ??
    (event === "subscription.cancelled" || event === "subscription.completed"
      ? "cancelled"
      : "active");
  return asPayload({
    event,
    created_at: createdAt,
    payload: {
      subscription: {
        entity: {
          id: overrides.id ?? "sub_test_1",
          customer_id: overrides.customer_id ?? "cust_test_1",
          plan_id: overrides.plan_id ?? "plan_test_1",
          status,
          current_end: overrides.current_end ?? createdAt + 30 * 24 * 60 * 60,
          created_at: createdAt,
        },
      },
    },
  });
}

export function createMockRazorpayInvoicePaid(
  overrides: RazorpayInvoiceEntityOverrides = {},
): MockWebhookPayload {
  const createdAt = overrides.created_at ?? unixNow();
  return asPayload({
    event: "invoice.paid",
    created_at: createdAt,
    payload: {
      invoice: {
        entity: {
          id: overrides.id ?? "inv_test_1",
          payment_id: overrides.payment_id ?? "pay_test_captured",
          subscription_id: overrides.subscription_id ?? "sub_test_1",
          amount: overrides.amount ?? 99900,
          currency: overrides.currency ?? "INR",
          status: overrides.status ?? "paid",
          created_at: createdAt,
        },
      },
    },
  });
}

export function createMockStripeEvent(input: {
  type: string;
  object: Record<string, unknown>;
  id?: string;
  created?: number;
}): MockWebhookPayload {
  return asPayload({
    id: input.id ?? `evt_test_${input.type.replace(/\./g, "_")}`,
    object: "event",
    api_version: "2024-11-20.acacia",
    created: input.created ?? unixNow(),
    type: input.type,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: input.object,
    },
  });
}

export function createMockStripePaymentIntentSucceeded(
  overrides: StripeObjectOverrides = {},
): MockWebhookPayload {
  return createMockStripeEvent({
    type: "payment_intent.succeeded",
    object: {
      id: overrides.id ?? "pi_test_succeeded",
      object: "payment_intent",
      amount: overrides.amount ?? 5000,
      currency: overrides.currency ?? "usd",
      status: overrides.status ?? "succeeded",
      customer: overrides.customer ?? "cus_test_1",
    },
  });
}

export function createMockStripePaymentIntentFailed(
  overrides: StripeObjectOverrides = {},
): MockWebhookPayload {
  return createMockStripeEvent({
    type: "payment_intent.payment_failed",
    object: {
      id: overrides.id ?? "pi_test_failed",
      object: "payment_intent",
      amount: overrides.amount ?? 5000,
      currency: overrides.currency ?? "usd",
      status: overrides.status ?? "requires_payment_method",
      customer: overrides.customer ?? "cus_test_1",
    },
  });
}

export function createMockStripeChargeRefunded(
  overrides: StripeObjectOverrides = {},
): MockWebhookPayload {
  return createMockStripeEvent({
    type: "charge.refunded",
    object: {
      id: overrides.id ?? "ch_test_refunded",
      object: "charge",
      amount: overrides.amount ?? 2500,
      currency: overrides.currency ?? "usd",
      status: overrides.status ?? "succeeded",
      payment_intent: overrides.payment_intent ?? "pi_test_succeeded",
      customer: overrides.customer ?? "cus_test_1",
    },
  });
}

export function createMockStripeSubscription(
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted",
  overrides: StripeObjectOverrides = {},
): MockWebhookPayload {
  const status =
    overrides.status ??
    (type === "customer.subscription.deleted" ? "canceled" : "active");
  return createMockStripeEvent({
    type,
    object: {
      id: overrides.id ?? "sub_test_1",
      object: "subscription",
      status,
      customer: overrides.customer ?? "cus_test_1",
      items: {
        object: "list",
        data: [
          {
            id: "si_test_1",
            price: { id: "price_test_1" },
          },
        ],
      },
      cancel_at_period_end: type === "customer.subscription.deleted",
      current_period_end: unixNow() + 30 * 24 * 60 * 60,
    },
  });
}

export function createMockStripeInvoicePaid(
  overrides: StripeObjectOverrides = {},
): MockWebhookPayload {
  return createMockStripeEvent({
    type: "invoice.paid",
    object: {
      id: overrides.id ?? "in_test_paid",
      object: "invoice",
      amount_paid: overrides.amount ?? 2900,
      amount_due: 0,
      currency: overrides.currency ?? "usd",
      status: overrides.status ?? "paid",
      customer: overrides.customer ?? "cus_test_1",
      subscription: overrides.subscription ?? "sub_test_1",
    },
  });
}

export const webhookFixtures = {
  razorpay: {
    paymentCaptured: createMockRazorpayPaymentCaptured,
    paymentFailed: createMockRazorpayPaymentFailed,
    refundProcessed: createMockRazorpayRefundProcessed,
    subscription: createMockRazorpaySubscription,
    invoicePaid: createMockRazorpayInvoicePaid,
  },
  stripe: {
    event: createMockStripeEvent,
    paymentIntentSucceeded: createMockStripePaymentIntentSucceeded,
    paymentIntentFailed: createMockStripePaymentIntentFailed,
    chargeRefunded: createMockStripeChargeRefunded,
    subscription: createMockStripeSubscription,
    invoicePaid: createMockStripeInvoicePaid,
  },
} as const;
