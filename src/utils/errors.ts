export interface BillingErrorContext {
  requestId?: string;
  providerCode?: string;
  provider?: string;
  statusCode?: number;
  cause?: unknown;
}

export class BillingKitError extends Error {
  readonly requestId?: string;
  readonly providerCode?: string;
  readonly provider?: string;
  readonly statusCode?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    public readonly code: string,
    context?: BillingErrorContext,
  ) {
    super(message);
    this.name = "BillingKitError";
    this.requestId = context?.requestId;
    this.providerCode = context?.providerCode;
    this.provider = context?.provider;
    this.statusCode = context?.statusCode;
    this.cause = context?.cause;
  }
}

/** Authentication / authorization failures (API keys, permissions). */
export class BillingAuthError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext & { code?: string }) {
    super(message, context?.code ?? "BILLING_AUTH_ERROR", context);
    this.name = "BillingAuthError";
  }
}

/** Invalid parameters or unprocessable requests (safe not to retry as-is). */
export class BillingValidationError extends BillingKitError {
  readonly param?: string;

  constructor(
    message: string,
    context?: BillingErrorContext & { code?: string; param?: string | null },
  ) {
    super(message, context?.code ?? "BILLING_VALIDATION_ERROR", context);
    this.name = "BillingValidationError";
    this.param = context?.param ?? undefined;
  }
}

/**
 * Transient failures that are safe to retry with backoff
 * (rate limits, timeouts, connection errors, 5xx).
 */
export class BillingRetryableError extends BillingKitError {
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    context?: BillingErrorContext & { code?: string; retryAfterMs?: number },
  ) {
    super(message, context?.code ?? "BILLING_RETRYABLE_ERROR", context);
    this.name = "BillingRetryableError";
    this.retryAfterMs = context?.retryAfterMs;
  }
}

export class InvalidConfigError extends BillingKitError {
  readonly param?: string;

  constructor(
    message: string,
    context?: BillingErrorContext & { param?: string | null },
  ) {
    super(message, "INVALID_CONFIG", context);
    this.name = "InvalidConfigError";
    this.param = context?.param ?? undefined;
  }
}
export class PaymentError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, "PAYMENT_ERROR", context);
    this.name = "PaymentError";
  }
}
export class CouponError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, "COUPON_ERROR", context);
    this.name = "CouponError";
  }
}
export class WebhookVerificationError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, "WEBHOOK_VERIFICATION_FAILED", context);
    this.name = "WebhookVerificationError";
  }
}
export class TransactionNotFoundError extends BillingKitError {
  constructor(id: string, context?: BillingErrorContext) {
    super(`Transaction not found: ${id}`, "TRANSACTION_NOT_FOUND", context);
    this.name = "TransactionNotFoundError";
  }
}
export class IdempotencyConflictError extends BillingKitError {
  constructor(key: string, context?: BillingErrorContext) {
    super(
      `Idempotency key reused with a different request: ${key}`,
      "IDEMPOTENCY_CONFLICT",
      context,
    );
    this.name = "IdempotencyConflictError";
  }
}
export class IdempotencyInFlightError extends BillingKitError {
  constructor(key: string, context?: BillingErrorContext) {
    super(
      `Request is already in progress or requires reconciliation for key: ${key}`,
      "IDEMPOTENCY_IN_FLIGHT",
      context,
    );
    this.name = "IdempotencyInFlightError";
  }
}
export class SubscriptionLifecycleError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, "SUBSCRIPTION_LIFECYCLE", context);
    this.name = "SubscriptionLifecycleError";
  }
}
export class InvoiceNotFoundError extends BillingKitError {
  constructor(id: string, context?: BillingErrorContext) {
    super(`Invoice not found: ${id}`, "INVOICE_NOT_FOUND", context);
    this.name = "InvoiceNotFoundError";
  }
}
export class CurrencyMismatchError extends BillingKitError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, "CURRENCY_MISMATCH", context);
    this.name = "CurrencyMismatchError";
  }
}
export class UnsupportedCurrencyError extends BillingKitError {
  constructor(currency: string, supported: string[], context?: BillingErrorContext) {
    super(
      `Unsupported currency "${currency}". Supported: ${supported.join(", ")}`,
      "UNSUPPORTED_CURRENCY",
      context,
    );
    this.name = "UnsupportedCurrencyError";
  }
}
