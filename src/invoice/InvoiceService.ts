import type { InvoiceRepository } from "../interfaces/InvoiceRepository";
import type { BillingKitConfig } from "../types/config";
import type {
  Discount,
  GenerateInvoiceInput,
  Invoice,
  InvoiceSummary,
  LineItem,
} from "../types/invoice";
import { TaxService } from "../tax/TaxService";
import {
  CurrencyMismatchError,
  InvoiceNotFoundError,
} from "../utils/errors";
import { generateId } from "../utils/id";
import {
  normalizeCurrency,
  resolveCurrency,
  roundAmount,
} from "../utils/currency";

export class InvoiceNumberGenerator {
  private counter = 0;

  generate(prefix = "INV"): string {
    this.counter += 1;
    const year = new Date().getFullYear();
    const seq = String(this.counter).padStart(5, "0");
    return `${prefix}-${year}-${seq}`;
  }
}

function sumLineItems(lineItems: LineItem[]): number {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitAmount,
    0,
  );
}

function applyDiscounts(subtotal: number, discounts: Discount[] = []): number {
  let total = 0;
  let remaining = subtotal;

  for (const discount of discounts) {
    let amount = 0;
    if (discount.type === "percentage") {
      amount = roundAmount((remaining * discount.value) / 100);
    } else {
      amount = roundAmount(discount.value);
    }
    amount = Math.min(amount, remaining);
    total += amount;
    remaining -= amount;
  }

  return total;
}

function assertLineItemCurrencyConsistency(
  lineItems: LineItem[],
  invoiceCurrency: string,
): void {
  for (const item of lineItems) {
    if (!item.currency) continue;
    if (normalizeCurrency(item.currency) !== invoiceCurrency) {
      throw new CurrencyMismatchError(
        `Line item currency "${item.currency}" does not match invoice currency "${invoiceCurrency}"`,
      );
    }
  }
}

export class InvoiceService {
  private readonly taxService = new TaxService();
  private readonly numberGenerator = new InvoiceNumberGenerator();

  constructor(
    private readonly config: BillingKitConfig,
    private readonly repository: InvoiceRepository,
  ) {}

  async generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    const currency = resolveCurrency({
      override: input.currency,
      customerDefault: input.customer.defaultCurrency,
      configDefault: this.config.currency,
    });

    assertLineItemCurrencyConsistency(input.lineItems, currency);

    const subtotal = sumLineItems(input.lineItems);
    const discountTotal = applyDiscounts(subtotal, input.discounts);
    const taxableAmount = subtotal - discountTotal;

    const sellerState =
      input.sellerState ?? this.config.tax?.sellerState ?? "";
    const buyerState = input.billingAddress.state;
    const taxRate = input.taxRate ?? this.config.tax?.defaultRate ?? 0;
    const taxMode = input.taxMode ?? (this.config.tax?.enabled ? "gst" : "none");

    const tax =
      taxMode === "none" || taxRate <= 0
        ? {
            taxableAmount,
            cgst: 0,
            sgst: 0,
            igst: 0,
            vat: 0,
            totalTax: 0,
            total: taxableAmount,
          }
        : taxMode === "vat"
          ? this.taxService.calculateVAT({ amount: taxableAmount, rate: taxRate })
          : sellerState
            ? this.taxService.calculateGST({
                amount: taxableAmount,
                rate: taxRate,
                sellerState,
                buyerState,
              })
            : {
                taxableAmount,
                cgst: 0,
                sgst: 0,
                igst: 0,
                vat: 0,
                totalTax: 0,
                total: taxableAmount,
              };

    const invoice: Invoice = {
      id: generateId("inv"),
      number: input.invoiceNumber ?? this.numberGenerator.generate(),
      status: "draft",
      customer: input.customer,
      billingAddress: input.billingAddress,
      lineItems: input.lineItems,
      discounts: input.discounts ?? [],
      notes: input.notes,
      subtotal,
      discountTotal,
      taxableAmount,
      tax,
      total: tax.total,
      currency,
      createdAt: new Date(),
    };

    return this.repository.save(invoice);
  }

  async getInvoiceSummary(invoiceId: string): Promise<InvoiceSummary> {
    const invoice = await this.repository.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return {
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      taxableAmount: invoice.taxableAmount,
      tax: invoice.tax,
      total: invoice.total,
      currency: invoice.currency,
    };
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    return this.repository.findById(invoiceId);
  }
}
