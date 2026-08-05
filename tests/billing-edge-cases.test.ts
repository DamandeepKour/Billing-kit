import {
  calculateGST,
  calculateVAT,
  calculateSalesTax,
  TaxEngine,
} from "../src/tax";
import { BillingKit } from "../src/core/BillingKit";
import { PaymentService } from "../src/payment";
import { RefundService } from "../src/refund";
import { SubscriptionService } from "../src/subscription";
import {
  assertSmallestUnitAmount,
  convertAmount,
  formatAmount,
  fromMinorUnits,
  toMinorUnits,
} from "../src/utils/currency";
import {
  BillingValidationError,
  InvalidConfigError,
} from "../src/utils/errors";
import { validateTaxConfig } from "../src/utils/validate-config";
import {
  baseInvoiceInput,
  createInvoiceService,
  createMockGateway,
  delhiAddress,
  euAddress,
  gstConfig,
  usAddress,
} from "./helpers";

describe("edge cases / GST intra-state vs inter-state", () => {
  it.each([
    ["KA", "KA", 12, "intra", 600, 600, 0],
    ["TN", "TN", 28, "intra", 1400, 1400, 0],
    ["GJ", "GJ", 18, "intra", 900, 900, 0],
    ["MH", "KA", 12, "inter", 0, 0, 1200],
    ["KA", "TN", 28, "inter", 0, 0, 2800],
    ["DL", "MH", 5, "inter", 0, 0, 500],
  ] as const)(
    "%s → %s at %s%% is %s-state",
    (seller, buyer, rate, _mode, cgst, sgst, igst) => {
      const result = calculateGST({
        amount: 10000,
        rate,
        sellerState: seller,
        buyerState: buyer,
      });

      expect(result.cgst).toBe(cgst);
      expect(result.sgst).toBe(sgst);
      expect(result.igst).toBe(igst);
      expect(result.totalTax).toBe(cgst + sgst + igst);
      expect(result.total).toBe(10000 + result.totalTax);
      expect(result.placeOfSupply).toBe(buyer);
    },
  );

  it("trims whitespace on state codes when comparing place of supply", () => {
    const result = calculateGST({
      amount: 10000,
      rate: 18,
      sellerState: " MH ",
      buyerState: "mh",
    });

    expect(result.cgst).toBe(900);
    expect(result.sgst).toBe(900);
    expect(result.igst).toBe(0);
  });

  it("rejects non-finite GST amounts and rates", () => {
    expect(() =>
      calculateGST({
        amount: Number.NaN,
        rate: 18,
        sellerState: "MH",
        buyerState: "MH",
      }),
    ).toThrow(/amount must be a non-negative/);

    expect(() =>
      calculateGST({
        amount: 1000,
        rate: Number.POSITIVE_INFINITY,
        sellerState: "MH",
        buyerState: "MH",
      }),
    ).toThrow(/rate must be a non-negative/);
  });
});

