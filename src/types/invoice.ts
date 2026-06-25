import type { TaxBreakdown } from "./tax";

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
}

export interface Discount {
  type: "percentage" | "flat";
  value: number;
  description?: string;
}

export interface GenerateInvoiceInput {
  customer: Customer;
  billingAddress: Address;
  lineItems: LineItem[];
  discounts?: Discount[];
  taxRate?: number;
  sellerState?: string;
  notes?: string;
  currency?: string;
  invoiceNumber?: string;
}

export interface InvoiceSummary {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  tax: TaxBreakdown;
  total: number;
  currency: string;
}

export interface Invoice extends InvoiceSummary {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "void";
  customer: Customer;
  billingAddress: Address;
  lineItems: LineItem[];
  discounts: Discount[];
  notes?: string;
  createdAt: Date;
}
