import { BillingKitError } from "../utils/errors";

export class UsageBillingError extends BillingKitError {
  constructor(message: string) {
    super(message, "USAGE_BILLING_ERROR");
    this.name = "UsageBillingError";
  }
}
