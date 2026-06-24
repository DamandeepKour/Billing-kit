export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  invoiceId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface Payment {
  id: string;
  status: "pending" | "succeeded" | "failed";
  amount: number;
  currency: string;
}

export interface RefundPaymentInput {
  paymentId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencyKey?: string;
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  status: "pending" | "succeeded" | "failed";
}
