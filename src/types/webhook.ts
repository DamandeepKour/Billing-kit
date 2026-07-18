/**
 * Provider-agnostic webhook event names used after normalization.
 * Raw provider event names remain on {@link WebhookEvent.type}.
 */
export type NormalizedWebhookType =
  | "payment.captured"
  | "payment.failed"
  | "payment.authorized"
  | "refund.processed"
  | "subscription.activated"
  | "subscription.charged"
  | "subscription.cancelled"
  | "subscription.completed"
  | "invoice.paid"
  | "unknown";

export type WebhookEntityKind =
  | "payment"
  | "refund"
  | "subscription"
  | "invoice"
  | "unknown";

export interface WebhookEntity {
  id: string;
  kind: WebhookEntityKind;
  amount?: number;
  currency?: string;
  status?: string;
  /** e.g. payment_id for refunds, plan_id for subscriptions */
  parentId?: string;
}

export interface WebhookEvent {
  id: string;
  /** Raw provider event name (e.g. `payment.captured`, `invoice.paid`) */
  type: string;
  provider: string;
  /** Original provider payload object */
  data: unknown;
  /** Cross-provider normalized event name */
  normalizedType: NormalizedWebhookType;
  /** Primary entity extracted for handlers */
  entity: WebhookEntity;
}

/** Known Razorpay webhook event names documented for billing flows. */
export const RAZORPAY_WEBHOOK_EVENTS = [
  "payment.captured",
  "payment.failed",
  "payment.authorized",
  "refund.processed",
  "subscription.activated",
  "subscription.charged",
  "subscription.cancelled",
  "subscription.completed",
  "invoice.paid",
] as const;

export type RazorpayWebhookEventName = (typeof RAZORPAY_WEBHOOK_EVENTS)[number];
