import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { BillingKitError } from "billing-kit";
import { billing } from "../billing";

export const refundsRouter: Router = createRouter();

refundsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { paymentId, amount, reason, idempotencyKey, metadata } = req.body ?? {};
    if (typeof paymentId !== "string" || paymentId.length === 0) {
      res.status(400).json({ error: "paymentId is required" });
      return;
    }

    const refund = await billing.refundPayment({
      paymentId,
      amount,
      reason,
      idempotencyKey,
      metadata,
    });

    res.status(201).json(refund);
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
