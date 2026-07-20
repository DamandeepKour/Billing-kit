import type { ExchangeRateMetadata, FeeBreakdown, SettlementFields } from "./settlement";
import type { TransferSettlementStatus } from "./route";

export enum TransactionType {
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  SUBSCRIPTION = "SUBSCRIPTION",
  RENEWAL = "RENEWAL",
  CHARGEBACK = "CHARGEBACK",
  TRANSFER = "TRANSFER",
  TRANSFER_REVERSAL = "TRANSFER_REVERSAL",
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
  routedAmount?: number;
  platformFee?: number;
  vendorAmount?: number;
  settlementStatus?: TransferSettlementStatus;
  transferIds?: string[];
  linkedAccountId?: string;
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
  routedAmount?: number;
  platformFee?: number;
  vendorAmount?: number;
  settlementStatus?: TransferSettlementStatus;
  transferIds?: string[];
  linkedAccountId?: string;
}
