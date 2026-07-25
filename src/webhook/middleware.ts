import type { IncomingMessage, ServerResponse } from "http";
import { BillingValidationError } from "../utils/errors";

export type RawBodyIncomingMessage = IncomingMessage & {
  rawBody?: Buffer;
  body?: string | Buffer;
};

export interface RawBodyMiddlewareOptions {
  /** Max body size in bytes (default 1 MiB). */
  limit?: number;
}

/**
 * Connect/Express-compatible middleware that buffers the request into
 * `req.rawBody` / `req.body` as a Buffer for webhook signature verification.
 *
 * Mount this on the webhook route **before** any JSON body parser, or use
 * `express.raw({ type: "application/json" })` instead.
 */
export function createRawBodyMiddleware(
  options: RawBodyMiddlewareOptions = {},
): (
  req: RawBodyIncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void {
  const limit = options.limit ?? 1024 * 1024;

  return (req, _res, next) => {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body, "utf8");
      req.rawBody = raw;
      req.body = raw;
      next();
      return;
    }

    if (Buffer.isBuffer(req.rawBody)) {
      req.body = req.rawBody;
      next();
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      next(error);
    };

    req.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > limit) {
        fail(
          new BillingValidationError(
            `Webhook body exceeds limit of ${limit} bytes`,
            { code: "WEBHOOK_BODY_TOO_LARGE", param: "rawBody" },
          ),
        );
        req.destroy();
        return;
      }
      chunks.push(buf);
    });

    req.on("end", () => {
      if (settled) return;
      settled = true;
      const rawBody = Buffer.concat(chunks);
      req.rawBody = rawBody;
      req.body = rawBody;
      next();
    });

    req.on("error", fail);
  };
}
