import type { ExchangeRateMetadata, FeeBreakdown } from "./settlement";
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "retrying"
  | "recovered"
  | "uncollectible";
export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  coupon?: import("./coupon").Coupon;
  promotionCode?: string;
}
export interface CapturePaymentInput {
  paymentId: string;
  amount?: number;
}
export interface PaymentResult {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: string;
  metadata?: Record<string, string>;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
  originalAmount?: number;
  discountAmount?: number;
  appliedPromotionCode?: string;
  appliedCouponCode?: string;
}
export interface RefundPaymentInput {
  paymentId: string;
  amount?: number;
  reason?: string;
  idempotencyKey?: string;
}
export interface RefundResult {
  id: string;
  paymentId: string;
  amount: number;
  status: "pending" | "succeeded" | "failed";
  provider: string;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
}
