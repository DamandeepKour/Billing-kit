import type { GenerateInvoiceInput, Invoice, LineItem } from "./invoice";

export type UsageAggregationPeriod = "day" | "month" | "billing_cycle";
export type UsageAggregationMethod = "sum" | "max" | "last";
export type UsagePricingType = "per_unit" | "tiered" | "metered";

export interface RecordUsageEventInput {
  customerId: string;
  meter: string;
  quantity: number;
  timestamp?: Date;
  subscriptionId?: string;
  metadata?: Record<string, string>;
}

export interface UsageEvent {
  id: string;
  customerId: string;
  meter: string;
  quantity: number;
  timestamp: Date;
  subscriptionId?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
}

export interface UsageEventFilter {
  customerId?: string;
  meter?: string | string[];
  subscriptionId?: string;
  from?: Date;
  to?: Date;
}

export interface AggregateUsageEventsInput {
  customerId: string;
  meter?: string | string[];
  subscriptionId?: string;
  period: UsageAggregationPeriod;
  aggregationMethod?: UsageAggregationMethod;
  from?: Date;
  to?: Date;
  now?: Date;
}

export interface UsageAggregate {
  customerId: string;
  meter: string;
  subscriptionId?: string;
  period: UsageAggregationPeriod;
  aggregationMethod: UsageAggregationMethod;
  periodStart: Date;
  periodEnd: Date;
  quantity: number;
  eventCount: number;
}

interface UsagePriceBase {
  meter: string;
  currency: string;
  description?: string;
}

export interface PerUnitUsagePrice extends UsagePriceBase {
  type: "per_unit";
  unitAmount: number;
}

export interface MeteredUsagePrice extends UsagePriceBase {
  type: "metered";
  unitAmount: number;
  aggregationMethod?: UsageAggregationMethod;
}

export interface UsagePriceTier {
  upTo: number | "inf";
  unitAmount: number;
}

export interface TieredUsagePrice extends UsagePriceBase {
  type: "tiered";
  mode?: "graduated" | "volume";
  tiers: UsagePriceTier[];
}

export type UsagePrice =
  | PerUnitUsagePrice
  | MeteredUsagePrice
  | TieredUsagePrice;

export interface PricedUsage {
  aggregate: UsageAggregate;
  price: UsagePrice;
  amount: number;
}

export interface UsageToLineItemsInput {
  aggregates: UsageAggregate[];
  prices: UsagePrice[];
  descriptionPrefix?: string;
}

export interface GenerateUsageInvoiceInput
  extends Omit<GenerateInvoiceInput, "lineItems"> {
  usage: AggregateUsageEventsInput;
  prices: UsagePrice[];
  descriptionPrefix?: string;
}

export interface GenerateUsageInvoiceResult {
  invoice: Invoice;
  aggregates: UsageAggregate[];
  lineItems: LineItem[];
}
