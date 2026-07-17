/**
 * Razorpay webhooks — HMAC verify and handle payment / subscription events.
 *
 *   app.post("/webhooks/razorpay", express.raw({ type: "application/json" }), razorpayWebhookHandler)
 *
 * Dashboard → Settings → Webhooks → secret
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

type RazorpayPayload = {
  payment?: { entity: { id: string; amount: number; currency: string } };
  refund?: {
    entity: { id: string; amount: number; currency: string; payment_id: string };
  };
  subscription?: { entity: { id: string; status: string; plan_id: string } };
  invoice?: { entity: { id: string; amount: number; currency: string } };
};

async function handleRazorpayEvent(event: WebhookEvent): Promise<void> {
  const payload = event.data as RazorpayPayload;

  switch (event.type) {
    case "payment.captured": {
      const payment = payload.payment?.entity;
      if (!payment) break;
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: payment.amount,
        currency: payment.currency.toLowerCase(),
        referenceId: payment.id,
      });
      break;
    }

    case "payment.failed":
      break;

    case "refund.processed": {
      const refund = payload.refund?.entity;
      if (!refund) break;
      await billing.recordTransaction({
        type: TransactionType.REFUND,
        amount: refund.amount,
        currency: refund.currency.toLowerCase(),
        referenceId: refund.id,
        metadata: { paymentId: refund.payment_id },
      });
      break;
    }

    case "subscription.activated":
    case "subscription.charged":
      await billing.recordTransaction({
        type: TransactionType.SUBSCRIPTION,
        amount: 0,
        currency: "inr",
        referenceId: payload.subscription?.entity.id ?? event.id,
        metadata: {
          status: payload.subscription?.entity.status ?? "",
          planId: payload.subscription?.entity.plan_id ?? "",
        },
      });
      break;

    case "subscription.cancelled":
    case "subscription.completed":
      break;

    case "invoice.paid": {
      const invoice = payload.invoice?.entity;
      if (!invoice) break;
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: invoice.amount,
        currency: invoice.currency.toLowerCase(),
        referenceId: invoice.id,
      });
      break;
    }

    default:
      break;
  }
}

export async function razorpayWebhookHandler(
  req: {
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
