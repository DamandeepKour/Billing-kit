import Stripe from "stripe";
import {
  BillingKitError,
  PaymentError,
  WebhookVerificationError,
} from "./errors";

export class StripeCardError extends BillingKitError {
  constructor(
    message: string,
    public readonly declineCode?: string | null,
    public readonly stripeCode?: string | null,
  ) {
    super(message, "STRIPE_CARD_ERROR");
    this.name = "StripeCardError";
  }
}

export class StripeAuthenticationError extends BillingKitError {
  constructor(message: string) {
    super(message, "STRIPE_AUTHENTICATION_ERROR");
    this.name = "StripeAuthenticationError";
  }
}

export class StripeInvalidRequestError extends BillingKitError {
  constructor(
    message: string,
    public readonly param?: string | null,
  ) {
    super(message, "STRIPE_INVALID_REQUEST");
    this.name = "StripeInvalidRequestError";
  }
}

export class UnsupportedOperationError extends BillingKitError {
  constructor(operation: string, provider: string) {
    super(
      `${operation} is not supported for provider "${provider}"`,
      "UNSUPPORTED_OPERATION",
    );
    this.name = "UnsupportedOperationError";
  }
}

/**
 * Maps Stripe SDK / API errors into billing-kit error types
 * (card declines, auth failures, invalid requests, webhook failures).
 */
export function mapStripeError(error: unknown): never {
  if (error instanceof BillingKitError) {
    throw error;
  }

  if (error instanceof Stripe.errors.StripeCardError) {
    throw new StripeCardError(error.message, error.decline_code, error.code);
  }

  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    throw new StripeAuthenticationError(error.message);
  }

  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    throw new StripeInvalidRequestError(error.message, error.param);
  }

  if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
    throw new WebhookVerificationError(error.message);
  }

  if (error instanceof Stripe.errors.StripeError) {
    throw new PaymentError(error.message);
  }

  throw error;
}

/** Run an async Stripe call and map failures to billing-kit errors. */
export async function withStripeErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapStripeError(error);
  }
}
