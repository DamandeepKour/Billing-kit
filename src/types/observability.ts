export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogFields {
  event?: string;
  provider?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  requestId?: string;
  webhookEventId?: string;
  retryCount?: number;
  durationMs?: number;
  outcome?: "success" | "failure";
  errorCode?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: StructuredLogFields): void;
  info(message: string, fields?: StructuredLogFields): void;
  warn(message: string, fields?: StructuredLogFields): void;
  error(message: string, fields?: StructuredLogFields): void;
  child?(bindings: StructuredLogFields): Logger;
}

export interface ConsoleLoggerOptions {
  /** Emit one JSON object per line (default true). */
  json?: boolean;
  minLevel?: LogLevel;
  destination?: {
    write(chunk: string): void;
  };
}

export type BillingObservabilityEventName =
  | "operation.started"
  | "operation.succeeded"
  | "operation.failed"
  | "webhook.processed"
  | "webhook.failed"
  | "webhook.duplicate";

export interface BillingObservabilityEvent {
  name: BillingObservabilityEventName;
  timestamp: Date;
  provider?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  requestId?: string;
  webhookEventId?: string;
  retryCount?: number;
  durationMs?: number;
  outcome?: "success" | "failure";
  error?: { message: string; code?: string };
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface BillingObservabilityHooks {
  onEvent?: (event: BillingObservabilityEvent) => void | Promise<void>;
  onSuccess?: (event: BillingObservabilityEvent) => void | Promise<void>;
  onFailure?: (event: BillingObservabilityEvent) => void | Promise<void>;
}

/** Correlation + timing fields attached to operations and audit entries. */
export interface OperationObservability {
  requestId?: string;
  webhookEventId?: string;
  retryCount?: number;
  durationMs?: number;
  correlationId?: string;
}
