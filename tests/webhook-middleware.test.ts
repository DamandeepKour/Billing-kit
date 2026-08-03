import { EventEmitter } from "events";
import type { ServerResponse } from "http";
import { BillingKit } from "../src/core/BillingKit";
import { BillingValidationError } from "../src/utils/errors";
import {
  createRawBodyMiddleware,
  createWebhookHttpHandler,
  ensureRawWebhookBody,
  EXPRESS_WEBHOOK_RAW_BODY,
  fingerprintWebhookPayload,
  normalizeRazorpayWebhook,
  normalizeStripeWebhook,
  parseWebhookRequest,
  resolveDedupeEventId,
  resolveWebhookEventIdFromHeaders,
  resolveWebhookSignature,
} from "../src";
import {
  createMockRazorpayPaymentCaptured,
  createMockStripePaymentIntentSucceeded,
  createSignedRazorpayWebhookRequest,
  createSignedStripeWebhookRequest,
} from "../src/testing";
import type { RawBodyIncomingMessage } from "../src/webhook";

const STRIPE_SECRET = "whsec_middleware_stripe";
const RAZORPAY_SECRET = "whsec_middleware_rzp";
const CREATED_AT = 1_700_000_000;

function stripeBilling(): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test_middleware",
    webhookSecret: STRIPE_SECRET,
  });
}

function razorpayBilling(): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "rzp_secret",
    webhookSecret: RAZORPAY_SECRET,
  });
}

describe("webhook / raw body helpers", () => {
  it("exposes express.raw options", () => {
    expect(EXPRESS_WEBHOOK_RAW_BODY).toEqual({ type: "application/json" });
  });

  it("accepts string and Buffer raw bodies", () => {
    expect(ensureRawWebhookBody("{}")).toBe("{}");
    expect(Buffer.isBuffer(ensureRawWebhookBody(Buffer.from("{}")))).toBe(true);
  });

  it("rejects parsed JSON objects", () => {
    expect(() => ensureRawWebhookBody({ event: "payment.captured" })).toThrow(
      BillingValidationError,
    );
    expect(() => ensureRawWebhookBody({ event: "payment.captured" })).toThrow(
      /string or Buffer/,
    );
  });

  it("resolves Stripe and Razorpay signature headers", () => {
    expect(
      resolveWebhookSignature("stripe", {
        "Stripe-Signature": "t=1,v1=abc",
      }),
    ).toBe("t=1,v1=abc");
    expect(
      resolveWebhookSignature("razorpay", {
        "x-razorpay-signature": "deadbeef",
      }),
    ).toBe("deadbeef");
  });

  it("throws when signature header is missing", () => {
    expect(() => resolveWebhookSignature("stripe", {})).toThrow(
      /stripe-signature/,
    );
  });

  it("reads Razorpay event id from headers for dedupe", () => {
    expect(
      resolveWebhookEventIdFromHeaders("razorpay", {
        "X-Razorpay-Event-Id": "rzp_evt_1",
      }),
    ).toBe("rzp_evt_1");
    expect(resolveWebhookEventIdFromHeaders("stripe", {})).toBeUndefined();
  });

  it("builds RawWebhookRequest from headers + raw body", () => {
    const request = parseWebhookRequest({
      provider: "razorpay",
      rawBody: Buffer.from("{}"),
      headers: {
        "x-razorpay-signature": "sig",
        "x-razorpay-event-id": "evt_header",
      },
    });

    expect(request).toMatchObject({
      signature: "sig",
      eventId: "evt_header",
    });
    expect(Buffer.isBuffer(request.rawBody)).toBe(true);
  });
});

describe("webhook / normalize", () => {
  it("normalizes Razorpay payment.captured", () => {
    const body = createMockRazorpayPaymentCaptured({
      id: "pay_norm",
      amount: 5000,
      created_at: CREATED_AT,
    }).body;
    const event = normalizeRazorpayWebhook(body, "razorpay");

    expect(event).toMatchObject({
      type: "payment.captured",
      normalizedType: "payment.captured",
      provider: "razorpay",
      entity: {
        id: "pay_norm",
        kind: "payment",
        amount: 5000,
        currency: "inr",
      },
    });
  });

  it("normalizes Stripe payment_intent.succeeded", () => {
    const event = normalizeStripeWebhook(
      "evt_norm",
      "payment_intent.succeeded",
      {
        id: "pi_norm",
        amount: 4200,
        currency: "usd",
        status: "succeeded",
      },
      "stripe",
      CREATED_AT,
    );

    expect(event).toMatchObject({
      id: "evt_norm",
      normalizedType: "payment.captured",
      entity: { id: "pi_norm", kind: "payment", amount: 4200 },
    });
    expect(event.occurredAt?.toISOString()).toBe(
      new Date(CREATED_AT * 1000).toISOString(),
    );
  });
});

