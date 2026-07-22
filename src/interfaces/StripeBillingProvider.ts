import type {
  AttachPaymentMethodInput,
  CreateProviderCustomerInput,
  CustomerPaymentMethod,
  DetachPaymentMethodInput,
  ListCustomerInvoicesInput,
  ListCustomerSubscriptionsInput,
  ListPaymentMethodsInput,
  PaymentMethodResult,
  ProviderCustomer,
  ProviderInvoice,
  SetDefaultPaymentMethodInput,
} from "../types/provider";
import type {
  BillingPortalSession,
  CreateBillingPortalSessionInput,
  CreatePaymentMethodUpdateSessionInput,
} from "../types/billing-portal";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  Plan,
  ReportUsageInput,
  Subscription,
  UsageRecord,
} from "../types/subscription";
export interface StripeBillingProvider {
  createPlan(input: CreatePlanInput): Promise<Plan>;
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;
  scheduleCancellation(subscriptionId: string): Promise<Subscription>;
  renewSubscription(subscriptionId: string): Promise<Subscription>;
  pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription>;
  resumeSubscription(subscriptionId: string): Promise<Subscription>;
  retrieveSubscription(subscriptionId: string): Promise<Subscription>;
  createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer>;
  attachPaymentMethod(input: AttachPaymentMethodInput): Promise<PaymentMethodResult>;
  setDefaultPaymentMethod(input: SetDefaultPaymentMethodInput): Promise<ProviderCustomer>;
  detachPaymentMethod(input: DetachPaymentMethodInput): Promise<PaymentMethodResult>;
  listPaymentMethods(
    input: ListPaymentMethodsInput,
  ): Promise<CustomerPaymentMethod[]>;
  retrieveProviderInvoice(invoiceId: string): Promise<ProviderInvoice>;
  listCustomerInvoices(
    input: ListCustomerInvoicesInput,
  ): Promise<ProviderInvoice[]>;
  listCustomerSubscriptions(
    input: ListCustomerSubscriptionsInput,
  ): Promise<Subscription[]>;
  createBillingPortalSession(
    input: CreateBillingPortalSessionInput,
  ): Promise<BillingPortalSession>;
  createPaymentMethodUpdateSession(
    input: CreatePaymentMethodUpdateSessionInput,
  ): Promise<BillingPortalSession>;
  reportUsage(input: ReportUsageInput): Promise<UsageRecord>;
}
