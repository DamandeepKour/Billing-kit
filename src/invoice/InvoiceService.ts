import type { InvoiceRepository } from "../interfaces/InvoiceRepository";
import type { CouponService } from "../coupon/CouponService";
import type { BillingKitConfig } from "../types/config";
import type {
  Discount,
  GenerateInvoiceInput,
  Invoice,
  InvoiceSummary,
  LineItem,
} from "../types/invoice";
import type { DiscountLineItem } from "../types/coupon";
import { TaxEngine } from "../tax/TaxEngine";
import { CurrencyMismatchError, InvoiceNotFoundError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency, resolveCurrency, roundAmount } from "../utils/currency";

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
  return lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
}

function applyManualDiscounts(
  subtotal: number,
  discounts: Discount[] = [],
): { total: number; lines: DiscountLineItem[] } {
  let total = 0;
  let remaining = subtotal;
  const lines: DiscountLineItem[] = [];

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

    if (amount > 0) {
      lines.push({
        description:
          discount.description ??
          (discount.type === "percentage"
            ? `Discount (${discount.value}%)`
            : "Discount"),
        amount,
        type: discount.type,
        couponCode: discount.couponCode,
        promotionCode: discount.promotionCode,
        percentOff: discount.percentOff ?? (discount.type === "percentage" ? discount.value : undefined),
        amountOff: discount.amountOff ?? (discount.type === "flat" ? amount : undefined),
      });
    }
  }

  return { total, lines };
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
  private readonly taxEngine = new TaxEngine();
  private readonly numberGenerator = new InvoiceNumberGenerator();

  constructor(
    private readonly config: BillingKitConfig,
    private readonly repository: InvoiceRepository,
    private readonly couponService?: CouponService,
  ) {}

  async generateInvoice(input: GenerateInvoiceInput): Promise<Invoice> {
    const currency = resolveCurrency({
      override: input.currency,
      customerDefault: input.customer.defaultCurrency,
      configDefault: this.config.currency,
    });
    assertLineItemCurrencyConsistency(input.lineItems, currency);

    const subtotal = sumLineItems(input.lineItems);
    const manual = applyManualDiscounts(subtotal, input.discounts);
    let discountTotal = manual.total;
    let discountLines = [...manual.lines];
    let appliedPromotion = undefined;
    const discounts = [...(input.discounts ?? [])];

    if (this.couponService && (input.promotionCode || input.coupon)) {
      const checkout = this.couponService.applyCheckoutDiscount({
        amount: subtotal - discountTotal,
        currency,
        promotionCode: input.promotionCode,
        coupon: input.coupon,
        customerId: input.customer.id,
      });
      discountTotal += checkout.discountAmount;
      discountLines = [...discountLines, ...checkout.discountLines];
      appliedPromotion = checkout.appliedPromotion;

      if (checkout.discountAmount > 0) {
        discounts.push({
          type: checkout.discountLines[0]?.type ?? "flat",
          value:
            checkout.discountLines[0]?.type === "percentage"
              ? (checkout.discountLines[0].percentOff ?? 0)
              : checkout.discountAmount,
          description: checkout.discountLines[0]?.description,
          couponCode: checkout.appliedPromotion?.couponCode,
          promotionCode: checkout.appliedPromotion?.code,
          amountOff: checkout.appliedPromotion?.amountOff,
          percentOff: checkout.appliedPromotion?.percentOff,
        });

        if (checkout.appliedPromotion) {
          const promo = this.couponService.getPromotionCode(
            checkout.appliedPromotion.promotionCodeId,
          );
          if (promo) this.couponService.recordRedemption(promo);
        } else if (input.coupon) {
          this.couponService.recordRedemption(input.coupon);
        }
      }
    }

    const taxableAmount = subtotal - discountTotal;
    const taxEnabled = this.config.tax?.enabled ?? false;
    const autoTax = input.autoTax ?? this.config.tax?.autoTax ?? false;
    const taxType =
      input.taxType ??
      input.taxMode ??
      this.config.tax?.taxType ??
      (taxEnabled || autoTax ? undefined : "none");
    const country =
      input.country ?? input.billingAddress.country ?? this.config.tax?.sellerCountry;
    const buyerState = input.state ?? input.placeOfSupply ?? input.billingAddress.state;
    const sellerState = input.sellerState ?? this.config.tax?.sellerState ?? "";
    const customerTaxId =
      input.customerTaxId ??
      input.customer.customerTaxId ??
      input.customer.gstin ??
      input.customer.vatNumber;
    const isBusinessCustomer =
      input.isBusinessCustomer ?? input.customer.isBusinessCustomer;
    const tax =
      !taxEnabled && !autoTax && (taxType === "none" || taxType === undefined)
        ? this.taxEngine.calculate({
            amount: taxableAmount,
            taxType: "none",
          })
        : this.taxEngine.calculate({
            amount: taxableAmount,
            taxType: taxType === "none" ? "none" : taxType,
            rate: input.taxRate ?? this.config.tax?.defaultRate,
            country,
            state: buyerState,
            sellerState,
            buyerState,
            placeOfSupply: input.placeOfSupply ?? buyerState,
            customerTaxId,
            isBusinessCustomer,
            autoTax: autoTax || (taxEnabled && !taxType),
          });

    const presentmentCurrency = normalizeCurrency(input.presentmentCurrency ?? currency);
    const settlementCurrency = normalizeCurrency(
      input.settlementCurrency ?? presentmentCurrency,
    );

    const invoice: Invoice = {
      id: generateId("inv"),
      number: input.invoiceNumber ?? this.numberGenerator.generate(),
      status: "draft",
      customer: input.customer,
      billingAddress: input.billingAddress,
      lineItems: input.lineItems,
      discounts,
      discountLines,
      appliedPromotion,
      notes: input.notes,
      subtotal,
      discountTotal,
      taxableAmount,
      tax,
      total: tax.total,
      currency,
      presentmentCurrency,
      settlementCurrency,
      presentmentAmount: tax.total,
      settlementAmount: input.fees?.net ?? tax.total,
      exchangeRate: input.exchangeRate,
      fees: input.fees,
      providerResponse: input.providerResponse,
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
      presentmentCurrency: invoice.presentmentCurrency,
      settlementCurrency: invoice.settlementCurrency,
      discountLines: invoice.discountLines,
    };
  }

  async getInvoice(invoiceId: string): Promise<Invoice | null> {
    return this.repository.findById(invoiceId);
  }

  async updateInvoiceStatus(
    invoiceId: string,
    status: Invoice["status"],
  ): Promise<Invoice> {
    const invoice = await this.repository.findById(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    return this.repository.save({ ...invoice, status });
  }
}
