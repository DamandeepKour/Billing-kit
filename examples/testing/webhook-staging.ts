/**
 * Staging webhook smoke checks against BillingKit.verifyWebhook / processWebhook.
 *
 * Uses fixture payloads + local signature generation — no live provider required.
 *
 *   npx ts-node examples/testing/webhook-staging.ts
 */
import { BillingKit } from "../../src";
import {
  createMockRazorpayPaymentCaptured,
  createMockRazorpayRefundProcessed,
  createMockRazorpaySubscription,
  createMockStripeChargeRefunded,
  createMockStripeInvoicePaid,
  createMockStripePaymentIntentSucceeded,
  createMockStripeSubscription,
  createSignedWebhookRequest,
} from "../../src/testing";

async function runRazorpayChecks(): Promise<void> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "whsec_staging_rzp";
  const billing = new BillingKit({
    provider: "razorpay",
    keyId: process.env.RAZORPAY_KEY_ID ?? "rzp_test",
    secretKey: process.env.RAZORPAY_KEY_SECRET ?? "secret",
    webhookSecret: secret,
  });

  const payment = createSignedWebhookRequest({
    provider: "razorpay",
    payload: createMockRazorpayPaymentCaptured({ amount: 99900 }),
    secret,
    eventId: "staging_pay_1",
  });
  const refund = createSignedWebhookRequest({
    provider: "razorpay",
    payload: createMockRazorpayRefundProcessed(),
    secret,
    eventId: "staging_rfnd_1",
  });
  const subscription = createSignedWebhookRequest({
    provider: "razorpay",
    payload: createMockRazorpaySubscription("subscription.activated"),
    secret,
    eventId: "staging_sub_1",
  });

  const verified = billing.verifyWebhook(payment.rawBody, payment.signature);
  console.log("razorpay payment.captured →", verified.normalizedType, verified.entity.id);

  const processed = await billing.processWebhook(refund, async (event) => {
    console.log("razorpay refund handler →", event.normalizedType, event.entity.id);
  });
  console.log("razorpay refund process →", {
    duplicate: processed.duplicate,
    status: processed.record.status,
  });

  const activated = await billing.processWebhook(subscription, async () => undefined);
  console.log("razorpay subscription.activated →", activated.event.entity.id);
}

async function runStripeChecks(): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_staging_stripe";
  const billing = new BillingKit({
    provider: "stripe",
    secretKey: process.env.STRIPE_SECRET_KEY ?? "sk_test",
    webhookSecret: secret,
  });

  const payment = createSignedWebhookRequest({
    provider: "stripe",
    payload: createMockStripePaymentIntentSucceeded({ amount: 5000 }),
    secret,
  });
  const refund = createSignedWebhookRequest({
    provider: "stripe",
    payload: createMockStripeChargeRefunded(),
    secret,
  });
  const subscription = createSignedWebhookRequest({
    provider: "stripe",
    payload: createMockStripeSubscription("customer.subscription.deleted"),
    secret,
  });
  const invoice = createSignedWebhookRequest({
    provider: "stripe",
    payload: createMockStripeInvoicePaid(),
    secret,
  });

  console.log(
    "stripe payment_intent.succeeded →",
    billing.verifyWebhook(payment.rawBody, payment.signature).normalizedType,
  );
  console.log(
    "stripe charge.refunded →",
    billing.verifyWebhook(refund.rawBody, refund.signature).normalizedType,
  );
  console.log(
    "stripe subscription.deleted →",
    billing.verifyWebhook(subscription.rawBody, subscription.signature)
      .normalizedType,
  );
  console.log(
    "stripe invoice.paid →",
    billing.verifyWebhook(invoice.rawBody, invoice.signature).normalizedType,
  );
}

async function main(): Promise<void> {
  await runRazorpayChecks();
  await runStripeChecks();
  console.log("staging webhook fixtures verified");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
