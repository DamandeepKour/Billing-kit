import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { BillingKitError } from "billing-kit";
import { billing } from "../billing";

export const paymentsRouter: Router = createRouter();

paymentsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { amount, currency, customerId, description, metadata } = req.body ?? {};
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "amount (positive integer, smallest units) is required" });
      return;
    }

    const payment = await billing.createPayment({
      amount,
      currency,
      customerId: customerId ?? process.env.STRIPE_CUSTOMER_ID,
      description,
      metadata,
    });

    res.status(201).json(payment);
  } catch (error) {
    sendBillingError(res, error);
  }
});

paymentsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const status = await billing.getPaymentStatus(req.params.id);
    res.json(status);
  } catch (error) {
    sendBillingError(res, error);
  }
});

function sendBillingError(res: Response, error: unknown): void {
  if (error instanceof BillingKitError) {
    res.status(400).json({ code: error.code, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({ error: message });
}
