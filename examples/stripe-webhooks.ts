/**
 * Stripe webhook example.
 *
 * Mount this route with a raw body parser (required for signature verification):
 *   app.post("/webhooks/stripe", express.raw({ type: "application/json" }), handler)
 *
 * Dashboard: Developers → Webhooks → add endpoint → copy signing secret (whsec_...)
 * Docs: https://docs.stripe.com/webhooks
 */
import {
  BillingKit,
  TransactionType,
  type WebhookEvent,
} from "../src";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

type StripeObject = {
  id: string;
  object?: string;
  status?: string;
  amount?: number;
  currency?: string;
  customer?: string;
  subscription?: string;
};

async function handleStripeEvent(event: WebhookEvent): Promise<void> {
  const data = event.data as StripeObject;

  switch (event.type) {
    // Payments
    case "payment_intent.succeeded":
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
        metadata: { customerId: data.customer ?? "" },
      });
      break;

    case "payment_intent.payment_failed":
      // Mark order failed / notify customer
      break;

    // Invoices (billing)
    case "invoice.paid":
      await billing.recordTransaction({
        type: TransactionType.PAYMENT,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
        metadata: { subscriptionId: data.subscription ?? "" },
      });
      break;

    case "invoice.payment_failed":
      // Start dunning / email customer
      break;

    // Subscriptions
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Sync subscription status into your DB
      break;

    case "customer.subscription.deleted":
      // Revoke access at period end
      break;

    // Refunds / disputes
    case "charge.refunded":
      await billing.recordTransaction({
        type: TransactionType.REFUND,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
      });
      break;

    case "charge.dispute.created":
      await billing.recordTransaction({
        type: TransactionType.CHARGEBACK,
        amount: data.amount ?? 0,
        currency: data.currency ?? "inr",
        referenceId: data.id,
      });
      break;

    default:
      // Unhandled event — safe to ignore
      break;
  }
}

/** Express-style handler (raw body + Stripe-Signature header). */
export async function stripeWebhookHandler(
  req: { body: Buffer; headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { send: (body: string) => void; json: (body: unknown) => void } },
): Promise<void> {
  const signature = req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    res.status(400).send("Missing Stripe-Signature header");
    return;
  }

  try {
    const event = billing.verifyWebhook(req.body, signature);
    await handleStripeEvent(event);
    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    res.status(400).send(message);
  }
}

/**
 * Express wiring:
 *
 * import express from "express";
 * import { stripeWebhookHandler } from "./stripe-webhooks";
 *
 * const app = express();
 * app.post("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler);
 */
