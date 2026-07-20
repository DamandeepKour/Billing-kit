import type {
  CommissionRule,
  SplitPaymentInput,
  TransferAllocation,
  TransferRule,
} from "../types/route";
import { BillingKitError } from "./errors";
import { roundAmount } from "./currency";

export class SplitValidationError extends BillingKitError {
  constructor(message: string) {
    super(message, "SPLIT_VALIDATION_ERROR");
    this.name = "SplitValidationError";
  }
}

export function calculatePlatformFee(
  grossAmount: number,
  commission?: CommissionRule,
): number {
  if (!commission) return 0;
  if (commission.type === "percent") {
    const percent = commission.percent ?? 0;
    return roundAmount((grossAmount * percent) / 100);
  }
  return roundAmount(commission.amount ?? 0);
}

export function resolveTransferAmount(
  rule: TransferRule,
  distributable: number,
): number {
  if (rule.amount !== undefined) return roundAmount(rule.amount);
  if (rule.percent !== undefined) {
    return roundAmount((distributable * rule.percent) / 100);
  }
  throw new SplitValidationError(
    `Transfer for "${rule.linkedAccountId}" needs amount or percent`,
  );
}

export function calculateSplitAllocations(input: SplitPaymentInput): {
  platformFee: number;
  vendorAmount: number;
  routedAmount: number;
  allocations: TransferAllocation[];
} {
  if (!input.transfers.length) {
    throw new SplitValidationError("At least one transfer rule is required");
  }

  const platformFee = calculatePlatformFee(input.amount, input.platformCommission);
  if (platformFee < 0 || platformFee > input.amount) {
    throw new SplitValidationError("Platform commission exceeds payment amount");
  }

  const distributable = input.amount - platformFee;
  const allocations: TransferAllocation[] = [];
  let routedAmount = 0;

  for (const rule of input.transfers) {
    const amount = resolveTransferAmount(rule, distributable);
    if (amount <= 0) {
      throw new SplitValidationError(
        `Transfer amount for "${rule.linkedAccountId}" must be positive`,
      );
    }
    routedAmount += amount;
    allocations.push({
      linkedAccountId: rule.linkedAccountId,
      amount,
      onHold: Boolean(rule.onHold),
      notes: rule.notes,
    });
  }

  if (routedAmount > distributable) {
    throw new SplitValidationError(
      `Routed amount ${routedAmount} exceeds distributable ${distributable}`,
    );
  }

  return {
    platformFee,
    vendorAmount: routedAmount,
    routedAmount,
    allocations,
  };
}
