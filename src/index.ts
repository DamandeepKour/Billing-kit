export { BillingKit } from "./core/BillingKit";

export type {
  Address,
  AggregateUsage,
  ApplyCouponInput,
  AttachPaymentMethodInput,
  BillingInterval,
  BillingKitConfig,
  BillingProvider,
  CapturePaymentInput,
  CompanyDetails,
  Coupon,
  CouponResult,
  CouponType,
  CreateOrderInput,
  CreatePaymentInput,
  CreatePlanInput,
  CreateProviderCustomerInput,
  CreateSubscriptionInput,
  Customer,
  Discount,
  GenerateInvoiceInput,
  GeneratePdfInput,
  GSTInput,
  Invoice,
  InvoiceSummary,
  InvoiceTaxMode,
  LineItem,
  NormalizedWebhookType,
  OrderResult,
  PauseCollectionBehavior,
  PauseSubscriptionInput,
  PaymentMethodResult,
  PaymentResult,
  PaymentStatus,
  Plan,
  ProviderCustomer,
  ProviderInvoice,
  RazorpayWebhookEventName,
  RecordTransactionInput,
  RefundPaymentInput,
  RefundResult,
  ReportingFilter,
  ReportUsageInput,
  RevenueByCurrencyRow,
  SalesTaxInput,
  SetDefaultPaymentMethodInput,
  SettlementFields,
  SettlementSummary,
  ExchangeRateMetadata,
  FeeBreakdown,
  Subscription,
  TaxBreakdown,
  TaxCalculationInput,
  TaxConfig,
  TaxLine,
  TaxType,
  Transaction,
  UpdatePlanInput,
  UsageRecord,
  UsageType,
  VATInput,
  VerifyPaymentSignatureInput,
  WebhookEntity,
  WebhookEntityKind,
  WebhookEvent,
} from "./types";

export {
  RAZORPAY_WEBHOOK_EVENTS,
  TransactionStatus,
  TransactionType,
} from "./types";

export type {
  InvoiceRepository,
  PaymentGateway,
  RazorpayBillingProvider,
  StripeBillingProvider,
  TransactionRepository,
} from "./interfaces";

export {
  InMemoryInvoiceRepository,
  InMemoryTransactionRepository,
} from "./repositories";

export {
  BillingKitError,
  CouponError,
  CurrencyMismatchError,
  InvalidConfigError,
  InvoiceNotFoundError,
  PaymentError,
  TransactionNotFoundError,
  UnsupportedCurrencyError,
  WebhookVerificationError,
} from "./utils/errors";

export {
  StripeAuthenticationError,
  StripeCardError,
  StripeInvalidRequestError,
  UnsupportedOperationError,
  mapStripeError,
} from "./utils/stripe-errors";

export {
  SUPPORTED_CURRENCIES,
  assertSupportedCurrency,
  convertSmallestUnit,
  formatAmount,
  fromMinorUnits,
  isSupportedCurrency,
  normalizeCurrency,
  resolveCurrency,
  toMinorUnits,
} from "./utils/currency";

export type { SupportedCurrency } from "./utils/currency";

export {
  calculateFeeBreakdown,
  normalizeSettlementFields,
} from "./utils/settlement";

export {
  TaxEngine,
  TaxService,
  calculateGST,
  calculateVAT,
  calculateSalesTax,
} from "./tax";
