import type {
  GSTInput,
  SalesTaxInput,
  TaxBreakdown,
  TaxCalculationInput,
  TaxLine,
  TaxLineItemBreakdown,
  TaxSummary,
  TaxType,
  VATInput,
} from "../types/tax";
import { BillingValidationError } from "../utils/errors";
import { roundAmount } from "../utils/currency";

const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
]);

/** Approximate state-level US sales tax rates (%). Override with `rate` when needed. */
export const US_SALES_TAX_RATES: Readonly<Record<string, number>> = {
  AL: 4,
  AK: 0,
  AZ: 5.6,
  AR: 6.5,
  CA: 7.25,
  CO: 2.9,
  CT: 6.35,
  DE: 0,
  FL: 6,
  GA: 4,
  HI: 4,
  ID: 6,
  IL: 6.25,
  IN: 7,
  IA: 6,
  KS: 6.5,
  KY: 6,
  LA: 4.45,
  ME: 5.5,
  MD: 6,
  MA: 6.25,
  MI: 6,
  MN: 6.875,
  MS: 7,
  MO: 4.225,
  MT: 0,
  NE: 5.5,
  NV: 6.85,
  NH: 0,
  NJ: 6.625,
  NM: 5.125,
  NY: 8,
  NC: 4.75,
  ND: 5,
  OH: 5.75,
  OK: 4.5,
  OR: 0,
  PA: 6,
  RI: 7,
  SC: 6,
  SD: 4.5,
  TN: 7,
  TX: 6.25,
  UT: 6.1,
  VT: 6,
  VA: 5.3,
  WA: 6.5,
  WV: 6,
  WI: 5,
  WY: 4,
  DC: 6,
};

/** Standard VAT rates by country (%). */
export const EU_VAT_RATES: Readonly<Record<string, number>> = {
  DE: 19,
  FR: 20,
  IE: 23,
  NL: 21,
  ES: 21,
  IT: 22,
  AT: 20,
  BE: 21,
  default: 20,
};

const DEFAULT_GST_RATE = 18;

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
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new BillingValidationError(
      "amount must be a non-negative finite number",
      { param: "amount" },
    );
  }
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) {
    throw new BillingValidationError(
      "rate must be a non-negative finite number",
      { param: "rate" },
    );
  }
}

export function normalizeRegionCode(value?: string): string {
  return (value ?? "").trim().toUpperCase();
}

export function isEuCountry(country?: string): boolean {
  return EU_COUNTRIES.has(normalizeRegionCode(country));
}

/**
 * Resolve tax regime from region: IN → GST, US → sales tax, EU → VAT, else VAT.
 */
export function detectTaxType(
  country?: string,
  explicit?: TaxType,
): TaxType {
  if (explicit && explicit !== "none") return explicit;
  const code = normalizeRegionCode(country);
  if (!code) return "none";
  if (code === "IN") return "gst";
  if (code === "US") return "sales_tax";
  if (EU_COUNTRIES.has(code)) return "vat";
  return "vat";
}

export function defaultRateFor(
  taxType: TaxType,
  country?: string,
  state?: string,
): number {
  if (taxType === "gst") return DEFAULT_GST_RATE;
  if (taxType === "sales_tax") {
    return US_SALES_TAX_RATES[normalizeRegionCode(state)] ?? 0;
  }
  if (taxType === "vat") {
    const code = normalizeRegionCode(country);
    return EU_VAT_RATES[code] ?? EU_VAT_RATES.default;
  }
  return 0;
}

/** India GST: same state → CGST+SGST, different state → IGST. */
export function calculateGST(input: GSTInput): TaxBreakdown {
  const { amount, sellerState, buyerState } = input;
  const rate = input.rate ?? DEFAULT_GST_RATE;
  assertNonNegative(amount, rate);
  const seller = normalizeRegionCode(sellerState);
  const buyer = normalizeRegionCode(buyerState);
  const totalTax = roundAmount((amount * rate) / 100);
  const sameState = seller.length > 0 && buyer.length > 0 && seller === buyer;
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
    region: buyer || seller || undefined,
    placeOfSupply: buyer,
    sellerState: seller,
    buyerState: buyer,
    customerTaxId: input.customerTaxId?.trim() || undefined,
    reverseCharge: false,
  };
}

/** VAT with optional B2B reverse charge when customer tax ID is present. */
export function calculateVAT(input: VATInput): TaxBreakdown {
  const { amount } = input;
  let rate = input.rate ?? 0;
  assertNonNegative(amount, rate);
  const country = normalizeRegionCode(input.country);
  const taxId = input.customerTaxId?.trim();
  const reverseCharge =
    Boolean(input.isBusinessCustomer && taxId) &&
    country.length > 0 &&
    country !== "IN";

  if (reverseCharge) {
    rate = 0;
  } else if (input.rate === undefined && country) {
    rate = defaultRateFor("vat", country);
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
    region: country || undefined,
    customerTaxId: taxId || undefined,
    reverseCharge,
  };
}

/** Regional (typically US) sales tax. */
export function calculateSalesTax(input: SalesTaxInput): TaxBreakdown {
  const { amount, state } = input;
  const region = normalizeRegionCode(state);
  const rate =
    input.rate ?? US_SALES_TAX_RATES[region] ?? 0;
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
    country: normalizeRegionCode(input.country) || "US",
    region,
    placeOfSupply: region,
    buyerState: region,
    customerTaxId: input.customerTaxId?.trim() || undefined,
  };
}

