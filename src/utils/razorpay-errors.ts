import {
  BillingAuthError,
  BillingErrorContext,
  BillingKitError,
  BillingRetryableError,
  BillingValidationError,
  PaymentError,
} from "./errors";

type RazorpayErrorBody = {
  code?: string;
  description?: string;
  message?: string;
  field?: string;
  source?: string;
  step?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

type RazorpayLikeError = {
  statusCode?: number;
  status?: number;
  error?: RazorpayErrorBody | string;
  message?: string;
  description?: string;
  code?: string;
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(
  headers: RazorpayLikeError["headers"],
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function asRecord(value: unknown): RazorpayLikeError | null {
  if (!value || typeof value !== "object") return null;
  return value as RazorpayLikeError;
}

function extractBody(error: RazorpayLikeError): RazorpayErrorBody {
  if (error.error && typeof error.error === "object") {
    return error.error;
  }
  return {
    code: error.code,
    description: error.description ?? error.message,
    message: error.message,
  };
}

function razorpayContext(
  error: RazorpayLikeError,
  body: RazorpayErrorBody,
): BillingErrorContext {
  return {
    provider: "razorpay",
    providerCode: body.code ?? body.reason ?? error.code,
    requestId:
      headerValue(error.headers, "x-request-id") ??
      headerValue(error.headers, "request-id") ??
      (typeof body.metadata?.request_id === "string"
        ? body.metadata.request_id
        : undefined),
    statusCode: error.statusCode ?? error.status,
    cause: error,
  };
}

function isRetryableRazorpay(
  statusCode: number | undefined,
  providerCode: string | undefined,
): boolean {
  if (statusCode === 429 || statusCode === 409) return true;
  if (statusCode !== undefined && statusCode >= 500) return true;
  const code = (providerCode ?? "").toUpperCase();
  return [
    "GATEWAY_ERROR",
    "SERVER_ERROR",
    "BAD_GATEWAY_ERROR",
    "RUNTIME_ERROR",
  ].includes(code);
}

function isAuthRazorpay(
  statusCode: number | undefined,
  providerCode: string | undefined,
): boolean {
  if (statusCode === 401 || statusCode === 403) return true;
  const code = (providerCode ?? "").toUpperCase();
  return ["AUTHENTICATION_ERROR", "UNAUTHORIZED", "FORBIDDEN"].includes(code);
}

function isValidationRazorpay(
  statusCode: number | undefined,
  providerCode: string | undefined,
): boolean {
  if (statusCode === 400 || statusCode === 422) return true;
  const code = (providerCode ?? "").toUpperCase();
  return [
    "BAD_REQUEST_ERROR",
    "VALIDATION_ERROR",
    "INVALID_REQUEST_ERROR",
  ].includes(code);
}

export function mapRazorpayError(error: unknown): never {
  if (error instanceof BillingKitError) {
    throw error;
  }

  const like = asRecord(error);
  if (!like) {
    throw error;
  }

  const body = extractBody(like);
  const message =
    body.description ??
    body.message ??
    like.message ??
    like.description ??
    "Razorpay request failed";
  const context = razorpayContext(like, body);
  const statusCode = context.statusCode;
  const providerCode = context.providerCode;

  if (isAuthRazorpay(statusCode, providerCode)) {
    throw new BillingAuthError(message, context);
  }
  if (isRetryableRazorpay(statusCode, providerCode)) {
    const retryAfter = headerValue(like.headers, "retry-after");
    const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;
    throw new BillingRetryableError(message, {
      ...context,
      retryAfterMs:
        Number.isFinite(seconds) && seconds && seconds > 0
          ? seconds * 1000
          : undefined,
    });
  }
  if (isValidationRazorpay(statusCode, providerCode)) {
    throw new BillingValidationError(message, {
      ...context,
      param: body.field,
    });
  }

  // Network-ish failures from Node / undici
  const code = (error as NodeJS.ErrnoException).code;
  if (
    code &&
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"].includes(
      code,
    )
  ) {
    throw new BillingRetryableError(message, {
      ...context,
      providerCode: code,
    });
  }

  throw new PaymentError(message, context);
}

export async function withRazorpayErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapRazorpayError(error);
  }
}
