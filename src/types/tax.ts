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
  placeOfSupply?: string;
  sellerState?: string;
  buyerState?: string;
  reverseCharge?: boolean;
}
