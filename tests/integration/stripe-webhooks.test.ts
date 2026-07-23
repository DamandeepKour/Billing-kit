import { BillingKit } from "../../src/core/BillingKit";
import { WebhookVerificationError } from "../../src/utils/errors";
import {
  createMockStripeChargeRefunded,
  createMockStripeEvent,
  createMockStripeInvoicePaid,
  createMockStripePaymentIntentSucceeded,
  createMockStripeSubscription,
  createSignedStripeWebhookRequest,
  webhookFixtures,
  type MockWebhookPayload,
} from "../../src/testing";

const WEBHOOK_SECRET = "whsec_stripe_integration_test";
/** Fixed unix timestamp so signature + occurredAt assertions stay deterministic. */
const CREATED_AT = 1_700_000_000;

function stripeBilling(): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test_integration",
    webhookSecret: WEBHOOK_SECRET,
    currency: "usd",
  });
}

function signed(
  payload: MockWebhookPayload,
  options: { asBuffer?: boolean } = {},
) {
  return createSignedStripeWebhookRequest({
    payload,
    secret: WEBHOOK_SECRET,
    // Signature timestamp must be "now" (Stripe default tolerance is 5 minutes).
    // Event payload `created` stays fixed via CREATED_AT for occurredAt assertions.
    asBuffer: options.asBuffer,
  });
}

function paymentSucceeded(overrides: {
  eventId?: string;
  paymentId?: string;
  amount?: number;
} = {}): MockWebhookPayload {
  return createMockStripeEvent({
    type: "payment_intent.succeeded",
    id: overrides.eventId ?? "evt_pay_ok",
    created: CREATED_AT,
    object: {
      id: overrides.paymentId ?? "pi_ok",
      object: "payment_intent",
      amount: overrides.amount ?? 5000,
      currency: "usd",
      status: "succeeded",
      customer: "cus_1",
    },
  });
}

describe("integration / Stripe webhook signature verification", () => {
  it("verifies a valid signature against a string raw body", () => {
    const payload = paymentSucceeded({
      eventId: "evt_sig_string",
      paymentId: "pi_sig_string",
      amount: 4200,
    });
    const request = signed(payload);
    const event = stripeBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event.provider).toBe("stripe");
    expect(event.type).toBe("payment_intent.succeeded");
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.id).toBe("evt_sig_string");
    expect(event.occurredAt?.toISOString()).toBe(
      new Date(CREATED_AT * 1000).toISOString(),
    );
  });

  it("verifies a valid signature against a Buffer raw body", () => {
    const payload = paymentSucceeded({
      eventId: "evt_sig_buffer",
      paymentId: "pi_sig_buffer",
      amount: 9900,
    });
    const request = signed(payload, { asBuffer: true });

    expect(Buffer.isBuffer(request.rawBody)).toBe(true);

    const event = stripeBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event.entity).toMatchObject({
      id: "pi_sig_buffer",
      kind: "payment",
      amount: 9900,
      currency: "usd",
      status: "succeeded",
    });
    expect(event.normalizedType).toBe("payment.captured");
  });

  it("rejects an invalid signature", () => {
    const request = signed(createMockStripePaymentIntentSucceeded());

    expect(() =>
      stripeBilling().verifyWebhook(request.rawBody, "t=1,v1=deadbeef"),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects when the raw body bytes differ from the signed payload", () => {
    const payload = paymentSucceeded({ paymentId: "pi_mutated" });
    const request = signed(payload);
    const mutated = Buffer.from(
      request.body.replace("pi_mutated", "pi_tampered"),
      "utf8",
    );

    expect(() =>
      stripeBilling().verifyWebhook(mutated, request.signature),
    ).toThrow(WebhookVerificationError);
  });
});

