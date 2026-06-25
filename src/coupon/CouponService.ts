import type {
  ApplyCouponInput,
  Coupon,
  CouponResult,
} from "../types/coupon";
import { CouponError } from "../utils/errors";
import { roundAmount } from "../utils/currency";

export class CouponService {
  validateCoupon(coupon: Coupon, amount: number): void {
    if (coupon.active === false) {
      throw new CouponError(`Coupon "${coupon.code}" is inactive`);
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new CouponError(`Coupon "${coupon.code}" has expired`);
    }

    if (coupon.minAmount !== undefined && amount < coupon.minAmount) {
      throw new CouponError(
        `Minimum amount ${coupon.minAmount} required for coupon "${coupon.code}"`,
      );
    }
  }

  applyCoupon(input: ApplyCouponInput): CouponResult {
    const { amount, coupon } = input;
    this.validateCoupon(coupon, amount);

    let discountAmount = 0;

    if (coupon.type === "percentage") {
      discountAmount = roundAmount((amount * coupon.value) / 100);
    } else {
      discountAmount = roundAmount(coupon.value);
    }

    if (coupon.maxDiscount !== undefined) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    }

    discountAmount = Math.min(discountAmount, amount);
    const finalAmount = amount - discountAmount;

    return {
      originalAmount: amount,
      discountAmount,
      finalAmount,
      couponCode: coupon.code,
    };
  }
}
