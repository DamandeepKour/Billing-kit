export class BillingKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BillingKitError";
  }
}

export class PaymentFailedError extends BillingKitError {
  constructor(message: string) {
    super(message, "PAYMENT_FAILED");
    this.name = "PaymentFailedError";
  }
}

export class WebhookVerificationError extends BillingKitError {
  constructor(message: string) {
    super(message, "WEBHOOK_VERIFICATION_FAILED");
    this.name = "WebhookVerificationError";
  }
}

export class InvalidConfigError extends BillingKitError {
  constructor(message: string) {
    super(message, "INVALID_CONFIG");
    this.name = "InvalidConfigError";
  }
}
