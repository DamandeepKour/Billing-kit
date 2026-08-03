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
  | "dispute.created"
  | "dispute.won"
  | "dispute.lost"
  | "dispute.closed"
  | "dispute.under_review"
  | "dispute.action_required"
  | "dispute.updated"
  | "unknown";
export type WebhookEntityKind =
  | "payment"
  | "refund"
  | "subscription"
  | "invoice"
  | "dispute"
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
  occurredAt?: Date;
}
export type WebhookProcessingStatus =
  | "processing"
  | "processed"
  | "failed"
  | "ignored";
export interface WebhookEventRecord {
  eventId: string;
  provider: string;
  receivedAt: Date;
  processedAt?: Date;
  status: WebhookProcessingStatus;
  eventType: string;
  resourceType: WebhookEntityKind;
  resourceId: string;
  occurredAt?: Date;
  error?: string;
  durationMs?: number;
  requestId?: string;
}
export interface ClaimWebhookEventResult {
  outcome: "claimed" | "duplicate" | "out_of_order";
  record: WebhookEventRecord;
}
export interface RawWebhookRequest {
  rawBody: string | Buffer;
  signature: string;
  eventId?: string;
  receivedAt?: Date;
}
export type WebhookEventHandler = (
  event: WebhookEvent,
) => void | Promise<void>;
export interface ProcessWebhookResult {
  event: WebhookEvent;
  record: WebhookEventRecord;
  duplicate: boolean;
  outOfOrder: boolean;
  durationMs?: number;
}

/** Result of signature verification + durable event-id claim (before handler). */
export interface VerifyAndClaimWebhookResult {
  event: WebhookEvent;
  record: WebhookEventRecord;
  duplicate: boolean;
  outOfOrder: boolean;
  /** True when this delivery is a fresh claim and the handler should run. */
  shouldHandle: boolean;
  durationMs: number;
}

export type CompleteWebhookProcessingInput =
  | { status: "processed" }
  | { status: "failed"; error: unknown };
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
  "payment.dispute.created",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
  "payment.dispute.under_review",
  "payment.dispute.action_required",
] as const;
export type RazorpayWebhookEventName = (typeof RAZORPAY_WEBHOOK_EVENTS)[number];
