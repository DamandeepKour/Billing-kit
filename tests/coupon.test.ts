import { BillingKit } from "../src/core/BillingKit";
import { CouponService } from "../src/coupon";
import { CouponError } from "../src/utils/errors";

describe("CouponService", () => {
  const service = new CouponService();

  it("applies percentage discount via percentOff", () => {
    const result = service.applyCoupon({
      amount: 10000,
      coupon: {
        code: "SAVE10",
        type: "percentage",
        percentOff: 10,
        duration: "once",
      },
    });

    expect(result.discountAmount).toBe(1000);
    expect(result.finalAmount).toBe(9000);
    expect(result.percentOff).toBe(10);
  });

  it("applies flat discount via amountOff", () => {
    const result = service.applyCoupon({
      amount: 10000,
      coupon: {
        code: "FLAT500",
        type: "flat",
        amountOff: 500,
        duration: "forever",
      },
    });

    expect(result.discountAmount).toBe(500);
    expect(result.finalAmount).toBe(9500);
    expect(result.amountOff).toBe(500);
  });

  it("keeps backward-compatible value field", () => {
    expect(
      service.applyCoupon({
        amount: 20000,
        coupon: { code: "OLD", type: "percentage", value: 25 },
      }).discountAmount,
    ).toBe(5000);
  });

  it("validates expiry date", () => {
    expect(() =>
      service.validateCoupon(
        {
          code: "OLD",
          type: "flat",
          amountOff: 100,
          expiresAt: new Date("2020-01-01"),
        },
        1000,
      ),
    ).toThrow(CouponError);
  });

  it("validates minimum amount", () => {
    expect(() =>
      service.validateCoupon(
        {
          code: "MIN",
          type: "flat",
          amountOff: 100,
          minAmount: 5000,
        },
        1000,
      ),
    ).toThrow(CouponError);
  });

  it("validates usage limit", () => {
    expect(() =>
      service.validateCoupon(
        {
          code: "LIMIT",
          type: "percentage",
          percentOff: 10,
          maxRedemptions: 1,
          timesRedeemed: 1,
        },
        10000,
      ),
    ).toThrow(CouponError);
  });

  it("applies and removes promotion codes", () => {
    service.registerCoupon({
      code: "SUMMER",
      type: "percentage",
      percentOff: 20,
      duration: "once",
    });

    const promo = service.createPromotionCode({
      code: "SUMMER20",
      coupon: "SUMMER",
      maxRedemptions: 5,
    });

    const applied = service.applyPromotionCode({
      amount: 10000,
      code: promo.code,
    });

    expect(applied.discountAmount).toBe(2000);
    expect(applied.appliedPromotion.code).toBe("SUMMER20");
    expect(applied.discountLine.description).toContain("SUMMER20");

    const removed = service.removePromotionCode({ amount: 10000, currency: "usd" });
    expect(removed.discountAmount).toBe(0);
    expect(removed.finalAmount).toBe(10000);
    expect(removed.appliedPromotion).toBeUndefined();
  });
});

describe("Invoice and payment discount flows", () => {
  it("adds discount line items on invoices for flat and percent coupons", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "usd",
    });

    billing.registerCoupon({
      code: "PCT15",
      type: "percentage",
      percentOff: 15,
      duration: "once",
    });
    billing.createPromotionCode({ code: "LAUNCH15", coupon: "PCT15" });

    const percentInvoice = await billing.generateInvoice({
      customer: { name: "Ada" },
      billingAddress: {
        line1: "1 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
      lineItems: [{ description: "Pro", quantity: 1, unitAmount: 10000 }],
      promotionCode: "LAUNCH15",
      taxType: "none",
      currency: "usd",
    });

    expect(percentInvoice.discountTotal).toBe(1500);
    expect(percentInvoice.total).toBe(8500);
    expect(percentInvoice.discountLines[0]?.promotionCode).toBe("LAUNCH15");
    expect(percentInvoice.discountLines[0]?.percentOff).toBe(15);

    const flatInvoice = await billing.generateInvoice({
      customer: { name: "Ada" },
      billingAddress: {
        line1: "1 Main",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
      lineItems: [{ description: "Pro", quantity: 1, unitAmount: 10000 }],
      coupon: {
        code: "OFF2000",
        type: "flat",
        amountOff: 2000,
        duration: "once",
      },
      taxType: "none",
      currency: "usd",
    });

    expect(flatInvoice.discountTotal).toBe(2000);
    expect(flatInvoice.discountLines[0]?.amount).toBe(2000);
    expect(flatInvoice.total).toBe(8000);
  });

  it("applies checkout discount helpers for payment creation amounts", () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    billing.registerCoupon({
      code: "FLAT100",
      type: "flat",
      amountOff: 100,
      duration: "repeating",
      durationInMonths: 3,
    });
    billing.createPromotionCode({ code: "PAY100", coupon: "FLAT100" });

    const checkout = billing.applyCheckoutDiscount({
      amount: 5000,
      currency: "usd",
      promotionCode: "PAY100",
    });

    expect(checkout.finalAmount).toBe(4900);
    expect(checkout.discountLines).toHaveLength(1);

    const cleared = billing.removePromotionCode({ amount: 5000, currency: "usd" });
    expect(cleared.finalAmount).toBe(5000);
  });
});
