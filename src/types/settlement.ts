export type PresentmentCurrency = string;
export type SettlementCurrency = string;
export interface ExchangeRateMetadata {
  rate: number;
  source?: string;
  asOf?: string | Date;
  rateId?: string;
}
export interface FeeBreakdown {
  gross: number;
  fee: number;
  taxOnFee: number;
  net: number;
}
export interface SettlementFields {
  presentmentCurrency: string;
  settlementCurrency: string;
  presentmentAmount: number;
  settlementAmount: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
}
export interface RevenueByCurrencyRow {
  currency: string;
  presentmentTotal: number;
  settlementTotal: number;
  feeTotal: number;
  taxOnFeeTotal: number;
  netSettlement: number;
  transactionCount: number;
}
export interface SettlementSummary {
  from?: Date;
  to?: Date;
  byPresentmentCurrency: RevenueByCurrencyRow[];
  bySettlementCurrency: RevenueByCurrencyRow[];
  transactionCount: number;
}
export interface ReportingFilter {
  from?: Date;
  to?: Date;
  types?: string[];
}
