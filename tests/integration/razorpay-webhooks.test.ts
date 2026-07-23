import { BillingKit } from "../../src/core/BillingKit";
import { WebhookVerificationError } from "../../src/utils/errors";
import {
  createMockRazorpayInvoicePaid,
  createMockRazorpayPaymentCaptured,
  createMockRazorpayRefundProcessed,
  createMockRazorpaySubscription,
  createSignedRazorpayWebhookRequest,
  webhookFixtures,
} from "../../src/testing";

const WEBHOOK_SECRET = "whsec_rzp_integration_test";
const CREATED_AT = 1_700_000_000;

function razorpayBilling(): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "rzp_test_secret",
    webhookSecret: WEBHOOK_SECRET,
    currency: "inr",
  });
}

function signed(
  payload: ReturnType<typeof createMockRazorpayPaymentCaptured>,
  options: { asBuffer?: boolean; eventId?: string } = {},
) {
  return createSignedRazorpayWebhookRequest({
    payload,
    secret: WEBHOOK_SECRET,
    asBuffer: options.asBuffer,
    eventId: options.eventId,
  });
}

describe("integration / Razorpay webhook signature verification", () => {
  it("verifies a valid signature against a string raw body", () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_sig_string",
      amount: 50000,
      currency: "INR",
      created_at: CREATED_AT,
    });
    const request = signed(payload);
    const event = razorpayBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event.provider).toBe("razorpay");
    expect(event.type).toBe("payment.captured");
    expect(event.normalizedType).toBe("payment.captured");
    expect(event.entity).toMatchObject({
      id: "pay_sig_string",
      kind: "payment",
      amount: 50000,
      currency: "inr",
      status: "captured",
    });
    expect(event.occurredAt?.toISOString()).toBe(
      new Date(CREATED_AT * 1000).toISOString(),
    );
  });

  it("verifies a valid signature against a Buffer raw body", () => {
    const payload = createMockRazorpayRefundProcessed({
      id: "rfnd_sig_buffer",
      payment_id: "pay_parent",
      amount: 1000,
      created_at: CREATED_AT,
    });
    const request = signed(payload, { asBuffer: true });

    expect(Buffer.isBuffer(request.rawBody)).toBe(true);

    const event = razorpayBilling().verifyWebhook(
      request.rawBody,
      request.signature,
    );

    expect(event.normalizedType).toBe("refund.processed");
    expect(event.entity).toMatchObject({
      id: "rfnd_sig_buffer",
      kind: "refund",
      parentId: "pay_parent",
      amount: 1000,
      currency: "inr",
    });
  });

  it("rejects an invalid signature", () => {
    const payload = createMockRazorpayPaymentCaptured({
      created_at: CREATED_AT,
    });
    const request = signed(payload);

    expect(() =>
      razorpayBilling().verifyWebhook(request.rawBody, "invalid_signature"),
    ).toThrow(WebhookVerificationError);
  });

  it("rejects when the raw body bytes differ from the signed payload", () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_original",
      created_at: CREATED_AT,
    });
    const request = signed(payload, { asBuffer: true });
    const mutated = Buffer.from(
      request.body.replace("pay_original", "pay_tampered"),
      "utf8",
    );

    expect(() =>
      razorpayBilling().verifyWebhook(mutated, request.signature),
    ).toThrow(WebhookVerificationError);
  });
});

