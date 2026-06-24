import type { PaymentProvider } from "../payment/providers/PaymentProvider";
import type {
  CreateSubscriptionInput,
  Subscription,
} from "../types/subscription";

export class SubscriptionService {
  constructor(private readonly provider: PaymentProvider) {}

  createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    return this.provider.createSubscription(input);
  }

  cancelSubscription(subscriptionId: string): Promise<Subscription> {
    return this.provider.cancelSubscription(subscriptionId);
  }
}
