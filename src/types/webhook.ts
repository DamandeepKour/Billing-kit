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
  parentId?: string;
}
export interface WebhookEvent {
  id: string;
  type: string;
  provider: string;
  data: unknown;
  normalizedType: NormalizedWebhookType;
  entity: WebhookEntity;
}
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
