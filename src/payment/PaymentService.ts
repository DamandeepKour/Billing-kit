import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RazorpayBillingProvider } from "../interfaces/RazorpayBillingProvider";
import type { CouponService } from "../coupon/CouponService";
import type { CustomerProfileService } from "../customer/CustomerProfileService";
import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../types/order";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundResult,
} from "../types/payment";
import { resolveCurrency } from "../utils/currency";
import { UnsupportedOperationError } from "../utils/stripe-errors";

function isRazorpayBillingProvider(
  gateway: PaymentGateway,
): gateway is PaymentGateway & RazorpayBillingProvider {
  const candidate = gateway as PaymentGateway & Partial<RazorpayBillingProvider>;
  return (
    gateway.name === "razorpay" &&
    typeof candidate.createOrder === "function" &&
    typeof candidate.verifyPaymentSignature === "function"
  );
}

export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly defaultCurrency?: string,
    private readonly couponService?: CouponService,
    private readonly customerProfileService?: CustomerProfileService,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    let customerId = input.customerId;
    let currencyOverride = input.currency;
    let metadata = input.metadata;

    if (input.customerProfileId && this.customerProfileService) {
      const profile = await this.customerProfileService.getCustomerProfile(
        input.customerProfileId,
      );
      customerId = customerId ?? profile.providerCustomerId ?? profile.id;
      currencyOverride = currencyOverride ?? profile.defaultCurrency;
      metadata = {
        ...metadata,
        customerProfileId: profile.id,
        ...(profile.paymentPreferences.defaultPaymentMethodId
          ? {
              defaultPaymentMethodId:
                profile.paymentPreferences.defaultPaymentMethodId,
            }
          : {}),
      };
    }

    const currency = resolveCurrency({
      override: currencyOverride,
      configDefault: this.defaultCurrency,
    });

    let amount = input.amount;
    let originalAmount = input.amount;
    let discountAmount = 0;
    let appliedPromotionCode: string | undefined;
    let appliedCouponCode: string | undefined;

    if (this.couponService && (input.promotionCode || input.coupon)) {
      const checkout = this.couponService.applyCheckoutDiscount({
        amount,
        currency,
        promotionCode: input.promotionCode,
        coupon: input.coupon,
        customerId,
      });
      originalAmount = checkout.originalAmount;
      discountAmount = checkout.discountAmount;
      amount = checkout.finalAmount;
      appliedPromotionCode = checkout.appliedPromotion?.code;
      appliedCouponCode =
        checkout.appliedPromotion?.couponCode ?? input.coupon?.code;

      if (checkout.appliedPromotion) {
        const promo = this.couponService.getPromotionCode(
          checkout.appliedPromotion.promotionCodeId,
        );
        if (promo) this.couponService.recordRedemption(promo);
      } else if (input.coupon) {
        this.couponService.recordRedemption(input.coupon);
      }
    }

    const gatewayInput: CreatePaymentInput = {
      amount,
      currency,
      customerId,
      orderId: input.orderId,
      description: input.description,
      metadata,
      idempotencyKey: input.idempotencyKey,
      presentmentCurrency: input.presentmentCurrency,
      settlementCurrency: input.settlementCurrency,
    };
    const result = await this.gateway.createPayment(gatewayInput);

    return {
      ...result,
      originalAmount,
      discountAmount,
      appliedPromotionCode,
      appliedCouponCode,
    };
  }

  capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    return this.gateway.capturePayment(input);
  }

  cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.gateway.cancelPayment(paymentId);
  }

  getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.gateway.getPaymentStatus(paymentId);
  }

  private requireRazorpay(): PaymentGateway & RazorpayBillingProvider {
    if (!isRazorpayBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError("Razorpay billing helpers", this.gateway.name);
    }
    return this.gateway;
  }

  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const currency = resolveCurrency({
      override: input.currency,
      configDefault: this.defaultCurrency,
    });
    return this.requireRazorpay().createOrder({ ...input, currency });
  }

  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean {
    return this.requireRazorpay().verifyPaymentSignature(input);
  }

  async fetchPayment(paymentId: string): Promise<PaymentResult> {
    return this.requireRazorpay().fetchPayment(paymentId);
  }

  async fetchRefund(refundId: string): Promise<RefundResult> {
    return this.requireRazorpay().fetchRefund(refundId);
  }
}
