import PDFDocument from "pdfkit";
import type { BillingKitConfig } from "../types/config";
import type { GeneratePdfInput } from "../types/pdf";

function formatAmount(amount: number, currency: string): string {
  const value = amount / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
}

export class InvoicePdfGenerator {
  constructor(private readonly config: BillingKitConfig) {}

  generateInvoicePdf(input: GeneratePdfInput): Promise<Buffer> {
    const { invoice } = input;
    const company = input.company ?? this.config.company;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      if (company) {
        doc.fontSize(18).text(company.name, { align: "left" });
        doc.fontSize(10).text(company.address);
        if (company.email) doc.text(company.email);
        if (company.phone) doc.text(company.phone);
        const sellerTax =
          company.gstin ?? company.taxId ?? company.vatNumber;
        if (sellerTax) {
          const label = company.gstin || company.taxId ? "GSTIN" : "VAT";
          doc.text(`${label}: ${sellerTax}`);
        }
        doc.moveDown();
      }

      doc.fontSize(16).text("TAX INVOICE", { align: "right" });
      doc.fontSize(10).text(`Invoice #: ${invoice.number}`, { align: "right" });
      doc.text(`Date: ${invoice.createdAt.toISOString().split("T")[0]}`, {
        align: "right",
      });
      doc.moveDown();

      doc.fontSize(12).text("Bill To:");
      doc.fontSize(10).text(invoice.customer.name);
      if (invoice.customer.email) doc.text(invoice.customer.email);
      if (invoice.customer.phone) doc.text(invoice.customer.phone);
      if (invoice.customer.gstin) doc.text(`GSTIN: ${invoice.customer.gstin}`);
      if (invoice.customer.vatNumber) {
        doc.text(`VAT: ${invoice.customer.vatNumber}`);
      }
      doc.text(invoice.billingAddress.line1);
      if (invoice.billingAddress.line2) doc.text(invoice.billingAddress.line2);
      doc.text(
        `${invoice.billingAddress.city}, ${invoice.billingAddress.state} ${invoice.billingAddress.postalCode}`,
      );
      doc.text(`Place of supply: ${invoice.billingAddress.state}`);
      doc.moveDown();

      const tableTop = doc.y;
      doc.fontSize(10).text("Description", 50, tableTop);
      doc.text("HSN/SAC", 220, tableTop);
      doc.text("Qty", 290, tableTop);
      doc.text("Unit", 330, tableTop);
      doc.text("Amount", 420, tableTop);
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      for (const item of invoice.lineItems) {
        const y = doc.y;
        const lineTotal = item.quantity * item.unitAmount;
        doc.text(item.description, 50, y, { width: 160 });
        doc.text(item.hsnOrSac ?? "—", 220, y);
        doc.text(String(item.quantity), 290, y);
        doc.text(formatAmount(item.unitAmount, invoice.currency), 330, y);
        doc.text(formatAmount(lineTotal, invoice.currency), 420, y);
        doc.moveDown(0.8);
      }

      doc.moveDown();
      doc.text(`Subtotal: ${formatAmount(invoice.subtotal, invoice.currency)}`, {
        align: "right",
      });

      if (invoice.discountTotal > 0) {
        doc.text(
          `Discount: -${formatAmount(invoice.discountTotal, invoice.currency)}`,
          { align: "right" },
        );
      }

      if (invoice.tax.cgst > 0) {
        doc.text(`CGST: ${formatAmount(invoice.tax.cgst, invoice.currency)}`, {
          align: "right",
        });
      }
      if (invoice.tax.sgst > 0) {
        doc.text(`SGST: ${formatAmount(invoice.tax.sgst, invoice.currency)}`, {
          align: "right",
        });
      }
      if (invoice.tax.igst > 0) {
        doc.text(`IGST: ${formatAmount(invoice.tax.igst, invoice.currency)}`, {
          align: "right",
        });
      }
      if (invoice.tax.vat > 0) {
        doc.text(`VAT: ${formatAmount(invoice.tax.vat, invoice.currency)}`, {
          align: "right",
        });
      }

      doc.fontSize(12).text(
        `Grand Total: ${formatAmount(invoice.total, invoice.currency)}`,
        { align: "right" },
      );

      if (invoice.notes) {
        doc.moveDown();
        doc.fontSize(10).text(`Notes: ${invoice.notes}`);
      }

      doc.end();
    });
  }
}
