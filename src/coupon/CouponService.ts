import type {
  ApplyCouponInput,
  ApplyPromotionCodeInput,
  AppliedPromotion,
  CheckoutDiscountInput,
  CheckoutDiscountResult,
  Coupon,
  CouponDuration,
  CouponResult,
  CouponType,
  CreatePromotionCodeInput,
  DiscountLineItem,
  PromotionCode,
} from "../types/coupon";
import { CouponError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency, roundAmount } from "../utils/currency";

export interface ResolvedCouponValue {
  type: CouponType;
  percentOff?: number;
  amountOff?: number;
  duration: CouponDuration;
}

export function resolveCouponValue(coupon: Coupon): ResolvedCouponValue {
  const duration = coupon.duration ?? "once";

  if (coupon.percentOff !== undefined || coupon.type === "percentage") {
    const percentOff = coupon.percentOff ?? coupon.value;
    if (percentOff === undefined) {
      throw new CouponError(`Coupon "${coupon.code}" is missing percentOff`);
    }
    return { type: "percentage", percentOff, duration };
  }

  const amountOff = coupon.amountOff ?? coupon.value;
  if (amountOff === undefined) {
    throw new CouponError(`Coupon "${coupon.code}" is missing amountOff`);
  }
  return { type: "flat", amountOff, duration };
}

function toDiscountLine(
  result: CouponResult,
  promotionCode?: string,
): DiscountLineItem {
  const label =
    result.type === "percentage"
      ? `Discount ${result.couponCode} (${result.percentOff}%)`
      : `Discount ${result.couponCode}`;

  return {
    description: promotionCode ? `${label} [${promotionCode}]` : label,
    amount: result.discountAmount,
    type: result.type,
    couponCode: result.couponCode,
    promotionCode,
    percentOff: result.percentOff,
    amountOff: result.amountOff,
  };
}

export class CouponService {
  private readonly coupons = new Map<string, Coupon>();
  private readonly promotionCodes = new Map<string, PromotionCode>();

  registerCoupon(coupon: Coupon): Coupon {
    const resolved = resolveCouponValue(coupon);
    const normalized: Coupon = {
      ...coupon,
      id: coupon.id ?? generateId("coup"),
      type: resolved.type,
      percentOff: resolved.percentOff,
      amountOff: resolved.amountOff,
      duration: resolved.duration,
      value: resolved.type === "percentage" ? resolved.percentOff : resolved.amountOff,
      timesRedeemed: coupon.timesRedeemed ?? 0,
      active: coupon.active ?? true,
    };
    this.coupons.set(normalized.id!, normalized);
    this.coupons.set(normalized.code.toUpperCase(), normalized);
    return normalized;
  }

  getCoupon(idOrCode: string): Coupon | null {
    return (
      this.coupons.get(idOrCode) ??
      this.coupons.get(idOrCode.toUpperCase()) ??
      null
    );
  }

  createPromotionCode(input: CreatePromotionCodeInput): PromotionCode {
    const coupon =
      typeof input.coupon === "string"
        ? this.getCoupon(input.coupon)
        : this.registerCoupon(input.coupon);

    if (!coupon) {
      throw new CouponError(`Coupon "${input.coupon}" not found`);
    }

    const code = input.code.trim().toUpperCase();
    if (this.promotionCodes.has(code)) {
      throw new CouponError(`Promotion code "${code}" already exists`);
    }

    const promotion: PromotionCode = {
      id: generateId("promo"),
      code,
      couponId: coupon.id ?? coupon.code,
      coupon,
      active: input.active ?? true,
      expiresAt: input.expiresAt,
      maxRedemptions: input.maxRedemptions,
      timesRedeemed: 0,
      minAmount: input.minAmount,
      customerId: input.customerId,
      metadata: input.metadata,
    };

    this.promotionCodes.set(code, promotion);
    this.promotionCodes.set(promotion.id, promotion);
    return promotion;
  }

  getPromotionCode(idOrCode: string): PromotionCode | null {
    return (
      this.promotionCodes.get(idOrCode) ??
      this.promotionCodes.get(idOrCode.toUpperCase()) ??
      null
    );
  }

  validateCoupon(coupon: Coupon, amount: number, now = new Date()): void {
    resolveCouponValue(coupon);

    if (coupon.active === false) {
      throw new CouponError(`Coupon "${coupon.code}" is inactive`);
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new CouponError(`Coupon "${coupon.code}" has expired`);
    }
    if (coupon.minAmount !== undefined && amount < coupon.minAmount) {
      throw new CouponError(
        `Minimum amount ${coupon.minAmount} required for coupon "${coupon.code}"`,
      );
    }
    if (
      coupon.maxRedemptions !== undefined &&
      (coupon.timesRedeemed ?? 0) >= coupon.maxRedemptions
    ) {
      throw new CouponError(`Coupon "${coupon.code}" has reached its usage limit`);
    }
  }

  validatePromotionCode(
    promotion: PromotionCode,
    amount: number,
    options?: { customerId?: string; now?: Date },
  ): void {
    const now = options?.now ?? new Date();

    if (promotion.active === false) {
      throw new CouponError(`Promotion code "${promotion.code}" is inactive`);
    }
    if (promotion.expiresAt && promotion.expiresAt < now) {
      throw new CouponError(`Promotion code "${promotion.code}" has expired`);
    }
    if (promotion.minAmount !== undefined && amount < promotion.minAmount) {
      throw new CouponError(
        `Minimum amount ${promotion.minAmount} required for promotion "${promotion.code}"`,
      );
    }
    if (
      promotion.maxRedemptions !== undefined &&
      (promotion.timesRedeemed ?? 0) >= promotion.maxRedemptions
    ) {
      throw new CouponError(
        `Promotion code "${promotion.code}" has reached its usage limit`,
      );
    }
    if (
      promotion.customerId &&
      options?.customerId &&
      promotion.customerId !== options.customerId
    ) {
      throw new CouponError(
        `Promotion code "${promotion.code}" is not valid for this customer`,
      );
    }

    this.validateCoupon(promotion.coupon, amount, now);
  }

