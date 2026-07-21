import { BillingKit } from "../src/core/BillingKit";
import {
  createMockRazorpayPaymentCaptured,
  createMockRazorpayRefundProcessed,
  createMockStripeChargeRefunded,
  createMockStripeInvoicePaid,
  createMockStripePaymentIntentSucceeded,
  createMockStripeSubscription,
  createSignedWebhookRequest,
  formatWebhookCurl,
  generateRazorpayPaymentSignature,
  generateRazorpayWebhookSignature,
  generateStripeWebhookSignature,
  webhookFixtures,
} from "../src/testing";

describe("webhook testing helpers", () => {
  const razorpaySecret = "whsec_rzp_test";
  const stripeSecret = "whsec_stripe_test";

  it("signs Razorpay payloads and verifies through BillingKit", () => {
    const mock = createMockRazorpayPaymentCaptured({
      id: "pay_fixture",
      amount: 4200,
    });
    const signature = generateRazorpayWebhookSignature(mock.body, razorpaySecret);
    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
      webhookSecret: razorpaySecret,
    });

    const event = billing.verifyWebhook(mock.body, signature);
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.entity).toMatchObject({
      id: "pay_fixture",
      kind: "payment",
      amount: 4200,
    });
  });

  it("signs Stripe payloads and verifies through BillingKit", () => {
    const mock = createMockStripePaymentIntentSucceeded({
      id: "pi_fixture",
      amount: 9900,
    });
    const signature = generateStripeWebhookSignature(mock.body, stripeSecret);
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      webhookSecret: stripeSecret,
    });

    const event = billing.verifyWebhook(mock.body, signature);
    expect(event.type).toBe("payment_intent.succeeded");
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.entity.id).toBe("pi_fixture");
  });

  it("provides reusable payment/refund/subscription fixtures", async () => {
    const razorpayBilling = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
      webhookSecret: razorpaySecret,
    });
    const stripeBilling = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      webhookSecret: stripeSecret,
    });

    const razorpayFlows = [
      webhookFixtures.razorpay.paymentCaptured(),
      webhookFixtures.razorpay.refundProcessed(),
      webhookFixtures.razorpay.subscription("subscription.activated"),
    ].map((payload) =>
      createSignedWebhookRequest({
        provider: "razorpay",
        payload,
        secret: razorpaySecret,
      }),
    );

    expect(
      razorpayFlows.map((request) =>
        razorpayBilling.verifyWebhook(request.rawBody, request.signature)
          .normalizedType,
      ),
    ).toEqual([
      "payment.captured",
      "refund.processed",
      "subscription.activated",
    ]);

    const stripeFlows = [
      createMockStripePaymentIntentSucceeded(),
      createMockStripeChargeRefunded(),
      createMockStripeSubscription("customer.subscription.deleted"),
      createMockStripeInvoicePaid(),
    ].map((payload) =>
      createSignedWebhookRequest({
        provider: "stripe",
        payload,
        secret: stripeSecret,
      }),
    );

    expect(
      stripeFlows.map((request) =>
        stripeBilling.verifyWebhook(request.rawBody, request.signature)
          .normalizedType,
      ),
    ).toEqual([
      "payment.captured",
      "refund.processed",
      "subscription.cancelled",
      "subscription.charged",
    ]);

    const refund = createSignedWebhookRequest({
      provider: "razorpay",
      payload: createMockRazorpayRefundProcessed(),
      secret: razorpaySecret,
      eventId: "fixture_rfnd_1",
    });
    const processed = await razorpayBilling.processWebhook(
      refund,
      async () => undefined,
    );
    expect(processed.record.status).toBe("processed");
    expect(processed.duplicate).toBe(false);
  });

  it("builds curl-ready localhost requests", () => {
    const request = createSignedWebhookRequest({
      provider: "razorpay",
      payload: createMockRazorpayPaymentCaptured(),
      secret: razorpaySecret,
      eventId: "local_evt_1",
    });
    const curl = formatWebhookCurl({
      url: "http://localhost:3000/webhooks/razorpay",
      request,
    });

    expect(request.headers["x-razorpay-signature"]).toBe(request.signature);
    expect(request.headers["x-razorpay-event-id"]).toBe("local_evt_1");
    expect(curl).toContain("X-Razorpay-Signature");
    expect(curl).toContain("http://localhost:3000/webhooks/razorpay");
  });

  it("generates Razorpay checkout payment signatures", () => {
    const signature = generateRazorpayPaymentSignature({
      orderId: "order_1",
      paymentId: "pay_1",
      secretKey: "rzp_test_secret",
    });
    const billing = new BillingKit({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "rzp_test_secret",
      webhookSecret: razorpaySecret,
    });

    expect(
      billing.verifyPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(true);
  });
});
