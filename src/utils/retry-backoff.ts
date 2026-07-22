import { BillingRetryableError } from "./errors";

export interface BackoffRetryOptions {
  /** Maximum retry attempts after the first try. Default: 3 */
  maxRetries?: number;
  /** Base delay before the first retry. Default: 100ms */
  initialDelayMs?: number;
  /** Cap for computed delay. Default: 20_000ms */
  maxDelayMs?: number;
  /** Randomize delay in [0.5, 1.0] × computed. Default: true */
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (info: {
    error: unknown;
    attempt: number;
    delayMs: number;
  }) => void;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 20_000,
  jitter: true,
} as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe-to-retry errors: BillingRetryableError and common network failures.
 * Do not retry validation/auth/card declines.
 */
export function isRetryableBillingError(error: unknown): boolean {
  if (error instanceof BillingRetryableError) return true;
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return Boolean(
    code &&
      ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"].includes(
        code,
      ),
  );
}

/**
 * Exponential backoff: initialDelay * 2^(attempt-1), capped, with optional jitter.
 * Honors `BillingRetryableError.retryAfterMs` when larger than the computed delay.
 */
export function computeBackoffDelayMs(
  attempt: number,
  options: BackoffRetryOptions = {},
  error?: unknown,
): number {
  const initialDelayMs = options.initialDelayMs ?? DEFAULTS.initialDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const jitter = options.jitter ?? DEFAULTS.jitter;

  const exp = Math.min(
    maxDelayMs,
    initialDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  const withJitter = jitter
    ? exp * (0.5 + Math.random() * 0.5)
    : exp;

  const retryAfter =
    error instanceof BillingRetryableError ? error.retryAfterMs : undefined;
  const delay = Math.max(withJitter, retryAfter ?? 0);
  return Math.min(maxDelayMs, Math.round(delay));
}

/**
 * Retry a function for transient provider/network failures using exponential backoff.
 * Only retries when `shouldRetry` (default: {@link isRetryableBillingError}) returns true.
 */
export async function withBackoffRetry<T>(
  fn: () => Promise<T>,
  options: BackoffRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
  const shouldRetry = options.shouldRetry ?? isRetryableBillingError;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }
      attempt += 1;
      const delayMs = computeBackoffDelayMs(attempt, options, error);
      options.onRetry?.({ error, attempt, delayMs });
      await sleep(delayMs);
    }
  }
}
