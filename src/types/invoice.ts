import type { TaxBreakdown } from "./tax";
import type { ExchangeRateMetadata, FeeBreakdown } from "./settlement";
import type {
  AppliedPromotion,
  Coupon,
  DiscountLineItem,
} from "./coupon";
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  defaultCurrency?: string;
  gstin?: string;
  vatNumber?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
}
export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate?: number;
  currency?: string;
  hsnOrSac?: string;
}
export interface Discount {
  type: "percentage" | "flat";
  value: number;
  description?: string;
  couponCode?: string;
  promotionCode?: string;
  amountOff?: number;
  percentOff?: number;
}
export type InvoiceTaxMode = "gst" | "vat" | "sales_tax" | "none";

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "pending"
  | "failed"
  | "retrying"
  | "recovered"
  | "uncollectible";
export interface GenerateInvoiceInput {
  customer?: Customer;
  billingAddress?: Address;
  customerProfileId?: string;
  lineItems: LineItem[];
  discounts?: Discount[];
  coupon?: Coupon;
  promotionCode?: string;
  taxRate?: number;
  taxType?: InvoiceTaxMode;
  taxMode?: InvoiceTaxMode;
  country?: string;
  state?: string;
  placeOfSupply?: string;
  sellerState?: string;
  customerTaxId?: string;
  isBusinessCustomer?: boolean;
  autoTax?: boolean;
  notes?: string;
  currency?: string;
  invoiceNumber?: string;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
}
export interface InvoiceSummary {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  tax: TaxBreakdown;
  total: number;
  currency: string;
  presentmentCurrency?: string;
  settlementCurrency?: string;
  discountLines?: DiscountLineItem[];
}

export interface Invoice extends InvoiceSummary {
  id: string;
  number: string;
  status: InvoiceStatus;
  customer: Customer;
  billingAddress: Address;
  lineItems: LineItem[];
  discounts: Discount[];
  discountLines: DiscountLineItem[];
  appliedPromotion?: AppliedPromotion;
  notes?: string;
  createdAt: Date;
  presentmentAmount?: number;
  settlementAmount?: number;
  exchangeRate?: ExchangeRateMetadata;
  fees?: FeeBreakdown;
  providerResponse?: Record<string, unknown>;
}
