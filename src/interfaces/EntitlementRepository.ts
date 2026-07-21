import type {
  CustomerEntitlement,
  PlanFeatureMapping,
} from "../types/entitlement";

export interface EntitlementRepository {
  savePlanFeatures(
    mapping: PlanFeatureMapping,
  ): Promise<PlanFeatureMapping>;
  findPlanFeatures(planId: string): Promise<PlanFeatureMapping | null>;
  saveEntitlement(
    entitlement: CustomerEntitlement,
  ): Promise<CustomerEntitlement>;
  findBySubscription(
    subscriptionId: string,
  ): Promise<CustomerEntitlement | null>;
  listByCustomer(customerId: string): Promise<CustomerEntitlement[]>;
  listEntitlements(): Promise<CustomerEntitlement[]>;
}
