import { CouponService } from "../src/coupon";
import { CouponError } from "../src/utils/errors";

describe("CouponService", () => {
  const service = new CouponService();

  it("applies percentage discount", () => {
    const result = service.applyCoupon({
      amount: 10000,
      coupon: { code: "SAVE10", type: "percentage", value: 10 },
    });

    expect(result.discountAmount).toBe(1000);
    expect(result.finalAmount).toBe(9000);
  });

  it("applies flat discount", () => {
    const result = service.applyCoupon({
      amount: 10000,
      coupon: { code: "FLAT500", type: "flat", value: 500 },
    });

    expect(result.discountAmount).toBe(500);
    expect(result.finalAmount).toBe(9500);
  });

  it("throws for expired coupon", () => {
    expect(() =>
      service.validateCoupon(
        {
          code: "OLD",
          type: "flat",
          value: 100,
          expiresAt: new Date("2020-01-01"),
        },
        1000,
      ),
    ).toThrow(CouponError);
  });
});
