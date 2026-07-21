import { createHash } from "crypto";
import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RouteTransferProvider } from "../interfaces/RouteTransferProvider";
import type { TransferRequestRepository } from "../interfaces/TransferRequestRepository";
import type { TransactionService } from "../transaction/TransactionService";
import type {
  CreateTransferInput,
  GetSettlementDetailsInput,
  ReverseTransferInput,
  SettlementDetails,
  SplitPaymentInput,
  SplitPaymentResult,
  TransferRequestFilter,
  TransferRequestKind,
  TransferRequestRecord,
  TransferRequestResult,
  TransferReversalResult,
  TransferResult,
} from "../types/route";
import { TransactionType } from "../types/transaction";
import {
  IdempotencyConflictError,
  IdempotencyInFlightError,
  InvalidConfigError,
} from "../utils/errors";
import { generateId } from "../utils/id";
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
    private readonly transferRequests?: TransferRequestRepository,
  ) {}

  calculateSplit(input: SplitPaymentInput) {
    return calculateSplitAllocations(input);
  }

  async createTransfer(input: CreateTransferInput): Promise<TransferResult> {
    const execution = await this.executeIdempotent({
      key: input.idempotencyKey,
      kind: input.paymentId ? "payment_transfer" : "direct_transfer",
      request: input as unknown as Record<string, unknown>,
      run: () => this.requireRoute().createTransfer(input),
      transferIds: (result) => [result.id],
      providerResponse: (result) => result.providerResponse,
      settlementStatus: (result) => result.status,
    });
    if (execution.created) {
      await this.recordTransferTransaction(execution.result);
    }
    return execution.result;
  }

  private async recordTransferTransaction(
    result: TransferResult,
  ): Promise<void> {
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
  }

  async splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
    const execution = await this.executeIdempotent({
      key: input.idempotencyKey,
      kind: "split_payment",
      request: input as unknown as Record<string, unknown>,
      run: () => this.requireRoute().splitPayment(input),
      transferIds: (result) => result.transfers.map((transfer) => transfer.id),
      providerResponse: (result) => ({
        transfers: result.transfers.map(
          (transfer) => transfer.providerResponse,
        ),
      }),
      settlementStatus: (result) => result.settlementStatus,
    });
    if (execution.created) {
      await this.recordSplitTransaction(execution.result);
    }
    return execution.result;
  }

  private async recordSplitTransaction(
    result: SplitPaymentResult,
  ): Promise<void> {
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
  }

  async reverseTransfer(input: ReverseTransferInput): Promise<TransferReversalResult> {
    const execution = await this.executeIdempotent({
      key: input.idempotencyKey,
      kind: "transfer_reversal",
      request: input as unknown as Record<string, unknown>,
      run: () => this.requireRoute().reverseTransfer(input),
      transferIds: (result) => [result.transferId],
      providerResponse: (result) => result.providerResponse,
      settlementStatus: (result) => result.status,
    });
    if (execution.created) {
      await this.recordReversalTransaction(execution.result);
    }
    return execution.result;
  }

  private async recordReversalTransaction(
    result: TransferReversalResult,
  ): Promise<void> {
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
  }

  async getSettlementDetails(
    input: GetSettlementDetailsInput,
  ): Promise<SettlementDetails> {
    return this.requireRoute().getSettlementDetails(input);
  }

  getTransferRequest(
    idempotencyKey: string,
  ): Promise<TransferRequestRecord | null> {
    return this.requireTransferRequests().findByKey(idempotencyKey);
  }

  listTransferRequests(
    filter?: TransferRequestFilter,
  ): Promise<TransferRequestRecord[]> {
    return this.requireTransferRequests().list(filter);
  }

  async reconcileTransferRequest(
    idempotencyKey: string,
  ): Promise<TransferRequestRecord | null> {
    const repository = this.requireTransferRequests();
    const record = await repository.findByKey(idempotencyKey);
    if (!record) return null;

    if (
      record.status === "uncertain" &&
      record.kind === "direct_transfer"
    ) {
      const input = record.request as unknown as CreateTransferInput;
      const result = await this.requireRoute().createTransfer(input);
      const updated = await repository.save({
        ...record,
        status: "succeeded",
        result,
        providerTransferIds: [result.id],
        providerResponse: result.providerResponse,
        settlementStatus: result.status,
        error: undefined,
        updatedAt: new Date(),
        reconciledAt: new Date(),
      });
      await this.recordTransferTransaction(result);
      return updated;
    }

    if (!record.providerTransferIds?.length) return record;
    const details = await Promise.all(
      record.providerTransferIds.map((transferId) =>
        this.requireRoute().getSettlementDetails({ transferId }),
      ),
    );
    const settlementStatus = reconcileSettlementStatus(details);
    return repository.save({
      ...record,
      settlementStatus,
      providerResponse: {
        ...record.providerResponse,
        reconciliation: details.map((detail) => detail.providerResponse),
      },
      updatedAt: new Date(),
      reconciledAt: new Date(),
    });
  }

  private async executeIdempotent<T extends TransferRequestResult>(options: {
    key?: string;
    kind: TransferRequestKind;
    request: Record<string, unknown>;
    run: () => Promise<T>;
    transferIds: (result: T) => string[];
    providerResponse: (result: T) => Record<string, unknown> | undefined;
    settlementStatus: (result: T) => string;
  }): Promise<{ result: T; created: boolean }> {
    if (!options.key) {
      return { result: await options.run(), created: true };
    }
    validateIdempotencyKey(options.key);
    const repository = this.requireTransferRequests();
    const now = new Date();
    const request = {
      ...options.request,
      idempotencyKey: options.key,
    };
    const claim = await repository.claim({
      id: generateId("trq"),
      idempotencyKey: options.key,
      kind: options.kind,
      fingerprint: fingerprint(request),
      status: "processing",
      request,
      createdAt: now,
      updatedAt: now,
    });

    if (claim.outcome === "conflict") {
      throw new IdempotencyConflictError(options.key);
    }
    if (claim.outcome === "in_flight") {
      throw new IdempotencyInFlightError(options.key);
    }
    if (claim.outcome === "duplicate") {
      if (!claim.record.result) {
        throw new IdempotencyInFlightError(options.key);
      }
      return { result: claim.record.result as T, created: false };
    }

    try {
      const result = await options.run();
      await repository.save({
        ...claim.record,
        status: "succeeded",
        result,
        providerTransferIds: options.transferIds(result),
        providerResponse: options.providerResponse(result),
        settlementStatus: options.settlementStatus(result),
        error: undefined,
        updatedAt: new Date(),
      });
      return { result, created: true };
    } catch (error) {
      await repository.save({
        ...claim.record,
        status: isAmbiguousTransferError(error) ? "uncertain" : "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      });
      throw error;
    }
  }

  private requireRoute(): PaymentGateway & RouteTransferProvider {
    if (!isRouteProvider(this.gateway)) {
      throw new UnsupportedOperationError("Razorpay Route transfers", this.gateway.name);
    }
    return this.gateway;
  }

  private requireTransferRequests(): TransferRequestRepository {
    if (!this.transferRequests) {
      throw new InvalidConfigError(
        "transferRequestRepository is required for idempotent transfers",
      );
    }
    return this.transferRequests;
  }
}

function validateIdempotencyKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{4,36}$/.test(key)) {
    throw new InvalidConfigError(
      "idempotencyKey must be 4-36 characters using letters, numbers, _ or -",
    );
  }
}

function fingerprint(request: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify(request))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, nested]) =>
          `${JSON.stringify(key)}:${stableStringify(nested)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isAmbiguousTransferError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    error.name === "AbortError" ||
    error.name === "TypeError" ||
    ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(
      code ?? "",
    )
  );
}

function reconcileSettlementStatus(
  details: SettlementDetails[],
): string {
  const statuses = details.map((detail) => detail.status);
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "settled")) return "settled";
  if (statuses.some((status) => status === "on_hold")) return "on_hold";
  if (statuses.some((status) => status === "reversed")) return "reversed";
  if (statuses.some((status) => status === "processing")) {
    return "processing";
  }
  return "pending";
}
