import type { EntitlementRepository } from "../../interfaces/EntitlementRepository";
import type {
  CustomerEntitlement,
  PlanFeatureMapping,
} from "../../types/entitlement";

export class InMemoryEntitlementRepository
  implements EntitlementRepository
{
  private readonly planFeatures = new Map<string, PlanFeatureMapping>();
  private readonly entitlements = new Map<string, CustomerEntitlement>();

  async savePlanFeatures(
    mapping: PlanFeatureMapping,
  ): Promise<PlanFeatureMapping> {
    this.planFeatures.set(mapping.planId, mapping);
    return mapping;
  }

  async findPlanFeatures(
    planId: string,
  ): Promise<PlanFeatureMapping | null> {
    return this.planFeatures.get(planId) ?? null;
  }

  async saveEntitlement(
    entitlement: CustomerEntitlement,
  ): Promise<CustomerEntitlement> {
    this.entitlements.set(entitlement.subscriptionId, entitlement);
    return entitlement;
  }

  async findBySubscription(
    subscriptionId: string,
  ): Promise<CustomerEntitlement | null> {
    return this.entitlements.get(subscriptionId) ?? null;
  }

  async listByCustomer(customerId: string): Promise<CustomerEntitlement[]> {
    return [...this.entitlements.values()]
      .filter((entitlement) => entitlement.customerId === customerId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listEntitlements(): Promise<CustomerEntitlement[]> {
    return [...this.entitlements.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }
}
