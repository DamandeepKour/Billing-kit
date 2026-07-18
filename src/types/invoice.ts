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
  /** Prefer this currency when invoice/payment currency is omitted */
  defaultCurrency?: string;
  /** India GST identification number */
  gstin?: string;
  /** EU / other VAT registration number */
  vatNumber?: string;
  /** Generic tax ID (GSTIN / VAT / EIN) */
  customerTaxId?: string;
  /** B2B — may trigger VAT reverse charge */
  isBusinessCustomer?: boolean;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
  /** Must match invoice currency when set */
  currency?: string;
  /** HSN / SAC code for GST invoices */
  hsnOrSac?: string;
}

export interface Discount {
  type: "percentage" | "flat";
  value: number;
  description?: string;
}

export type InvoiceTaxMode = "gst" | "vat" | "sales_tax" | "none";

export interface GenerateInvoiceInput {
  customer: Customer;
  billingAddress: Address;
  lineItems: LineItem[];
  discounts?: Discount[];
  taxRate?: number;
  taxType?: InvoiceTaxMode;
  /** @deprecated Prefer taxType */
  taxMode?: InvoiceTaxMode;
  country?: string;
  /** Buyer / place-of-supply state (defaults to billingAddress.state) */
  state?: string;
  placeOfSupply?: string;
  /** Override seller state for GST (defaults to config.tax.sellerState) */
  sellerState?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  /** Override config.tax.autoTax for this invoice */
  autoTax?: boolean;
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
