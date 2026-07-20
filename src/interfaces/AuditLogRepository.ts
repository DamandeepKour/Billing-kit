import type { AuditLogEntry, AuditLogFilter } from "../types/audit";

export interface AuditLogRepository {
  save(entry: AuditLogEntry): Promise<AuditLogEntry>;
  findById(id: string): Promise<AuditLogEntry | null>;
  list(filter?: AuditLogFilter): Promise<AuditLogEntry[]>;
}
