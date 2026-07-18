import type { ExchangeRateMetadata, FeeBreakdown } from "./settlement";

export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "cancelled";

export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  /** Currency the customer will pay in (defaults to `currency`) */
  presentmentCurrency?: string;
  /** Expected settlement currency when known */
  settlementCurrency?: string;
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
  /** Currency charged to the customer */
  presentmentCurrency?: string;
  /** Currency settled to your balance */
  settlementCurrency?: string;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
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
