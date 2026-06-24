import { InvoiceService } from "./invoice/InvoiceService";
import { createPaymentProvider } from "./payment";
import { PaymentService } from "./payment/PaymentService";
import { RefundService } from "./refund/RefundService";
import { SubscriptionService } from "./subscription/SubscriptionService";
import { calculateGST } from "./tax/GSTCalculator";
import type { BillingKitConfig } from "./types/config";
import type {
  CreateInvoiceInput,
  Invoice,
} from "./types/invoice";
import type {
  CreatePaymentInput,
  Payment,
  Refund,
  RefundPaymentInput,
} from "./types/payment";
import type {
  CreateSubscriptionInput,
  Subscription,
} from "./types/subscription";
import type { TaxBreakdown, TaxCalculationInput } from "./types/tax";
import type { WebhookEvent, WebhookHandlers } from "./types/webhook";
import { InvalidConfigError } from "./utils/errors";
import { WebhookHandler } from "./webhook/WebhookHandler";

export class BillingKit {
  private readonly config: BillingKitConfig;
  private readonly invoiceService: InvoiceService;
  private readonly paymentService: PaymentService;
  private readonly refundService: RefundService;
  private readonly subscriptionService: SubscriptionService;
  private readonly webhookHandler: WebhookHandler;

  constructor(config: BillingKitConfig) {
    if (!config.secretKey) {
      throw new InvalidConfigError("secretKey is required");
    }

    this.config = {
      currency: "inr",
      ...config,
    };

    const provider = createPaymentProvider(this.config);
    this.invoiceService = new InvoiceService(provider);
    this.paymentService = new PaymentService(provider);
    this.refundService = new RefundService(provider);
    this.subscriptionService = new SubscriptionService(provider);
    this.webhookHandler = new WebhookHandler(provider);
  }

  createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    return this.invoiceService.createInvoice(input);
  }

  getInvoice(invoiceId: string): Promise<Invoice> {
    return this.invoiceService.getInvoice(invoiceId);
  }

  finalizeInvoice(invoiceId: string): Promise<Invoice> {
    return this.invoiceService.finalizeInvoice(invoiceId);
  }

  createPayment(input: CreatePaymentInput): Promise<Payment> {
    return this.paymentService.createPayment(input);
  }

  getPayment(paymentId: string): Promise<Payment> {
    return this.paymentService.getPayment(paymentId);
  }

  calculateTax(input: TaxCalculationInput): TaxBreakdown {
    const rate = input.rate ?? this.config.tax?.defaultRate ?? 0;
    return calculateGST({ ...input, rate });
  }

  createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.subscriptionService.createSubscription(input);
  }

  cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptionService.cancelSubscription(subscriptionId);
  }

  refundPayment(input: RefundPaymentInput): Promise<Refund> {
    return this.refundService.refundPayment(input);
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.webhookHandler.verifyWebhook(payload, signature);
  }

  handleWebhook(
    event: WebhookEvent,
    handlers?: WebhookHandlers,
  ): Promise<void> {
    return this.webhookHandler.handleWebhook(event, handlers);
  }
}