describe("webhook / event id dedupe", () => {
  it("prefers explicit request eventId", () => {
    const eventId = resolveDedupeEventId({
      provider: "razorpay",
      request: { eventId: "explicit", rawBody: "{}" },
      event: {
        id: "pay_1",
        type: "payment.captured",
        provider: "razorpay",
        data: {},
        normalizedType: "payment.captured",
        entity: { id: "pay_1", kind: "payment" },
      },
      fingerprint: fingerprintWebhookPayload,
    });
    expect(eventId).toBe("explicit");
  });

  it("uses Stripe event.id when request eventId is omitted", () => {
    const eventId = resolveDedupeEventId({
      provider: "stripe",
      request: { rawBody: "{}" },
      event: {
        id: "evt_stripe_1",
        type: "payment_intent.succeeded",
        provider: "stripe",
        data: {},
        normalizedType: "payment.captured",
        entity: { id: "pi_1", kind: "payment" },
      },
      fingerprint: fingerprintWebhookPayload,
    });
    expect(eventId).toBe("evt_stripe_1");
  });

  it("fingerprints Razorpay body when event id is missing", () => {
    const body = '{"event":"payment.captured"}';
    const eventId = resolveDedupeEventId({
      provider: "razorpay",
      request: { rawBody: body },
      event: {
        id: "pay_1",
        type: "payment.captured",
        provider: "razorpay",
        data: {},
        normalizedType: "payment.captured",
        entity: { id: "pay_1", kind: "payment" },
      },
      fingerprint: fingerprintWebhookPayload,
    });
    expect(eventId).toBe(fingerprintWebhookPayload(body));
    expect(eventId).toMatch(/^sha256:/);
  });

  it("dedupes Razorpay deliveries via X-Razorpay-Event-Id", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_dedupe",
      created_at: CREATED_AT,
    });
    const signed = createSignedRazorpayWebhookRequest({
      payload,
      secret: RAZORPAY_SECRET,
      asBuffer: true,
      eventId: "rzp_evt_dedupe",
    });
    const billing = razorpayBilling();
    const handler = jest.fn();

    const first = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );
    const second = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(first.record.eventId).toBe("rzp_evt_dedupe");
    expect(first.event.normalizedType).toBe("payment.captured");
  });

  it("dedupes Stripe deliveries via verified event.id", async () => {
    const payload = createMockStripePaymentIntentSucceeded({
      id: "pi_dedupe",
    });
    // Fix id for stable dedupe
    const body = JSON.stringify({
      ...JSON.parse(payload.body),
      id: "evt_dedupe_stripe",
      created: CREATED_AT,
    });
    const signed = createSignedStripeWebhookRequest({
      payload: body,
      secret: STRIPE_SECRET,
      asBuffer: true,
    });
    const billing = stripeBilling();
    const handler = jest.fn();

    const first = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );
    const second = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.record.eventId).toBe("evt_dedupe_stripe");
    expect(second.duplicate).toBe(true);
    expect(first.event.normalizedType).toBe("payment.captured");
  });
});

describe("webhook / raw body middleware", () => {
  it("buffers the request stream onto req.rawBody", async () => {
    const middleware = createRawBodyMiddleware();
    const payload = Buffer.from('{"ok":true}');
    const req = new EventEmitter() as EventEmitter & {
      body?: unknown;
      rawBody?: Buffer;
      destroy: () => void;
    };
    req.destroy = jest.fn();
    const res = {} as ServerResponse;

    await new Promise<void>((resolve, reject) => {
      middleware(req as unknown as RawBodyIncomingMessage, res, (error) =>
        error ? reject(error) : resolve(),
      );
      req.emit("data", payload.subarray(0, 4));
      req.emit("data", payload.subarray(4));
      req.emit("end");
    });

    expect(Buffer.isBuffer(req.rawBody)).toBe(true);
    expect(req.rawBody?.equals(payload)).toBe(true);
    expect(req.body).toBe(req.rawBody);
  });

  it("reuses an already-buffered body", async () => {
    const middleware = createRawBodyMiddleware();
    const body = Buffer.from("{}");
    const req = {
      body,
      rawBody: undefined as Buffer | undefined,
    };
    await new Promise<void>((resolve, reject) => {
      middleware(req as unknown as RawBodyIncomingMessage, {} as ServerResponse, (error) =>
        error ? reject(error) : resolve(),
      );
    });
    expect(req.rawBody?.equals(body)).toBe(true);
  });

  it("rejects bodies larger than the limit", async () => {
    const middleware = createRawBodyMiddleware({ limit: 8 });
    const req = new EventEmitter() as EventEmitter & {
      body?: unknown;
      rawBody?: Buffer;
      destroy: jest.Mock;
    };
    req.destroy = jest.fn();

    const error = await new Promise<unknown>((resolve) => {
      middleware(
        req as unknown as RawBodyIncomingMessage,
        {} as ServerResponse,
        (err) => resolve(err),
      );
      req.emit("data", Buffer.from("0123456789"));
    });

    expect(error).toBeInstanceOf(BillingValidationError);
    expect(req.destroy).toHaveBeenCalled();
  });
});

