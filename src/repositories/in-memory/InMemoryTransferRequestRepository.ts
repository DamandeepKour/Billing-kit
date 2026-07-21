import type { TransferRequestRepository } from "../../interfaces/TransferRequestRepository";
import type {
  ClaimTransferRequestResult,
  TransferRequestFilter,
  TransferRequestRecord,
} from "../../types/route";

function matches<T extends string>(
  value: T,
  filter?: T | T[],
): boolean {
  if (!filter) return true;
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

export class InMemoryTransferRequestRepository
  implements TransferRequestRepository
{
  private readonly store = new Map<string, TransferRequestRecord>();

  async claim(
    record: TransferRequestRecord,
  ): Promise<ClaimTransferRequestResult> {
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
      const retry: TransferRequestRecord = {
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

  async save(record: TransferRequestRecord): Promise<TransferRequestRecord> {
    this.store.set(record.idempotencyKey, record);
    return record;
  }

  async findByKey(
    idempotencyKey: string,
  ): Promise<TransferRequestRecord | null> {
    return this.store.get(idempotencyKey) ?? null;
  }

  async list(
    filter?: TransferRequestFilter,
  ): Promise<TransferRequestRecord[]> {
    return [...this.store.values()]
      .filter(
        (record) =>
          matches(record.kind, filter?.kind) &&
          matches(record.status, filter?.status),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
