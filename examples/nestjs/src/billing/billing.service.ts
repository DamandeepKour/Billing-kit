import { Injectable } from "@nestjs/common";
import {
  BillingKit,
  type GenerateInvoiceInput,
  type RefundPaymentInput,
  type WebhookEvent,
  type WebhookEventHandler,
} from "billing-kit";

@Injectable()
export class BillingService {
  readonly kit: BillingKit;

  constructor() {
    const provider =
      process.env.PROVIDER === "razorpay" ? "razorpay" : "stripe";

    this.kit =
      provider === "razorpay"
        ? new BillingKit({
            provider: "razorpay",
            keyId: process.env.RAZORPAY_KEY_ID!,
            secretKey: process.env.RAZORPAY_KEY_SECRET!,
            webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
            currency: process.env.CURRENCY ?? "inr",
          })
        : new BillingKit({
            provider: "stripe",
            secretKey: process.env.STRIPE_SECRET_KEY!,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            currency: process.env.CURRENCY ?? "usd",
          });
  }

  createPayment(input: {
    amount: number;
    currency?: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, string>;
  }) {
    return this.kit.createPayment({
      ...input,
      customerId: input.customerId ?? process.env.STRIPE_CUSTOMER_ID,
    });
  }

  getPaymentStatus(paymentId: string) {
    return this.kit.getPaymentStatus(paymentId);
  }

  generateInvoice(input: GenerateInvoiceInput) {
    return this.kit.generateInvoice(input);
  }

  getInvoice(invoiceId: string) {
    return this.kit.getInvoice(invoiceId);
  }

  refundPayment(input: RefundPaymentInput) {
    return this.kit.refundPayment(input);
  }

  healthCheck() {
    return this.kit.healthCheck();
  }

  runDiagnostics() {
    return this.kit.runDiagnostics();
  }

  processWebhookFromHttp(
    req: Parameters<BillingKit["processWebhookFromHttp"]>[0],
    handler?: WebhookEventHandler,
  ) {
    return this.kit.processWebhookFromHttp(
      req,
      handler ?? ((event) => this.handleWebhookEvent(event)),
    );
  }

  createWebhookHttpHandler(handler?: WebhookEventHandler) {
    return this.kit.createWebhookHttpHandler(
      handler ?? ((event) => this.handleWebhookEvent(event)),
    );
  }

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    switch (event.normalizedType) {
      case "payment.captured":
        break;
      case "payment.failed":
        break;
      case "refund.processed":
        break;
      case "invoice.paid":
        break;
      case "dispute.created":
      case "dispute.action_required":
        break;
      default:
        break;
    }
  }
}
