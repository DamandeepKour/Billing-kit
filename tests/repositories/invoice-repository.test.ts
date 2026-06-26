import { InMemoryInvoiceRepository } from "../../src/repositories";
import type { Invoice } from "../../src/types/invoice";

describe("InMemoryInvoiceRepository", () => {
  const repository = new InMemoryInvoiceRepository();

  const sampleInvoice: Invoice = {
    id: "inv_test",
    number: "INV-2026-00001",
    status: "draft",
    customer: { name: "Jane" },
    billingAddress: {
      line1: "1 Main St",
      city: "Mumbai",
      state: "MH",
      postalCode: "400001",
      country: "IN",
    },
    lineItems: [{ description: "Item", quantity: 1, unitAmount: 1000 }],
    discounts: [],
    subtotal: 1000,
    discountTotal: 0,
    taxableAmount: 1000,
    tax: {
      taxableAmount: 1000,
      cgst: 90,
      sgst: 90,
      igst: 0,
      vat: 0,
      totalTax: 180,
      total: 1180,
    },
    total: 1180,
    currency: "inr",
    createdAt: new Date(),
  };

  it("saves and finds invoice by id", async () => {
    await repository.save(sampleInvoice);
    const found = await repository.findById("inv_test");

    expect(found).toEqual(sampleInvoice);
  });

  it("returns null for unknown id", async () => {
    expect(await repository.findById("missing")).toBeNull();
  });
});
