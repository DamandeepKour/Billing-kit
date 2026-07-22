import {
  BillingAuthError,
  BillingRetryableError,
  BillingValidationError,
  PaymentError,
} from "../src/utils/errors";
import { mapRazorpayError } from "../src/utils/razorpay-errors";
import {
  computeBackoffDelayMs,
  isRetryableBillingError,
  withBackoffRetry,
} from "../src/utils/retry-backoff";
import {
  mapStripeError,
  StripeAuthenticationError,
  StripeCardError,
  StripeInvalidRequestError,
} from "../src/utils/stripe-errors";
import Stripe from "stripe";

describe("provider error normalization", () => {
  it("maps Stripe auth errors to BillingAuthError hierarchy", () => {
    const err = new Stripe.errors.StripeAuthenticationError({
      message: "Invalid API Key",
      type: "authentication_error",
    });
    Object.assign(err, { requestId: "req_auth_1", statusCode: 401 });

    expect(() => mapStripeError(err)).toThrow(StripeAuthenticationError);
    try {
      mapStripeError(err);
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BillingAuthError);
      expect(mapped).toMatchObject({
        requestId: "req_auth_1",
        provider: "stripe",
        statusCode: 401,
        code: "STRIPE_AUTHENTICATION_ERROR",
      });
    }
  });

  it("maps Stripe invalid requests to BillingValidationError hierarchy", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      message: "No such customer",
      type: "invalid_request_error",
      param: "customer",
    });
    Object.assign(err, { requestId: "req_val_1", code: "resource_missing" });

    try {
      mapStripeError(err);
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(StripeInvalidRequestError);
      expect(mapped).toBeInstanceOf(BillingValidationError);
      expect(mapped).toMatchObject({
        param: "customer",
        requestId: "req_val_1",
        providerCode: "resource_missing",
        provider: "stripe",
      });
    }
  });

  it("maps Stripe rate limits to BillingRetryableError", () => {
    const err = new Stripe.errors.StripeRateLimitError({
      message: "Too many requests",
      type: "rate_limit_error",
    });
    Object.assign(err, {
      requestId: "req_retry_1",
      statusCode: 429,
      headers: { "retry-after": "2" },
    });

    try {
      mapStripeError(err);
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BillingRetryableError);
      expect(mapped).toMatchObject({
        requestId: "req_retry_1",
        statusCode: 429,
        retryAfterMs: 2000,
        provider: "stripe",
      });
    }
  });

  it("maps Stripe connection errors as retryable", () => {
    const err = new Stripe.errors.StripeConnectionError({
      message: "Connection reset",
      type: "api_error",
    });

    expect(() => mapStripeError(err)).toThrow(BillingRetryableError);
  });

  it("keeps Stripe card errors with decline metadata", () => {
    const err = new Stripe.errors.StripeCardError({
      message: "Your card was declined",
      type: "card_error",
      decline_code: "insufficient_funds",
      code: "card_declined",
    });
    Object.assign(err, { requestId: "req_card_1" });

    try {
      mapStripeError(err);
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(StripeCardError);
      expect(mapped).toBeInstanceOf(BillingValidationError);
      expect(mapped).toMatchObject({
        declineCode: "insufficient_funds",
        stripeCode: "card_declined",
        requestId: "req_card_1",
      });
    }
  });

  it("maps Razorpay auth failures", () => {
    try {
      mapRazorpayError({
        statusCode: 401,
        error: {
          code: "AUTHENTICATION_ERROR",
          description: "Authentication failed",
        },
        headers: { "x-request-id": "rzp_req_1" },
      });
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BillingAuthError);
      expect(mapped).toMatchObject({
        requestId: "rzp_req_1",
        providerCode: "AUTHENTICATION_ERROR",
        provider: "razorpay",
        statusCode: 401,
      });
    }
  });

  it("maps Razorpay validation failures", () => {
    try {
      mapRazorpayError({
        statusCode: 400,
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "amount is required",
          field: "amount",
        },
      });
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BillingValidationError);
      expect(mapped).toMatchObject({
        param: "amount",
        providerCode: "BAD_REQUEST_ERROR",
        provider: "razorpay",
      });
    }
  });

  it("maps Razorpay gateway errors as retryable", () => {
    try {
      mapRazorpayError({
        statusCode: 502,
        error: {
          code: "GATEWAY_ERROR",
          description: "Upstream unavailable",
        },
        headers: { "retry-after": "1" },
      });
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(BillingRetryableError);
      expect(mapped).toMatchObject({
        retryAfterMs: 1000,
        statusCode: 502,
        provider: "razorpay",
      });
    }
  });

  it("maps unknown Razorpay errors to PaymentError with context", () => {
    try {
      mapRazorpayError({
        statusCode: 404,
        error: { code: "NOT_FOUND", description: "Payment not found" },
      });
    } catch (mapped) {
      expect(mapped).toBeInstanceOf(PaymentError);
      expect(mapped).toMatchObject({
        providerCode: "NOT_FOUND",
        provider: "razorpay",
        statusCode: 404,
      });
    }
  });
});

describe("backoff retry helpers", () => {
  it("identifies retryable billing errors", () => {
    expect(
      isRetryableBillingError(
        new BillingRetryableError("slow down", { provider: "stripe" }),
      ),
    ).toBe(true);
    expect(
      isRetryableBillingError(
        new BillingValidationError("bad input", { provider: "stripe" }),
      ),
    ).toBe(false);
  });

  it("computes exponential backoff delays", () => {
    expect(
      computeBackoffDelayMs(1, {
        initialDelayMs: 100,
        jitter: false,
        maxDelayMs: 10_000,
      }),
    ).toBe(100);
    expect(
      computeBackoffDelayMs(3, {
        initialDelayMs: 100,
        jitter: false,
        maxDelayMs: 10_000,
      }),
    ).toBe(400);
    expect(
      computeBackoffDelayMs(2, {
        initialDelayMs: 100,
        jitter: false,
        maxDelayMs: 10_000,
      }, new BillingRetryableError("wait", { retryAfterMs: 1500 })),
    ).toBe(1500);
  });

  it("retries only safe failures with exponential backoff", async () => {
    let calls = 0;
    const result = await withBackoffRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new BillingRetryableError("temporary", {
            provider: "stripe",
            requestId: `req_${calls}`,
          });
        }
        return "ok";
      },
      {
        maxRetries: 3,
        initialDelayMs: 1,
        jitter: false,
        sleep: async () => undefined,
      },
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry validation errors", async () => {
    let calls = 0;
    await expect(
      withBackoffRetry(
        async () => {
          calls += 1;
          throw new BillingValidationError("invalid", { provider: "stripe" });
        },
        { maxRetries: 3, sleep: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(BillingValidationError);
    expect(calls).toBe(1);
  });
});
