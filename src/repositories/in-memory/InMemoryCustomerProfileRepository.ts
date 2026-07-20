import type { CustomerProfileRepository } from "../../interfaces/CustomerProfileRepository";
import type { CustomerBillingProfile } from "../../types/customer-profile";

export class InMemoryCustomerProfileRepository implements CustomerProfileRepository {
  private readonly store = new Map<string, CustomerBillingProfile>();

  async save(profile: CustomerBillingProfile): Promise<CustomerBillingProfile> {
    this.store.set(profile.id, { ...profile });
    return profile;
  }

  async findById(id: string): Promise<CustomerBillingProfile | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<CustomerBillingProfile | null> {
    const normalized = email.toLowerCase();
    for (const profile of this.store.values()) {
      if (profile.email?.toLowerCase() === normalized) return profile;
    }
    return null;
  }

  async list(): Promise<CustomerBillingProfile[]> {
    return [...this.store.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
