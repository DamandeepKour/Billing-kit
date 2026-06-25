import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type {
  CreatePlanInput,
  CreateSubscriptionInput,
  Plan,
  Subscription,
  UpdatePlanInput,
} from "../types/subscription";

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
}
