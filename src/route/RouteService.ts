import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RouteTransferProvider } from "../interfaces/RouteTransferProvider";
import type { TransactionService } from "../transaction/TransactionService";
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
import { TransactionType } from "../types/transaction";
import { UnsupportedOperationError } from "../utils/stripe-errors";
import { calculateSplitAllocations } from "../utils/split";

function isRouteProvider(
  gateway: PaymentGateway,
): gateway is PaymentGateway & RouteTransferProvider {
  const candidate = gateway as PaymentGateway & Partial<RouteTransferProvider>;
  return (
    gateway.name === "razorpay" &&
    typeof candidate.splitPayment === "function" &&
    typeof candidate.createTransfer === "function"
  );
}

export class RouteService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly transactionService?: TransactionService,
  ) {}

  calculateSplit(input: SplitPaymentInput) {
    return calculateSplitAllocations(input);
  }

  async createTransfer(input: CreateTransferInput): Promise<TransferResult> {
    const result = await this.requireRoute().createTransfer(input);
    await this.transactionService?.recordTransaction({
      type: TransactionType.TRANSFER,
      amount: result.amount,
      currency: result.currency,
      referenceId: result.id,
      routedAmount: result.amount,
      vendorAmount: result.amount,
      platformFee: 0,
      settlementStatus: result.status,
      transferIds: [result.id],
      linkedAccountId: result.linkedAccountId,
      providerResponse: result.providerResponse,
      metadata: {
        paymentId: result.paymentId ?? "",
        linkedAccountId: result.linkedAccountId,
      },
    });
    return result;
  }

  async splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
    const result = await this.requireRoute().splitPayment(input);
    await this.transactionService?.recordTransaction({
      type: TransactionType.TRANSFER,
      amount: result.grossAmount,
      currency: result.currency,
      referenceId: result.paymentId,
      routedAmount: result.routedAmount,
      platformFee: result.platformFee,
      vendorAmount: result.vendorAmount,
      settlementStatus: result.settlementStatus,
      transferIds: result.transfers.map((t) => t.id),
      providerResponse: {
        transfers: result.transfers.map((t) => t.providerResponse),
      },
      metadata: {
        paymentId: result.paymentId,
        transferCount: String(result.transfers.length),
      },
    });
    return result;
  }

  async reverseTransfer(input: ReverseTransferInput): Promise<TransferReversalResult> {
    const result = await this.requireRoute().reverseTransfer(input);
    await this.transactionService?.recordTransaction({
      type: TransactionType.TRANSFER_REVERSAL,
      amount: result.amount,
      currency: result.currency,
      referenceId: result.id,
      routedAmount: result.amount,
      vendorAmount: result.amount,
      settlementStatus: result.status,
      transferIds: [result.transferId],
      providerResponse: result.providerResponse,
      metadata: { transferId: result.transferId },
    });
    return result;
  }

  async getSettlementDetails(
    input: GetSettlementDetailsInput,
  ): Promise<SettlementDetails> {
    return this.requireRoute().getSettlementDetails(input);
  }

  private requireRoute(): PaymentGateway & RouteTransferProvider {
    if (!isRouteProvider(this.gateway)) {
      throw new UnsupportedOperationError("Razorpay Route transfers", this.gateway.name);
    }
    return this.gateway;
  }
}
