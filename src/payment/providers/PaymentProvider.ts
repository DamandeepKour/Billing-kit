import type {
  CreateInvoiceInput,
  Invoice,
} from "../types/invoice";
import type {
  CreatePaymentInput,
  Payment,
  Refund,
  RefundPaymentInput,
} from "../types/payment";
import type {
  CreateSubscriptionInput,
  Subscription,
} from "../types/subscription";
import type { WebhookEvent } from "../types/webhook";

export interface PaymentProvider {
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  finalizeInvoice(invoiceId: string): Promise<Invoice>;
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  getPayment(paymentId: string): Promise<Payment>;
  refund(input: RefundPaymentInput): Promise<Refund>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;
}
