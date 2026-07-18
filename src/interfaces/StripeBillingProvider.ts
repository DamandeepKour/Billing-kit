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
  UsageRecord,
} from "../types/subscription";

/**
 * Stripe-specific billing surface (customers, Prices, pause/resume, hosted invoices, metered usage).
 * Implemented by {@link StripeGateway}; access via BillingKit when `provider: "stripe"`.
 */
export interface StripeBillingProvider {
  createPlan(input: CreatePlanInput): Promise<Plan>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  renewSubscription(subscriptionId: string): Promise<Subscription>;

  pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription>;
  resumeSubscription(subscriptionId: string): Promise<Subscription>;
  retrieveSubscription(subscriptionId: string): Promise<Subscription>;

  createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer>;
  attachPaymentMethod(input: AttachPaymentMethodInput): Promise<PaymentMethodResult>;
  setDefaultPaymentMethod(
    input: SetDefaultPaymentMethodInput,
  ): Promise<ProviderCustomer>;

  retrieveProviderInvoice(invoiceId: string): Promise<ProviderInvoice>;

  /** Report usage against a metered subscription item. */
  reportUsage(input: ReportUsageInput): Promise<UsageRecord>;
}
