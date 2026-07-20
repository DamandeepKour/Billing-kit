export type AuditResourceType =
  | "invoice"
  | "payment"
  | "refund"
  | "tax"
  | "webhook"
  | "transaction"
  | "subscription"
  | "transfer"
  | "customer"
  | "billing";

export type AuditAction =
  | "invoice.created"
  | "invoice.status_updated"
  | "payment.attempted"
  | "payment.captured"
  | "payment.cancelled"
  | "payment.failed"
  | "refund.created"
  | "tax.calculated"
  | "webhook.received"
  | "transaction.recorded"
  | "billing.event";

export interface AuditActor {
  type: "system" | "user" | "api" | "webhook" | "provider";
  id?: string;
  name?: string;
}

export interface RecordBillingEventInput {
  action: AuditAction | string;
  resourceType: AuditResourceType | string;
  resourceId: string;
  provider?: string;
  actor?: AuditActor;
  payload?: Record<string, unknown>;
  relatedResourceIds?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  sequence: number;
  action: string;
  resourceType: string;
  resourceId: string;
  provider?: string;
  actor: AuditActor;
  payloadSummary: Record<string, unknown>;
  relatedResourceIds?: string[];
}

export interface AuditLogFilter {
  resourceType?: string | string[];
  resourceId?: string;
  action?: string | string[];
  provider?: string;
  from?: Date;
  to?: Date;
  relatedResourceId?: string;
}
