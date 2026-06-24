import type { TaxBreakdown, TaxCalculationInput } from "../types/tax";

function roundAmount(value: number): number {
  return Math.round(value);
}

export function calculateGST(input: TaxCalculationInput): TaxBreakdown {
  const { amount, sellerState, buyerState } = input;
  const rate = input.rate ?? 0;

  if (amount < 0) {
    throw new Error("Tax amount must be non-negative");
  }

  if (rate < 0) {
    throw new Error("Tax rate must be non-negative");
  }

  const totalTax = roundAmount((amount * rate) / 100);
  const sameState = sellerState.toUpperCase() === buyerState.toUpperCase();

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (sameState) {
    cgst = roundAmount(totalTax / 2);
    sgst = totalTax - cgst;
  } else {
    igst = totalTax;
  }

  return {
    taxableAmount: amount,
    cgst,
    sgst,
    igst,
    totalTax,
    total: amount + totalTax,
  };
}
