export type TransferSettlementStatus =
  | "pending"
  | "on_hold"
  | "processing"
  | "settled"
  | "reversed"
  | "failed";

export type CommissionType = "flat" | "percent";

export interface CommissionRule {
  type: CommissionType;
  amount?: number;
  percent?: number;
}

export interface TransferRule {
  linkedAccountId: string;
  amount?: number;
  percent?: number;
  notes?: Record<string, string>;
  onHold?: boolean;
  holdDays?: number;
}

export interface CreateTransferInput {
  linkedAccountId: string;
  amount: number;
  currency?: string;
  paymentId?: string;
  onHold?: boolean;
  notes?: Record<string, string>;
}

export interface SplitPaymentInput {
  paymentId: string;
  amount: number;
  currency?: string;
  transfers: TransferRule[];
  platformCommission?: CommissionRule;
}

export interface TransferResult {
  id: string;
  linkedAccountId: string;
  amount: number;
  currency: string;
  status: TransferSettlementStatus;
  paymentId?: string;
  onHold: boolean;
  provider: string;
  reversedAmount?: number;
  providerResponse?: Record<string, unknown>;
}

export interface SplitPaymentResult {
  paymentId: string;
  grossAmount: number;
  platformFee: number;
  vendorAmount: number;
  routedAmount: number;
  currency: string;
  settlementStatus: TransferSettlementStatus;
  transfers: TransferResult[];
  allocations: TransferAllocation[];
}

export interface TransferAllocation {
  linkedAccountId: string;
  amount: number;
  onHold: boolean;
  notes?: Record<string, string>;
}

export interface ReverseTransferInput {
  transferId: string;
  amount?: number;
  notes?: Record<string, string>;
}

export interface TransferReversalResult {
  id: string;
  transferId: string;
  amount: number;
  currency: string;
  status: TransferSettlementStatus;
  provider: string;
  providerResponse?: Record<string, unknown>;
}

export interface GetSettlementDetailsInput {
  settlementId?: string;
  transferId?: string;
  paymentId?: string;
}

export interface SettlementDetails {
  id: string;
  amount: number;
  currency: string;
  status: TransferSettlementStatus | string;
  fees?: number;
  tax?: number;
  utr?: string;
  settledAt?: Date;
  transferIds?: string[];
  provider: string;
  providerResponse?: Record<string, unknown>;
}
