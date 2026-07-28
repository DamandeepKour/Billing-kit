export type TaxType = "gst" | "vat" | "sales_tax" | "none";

export interface TaxLine {
  name: string;
  rate: number;
  amount: number;
}

export interface GSTInput {
  amount: number;
  rate?: number;
  sellerState: string;
  buyerState: string;
  /** Buyer GSTIN / tax registration id (stored on the breakdown). */
  customerTaxId?: string;
}

export interface VATInput {
  amount: number;
  rate?: number;
  isBusinessCustomer?: boolean;
  customerTaxId?: string;
  country?: string;
}

export interface SalesTaxInput {
  amount: number;
  rate?: number;
  state: string;
  country?: string;
  customerTaxId?: string;
}

export interface TaxCalculationInput {
  amount: number;
  taxType?: TaxType;
  rate?: number;
  country?: string;
  state?: string;
  sellerState?: string;
  buyerState?: string;
  placeOfSupply?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  /** When true, detect GST / VAT / sales tax from `country`. */
  autoTax?: boolean;
}

export interface TaxBreakdown {
  taxableAmount: number;
  taxPercent: number;
  taxType: TaxType;
  taxLines: TaxLine[];
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  salesTax: number;
  totalTax: number;
  total: number;
  country?: string;
  /** Normalized region / state used for regional rules. */
  region?: string;
  placeOfSupply?: string;
  sellerState?: string;
  buyerState?: string;
  customerTaxId?: string;
  reverseCharge?: boolean;
}

/** Invoice-facing tax summary (same fields as breakdown, explicit contract). */
export type TaxSummary = Pick<
  TaxBreakdown,
  | "taxType"
  | "taxableAmount"
  | "taxPercent"
  | "totalTax"
  | "total"
  | "taxLines"
  | "cgst"
  | "sgst"
  | "igst"
  | "vat"
  | "salesTax"
  | "placeOfSupply"
  | "sellerState"
  | "buyerState"
  | "country"
  | "region"
  | "customerTaxId"
  | "reverseCharge"
>;

export interface TaxLineItemBreakdown {
  id?: string;
  description?: string;
  taxableAmount: number;
  tax: TaxBreakdown;
  total: number;
}