describe("integration / Stripe webhook event normalization", () => {
  it("normalizes payment_intent.succeeded into payment.captured", async () => {
    const handler = jest.fn();
    const result = await stripeBilling().processWebhook(
      signed(paymentSucceeded({ eventId: "evt_pay_process" }), {
        asBuffer: true,
      }),
      handler,
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment_intent.succeeded",
        normalizedType: "payment.captured",
        provider: "stripe",
        entity: expect.objectContaining({
          id: "pi_ok",
          kind: "payment",
          amount: 5000,
          currency: "usd",
        }),
      }),
    );
    expect(result.duplicate).toBe(false);
    expect(result.record).toMatchObject({
      eventId: "evt_pay_process",
      provider: "stripe",
      status: "processed",
      eventType: "payment_intent.succeeded",
      resourceType: "payment",
      resourceId: "pi_ok",
    });
  });

  it("normalizes charge.refunded into refund.processed", async () => {
    const fixture = createMockStripeChargeRefunded({
      id: "ch_refund",
      amount: 2500,
      payment_intent: "pi_parent",
    });
    const payload = createMockStripeEvent({
      type: "charge.refunded",
      id: "evt_refund",
      created: CREATED_AT,
      object: (
        fixture.payload as { data: { object: Record<string, unknown> } }
      ).data.object,
    });
    const result = await stripeBilling().processWebhook(
      signed(payload, { asBuffer: true }),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("refund.processed");
    expect(result.event.entity).toMatchObject({
      id: "ch_refund",
      kind: "refund",
      amount: 2500,
      parentId: "pi_parent",
    });
  });

  it.each([
    ["customer.subscription.created", "subscription.activated", "active"],
    ["customer.subscription.updated", "subscription.activated", "active"],
    ["customer.subscription.deleted", "subscription.cancelled", "canceled"],
  ] as const)("normalizes %s → %s", async (type, normalized, status) => {
    const fixture = createMockStripeSubscription(type, {
      id: "sub_norm",
      status,
    });
    const payload = createMockStripeEvent({
      type,
      id: `evt_${type.replace(/\./g, "_")}`,
      created: CREATED_AT,
      object: (
        fixture.payload as { data: { object: Record<string, unknown> } }
      ).data.object,
    });
    const result = await stripeBilling().processWebhook(
      signed(payload, { asBuffer: true }),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe(normalized);
    expect(result.event.entity).toMatchObject({
      id: "sub_norm",
      kind: "subscription",
      parentId: "price_test_1",
      status,
    });
  });

  it("normalizes invoice.paid with subscription as subscription.charged", async () => {
    const fixture = createMockStripeInvoicePaid({
      id: "in_sub",
      amount: 2900,
      subscription: "sub_billed",
    });
    const payload = createMockStripeEvent({
      type: "invoice.paid",
      id: "evt_invoice_sub",
      created: CREATED_AT,
      object: (
        fixture.payload as { data: { object: Record<string, unknown> } }
      ).data.object,
    });
    const result = await stripeBilling().processWebhook(
      signed(payload, { asBuffer: true }),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("subscription.charged");
    expect(result.event.entity).toMatchObject({
      id: "in_sub",
      kind: "invoice",
      amount: 2900,
      parentId: "sub_billed",
    });
  });

  it("normalizes invoice.paid without subscription as invoice.paid", async () => {
    const payload = createMockStripeEvent({
      type: "invoice.paid",
      id: "evt_invoice_only",
      created: CREATED_AT,
      object: {
        id: "in_oneoff",
        object: "invoice",
        amount_paid: 1500,
        currency: "usd",
        status: "paid",
        customer: "cus_1",
      },
    });
    const result = await stripeBilling().processWebhook(
      signed(payload, { asBuffer: true }),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("invoice.paid");
    expect(result.event.entity.kind).toBe("invoice");
    expect(result.event.entity.parentId).toBeUndefined();
  });

  it("covers fixture catalog payment/refund/subscription/invoice events", () => {
    const billing = stripeBilling();
    const cases = [
      {
        request: signed(webhookFixtures.stripe.paymentIntentSucceeded(), {
          asBuffer: true,
        }),
        normalizedType: "payment.captured",
      },
      {
        request: signed(webhookFixtures.stripe.chargeRefunded(), {
          asBuffer: true,
        }),
        normalizedType: "refund.processed",
      },
      {
        request: signed(
          webhookFixtures.stripe.subscription("customer.subscription.created"),
          { asBuffer: true },
        ),
        normalizedType: "subscription.activated",
      },
      {
        request: signed(webhookFixtures.stripe.invoicePaid(), {
          asBuffer: true,
        }),
        normalizedType: "subscription.charged",
      },
    ];

    for (const { request, normalizedType } of cases) {
      expect(
        billing.verifyWebhook(request.rawBody, request.signature).normalizedType,
      ).toBe(normalizedType);
    }
  });
});

describe("integration / Stripe webhook idempotent processing", () => {
  it("processes a duplicate Stripe event id only once", async () => {
    const payload = paymentSucceeded({
      eventId: "evt_duplicate_once",
      paymentId: "pi_dup",
      amount: 1000,
    });
    const handler = jest.fn();
    const billing = stripeBilling();
    const request = signed(payload, { asBuffer: true });

    const first = await billing.processWebhook(request, handler);
    const second = await billing.processWebhook(request, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBe(false);
    expect(first.record.status).toBe("processed");
    expect(second.duplicate).toBe(true);
    expect(second.outOfOrder).toBe(false);
    expect(second.record.eventId).toBe("evt_duplicate_once");
  });

  it("uses Stripe event.id for idempotency (not a body fingerprint)", async () => {
    const result = await stripeBilling().processWebhook(
      signed(
        paymentSucceeded({ eventId: "evt_id_source", paymentId: "pi_id_source" }),
        { asBuffer: true },
      ),
      jest.fn(),
    );

    expect(result.record.eventId).toBe("evt_id_source");
    expect(result.record.eventId).not.toMatch(/^sha256:/);
  });

  it("does not invoke the handler again when createRawWebhookHandler replays", async () => {
    const payload = createMockStripeEvent({
      type: "charge.refunded",
      id: "evt_raw_handler_dup",
      created: CREATED_AT,
      object: {
        id: "ch_raw",
        object: "charge",
        amount: 500,
        currency: "usd",
        status: "succeeded",
        payment_intent: "pi_raw",
      },
    });
    const handler = jest.fn();
    const process = stripeBilling().createRawWebhookHandler(handler);
    const request = signed(payload, { asBuffer: true });

    await process(request);
    const replay = await process(request);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(replay.duplicate).toBe(true);
  });

  it("marks the record failed when the handler throws, then allows retry", async () => {
    const payload = paymentSucceeded({
      eventId: "evt_handler_fail",
      paymentId: "pi_fail_handler",
    });
    const billing = stripeBilling();
    const request = signed(payload, { asBuffer: true });

    await expect(
      billing.processWebhook(request, async () => {
        throw new Error("handler boom");
      }),
    ).rejects.toThrow("handler boom");

    const events = await billing.listWebhookEvents();
    const failed = events.find((e) => e.eventId === "evt_handler_fail");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("handler boom");

    // Failed claims are reclaimable so providers can retry delivery.
    const handler = jest.fn();
    const retry = await billing.processWebhook(request, handler);
    expect(retry.duplicate).toBe(false);
    expect(retry.record.status).toBe("processed");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
