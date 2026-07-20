import type { BillingRetryAttempt, RetryAttemptFilter } from "../types/retry";

export interface RetryAttemptRepository {
  save(attempt: BillingRetryAttempt): Promise<BillingRetryAttempt>;
  findById(id: string): Promise<BillingRetryAttempt | null>;
  findByReference(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt | null>;
  list(filter?: RetryAttemptFilter): Promise<BillingRetryAttempt[]>;
}
