import { UsageBillingError } from "./errors";
import type {
  MeteredUsagePrice,
  PerUnitUsagePrice,
  UsageAggregationMethod,
  UsageAggregationPeriod,
} from "../types/usage";

export interface ResolveUsagePeriodRangeInput {
  period: UsageAggregationPeriod;
  from?: Date;
  to?: Date;
  now?: Date;
}

export interface UsagePeriodRange {
  from: Date;
  to: Date;
}

/** Resolve the UTC window used for day / month / billing_cycle aggregation. */
export function resolveUsagePeriodRange(
  input: ResolveUsagePeriodRangeInput,
): UsagePeriodRange {
  if ((input.from && !input.to) || (!input.from && input.to)) {
    throw new UsageBillingError("from and to must be provided together");
  }
  if (input.from && input.to) {
    if (input.from >= input.to) {
      throw new UsageBillingError("from must be before to");
    }
    return { from: input.from, to: input.to };
  }
  if (input.period === "billing_cycle") {
    throw new UsageBillingError(
      "from and to are required for billing_cycle aggregation",
    );
  }

  const now = input.now ?? new Date();
  if (input.period === "day") {
    const from = startOfUtcDay(now);
    return { from, to: addUtcDays(from, 1) };
  }
  const from = startOfUtcMonth(now);
  return { from, to: addUtcMonths(from, 1) };
}

export interface CreatePerSeatPriceInput {
  /** Defaults to `seats`. */
  meter?: string;
  /** Charge per seat in smallest currency units. */
  unitAmount: number;
  currency: string;
  description?: string;
}

/** Build a per-seat (`per_unit`) price for invoice line items. */
export function createPerSeatPrice(
  input: CreatePerSeatPriceInput,
): PerUnitUsagePrice {
  if (!Number.isFinite(input.unitAmount) || input.unitAmount < 0) {
    throw new UsageBillingError("unitAmount must be a non-negative number");
  }
  return {
    type: "per_unit",
    meter: input.meter?.trim() || "seats",
    unitAmount: input.unitAmount,
    currency: input.currency,
    description: input.description ?? "Seats",
  };
}

export interface CreateConsumptionPriceInput {
  meter: string;
  unitAmount: number;
  currency: string;
  aggregationMethod?: UsageAggregationMethod;
  description?: string;
}

/** Build a consumption / metered price (API calls, GB, messages, …). */
export function createConsumptionPrice(
  input: CreateConsumptionPriceInput,
): MeteredUsagePrice {
  if (!input.meter.trim()) {
    throw new UsageBillingError("meter is required");
  }
  if (!Number.isFinite(input.unitAmount) || input.unitAmount < 0) {
    throw new UsageBillingError("unitAmount must be a non-negative number");
  }
  return {
    type: "metered",
    meter: input.meter,
    unitAmount: input.unitAmount,
    currency: input.currency,
    aggregationMethod: input.aggregationMethod,
    description: input.description,
  };
}

/** Per-seat charge: seats × unitAmount (smallest units). */
export function calculatePerSeatAmount(
  seats: number,
  unitAmount: number,
): number {
  assertNonNegativeFinite(seats, "seats");
  assertNonNegativeFinite(unitAmount, "unitAmount");
  return Math.round(seats * unitAmount);
}

/** Consumption charge: quantity × unitAmount (smallest units). */
export function calculateConsumptionAmount(
  quantity: number,
  unitAmount: number,
): number {
  assertNonNegativeFinite(quantity, "quantity");
  assertNonNegativeFinite(unitAmount, "unitAmount");
  return Math.round(quantity * unitAmount);
}

function assertNonNegativeFinite(value: number, param: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new UsageBillingError(`${param} must be a non-negative finite number`);
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}
