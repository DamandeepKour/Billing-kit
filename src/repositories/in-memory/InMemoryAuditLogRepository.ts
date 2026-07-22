import type { AuditLogRepository } from "../../interfaces/AuditLogRepository";
import type { AuditLogEntry, AuditLogFilter } from "../../types/audit";
import { compareAuditEntries } from "../../utils/audit-sort";

function matchesList(
  value: string,
  expected?: string | string[],
): boolean {
  if (!expected) return true;
  if (Array.isArray(expected)) return expected.includes(value);
  return value === expected;
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly store = new Map<string, AuditLogEntry>();

  async save(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.store.set(entry.id, entry);
    return entry;
  }

  async findById(id: string): Promise<AuditLogEntry | null> {
    return this.store.get(id) ?? null;
  }

  async list(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    let rows = [...this.store.values()];

    if (filter?.resourceType) {
      rows = rows.filter((e) => matchesList(e.resourceType, filter.resourceType));
    }
    if (filter?.resourceId) {
      const resourceId = filter.resourceId;
      rows = rows.filter((e) => e.resourceId === resourceId);
    }
    if (filter?.action) {
      rows = rows.filter((e) => matchesList(e.action, filter.action));
    }
    if (filter?.provider) {
      const provider = filter.provider;
      rows = rows.filter((e) => e.provider === provider);
    }
    if (filter?.from) {
      const from = filter.from;
      rows = rows.filter((e) => e.timestamp >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      rows = rows.filter((e) => e.timestamp <= to);
    }
    if (filter?.relatedResourceId) {
      const related = filter.relatedResourceId;
      rows = rows.filter(
        (e) =>
          e.resourceId === related ||
          e.relatedResourceIds?.includes(related) === true,
      );
    }
    if (filter?.requestId) {
      rows = rows.filter((e) => e.requestId === filter.requestId);
    }
    if (filter?.webhookEventId) {
      rows = rows.filter((e) => e.webhookEventId === filter.webhookEventId);
    }
    if (filter?.correlationId) {
      rows = rows.filter((e) => e.correlationId === filter.correlationId);
    }

    return rows.sort(compareAuditEntries);
  }
}
