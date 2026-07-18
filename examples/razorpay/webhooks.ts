/**
 * Razorpay webhooks — verify raw body HMAC and handle normalized events.
 *
 * Express (required: raw body — do not use express.json() on this route):
 *
 *   app.post(
 *     "/webhooks/razorpay",
 *     express.raw({ type: "application/json" }),
 *     razorpayWebhookHandler,
 *   );
 *
 * Dashboard → Settings → Webhooks → secret → RAZORPAY_WEBHOOK_SECRET
 */
import crypto from "crypto";
import {
  BillingKit,
  TransactionType,
  type WebhookEvent,
} from "../../src";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});

async function handleRazorpayEvent(event: WebhookEvent): Promise<void> {
  // Prefer normalizedType + entity for provider-agnostic handlers
  switch (event.normalizedType) {
    case "payment.captured": {
      if (event.entity.kind !== "payment") break;
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: event.entity.amount ?? 0,
        currency: event.entity.currency ?? "inr",
        referenceId: event.entity.id,
      });
      break;
    }

    case "payment.failed":
      break;

    case "refund.processed": {
      if (event.entity.kind !== "refund") break;
      await billing.recordTransaction({
        type: TransactionType.REFUND,
        amount: event.entity.amount ?? 0,
        currency: event.entity.currency ?? "inr",
        referenceId: event.entity.id,
        metadata: event.entity.parentId
          ? { paymentId: event.entity.parentId }
          : undefined,
      });
      break;
    }

    case "subscription.activated":
    case "subscription.charged":
      await billing.recordTransaction({
        type: TransactionType.SUBSCRIPTION,
        amount: event.entity.amount ?? 0,
        currency: event.entity.currency ?? "inr",
        referenceId: event.entity.id,
        metadata: {
          status: event.entity.status ?? "",
          planId: event.entity.parentId ?? "",
          providerEvent: event.type,
        },
      });
      break;

    case "subscription.cancelled":
    case "subscription.completed":
      break;

    case "invoice.paid":
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: event.entity.amount ?? 0,
        currency: event.entity.currency ?? "inr",
        referenceId: event.entity.id,
      });
      break;

    default:
      break;
  }
}

export async function razorpayWebhookHandler(
  req: {
    /** Must be the raw body Buffer/string from express.raw() */
    body: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: {
    status: (code: number) => {
      send: (body: string) => void;
      json: (body: unknown) => void;
    };
  },
): Promise<void> {
  const signature = req.headers["x-razorpay-signature"];
  if (typeof signature !== "string") {
    res.status(400).send("Missing X-Razorpay-Signature header");
    return;
  }

  try {
    // Pass raw body — do not JSON.parse before verifyWebhook
    const event = billing.verifyWebhook(req.body, signature);
    await handleRazorpayEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    res.status(400).send(message);
  }
}

export function signRazorpayPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}
