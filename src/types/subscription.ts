export type BillingInterval = "monthly" | "quarterly" | "yearly";

/** Stripe Price `recurring.usage_type` — licensed (fixed) or metered (usage-based). */
export type UsageType = "licensed" | "metered";

/** How Stripe aggregates metered usage for a billing period. */
export type AggregateUsage = "sum" | "last_during_period" | "last_ever" | "max";

export type PauseCollectionBehavior =
  | "mark_uncollectible"
  | "keep_as_draft"
  | "void";

export interface CreatePlanInput {
  name: string;
  /**
   * Unit amount in smallest currency units.
   * For metered plans this is the per-unit price.
   */
  amount: number;
  currency?: string;
  interval: BillingInterval;
  description?: string;
  metadata?: Record<string, string>;
  /** Default `licensed`. Use `metered` for usage-based billing. */
  usageType?: UsageType;
  /** Required/useful when `usageType` is `metered` (Stripe default: `sum`). */
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
  /** Stripe Product id when available */
  productId?: string;
}

export interface CreateSubscriptionInput {
  customerId: string;
  /** Price / plan id from `createPlan` */
  planId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
  /**
   * Default payment method for the subscription (Stripe).
   * Usually a PaymentMethod id already attached to the customer.
   */
  defaultPaymentMethodId?: string;
  /** Razorpay — number of billing cycles (default 12). */
  totalCount?: number;
}

export interface PauseSubscriptionInput {
  subscriptionId: string;
  behavior?: PauseCollectionBehavior;
  /** When billing should automatically resume (Stripe `resumes_at`). */
  resumesAt?: Date;
}

export interface ReportUsageInput {
  /** Stripe Subscription Item id (`si_…`), not the subscription id. */
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
  /** First subscription item id — needed for metered `reportUsage`. */
  subscriptionItemId?: string;
  paused?: boolean;
}
