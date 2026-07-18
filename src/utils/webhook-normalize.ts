import type {
  NormalizedWebhookType,
  WebhookEntity,
  WebhookEvent,
} from "../types/webhook";

type RazorpayWebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: Record<string, unknown> };
    refund?: { entity?: Record<string, unknown> };
    subscription?: { entity?: Record<string, unknown> };
    invoice?: { entity?: Record<string, unknown> };
  };
};

const RAZORPAY_NORMALIZED: Record<string, NormalizedWebhookType> = {
  "payment.captured": "payment.captured",
  "payment.failed": "payment.failed",
  "payment.authorized": "payment.authorized",
  "refund.processed": "refund.processed",
  "subscription.activated": "subscription.activated",
  "subscription.charged": "subscription.charged",
  "subscription.cancelled": "subscription.cancelled",
  "subscription.completed": "subscription.completed",
  "invoice.paid": "invoice.paid",
};

const STRIPE_NORMALIZED: Record<string, NormalizedWebhookType> = {
  "payment_intent.succeeded": "payment.captured",
  "payment_intent.payment_failed": "payment.failed",
  "charge.refunded": "refund.processed",
  "customer.subscription.created": "subscription.activated",
  "customer.subscription.updated": "subscription.activated",
  "customer.subscription.deleted": "subscription.cancelled",
  "invoice.paid": "invoice.paid",
  "invoice.payment_succeeded": "subscription.charged",
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function entityFrom(
  kind: WebhookEntity["kind"],
  entity: Record<string, unknown> | undefined,
  parentId?: string,
): WebhookEntity {
  if (!entity) {
    return { id: "unknown", kind: "unknown" };
  }

  return {
    id: asString(entity.id) ?? "unknown",
    kind,
    amount: asNumber(entity.amount),
    currency: asString(entity.currency)?.toLowerCase(),
    status: asString(entity.status),
    parentId:
      parentId ??
      asString(entity.payment_id) ??
      asString(entity.plan_id) ??
      asString(entity.order_id),
  };
}

export function normalizeRazorpayWebhook(
  body: string,
  provider: string,
): WebhookEvent {
  const parsed = JSON.parse(body) as RazorpayWebhookBody;
  const type = parsed.event ?? "unknown";
  const payload = parsed.payload ?? {};

  let entity: WebhookEntity = { id: `evt_${Date.now()}`, kind: "unknown" };

  if (payload.payment?.entity) {
    entity = entityFrom("payment", payload.payment.entity);
  } else if (payload.refund?.entity) {
    entity = entityFrom("refund", payload.refund.entity);
  } else if (payload.subscription?.entity) {
    entity = entityFrom("subscription", payload.subscription.entity);
  } else if (payload.invoice?.entity) {
    entity = entityFrom("invoice", payload.invoice.entity);
  }

  return {
    id: entity.id !== "unknown" ? entity.id : `evt_${Date.now()}`,
    type,
    provider,
    data: payload,
    normalizedType: RAZORPAY_NORMALIZED[type] ?? "unknown",
    entity,
  };
}

export function normalizeStripeWebhook(
  eventId: string,
  type: string,
  data: unknown,
  provider: string,
): WebhookEvent {
  const object =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : undefined;

  let entity: WebhookEntity = {
    id: asString(object?.id) ?? eventId,
    kind: "unknown",
    amount: asNumber(object?.amount) ?? asNumber(object?.amount_paid),
    currency: asString(object?.currency)?.toLowerCase(),
    status: asString(object?.status),
  };

  if (type.startsWith("payment_intent.")) {
    entity = { ...entity, kind: "payment" };
  } else if (type.startsWith("charge.") || type === "charge.refunded") {
    entity = {
      ...entity,
      kind: type === "charge.refunded" ? "refund" : "payment",
      parentId: asString(object?.payment_intent) ?? asString(object?.id),
    };
  } else if (type.startsWith("customer.subscription.")) {
    entity = {
      ...entity,
      kind: "subscription",
      parentId:
        typeof object?.items === "object" &&
        object.items !== null &&
        Array.isArray((object.items as { data?: unknown[] }).data)
          ? asString(
              (
                (object.items as { data: Array<{ price?: { id?: string } }> })
                  .data[0]?.price as { id?: string } | undefined
              )?.id,
            )
          : undefined,
    };
  } else if (type.startsWith("invoice.")) {
    entity = {
      ...entity,
      kind: "invoice",
      parentId: asString(object?.subscription),
      amount: asNumber(object?.amount_paid) ?? asNumber(object?.amount_due),
    };
  }

  let normalizedType: NormalizedWebhookType = STRIPE_NORMALIZED[type] ?? "unknown";

  // invoice.paid with a subscription is often a renewal charge
  if (type === "invoice.paid" && entity.parentId) {
    normalizedType = "subscription.charged";
  }

  return {
    id: eventId,
    type,
    provider,
    data,
    normalizedType,
    entity,
  };
}
