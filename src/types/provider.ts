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
export interface PaymentMethodResult {
  id: string;
  customerId: string;
  type?: string;
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
}
