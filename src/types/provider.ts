/** Provider-hosted customer (Stripe Customer, etc.) — distinct from invoice Customer. */
export interface CreateProviderCustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  metadata?: Record<string, string>;
  /** Attach and optionally set as default when creating */
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

/** Provider invoice (e.g. Stripe Invoice), not a local billing-kit invoice. */
export interface ProviderInvoice {
  id: string;
  customerId: string;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  /** Hosted invoice page URL (Stripe `hosted_invoice_url`) */
  hostedInvoiceUrl?: string | null;
  /** PDF download URL (Stripe `invoice_pdf`) */
  invoicePdfUrl?: string | null;
  subscriptionId?: string | null;
  provider: string;
}
