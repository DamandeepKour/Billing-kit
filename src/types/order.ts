export interface CreateOrderInput {
  amount: number;
  currency?: string;
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
export interface VerifyPaymentSignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}
export interface FetchRefundInput {
  refundId: string;
}
