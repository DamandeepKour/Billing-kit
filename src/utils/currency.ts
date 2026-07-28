import { BillingValidationError, UnsupportedCurrencyError } from "./errors";
import { CurrencyMismatchError } from "./errors";

export const SUPPORTED_CURRENCIES = [
  "inr",
  "usd",
  "eur",
  "gbp",
  "aed",
  "sgd",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Minor units per 1 major unit (all currently supported currencies use 2 decimal places). */
const MINOR_UNIT_FACTORS: Record<SupportedCurrency, number> = {
  inr: 100,
  usd: 100,
  eur: 100,
  gbp: 100,
  aed: 100,
  sgd: 100,
};

const LOCALE_BY_CURRENCY: Record<SupportedCurrency, string> = {
  inr: "en-IN",
  usd: "en-US",
  eur: "en-IE",
  gbp: "en-GB",
  aed: "en-AE",
  sgd: "en-SG",
};

export function listSupportedCurrencies(): SupportedCurrency[] {
  return [...SUPPORTED_CURRENCIES];
}

export function normalizeCurrency(currency?: string): string {
  return (currency ?? "inr").trim().toLowerCase();
}

export function isSupportedCurrency(
  currency: string,
): currency is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(
    normalizeCurrency(currency),
  );
}

export function assertSupportedCurrency(currency: string): SupportedCurrency {
  const normalized = normalizeCurrency(currency);
  if (!normalized || !isSupportedCurrency(normalized)) {
    throw new UnsupportedCurrencyError(currency || "(empty)", [
      ...SUPPORTED_CURRENCIES,
    ]);
  }
  return normalized;
}

/**
 * Resolve effective currency with precedence:
 * explicit override → customer default → global config → `inr`.
 */
export function resolveCurrency(options: {
  override?: string;
  customerDefault?: string;
  configDefault?: string;
}): SupportedCurrency {
  return assertSupportedCurrency(
    options.override ??
      options.customerDefault ??
      options.configDefault ??
      "inr",
  );
}

export function roundAmount(value: number): number {
  return Math.round(value);
}

export function getMinorUnitFactor(currency: string): number {
  const code = assertSupportedCurrency(currency);
  return MINOR_UNIT_FACTORS[code];
}

/**
 * Amounts in billing-kit APIs must be non-negative integers in smallest units
 * (paise / cents / …). Rejects floats and negatives.
 */
export function assertSmallestUnitAmount(
  amount: number,
  options: { param?: string; currency?: string } = {},
): number {
  const param = options.param ?? "amount";
  const suffix = options.currency
    ? ` for currency ${normalizeCurrency(options.currency)}`
    : "";
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    !Number.isInteger(amount) ||
    amount < 0
  ) {
    throw new BillingValidationError(
      `${param} must be a non-negative integer in smallest currency units${suffix}`,
      { param },
    );
  }
  return amount;
}

/** Convert a major-unit amount (e.g. 49.00) to smallest units (4900). */
export function toMinorUnits(amount: number, currency: string): number {
  assertSupportedCurrency(currency);
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new BillingValidationError(
      "amount must be a finite number when converting to minor units",
      { param: "amount" },
    );
  }
  return roundAmount(amount * getMinorUnitFactor(currency));
}

/** Convert smallest units back to major units (4900 → 49). */
export function fromMinorUnits(amount: number, currency: string): number {
  assertSupportedCurrency(currency);
  return amount / getMinorUnitFactor(currency);
}

/** Alias for {@link fromMinorUnits}. */
export function convertSmallestUnit(amount: number, currency: string): number {
  return fromMinorUnits(amount, currency);
}

/**
 * Convert an amount between currencies using an explicit exchange rate
 * (`1 from = rate to`). Result is rounded to the destination minor unit.
 */
export function convertAmount(input: {
  amount: number;
  from: string;
  to: string;
  /** Units of `to` per 1 unit of `from` (major:major or minor:minor — same scale). */
  rate: number;
  /** When true (default), `amount` is in smallest units of `from`. */
  amountInMinorUnits?: boolean;
}): number {
  const from = assertSupportedCurrency(input.from);
  const to = assertSupportedCurrency(input.to);
  if (
    typeof input.rate !== "number" ||
    !Number.isFinite(input.rate) ||
    input.rate <= 0
  ) {
    throw new BillingValidationError(
      "rate must be a positive finite number",
      { param: "rate" },
    );
  }

  const inMinor = input.amountInMinorUnits !== false;
  const majorFrom = inMinor
    ? fromMinorUnits(assertSmallestUnitAmount(input.amount, { currency: from }), from)
    : input.amount;
  if (typeof majorFrom !== "number" || !Number.isFinite(majorFrom)) {
    throw new BillingValidationError("amount must be a finite number", {
      param: "amount",
    });
  }

  const majorTo = majorFrom * input.rate;
  return toMinorUnits(majorTo, to);
}

export function formatAmount(amount: number, currency: string): string {
  const code = assertSupportedCurrency(currency);
  const major = fromMinorUnits(amount, code);
  const locale = LOCALE_BY_CURRENCY[code];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code.toUpperCase(),
  }).format(major);
}

export interface CurrencyLineItem {
  currency?: string;
  description?: string;
  unitAmount?: number;
}

/**
 * Ensure every line item that declares a currency matches the invoice currency,
 * and that declared line-item currencies are not mixed with each other.
 */
export function assertLineItemCurrencies(
  lineItems: CurrencyLineItem[],
  invoiceCurrency: string,
): void {
  const expected = assertSupportedCurrency(invoiceCurrency);
  const declared = new Set<string>();

  for (let index = 0; index < lineItems.length; index += 1) {
    const item = lineItems[index];
    if (!item?.currency) continue;
    const itemCurrency = normalizeCurrency(item.currency);
    if (!isSupportedCurrency(itemCurrency)) {
      throw new UnsupportedCurrencyError(item.currency, [
        ...SUPPORTED_CURRENCIES,
      ]);
    }
    declared.add(itemCurrency);
    if (itemCurrency !== expected) {
      throw new CurrencyMismatchError(
        `Line item currency "${item.currency}" does not match invoice currency "${expected}"`,
      );
    }
  }

  if (declared.size > 1) {
    throw new CurrencyMismatchError(
      `Mixed line item currencies are not allowed: ${[...declared].join(", ")}`,
    );
  }
}
