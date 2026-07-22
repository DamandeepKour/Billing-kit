export interface CreateProviderCustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  metadata?: Record<string, string>;
  paymentMethodId?: string;
  setAsDefaultPaymentMethod?: boolean;
}
export interface ProviderCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  defaultPaymentMethodId?: string | null;
  provider: string;
  metadata?: Record<string, string>;
}
export interface AttachPaymentMethodInput {
  customerId: string;
  paymentMethodId: string;
}
export interface SetDefaultPaymentMethodInput {
  customerId: string;
  paymentMethodId: string;
}
export interface DetachPaymentMethodInput {
  paymentMethodId: string;
}
export interface ListPaymentMethodsInput {
  customerId: string;
  type?: string;
  limit?: number;
}
export interface PaymentMethodResult {
  id: string;
  customerId: string;
  type?: string;
  provider: string;
}
export interface CustomerPaymentMethod {
  id: string;
  customerId: string;
  type: string;
  brand?: string | null;
  last4?: string | null;
  expMonth?: number | null;
  expYear?: number | null;
  isDefault?: boolean;
  provider: string;
}
export interface ProviderInvoice {
  id: string;
  customerId: string;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  subscriptionId?: string | null;
  provider: string;
  createdAt?: Date;
}
export interface ListCustomerInvoicesInput {
  customerId: string;
  status?: "draft" | "open" | "paid" | "uncollectible" | "void";
  limit?: number;
  startingAfter?: string;
}
export interface ListCustomerSubscriptionsInput {
  customerId: string;
  /**
   * Stripe subscription status filter. Defaults to `"active"` for
   * `listActiveSubscriptions`. Pass `"all"` to omit the status filter.
   */
  status?:
    | "active"
    | "all"
    | "canceled"
    | "past_due"
    | "trialing"
    | "unpaid"
    | "paused"
    | "incomplete"
    | "incomplete_expired"
    | "ended";
  limit?: number;
  startingAfter?: string;
}
