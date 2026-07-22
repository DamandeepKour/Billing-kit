import type { IdempotencyRequestRepository } from "../../interfaces/IdempotencyRequestRepository";
import type {
  ClaimIdempotencyRequestResult,
  IdempotencyRequestFilter,
  IdempotencyRequestRecord,
} from "../../types/idempotency";

function matches<T extends string>(value: T, filter?: T | T[]): boolean {
  if (!filter) return true;
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

export class InMemoryIdempotencyRequestRepository
  implements IdempotencyRequestRepository
{
  private readonly store = new Map<string, IdempotencyRequestRecord>();

  async claim(
    record: IdempotencyRequestRecord,
  ): Promise<ClaimIdempotencyRequestResult> {
    const existing = this.store.get(record.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== record.fingerprint) {
        return { outcome: "conflict", record: existing };
      }
      if (existing.status === "succeeded") {
        return { outcome: "duplicate", record: existing };
      }
      if (
        existing.status === "processing" ||
        existing.status === "uncertain"
      ) {
        return { outcome: "in_flight", record: existing };
      }
      const retry: IdempotencyRequestRecord = {
        ...record,
        id: existing.id,
        createdAt: existing.createdAt,
      };
      this.store.set(record.idempotencyKey, retry);
      return { outcome: "claimed", record: retry };
    }

    this.store.set(record.idempotencyKey, record);
    return { outcome: "claimed", record };
  }

  async save(
    record: IdempotencyRequestRecord,
  ): Promise<IdempotencyRequestRecord> {
    this.store.set(record.idempotencyKey, record);
    return record;
  }

  async findByKey(
    idempotencyKey: string,
  ): Promise<IdempotencyRequestRecord | null> {
    return this.store.get(idempotencyKey) ?? null;
  }

  async list(
    filter?: IdempotencyRequestFilter,
  ): Promise<IdempotencyRequestRecord[]> {
    return [...this.store.values()]
      .filter(
        (record) =>
          matches(record.kind, filter?.kind) &&
          matches(record.status, filter?.status),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