describe("edge cases / VAT and generic tax rules", () => {
  const engine = new TaxEngine();

  it("uses country default VAT rates when rate is omitted", () => {
    expect(calculateVAT({ amount: 10000, country: "FR" }).vat).toBe(2000);
    expect(calculateVAT({ amount: 10000, country: "IE" }).vat).toBe(2300);
    expect(calculateVAT({ amount: 10000, country: "NL" }).vat).toBe(2100);
  });

  it("honors explicit zero VAT rate", () => {
    const result = calculateVAT({ amount: 10000, rate: 0, country: "DE" });

    expect(result.vat).toBe(0);
    expect(result.total).toBe(10000);
    expect(result.taxLines).toEqual([]);
  });

  it("rejects negative VAT rate", () => {
    expect(() => calculateVAT({ amount: 1000, rate: -1, country: "DE" })).toThrow(
      /rate must be a non-negative/,
    );
  });

  it("applies generic sales tax with zero amount and unknown region", () => {
    expect(
      calculateSalesTax({ amount: 0, state: "CA", country: "US" }).totalTax,
    ).toBe(0);
    expect(
      calculateSalesTax({ amount: 10000, state: "", country: "US" }).salesTax,
    ).toBe(0);
  });

  it("rejects negative sales tax inputs", () => {
    expect(() =>
      calculateSalesTax({ amount: -1, state: "CA", country: "US" }),
    ).toThrow(/amount must be a non-negative/);
    expect(() =>
      calculateSalesTax({ amount: 1000, state: "CA", rate: -2, country: "US" }),
    ).toThrow(/rate must be a non-negative/);
  });

  it("routes TaxEngine by explicit taxType over auto detection", () => {
    const vatOnUsAddress = engine.calculate({
      amount: 10000,
      taxType: "vat",
      rate: 10,
      country: "US",
      state: "CA",
    });
    expect(vatOnUsAddress.taxType).toBe("vat");
    expect(vatOnUsAddress.vat).toBe(1000);

    const salesOnIndia = engine.calculate({
      amount: 10000,
      taxType: "sales_tax",
      rate: 8,
      country: "IN",
      state: "MH",
    });
    expect(salesOnIndia.taxType).toBe("sales_tax");
    expect(salesOnIndia.salesTax).toBe(800);
  });

  it("applies GST via TaxEngine when taxType is gst", () => {
    const result = engine.calculate({
      amount: 5000,
      taxType: "gst",
      rate: 18,
      sellerState: "MH",
      buyerState: "DL",
      country: "IN",
    });

    expect(result.igst).toBe(900);
    expect(result.cgst).toBe(0);
    expect(result.total).toBe(5900);
  });
});

describe("edge cases / multi-currency", () => {
  it("builds invoices in GBP, AED, and SGD without tax", async () => {
    const service = createInvoiceService(
      gstConfig({ tax: { enabled: false } }),
    );

    for (const [currency, unitAmount] of [
      ["gbp", 2500],
      ["aed", 9900],
      ["sgd", 1500],
    ] as const) {
      const invoice = await service.generateInvoice(
        baseInvoiceInput({
          currency,
          billingAddress: { ...euAddress, country: "GB" },
          lineItems: [{ description: "Seat", quantity: 1, unitAmount }],
          taxMode: "none",
        }),
      );

      expect(invoice.currency).toBe(currency);
      expect(invoice.total).toBe(unitAmount);
      expect(fromMinorUnits(invoice.total, currency)).toBe(unitAmount / 100);
      expect(formatAmount(invoice.total, currency).length).toBeGreaterThan(0);
    }
  });

  it("convertAmount is identity for same currency and zero for zero amount", () => {
    expect(
      convertAmount({ amount: 5000, from: "usd", to: "usd", rate: 1 }),
    ).toBe(5000);
    expect(
      convertAmount({ amount: 0, from: "inr", to: "usd", rate: 0.012 }),
    ).toBe(0);
  });

  it("rejects negative FX conversion amounts", () => {
    expect(() =>
      convertAmount({ amount: -100, from: "usd", to: "eur", rate: 0.9 }),
    ).toThrow(BillingValidationError);
  });

  it("rejects negative and non-finite smallest-unit amounts", () => {
    expect(() => assertSmallestUnitAmount(-5, { param: "amount" })).toThrow(
      BillingValidationError,
    );
    expect(() => assertSmallestUnitAmount(Number.NaN)).toThrow(
      BillingValidationError,
    );
    expect(toMinorUnits(0, "usd")).toBe(0);
  });
});

