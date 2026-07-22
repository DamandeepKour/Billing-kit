import type { BillingKitConfig } from "../types/config";
import type {
  AuditLogEntry,
  AuditLogFilter,
  RecordBillingEventInput,
} from "../types/audit";
import type {
  CustomerEntitlement,
  CustomerFeatureAccess,
  PlanFeatureMapping,
  RevokeFeatureAccessInput,
  SetPlanFeaturesInput,
  SyncSubscriptionEntitlementsInput,
} from "../types/entitlement";
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
import type {
  GenerateInvoiceInput,
  Invoice,
  InvoiceSummary,
  LineItem,
} from "../types/invoice";
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
import type {
  ProcessWebhookResult,
  RawWebhookRequest,
  WebhookEvent,
  WebhookEventHandler,
  WebhookEventRecord,
} from "../types/webhook";
import type {
  AggregateUsageEventsInput,
  GenerateUsageInvoiceInput,
  GenerateUsageInvoiceResult,
  PricedUsage,
  RecordUsageEventInput,
  UsageAggregate,
  UsageEvent,
  UsageEventFilter,
  UsagePrice,
  UsageToLineItemsInput,
} from "../types/usage";
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
  TransferRequestFilter,
  TransferRequestRecord,
  TransferReversalResult,
  TransferResult,
} from "../types/route";
import { AuditLogService } from "../audit";
import { CouponService } from "../coupon";
import { CustomerProfileService } from "../customer";
import { EntitlementService } from "../entitlement";
import { InvoiceService } from "../invoice";
import { InvoicePdfGenerator } from "../pdf";
import { PaymentManager, PaymentService } from "../payment";
import type { IdempotencyRequestRepository } from "../interfaces/IdempotencyRequestRepository";
import type {
  IdempotencyRequestFilter,
  IdempotencyRequestRecord,
} from "../types/idempotency";
import {
  InMemoryAuditLogRepository,
  InMemoryCustomerProfileRepository,
  InMemoryEntitlementRepository,
  InMemoryIdempotencyRequestRepository,
  InMemoryInvoiceRepository,
  InMemoryRetryAttemptRepository,
  InMemoryTransferRequestRepository,
  InMemoryTransactionRepository,
  InMemoryWebhookEventRepository,
  InMemoryUsageEventRepository,
} from "../repositories";
import { RefundService } from "../refund";
import { RetryService } from "../retry";
import { RouteService } from "../route";
import { SubscriptionService } from "../subscription";
import { TaxService } from "../tax";
import { TransactionService } from "../transaction";
import { UsageBillingService } from "../usage";
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
  private readonly auditLogService: AuditLogService;
  private readonly usageBillingService: UsageBillingService;
  private readonly entitlementService: EntitlementService;
  private readonly idempotencyRequests: IdempotencyRequestRepository;

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
    const auditLogRepository =
      this.config.auditLogRepository ?? new InMemoryAuditLogRepository();
    const webhookEventRepository =
      this.config.webhookEventRepository ??
      new InMemoryWebhookEventRepository();
    const usageEventRepository =
      this.config.usageEventRepository ?? new InMemoryUsageEventRepository();
    const entitlementRepository =
      this.config.entitlementRepository ??
      new InMemoryEntitlementRepository();
    const transferRequestRepository =
      this.config.transferRequestRepository ??
      new InMemoryTransferRequestRepository();
    this.idempotencyRequests =
      this.config.idempotencyRequestRepository ??
      new InMemoryIdempotencyRequestRepository();
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
      this.idempotencyRequests,
    );
    this.refundService = new RefundService(gateway, this.idempotencyRequests);
    this.subscriptionService = new SubscriptionService(gateway, this.couponService);
    this.taxService = new TaxService();
    this.transactionService = new TransactionService(transactionRepository);
    this.webhookService = new WebhookService(gateway, webhookEventRepository);
    this.pdfGenerator = new InvoicePdfGenerator(this.config);
    this.retryService = new RetryService(
      retryAttemptRepository,
      this.config.retry,
      this.config.retryHooks,
    );
    this.routeService = new RouteService(
      gateway,
      this.transactionService,
      transferRequestRepository,
    );
    this.auditLogService = new AuditLogService(
      auditLogRepository,
      this.config.provider,
      this.config.auditActor,
    );
    this.usageBillingService = new UsageBillingService(usageEventRepository);
    this.entitlementService = new EntitlementService(entitlementRepository);
  }

  generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    return this.withAudit(
      () => this.invoiceService.generateInvoice(input),
      (invoice) => ({
        action: "invoice.created",
        resourceType: "invoice",
        resourceId: invoice.id,
        payload: {
          invoiceNumber: invoice.number,
          status: invoice.status,
          total: invoice.total,
          currency: invoice.currency,
          customerEmail: invoice.customer?.email,
        },
      }),
    );
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
    return this.withPaymentAudit(
      () => this.paymentService.createPayment(input),
      "payment.attempted",
      input,
    );
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
    return this.withPaymentAudit(
      () => this.paymentService.capturePayment(input),
      "payment.captured",
      { paymentId: input.paymentId, amount: input.amount },
    );
  }

  cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.withPaymentAudit(
      () => this.paymentService.cancelPayment(paymentId),
      "payment.cancelled",
      { paymentId },
    );
  }

  getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.paymentService.getPaymentStatus(paymentId);
  }

  refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    return this.withAudit(
      () => this.refundService.refundPayment(input),
      (refund) => ({
        action: "refund.created",
        resourceType: "refund",
        resourceId: refund.id,
        relatedResourceIds: [input.paymentId],
        payload: {
          paymentId: input.paymentId,
          amount: refund.amount,
          status: refund.status,
        },
      }),
      async (error) => {
        await this.auditLogService.recordBillingEvent({
          action: "refund.created",
          resourceType: "refund",
          resourceId: input.paymentId,
          relatedResourceIds: [input.paymentId],
          payload: {
            paymentId: input.paymentId,
            amount: input.amount,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        });
      },
    );
  }

  async createPlan(input: CreatePlanInput): Promise<Plan> {
    const plan = await this.subscriptionService.createPlan(input);
    if (input.features) {
      await this.entitlementService.setPlanFeatures({
        planId: plan.id,
        features: input.features,
      });
    }
    return input.features ? { ...plan, features: input.features } : plan;
  }

  updatePlan(input: UpdatePlanInput): Promise<Plan> {
    return this.subscriptionService.updatePlan(input);
  }

  cancelPlan(planId: string): Promise<Plan> {
    return this.subscriptionService.cancelPlan(planId);
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.createSubscription(input);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_create",
    });
    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.cancelSubscription(subscriptionId);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_cancel",
    });
    return subscription;
  }

  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.renewSubscription(subscriptionId);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_renew",
    });
    return subscription;
  }

  async pauseSubscription(
    input: PauseSubscriptionInput,
  ): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.pauseSubscription(input);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_pause",
    });
    return subscription;
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.resumeSubscription(subscriptionId);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_resume",
    });
    return subscription;
  }

  async retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription =
      await this.subscriptionService.retrieveSubscription(subscriptionId);
    await this.entitlementService.syncSubscriptionEntitlements({
      subscription,
      source: "subscription_retrieve",
    });
    return subscription;
  }

  setPlanFeatures(
    input: SetPlanFeaturesInput,
  ): Promise<PlanFeatureMapping> {
    return this.entitlementService.setPlanFeatures(input);
  }

  getPlanFeatures(planId: string): Promise<PlanFeatureMapping | null> {
    return this.entitlementService.getPlanFeatures(planId);
  }

  hasFeature(customerId: string, featureKey: string): Promise<boolean> {
    return this.entitlementService.hasFeature(customerId, featureKey);
  }

  listFeatures(customerId: string): Promise<string[]> {
    return this.entitlementService.listFeatures(customerId);
  }

  getCustomerFeatureAccess(
    customerId: string,
  ): Promise<CustomerFeatureAccess> {
    return this.entitlementService.getCustomerFeatureAccess(customerId);
  }

  getSubscriptionEntitlement(
    subscriptionId: string,
  ): Promise<CustomerEntitlement | null> {
    return this.entitlementService.getSubscriptionEntitlement(subscriptionId);
  }

  syncSubscriptionEntitlements(
    input: SyncSubscriptionEntitlementsInput,
  ): Promise<CustomerEntitlement | null> {
    return this.entitlementService.syncSubscriptionEntitlements(input);
  }

  revokeFeatureAccess(
    input: RevokeFeatureAccessInput,
  ): Promise<CustomerEntitlement[]> {
    return this.entitlementService.revokeFeatureAccess(input);
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

  recordUsageEvent(input: RecordUsageEventInput): Promise<UsageEvent> {
    return this.withAudit(
      () => this.usageBillingService.recordUsageEvent(input),
      (event) => ({
        action: "usage.recorded",
        resourceType: "usage",
        resourceId: event.id,
        relatedResourceIds: [
          event.customerId,
          ...(event.subscriptionId ? [event.subscriptionId] : []),
        ],
        payload: {
          meter: event.meter,
          quantity: event.quantity,
          timestamp: event.timestamp.toISOString(),
          customerId: event.customerId,
          subscriptionId: event.subscriptionId,
        },
      }),
    );
  }

  getUsageEvent(id: string): Promise<UsageEvent | null> {
    return this.usageBillingService.getUsageEvent(id);
  }

  listUsageEvents(filter?: UsageEventFilter): Promise<UsageEvent[]> {
    return this.usageBillingService.listUsageEvents(filter);
  }

  aggregateUsage(
    input: AggregateUsageEventsInput,
  ): Promise<UsageAggregate[]> {
    return this.usageBillingService.aggregateUsage(input);
  }

  priceUsage(
    aggregates: UsageAggregate[],
    prices: UsagePrice[],
  ): PricedUsage[] {
    return this.usageBillingService.priceUsage(aggregates, prices);
  }

  usageToInvoiceLineItems(input: UsageToLineItemsInput): LineItem[] {
    return this.usageBillingService.usageToInvoiceLineItems(input);
  }

  async generateUsageInvoice(
    input: GenerateUsageInvoiceInput,
  ): Promise<GenerateUsageInvoiceResult> {
    const {
      usage,
      prices,
      descriptionPrefix,
      ...invoiceInput
    } = input;
    const aggregates = await this.usageBillingService.aggregateUsage(usage);
    const lineItems = this.usageBillingService.usageToInvoiceLineItems({
      aggregates,
      prices,
      descriptionPrefix,
    });
    const invoice = await this.generateInvoice({
      ...invoiceInput,
      lineItems,
    });
    return { invoice, aggregates, lineItems };
  }

  calculateGST(input: GSTInput): TaxBreakdown {
    const rate = input.rate ?? this.config.tax?.defaultRate;
    const breakdown = this.taxService.calculateGST({ ...input, rate });
    this.queueAudit({
      action: "tax.calculated",
      resourceType: "tax",
      resourceId: `gst_${Date.now()}`,
      payload: {
        taxType: "gst",
        amount: input.amount,
        totalTax: breakdown.totalTax,
        total: breakdown.total,
        taxPercent: breakdown.taxPercent,
        sellerState: input.sellerState,
        buyerState: input.buyerState,
      },
    });
    return breakdown;
  }

  calculateVAT(input: VATInput): TaxBreakdown {
    const breakdown = this.taxService.calculateVAT(input);
    this.queueAudit({
      action: "tax.calculated",
      resourceType: "tax",
      resourceId: `vat_${Date.now()}`,
      payload: {
        taxType: "vat",
        amount: input.amount,
        totalTax: breakdown.totalTax,
        total: breakdown.total,
        taxPercent: breakdown.taxPercent,
        country: input.country,
      },
    });
    return breakdown;
  }

  calculateTax(input: TaxCalculationInput): TaxBreakdown {
    const breakdown = this.taxService.calculate({
      ...input,
      rate: input.rate ?? this.config.tax?.defaultRate,
      autoTax: input.autoTax ?? this.config.tax?.autoTax,
      sellerState: input.sellerState ?? this.config.tax?.sellerState,
      country: input.country ?? this.config.tax?.sellerCountry ?? input.country,
    });
    this.queueAudit({
      action: "tax.calculated",
      resourceType: "tax",
      resourceId: `tax_${Date.now()}`,
      payload: {
        taxType: breakdown.taxType ?? input.taxType,
        amount: input.amount,
        totalTax: breakdown.totalTax,
        total: breakdown.total,
        taxPercent: breakdown.taxPercent,
      },
    });
    return breakdown;
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

  removePromotionCode(input: {
    amount: number;
    currency?: string;
  }): CheckoutDiscountResult {
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
    return this.withAudit(
      () => this.transactionService.recordTransaction(input),
      (txn) => ({
        action: "transaction.recorded",
        resourceType: "transaction",
        resourceId: txn.id,
        relatedResourceIds: txn.referenceId ? [txn.referenceId] : undefined,
        payload: {
          type: txn.type,
          amount: txn.amount,
          currency: txn.currency,
          status: txn.status,
          referenceId: txn.referenceId,
        },
      }),
    );
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

  getTransferRequest(
    idempotencyKey: string,
  ): Promise<TransferRequestRecord | null> {
    return this.routeService.getTransferRequest(idempotencyKey);
  }

  listTransferRequests(
    filter?: TransferRequestFilter,
  ): Promise<TransferRequestRecord[]> {
    return this.routeService.listTransferRequests(filter);
  }

  reconcileTransferRequest(
    idempotencyKey: string,
  ): Promise<TransferRequestRecord | null> {
    return this.routeService.reconcileTransferRequest(idempotencyKey);
  }

  getIdempotencyRequest(
    idempotencyKey: string,
  ): Promise<IdempotencyRequestRecord | null> {
    return this.idempotencyRequests.findByKey(idempotencyKey);
  }

  listIdempotencyRequests(
    filter?: IdempotencyRequestFilter,
  ): Promise<IdempotencyRequestRecord[]> {
    return this.idempotencyRequests.list(filter);
  }

  openBillingAttempt(input: OpenBillingAttemptInput): Promise<BillingRetryAttempt> {
    return this.withInvoiceSync(this.retryService.openAttempt(input));
  }

  async reportBillingFailure(
    input: ReportBillingFailureInput,
  ): Promise<BillingRetryAttempt> {
    const attempt = await this.withInvoiceSync(
      this.retryService.reportFailure(input),
    );
    await this.revokeForBillingAttempt(attempt);
    return attempt;
  }

  async reportBillingRecovered(
    input: ReportBillingRecoveryInput,
  ): Promise<BillingRetryAttempt> {
    const attempt = await this.withInvoiceSync(
      this.retryService.reportRecovered(input),
    );
    await this.entitlementService.restoreAfterPayment(
      attempt.customerId,
      attempt.metadata?.subscriptionId,
    );
    return attempt;
  }

  async markBillingUncollectible(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt> {
    const attempt = await this.withInvoiceSync(
      this.retryService.markUncollectible(referenceId, kind),
    );
    await this.revokeForBillingAttempt(attempt);
    return attempt;
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
    return this.withAudit(
      () => this.invoiceService.updateInvoiceStatus(invoiceId, status),
      (invoice) => ({
        action: "invoice.status_updated",
        resourceType: "invoice",
        resourceId: invoice.id,
        payload: {
          invoiceNumber: invoice.number,
          status: invoice.status,
        },
      }),
    );
  }

  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent {
    const event = this.webhookService.verifyWebhook(payload, signature);
    this.queueAudit({
      action: "webhook.received",
      resourceType: "webhook",
      resourceId: event.id,
      actor: { type: "webhook", id: event.provider },
      relatedResourceIds: event.entity?.id ? [event.entity.id] : undefined,
      payload: {
        type: event.type,
        normalizedType: event.normalizedType,
        entityKind: event.entity?.kind,
        entityId: event.entity?.id,
        entityStatus: event.entity?.status,
      },
    });
    return event;
  }

  async processWebhook(
    request: RawWebhookRequest,
    handler: WebhookEventHandler,
  ): Promise<ProcessWebhookResult> {
    const result = await this.webhookService.processWebhook(
      request,
      async (event) => {
        await this.entitlementService.syncWebhookEvent(event);
        await handler(event);
      },
    );
    this.queueAudit({
      action: "webhook.received",
      resourceType: "webhook",
      resourceId: result.record.eventId,
      actor: { type: "webhook", id: result.event.provider },
      relatedResourceIds: result.event.entity.id
        ? [result.event.entity.id]
        : undefined,
      payload: {
        type: result.event.type,
        normalizedType: result.event.normalizedType,
        entityKind: result.event.entity.kind,
        entityId: result.event.entity.id,
        processingStatus: result.record.status,
        duplicate: result.duplicate,
        outOfOrder: result.outOfOrder,
      },
    });
    return result;
  }

  createRawWebhookHandler(
    handler: WebhookEventHandler,
  ): (request: RawWebhookRequest) => Promise<ProcessWebhookResult> {
    return (request) => this.processWebhook(request, handler);
  }

  listWebhookEvents(): Promise<WebhookEventRecord[]> {
    return this.webhookService.listWebhookEvents();
  }

  recordBillingEvent(input: RecordBillingEventInput): Promise<AuditLogEntry> {
    return this.auditLogService.recordBillingEvent({
      ...input,
      provider: input.provider ?? this.config.provider,
    });
  }

  getInvoiceTimeline(invoiceId: string): Promise<AuditLogEntry[]> {
    return this.auditLogService.getInvoiceTimeline(invoiceId);
  }

  getPaymentAuditLog(paymentId: string): Promise<AuditLogEntry[]> {
    return this.auditLogService.getPaymentAuditLog(paymentId);
  }

  listAuditEvents(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    return this.auditLogService.listAuditEvents(filter);
  }

  getAuditEvent(id: string): Promise<AuditLogEntry | null> {
    return this.auditLogService.getAuditEvent(id);
  }

  private async revokeForBillingAttempt(
    attempt: BillingRetryAttempt,
  ): Promise<void> {
    const subscriptionId = attempt.metadata?.subscriptionId;
    if (!attempt.customerId && !subscriptionId) return;
    await this.entitlementService.revokeFeatureAccess({
      customerId: attempt.customerId,
      subscriptionId,
      source: "payment_failure",
      reason: attempt.lastFailureReason ?? attempt.status,
    });
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

  private queueAudit(input: RecordBillingEventInput): void {
    void this.auditLogService.recordBillingEvent(input).catch(() => undefined);
  }

  private async withAudit<T>(
    run: () => Promise<T>,
    toEvent: (result: T) => RecordBillingEventInput,
    onError?: (error: unknown) => Promise<void>,
  ): Promise<T> {
    try {
      const result = await run();
      await this.auditLogService.recordBillingEvent(toEvent(result));
      return result;
    } catch (error) {
      if (onError) await onError(error);
      throw error;
    }
  }

  private async withPaymentAudit(
    run: () => Promise<PaymentResult>,
    action: "payment.attempted" | "payment.captured" | "payment.cancelled",
    input: { paymentId?: string; amount?: number; currency?: string },
  ): Promise<PaymentResult> {
    try {
      const result = await run();
      await this.auditLogService.recordBillingEvent({
        action,
        resourceType: "payment",
        resourceId: result.id,
        payload: {
          amount: result.amount,
          currency: result.currency,
          status: result.status,
        },
      });
      return result;
    } catch (error) {
      await this.auditLogService.recordBillingEvent({
        action: "payment.failed",
        resourceType: "payment",
        resourceId: input.paymentId ?? "unknown",
        payload: {
          amount: input.amount,
          currency: input.currency,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }
}
