export type CouponType = "percentage" | "flat";
export type CouponDuration = "once" | "repeating" | "forever";

export interface Coupon {
  id?: string;
  code: string;
  name?: string;
  type: CouponType;
  /** @deprecated Prefer amountOff / percentOff */
  value?: number;
  amountOff?: number;
  percentOff?: number;
  duration?: CouponDuration;
  durationInMonths?: number;
  currency?: string;
  minAmount?: number;
  maxDiscount?: number;
  maxRedemptions?: number;
  timesRedeemed?: number;
  expiresAt?: Date;
  active?: boolean;
  metadata?: Record<string, string>;
}

export interface PromotionCode {
  id: string;
  code: string;
  couponId: string;
  coupon: Coupon;
  active?: boolean;
  expiresAt?: Date;
  maxRedemptions?: number;
  timesRedeemed?: number;
  minAmount?: number;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface CreatePromotionCodeInput {
  code: string;
  coupon: Coupon | string;
  active?: boolean;
  expiresAt?: Date;
  maxRedemptions?: number;
  minAmount?: number;
  customerId?: string;
  metadata?: Record<string, string>;
}

export interface ApplyCouponInput {
  amount: number;
  coupon: Coupon;
  currency?: string;
  now?: Date;
}

export interface ApplyPromotionCodeInput {
  amount: number;
  code: string;
  currency?: string;
  customerId?: string;
  now?: Date;
}

export interface CouponResult {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  couponCode: string;
  couponId?: string;
  type: CouponType;
  percentOff?: number;
  amountOff?: number;
  duration?: CouponDuration;
}

export interface AppliedPromotion {
  promotionCodeId: string;
  code: string;
  couponCode: string;
  couponId?: string;
  discountAmount: number;
  type: CouponType;
  percentOff?: number;
  amountOff?: number;
  description: string;
}

export interface DiscountLineItem {
  description: string;
  amount: number;
  type: CouponType;
  couponCode?: string;
  promotionCode?: string;
  percentOff?: number;
  amountOff?: number;
}

export interface CheckoutDiscountInput {
  amount: number;
  currency?: string;
  promotionCode?: string;
  coupon?: Coupon;
  customerId?: string;
}

export interface CheckoutDiscountResult {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  currency?: string;
  appliedPromotion?: AppliedPromotion;
  discountLines: DiscountLineItem[];
}
