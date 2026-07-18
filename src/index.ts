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
  PauseCollectionBehavior,
  PauseSubscriptionInput,
  PaymentMethodResult,
  PaymentResult,
  PaymentStatus,
  Plan,
  ProviderCustomer,
  ProviderInvoice,
  RecordTransactionInput,
  RefundPaymentInput,
  RefundResult,
  ReportUsageInput,
  SalesTaxInput,
  SetDefaultPaymentMethodInput,
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
  WebhookEvent,
} from "./types";

export { TransactionType } from "./types";

export type {
  InvoiceRepository,
  PaymentGateway,
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
  TaxEngine,
  TaxService,
  calculateGST,
  calculateVAT,
  calculateSalesTax,
} from "./tax";