describe("integration / Razorpay webhook event normalization", () => {
  it("normalizes payment.captured into the internal payment event", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_ok",
      amount: 99900,
      created_at: CREATED_AT,
      order_id: "order_ok",
    });
    const handler = jest.fn();
    const result = await razorpayBilling().processWebhook(
      signed(payload, { asBuffer: true, eventId: "rzp_evt_pay_ok" }),
      handler,
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "payment.captured",
        normalizedType: "payment.captured",
        provider: "razorpay",
        entity: expect.objectContaining({
          id: "pay_ok",
          kind: "payment",
          amount: 99900,
          currency: "inr",
          parentId: "order_ok",
        }),
      }),
    );
    expect(result.record).toMatchObject({
      eventId: "rzp_evt_pay_ok",
      provider: "razorpay",
      status: "processed",
      eventType: "payment.captured",
      resourceType: "payment",
      resourceId: "pay_ok",
    });
  });

  it("normalizes refund.processed with parent payment id", async () => {
    const payload = createMockRazorpayRefundProcessed({
      id: "rfnd_ok",
      payment_id: "pay_refunded",
      amount: 25000,
      created_at: CREATED_AT,
    });
    const result = await razorpayBilling().processWebhook(
      signed(payload, { asBuffer: true, eventId: "rzp_evt_refund" }),
      jest.fn(),
    );

    expect(result.event.normalizedType).toBe("refund.processed");
    expect(result.event.entity).toMatchObject({
      id: "rfnd_ok",
      kind: "refund",
      parentId: "pay_refunded",
      amount: 25000,
    });
  });

  it.each([
    ["subscription.activated", "subscription.activated", "active"],
    ["subscription.charged", "subscription.charged", "active"],
    ["subscription.cancelled", "subscription.cancelled", "cancelled"],
    ["subscription.completed", "subscription.completed", "cancelled"],
  ] as const)(
    "normalizes %s → %s",
    async (eventName, normalized, status) => {
      const payload = createMockRazorpaySubscription(eventName, {
        id: "sub_norm",
        plan_id: "plan_norm",
        customer_id: "cust_norm",
        status,
        created_at: CREATED_AT,
      });
      const result = await razorpayBilling().processWebhook(
        signed(payload, {
          asBuffer: true,
          eventId: `rzp_evt_${eventName}`,
        }),
        jest.fn(),
      );

      expect(result.event.normalizedType).toBe(normalized);
      expect(result.event.entity).toMatchObject({
        id: "sub_norm",
        kind: "subscription",
        parentId: "plan_norm",
        status,
      });
    },
  );

  it("normalizes invoice.paid into invoice entity", async () => {
    const payload = createMockRazorpayInvoicePaid({
      id: "inv_ok",
      payment_id: "pay_inv",
      amount: 99900,
      created_at: CREATED_AT,
    });
    const result = await razorpayBilling().processWebhook(
      signed(payload, { asBuffer: true, eventId: "rzp_evt_invoice" }),
      jest.fn(),
    );

    expect(result.event.type).toBe("invoice.paid");
    expect(result.event.normalizedType).toBe("invoice.paid");
    expect(result.event.entity).toMatchObject({
      id: "inv_ok",
      kind: "invoice",
      amount: 99900,
      currency: "inr",
      parentId: "pay_inv",
      status: "paid",
    });
  });

  it("covers fixture catalog payment/refund/subscription/invoice events", () => {
    const billing = razorpayBilling();
    const cases = [
      {
        request: signed(webhookFixtures.razorpay.paymentCaptured(), {
          asBuffer: true,
        }),
        normalizedType: "payment.captured",
      },
      {
        request: signed(webhookFixtures.razorpay.refundProcessed(), {
          asBuffer: true,
        }),
        normalizedType: "refund.processed",
      },
      {
        request: signed(
          webhookFixtures.razorpay.subscription("subscription.activated"),
          { asBuffer: true },
        ),
        normalizedType: "subscription.activated",
      },
      {
        request: signed(webhookFixtures.razorpay.invoicePaid(), {
          asBuffer: true,
        }),
        normalizedType: "invoice.paid",
      },
    ];

    for (const { request, normalizedType } of cases) {
      expect(
        billing.verifyWebhook(request.rawBody, request.signature).normalizedType,
      ).toBe(normalizedType);
    }
  });
});

describe("integration / Razorpay webhook idempotent processing", () => {
  it("processes a duplicate event id only once", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_dup",
      created_at: CREATED_AT,
    });
    const handler = jest.fn();
    const billing = razorpayBilling();
    const request = signed(payload, {
      asBuffer: true,
      eventId: "rzp_evt_duplicate",
    });

    const first = await billing.processWebhook(request, handler);
    const second = await billing.processWebhook(request, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBe(false);
    expect(first.record.status).toBe("processed");
    expect(second.duplicate).toBe(true);
    expect(second.outOfOrder).toBe(false);
    expect(second.record.eventId).toBe("rzp_evt_duplicate");
  });

  it("fingerprints the raw body when event id is omitted", async () => {
    const payload = createMockRazorpayRefundProcessed({
      id: "rfnd_fp",
      created_at: CREATED_AT,
    });
    const handler = jest.fn();
    const billing = razorpayBilling();
    const request = signed(payload, { asBuffer: true });

    const first = await billing.processWebhook(request, handler);
    const second = await billing.processWebhook(request, handler);

    expect(first.record.eventId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.duplicate).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("treats different event ids for the same payload as separate deliveries", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_multi_id",
      created_at: CREATED_AT,
    });
    const handler = jest.fn();
    const billing = razorpayBilling();

    await billing.processWebhook(
      signed(payload, { asBuffer: true, eventId: "rzp_evt_a" }),
      handler,
    );
    await billing.processWebhook(
      signed(payload, { asBuffer: true, eventId: "rzp_evt_b" }),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("ignores an older event delivered after a newer resource event", async () => {
    const billing = razorpayBilling();
    const handler = jest.fn();
    const newer = createMockRazorpayPaymentCaptured({
      id: "pay_unordered",
      status: "captured",
      created_at: CREATED_AT + 200,
    });
    const olderAuthorized = {
      body: JSON.stringify({
        event: "payment.authorized",
        created_at: CREATED_AT + 100,
        payload: {
          payment: {
            entity: {
              id: "pay_unordered",
              amount: 50000,
              currency: "INR",
              status: "authorized",
              created_at: CREATED_AT + 100,
            },
          },
        },
      }),
      payload: {},
    };

    await billing.processWebhook(
      signed(newer, { asBuffer: true, eventId: "rzp_evt_newer" }),
      handler,
    );
    const result = await billing.processWebhook(
      signed(olderAuthorized as typeof newer, {
        asBuffer: true,
        eventId: "rzp_evt_older",
      }),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.outOfOrder).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.record.status).toBe("ignored");
  });

  it("does not invoke the handler again when createRawWebhookHandler replays", async () => {
    const payload = createMockRazorpaySubscription("subscription.activated", {
      id: "sub_raw",
      created_at: CREATED_AT,
    });
    const handler = jest.fn();
    const process = razorpayBilling().createRawWebhookHandler(handler);
    const request = signed(payload, {
      asBuffer: true,
      eventId: "rzp_evt_raw_handler",
    });

    await process(request);
    const replay = await process(request);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(replay.duplicate).toBe(true);
  });
});
