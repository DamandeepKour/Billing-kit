export type PaymentStatus = "pending" | "authorized" | "captured" | "failed" | "cancelled";

export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  orderId?: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
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
}
