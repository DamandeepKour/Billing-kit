export type CouponType = "percentage" | "flat";
export interface Coupon {
  code: string;
  type: CouponType;
  value: number;
  minAmount?: number;
  maxDiscount?: number;
  expiresAt?: Date;
  active?: boolean;
}
export interface ApplyCouponInput {
  amount: number;
  coupon: Coupon;
}
export interface CouponResult {
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  couponCode: string;
}
