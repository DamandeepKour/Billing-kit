import type { BillingKitConfig } from "../types/config";
import type { ApplyCouponInput, Coupon, CouponResult } from "../types/coupon";
import type {
  GenerateInvoiceInput,
  Invoice,
  InvoiceSummary,
} from "../types/invoice";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundPaymentInput,
  RefundResult,
} from "../types/payment";
import type { GeneratePdfInput } from "../types/pdf";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from "../types/subscription";
import type { GSTInput, TaxBreakdown, VATInput } from "../types/tax";
import type {
  RecordTransactionInput,
  Transaction,
} from "../types/transaction";
import type { WebhookEvent } from "../types/webhook";
import { CouponService } from "../coupon";
import { InvoiceService } from "../invoice";
import { InvoicePdfGenerator } from "../pdf";
import { PaymentManager, PaymentService } from "../payment";
import { RefundService } from "../refund";
import { SubscriptionService } from "../subscription";
import { TaxService } from "../tax";
import { TransactionService } from "../transaction";
import { InvalidConfigError } from "../utils/errors";
import { WebhookService } from "../webhook";

export class BillingKit {
  private readonly config: BillingKitConfig;
  private readonly invoiceService: InvoiceService;
  private readonly paymentService: PaymentService;
  private readonly refundService: RefundService;
  private readonly subscriptionService: SubscriptionService;
  private readonly taxService: TaxService;
  private readonly couponService: CouponService;
  private readonly transactionService: TransactionService;
  private readonly webhookService: WebhookService;
  private readonly pdfGenerator: InvoicePdfGenerator;

  constructor(config: BillingKitConfig) {
    if (!config.secretKey) {
      throw new InvalidConfigError("secretKey is required");
    }

    if (config.provider === "razorpay" && !config.keyId) {
      throw new InvalidConfigError("keyId is required for Razorpay");
    }

    this.config = {
      currency: "inr",
      ...config,
    };

    const paymentManager = new PaymentManager(this.config);
    const gateway = paymentManager.getGateway();

    this.invoiceService = new InvoiceService(this.config);
    this.paymentService = new PaymentService(gateway);
    this.refundService = new RefundService(gateway);
    this.subscriptionService = new SubscriptionService(gateway);
    this.taxService = new TaxService();
    this.couponService = new CouponService();
    this.transactionService = new TransactionService();
    this.webhookService = new WebhookService(gateway);
    this.pdfGenerator = new InvoicePdfGenerator(this.config);
  }

  generateInvoice(input: GenerateInvoiceInput): Invoice {
    return this.invoiceService.generateInvoice(input);
  }

  getInvoiceSummary(invoiceId: string): InvoiceSummary {
    return this.invoiceService.getInvoiceSummary(invoiceId);
  }

  generateInvoicePdf(input: GeneratePdfInput): Promise<Buffer> {
    return this.pdfGenerator.generateInvoicePdf(input);
  }

  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return this.paymentService.createPayment(input);
  }

  capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    return this.paymentService.capturePayment(input);
  }

  cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.paymentService.cancelPayment(paymentId);
  }

  getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.paymentService.getPaymentStatus(paymentId);
  }

  refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    return this.refundService.refundPayment(input);
  }

  createPlan(input: CreatePlanInput): Promise<Plan> {
    return this.subscriptionService.createPlan(input);
  }

  updatePlan(input: UpdatePlanInput): Promise<Plan> {
    return this.subscriptionService.updatePlan(input);
  }

  cancelPlan(planId: string): Promise<Plan> {
    return this.subscriptionService.cancelPlan(planId);
  }

  createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.subscriptionService.createSubscription(input);
  }

  cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptionService.cancelSubscription(subscriptionId);
  }

  renewSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptionService.renewSubscription(subscriptionId);
  }

  calculateGST(input: GSTInput): TaxBreakdown {
    const rate = input.rate ?? this.config.tax?.defaultRate;
    return this.taxService.calculateGST({ ...input, rate });
  }

  calculateVAT(input: VATInput): TaxBreakdown {
    return this.taxService.calculateVAT(input);
  }

  applyCoupon(input: ApplyCouponInput): CouponResult {
    return this.couponService.applyCoupon(input);
  }

  validateCoupon(coupon: Coupon, amount: number): void {
    this.couponService.validateCoupon(coupon, amount);
  }

  recordTransaction(input: RecordTransactionInput): Transaction {
    return this.transactionService.recordTransaction(input);
  }

  getTransaction(id: string): Transaction {
    return this.transactionService.getTransaction(id);
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.webhookService.verifyWebhook(payload, signature);
  }
}
