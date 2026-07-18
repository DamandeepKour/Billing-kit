import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../types/order";
import type { PaymentResult, RefundResult } from "../types/payment";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  Plan,
  Subscription,
} from "../types/subscription";
import type { WebhookEvent } from "../types/webhook";

/**
 * Razorpay-specific billing surface (orders, payment signature, fetch helpers, raw-body webhooks).
 * Implemented by {@link RazorpayGateway}; access via BillingKit when `provider: "razorpay"`.
 */
export interface RazorpayBillingProvider {
  /** First-class Orders API — preferred entry before checkout / capture. */
  createOrder(input: CreateOrderInput): Promise<OrderResult>;

  /**
   * Verify Checkout / Orders payment signature.
   * Uses `key_secret` (not webhook secret): HMAC-SHA256(`orderId|paymentId`).
   */
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean;

  fetchPayment(paymentId: string): Promise<PaymentResult>;
  fetchRefund(refundId: string): Promise<RefundResult>;

  createPlan(input: CreatePlanInput): Promise<Plan>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;

  /**
   * Verify webhook using the **raw** request body (string or Buffer).
   * Do not `JSON.parse` / cast the body before calling this.
   */
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;
}