describe("edge cases / invoice totals", () => {
  it("stacks percentage then flat discounts before tax", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        lineItems: [{ description: "Plan", quantity: 1, unitAmount: 10000 }],
        discounts: [
          { type: "percentage", value: 10 },
          { type: "flat", value: 500 },
        ],
      }),
    );

    // 10000 - 10% = 9000, then -500 = 8500 taxable @ 18%
    expect(invoice.subtotal).toBe(10000);
    expect(invoice.discountTotal).toBe(1500);
    expect(invoice.taxableAmount).toBe(8500);
    expect(invoice.tax.totalTax).toBe(1530);
    expect(invoice.total).toBe(10030);
  });

  it("multiplies quantity into subtotal and tax base", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        lineItems: [{ description: "Seat", quantity: 3, unitAmount: 2000 }],
      }),
    );

    expect(invoice.subtotal).toBe(6000);
    expect(invoice.tax.cgst).toBe(540);
    expect(invoice.tax.sgst).toBe(540);
    expect(invoice.total).toBe(7080);
  });

  it("applies sales_tax mode for US invoices", async () => {
    const invoice = await createInvoiceService(
      gstConfig({
        currency: "usd",
        tax: {
          enabled: true,
          taxType: "sales_tax",
          defaultRate: 8,
          sellerCountry: "US",
        },
      }),
    ).generateInvoice(
      baseInvoiceInput({
        currency: "usd",
        billingAddress: usAddress,
        taxMode: "sales_tax",
        taxRate: 8,
        lineItems: [{ description: "Seat", quantity: 1, unitAmount: 10000 }],
      }),
    );

    expect(invoice.tax.taxType).toBe("sales_tax");
    expect(invoice.tax.salesTax).toBe(800);
    expect(invoice.total).toBe(10800);
  });

  it("rejects negative unitAmount and non-positive quantity", async () => {
    const service = createInvoiceService(gstConfig({ tax: { enabled: false } }));

    await expect(
      service.generateInvoice(
        baseInvoiceInput({
          lineItems: [{ description: "Bad", quantity: 1, unitAmount: -100 }],
          taxMode: "none",
        }),
      ),
    ).rejects.toThrow(BillingValidationError);

    await expect(
      service.generateInvoice(
        baseInvoiceInput({
          lineItems: [{ description: "Bad", quantity: 0, unitAmount: 100 }],
          taxMode: "none",
        }),
      ),
    ).rejects.toMatchObject({
      name: "BillingValidationError",
      param: "lineItems[0].quantity",
    });

    await expect(
      service.generateInvoice(
        baseInvoiceInput({
          lineItems: [{ description: "Bad", quantity: -2, unitAmount: 100 }],
          taxMode: "none",
        }),
      ),
    ).rejects.toThrow(/quantity must be a positive integer/);
  });

  it("keeps inter-state GST invoice totals consistent with tax lines", async () => {
    const invoice = await createInvoiceService().generateInvoice(
      baseInvoiceInput({
        taxMode: "gst",
        sellerState: "MH",
        billingAddress: delhiAddress,
        lineItems: [
          { description: "A", quantity: 2, unitAmount: 1500 },
          { description: "B", quantity: 1, unitAmount: 2000 },
        ],
      }),
    );

    expect(invoice.subtotal).toBe(5000);
    expect(invoice.tax.igst).toBe(900);
    expect(invoice.tax.taxLines).toEqual([
      { name: "IGST", rate: 18, amount: 900 },
    ]);
    expect(invoice.total).toBe(invoice.taxableAmount + invoice.tax.totalTax);
  });
});

