import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundPaymentInput,
  RefundResult,
} from "../types/payment";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from "../types/subscription";
import type { WebhookEvent } from "../types/webhook";

export interface PaymentGateway {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  capturePayment(input: CapturePaymentInput): Promise<PaymentResult>;
  cancelPayment(paymentId: string): Promise<PaymentResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundResult>;

  createPlan(input: CreatePlanInput): Promise<Plan>;
  updatePlan(input: UpdatePlanInput): Promise<Plan>;
  cancelPlan(planId: string): Promise<Plan>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  renewSubscription(subscriptionId: string): Promise<Subscription>;

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;
}
