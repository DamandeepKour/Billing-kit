import type {
  GSTInput,
  SalesTaxInput,
  TaxBreakdown,
  TaxCalculationInput,
  TaxLine,
  TaxType,
  VATInput,
} from "../types/tax";
import { roundAmount } from "../utils/currency";

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE",
]);

/** Simplified US state sales-tax rates (%) for autoTax demos */
const US_SALES_TAX_RATES: Record<string, number> = {
  CA: 7.25,
  NY: 8,
  TX: 6.25,
  FL: 6,
  WA: 6.5,
};

const EU_VAT_RATES: Record<string, number> = {
  DE: 19,
  FR: 20,
  IE: 23,
  NL: 21,
  ES: 21,
  IT: 22,
  default: 20,
};

function emptyBreakdown(
  amount: number,
  extras: Partial<TaxBreakdown> = {},
): TaxBreakdown {
  return {
    taxableAmount: amount,
    taxPercent: 0,
    taxType: "none",
    taxLines: [],
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat: 0,
    salesTax: 0,
    totalTax: 0,
    total: amount,
    ...extras,
  };
}

function assertNonNegative(amount: number, rate: number): void {
  if (amount < 0 || rate < 0) {
    throw new Error("Amount and rate must be non-negative");
  }
}

function normalizeCode(value?: string): string {
  return (value ?? "").trim().toUpperCase();
}

export function calculateGST(input: GSTInput): TaxBreakdown {
  const { amount, sellerState, buyerState } = input;
  const rate = input.rate ?? 0;
  assertNonNegative(amount, rate);

  const seller = normalizeCode(sellerState);
  const buyer = normalizeCode(buyerState);
  const totalTax = roundAmount((amount * rate) / 100);
  const sameState = seller === buyer && seller.length > 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const taxLines: TaxLine[] = [];

  if (sameState && totalTax > 0) {
    const halfRate = rate / 2;
    cgst = roundAmount(totalTax / 2);
    sgst = totalTax - cgst;
    taxLines.push(
      { name: "CGST", rate: halfRate, amount: cgst },
      { name: "SGST", rate: halfRate, amount: sgst },
    );
  } else if (totalTax > 0) {
    igst = totalTax;
    taxLines.push({ name: "IGST", rate, amount: igst });
  }

  return {
    taxableAmount: amount,
    taxPercent: rate,
    taxType: "gst",
    taxLines,
    cgst,
    sgst,
    igst,
    vat: 0,
    salesTax: 0,
    totalTax,
    total: amount + totalTax,
    country: "IN",
    placeOfSupply: buyer,
    sellerState: seller,
    buyerState: buyer,
  };
}

export function calculateVAT(input: VATInput): TaxBreakdown {
  const { amount } = input;
  let rate = input.rate ?? 0;
  assertNonNegative(amount, rate);

  const country = normalizeCode(input.country);
  const taxId = input.customerTaxId?.trim();
  const reverseCharge =
    Boolean(input.isBusinessCustomer && taxId) &&
    country.length > 0 &&
    country !== "IN";

  if (reverseCharge) {
    rate = 0;
  }

  const vat = roundAmount((amount * rate) / 100);
  const taxLines: TaxLine[] =
    vat > 0 ? [{ name: "VAT", rate, amount: vat }] : [];

  return {
    taxableAmount: amount,
    taxPercent: rate,
    taxType: "vat",
    taxLines,
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat,
    salesTax: 0,
    totalTax: vat,
    total: amount + vat,
    country: country || undefined,
    reverseCharge,
  };
}

export function calculateSalesTax(input: SalesTaxInput): TaxBreakdown {
  const { amount, state } = input;
  const rate = input.rate ?? US_SALES_TAX_RATES[normalizeCode(state)] ?? 0;
  assertNonNegative(amount, rate);

  const salesTax = roundAmount((amount * rate) / 100);
  const taxLines: TaxLine[] =
    salesTax > 0 ? [{ name: "Sales Tax", rate, amount: salesTax }] : [];

  return {
    taxableAmount: amount,
    taxPercent: rate,
    taxType: "sales_tax",
    taxLines,
    cgst: 0,
    sgst: 0,
    igst: 0,
    vat: 0,
    salesTax,
    totalTax: salesTax,
    total: amount + salesTax,
    country: normalizeCode(input.country) || "US",
    placeOfSupply: normalizeCode(state),
    buyerState: normalizeCode(state),
  };
}

function detectTaxType(country?: string, explicit?: TaxType): TaxType {
  if (explicit && explicit !== "none") return explicit;
  const code = normalizeCode(country);
  if (!code) return "none";
  if (code === "IN") return "gst";
  if (code === "US") return "sales_tax";
  if (EU_COUNTRIES.has(code)) return "vat";
  return "vat";
}

function defaultRateFor(taxType: TaxType, country?: string, state?: string): number {
  if (taxType === "gst") return 18;
  if (taxType === "sales_tax") {
    return US_SALES_TAX_RATES[normalizeCode(state)] ?? 0;
  }
  if (taxType === "vat") {
    const code = normalizeCode(country);
    return EU_VAT_RATES[code] ?? EU_VAT_RATES.default;
  }
  return 0;
}

export class TaxEngine {
  calculate(input: TaxCalculationInput): TaxBreakdown {
    assertNonNegative(input.amount, input.rate ?? 0);

    if (input.amount === 0) {
      return emptyBreakdown(0);
    }

    const autoTax = input.autoTax === true;
    const country = normalizeCode(input.country);
    const buyerState = normalizeCode(
      input.buyerState ?? input.state ?? input.placeOfSupply,
    );
    const sellerState = normalizeCode(input.sellerState);
    const placeOfSupply = normalizeCode(input.placeOfSupply) || buyerState;

    let taxType: TaxType = input.taxType ?? "none";
    if (autoTax || (!input.taxType && country)) {
      taxType = detectTaxType(country, input.taxType);
    }

    if (taxType === "none") {
      return emptyBreakdown(input.amount, {
        country: country || undefined,
        placeOfSupply: placeOfSupply || undefined,
        sellerState: sellerState || undefined,
        buyerState: buyerState || undefined,
      });
    }

    const rate =
      input.rate ?? defaultRateFor(taxType, country || undefined, buyerState);

    if (taxType === "gst") {
      return calculateGST({
        amount: input.amount,
        rate,
        sellerState: sellerState || buyerState,
        buyerState: placeOfSupply || buyerState,
      });
    }

    if (taxType === "sales_tax") {
      return calculateSalesTax({
        amount: input.amount,
        rate,
        state: buyerState || placeOfSupply,
        country: country || "US",
      });
    }

    return calculateVAT({
      amount: input.amount,
      rate,
      country: country || undefined,
      customerTaxId: input.customerTaxId,
      isBusinessCustomer: input.isBusinessCustomer,
    });
  }
}

export class TaxService {
  private readonly engine = new TaxEngine();

  calculate(input: TaxCalculationInput): TaxBreakdown {
    return this.engine.calculate(input);
  }

  calculateGST(input: GSTInput): TaxBreakdown {
    return calculateGST(input);
  }

  calculateVAT(input: VATInput): TaxBreakdown {
    return calculateVAT(input);
  }

  calculateSalesTax(input: SalesTaxInput): TaxBreakdown {
    return calculateSalesTax(input);
  }
}
