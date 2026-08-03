import type { BillingProvider } from "../types/config";
import type {
  CompleteWebhookProcessingInput,
  ProcessWebhookResult,
  RawWebhookRequest,
  VerifyAndClaimWebhookResult,
  WebhookEvent,
  WebhookEventHandler,
  WebhookEventRecord,
} from "../types/webhook";
import { BillingValidationError } from "../utils/errors";

/** HTTP header map (Node / Express / Fetch-compatible). */
export type WebhookHeaderMap = Record<
  string,
  string | string[] | undefined
>;

export interface WebhookHttpRequestLike {
  body?: unknown;
  rawBody?: unknown;
  headers: WebhookHeaderMap;
}

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";
export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";

/** Options for `express.raw()` on webhook routes. */
export const EXPRESS_WEBHOOK_RAW_BODY = {
  type: "application/json",
} as const;

export function isRawWebhookBody(value: unknown): value is string | Buffer {
  return typeof value === "string" || Buffer.isBuffer(value);
}

/**
 * Ensures the value is an unparsed webhook body (string or Buffer).
 * Throws if JSON middleware already parsed the payload into an object.
 */
export function ensureRawWebhookBody(
  body: unknown,
  param = "rawBody",
): string | Buffer {
  if (isRawWebhookBody(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  throw new BillingValidationError(
    "Webhook raw body must be a string or Buffer. " +
      "Use express.raw({ type: 'application/json' }), createRawBodyMiddleware(), " +
      "or equivalent before JSON body parsing.",
    { code: "INVALID_WEBHOOK_RAW_BODY", param },
  );
}

/** Prefer `rawBody`, then `body` — for Express `express.raw()` and custom collectors. */
export function extractRawWebhookBody(
  request: WebhookHttpRequestLike,
): string | Buffer {
  if (request.rawBody !== undefined && request.rawBody !== null) {
    return ensureRawWebhookBody(request.rawBody, "rawBody");
  }
  return ensureRawWebhookBody(request.body, "body");
}

export function getHeader(
  headers: WebhookHeaderMap,
  name: string,
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0];
  }
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  // Case-insensitive scan (IncomingMessage lowercases; some stacks do not)
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function resolveWebhookSignature(
  provider: BillingProvider,
  headers: WebhookHeaderMap,
): string {
  const headerName =
    provider === "stripe"
      ? STRIPE_SIGNATURE_HEADER
      : RAZORPAY_SIGNATURE_HEADER;
  const signature = getHeader(headers, headerName);
  if (!signature) {
    throw new BillingValidationError(
      `Missing ${headerName} header for ${provider} webhook verification`,
      { code: "MISSING_WEBHOOK_SIGNATURE", param: headerName },
    );
  }
  return signature;
}

/**
 * Provider event id used for duplicate protection.
 * - Razorpay: `X-Razorpay-Event-Id` when present
 * - Stripe: typically taken from the verified event payload (`event.id`)
 */
export function resolveWebhookEventIdFromHeaders(
  provider: BillingProvider,
  headers: WebhookHeaderMap,
): string | undefined {
  if (provider === "razorpay") {
    return getHeader(headers, RAZORPAY_EVENT_ID_HEADER);
  }
  return getHeader(headers, "stripe-event-id");
}

export function resolveDedupeEventId(input: {
  provider: BillingProvider;
  request: Pick<RawWebhookRequest, "eventId" | "rawBody">;
  event: WebhookEvent;
  fingerprint: (payload: string | Buffer) => string;
}): string {
  if (input.request.eventId?.trim()) {
    return input.request.eventId.trim();
  }
  if (input.provider === "stripe" || input.event.provider === "stripe") {
    return input.event.id;
  }
  return input.fingerprint(input.request.rawBody);
}

export function parseWebhookRequest(input: {
  provider: BillingProvider;
  rawBody: unknown;
  headers: WebhookHeaderMap;
  eventId?: string;
  receivedAt?: Date;
}): RawWebhookRequest {
  const rawBody = ensureRawWebhookBody(input.rawBody);
  const signature = resolveWebhookSignature(input.provider, input.headers);
  const eventId =
    input.eventId?.trim() ||
    resolveWebhookEventIdFromHeaders(input.provider, input.headers);

  return {
    rawBody,
    signature,
    eventId,
    receivedAt: input.receivedAt,
  };
}

export function parseWebhookRequestFromHttp(
  provider: BillingProvider,
  request: WebhookHttpRequestLike,
  options?: { eventId?: string; receivedAt?: Date },
): RawWebhookRequest {
  return parseWebhookRequest({
    provider,
    rawBody: extractRawWebhookBody(request),
    headers: request.headers,
    eventId: options?.eventId,
    receivedAt: options?.receivedAt,
  });
}

export interface ExpressLikeResponse {
  statusCode?: number;
  status?: (code: number) => ExpressLikeResponse;
  json?: (body: unknown) => unknown;
  send?: (body?: unknown) => unknown;
  end?: (body?: unknown) => unknown;
}

export interface CreateWebhookHttpHandlerOptions {
  provider: BillingProvider;
  processWebhook: (
    request: RawWebhookRequest,
    handler: WebhookEventHandler,
  ) => Promise<ProcessWebhookResult>;
  handler: WebhookEventHandler;
  /**
   * When true, write HTTP 200 immediately after signature verification + durable
   * event-id claim, then run the handler. Duplicates / out-of-order still skip
   * the handler. Prefer the default (ack after handler) unless the handler is
   * slow and you accept that a crash mid-handle will not trigger provider retries.
   */
  fastAcknowledge?: boolean;
  verifyAndClaimWebhook?: (
    request: RawWebhookRequest,
  ) => Promise<VerifyAndClaimWebhookResult>;
  completeWebhookProcessing?: (
    record: WebhookEventRecord,
    outcome: CompleteWebhookProcessingInput,
  ) => Promise<WebhookEventRecord>;
  /** Defaults to 200 for success, duplicate, and out-of-order. */
  successStatus?: number;
  /** Defaults to 400. */
  errorStatus?: number;
}

/**
 * Framework-agnostic HTTP handler: reads raw body + signature headers,
 * runs `processWebhook` (verify → normalize → dedupe → handler).
 */
export function createWebhookHttpHandler(
  options: CreateWebhookHttpHandlerOptions,
): (
  req: WebhookHttpRequestLike,
  res: ExpressLikeResponse,
) => Promise<void> {
  const successStatus = options.successStatus ?? 200;
  const errorStatus = options.errorStatus ?? 400;

  return async (req, res) => {
    try {
      const request = parseWebhookRequestFromHttp(options.provider, req);

      if (options.fastAcknowledge) {
        if (
          !options.verifyAndClaimWebhook ||
          !options.completeWebhookProcessing
        ) {
          throw new BillingValidationError(
            "fastAcknowledge requires verifyAndClaimWebhook and completeWebhookProcessing",
            { code: "INVALID_WEBHOOK_FAST_ACK", param: "fastAcknowledge" },
          );
        }

        const claim = await options.verifyAndClaimWebhook(request);
        writeJson(res, successStatus, {
          ok: true,
          duplicate: claim.duplicate,
          outOfOrder: claim.outOfOrder,
          eventId: claim.record.eventId,
          normalizedType: claim.event.normalizedType,
          acknowledged: true,
        });

        if (!claim.shouldHandle) return;

        try {
          await options.handler(claim.event);
          await options.completeWebhookProcessing(claim.record, {
            status: "processed",
          });
        } catch (error) {
          await options.completeWebhookProcessing(claim.record, {
            status: "failed",
            error,
          });
        }
        return;
      }

      const result = await options.processWebhook(request, options.handler);
      writeJson(res, successStatus, {
        ok: true,
        duplicate: result.duplicate,
        outOfOrder: result.outOfOrder,
        eventId: result.record.eventId,
        normalizedType: result.event.normalizedType,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(res, errorStatus, { ok: false, error: message });
    }
  };
}

function writeJson(
  res: ExpressLikeResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  if (typeof res.status === "function" && typeof res.json === "function") {
    const withStatus = res.status(status);
    if (typeof withStatus.json === "function") {
      withStatus.json(body);
      return;
    }
    res.json(body);
    return;
  }
  res.statusCode = status;
  const payload = JSON.stringify(body);
  if (typeof res.send === "function") {
    res.send(payload);
    return;
  }
  if (typeof res.end === "function") {
    res.end(payload);
  }
}
