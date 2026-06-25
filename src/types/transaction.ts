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
}

export interface Transaction extends RecordTransactionInput {
  id: string;
  createdAt: Date;
}
