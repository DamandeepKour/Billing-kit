import type { PaymentGateway } from "../interfaces/PaymentGateway";
import type { BillingKitConfig } from "../types/config";
import { InvalidConfigError } from "../utils/errors";
import { RazorpayGateway } from "./gateways/RazorpayGateway";
import { StripeGateway } from "./gateways/StripeGateway";

export class PaymentGatewayFactory {
  static create(config: BillingKitConfig): PaymentGateway {
    switch (config.provider) {
      case "stripe":
        return new StripeGateway(config);
      case "razorpay":
        return new RazorpayGateway(config);
      default:
        throw new InvalidConfigError(`Unsupported provider: ${config.provider}`);
    }
  }
}

export class PaymentManager {
  private readonly gateway: PaymentGateway;

  constructor(config: BillingKitConfig) {
    this.gateway = PaymentGatewayFactory.create(config);
  }

  getGateway(): PaymentGateway {
    return this.gateway;
  }
}

export { StripeGateway } from "./gateways/StripeGateway";
export { RazorpayGateway } from "./gateways/RazorpayGateway";
