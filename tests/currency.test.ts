import {
  BillingValidationError,
  CurrencyMismatchError,
  UnsupportedCurrencyError,
} from "../src/utils/errors";
import {
  assertLineItemCurrencies,
  assertSmallestUnitAmount,
  assertSupportedCurrency,
  convertAmount,
  convertSmallestUnit,
  formatAmount,
  fromMinorUnits,
  getMinorUnitFactor,
  isSupportedCurrency,
  listSupportedCurrencies,
  normalizeCurrency,
  resolveCurrency,
  roundAmount,
  toMinorUnits,
} from "../src/utils/currency";
import { PaymentService } from "../src/payment";
import { CustomerProfileService } from "../src/customer";
import { InMemoryCustomerProfileRepository } from "../src/repositories";
import {
  baseInvoiceInput,
  createInvoiceService,
  createMockGateway,
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
    expect(formatAmount(invoice.total, "inr")).toMatch(/1,178\.82|1178\.82/);
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
        {
          description: "Pro Plan",
          quantity: 1,
          unitAmount: 4900,
          currency: "usd",
        },
      ],
    });

    expect(invoice.currency).toBe("usd");
    expect(invoice.total).toBe(4900);
    expect(formatAmount(invoice.total, "usd")).toMatch(/\$49\.00/);
  });

  it("generates a EUR invoice via customer.defaultCurrency", async () => {
    const service = createInvoiceService(gstConfig({ currency: "inr" }));

    const invoice = await service.generateInvoice({
      customer: { name: "EU Customer", defaultCurrency: "eur" },
      billingAddress: euAddress,
      lineItems: [{ description: "Seat", quantity: 1, unitAmount: 1999 }],
      taxMode: "none",
    });

    expect(invoice.currency).toBe("eur");
    expect(invoice.total).toBe(1999);
    expect(fromMinorUnits(invoice.total, "eur")).toBe(19.99);
    expect(formatAmount(invoice.total, "eur")).toMatch(/19\.99/);
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

  it("rejects mixed line item currencies", async () => {
    const service = createInvoiceService(
      gstConfig({ currency: "usd", tax: { enabled: false } }),
    );

    await expect(
      service.generateInvoice({
        currency: "usd",
        customer: { name: "Buyer" },
        billingAddress: usAddress,
        lineItems: [
          { description: "A", quantity: 1, unitAmount: 100, currency: "usd" },
          { description: "B", quantity: 1, unitAmount: 200, currency: "eur" },
        ],
        taxMode: "none",
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

  it("rejects non-integer unit amounts", async () => {
    const service = createInvoiceService(
      gstConfig({ tax: { enabled: false } }),
    );

    await expect(
      service.generateInvoice(
        baseInvoiceInput({
          currency: "usd",
          billingAddress: usAddress,
          lineItems: [{ description: "A", quantity: 1, unitAmount: 10.5 }],
          taxMode: "none",
        }),
      ),
    ).rejects.toThrow(BillingValidationError);
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

describe("currency / payments", () => {
  it("applies per-payment currency override", async () => {
    const gateway = createMockGateway({
      createPayment: jest.fn().mockResolvedValue({
        id: "pay_usd",
        status: "captured",
        amount: 4900,
        currency: "usd",
        provider: "mock",
      }),
    });
    const payments = new PaymentService(gateway, "inr");

    await payments.createPayment({ amount: 4900, currency: "usd" });

    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4900, currency: "usd" }),
    );
  });

  it("uses customer profile defaultCurrency when payment currency omitted", async () => {
    const gateway = createMockGateway({
      createPayment: jest.fn().mockResolvedValue({
        id: "pay_eur",
        status: "captured",
        amount: 2000,
        currency: "eur",
        provider: "mock",
      }),
    });
    const profiles = new CustomerProfileService(
      new InMemoryCustomerProfileRepository(),
    );
    const profile = await profiles.createCustomerProfile({
      name: "EU Buyer",
      defaultCurrency: "eur",
      billingAddress: euAddress,
    });
    const payments = new PaymentService(gateway, "inr", undefined, profiles);

    await payments.createPayment({
      amount: 2000,
      customerProfileId: profile.id,
    });

    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "eur", amount: 2000 }),
    );
  });

  it("rejects invalid payment currency", async () => {
    const payments = new PaymentService(createMockGateway(), "usd");

    await expect(
      payments.createPayment({ amount: 100, currency: "jpy" }),
    ).rejects.toThrow(UnsupportedCurrencyError);
  });

  it("rejects fractional payment amounts", async () => {
    const payments = new PaymentService(createMockGateway(), "usd");

    await expect(
      payments.createPayment({ amount: 10.25, currency: "usd" }),
    ).rejects.toThrow(BillingValidationError);
  });
});

describe("currency / helpers", () => {
  it("converts between major and minor units for INR, USD, EUR", () => {
    expect(toMinorUnits(999, "inr")).toBe(99900);
    expect(fromMinorUnits(99900, "inr")).toBe(999);
    expect(convertSmallestUnit(99900, "inr")).toBe(999);
    expect(toMinorUnits(49, "usd")).toBe(4900);
    expect(toMinorUnits(19.99, "eur")).toBe(1999);
    expect(getMinorUnitFactor("usd")).toBe(100);
    expect(toMinorUnits(0, "eur")).toBe(0);
  });

  it("converts amounts with an explicit FX rate", () => {
    // 10000 INR paise (= ₹100) at 0.012 USD per INR → $1.20 → 120 cents
    expect(
      convertAmount({
        amount: 10000,
        from: "inr",
        to: "usd",
        rate: 0.012,
      }),
    ).toBe(120);
  });

  it("rejects a non-positive or non-finite FX rate", () => {
    expect(() =>
      convertAmount({ amount: 1000, from: "usd", to: "eur", rate: 0 }),
    ).toThrow(BillingValidationError);
    expect(() =>
      convertAmount({ amount: 1000, from: "usd", to: "eur", rate: -0.5 }),
    ).toThrow(BillingValidationError);
    expect(() =>
      convertAmount({
        amount: 1000,
        from: "usd",
        to: "eur",
        rate: Number.NaN,
      }),
    ).toThrow(BillingValidationError);
    expect(() =>
      convertAmount({
        amount: 1000,
        from: "usd",
        to: "eur",
        rate: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(BillingValidationError);
  });

  it("converts a major-unit amount when amountInMinorUnits is false", () => {
    // 49 USD major units (not 4900 minor units) at parity → 49 EUR major → 4900 cents
    expect(
      convertAmount({
        amount: 49,
        from: "usd",
        to: "eur",
        rate: 1,
        amountInMinorUnits: false,
      }),
    ).toBe(4900);
  });

  it("rounds fractional minor units", () => {
    expect(roundAmount(10.4)).toBe(10);
    expect(roundAmount(10.5)).toBe(11);
    expect(toMinorUnits(10.005, "usd")).toBe(1001);
  });

  it("formats amounts with locale-aware currency symbols", () => {
    expect(formatAmount(4900, "usd")).toMatch(/\$49\.00/);
    expect(formatAmount(1999, "eur")).toMatch(/19\.99/);
    expect(formatAmount(0, "gbp")).toMatch(/£0\.00|GBP/);
  });

  it("normalizes and validates supported currencies", () => {
    expect(normalizeCurrency("USD")).toBe("usd");
    expect(normalizeCurrency(undefined)).toBe("inr");
    expect(isSupportedCurrency("eur")).toBe(true);
    expect(isSupportedCurrency("jpy")).toBe(false);
    expect(assertSupportedCurrency("GBP")).toBe("gbp");
    expect(listSupportedCurrencies()).toEqual([
      "inr",
      "usd",
      "eur",
      "gbp",
      "aed",
      "sgd",
    ]);
    expect(() => assertSupportedCurrency("jpy")).toThrow(
      UnsupportedCurrencyError,
    );
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

  it("assertLineItemCurrencies and assertSmallestUnitAmount", () => {
    expect(() =>
      assertLineItemCurrencies(
        [{ currency: "usd" }, { currency: "eur" }],
        "usd",
      ),
    ).toThrow(CurrencyMismatchError);

    expect(assertSmallestUnitAmount(100, { currency: "usd" })).toBe(100);
    expect(() => assertSmallestUnitAmount(-1)).toThrow(BillingValidationError);
    expect(() => assertSmallestUnitAmount(1.5)).toThrow(BillingValidationError);
    expect(() => assertSmallestUnitAmount(Number.POSITIVE_INFINITY)).toThrow(
      BillingValidationError,
    );
  });

  it("assertLineItemCurrencies rejects an unsupported line-item currency", () => {
    expect(() =>
      assertLineItemCurrencies([{ currency: "jpy" }], "usd"),
    ).toThrow(UnsupportedCurrencyError);
  });

  it("assertLineItemCurrencies passes when every declared currency matches the invoice currency", () => {
    expect(() =>
      assertLineItemCurrencies(
        [{ currency: "usd" }, { description: "no currency declared" }, { currency: "usd" }],
        "usd",
      ),
    ).not.toThrow();
  });
});
