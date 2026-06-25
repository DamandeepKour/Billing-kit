export type BillingInterval = "monthly" | "quarterly" | "yearly";

export interface CreatePlanInput {
  name: string;
  amount: number;
  currency?: string;
  interval: BillingInterval;
  description?: string;
  metadata?: Record<string, string>;
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
}

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  provider: string;
}