  applyCoupon(input: ApplyCouponInput): CouponResult {
    const { amount, coupon, now } = input;
    this.validateCoupon(coupon, amount, now);

    if (
      coupon.currency &&
      input.currency &&
      normalizeCurrency(coupon.currency) !== normalizeCurrency(input.currency)
    ) {
      throw new CouponError(
        `Coupon "${coupon.code}" currency does not match ${input.currency}`,
      );
    }

    const resolved = resolveCouponValue(coupon);
    let discountAmount = 0;

    if (resolved.type === "percentage") {
      discountAmount = roundAmount((amount * (resolved.percentOff ?? 0)) / 100);
    } else {
      discountAmount = roundAmount(resolved.amountOff ?? 0);
    }

    if (coupon.maxDiscount !== undefined) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    }
    discountAmount = Math.min(discountAmount, amount);

    return {
      originalAmount: amount,
      discountAmount,
      finalAmount: amount - discountAmount,
      couponCode: coupon.code,
      couponId: coupon.id,
      type: resolved.type,
      percentOff: resolved.percentOff,
      amountOff: resolved.type === "flat" ? discountAmount : resolved.amountOff,
      duration: resolved.duration,
    };
  }

  applyPromotionCode(input: ApplyPromotionCodeInput): CouponResult & {
    appliedPromotion: AppliedPromotion;
    discountLine: DiscountLineItem;
  } {
    const promotion = this.getPromotionCode(input.code);
    if (!promotion) {
      throw new CouponError(`Promotion code "${input.code}" not found`);
    }

    this.validatePromotionCode(promotion, input.amount, {
      customerId: input.customerId,
      now: input.now,
    });

    const result = this.applyCoupon({
      amount: input.amount,
      coupon: promotion.coupon,
      currency: input.currency,
      now: input.now,
    });

    const appliedPromotion: AppliedPromotion = {
      promotionCodeId: promotion.id,
      code: promotion.code,
      couponCode: promotion.coupon.code,
      couponId: promotion.coupon.id,
      discountAmount: result.discountAmount,
      type: result.type,
      percentOff: result.percentOff,
      amountOff: result.amountOff,
      description:
        result.type === "percentage"
          ? `${promotion.code} (${result.percentOff}% off)`
          : `${promotion.code} (${result.discountAmount} off)`,
    };

    return {
      ...result,
      appliedPromotion,
      discountLine: toDiscountLine(result, promotion.code),
    };
  }

  removePromotionCode(input: {
    amount: number;
    currency?: string;
  }): CheckoutDiscountResult {
    return {
      originalAmount: input.amount,
      discountAmount: 0,
      finalAmount: input.amount,
      currency: input.currency,
      discountLines: [],
      appliedPromotion: undefined,
    };
  }

  applyCheckoutDiscount(input: CheckoutDiscountInput): CheckoutDiscountResult {
    if (input.promotionCode) {
      const applied = this.applyPromotionCode({
        amount: input.amount,
        code: input.promotionCode,
        currency: input.currency,
        customerId: input.customerId,
      });
      return {
        originalAmount: applied.originalAmount,
        discountAmount: applied.discountAmount,
        finalAmount: applied.finalAmount,
        currency: input.currency,
        appliedPromotion: applied.appliedPromotion,
        discountLines: [applied.discountLine],
      };
    }

    if (input.coupon) {
      const result = this.applyCoupon({
        amount: input.amount,
        coupon: input.coupon,
        currency: input.currency,
      });
      return {
        originalAmount: result.originalAmount,
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
        currency: input.currency,
        discountLines: [toDiscountLine(result)],
      };
    }

    return {
      originalAmount: input.amount,
      discountAmount: 0,
      finalAmount: input.amount,
      currency: input.currency,
      discountLines: [],
    };
  }

  recordRedemption(couponOrPromo: Coupon | PromotionCode): void {
    if ("couponId" in couponOrPromo) {
      const promo = this.getPromotionCode(couponOrPromo.id);
      if (promo) {
        promo.timesRedeemed = (promo.timesRedeemed ?? 0) + 1;
        this.promotionCodes.set(promo.id, promo);
        this.promotionCodes.set(promo.code, promo);
      }
      const coupon = this.getCoupon(couponOrPromo.couponId);
      if (coupon) {
        coupon.timesRedeemed = (coupon.timesRedeemed ?? 0) + 1;
        this.registerCoupon(coupon);
      }
      return;
    }

    const coupon = this.getCoupon(couponOrPromo.id ?? couponOrPromo.code);
    if (coupon) {
      coupon.timesRedeemed = (coupon.timesRedeemed ?? 0) + 1;
      this.registerCoupon(coupon);
    }
  }

  buildDiscountLinesFromResult(
    result: CouponResult,
    promotionCode?: string,
  ): DiscountLineItem[] {
    if (result.discountAmount <= 0) return [];
    return [toDiscountLine(result, promotionCode)];
  }
}
