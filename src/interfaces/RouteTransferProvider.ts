import type {
  CreateTransferInput,
  GetSettlementDetailsInput,
  ReverseTransferInput,
  SettlementDetails,
  SplitPaymentInput,
  SplitPaymentResult,
  TransferReversalResult,
  TransferResult,
} from "../types/route";

export interface RouteTransferProvider {
  createTransfer(input: CreateTransferInput): Promise<TransferResult>;
  splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult>;
  reverseTransfer(input: ReverseTransferInput): Promise<TransferReversalResult>;
  getSettlementDetails(input: GetSettlementDetailsInput): Promise<SettlementDetails>;
}
