export interface GSTInput {
  amount: number;
  rate?: number;
  sellerState: string;
  buyerState: string;
}

export interface VATInput {
  amount: number;
  rate?: number;
}

export interface TaxBreakdown {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  totalTax: number;
  total: number;
}

export interface CustomTaxRule {
  name: string;
  rate: number;
  apply: (amount: number) => number;
}
