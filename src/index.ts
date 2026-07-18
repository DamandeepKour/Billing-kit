export { BillingKit } from "./core/BillingKit";

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
  InvoiceTaxMode,
  LineItem,
  PaymentResult,
  PaymentStatus,
  Plan,
  RecordTransactionInput,
  RefundPaymentInput,
  RefundResult,
  SalesTaxInput,
  Subscription,
  TaxBreakdown,
  TaxCalculationInput,
  TaxConfig,
  TaxLine,
  TaxType,
  Transaction,
  UpdatePlanInput,
  VATInput,
  WebhookEvent,
} from "./types";

export { TransactionType } from "./types";

export type {
  InvoiceRepository,
  PaymentGateway,
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
