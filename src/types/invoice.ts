import type { TaxBreakdown } from "./tax";

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
}

export interface CreateInvoiceInput {
  customerId: string;
  lineItems: LineItem[];
  dueDate?: Date;
  metadata?: Record<string, string>;
  applyTax?: boolean;
  buyerState?: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "void";
  subtotal: number;
  tax: TaxBreakdown;
  total: number;
  currency: string;
  hostedInvoiceUrl?: string;
}
