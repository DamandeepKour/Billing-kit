import type { RetryAttemptRepository } from "../../interfaces/RetryAttemptRepository";
import type { BillingRetryAttempt, RetryAttemptFilter } from "../../types/retry";

export class InMemoryRetryAttemptRepository implements RetryAttemptRepository {
  private readonly store = new Map<string, BillingRetryAttempt>();

  async save(attempt: BillingRetryAttempt): Promise<BillingRetryAttempt> {
    this.store.set(attempt.id, { ...attempt });
    return attempt;
  }

  async findById(id: string): Promise<BillingRetryAttempt | null> {
    return this.store.get(id) ?? null;
  }

  async findByReference(
    referenceId: string,
    kind?: BillingRetryAttempt["kind"],
  ): Promise<BillingRetryAttempt | null> {
    for (const attempt of this.store.values()) {
      if (attempt.referenceId !== referenceId) continue;
      if (kind && attempt.kind !== kind) continue;
      return attempt;
    }
    return null;
  }

  async list(filter?: RetryAttemptFilter): Promise<BillingRetryAttempt[]> {
    let rows = [...this.store.values()];

    if (filter?.kind) {
      rows = rows.filter((a) => a.kind === filter.kind);
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      const set = new Set(statuses);
      rows = rows.filter((a) => set.has(a.status));
    }

    if (filter?.dueBefore) {
      const dueBefore = filter.dueBefore;
      rows = rows.filter(
        (a) =>
          a.status === "retrying" &&
          a.nextRetryAt !== undefined &&
          a.nextRetryAt <= dueBefore,
      );
    }

    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
