import {
  CurrencyMismatchError,
  UnsupportedCurrencyError,
} from "../src/utils/errors";
import {
  assertSupportedCurrency,
  convertSmallestUnit,
  formatAmount,
  fromMinorUnits,
  isSupportedCurrency,
  normalizeCurrency,
  resolveCurrency,
  roundAmount,
  toMinorUnits,
} from "../src/utils/currency";
import {
  baseInvoiceInput,
  createInvoiceService,
  euAddress,
  gstConfig,
  indiaAddress,
  usAddress,
} from "./helpers";

describe("currency / invoice amounts", () => {
  it("generates an INR invoice from global config", async () => {
    const service = createInvoiceService(gstConfig());

    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        customer: { name: "INR Customer", gstin: "27AAAAA0000A1Z5" },
      }),
    );

    expect(invoice.currency).toBe("inr");
    expect(invoice.subtotal).toBe(99900);
    expect(invoice.tax.totalTax).toBe(17982);
    expect(invoice.total).toBe(invoice.taxableAmount + invoice.tax.totalTax);
    expect(convertSmallestUnit(invoice.total, "inr")).toBe(1178.82);
  });

  it("generates a USD invoice via currency override", async () => {
    const service = createInvoiceService(
      gstConfig({ currency: "inr", tax: { enabled: false } }),
    );

    const invoice = await service.generateInvoice({
      currency: "usd",
      customer: { name: "US Customer" },
      billingAddress: usAddress,
      lineItems: [
        { description: "Pro Plan", quantity: 1, unitAmount: 4900, currency: "usd" },
      ],
    });

    expect(invoice.currency).toBe("usd");
    expect(invoice.total).toBe(4900);
    expect(formatAmount(invoice.total, "usd")).toMatch(/\$49\.00/);
  });

  it("uses customer.defaultCurrency when invoice currency is omitted", async () => {
    const service = createInvoiceService(gstConfig({ currency: "inr" }));

    const invoice = await service.generateInvoice({
      customer: { name: "EU Customer", defaultCurrency: "eur" },
      billingAddress: euAddress,
      lineItems: [{ description: "Seat", quantity: 1, unitAmount: 2000 }],
      taxMode: "none",
    });

    expect(invoice.currency).toBe("eur");
    expect(invoice.total).toBe(2000);
  });

  it("rejects mismatched line item currency", async () => {
    const service = createInvoiceService(gstConfig({ currency: "usd" }));

    await expect(
      service.generateInvoice({
        currency: "usd",
        customer: { name: "Buyer" },
        billingAddress: indiaAddress,
        lineItems: [
          { description: "A", quantity: 1, unitAmount: 100, currency: "inr" },
        ],
      }),
    ).rejects.toThrow(CurrencyMismatchError);
  });

  it("rejects unsupported currency codes", async () => {
    const service = createInvoiceService();

    await expect(
      service.generateInvoice(
        baseInvoiceInput({
          currency: "jpy",
          lineItems: [{ description: "A", quantity: 1, unitAmount: 100 }],
        }),
      ),
    ).rejects.toThrow(UnsupportedCurrencyError);
  });

  it("normalizes currency codes case-insensitively", async () => {
    const service = createInvoiceService(
      gstConfig({ tax: { enabled: false } }),
    );

    const invoice = await service.generateInvoice(
      baseInvoiceInput({
        currency: "USD",
        billingAddress: usAddress,
        lineItems: [{ description: "A", quantity: 1, unitAmount: 1000 }],
        taxMode: "none",
      }),
    );

    expect(invoice.currency).toBe("usd");
  });
});

describe("currency / helpers", () => {
  it("converts between major and minor units", () => {
    expect(toMinorUnits(999, "inr")).toBe(99900);
    expect(fromMinorUnits(99900, "inr")).toBe(999);
    expect(convertSmallestUnit(99900, "inr")).toBe(999);
    expect(toMinorUnits(49, "usd")).toBe(4900);
    expect(toMinorUnits(0, "eur")).toBe(0);
  });

  it("rounds fractional minor units", () => {
    expect(roundAmount(10.4)).toBe(10);
    expect(roundAmount(10.5)).toBe(11);
    expect(toMinorUnits(10.005, "usd")).toBe(1001);
  });

  it("formats amounts with locale-aware currency symbols", () => {
    expect(formatAmount(4900, "usd")).toMatch(/\$49\.00/);
    expect(formatAmount(0, "gbp")).toMatch(/£0\.00|GBP/);
  });

  it("normalizes and validates supported currencies", () => {
    expect(normalizeCurrency("USD")).toBe("usd");
    expect(normalizeCurrency(undefined)).toBe("inr");
    expect(isSupportedCurrency("eur")).toBe(true);
    expect(isSupportedCurrency("jpy")).toBe(false);
    expect(assertSupportedCurrency("GBP")).toBe("gbp");
    expect(() => assertSupportedCurrency("jpy")).toThrow(UnsupportedCurrencyError);
    expect(() => assertSupportedCurrency("")).toThrow(UnsupportedCurrencyError);
  });

  it("resolves currency with override > customer > config precedence", () => {
    expect(
      resolveCurrency({
        override: "usd",
        customerDefault: "eur",
        configDefault: "inr",
      }),
    ).toBe("usd");
    expect(
      resolveCurrency({
        customerDefault: "eur",
        configDefault: "inr",
      }),
    ).toBe("eur");
    expect(resolveCurrency({ configDefault: "sgd" })).toBe("sgd");
    expect(resolveCurrency({})).toBe("inr");
  });
});
