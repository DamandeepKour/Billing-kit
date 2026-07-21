import type { Subscription } from "./subscription";

export type EntitlementStatus = "active" | "paused" | "revoked";
export type EntitlementSource =
  | "plan_mapping"
  | "subscription_create"
  | "subscription_cancel"
  | "subscription_renew"
  | "subscription_pause"
  | "subscription_resume"
  | "subscription_retrieve"
  | "payment_failure"
  | "payment_recovery"
  | "webhook"
  | "manual";

export interface PlanFeatureMapping {
  planId: string;
  features: string[];
  updatedAt: Date;
}

export interface CustomerEntitlement {
  id: string;
  customerId: string;
  subscriptionId: string;
  planId: string;
  features: string[];
  status: EntitlementStatus;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd?: Date;
  provider?: string;
  source: EntitlementSource;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetPlanFeaturesInput {
  planId: string;
  features: string[];
}

export interface SyncSubscriptionEntitlementsInput {
  subscription: Subscription;
  source?: EntitlementSource;
}

export interface RevokeFeatureAccessInput {
  customerId?: string;
  subscriptionId?: string;
  source?: EntitlementSource;
  reason?: string;
}

export interface CustomerFeatureAccess {
  customerId: string;
  features: string[];
  entitlements: CustomerEntitlement[];
}
