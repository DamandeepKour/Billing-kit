import type { UsageEventRepository } from "../interfaces/UsageEventRepository";
import type { LineItem } from "../types/invoice";
import type {
  AggregateUsageEventsInput,
  PricedUsage,
  RecordUsageEventInput,
  TieredUsagePrice,
  UsageAggregate,
  UsageAggregationMethod,
  UsageAggregationPeriod,
  UsageEvent,
  UsageEventFilter,
  UsagePrice,
  UsageToLineItemsInput,
} from "../types/usage";
import { BillingKitError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency } from "../utils/currency";

export class UsageBillingError extends BillingKitError {
  constructor(message: string) {
    super(message, "USAGE_BILLING_ERROR");
    this.name = "UsageBillingError";
  }
}

export class UsageBillingService {
  constructor(private readonly repository: UsageEventRepository) {}

  async recordUsageEvent(
    input: RecordUsageEventInput,
  ): Promise<UsageEvent> {
    if (!input.customerId.trim()) {
      throw new UsageBillingError("customerId is required");
    }
    if (!input.meter.trim()) {
      throw new UsageBillingError("meter is required");
    }
    if (!Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new UsageBillingError(
        "quantity must be a non-negative finite number",
      );
    }

    const event: UsageEvent = {
      id: generateId("uevt"),
      customerId: input.customerId,
      meter: input.meter,
      quantity: input.quantity,
      timestamp: input.timestamp ?? new Date(),
      subscriptionId: input.subscriptionId,
      metadata: input.metadata,
      createdAt: new Date(),
    };
    return this.repository.save(event);
  }

  getUsageEvent(id: string): Promise<UsageEvent | null> {
    return this.repository.findById(id);
  }

  listUsageEvents(filter?: UsageEventFilter): Promise<UsageEvent[]> {
    return this.repository.list(filter);
  }

  async aggregateUsage(
    input: AggregateUsageEventsInput,
  ): Promise<UsageAggregate[]> {
    const range = resolveRange(input);
    const aggregationMethod = input.aggregationMethod ?? "sum";
    const events = await this.repository.list({
      customerId: input.customerId,
      meter: input.meter,
      subscriptionId: input.subscriptionId,
      from: range.from,
      to: range.to,
    });
    const groups = new Map<
      string,
      {
        meter: string;
        subscriptionId?: string;
        periodStart: Date;
        periodEnd: Date;
        events: UsageEvent[];
      }
    >();

    for (const event of events) {
      const bucket = resolveBucket(event.timestamp, input.period, range);
      const groupKey = [
        event.meter,
        event.subscriptionId ?? "",
        bucket.start.toISOString(),
      ].join(":");
      const group = groups.get(groupKey) ?? {
        meter: event.meter,
        subscriptionId: event.subscriptionId,
        periodStart: bucket.start,
        periodEnd: bucket.end,
        events: [],
      };
      group.events.push(event);
      groups.set(groupKey, group);
    }

    return [...groups.values()]
      .map((group) => ({
        customerId: input.customerId,
        meter: group.meter,
        subscriptionId: group.subscriptionId,
        period: input.period,
        aggregationMethod,
        periodStart: group.periodStart,
        periodEnd: group.periodEnd,
        quantity: aggregateQuantity(group.events, aggregationMethod),
        eventCount: group.events.length,
      }))
      .sort(
        (a, b) =>
          a.periodStart.getTime() - b.periodStart.getTime() ||
          a.meter.localeCompare(b.meter),
      );
  }

  priceUsage(
    aggregates: UsageAggregate[],
    prices: UsagePrice[],
  ): PricedUsage[] {
    const byMeter = new Map(prices.map((price) => [price.meter, price]));
    return aggregates.map((aggregate) => {
      const price = byMeter.get(aggregate.meter);
      if (!price) {
        throw new UsageBillingError(
          `No usage price configured for meter: ${aggregate.meter}`,
        );
      }
      return {
        aggregate,
        price,
        amount: calculateUsageAmount(aggregate.quantity, price),
      };
    });
  }

  usageToInvoiceLineItems(input: UsageToLineItemsInput): LineItem[] {
    const byMeter = new Map(input.prices.map((price) => [price.meter, price]));
    return input.aggregates.flatMap((aggregate) => {
      const price = byMeter.get(aggregate.meter);
      if (!price) {
        throw new UsageBillingError(
          `No usage price configured for meter: ${aggregate.meter}`,
        );
      }
      return priceToLineItems(aggregate, price, input.descriptionPrefix);
    });
  }
}

interface UsageRange {
  from: Date;
  to: Date;
}

