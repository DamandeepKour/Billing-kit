/**
 * Express webhook example — install express separately in your app:
 *   npm install express @types/express
 */
import express from "express";
import { BillingKit } from "../src";

const app = express();

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["stripe-signature"] as string;
      const event = billing.verifyWebhook(req.body, signature);

      await billing.handleWebhook(event, {
        "invoice.paid": async () => {
          // Update your database, send receipt email, etc.
        },
        "payment_intent.payment_failed": async () => {
          // Notify customer or retry payment
        },
      });

      res.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook error";
      res.status(400).send(`Webhook Error: ${message}`);
    }
  },
);

app.listen(3000, () => {
  console.log("Webhook server listening on port 3000");
});
