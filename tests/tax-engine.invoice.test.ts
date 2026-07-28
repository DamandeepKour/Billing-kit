import { BillingKit } from "../src/core/BillingKit";
import { InvoiceService } from "../src/invoice";
import { InMemoryInvoiceRepository } from "../src/repositories";

describe("invoice tax engine integration", () => {
  it("MH → MH invoice uses CGST + SGST lines", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
      tax: {
        enabled: true,
        autoTax: true,
        defaultRate: 18,
        sellerState: "MH",
        sellerCountry: "IN",
      },
    });

    const invoice = await billing.generateInvoice({
      customer: { name: "Local Co", gstin: "27AAAAA0000A1Z5" },
      billingAddress: {
        line1: "1 Road",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
    });

    expect(invoice.tax.taxType).toBe("gst");
    expect(invoice.tax.cgst).toBe(900);
    expect(invoice.tax.sgst).toBe(900);
    expect(invoice.tax.igst).toBe(0);
    expect(invoice.tax.taxLines.map((l) => l.name)).toEqual(["CGST", "SGST"]);
  });

  it("MH → DL invoice uses IGST", async () => {
    const service = new InvoiceService(
      {
        provider: "stripe",
        secretKey: "sk_test_x",
        tax: {
          enabled: true,
          autoTax: true,
          defaultRate: 18,
          sellerState: "MH",
          sellerCountry: "IN",
        },
      },
      new InMemoryInvoiceRepository(),
    );

    const invoice = await service.generateInvoice({
      customer: { name: "Delhi Co", gstin: "07BBBBB0000B1Z5" },
      billingAddress: {
        line1: "CP",
        city: "New Delhi",
        state: "DL",
        postalCode: "110001",
        country: "IN",
      },
      lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
      placeOfSupply: "DL",
    });

    expect(invoice.tax.igst).toBe(1800);
    expect(invoice.tax.cgst).toBe(0);
    expect(invoice.tax.taxLines).toEqual([
      { name: "IGST", rate: 18, amount: 1800 },
    ]);
    expect(invoice.tax.placeOfSupply).toBe("DL");
  });

  it("supports VAT reverse charge for EU B2B", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "eur",
      tax: { enabled: true, autoTax: true, taxType: "vat", defaultRate: 20 },
    });

    const invoice = await billing.generateInvoice({
      taxType: "vat",
      taxRate: 20,
      country: "DE",
      customer: {
        name: "Berlin GmbH",
        vatNumber: "DE123456789",
        isBusinessCustomer: true,
        customerTaxId: "DE123456789",
      },
      billingAddress: {
        line1: "1 Str",
        city: "Berlin",
        state: "BE",
        postalCode: "10115",
        country: "DE",
      },
      lineItems: [{ description: "SaaS", quantity: 1, unitAmount: 10000 }],
    });

    expect(invoice.tax.reverseCharge).toBe(true);
    expect(invoice.tax.totalTax).toBe(0);
  });

  it("returns invoice tax summary with GST lines", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
      tax: {
        enabled: true,
        autoTax: true,
        defaultRate: 18,
        sellerState: "MH",
        sellerCountry: "IN",
      },
    });

    const invoice = await billing.generateInvoice({
      customer: {
        name: "Local Co",
        gstin: "27AAAAA0000A1Z5",
        customerTaxId: "27AAAAA0000A1Z5",
      },
      billingAddress: {
        line1: "1 Road",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
    });

    const taxSummary = await billing.getInvoiceTaxSummary(invoice.id);
    expect(taxSummary.taxType).toBe("gst");
    expect(taxSummary.cgst).toBe(900);
    expect(taxSummary.sgst).toBe(900);
    expect(taxSummary.taxLines.map((l) => l.name)).toEqual(["CGST", "SGST"]);
    expect(taxSummary.customerTaxId).toBe("27AAAAA0000A1Z5");
  });

  it("auto-detects VAT on EU invoices", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "eur",
      tax: { enabled: true, autoTax: true, sellerCountry: "DE" },
    });

    const invoice = await billing.generateInvoice({
      customer: { name: "Consumer" },
      billingAddress: {
        line1: "1 Str",
        city: "Berlin",
        state: "BE",
        postalCode: "10115",
        country: "DE",
      },
      lineItems: [{ description: "SaaS", quantity: 1, unitAmount: 10000 }],
    });

    expect(invoice.tax.taxType).toBe("vat");
    expect(invoice.tax.vat).toBe(1900);
    expect(invoice.tax.taxLines[0]?.name).toBe("VAT");
  });
});
