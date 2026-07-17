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
  /** India GST identification number */
  gstin?: string;
  /** EU / other VAT registration number */
  vatNumber?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
  /** HSN / SAC code for GST invoices */
  hsnOrSac?: string;
}

export interface Discount {
  type: "percentage" | "flat";
  value: number;
  description?: string;
}

export type InvoiceTaxMode = "gst" | "vat" | "none";

export interface GenerateInvoiceInput {
  customer: Customer;
  billingAddress: Address;
  lineItems: LineItem[];
  discounts?: Discount[];
  taxRate?: number;
  /** Override seller state for GST place-of-supply (defaults to config.tax.sellerState) */
  sellerState?: string;
  /** gst = CGST/SGST or IGST; vat = single VAT line; none = no tax */
  taxMode?: InvoiceTaxMode;
  notes?: string;
  currency?: string;
  /** Custom number; otherwise auto: INV-YYYY-00001 */
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
