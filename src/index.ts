export { BillingKit } from "./core";

export type {
  Address,
  ApplyCouponInput,
  BillingInterval,
  BillingKitConfig,
  BillingProvider,
  CapturePaymentInput,
  CompanyDetails,
  Coupon,
  CouponResult,
  CouponType,
  CreatePaymentInput,
  CreatePlanInput,
  CreateSubscriptionInput,
  Customer,
  Discount,
  GenerateInvoiceInput,
  GeneratePdfInput,
  GSTInput,
  Invoice,
  InvoiceSummary,
  LineItem,
  PaymentResult,
  PaymentStatus,
  Plan,
  RecordTransactionInput,
  RefundPaymentInput,
  RefundResult,
  Subscription,
  TaxBreakdown,
  TaxConfig,
  Transaction,
  UpdatePlanInput,
  VATInput,
  WebhookEvent,
} from "./types";

export { TransactionType } from "./types";

export type { PaymentGateway } from "./interfaces";
export type { InvoiceRepository, TransactionRepository } from "./interfaces";

export {
  BillingKitError,
  CouponError,
  InvalidConfigError,
  PaymentError,
  TransactionNotFoundError,
  InvoiceNotFoundError,
  WebhookVerificationError,
} from "./utils";

export {
  TaxService,
  calculateGST,
  calculateVAT,
  CouponService,
  InvoiceService,
  InvoiceNumberGenerator,
  PaymentGatewayFactory,
  PaymentManager,
  StripeGateway,
  RazorpayGateway,
  RefundService,
  SubscriptionService,
  TransactionService,
  WebhookService,
  InvoicePdfGenerator,
  InMemoryInvoiceRepository,
  InMemoryTransactionRepository,
} from "./modules";
