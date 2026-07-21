import { createHmac } from "crypto";
import Stripe from "stripe";

export function generateRazorpayWebhookSignature(
  payload: string | Buffer,
  secret: string,
): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function generateStripeWebhookSignature(
  payload: string,
  secret: string,
  options?: { timestamp?: number; scheme?: string },
): string {
  return new Stripe("sk_test_webhook").webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: options?.timestamp,
    scheme: options?.scheme,
  });
}

export function generateRazorpayPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  secretKey: string;
}): string {
  return createHmac("sha256", input.secretKey)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
}
