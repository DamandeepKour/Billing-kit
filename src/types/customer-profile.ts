import type { Address, Customer } from "./invoice";

export type PaymentMethodType = "card" | "bank_account" | "upi" | "wallet" | "other";

export interface SavedPaymentMethod {
  id: string;
  type: PaymentMethodType;
  providerPaymentMethodId?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  isDefault?: boolean;
  createdAt: Date;
  metadata?: Record<string, string>;
}

export interface PaymentPreferences {
  defaultPaymentMethodId?: string;
  allowAutoCharge?: boolean;
  preferredPaymentMethodTypes?: PaymentMethodType[];
  invoiceDelivery?: "email" | "postal" | "both";
}

export interface CustomerBillingProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  gstin?: string;
  vatNumber?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  billingAddress: Address;
  defaultCurrency?: string;
  paymentPreferences: PaymentPreferences;
  paymentMethods: SavedPaymentMethod[];
  providerCustomerId?: string;
  billingNotes?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerProfileInput {
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  gstin?: string;
  vatNumber?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  billingAddress: Address;
  defaultCurrency?: string;
  paymentPreferences?: Partial<PaymentPreferences>;
  providerCustomerId?: string;
  billingNotes?: string;
  metadata?: Record<string, string>;
  syncProvider?: boolean;
}

export interface UpdateCustomerProfileInput {
  profileId: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  gstin?: string;
  vatNumber?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  billingAddress?: Address;
  defaultCurrency?: string;
  paymentPreferences?: Partial<PaymentPreferences>;
  providerCustomerId?: string;
  billingNotes?: string;
  metadata?: Record<string, string>;
}

export interface AttachProfilePaymentMethodInput {
  profileId: string;
  paymentMethodId: string;
  type?: PaymentMethodType;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  setAsDefault?: boolean;
  providerPaymentMethodId?: string;
  metadata?: Record<string, string>;
  syncProvider?: boolean;
}

export interface SetDefaultProfilePaymentMethodInput {
  profileId: string;
  paymentMethodId: string;
  syncProvider?: boolean;
}

export function profileToCustomer(profile: CustomerBillingProfile): Customer {
  return {
    id: profile.id,
    name: profile.companyName ?? profile.name,
    email: profile.email,
    phone: profile.phone,
    defaultCurrency: profile.defaultCurrency,
    gstin: profile.gstin,
    vatNumber: profile.vatNumber,
    customerTaxId: profile.customerTaxId,
    isBusinessCustomer: profile.isBusinessCustomer,
  };
}
