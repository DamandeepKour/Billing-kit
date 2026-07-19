import type { ExchangeRateMetadata, FeeBreakdown, SettlementFields } from "./settlement";
export enum TransactionType {
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  SUBSCRIPTION = "SUBSCRIPTION",
  RENEWAL = "RENEWAL",
  CHARGEBACK = "CHARGEBACK",
}
export enum TransactionStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}
export interface RecordTransactionInput {
  type: TransactionType;
  amount: number;
  currency: string;
  referenceId: string;
  metadata?: Record<string, string>;
  status?: TransactionStatus;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?:
    | FeeBreakdown
    | (Partial<FeeBreakdown> & {
        gross: number;
        fee: number;
      });
  providerResponse?: Record<string, unknown>;
}
export interface Transaction
  extends
    Omit<
      RecordTransactionInput,
      | "fees"
      | "presentmentCurrency"
      | "settlementCurrency"
      | "presentmentAmount"
      | "settlementAmount"
    >,
    SettlementFields {
  id: string;
  createdAt: Date;
  status: TransactionStatus;
  fees?: FeeBreakdown;
}
