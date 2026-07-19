import { UnsupportedCurrencyError } from "./errors";
export const SUPPORTED_CURRENCIES = ["inr", "usd", "eur", "gbp", "aed", "sgd"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
const MINOR_UNIT_FACTORS: Record<string, number> = {
  inr: 100,
  usd: 100,
  eur: 100,
  gbp: 100,
  aed: 100,
  sgd: 100,
};
const LOCALE_BY_CURRENCY: Record<string, string> = {
  inr: "en-IN",
  usd: "en-US",
  eur: "en-IE",
  gbp: "en-GB",
  aed: "en-AE",
  sgd: "en-SG",
};
export function normalizeCurrency(currency?: string): string {
  return (currency ?? "inr").toLowerCase();
}
export function isSupportedCurrency(currency: string): currency is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(
    normalizeCurrency(currency),
  );
}
export function assertSupportedCurrency(currency: string): SupportedCurrency {
  const normalized = normalizeCurrency(currency);
  if (!isSupportedCurrency(normalized)) {
    throw new UnsupportedCurrencyError(currency, [...SUPPORTED_CURRENCIES]);
  }
  return normalized;
}
export function resolveCurrency(options: {
  override?: string;
  customerDefault?: string;
  configDefault?: string;
}): SupportedCurrency {
  return assertSupportedCurrency(
    options.override ?? options.customerDefault ?? options.configDefault ?? "inr",
  );
}
export function roundAmount(value: number): number {
  return Math.round(value);
}
export function getMinorUnitFactor(currency: string): number {
  const code = assertSupportedCurrency(currency);
  return MINOR_UNIT_FACTORS[code] ?? 100;
}
export function toMinorUnits(amount: number, currency: string): number {
  return roundAmount(amount * getMinorUnitFactor(currency));
}
export function fromMinorUnits(amount: number, currency: string): number {
  return amount / getMinorUnitFactor(currency);
}
export function convertSmallestUnit(amount: number, currency: string): number {
  return fromMinorUnits(amount, currency);
}
export function formatAmount(amount: number, currency: string): string {
  const code = assertSupportedCurrency(currency);
  const major = fromMinorUnits(amount, code);
  const locale = LOCALE_BY_CURRENCY[code] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code.toUpperCase(),
  }).format(major);
}
