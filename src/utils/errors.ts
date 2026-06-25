export class BillingKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BillingKitError";
  }
}

export class InvalidConfigError extends BillingKitError {
  constructor(message: string) {
    super(message, "INVALID_CONFIG");
    this.name = "InvalidConfigError";
  }
}

export class PaymentError extends BillingKitError {
  constructor(message: string) {
    super(message, "PAYMENT_ERROR");
    this.name = "PaymentError";
  }
}

export class CouponError extends BillingKitError {
  constructor(message: string) {
    super(message, "COUPON_ERROR");
    this.name = "CouponError";
  }
}

export class WebhookVerificationError extends BillingKitError {
  constructor(message: string) {
    super(message, "WEBHOOK_VERIFICATION_FAILED");
    this.name = "WebhookVerificationError";
  }
}

export class TransactionNotFoundError extends BillingKitError {
  constructor(id: string) {
    super(`Transaction not found: ${id}`, "TRANSACTION_NOT_FOUND");
    this.name = "TransactionNotFoundError";
  }
}
