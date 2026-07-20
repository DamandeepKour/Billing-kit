import type { CustomerBillingProfile } from "../types/customer-profile";

export interface CustomerProfileRepository {
  save(profile: CustomerBillingProfile): Promise<CustomerBillingProfile>;
  findById(id: string): Promise<CustomerBillingProfile | null>;
  findByEmail(email: string): Promise<CustomerBillingProfile | null>;
  list(): Promise<CustomerBillingProfile[]>;
  delete(id: string): Promise<void>;
}
