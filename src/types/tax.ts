export interface TaxCalculationInput {
  amount: number;
  rate?: number;
  sellerState: string;
  buyerState: string;
}

export interface TaxBreakdown {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
}
