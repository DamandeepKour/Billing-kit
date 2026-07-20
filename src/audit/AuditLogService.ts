import type { AuditLogRepository } from "../interfaces/AuditLogRepository";
import type {
  AuditActor,
  AuditLogEntry,
  AuditLogFilter,
  RecordBillingEventInput,
} from "../types/audit";
import { compareAuditEntries } from "../utils/audit-sort";
import { generateId } from "../utils/id";
import { summarizePayload } from "../utils/mask";

const DEFAULT_ACTOR: AuditActor = { type: "system", name: "billing-kit" };

export class AuditLogService {
  private sequence = 0;

  constructor(
    private readonly repository: AuditLogRepository,
    private readonly defaultProvider?: string,
    private readonly defaultActor: AuditActor = DEFAULT_ACTOR,
  ) {}

  async recordBillingEvent(
    input: RecordBillingEventInput,
  ): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: generateId("aud"),
      timestamp: new Date(),
      sequence: ++this.sequence,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      provider: input.provider ?? this.defaultProvider,
      actor: input.actor ?? this.defaultActor,
      payloadSummary: summarizePayload(input.payload),
      relatedResourceIds: input.relatedResourceIds,
    };
    return this.repository.save(entry);
  }

  async getAuditEvent(id: string): Promise<AuditLogEntry | null> {
    return this.repository.findById(id);
  }

  async listAuditEvents(filter?: AuditLogFilter): Promise<AuditLogEntry[]> {
    return this.repository.list(filter);
  }

  async getInvoiceTimeline(invoiceId: string): Promise<AuditLogEntry[]> {
    const [direct, related] = await Promise.all([
      this.repository.list({
        resourceType: "invoice",
        resourceId: invoiceId,
      }),
      this.repository.list({ relatedResourceId: invoiceId }),
    ]);
    return mergeOrdered(direct, related);
  }

  async getPaymentAuditLog(paymentId: string): Promise<AuditLogEntry[]> {
    const [direct, related] = await Promise.all([
      this.repository.list({
        resourceType: ["payment", "refund"],
        resourceId: paymentId,
      }),
      this.repository.list({ relatedResourceId: paymentId }),
    ]);
    return mergeOrdered(direct, related);
  }
}

function mergeOrdered(
  left: AuditLogEntry[],
  right: AuditLogEntry[],
): AuditLogEntry[] {
  const byId = new Map<string, AuditLogEntry>();
  for (const entry of [...left, ...right]) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(compareAuditEntries);
}