describe("webhook / http handler", () => {
  it("processes a signed Stripe request and returns JSON", async () => {
    const body = JSON.stringify({
      ...JSON.parse(createMockStripePaymentIntentSucceeded().body),
      id: "evt_http_handler",
      created: CREATED_AT,
    });
    const signed = createSignedStripeWebhookRequest({
      payload: body,
      secret: STRIPE_SECRET,
      asBuffer: true,
    });
    const handler = jest.fn();
    const httpHandler = stripeBilling().createWebhookHttpHandler(handler);

    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    await httpHandler({ body: signed.rawBody, headers: signed.headers }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      duplicate: false,
      eventId: "evt_http_handler",
      normalizedType: "payment.captured",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with duplicate:true on replay", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_http_dup",
      created_at: CREATED_AT,
    });
    const signed = createSignedRazorpayWebhookRequest({
      payload,
      secret: RAZORPAY_SECRET,
      asBuffer: true,
      eventId: "rzp_http_dup",
    });
    const billing = razorpayBilling();
    const httpHandler = createWebhookHttpHandler({
      provider: "razorpay",
      processWebhook: (request, handler) =>
        billing.processWebhook(request, handler),
      handler: jest.fn(),
    });
    const makeRes = () => {
      const res = {
        statusCode: 0,
        body: null as unknown,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
      };
      return res;
    };

    await httpHandler(
      { body: signed.rawBody, headers: signed.headers },
      makeRes(),
    );
    const second = makeRes();
    await httpHandler(
      { body: signed.rawBody, headers: signed.headers },
      second,
    );

    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ ok: true, duplicate: true });
  });

  it("fast-acknowledges after verify+claim then runs the handler", async () => {
    const payload = createMockRazorpayPaymentCaptured({
      id: "pay_fast_http",
      created_at: CREATED_AT,
    });
    const signed = createSignedRazorpayWebhookRequest({
      payload,
      secret: RAZORPAY_SECRET,
      asBuffer: true,
      eventId: "rzp_fast_http",
    });
    const billing = razorpayBilling();
    let handlerStarted = false;
    let responseBeforeHandler = false;
    const handler = jest.fn(async () => {
      handlerStarted = true;
      expect(responseBeforeHandler).toBe(true);
    });
    const httpHandler = billing.createWebhookHttpHandler(handler, {
      fastAcknowledge: true,
    });
    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        responseBeforeHandler = !handlerStarted;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    await httpHandler({ body: signed.rawBody, headers: signed.headers }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      acknowledged: true,
      duplicate: false,
      eventId: "rzp_fast_http",
    });
    expect(handler).toHaveBeenCalledTimes(1);

    const replay = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    await httpHandler(
      { body: signed.rawBody, headers: signed.headers },
      replay,
    );
    expect(replay.body).toMatchObject({
      ok: true,
      duplicate: true,
      acknowledged: true,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when signature is invalid", async () => {
    const httpHandler = stripeBilling().createWebhookHttpHandler(jest.fn());
    const res = {
      statusCode: 0,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };

    await httpHandler(
      {
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "t=1,v1=bad" },
      },
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
  });

  it("parses via BillingKit.parseWebhookRequest", () => {
    const signed = createSignedRazorpayWebhookRequest({
      payload: createMockRazorpayPaymentCaptured(),
      secret: RAZORPAY_SECRET,
      eventId: "rzp_parse",
      asBuffer: true,
    });
    const request = razorpayBilling().parseWebhookRequest({
      rawBody: signed.rawBody,
      headers: signed.headers,
    });
    expect(request.eventId).toBe("rzp_parse");
    expect(request.signature).toBe(signed.signature);
  });
});
