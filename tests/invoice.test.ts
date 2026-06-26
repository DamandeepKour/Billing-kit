import { InvoiceService } from "../src/invoice";
import { InMemoryInvoiceRepository } from "../src/repositories";
import type { BillingKitConfig } from "../src/types/config";

const config: BillingKitConfig = {
  provider: "stripe",
  secretKey: "sk_test_x",
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
};

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

describe("InvoiceService", () => {
  const service = new InvoiceService(config, new InMemoryInvoiceRepository());

  it("generates invoice with tax", async () => {
    const invoice = await service.generateInvoice(baseInput);

    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.tax.totalTax).toBeGreaterThan(0);
  });

  it("returns invoice summary", async () => {
    const invoice = await service.generateInvoice(baseInput);
    const summary = await service.getInvoiceSummary(invoice.id);

    expect(summary.total).toBe(invoice.total);
  });

  it("applies discounts", async () => {
    const invoice = await service.generateInvoice({
      ...baseInput,
      discounts: [{ type: "percentage", value: 10 }],
    });

    expect(invoice.discountTotal).toBe(9990);
  });
});
