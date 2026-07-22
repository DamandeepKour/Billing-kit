import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { StripeBillingProvider } from "../interfaces/StripeBillingProvider";
import type { CouponService } from "../coupon/CouponService";
import type {
  AttachPaymentMethodInput,
  CreateProviderCustomerInput,
  PaymentMethodResult,
  ProviderCustomer,
  ProviderInvoice,
  SetDefaultPaymentMethodInput,
} from "../types/provider";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  Plan,
  ReportUsageInput,
  ScheduleCancellationInput,
  Subscription,
  UpdatePlanInput,
  UsageRecord,
} from "../types/subscription";
import { UnsupportedOperationError } from "../utils/stripe-errors";
import { CouponError } from "../utils/errors";

function isStripeBillingProvider(
  gateway: PaymentGateway,
): gateway is PaymentGateway & StripeBillingProvider {
  const candidate = gateway as PaymentGateway & Partial<StripeBillingProvider>;
  return (
    gateway.name === "stripe" &&
    typeof candidate.pauseSubscription === "function" &&
    typeof candidate.createCustomer === "function"
  );
}

export class SubscriptionService {
  constructor(
    private readonly gateway: PaymentGateway,
    private readonly couponService?: CouponService,
  ) {}

  createPlan(input: CreatePlanInput): Promise<Plan> {
    return this.gateway.createPlan(input);
  }

  updatePlan(input: UpdatePlanInput): Promise<Plan> {
    return this.gateway.updatePlan(input);
  }

  cancelPlan(planId: string): Promise<Plan> {
    return this.gateway.cancelPlan(planId);
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    let discountAmount: number | undefined;
    let appliedPromotionCode: string | undefined;
    let appliedCouponCode: string | undefined;
    const metadata = { ...input.metadata };

    if (this.couponService && (input.promotionCode || input.coupon)) {
      const amount = input.planAmount ?? 0;

      if (amount > 0) {
        const checkout = this.couponService.applyCheckoutDiscount({
          amount,
          promotionCode: input.promotionCode,
          coupon: input.coupon,
          customerId: input.customerId,
        });
        discountAmount = checkout.discountAmount;
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
      } else if (input.promotionCode) {
        const promo = this.couponService.getPromotionCode(input.promotionCode);
        if (!promo) {
          throw new CouponError(`Promotion code "${input.promotionCode}" not found`);
        }
        this.couponService.validatePromotionCode(promo, promo.minAmount ?? 0, {
          customerId: input.customerId,
        });
        appliedPromotionCode = promo.code;
        appliedCouponCode = promo.coupon.code;
        this.couponService.recordRedemption(promo);
      } else if (input.coupon) {
        this.couponService.validateCoupon(input.coupon, input.coupon.minAmount ?? 0);
        appliedCouponCode = input.coupon.code;
        this.couponService.recordRedemption(input.coupon);
      }

      if (appliedPromotionCode) metadata.promotionCode = appliedPromotionCode;
      if (appliedCouponCode) metadata.couponCode = appliedCouponCode;
    }

    const subscription = await this.gateway.createSubscription({
      customerId: input.customerId,
      planId: input.planId,
      trialDays: input.trialDays,
      metadata,
      defaultPaymentMethodId: input.defaultPaymentMethodId,
      totalCount: input.totalCount,
    });

    return {
      ...subscription,
      discountAmount,
      appliedPromotionCode,
      appliedCouponCode,
    };
  }

  cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.cancelSubscription(subscriptionId);
  }

  scheduleCancellation(
    input: ScheduleCancellationInput | string,
  ): Promise<Subscription> {
    const subscriptionId =
      typeof input === "string" ? input : input.subscriptionId;
    return this.gateway.scheduleCancellation(subscriptionId);
  }

  renewSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.renewSubscription(subscriptionId);
  }

  private requireStripe(): PaymentGateway & StripeBillingProvider {
    if (!isStripeBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError("Stripe billing helpers", this.gateway.name);
    }
    return this.gateway;
  }

  pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription> {
    return this.gateway.pauseSubscription(input);
  }

  resumeSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.resumeSubscription(subscriptionId);
  }

  retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.retrieveSubscription(subscriptionId);
  }

  async createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer> {
    return this.requireStripe().createCustomer(input);
  }

  async attachPaymentMethod(
    input: AttachPaymentMethodInput,
  ): Promise<PaymentMethodResult> {
    return this.requireStripe().attachPaymentMethod(input);
  }

  async setDefaultPaymentMethod(
    input: SetDefaultPaymentMethodInput,
  ): Promise<ProviderCustomer> {
    return this.requireStripe().setDefaultPaymentMethod(input);
  }

  async retrieveProviderInvoice(invoiceId: string): Promise<ProviderInvoice> {
    return this.requireStripe().retrieveProviderInvoice(invoiceId);
  }

  async reportUsage(input: ReportUsageInput): Promise<UsageRecord> {
    return this.requireStripe().reportUsage(input);
  }
}
