import { BillingKit } from "../src/core/BillingKit";
import { InvoicePdfGenerator } from "../src/pdf";

const config = {
  provider: "stripe" as const,
  secretKey: "sk_test_x",
  currency: "inr",
  company: {
    name: "Acme Corp",
    address: "123 Business Park, Mumbai",
    taxId: "GSTIN123",
  },
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
};

describe("BillingKit", () => {
  const billing = new BillingKit(config);

  it("exposes calculateGST", () => {
    const tax = billing.calculateGST({
      amount: 10000,
      sellerState: "MH",
      buyerState: "MH",
    });

    expect(tax.totalTax).toBe(1800);
  });

  it("generates invoice end-to-end", () => {
    const invoice = billing.generateInvoice({
      customer: { name: "Jane" },
      billingAddress: {
        line1: "A",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Item", quantity: 1, unitAmount: 10000 }],
    });

    expect(billing.getInvoiceSummary(invoice.id).total).toBe(invoice.total);
  });
});

describe("InvoicePdfGenerator", () => {
  it("generates a PDF buffer", async () => {
    const billing = new BillingKit(config);
    const invoice = billing.generateInvoice({
      customer: { name: "Jane" },
      billingAddress: {
        line1: "A",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Item", quantity: 1, unitAmount: 10000 }],
    });

    const generator = new InvoicePdfGenerator(config);
    const pdf = await generator.generateInvoicePdf({ invoice });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
