import type { BillingKitConfig } from "../types/config";
import type {
  ApplyCouponInput,
  ApplyPromotionCodeInput,
  CheckoutDiscountInput,
  CheckoutDiscountResult,
  Coupon,
  CouponResult,
  CreatePromotionCodeInput,
  PromotionCode,
} from "../types/coupon";
import type { GenerateInvoiceInput, Invoice, InvoiceSummary } from "../types/invoice";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundPaymentInput,
  RefundResult,
} from "../types/payment";
import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../types/order";
import type { GeneratePdfInput } from "../types/pdf";
import type {
  AttachPaymentMethodInput,
  CreateProviderCustomerInput,
  PaymentMethodResult,
  ProviderCustomer,
  ProviderInvoice,
  SetDefaultPaymentMethodInput,
} from "../types/provider";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  Plan,
  ReportUsageInput,
  Subscription,
  UpdatePlanInput,
  UsageRecord,
} from "../types/subscription";
import type { GSTInput, TaxBreakdown, TaxCalculationInput, VATInput } from "../types/tax";
import type { RecordTransactionInput, Transaction } from "../types/transaction";
import type { ReportingFilter } from "../types/settlement";
import type { WebhookEvent } from "../types/webhook";
import type {
  BillingRetryAttempt,
  OpenBillingAttemptInput,
  ReportBillingFailureInput,
  ReportBillingRecoveryInput,
  RetryAttemptFilter,
} from "../types/retry";
import type {
  AttachProfilePaymentMethodInput,
  CreateCustomerProfileInput,
  CustomerBillingProfile,
  SetDefaultProfilePaymentMethodInput,
  UpdateCustomerProfileInput,
} from "../types/customer-profile";
import type {
  CreateTransferInput,
  GetSettlementDetailsInput,
  ReverseTransferInput,
  SettlementDetails,
  SplitPaymentInput,
  SplitPaymentResult,
  TransferReversalResult,
  TransferResult,
} from "../types/route";
import { CouponService } from "../coupon";
import {
  CustomerProfileService,
} from "../customer";
import { InvoiceService } from "../invoice";
import { InvoicePdfGenerator } from "../pdf";
import { PaymentManager, PaymentService } from "../payment";
import {
  InMemoryCustomerProfileRepository,
  InMemoryInvoiceRepository,
  InMemoryRetryAttemptRepository,
  InMemoryTransactionRepository,
} from "../repositories";
import { RefundService } from "../refund";
import { RetryService } from "../retry";
import { RouteService } from "../route";
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
  private readonly retryService: RetryService;
  private readonly customerProfileService: CustomerProfileService;
  private readonly routeService: RouteService;

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
    const invoiceRepository =
      this.config.invoiceRepository ?? new InMemoryInvoiceRepository();
    const transactionRepository =
      this.config.transactionRepository ?? new InMemoryTransactionRepository();
    const retryAttemptRepository =
      this.config.retryAttemptRepository ?? new InMemoryRetryAttemptRepository();
    const customerProfileRepository =
      this.config.customerProfileRepository ??
      new InMemoryCustomerProfileRepository();
    const paymentManager = new PaymentManager(this.config);
    const gateway = paymentManager.getGateway();
    this.couponService = new CouponService();
    this.customerProfileService = new CustomerProfileService(
      customerProfileRepository,
      gateway,
    );
    this.invoiceService = new InvoiceService(
      this.config,
      invoiceRepository,
      this.couponService,
      this.customerProfileService,
    );
    this.paymentService = new PaymentService(
      gateway,
      this.config.currency,
      this.couponService,
      this.customerProfileService,
    );
    this.refundService = new RefundService(gateway);
    this.subscriptionService = new SubscriptionService(gateway, this.couponService);
    this.taxService = new TaxService();
    this.transactionService = new TransactionService(transactionRepository);
    this.webhookService = new WebhookService(gateway);
    this.pdfGenerator = new InvoicePdfGenerator(this.config);
    this.retryService = new RetryService(
      retryAttemptRepository,
      this.config.retry,
      this.config.retryHooks,
    );
    this.routeService = new RouteService(gateway, this.transactionService);
  }
  generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    return this.invoiceService.generateInvoice(input);
  }
  getInvoiceSummary(invoiceId: string): Promise<InvoiceSummary> {
    return this.invoiceService.getInvoiceSummary(invoiceId);
  }
  getInvoice(invoiceId: string): Promise<Invoice | null> {
    return this.invoiceService.getInvoice(invoiceId);
  }
  generateInvoicePdf(input: GeneratePdfInput): Promise<Buffer> {
    return this.pdfGenerator.generateInvoicePdf(input);
  }
  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return this.paymentService.createPayment(input);
  }
  createOrder(input: CreateOrderInput): Promise<OrderResult> {
    return this.paymentService.createOrder(input);
  }
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean {
    return this.paymentService.verifyPaymentSignature(input);
  }
  fetchPayment(paymentId: string): Promise<PaymentResult> {
    return this.paymentService.fetchPayment(paymentId);
  }
  fetchRefund(refundId: string): Promise<RefundResult> {
    return this.paymentService.fetchRefund(refundId);
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
  pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription> {
    return this.subscriptionService.pauseSubscription(input);
  }
  resumeSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptionService.resumeSubscription(subscriptionId);
  }
  retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    return this.subscriptionService.retrieveSubscription(subscriptionId);
  }
  createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer> {
    return this.subscriptionService.createCustomer(input);
  }

  createCustomerProfile(
    input: CreateCustomerProfileInput,
  ): Promise<CustomerBillingProfile> {
    return this.customerProfileService.createCustomerProfile(input);
  }

  updateCustomerProfile(
    input: UpdateCustomerProfileInput,
  ): Promise<CustomerBillingProfile> {
    return this.customerProfileService.updateCustomerProfile(input);
  }

  getCustomerProfile(profileId: string): Promise<CustomerBillingProfile> {
    return this.customerProfileService.getCustomerProfile(profileId);
  }

  listCustomerProfiles(): Promise<CustomerBillingProfile[]> {
    return this.customerProfileService.listCustomerProfiles();
  }

  attachPaymentMethod(
    input: AttachProfilePaymentMethodInput,
  ): Promise<CustomerBillingProfile>;
  attachPaymentMethod(input: AttachPaymentMethodInput): Promise<PaymentMethodResult>;
  attachPaymentMethod(
    input: AttachProfilePaymentMethodInput | AttachPaymentMethodInput,
  ): Promise<CustomerBillingProfile | PaymentMethodResult> {
    if ("profileId" in input) {
      return this.customerProfileService.attachPaymentMethod(input);
    }
    return this.subscriptionService.attachPaymentMethod(input);
  }

  setDefaultPaymentMethod(
    input: SetDefaultProfilePaymentMethodInput,
  ): Promise<CustomerBillingProfile>;
  setDefaultPaymentMethod(
    input: SetDefaultPaymentMethodInput,
  ): Promise<ProviderCustomer>;
  setDefaultPaymentMethod(
    input: SetDefaultProfilePaymentMethodInput | SetDefaultPaymentMethodInput,
  ): Promise<CustomerBillingProfile | ProviderCustomer> {
    if ("profileId" in input) {
      return this.customerProfileService.setDefaultPaymentMethod(input);
    }
    return this.subscriptionService.setDefaultPaymentMethod(input);
  }

  retrieveProviderInvoice(invoiceId: string): Promise<ProviderInvoice> {
    return this.subscriptionService.retrieveProviderInvoice(invoiceId);
  }
  reportUsage(input: ReportUsageInput): Promise<UsageRecord> {
    return this.subscriptionService.reportUsage(input);
  }
  calculateGST(input: GSTInput): TaxBreakdown {
    const rate = input.rate ?? this.config.tax?.defaultRate;
    return this.taxService.calculateGST({ ...input, rate });
  }
  calculateVAT(input: VATInput): TaxBreakdown {
    return this.taxService.calculateVAT(input);
  }
  calculateTax(input: TaxCalculationInput): TaxBreakdown {
    return this.taxService.calculate({
      ...input,
      rate: input.rate ?? this.config.tax?.defaultRate,
      autoTax: input.autoTax ?? this.config.tax?.autoTax,
      sellerState: input.sellerState ?? this.config.tax?.sellerState,
      country: input.country ?? this.config.tax?.sellerCountry ?? input.country,
    });
  }
  applyCoupon(input: ApplyCouponInput): CouponResult {
    return this.couponService.applyCoupon(input);
  }

  validateCoupon(coupon: Coupon, amount: number): void {
    this.couponService.validateCoupon(coupon, amount);
  }

  registerCoupon(coupon: Coupon): Coupon {
    return this.couponService.registerCoupon(coupon);
  }

  createPromotionCode(input: CreatePromotionCodeInput): PromotionCode {
    return this.couponService.createPromotionCode(input);
  }

  applyPromotionCode(input: ApplyPromotionCodeInput) {
    return this.couponService.applyPromotionCode(input);
  }

  removePromotionCode(input: { amount: number; currency?: string }): CheckoutDiscountResult {
    return this.couponService.removePromotionCode(input);
  }

  applyCheckoutDiscount(input: CheckoutDiscountInput): CheckoutDiscountResult {
    return this.couponService.applyCheckoutDiscount(input);
  }

  getPromotionCode(idOrCode: string): PromotionCode | null {
    return this.couponService.getPromotionCode(idOrCode);
  }

  getCoupon(idOrCode: string): Coupon | null {
    return this.couponService.getCoupon(idOrCode);
  }

  recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
    return this.transactionService.recordTransaction(input);
  }
  getTransaction(id: string): Promise<Transaction> {
    return this.transactionService.getTransaction(id);
  }
  getRevenueByCurrency(filter?: ReportingFilter) {
    return this.transactionService.getRevenueByCurrency(filter);
  }
  getSettlementSummary(filter?: ReportingFilter) {
    return this.transactionService.getSettlementSummary(filter);
  }

  calculateSplit(input: SplitPaymentInput) {
    return this.routeService.calculateSplit(input);
  }

  createTransfer(input: CreateTransferInput): Promise<TransferResult> {
    return this.routeService.createTransfer(input);
  }

  splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
    return this.routeService.splitPayment(input);
  }

  reverseTransfer(input: ReverseTransferInput): Promise<TransferReversalResult> {
    return this.routeService.reverseTransfer(input);
  }

  getSettlementDetails(input: GetSettlementDetailsInput): Promise<SettlementDetails> {
    return this.routeService.getSettlementDetails(input);
  }

  openBillingAttempt(input: OpenBillingAttemptInput): Promise<BillingRetryAttempt> {
    return this.withInvoiceSync(this.retryService.openAttempt(input));
  }

  reportBillingFailure(input: ReportBillingFailureInput): Promise<BillingRetryAttempt> {
    return this.withInvoiceSync(this.retryService.reportFailure(input));
  }

  reportBillingRecovered(
    input: ReportBillingRecoveryInput,
  ): Promise<BillingRetryAttempt> {
    return this.withInvoiceSync(this.retryService.reportRecovered(input));
  }

  markBillingUncollectible(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt> {
    return this.withInvoiceSync(
      this.retryService.markUncollectible(referenceId, kind),
    );
  }

  processDueRetries(now?: Date): Promise<BillingRetryAttempt[]> {
    return this.retryService.processDueRetries(now);
  }

  getRetryAttempt(id: string): Promise<BillingRetryAttempt> {
    return this.retryService.getAttempt(id);
  }

  getRetryAttemptByReference(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt | null> {
    return this.retryService.getAttemptByReference(referenceId, kind);
  }

  listRetryAttempts(filter?: RetryAttemptFilter): Promise<BillingRetryAttempt[]> {
    return this.retryService.listAttempts(filter);
  }

  updateInvoiceStatus(
    invoiceId: string,
    status: Invoice["status"],
  ): Promise<Invoice> {
    return this.invoiceService.updateInvoiceStatus(invoiceId, status);
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    return this.webhookService.verifyWebhook(payload, signature);
  }

  private async withInvoiceSync(
    promise: Promise<BillingRetryAttempt>,
  ): Promise<BillingRetryAttempt> {
    const attempt = await promise;
    if (attempt.kind === "invoice") {
      const invoice = await this.invoiceService.getInvoice(attempt.referenceId);
      if (invoice) {
        await this.invoiceService.updateInvoiceStatus(
          attempt.referenceId,
          attempt.status,
        );
      }
    }
    return attempt;
  }
}
