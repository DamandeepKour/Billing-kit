export type BillingInterval = "monthly" | "quarterly" | "yearly";
export type UsageType = "licensed" | "metered";
export type AggregateUsage = "sum" | "last_during_period" | "last_ever" | "max";
export type PauseCollectionBehavior = "mark_uncollectible" | "keep_as_draft" | "void";
export interface CreatePlanInput {
  name: string;
  amount: number;
  currency?: string;
  interval: BillingInterval;
  description?: string;
  metadata?: Record<string, string>;
  usageType?: UsageType;
  aggregateUsage?: AggregateUsage;
}
export interface UpdatePlanInput {
  planId: string;
  name?: string;
  description?: string;
  active?: boolean;
}
export interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  provider: string;
  usageType?: UsageType;
  aggregateUsage?: AggregateUsage;
  productId?: string;
}
export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
  defaultPaymentMethodId?: string;
  totalCount?: number;
}
export interface PauseSubscriptionInput {
  subscriptionId: string;
  behavior?: PauseCollectionBehavior;
  resumesAt?: Date;
}
export interface ReportUsageInput {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: Date;
  action?: "increment" | "set";
}
export interface UsageRecord {
  id: string;
  subscriptionItemId: string;
  quantity: number;
  timestamp: Date;
  provider: string;
}
export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  provider: string;
  subscriptionItemId?: string;
  paused?: boolean;
}
