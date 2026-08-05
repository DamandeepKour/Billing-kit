/**
 * Cross-provider integration-style webhook flows.
 *
 * Covers signature verification, duplicates, payment/refund/subscription
 * events, Express-style raw bodies, and normalized WebhookEvent output.
 */
import { BillingKit } from "../../src/core/BillingKit";
import {
  BillingValidationError,
  WebhookVerificationError,
} from "../../src/utils/errors";
import {
  ensureRawWebhookBody,
  parseWebhookRequest,
} from "../../src/webhook";
import {
  createMockRazorpayPaymentCaptured,
  createMockRazorpayPaymentFailed,
  createMockRazorpayRefundProcessed,
  createMockRazorpaySubscription,
  createMockStripeChargeRefunded,
  createMockStripeEvent,
  createMockStripePaymentIntentFailed,
  createMockStripePaymentIntentSucceeded,
  createMockStripeSubscription,
  createSignedRazorpayWebhookRequest,
  createSignedStripeWebhookRequest,
  createSignedWebhookRequest,
  type MockWebhookPayload,
  type SignedWebhookRequest,
} from "../../src/testing";

const STRIPE_SECRET = "whsec_flow_stripe";
const STRIPE_PREVIOUS_SECRET = "whsec_flow_stripe_previous";
const RAZORPAY_SECRET = "whsec_flow_rzp";
const CREATED_AT = 1_700_000_000;

function stripeBilling(overrides: { webhookSecrets?: string[] } = {}): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test_flow",
    webhookSecret: STRIPE_SECRET,
    webhookSecrets: overrides.webhookSecrets,
    currency: "usd",
  });
}

function razorpayBilling(overrides: { webhookSecrets?: string[] } = {}): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test_flow",
    secretKey: "rzp_test_secret",
    webhookSecret: RAZORPAY_SECRET,
    webhookSecrets: overrides.webhookSecrets,
    currency: "inr",
  });
}

function stripeSigned(
  payload: MockWebhookPayload,
  options: { asBuffer?: boolean; secret?: string } = {},
): SignedWebhookRequest {
  return createSignedStripeWebhookRequest({
    payload,
    secret: options.secret ?? STRIPE_SECRET,
    asBuffer: options.asBuffer,
  });
}

function razorpaySigned(
  payload: MockWebhookPayload,
  options: { asBuffer?: boolean; eventId?: string; secret?: string } = {},
): SignedWebhookRequest {
  return createSignedRazorpayWebhookRequest({
    payload,
    secret: options.secret ?? RAZORPAY_SECRET,
    asBuffer: options.asBuffer,
    eventId: options.eventId,
  });
}

describe("integration / webhook valid signatures", () => {
  it("verifies Stripe and Razorpay payment success with string raw bodies", () => {
    const stripeReq = stripeSigned(
      createMockStripePaymentIntentSucceeded({
        id: "pi_ok",
        amount: 5000,
      }),
    );
    const razorpayReq = razorpaySigned(
      createMockRazorpayPaymentCaptured({
        id: "pay_ok",
        amount: 50000,
        created_at: CREATED_AT,
      }),
    );

    const stripeEvent = stripeBilling().verifyWebhook(
      stripeReq.rawBody,
      stripeReq.signature,
    );
    const razorpayEvent = razorpayBilling().verifyWebhook(
      razorpayReq.rawBody,
      razorpayReq.signature,
    );

    expect(stripeEvent).toMatchObject({
      provider: "stripe",
      type: "payment_intent.succeeded",
      normalizedType: "payment.captured",
      entity: { id: "pi_ok", kind: "payment", amount: 5000 },
    });
    expect(razorpayEvent).toMatchObject({
      provider: "razorpay",
      type: "payment.captured",
      normalizedType: "payment.captured",
      entity: { id: "pay_ok", kind: "payment", amount: 50000 },
    });
  });

  it("accepts a rotated Stripe webhook secret from webhookSecrets", () => {
    const request = stripeSigned(
      createMockStripePaymentIntentSucceeded({ id: "pi_rotated" }),
      { secret: STRIPE_PREVIOUS_SECRET },
    );
    const billing = stripeBilling({
      webhookSecrets: [STRIPE_PREVIOUS_SECRET],
    });

    expect(
      billing.verifyWebhook(request.rawBody, request.signature).entity.id,
    ).toBe("pi_rotated");
  });

  it("createSignedWebhookRequest works for both providers", () => {
    const stripe = createSignedWebhookRequest({
      provider: "stripe",
      payload: createMockStripePaymentIntentSucceeded({ id: "pi_helper" }),
      secret: STRIPE_SECRET,
      asBuffer: true,
    });
    const razorpay = createSignedWebhookRequest({
      provider: "razorpay",
      payload: createMockRazorpayPaymentCaptured({ id: "pay_helper" }),
      secret: RAZORPAY_SECRET,
      eventId: "rzp_evt_helper",
      asBuffer: true,
    });

    expect(
      stripeBilling().verifyWebhook(stripe.rawBody, stripe.signature)
        .normalizedType,
    ).toBe("payment.captured");
    expect(
      razorpayBilling().verifyWebhook(razorpay.rawBody, razorpay.signature)
        .normalizedType,
    ).toBe("payment.captured");
    expect(razorpay.headers["x-razorpay-event-id"]).toBe("rzp_evt_helper");
  });
});

