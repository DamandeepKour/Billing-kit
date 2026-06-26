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
import { InvoiceNotFoundError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency, roundAmount } from "../utils/currency";

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

export class InvoiceService {
  private readonly taxService = new TaxService();
  private readonly numberGenerator = new InvoiceNumberGenerator();

  constructor(
    private readonly config: BillingKitConfig,
    private readonly repository: InvoiceRepository,
  ) {}

  async generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    const currency = normalizeCurrency(input.currency ?? this.config.currency);
    const subtotal = sumLineItems(input.lineItems);
    const discountTotal = applyDiscounts(subtotal, input.discounts);
    const taxableAmount = subtotal - discountTotal;

    const sellerState =
      input.sellerState ?? this.config.tax?.sellerState ?? "";
    const buyerState = input.billingAddress.state;
    const taxRate = input.taxRate ?? this.config.tax?.defaultRate ?? 0;

    const tax =
      this.config.tax?.enabled && taxRate > 0 && sellerState
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
