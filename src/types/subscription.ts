export type BillingInterval = "monthly" | "quarterly" | "yearly";
export type UsageType = "licensed" | "metered";
export type AggregateUsage = "sum" | "last_during_period" | "last_ever" | "max";
export type PauseCollectionBehavior =
  | "mark_uncollectible"
  | "keep_as_draft"
  | "void";
/** Canonical subscription lifecycle across Stripe and Razorpay. */
export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "past_due"
  | "pending";
export interface CreatePlanInput {
  name: string;
  amount: number;
  currency?: string;
  interval: BillingInterval;
  description?: string;
  metadata?: Record<string, string>;
  usageType?: UsageType;
  aggregateUsage?: AggregateUsage;
  features?: string[];
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
  features?: string[];
}
export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
  defaultPaymentMethodId?: string;
  totalCount?: number;
  coupon?: import("./coupon").Coupon;
  promotionCode?: string;
  /** Used to compute discountAmount when applying a coupon/promotion */
  planAmount?: number;
}
export interface PauseSubscriptionInput {
  subscriptionId: string;
  /** Stripe pause_collection behavior. Ignored by Razorpay. */
  behavior?: PauseCollectionBehavior;
  /** Stripe resumes_at. Ignored by Razorpay (always pause now). */
  resumesAt?: Date;
}
export interface ResumeSubscriptionInput {
  subscriptionId: string;
}
export interface ScheduleCancellationInput {
  subscriptionId: string;
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
  /** Canonical lifecycle status. */
  status: SubscriptionStatus;
  /** Raw provider status string (Stripe / Razorpay). */
  providerStatus?: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  provider: string;
  subscriptionItemId?: string;
  paused?: boolean;
  discountAmount?: number;
  appliedPromotionCode?: string;
  appliedCouponCode?: string;
}
