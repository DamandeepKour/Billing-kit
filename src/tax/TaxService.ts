import type { GSTInput, TaxBreakdown, VATInput } from "../types/tax";
import { roundAmount } from "../utils/currency";

function emptyBreakdown(amount: number): TaxBreakdown {
  return {
    taxableAmount: amount,
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat: 0,
    totalTax: 0,
    total: amount,
  };
}

export function calculateGST(input: GSTInput): TaxBreakdown {
  const { amount, sellerState, buyerState } = input;
  const rate = input.rate ?? 0;

  if (amount < 0 || rate < 0) {
    throw new Error("Amount and rate must be non-negative");
  }

  const totalTax = roundAmount((amount * rate) / 100);
  const sameState = sellerState.toUpperCase() === buyerState.toUpperCase();

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (sameState && totalTax > 0) {
    cgst = roundAmount(totalTax / 2);
    sgst = totalTax - cgst;
  } else if (totalTax > 0) {
    igst = totalTax;
  }

  return {
    taxableAmount: amount,
    cgst,
    sgst,
    igst,
    vat: 0,
    totalTax,
    total: amount + totalTax,
  };
}

export function calculateVAT(input: VATInput): TaxBreakdown {
  const { amount } = input;
  const rate = input.rate ?? 0;

  if (amount < 0 || rate < 0) {
    throw new Error("Amount and rate must be non-negative");
  }

  const vat = roundAmount((amount * rate) / 100);

  return {
    taxableAmount: amount,
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat,
    totalTax: vat,
    total: amount + vat,
  };
}

export class TaxService {
  calculateGST(input: GSTInput): TaxBreakdown {
    return calculateGST(input);
  }

  calculateVAT(input: VATInput): TaxBreakdown {
    return calculateVAT(input);
  }

  applyCustomRule(amount: number, rule: { name: string; rate: number; apply: (a: number) => number }): TaxBreakdown {
    const totalTax = roundAmount(rule.apply(amount));
    return {
      ...emptyBreakdown(amount),
      totalTax,
      total: amount + totalTax,
    };
  }
}
