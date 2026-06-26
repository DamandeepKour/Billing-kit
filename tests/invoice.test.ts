import type { InvoiceRepository } from "../src/interfaces/InvoiceRepository";
import { InvoiceService } from "../src/invoice";
import { InMemoryInvoiceRepository } from "../src/repositories";
import type { BillingKitConfig } from "../src/types/config";
import type { Invoice } from "../src/types/invoice";

/** Example: consumer implements their own repository (e.g. backed by Postgres). */
class CustomInvoiceRepository implements InvoiceRepository {
  private readonly store = new Map<string, Invoice>();

  async save(invoice: Invoice): Promise<Invoice> {
    this.store.set(invoice.id, { ...invoice, notes: "persisted-by-custom-repo" });
    return this.store.get(invoice.id)!;
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.store.get(id) ?? null;
  }
}

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

describe("InvoiceService with custom repository", () => {
  it("uses injected repository for persistence", async () => {
    const customRepo = new CustomInvoiceRepository();
    const service = new InvoiceService(config, customRepo);

    const invoice = await service.generateInvoice(baseInput);
    const stored = await customRepo.findById(invoice.id);

    expect(stored?.notes).toBe("persisted-by-custom-repo");
    expect((await service.getInvoiceSummary(invoice.id)).total).toBe(invoice.total);
  });
});

describe("InvoiceService with in-memory repository", () => {
  const service = new InvoiceService(config, new InMemoryInvoiceRepository());

  it("generates invoice with tax", async () => {
    const invoice = await service.generateInvoice(baseInput);

    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.tax.totalTax).toBeGreaterThan(0);
    expect(invoice.total).toBeGreaterThan(invoice.subtotal);
  });

  it("returns invoice summary", async () => {
    const invoice = await service.generateInvoice(baseInput);
    const summary = await service.getInvoiceSummary(invoice.id);

    expect(summary.total).toBe(invoice.total);
    expect(summary.currency).toBe("inr");
  });

  it("applies discounts", async () => {
    const invoice = await service.generateInvoice({
      ...baseInput,
      discounts: [{ type: "percentage", value: 10 }],
    });

    expect(invoice.discountTotal).toBe(9990);
  });
});
