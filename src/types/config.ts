import type { InvoiceRepository } from "../interfaces/InvoiceRepository";
import type { TransactionRepository } from "../interfaces/TransactionRepository";

export type BillingProvider = "stripe" | "razorpay";

export interface CompanyDetails {
  name: string;
  address: string;
  email?: string;
  phone?: string;
  /** GSTIN / VAT / Tax ID printed on invoices */
  taxId?: string;
  gstin?: string;
  vatNumber?: string;
  logoUrl?: string;
}

export interface TaxConfig {
  enabled: boolean;
  defaultRate?: number;
  sellerState?: string;
}

export interface BillingKitConfig {
  provider: BillingProvider;
  secretKey: string;
  keyId?: string;
  webhookSecret?: string;
  currency?: string;
  company?: CompanyDetails;
  tax?: TaxConfig;
  invoiceRepository?: InvoiceRepository;
  transactionRepository?: TransactionRepository;
}
