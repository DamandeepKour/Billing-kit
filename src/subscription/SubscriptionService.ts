import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { StripeBillingProvider } from "../interfaces/StripeBillingProvider";
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
  Subscription,
  UpdatePlanInput,
  UsageRecord,
} from "../types/subscription";
import { UnsupportedOperationError } from "../utils/stripe-errors";

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
  constructor(private readonly gateway: PaymentGateway) {}

  createPlan(input: CreatePlanInput): Promise<Plan> {
    return this.gateway.createPlan(input);
  }

  updatePlan(input: UpdatePlanInput): Promise<Plan> {
    return this.gateway.updatePlan(input);
  }

  cancelPlan(planId: string): Promise<Plan> {
    return this.gateway.cancelPlan(planId);
  }

  createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.gateway.createSubscription(input);
  }

  cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.cancelSubscription(subscriptionId);
  }

  renewSubscription(subscriptionId: string): Promise<Subscription> {
    return this.gateway.renewSubscription(subscriptionId);
  }

  private requireStripe(): PaymentGateway & StripeBillingProvider {
    if (!isStripeBillingProvider(this.gateway)) {
      throw new UnsupportedOperationError(
        "Stripe billing helpers",
        this.gateway.name,
      );
    }
    return this.gateway;
  }

  async pauseSubscription(input: PauseSubscriptionInput): Promise<Subscription> {
    return this.requireStripe().pauseSubscription(input);
  }

  async resumeSubscription(subscriptionId: string): Promise<Subscription> {
    return this.requireStripe().resumeSubscription(subscriptionId);
  }

  async retrieveSubscription(subscriptionId: string): Promise<Subscription> {
    return this.requireStripe().retrieveSubscription(subscriptionId);
  }

  async createCustomer(input: CreateProviderCustomerInput): Promise<ProviderCustomer> {
    return this.requireStripe().createCustomer(input);
  }

  async attachPaymentMethod(input: AttachPaymentMethodInput): Promise<PaymentMethodResult> {
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