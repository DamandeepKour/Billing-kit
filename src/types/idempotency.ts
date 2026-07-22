export type IdempotencyRequestKind =
  | "create_payment"
  | "refund_payment"
  | "capture_payment"
  | "create_order"
  | "create_subscription";

export type IdempotencyRequestStatus =
  | "processing"
  | "succeeded"
  | "failed"
  | "uncertain";

export interface IdempotencyRequestRecord {
  id: string;
  idempotencyKey: string;
  kind: IdempotencyRequestKind;
  fingerprint: string;
  status: IdempotencyRequestStatus;
  request: Record<string, unknown>;
  result?: unknown;
  providerResponse?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimIdempotencyRequestResult {
  outcome: "claimed" | "duplicate" | "conflict" | "in_flight";
  record: IdempotencyRequestRecord;
}

export interface IdempotencyRequestFilter {
  kind?: IdempotencyRequestKind | IdempotencyRequestKind[];
  status?: IdempotencyRequestStatus | IdempotencyRequestStatus[];
}
