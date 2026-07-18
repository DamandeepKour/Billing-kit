/**
 * Currency the customer is charged in (Stripe presentment currency).
 * Distinct from {@link SettlementCurrency} when Stripe converts for payouts.
 */
export type PresentmentCurrency = string;

/** Currency you receive / settle in (Stripe settlement currency). */
export type SettlementCurrency = string;

/** Exchange-rate metadata for presentment → settlement conversion. */
export interface ExchangeRateMetadata {
  /** Multiplier: settlementAmount ≈ presentmentAmount * rate (in minor units, same scale). */
  rate: number;
  /** e.g. "stripe", "manual", "ecb" */
  source?: string;
  /** ISO timestamp or Date when the rate applied */
  asOf?: string | Date;
  /** Provider rate / FX quote id when available */
  rateId?: string;
}

/**
 * Provider fee breakdown in settlement currency (minor units).
 * `net = gross - fee - taxOnFee`
 */
export interface FeeBreakdown {
  /** Gross amount before fees (typically settlement-side) */
  gross: number;
  /** Processing / platform fee */
  fee: number;
  /** Tax applied on the fee (e.g. GST on Stripe fees in IN) */
  taxOnFee: number;
  /** Net amount settled after fees and tax on fee */
  net: number;
}

export interface SettlementFields {
  /** Currency the customer paid in */
  presentmentCurrency: string;
  /** Currency settled to your balance / bank */
  settlementCurrency: string;
  /** Amount charged to the customer (presentment minor units) */
  presentmentAmount: number;
  /** Amount credited before or after fees — prefer pairing with `fees` */
  settlementAmount: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  /** Raw provider settlement / balance-transaction payload */
  providerResponse?: Record<string, unknown>;
}

export interface RevenueByCurrencyRow {
  currency: string;
  /** Sum of presentment amounts where this is the charged currency */
  presentmentTotal: number;
  /** Sum of settlement amounts where this is the settlement currency */
  settlementTotal: number;
  feeTotal: number;
  taxOnFeeTotal: number;
  netSettlement: number;
  transactionCount: number;
}

export interface SettlementSummary {
  from?: Date;
  to?: Date;
  /** Totals grouped by presentment (charged) currency */
  byPresentmentCurrency: RevenueByCurrencyRow[];
  /** Totals grouped by settlement currency */
  bySettlementCurrency: RevenueByCurrencyRow[];
  transactionCount: number;
}

export interface ReportingFilter {
  from?: Date;
  to?: Date;
  /** Limit to these transaction types (default: all) */
  types?: string[];
}