function resolveRange(input: AggregateUsageEventsInput): UsageRange {
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

function resolveBucket(
  timestamp: Date,
  period: UsageAggregationPeriod,
  range: UsageRange,
): { start: Date; end: Date } {
  if (period === "billing_cycle") {
    return { start: range.from, end: range.to };
  }
  if (period === "day") {
    const start = startOfUtcDay(timestamp);
    return { start, end: addUtcDays(start, 1) };
  }
  const start = startOfUtcMonth(timestamp);
  return { start, end: addUtcMonths(start, 1) };
}

function aggregateQuantity(
  events: UsageEvent[],
  method: UsageAggregationMethod,
): number {
  if (method === "max") {
    return Math.max(...events.map((event) => event.quantity));
  }
  if (method === "last") {
    return events[events.length - 1]?.quantity ?? 0;
  }
  return events.reduce((total, event) => total + event.quantity, 0);
}

function calculateUsageAmount(quantity: number, price: UsagePrice): number {
  if (price.type !== "tiered") {
    validateUnitAmount(price.unitAmount);
    return Math.round(quantity * price.unitAmount);
  }
  validateTiers(price);
  if ((price.mode ?? "graduated") === "volume") {
    const tier = price.tiers.find(
      (candidate) =>
        candidate.upTo === "inf" || quantity <= candidate.upTo,
    );
    if (!tier) {
      throw new UsageBillingError(
        `Tiered price for ${price.meter} does not cover quantity ${quantity}`,
      );
    }
    return Math.round(quantity * tier.unitAmount);
  }

  let amount = 0;
  let previousLimit = 0;
  let remaining = quantity;
  for (const tier of price.tiers) {
    const limit = tier.upTo === "inf" ? Infinity : tier.upTo;
    const tierQuantity = Math.max(
      0,
      Math.min(remaining, limit - previousLimit),
    );
    amount += tierQuantity * tier.unitAmount;
    remaining -= tierQuantity;
    previousLimit = limit;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    throw new UsageBillingError(
      `Tiered price for ${price.meter} does not cover quantity ${quantity}`,
    );
  }
  return Math.round(amount);
}

function priceToLineItems(
  aggregate: UsageAggregate,
  price: UsagePrice,
  prefix?: string,
): LineItem[] {
  const description = [
    prefix,
    price.description ?? humanizeMeter(price.meter),
    formatPeriod(aggregate),
  ]
    .filter(Boolean)
    .join(" — ");
  const currency = normalizeCurrency(price.currency);

  if (price.type !== "tiered") {
    validateUnitAmount(price.unitAmount);
    return [
      {
        description,
        quantity: aggregate.quantity,
        unitAmount: price.unitAmount,
        currency,
      },
    ];
  }

  validateTiers(price);
  if ((price.mode ?? "graduated") === "volume") {
    const tier = price.tiers.find(
      (candidate) =>
        candidate.upTo === "inf" || aggregate.quantity <= candidate.upTo,
    );
    if (!tier) {
      throw new UsageBillingError(
        `Tiered price for ${price.meter} does not cover quantity ${aggregate.quantity}`,
      );
    }
    return [
      {
        description,
        quantity: aggregate.quantity,
        unitAmount: tier.unitAmount,
        currency,
      },
    ];
  }

  const lines: LineItem[] = [];
  let previousLimit = 0;
  let remaining = aggregate.quantity;
  for (const tier of price.tiers) {
    const limit = tier.upTo === "inf" ? Infinity : tier.upTo;
    const tierQuantity = Math.max(
      0,
      Math.min(remaining, limit - previousLimit),
    );
    if (tierQuantity > 0) {
      const label =
        tier.upTo === "inf"
          ? `${previousLimit + 1}+`
          : `${previousLimit + 1}-${tier.upTo}`;
      lines.push({
        description: `${description} (tier ${label})`,
        quantity: tierQuantity,
        unitAmount: tier.unitAmount,
        currency,
      });
    }
    remaining -= tierQuantity;
    previousLimit = limit;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    throw new UsageBillingError(
      `Tiered price for ${price.meter} does not cover quantity ${aggregate.quantity}`,
    );
  }
  return lines;
}

function validateUnitAmount(unitAmount: number): void {
  if (!Number.isFinite(unitAmount) || unitAmount < 0) {
    throw new UsageBillingError(
      "usage price unitAmount must be non-negative",
    );
  }
}

function validateTiers(price: TieredUsagePrice): void {
  if (price.tiers.length === 0) {
    throw new UsageBillingError(
      `Tiered price for ${price.meter} requires at least one tier`,
    );
  }
  let previous = 0;
  for (const [index, tier] of price.tiers.entries()) {
    if (tier.unitAmount < 0 || !Number.isFinite(tier.unitAmount)) {
      throw new UsageBillingError("tier unitAmount must be non-negative");
    }
    if (tier.upTo === "inf") {
      if (index !== price.tiers.length - 1) {
        throw new UsageBillingError("infinite tier must be last");
      }
      continue;
    }
    if (!Number.isFinite(tier.upTo) || tier.upTo <= previous) {
      throw new UsageBillingError("tier limits must increase");
    }
    previous = tier.upTo;
  }
}

function humanizeMeter(meter: string): string {
  return meter.replace(/[_-]+/g, " ");
}

function formatPeriod(aggregate: UsageAggregate): string {
  return `${aggregate.periodStart.toISOString().slice(0, 10)} to ${aggregate.periodEnd
    .toISOString()
    .slice(0, 10)}`;
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
