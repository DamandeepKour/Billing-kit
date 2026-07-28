import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { RazorpayBillingProvider } from "../interfaces/RazorpayBillingProvider";
import type { IdempotencyRequestRepository } from "../interfaces/IdempotencyRequestRepository";
import type { CouponService } from "../coupon/CouponService";
import type { CustomerProfileService } from "../customer/CustomerProfileService";
import type {
  CreateOrderInput,
  OrderResult,
  VerifyPaymentSignatureInput,
} from "../types/order";
import type {
  AcceptDisputeInput,
  ContestDisputeInput,
  Dispute,
  ListDisputesInput,
  UpdateDisputeEvidenceInput,
} from "../types/dispute";
import type {
  CapturePaymentInput,
  CreatePaymentInput,
  PaymentResult,
  RefundResult,
} from "../types/payment";
import { resolveCurrency, assertSmallestUnitAmount } from "../utils/currency";
import {
  executeIdempotentRequest,
  generateIdempotencyKey,
} from "../utils/idempotency";
import { UnsupportedOperationError } from "../utils/stripe-errors";
import type { StripeBillingProvider } from "../interfaces/StripeBillingProvider";

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

function isStripeBillingProvider(
  gateway: PaymentGateway,
): gateway is PaymentGateway & StripeBillingProvider {
  const candidate = gateway as PaymentGateway & Partial<StripeBillingProvider>;
  return (
    gateway.name === "stripe" &&
    typeof candidate.fetchDispute === "function" &&
    typeof candidate.createCustomer === "function"
  );
}

export class PaymentService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly defaultCurrency?: string,
    private readonly couponService?: CouponService,
    private readonly customerProfileService?: CustomerProfileService,
    private readonly idempotencyRequests?: IdempotencyRequestRepository,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const run = async (idempotencyKey: string): Promise<PaymentResult> => {
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
      assertSmallestUnitAmount(input.amount, {
        param: "amount",
        currency,
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
        idempotencyKey,
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
        idempotencyKey,
      };
    };

    if (!this.idempotencyRequests) {
      return run(input.idempotencyKey?.trim() || generateIdempotencyKey());
    }

    const execution = await executeIdempotentRequest({
      repository: this.idempotencyRequests,
      key: input.idempotencyKey,
      kind: "create_payment",
      request: {
        amount: input.amount,
        currency: input.currency,
        customerId: input.customerId,
        customerProfileId: input.customerProfileId,
        orderId: input.orderId,
        description: input.description,
        metadata: input.metadata,
        presentmentCurrency: input.presentmentCurrency,
        settlementCurrency: input.settlementCurrency,
        promotionCode: input.promotionCode,
        couponCode: input.coupon?.code,
      },
      run,
      providerResponse: (result) => result.providerResponse,
    });
    return {
      ...execution.result,
      idempotencyKey: execution.idempotencyKey,
    };
  }

  async capturePayment(input: CapturePaymentInput): Promise<PaymentResult> {
    if (!this.idempotencyRequests) {
      const key = input.idempotencyKey?.trim() || generateIdempotencyKey();
      const result = await this.gateway.capturePayment({
        ...input,
        idempotencyKey: key,
      });
      return { ...result, idempotencyKey: key };
    }

    const execution = await executeIdempotentRequest({
      repository: this.idempotencyRequests,
      key: input.idempotencyKey,
      kind: "capture_payment",
      request: {
        paymentId: input.paymentId,
        amount: input.amount,
      },
      run: async (idempotencyKey) => {
        const result = await this.gateway.capturePayment({
          ...input,
          idempotencyKey,
        });
        return { ...result, idempotencyKey };
      },
      providerResponse: (result) => result.providerResponse,
    });
    return {
      ...execution.result,
      idempotencyKey: execution.idempotencyKey,
    };
  }

  cancelPayment(paymentId: string): Promise<PaymentResult> {
    return this.gateway.cancelPayment(paymentId);
  }

  getPaymentStatus(paymentId: string): Promise<PaymentResult> {
    return this.gateway.getPaymentStatus(paymentId);
  }

  private requireRazorpay(): PaymentGateway & RazorpayBillingProvider {
    if (!isRazorpayBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError(
        "Razorpay billing helpers",
        this.gateway.name,
      );
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

  async fetchDispute(disputeId: string): Promise<Dispute> {
    if (isRazorpayBillingProvider(this.gateway)) {
      return this.gateway.fetchDispute(disputeId);
    }
    if (isStripeBillingProvider(this.gateway)) {
      return this.gateway.fetchDispute(disputeId);
    }
    throw new UnsupportedOperationError("fetchDispute", this.gateway.name);
  }

  async listDisputes(input: ListDisputesInput = {}): Promise<Dispute[]> {
    if (isRazorpayBillingProvider(this.gateway)) {
      return this.gateway.listDisputes(input);
    }
    if (isStripeBillingProvider(this.gateway)) {
      return this.gateway.listDisputes(input);
    }
    throw new UnsupportedOperationError("listDisputes", this.gateway.name);
  }

  async acceptDispute(input: AcceptDisputeInput): Promise<Dispute> {
    return this.requireRazorpay().acceptDispute(input);
  }

  async contestDispute(input: ContestDisputeInput): Promise<Dispute> {
    return this.requireRazorpay().contestDispute(input);
  }

  async updateDisputeEvidence(
    input: UpdateDisputeEvidenceInput,
  ): Promise<Dispute> {
    if (!isStripeBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError(
        "updateDisputeEvidence",
        this.gateway.name,
      );
    }
    return this.gateway.updateDisputeEvidence(input);
  }
}
