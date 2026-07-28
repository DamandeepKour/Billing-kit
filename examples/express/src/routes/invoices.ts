import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import { BillingKitError } from "billing-kit";
import { billing } from "../billing";

export const invoicesRouter: Router = createRouter();

invoicesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { customer, billingAddress, lineItems, notes } = req.body ?? {};
    if (!customer?.name || !Array.isArray(lineItems) || lineItems.length === 0) {
      res.status(400).json({
        error: "customer.name and lineItems[] are required",
      });
      return;
    }

    const invoice = await billing.generateInvoice({
      customer,
      billingAddress,
      lineItems,
      notes,
    });

    res.status(201).json(invoice);
  } catch (error) {
    sendBillingError(res, error);
  }
});

invoicesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const invoice = await billing.getInvoice(req.params.id);
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    res.json(invoice);
  } catch (error) {
    sendBillingError(res, error);
  }
});

invoicesRouter.get("/:id/pdf", async (req: Request, res: Response) => {
  try {
    const invoice = await billing.getInvoice(req.params.id);
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found" });
      return;
    }
    const pdf = await billing.generateInvoicePdf({ invoice });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoice.number ?? invoice.id}.pdf"`,
    );
    res.send(pdf);
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
