import type { BillingKitConfig } from "../types/config";
import { InvalidConfigError } from "../utils/errors";
import type { PaymentProvider } from "./providers/PaymentProvider";
import { StripeProvider } from "./providers/StripeProvider";

export function createPaymentProvider(config: BillingKitConfig): PaymentProvider {
  switch (config.provider) {
    case "stripe":
      return new StripeProvider(config);
    default:
      throw new InvalidConfigError(`Unsupported provider: ${config.provider}`);
  }
}

export type { PaymentProvider } from "./providers/PaymentProvider";
export { StripeProvider } from "./providers/StripeProvider";
export { PaymentService } from "./PaymentService";
