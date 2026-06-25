import { InvoiceService } from "../src/invoice";
import type { BillingKitConfig } from "../src/types/config";

const config: BillingKitConfig = {
  provider: "stripe",
  secretKey: "sk_test_x",
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
};

describe("InvoiceService", () => {
  const service = new InvoiceService(config);

  const baseInput = {
    customer: { name: "John Doe", email: "john@example.com" },
    billingAddress: {
      line1: "123 Street",
      city: "Mumbai",
      state: "MH",
      postalCode: "400001",
      country: "IN",
    },
    lineItems: [{ description: "Pro Plan", quantity: 1, unitAmount: 99900 }],
  };

  it("generates invoice with tax", () => {
    const invoice = service.generateInvoice(baseInput);

    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.tax.totalTax).toBeGreaterThan(0);
    expect(invoice.total).toBeGreaterThan(invoice.subtotal);
  });

  it("returns invoice summary", () => {
    const invoice = service.generateInvoice(baseInput);
    const summary = service.getInvoiceSummary(invoice.id);

    expect(summary.total).toBe(invoice.total);
    expect(summary.currency).toBe("inr");
  });

  it("applies discounts", () => {
    const invoice = service.generateInvoice({
      ...baseInput,
      discounts: [{ type: "percentage", value: 10 }],
    });

    expect(invoice.discountTotal).toBe(9990);
  });
});
