import {
  baseInvoiceInput,
  createInvoiceService,
  delhiAddress,
  gstConfig,
} from "./helpers";

describe("invoice / totals", () => {
  const service = createInvoiceService();

  it("computes total as taxableAmount + tax", async () => {
    const invoice = await service.generateInvoice(baseInvoiceInput());

    expect(invoice.number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.discountTotal).toBe(0);
    expect(invoice.taxableAmount).toBe(99900);
    expect(invoice.tax.totalTax).toBe(17982);
    expect(invoice.total).toBe(117882);
    expect(invoice.total).toBe(invoice.taxableAmount + invoice.tax.totalTax);
  });

  it("sums multi-line subtotals before tax", async () => {
    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        lineItems: [
          { description: "Plan", quantity: 2, unitAmount: 10000 },
          { description: "Addon", quantity: 1, unitAmount: 5000 },
        ],
      }),
    );

    expect(invoice.subtotal).toBe(25000);
    expect(invoice.taxableAmount).toBe(25000);
    expect(invoice.tax.totalTax).toBe(4500);
    expect(invoice.total).toBe(29500);
  });

  it("applies percentage discounts before tax", async () => {
    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        discounts: [{ type: "percentage", value: 10 }],
      }),
    );

    expect(invoice.discountTotal).toBe(9990);
    expect(invoice.taxableAmount).toBe(89910);
    expect(invoice.total).toBe(invoice.taxableAmount + invoice.tax.totalTax);
  });

  it("applies flat discounts before tax", async () => {
    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        lineItems: [{ description: "Plan", quantity: 1, unitAmount: 10000 }],
        discounts: [{ type: "flat", value: 1000 }],
      }),
    );

    expect(invoice.discountTotal).toBe(1000);
    expect(invoice.taxableAmount).toBe(9000);
    expect(invoice.tax.totalTax).toBe(1620);
    expect(invoice.total).toBe(10620);
  });

  it("caps flat discount at subtotal", async () => {
    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        lineItems: [{ description: "Plan", quantity: 1, unitAmount: 1000 }],
        discounts: [{ type: "flat", value: 5000 }],
      }),
    );

    expect(invoice.discountTotal).toBe(1000);
    expect(invoice.taxableAmount).toBe(0);
    expect(invoice.tax.totalTax).toBe(0);
    expect(invoice.total).toBe(0);
  });

  it("returns summary matching invoice totals", async () => {
    const invoice = await service.generateInvoice(baseInvoiceInput());
    const summary = await service.getInvoiceSummary(invoice.id);

    expect(summary).toMatchObject({
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      taxableAmount: invoice.taxableAmount,
      total: invoice.total,
      currency: invoice.currency,
    });
  });
});

describe("invoice / tax modes", () => {
  it("applies CGST+SGST for intra-state GST invoices", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        taxMode: "gst",
        lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
      }),
    );

    expect(invoice.tax.cgst).toBe(900);
    expect(invoice.tax.sgst).toBe(900);
    expect(invoice.tax.igst).toBe(0);
    expect(invoice.total).toBe(11800);
  });

  it("applies IGST for inter-state GST invoices", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        taxMode: "gst",
        sellerState: "MH",
        billingAddress: delhiAddress,
        lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
      }),
    );

    expect(invoice.tax.igst).toBe(1800);
    expect(invoice.tax.cgst).toBe(0);
    expect(invoice.tax.sgst).toBe(0);
    expect(invoice.total).toBe(11800);
  });

  it("applies VAT when taxMode is vat", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        taxMode: "vat",
        taxRate: 20,
        customer: { name: "EU Buyer", vatNumber: "DE123456789" },
        lineItems: [{ description: "Seat", quantity: 1, unitAmount: 10000 }],
      }),
    );

    expect(invoice.tax.vat).toBe(2000);
    expect(invoice.customer.vatNumber).toBe("DE123456789");
    expect(invoice.total).toBe(12000);
  });

  it("skips tax when tax is disabled and taxMode is none", async () => {
    const service = createInvoiceService(
      gstConfig({ tax: { enabled: false } }),
    );

    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        taxMode: "none",
        lineItems: [{ description: "Plan", quantity: 1, unitAmount: 5000 }],
      }),
    );

    expect(invoice.tax.taxType).toBe("none");
    expect(invoice.tax.totalTax).toBe(0);
    expect(invoice.total).toBe(5000);
  });
});

describe("invoice / edge cases", () => {
  it("handles zero-amount line items", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        lineItems: [{ description: "Free", quantity: 1, unitAmount: 0 }],
      }),
    );

    expect(invoice.subtotal).toBe(0);
    expect(invoice.tax.totalTax).toBe(0);
    expect(invoice.total).toBe(0);
  });

  it("handles empty line items as zero totals", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({ lineItems: [] }),
    );

    expect(invoice.subtotal).toBe(0);
    expect(invoice.total).toBe(0);
  });

  it("uses custom invoice number and customer GSTIN", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        invoiceNumber: "INV-2026-MH-00042",
        customer: { name: "Retailer", gstin: "27AAAAA0000A1Z5" },
      }),
    );

    expect(invoice.number).toBe("INV-2026-MH-00042");
    expect(invoice.customer.gstin).toBe("27AAAAA0000A1Z5");
  });
});