describe("edge cases / refund flows", () => {
  it("rejects non-integer negative refunds and never calls the gateway", async () => {
    const refundPayment = jest.fn();

    await expect(
      new RefundService(createMockGateway({ refundPayment })).refundPayment({
        paymentId: "pay_1",
        amount: -0.01,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REFUND_AMOUNT",
      param: "amount",
    });

    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("forwards metadata on successful refunds", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_meta",
      paymentId: "pay_1",
      amount: 100,
      status: "succeeded",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway({ refundPayment }),
    ).refundPayment({
      paymentId: "pay_1",
      amount: 100,
      metadata: { ticket: "T-1" },
    });

    expect(result.metadata).toEqual({ ticket: "T-1" });
  });
});

describe("edge cases / subscription flows", () => {
  it("creates a zero-amount free plan and subscription", async () => {
    const gateway = createMockGateway({
      createPlan: jest.fn().mockResolvedValue({
        id: "plan_free",
        name: "Free",
        amount: 0,
        currency: "inr",
        interval: "monthly",
        provider: "mock",
      }),
      createSubscription: jest.fn().mockResolvedValue({
        id: "sub_free",
        customerId: "cus_1",
        planId: "plan_free",
        status: "active",
        currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        provider: "mock",
      }),
    });
    const service = new SubscriptionService(gateway);

    const plan = await service.createPlan({
      name: "Free",
      amount: 0,
      interval: "monthly",
    });
    const subscription = await service.createSubscription({
      customerId: "cus_1",
      planId: plan.id,
      planAmount: 0,
    });

    expect(plan.amount).toBe(0);
    expect(subscription.id).toBe("sub_free");
    expect(gateway.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0 }),
    );
  });

  it("pauses and resumes via gateway", async () => {
    const paused = {
      id: "sub_1",
      customerId: "cus_1",
      planId: "plan_1",
      status: "paused" as const,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      provider: "mock",
    };
    const gateway = createMockGateway({
      pauseSubscription: jest.fn().mockResolvedValue(paused),
      resumeSubscription: jest.fn().mockResolvedValue({
        ...paused,
        status: "active",
      }),
    });
    const service = new SubscriptionService(gateway);

    expect(
      await service.pauseSubscription({ subscriptionId: "sub_1" }),
    ).toMatchObject({ status: "paused" });
    expect(
      await service.resumeSubscription("sub_1"),
    ).toMatchObject({ status: "active" });
  });

  it("updates and cancels plans through the gateway", async () => {
    const gateway = createMockGateway({
      updatePlan: jest.fn().mockResolvedValue({
        id: "plan_1",
        name: "Pro+",
        amount: 99900,
        currency: "inr",
        interval: "monthly",
        provider: "mock",
      }),
      cancelPlan: jest.fn().mockResolvedValue({
        id: "plan_1",
        name: "Pro",
        amount: 99900,
        currency: "inr",
        interval: "monthly",
        provider: "mock",
      }),
    });
    const service = new SubscriptionService(gateway);

    const updated = await service.updatePlan({
      planId: "plan_1",
      name: "Pro+",
    });
    expect(updated.name).toBe("Pro+");
    expect(gateway.updatePlan).toHaveBeenCalledWith({
      planId: "plan_1",
      name: "Pro+",
    });

    await service.cancelPlan("plan_1");
    expect(gateway.cancelPlan).toHaveBeenCalledWith("plan_1");
  });
});

describe("edge cases / invalid config", () => {
  it("rejects NaN and Infinity tax.defaultRate", () => {
    expect(() =>
      validateTaxConfig({ enabled: true, defaultRate: Number.NaN }),
    ).toThrow(/tax.defaultRate/);
    expect(() =>
      validateTaxConfig({
        enabled: true,
        defaultRate: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(InvalidConfigError);
  });

  it("allows zero defaultRate when tax is enabled", () => {
    expect(() =>
      validateTaxConfig({
        enabled: true,
        taxType: "vat",
        defaultRate: 0,
        sellerCountry: "DE",
      }),
    ).not.toThrow();
  });

  it("fails BillingKit init for unsupported provider and empty currency", () => {
    expect(
      () =>
        new BillingKit({
          // @ts-expect-error intentional
          provider: "adyen",
          secretKey: "sk_test_x",
        }),
    ).toThrow(InvalidConfigError);

    expect(
      () =>
        new BillingKit({
          provider: "stripe",
          secretKey: "sk_test_x",
          currency: "   ",
        }),
    ).toThrow(/currency must be one of/);
  });

  it("fails BillingKit init for negative gracePeriodMs", () => {
    expect(
      () =>
        new BillingKit({
          provider: "stripe",
          secretKey: "sk_test_x",
          retry: { gracePeriodMs: -10 },
        }),
    ).toThrow(/retry.gracePeriodMs/);
  });
});

describe("edge cases / payments zero and negative amounts", () => {
  it("allows zero-amount payments through to the gateway", async () => {
    const gateway = createMockGateway({
      createPayment: jest.fn().mockResolvedValue({
        id: "pay_zero",
        status: "captured",
        amount: 0,
        currency: "usd",
        provider: "mock",
      }),
    });

    const payment = await new PaymentService(gateway, "usd").createPayment({
      amount: 0,
      currency: "usd",
    });

    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0, currency: "usd" }),
    );
    expect(payment.amount).toBe(0);
  });

  it("rejects negative payment amounts before the gateway", async () => {
    const createPayment = jest.fn();

    await expect(
      new PaymentService(
        createMockGateway({ createPayment }),
        "usd",
      ).createPayment({ amount: -1, currency: "usd" }),
    ).rejects.toThrow(BillingValidationError);

    expect(createPayment).not.toHaveBeenCalled();
  });
});