/** Compact tax summary for invoices / receipts. */
export function summarizeTax(breakdown: TaxBreakdown): TaxSummary {
  return {
    taxType: breakdown.taxType,
    taxableAmount: breakdown.taxableAmount,
    taxPercent: breakdown.taxPercent,
    totalTax: breakdown.totalTax,
    total: breakdown.total,
    taxLines: breakdown.taxLines,
    cgst: breakdown.cgst,
    sgst: breakdown.sgst,
    igst: breakdown.igst,
    vat: breakdown.vat,
    salesTax: breakdown.salesTax,
    placeOfSupply: breakdown.placeOfSupply,
    sellerState: breakdown.sellerState,
    buyerState: breakdown.buyerState,
    country: breakdown.country,
    region: breakdown.region,
    customerTaxId: breakdown.customerTaxId,
    reverseCharge: breakdown.reverseCharge ?? false,
  };
}

/**
 * Calculate tax per line (optional per-line rate), then roll up totals.
 * Useful when invoices mix standard and reduced rates.
 */
export function calculateLineItemTaxes(input: {
  lineItems: Array<{
    id?: string;
    description?: string;
    amount: number;
    taxRate?: number;
  }>;
  base: Omit<TaxCalculationInput, "amount" | "rate"> & { rate?: number };
}): { lines: TaxLineItemBreakdown[]; summary: TaxBreakdown } {
  const engine = new TaxEngine();
  const lines: TaxLineItemBreakdown[] = [];
  let taxableAmount = 0;
  let totalTax = 0;

  for (const item of input.lineItems) {
    const breakdown = engine.calculate({
      ...input.base,
      amount: item.amount,
      rate: item.taxRate ?? input.base.rate,
    });
    lines.push({
      id: item.id,
      description: item.description,
      taxableAmount: breakdown.taxableAmount,
      tax: breakdown,
      total: breakdown.total,
    });
    taxableAmount += breakdown.taxableAmount;
    totalTax += breakdown.totalTax;
  }

  const rolled = emptyBreakdown(taxableAmount, {
    taxType: lines[0]?.tax.taxType ?? input.base.taxType ?? "none",
    taxPercent: input.base.rate ?? lines[0]?.tax.taxPercent ?? 0,
    taxLines: lines.flatMap((line) => line.tax.taxLines),
    cgst: lines.reduce((sum, line) => sum + line.tax.cgst, 0),
    sgst: lines.reduce((sum, line) => sum + line.tax.sgst, 0),
    igst: lines.reduce((sum, line) => sum + line.tax.igst, 0),
    vat: lines.reduce((sum, line) => sum + line.tax.vat, 0),
    salesTax: lines.reduce((sum, line) => sum + line.tax.salesTax, 0),
    totalTax,
    total: taxableAmount + totalTax,
    country: lines[0]?.tax.country ?? input.base.country,
    region: lines[0]?.tax.region,
    placeOfSupply: lines[0]?.tax.placeOfSupply,
    sellerState: lines[0]?.tax.sellerState ?? input.base.sellerState,
    buyerState: lines[0]?.tax.buyerState ?? input.base.buyerState,
    customerTaxId: input.base.customerTaxId,
    reverseCharge: lines.some((line) => line.tax.reverseCharge),
  });

  return { lines, summary: rolled };
}

export class TaxEngine {
  calculate(input: TaxCalculationInput): TaxBreakdown {
    assertNonNegative(input.amount, input.rate ?? 0);
    if (input.amount === 0) {
      return emptyBreakdown(0, {
        country: normalizeRegionCode(input.country) || undefined,
        customerTaxId: input.customerTaxId?.trim() || undefined,
      });
    }

    const autoTax = input.autoTax === true;
    const country = normalizeRegionCode(input.country);
    const buyerState = normalizeRegionCode(
      input.buyerState ?? input.state ?? input.placeOfSupply,
    );
    const sellerState = normalizeRegionCode(input.sellerState);
    const placeOfSupply =
      normalizeRegionCode(input.placeOfSupply) || buyerState;

    let taxType: TaxType = input.taxType ?? "none";
    if (autoTax || (!input.taxType && country)) {
      taxType = detectTaxType(country, input.taxType);
    }

    if (taxType === "none") {
      return emptyBreakdown(input.amount, {
        country: country || undefined,
        region: buyerState || country || undefined,
        placeOfSupply: placeOfSupply || undefined,
        sellerState: sellerState || undefined,
        buyerState: buyerState || undefined,
        customerTaxId: input.customerTaxId?.trim() || undefined,
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
        customerTaxId: input.customerTaxId,
      });
    }

    if (taxType === "sales_tax") {
      return calculateSalesTax({
        amount: input.amount,
        rate,
        state: buyerState || placeOfSupply,
        country: country || "US",
        customerTaxId: input.customerTaxId,
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

  summarize(breakdown: TaxBreakdown): TaxSummary {
    return summarizeTax(breakdown);
  }

  calculateLineItems(
    input: Parameters<typeof calculateLineItemTaxes>[0],
  ): ReturnType<typeof calculateLineItemTaxes> {
    return calculateLineItemTaxes(input);
  }
}
