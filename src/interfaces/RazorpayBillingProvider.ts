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
export interface RazorpayBillingProvider {
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean;
  fetchPayment(paymentId: string): Promise<PaymentResult>;
  fetchRefund(refundId: string): Promise<RefundResult>;
  createPlan(input: CreatePlanInput): Promise<Plan>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;
}
