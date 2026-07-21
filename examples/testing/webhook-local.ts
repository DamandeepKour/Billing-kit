/**
 * Localhost / staging webhook testing helper.
 *
 * Usage:
 *   npx ts-node examples/testing/webhook-local.ts razorpay payment
 *   npx ts-node examples/testing/webhook-local.ts stripe refund
 *
 * Optional env:
 *   WEBHOOK_URL=http://localhost:3000/webhooks/razorpay
 *   RAZORPAY_WEBHOOK_SECRET=whsec_test
 *   STRIPE_WEBHOOK_SECRET=whsec_test
 */
import {
  createMockRazorpayPaymentCaptured,
  createMockRazorpayRefundProcessed,
  createMockRazorpaySubscription,
  createMockStripeChargeRefunded,
  createMockStripePaymentIntentSucceeded,
  createMockStripeSubscription,
  createSignedWebhookRequest,
  formatWebhookCurl,
} from "../../src/testing";

type Provider = "razorpay" | "stripe";
type Flow = "payment" | "refund" | "subscription";

const provider = (process.argv[2] as Provider | undefined) ?? "razorpay";
const flow = (process.argv[3] as Flow | undefined) ?? "payment";

const secret =
  provider === "stripe"
    ? process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test"
    : process.env.RAZORPAY_WEBHOOK_SECRET ?? "whsec_test";

const url =
  process.env.WEBHOOK_URL ??
  (provider === "stripe"
    ? "http://localhost:3000/webhooks/stripe"
    : "http://localhost:3000/webhooks/razorpay");

function buildPayload() {
  if (provider === "razorpay") {
    switch (flow) {
      case "refund":
        return createMockRazorpayRefundProcessed();
      case "subscription":
        return createMockRazorpaySubscription("subscription.activated");
      default:
        return createMockRazorpayPaymentCaptured();
    }
  }

  switch (flow) {
    case "refund":
      return createMockStripeChargeRefunded();
    case "subscription":
      return createMockStripeSubscription("customer.subscription.deleted");
    default:
      return createMockStripePaymentIntentSucceeded();
  }
}

const mock = buildPayload();
const request = createSignedWebhookRequest({
  provider,
  payload: mock,
  secret,
  eventId: provider === "razorpay" ? `local_${flow}_${Date.now()}` : undefined,
});

console.log(`# ${provider} ${flow} webhook test request`);
console.log(`# secret source: ${provider === "stripe" ? "STRIPE_WEBHOOK_SECRET" : "RAZORPAY_WEBHOOK_SECRET"}`);
console.log("");
console.log(formatWebhookCurl({ url, request }));
console.log("");
console.log("# Signed request object (for Node HTTP clients)");
console.log(
  JSON.stringify(
    {
      url,
      headers: request.headers,
      body: request.body,
      eventId: request.eventId,
    },
    null,
    2,
  ),
);
