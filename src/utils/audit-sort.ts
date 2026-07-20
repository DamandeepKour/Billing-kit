import type { AuditLogEntry } from "../types/audit";

export function compareAuditEntries(a: AuditLogEntry, b: AuditLogEntry): number {
  const delta = a.timestamp.getTime() - b.timestamp.getTime();
  if (delta !== 0) return delta;
  return a.sequence - b.sequence;
}
