import Stripe from "stripe";
import {
  BillingAuthError,
  BillingErrorContext,
  BillingKitError,
  BillingRetryableError,
  BillingValidationError,
  PaymentError,
  WebhookVerificationError,
} from "./errors";

function stripeContext(
  error: Stripe.errors.StripeError,
): BillingErrorContext {
  const headers = error.headers as Record<string, string | undefined> | undefined;

  return {
    provider: "stripe",
    providerCode: error.code ?? error.type,
    requestId: error.requestId ?? headers?.["request-id"],
    statusCode: error.statusCode,
    cause: error,
  };
}

function retryAfterMsFromStripe(
  error: Stripe.errors.StripeError,
): number | undefined {
  const headers = error.headers as Record<string, string | undefined> | undefined;
  const retryAfterHeader = headers?.["retry-after"];
  if (!retryAfterHeader) return undefined;
  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return seconds * 1000;
}

export class StripeCardError extends BillingValidationError {
  readonly declineCode?: string | null;
  readonly stripeCode?: string | null;

  constructor(
    message: string,
    declineCode?: string | null,
    stripeCode?: string | null,
    context?: BillingErrorContext,
  ) {
    super(message, {
      ...context,
      code: "STRIPE_CARD_ERROR",
      provider: context?.provider ?? "stripe",
      providerCode: stripeCode ?? context?.providerCode,
    });
    this.name = "StripeCardError";
    this.declineCode = declineCode;
    this.stripeCode = stripeCode;
  }
}

export class StripeAuthenticationError extends BillingAuthError {
  constructor(message: string, context?: BillingErrorContext) {
    super(message, {
      ...context,
      code: "STRIPE_AUTHENTICATION_ERROR",
      provider: context?.provider ?? "stripe",
    });
    this.name = "StripeAuthenticationError";
  }
}

export class StripeInvalidRequestError extends BillingValidationError {
  constructor(
    message: string,
    param?: string | null,
    context?: BillingErrorContext,
  ) {
    super(message, {
      ...context,
      code: "STRIPE_INVALID_REQUEST",
      provider: context?.provider ?? "stripe",
      param,
    });
    this.name = "StripeInvalidRequestError";
  }
}

export class UnsupportedOperationError extends BillingKitError {
  constructor(operation: string, provider: string) {
    super(
      `${operation} is not supported for provider "${provider}"`,
      "UNSUPPORTED_OPERATION",
      { provider },
    );
    this.name = "UnsupportedOperationError";
  }
}

export function mapStripeError(error: unknown): never {
  if (error instanceof BillingKitError) {
    throw error;
  }
  if (error instanceof Stripe.errors.StripeCardError) {
    throw new StripeCardError(
      error.message,
      error.decline_code,
      error.code,
      stripeContext(error),
    );
  }
  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    throw new StripeAuthenticationError(error.message, stripeContext(error));
  }
  if (error instanceof Stripe.errors.StripePermissionError) {
    throw new BillingAuthError(error.message, {
      ...stripeContext(error),
      code: "BILLING_AUTH_ERROR",
    });
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    throw new StripeInvalidRequestError(
      error.message,
      error.param,
      stripeContext(error),
    );
  }
  if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
    throw new WebhookVerificationError(error.message, stripeContext(error));
  }
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    throw new BillingRetryableError(error.message, {
      ...stripeContext(error),
      code: "BILLING_RETRYABLE_ERROR",
      retryAfterMs: retryAfterMsFromStripe(error),
    });
  }
  if (error instanceof Stripe.errors.StripeConnectionError) {
    throw new BillingRetryableError(error.message, {
      ...stripeContext(error),
      code: "BILLING_RETRYABLE_ERROR",
    });
  }
  if (error instanceof Stripe.errors.StripeAPIError) {
    const status = error.statusCode ?? 0;
    if (status >= 500 || status === 409) {
      throw new BillingRetryableError(error.message, {
        ...stripeContext(error),
        code: "BILLING_RETRYABLE_ERROR",
        retryAfterMs: retryAfterMsFromStripe(error),
      });
    }
    throw new PaymentError(error.message, stripeContext(error));
  }
  if (error instanceof Stripe.errors.StripeError) {
    throw new PaymentError(error.message, stripeContext(error));
  }
  throw error;
}

export async function withStripeErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapStripeError(error);
  }
}