describe("integration / webhook invalid signatures", () => {
  it("rejects forged Stripe and Razorpay signatures", () => {
    const stripeReq = stripeSigned(createMockStripePaymentIntentSucceeded());
    const razorpayReq = razorpaySigned(createMockRazorpayPaymentCaptured());

    expect(() =>
      stripeBilling().verifyWebhook(stripeReq.rawBody, "t=1,v1=forged"),
    ).toThrow(WebhookVerificationError);
    expect(() =>
      razorpayBilling().verifyWebhook(razorpayReq.rawBody, "forged_signature"),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects signatures computed with the wrong secret", () => {
    const stripeReq = stripeSigned(
      createMockStripePaymentIntentSucceeded({ id: "pi_wrong_secret" }),
      { secret: "whsec_other_stripe" },
    );
    const razorpayReq = razorpaySigned(
      createMockRazorpayPaymentCaptured({ id: "pay_wrong_secret" }),
      { secret: "whsec_other_rzp" },
    );

    expect(() =>
      stripeBilling().verifyWebhook(stripeReq.rawBody, stripeReq.signature),
    ).toThrow(WebhookVerificationError);
    expect(() =>
      razorpayBilling().verifyWebhook(
        razorpayReq.rawBody,
        razorpayReq.signature,
      ),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects empty signatures", () => {
    const stripeReq = stripeSigned(createMockStripePaymentIntentSucceeded());
    const razorpayReq = razorpaySigned(createMockRazorpayPaymentCaptured());

    expect(() =>
      stripeBilling().verifyWebhook(stripeReq.rawBody, ""),
    ).toThrow(WebhookVerificationError);
    expect(() =>
      razorpayBilling().verifyWebhook(razorpayReq.rawBody, ""),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects tampered raw bodies that no longer match the signature", () => {
    const request = razorpaySigned(
      createMockRazorpayPaymentCaptured({
        id: "pay_tamper",
        created_at: CREATED_AT,
      }),
      { asBuffer: true },
    );
    const tampered = Buffer.from(
      request.body.replace("pay_tamper", "pay_attacker"),
      "utf8",
    );

    expect(() =>
      razorpayBilling().verifyWebhook(tampered, request.signature),
    ).toThrow(WebhookVerificationError);
  });
});

describe("integration / webhook duplicate event handling", () => {
  it("dedupes Stripe payment success by event.id", async () => {
    const payload = createMockStripeEvent({
      type: "payment_intent.succeeded",
      id: "evt_flow_dup_pay",
      created: CREATED_AT,
      object: {
        id: "pi_dup",
        object: "payment_intent",
        amount: 1200,
        currency: "usd",
        status: "succeeded",
      },
    });
    const billing = stripeBilling();
    const handler = jest.fn();
    const request = stripeSigned(payload, { asBuffer: true });

    const first = await billing.processWebhook(request, handler);
    const second = await billing.processWebhook(request, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.record.eventId).toBe("evt_flow_dup_pay");
  });

  it("dedupes Razorpay refunds via X-Razorpay-Event-Id", async () => {
    const payload = createMockRazorpayRefundProcessed({
      id: "rfnd_dup",
      payment_id: "pay_parent",
      created_at: CREATED_AT,
    });
    const billing = razorpayBilling();
    const handler = jest.fn();
    const request = razorpaySigned(payload, {
      asBuffer: true,
      eventId: "rzp_evt_flow_dup_refund",
    });

    const first = await billing.processWebhook(request, handler);
    const second = await billing.processWebhook(request, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.record.eventId).toBe("rzp_evt_flow_dup_refund");
  });

  it("dedupes via verifyAndClaimWebhook before the handler runs", async () => {
    const payload = createMockRazorpaySubscription("subscription.activated", {
      id: "sub_claim_dup",
      created_at: CREATED_AT,
    });
    const billing = razorpayBilling();
    const request = razorpaySigned(payload, {
      asBuffer: true,
      eventId: "rzp_evt_claim_dup",
    });

    const claim = await billing.verifyAndClaimWebhook(request);
    expect(claim.duplicate).toBe(false);
    expect(claim.event.normalizedType).toBe("subscription.activated");

    await billing.completeWebhookProcessing(claim.record, {
      status: "processed",
    });

    const replay = await billing.verifyAndClaimWebhook(request);
    expect(replay.duplicate).toBe(true);
  });
});

describe("integration / webhook payment success events", () => {
  it("processes Stripe payment_intent.succeeded end-to-end", async () => {
    const handler = jest.fn();
    const result = await stripeBilling().processWebhook(
      stripeSigned(
        createMockStripePaymentIntentSucceeded({
          id: "pi_success_flow",
          amount: 9900,
          currency: "usd",
        }),
        { asBuffer: true },
      ),
      handler,
    );

    expect(result.event.normalizedType).toBe("payment.captured");
    expect(result.event.entity).toMatchObject({
      id: "pi_success_flow",
      kind: "payment",
      amount: 9900,
      currency: "usd",
      status: "succeeded",
    });
    expect(result.record).toMatchObject({
      status: "processed",
      resourceType: "payment",
      resourceId: "pi_success_flow",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("processes Razorpay payment.captured end-to-end", async () => {
    const result = await razorpayBilling().processWebhook(
      razorpaySigned(
        createMockRazorpayPaymentCaptured({
          id: "pay_success_flow",
          amount: 199900,
          order_id: "order_flow",
          created_at: CREATED_AT,
        }),
        { asBuffer: true, eventId: "rzp_evt_pay_success" },
      ),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("payment.captured");
    expect(result.event.entity).toMatchObject({
      id: "pay_success_flow",
      kind: "payment",
      amount: 199900,
      currency: "inr",
      parentId: "order_flow",
      status: "captured",
    });
  });

  it("normalizes payment failure events on both providers", async () => {
    const stripe = await stripeBilling().processWebhook(
      stripeSigned(createMockStripePaymentIntentFailed({ id: "pi_fail" }), {
        asBuffer: true,
      }),
      jest.fn(),
    );
    const razorpay = await razorpayBilling().processWebhook(
      razorpaySigned(
        createMockRazorpayPaymentFailed({
          id: "pay_fail",
          created_at: CREATED_AT,
        }),
        { asBuffer: true, eventId: "rzp_evt_pay_fail" },
      ),
      jest.fn(),
    );

    expect(stripe.event.normalizedType).toBe("payment.failed");
    expect(razorpay.event.normalizedType).toBe("payment.failed");
    expect(stripe.event.entity.kind).toBe("payment");
    expect(razorpay.event.entity.kind).toBe("payment");
  });
});

describe("integration / webhook refund events", () => {
  it("normalizes Stripe charge.refunded with parent payment intent", async () => {
    const result = await stripeBilling().processWebhook(
      stripeSigned(
        createMockStripeChargeRefunded({
          id: "ch_refund_flow",
          amount: 2500,
          payment_intent: "pi_refund_parent",
        }),
        { asBuffer: true },
      ),
      jest.fn(),
    );

    expect(result.event).toMatchObject({
      type: "charge.refunded",
      normalizedType: "refund.processed",
      entity: {
        id: "ch_refund_flow",
        kind: "refund",
        amount: 2500,
        parentId: "pi_refund_parent",
      },
    });
  });

  it("normalizes Razorpay refund.processed with parent payment id", async () => {
    const result = await razorpayBilling().processWebhook(
      razorpaySigned(
        createMockRazorpayRefundProcessed({
          id: "rfnd_flow",
          payment_id: "pay_refund_parent",
          amount: 10000,
          created_at: CREATED_AT,
        }),
        { asBuffer: true, eventId: "rzp_evt_refund_flow" },
      ),
      jest.fn(),
    );

    expect(result.event).toMatchObject({
      type: "refund.processed",
      normalizedType: "refund.processed",
      entity: {
        id: "rfnd_flow",
        kind: "refund",
        parentId: "pay_refund_parent",
        amount: 10000,
        currency: "inr",
      },
    });
  });
});

describe("integration / webhook subscription events", () => {
  it.each([
    ["customer.subscription.created", "subscription.activated", "active"],
    ["customer.subscription.deleted", "subscription.cancelled", "canceled"],
  ] as const)(
    "Stripe %s → %s",
    async (type, normalized, status) => {
      const fixture = createMockStripeSubscription(type, {
        id: "sub_flow",
        status,
      });
      const payload = createMockStripeEvent({
        type,
        id: `evt_${type.replace(/\./g, "_")}_flow`,
        created: CREATED_AT,
        object: (
          fixture.payload as { data: { object: Record<string, unknown> } }
        ).data.object,
      });
      const result = await stripeBilling().processWebhook(
        stripeSigned(payload, { asBuffer: true }),
        jest.fn(),
      );

      expect(result.event.normalizedType).toBe(normalized);
      expect(result.event.entity).toMatchObject({
        id: "sub_flow",
        kind: "subscription",
        status,
      });
    },
  );

  it.each([
    ["subscription.activated", "subscription.activated"],
    ["subscription.charged", "subscription.charged"],
    ["subscription.cancelled", "subscription.cancelled"],
  ] as const)("Razorpay %s → %s", async (eventName, normalized) => {
    const result = await razorpayBilling().processWebhook(
      razorpaySigned(
        createMockRazorpaySubscription(eventName, {
          id: "sub_rzp_flow",
          plan_id: "plan_flow",
          created_at: CREATED_AT,
        }),
        { asBuffer: true, eventId: `rzp_evt_${eventName}_flow` },
      ),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe(normalized);
    expect(result.event.entity).toMatchObject({
      id: "sub_rzp_flow",
      kind: "subscription",
      parentId: "plan_flow",
    });
  });
});

describe("integration / webhook raw-body handling", () => {
  it("produces identical normalized events for string and Buffer bodies", () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_raw_same",
      amount: 77700,
      created_at: CREATED_AT,
    });
    const asString = razorpaySigned(payload);
    const asBuffer = razorpaySigned(payload, { asBuffer: true });

    expect(typeof asString.rawBody).toBe("string");
    expect(Buffer.isBuffer(asBuffer.rawBody)).toBe(true);

    const fromString = razorpayBilling().verifyWebhook(
      asString.rawBody,
      asString.signature,
    );
    const fromBuffer = razorpayBilling().verifyWebhook(
      asBuffer.rawBody,
      asBuffer.signature,
    );

    expect(fromString.normalizedType).toBe(fromBuffer.normalizedType);
    expect(fromString.entity).toEqual(fromBuffer.entity);
    expect(fromString.type).toBe(fromBuffer.type);
  });

  it("parses Express-style headers + Buffer into a processable request", async () => {
    const signed = stripeSigned(
      createMockStripePaymentIntentSucceeded({
        id: "pi_express",
        amount: 3100,
      }),
      { asBuffer: true },
    );

    const parsed = parseWebhookRequest({
      provider: "stripe",
      rawBody: signed.rawBody,
      headers: signed.headers,
    });

    expect(Buffer.isBuffer(parsed.rawBody)).toBe(true);
    expect(parsed.signature).toBe(signed.signature);

    const result = await stripeBilling().processWebhook(parsed, jest.fn());
    expect(result.event.normalizedType).toBe("payment.captured");
    expect(result.event.entity.id).toBe("pi_express");
  });

  it("rejects parsed JSON objects as raw bodies", () => {
    expect(() =>
      ensureRawWebhookBody({
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_parsed" } },
      }),
    ).toThrow(BillingValidationError);
    expect(() =>
      ensureRawWebhookBody({
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_parsed" } },
      }),
    ).toThrow(/string or Buffer/);
  });

  it("rejects missing signature headers when parsing HTTP requests", () => {
    expect(() =>
      parseWebhookRequest({
        provider: "razorpay",
        rawBody: Buffer.from("{}"),
        headers: {},
      }),
    ).toThrow(/x-razorpay-signature|signature/i);
  });
});

describe("integration / webhook normalized event output", () => {
  it("exposes a stable WebhookEvent shape for Stripe payments", () => {
    const request = stripeSigned(
      createMockStripeEvent({
        type: "payment_intent.succeeded",
        id: "evt_shape_stripe",
        created: CREATED_AT,
        object: {
          id: "pi_shape",
          object: "payment_intent",
          amount: 4200,
          currency: "usd",
          status: "succeeded",
          customer: "cus_shape",
        },
      }),
      { asBuffer: true },
    );

    const event = stripeBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event).toEqual(
      expect.objectContaining({
        id: "evt_shape_stripe",
        provider: "stripe",
        type: "payment_intent.succeeded",
        normalizedType: "payment.captured",
        entity: expect.objectContaining({
          id: "pi_shape",
          kind: "payment",
          amount: 4200,
          currency: "usd",
          status: "succeeded",
        }),
        occurredAt: new Date(CREATED_AT * 1000),
        data: expect.any(Object),
      }),
    );
  });

  it("exposes a stable WebhookEvent shape for Razorpay subscriptions", () => {
    const request = razorpaySigned(
      createMockRazorpaySubscription("subscription.charged", {
        id: "sub_shape",
        plan_id: "plan_shape",
        customer_id: "cust_shape",
        status: "active",
        created_at: CREATED_AT,
      }),
      { asBuffer: true, eventId: "rzp_evt_shape" },
    );

    const event = razorpayBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event).toEqual(
      expect.objectContaining({
        provider: "razorpay",
        type: "subscription.charged",
        normalizedType: "subscription.charged",
        entity: expect.objectContaining({
          id: "sub_shape",
          kind: "subscription",
          parentId: "plan_shape",
          status: "active",
        }),
        occurredAt: new Date(CREATED_AT * 1000),
        data: expect.any(Object),
      }),
    );
  });

  it("maps provider-specific types onto the shared normalized catalog", () => {
    const catalog: Array<{
      provider: "stripe" | "razorpay";
      request: SignedWebhookRequest;
      type: string;
      normalizedType: string;
      kind: string;
    }> = [
      {
        provider: "stripe",
        request: stripeSigned(createMockStripePaymentIntentSucceeded(), {
          asBuffer: true,
        }),
        type: "payment_intent.succeeded",
        normalizedType: "payment.captured",
        kind: "payment",
      },
      {
        provider: "stripe",
        request: stripeSigned(createMockStripeChargeRefunded(), {
          asBuffer: true,
        }),
        type: "charge.refunded",
        normalizedType: "refund.processed",
        kind: "refund",
      },
      {
        provider: "razorpay",
        request: razorpaySigned(createMockRazorpayPaymentCaptured(), {
          asBuffer: true,
        }),
        type: "payment.captured",
        normalizedType: "payment.captured",
        kind: "payment",
      },
      {
        provider: "razorpay",
        request: razorpaySigned(
          createMockRazorpaySubscription("subscription.cancelled"),
          { asBuffer: true },
        ),
        type: "subscription.cancelled",
        normalizedType: "subscription.cancelled",
        kind: "subscription",
      },
    ];

    for (const entry of catalog) {
      const billing =
        entry.provider === "stripe" ? stripeBilling() : razorpayBilling();
      const event = billing.verifyWebhook(
        entry.request.rawBody,
        entry.request.signature,
      );

      expect(event.type).toBe(entry.type);
      expect(event.normalizedType).toBe(entry.normalizedType);
      expect(event.entity.kind).toBe(entry.kind);
      expect(event.provider).toBe(entry.provider);
    }
  });
});
