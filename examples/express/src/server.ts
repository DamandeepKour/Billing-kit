import express from "express";
import {
  createRawBodyMiddleware,
  EXPRESS_WEBHOOK_RAW_BODY,
} from "billing-kit";
import { billing } from "./billing";
import { invoicesRouter } from "./routes/invoices";
import { paymentsRouter } from "./routes/payments";
import { refundsRouter } from "./routes/refunds";
import { handleBillingWebhookEvent } from "./routes/webhooks";

const app = express();
const port = Number(process.env.PORT ?? 3000);

/**
 * Webhooks FIRST — raw body only.
 * Never put express.json() ahead of these routes.
 */
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    await handleBillingWebhookEvent(event);
  }),
);

// Equivalent: express.raw(EXPRESS_WEBHOOK_RAW_BODY) + processWebhookFromHttp
app.post(
  "/webhooks/razorpay",
  express.raw(EXPRESS_WEBHOOK_RAW_BODY),
  async (req, res) => {
    try {
      const result = await billing.processWebhookFromHttp(
        req,
        async (event) => {
          await handleBillingWebhookEvent(event);
        },
      );
      if (result.duplicate) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook error";
      res.status(400).json({ error: message });
    }
  },
);

// JSON body parser for application routes (after webhooks)
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json(billing.healthCheck());
});

app.use("/payments", paymentsRouter);
app.use("/invoices", invoicesRouter);
app.use("/refunds", refundsRouter);

app.listen(port, () => {
  console.log(`billing-kit Express example listening on :${port}`);
  console.log(billing.runDiagnostics().recommendations.slice(0, 3));
});
