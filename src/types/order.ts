export interface CreateOrderInput {
  amount: number;
  currency?: string;
  /** Razorpay receipt id (unique per order recommended) */
  receipt?: string;
  notes?: Record<string, string>;
  partialPayment?: boolean;
}

export interface OrderResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string | null;
  provider: string;
  notes?: Record<string, string>;
}

/**
 * Client-side checkout signature check:
 * HMAC-SHA256(`${orderId}|${paymentId}`, key_secret)
 */
export interface VerifyPaymentSignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface FetchRefundInput {
  refundId: string;
}
