import type { AuditLogRepository } from "../interfaces/AuditLogRepository";
import type { InvoiceRepository } from "../interfaces/InvoiceRepository";
import type { TransactionRepository } from "../interfaces/TransactionRepository";
import type { RetryAttemptRepository } from "../interfaces/RetryAttemptRepository";
import type { WebhookEventRepository } from "../interfaces/WebhookEventRepository";
import type { UsageEventRepository } from "../interfaces/UsageEventRepository";
import type { AuditActor } from "./audit";
import type { BillingRetryHooks, RetryPolicyConfig } from "./retry";

export type BillingProvider = "stripe" | "razorpay";

export interface CompanyDetails {
  name: string;
  address: string;
  email?: string;
  phone?: string;
  taxId?: string;
  gstin?: string;
  vatNumber?: string;
  logoUrl?: string;
}

export interface TaxConfig {
  enabled: boolean;
  autoTax?: boolean;
  defaultRate?: number;
  taxType?: "gst" | "vat" | "sales_tax" | "none";
  sellerState?: string;
  sellerCountry?: string;
}

export interface BillingKitConfig {
  provider: BillingProvider;
  secretKey: string;
  keyId?: string;
  webhookSecret?: string;
  currency?: string;
  company?: CompanyDetails;
  tax?: TaxConfig;
  retry?: RetryPolicyConfig;
  retryHooks?: BillingRetryHooks;
  invoiceRepository?: InvoiceRepository;
  transactionRepository?: TransactionRepository;
  retryAttemptRepository?: RetryAttemptRepository;
  customerProfileRepository?: import("../interfaces/CustomerProfileRepository").CustomerProfileRepository;
  auditLogRepository?: AuditLogRepository;
  auditActor?: AuditActor;
  webhookEventRepository?: WebhookEventRepository;
  usageEventRepository?: UsageEventRepository;
}
