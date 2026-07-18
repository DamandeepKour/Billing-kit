import type {
  ExchangeRateMetadata,
  FeeBreakdown,
  SettlementFields,
} from "./settlement";

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
  /**
   * Amount in the charged (presentment) currency — smallest units.
   * Alias of presentmentAmount when settlement fields are set.
   */
  amount: number;
  /** Charged currency — alias of presentmentCurrency */
  currency: string;
  referenceId: string;
  metadata?: Record<string, string>;
  status?: TransactionStatus;

  /** Currency the customer paid in (defaults to `currency`) */
  presentmentCurrency?: string;
  /** Currency settled to balance (defaults to presentment) */
  settlementCurrency?: string;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown | (Partial<FeeBreakdown> & { gross: number; fee: number });
  /** Raw provider settlement / balance-transaction payload */
  providerResponse?: Record<string, unknown>;
}

export interface Transaction
  extends Omit<RecordTransactionInput, "fees" | "presentmentCurrency" | "settlementCurrency" | "presentmentAmount" | "settlementAmount">,
    SettlementFields {
  id: string;
  createdAt: Date;
  status: TransactionStatus;
  fees?: FeeBreakdown;
}
