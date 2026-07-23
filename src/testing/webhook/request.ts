import type { RawWebhookRequest } from "../../types/webhook";
import type { MockWebhookPayload } from "./fixtures";
import {
  generateRazorpayWebhookSignature,
  generateStripeWebhookSignature,
} from "./signatures";

export interface SignedWebhookRequest extends RawWebhookRequest {
  headers: Record<string, string>;
  body: string;
}

export function createSignedRazorpayWebhookRequest(input: {
  payload: MockWebhookPayload | string | Buffer;
  secret: string;
  eventId?: string;
  receivedAt?: Date;
  /** When true, `rawBody` is a Buffer (Express `express.raw()` style). */
  asBuffer?: boolean;
}): SignedWebhookRequest {
  const source =
    typeof input.payload === "string" || Buffer.isBuffer(input.payload)
      ? input.payload
      : input.payload.body;
  const body = typeof source === "string" ? source : source.toString("utf8");
  const rawBody: string | Buffer = input.asBuffer ? Buffer.from(body, "utf8") : source;
  const signature = generateRazorpayWebhookSignature(rawBody, input.secret);
  return {
    rawBody,
    body,
    signature,
    eventId: input.eventId,
    receivedAt: input.receivedAt,
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
      ...(input.eventId
        ? { "x-razorpay-event-id": input.eventId }
        : {}),
    },
  };
}

export function createSignedStripeWebhookRequest(input: {
  payload: MockWebhookPayload | string;
  secret: string;
  eventId?: string;
  receivedAt?: Date;
  timestamp?: number;
  /** When true, `rawBody` is a Buffer (Express `express.raw()` style). */
  asBuffer?: boolean;
}): SignedWebhookRequest {
  const body =
    typeof input.payload === "string" ? input.payload : input.payload.body;
  const signature = generateStripeWebhookSignature(body, input.secret, {
    timestamp: input.timestamp,
  });
  const rawBody: string | Buffer = input.asBuffer
    ? Buffer.from(body, "utf8")
    : body;
  return {
    rawBody,
    body,
    signature,
    eventId: input.eventId,
    receivedAt: input.receivedAt,
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
  };
}

export function createSignedWebhookRequest(input: {
  provider: "razorpay" | "stripe";
  payload: MockWebhookPayload | string | Buffer;
  secret: string;
  eventId?: string;
  receivedAt?: Date;
  timestamp?: number;
  asBuffer?: boolean;
}): SignedWebhookRequest {
  if (input.provider === "razorpay") {
    return createSignedRazorpayWebhookRequest(input);
  }
  if (typeof input.payload !== "string" && Buffer.isBuffer(input.payload)) {
    return createSignedStripeWebhookRequest({
      ...input,
      payload: input.payload.toString("utf8"),
    });
  }
  return createSignedStripeWebhookRequest({
    ...input,
    payload: input.payload as MockWebhookPayload | string,
  });
}

export function formatWebhookCurl(input: {
  url: string;
  request: SignedWebhookRequest;
}): string {
  const headerFlags = Object.entries(input.request.headers)
    .map(([key, value]) => `  -H "${canonicalHeaderName(key)}: ${value}"`)
    .join(" \\\n");
  const escapedBody = input.request.body
    .replace(/\\/g, "\\\\")
    .replace(/'/g, `'\\''`);
  return [
    `curl -X POST '${input.url}' \\`,
    headerFlags + " \\",
    `  --data-binary '${escapedBody}'`,
  ].join("\n");
}

function canonicalHeaderName(header: string): string {
  const known: Record<string, string> = {
    "content-type": "Content-Type",
    "x-razorpay-signature": "X-Razorpay-Signature",
    "x-razorpay-event-id": "X-Razorpay-Event-Id",
    "stripe-signature": "Stripe-Signature",
  };
  return (
    known[header.toLowerCase()] ??
    header
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-")
  );
}
