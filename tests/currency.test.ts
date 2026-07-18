import { InvoiceService } from "../src/invoice";
import { InMemoryInvoiceRepository } from "../src/repositories";
import type { BillingKitConfig } from "../src/types/config";
import {
  CurrencyMismatchError,
  UnsupportedCurrencyError,
} from "../src/utils/errors";
import {
  convertSmallestUnit,
  formatAmount,
  toMinorUnits,
} from "../src/utils/currency";

const baseAddress = {
  line1: "123 Street",
  city: "Mumbai",
  state: "MH",
  postalCode: "400001",
  country: "IN",
};

describe("multi-currency invoices", () => {
  it("generates an INR invoice from global config", async () => {
    const config: BillingKitConfig = {
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
      tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
    };
    const service = new InvoiceService(config, new InMemoryInvoiceRepository());

    const invoice = await service.generateInvoice({
      customer: { name: "INR Customer", gstin: "27AAAAA0000A1Z5" },
      billingAddress: baseAddress,
      lineItems: [{ description: "Plan", quantity: 1, unitAmount: 99900 }],
    });

    expect(invoice.currency).toBe("inr");
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.tax.totalTax).toBe(17982);
    expect(convertSmallestUnit(invoice.total, "inr")).toBe(1178.82);
  });

  it("generates a USD invoice via invoice.currency override", async () => {
    const config: BillingKitConfig = {
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
      tax: { enabled: false },
    };
    const service = new InvoiceService(config, new InMemoryInvoiceRepository());

    const invoice = await service.generateInvoice({
      currency: "usd",
      customer: { name: "US Customer" },
      billingAddress: {
        line1: "1 Market St",
        city: "San Francisco",
        state: "CA",
        postalCode: "94105",
        country: "US",
      },
      lineItems: [
        { description: "Pro Plan", quantity: 1, unitAmount: 4900, currency: "usd" },
      ],
    });

    expect(invoice.currency).toBe("usd");
    expect(invoice.total).toBe(4900);
    expect(formatAmount(invoice.total, "usd")).toMatch(/\$49\.00/);
  });

  it("uses customer.defaultCurrency when invoice currency is omitted", async () => {
    const config: BillingKitConfig = {
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
    };
    const service = new InvoiceService(config, new InMemoryInvoiceRepository());

    const invoice = await service.generateInvoice({
      customer: { name: "EU Customer", defaultCurrency: "eur" },
      billingAddress: {
        line1: "1 Rue",
        city: "Paris",
        state: "IDF",
        postalCode: "75001",
        country: "FR",
      },
      lineItems: [{ description: "Seat", quantity: 1, unitAmount: 2000 }],
      taxMode: "none",
    });

    expect(invoice.currency).toBe("eur");
  });

  it("rejects mismatched line item currency", async () => {
    const config: BillingKitConfig = {
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "usd",
    };
    const service = new InvoiceService(config, new InMemoryInvoiceRepository());

    await expect(
      service.generateInvoice({
        currency: "usd",
        customer: { name: "Buyer" },
        billingAddress: baseAddress,
        lineItems: [
          { description: "A", quantity: 1, unitAmount: 100, currency: "inr" },
        ],
      }),
    ).rejects.toThrow(CurrencyMismatchError);
  });

  it("rejects unsupported currency codes", async () => {
    const config: BillingKitConfig = {
      provider: "stripe",
      secretKey: "sk_test_x",
      currency: "inr",
    };
    const service = new InvoiceService(config, new InMemoryInvoiceRepository());

    await expect(
      service.generateInvoice({
        currency: "jpy",
        customer: { name: "Buyer" },
        billingAddress: baseAddress,
        lineItems: [{ description: "A", quantity: 1, unitAmount: 100 }],
      }),
    ).rejects.toThrow(UnsupportedCurrencyError);
  });
});

describe("currency helpers", () => {
  it("converts and formats amounts", () => {
    expect(toMinorUnits(999, "inr")).toBe(99900);
    expect(convertSmallestUnit(99900, "inr")).toBe(999);
    expect(toMinorUnits(49, "usd")).toBe(4900);
    expect(formatAmount(4900, "usd")).toMatch(/\$49\.00/);
  });
});
