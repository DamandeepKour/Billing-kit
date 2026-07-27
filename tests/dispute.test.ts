import nock from "nock";
import { BillingKit } from "../src/core/BillingKit";
import {
  createMockRazorpayDispute,
  createMockStripeDispute,
  createSignedRazorpayWebhookRequest,
  createSignedStripeWebhookRequest,
} from "../src/testing";
import {
  normalizeRazorpayWebhook,
  normalizeStripeWebhook,
} from "../src";
import {
  mapRazorpayDisputeStatus,
  mapStripeDisputeStatus,
} from "../src/utils/dispute-status";

const RAZORPAY_SECRET = "whsec_dispute_rzp";
const STRIPE_SECRET = "whsec_dispute_stripe";

function razorpayBilling(): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "rzp_secret",
    webhookSecret: RAZORPAY_SECRET,
    currency: "inr",
  });
}

function stripeBilling(): BillingKit {
  return new BillingKit({
    provider: "stripe",
    secretKey: "sk_test_dispute",
    webhookSecret: STRIPE_SECRET,
    currency: "usd",
  });
}

const disputesRetrieve = jest.fn();
const disputesList = jest.fn();
const disputesUpdate = jest.fn();

jest.mock("stripe", () => {
  const actualStripe = jest.requireActual<typeof import("stripe")>("stripe");
  return {
    __esModule: true,
    default: Object.assign(
      jest.fn().mockImplementation(() => ({
        products: { create: jest.fn(), update: jest.fn() },
        prices: { create: jest.fn(), retrieve: jest.fn() },
        subscriptions: {
          create: jest.fn(),
          update: jest.fn(),
          retrieve: jest.fn(),
          cancel: jest.fn(),
          list: jest.fn(),
        },
        customers: { create: jest.fn(), update: jest.fn(), retrieve: jest.fn() },
        paymentMethods: {
          attach: jest.fn(),
          list: jest.fn(),
          detach: jest.fn(),
        },
        invoices: { retrieve: jest.fn(), list: jest.fn() },
        billingPortal: { sessions: { create: jest.fn() } },
        subscriptionItems: { createUsageRecord: jest.fn() },
        paymentIntents: {
          create: jest.fn(),
          capture: jest.fn(),
          cancel: jest.fn(),
          retrieve: jest.fn(),
        },
        refunds: { create: jest.fn() },
        disputes: {
          retrieve: disputesRetrieve,
          list: disputesList,
          update: disputesUpdate,
        },
        webhooks: new actualStripe.default("sk_test").webhooks,
      })),
      { errors: actualStripe.default.errors },
    ),
  };
});

describe("dispute / status mapping", () => {
  it("maps Razorpay and Stripe dispute statuses", () => {
    expect(mapRazorpayDisputeStatus("open")).toBe("open");
    expect(mapRazorpayDisputeStatus("under_review")).toBe("under_review");
    expect(mapRazorpayDisputeStatus("action_required")).toBe("action_required");
    expect(mapRazorpayDisputeStatus("won")).toBe("won");
    expect(mapRazorpayDisputeStatus("lost")).toBe("lost");
    expect(mapStripeDisputeStatus("needs_response")).toBe("needs_response");
    expect(mapStripeDisputeStatus("won")).toBe("won");
  });
});

describe("dispute / webhook normalization", () => {
  it.each([
    ["payment.dispute.created", "dispute.created", "open"],
    ["payment.dispute.won", "dispute.won", "won"],
    ["payment.dispute.lost", "dispute.lost", "lost"],
    ["payment.dispute.closed", "dispute.closed", "closed"],
    ["payment.dispute.under_review", "dispute.under_review", "under_review"],
    [
      "payment.dispute.action_required",
      "dispute.action_required",
      "action_required",
    ],
  ] as const)("normalizes Razorpay %s → %s", (event, normalized, status) => {
    const body = createMockRazorpayDispute(event, {
      id: "disp_norm",
      payment_id: "pay_norm",
      status,
    }).body;
    const result = normalizeRazorpayWebhook(body, "razorpay");
    expect(result.normalizedType).toBe(normalized);
    expect(result.entity).toMatchObject({
      id: "disp_norm",
      kind: "dispute",
      parentId: "pay_norm",
      status,
      currency: "inr",
    });
  });

  it("normalizes Stripe charge.dispute.* events", () => {
    const created = normalizeStripeWebhook(
      "evt_dp_1",
      "charge.dispute.created",
      {
        id: "dp_1",
        amount: 2500,
        currency: "usd",
        status: "needs_response",
        payment_intent: "pi_1",
      },
      "stripe",
    );
    expect(created.normalizedType).toBe("dispute.created");
    expect(created.entity.kind).toBe("dispute");
    expect(created.entity.parentId).toBe("pi_1");

    const won = normalizeStripeWebhook(
      "evt_dp_2",
      "charge.dispute.closed",
      { id: "dp_2", status: "won", amount: 1000, currency: "usd" },
      "stripe",
    );
    expect(won.normalizedType).toBe("dispute.won");

    const lost = normalizeStripeWebhook(
      "evt_dp_3",
      "charge.dispute.funds_withdrawn",
      { id: "dp_3", status: "lost", amount: 1000, currency: "usd" },
      "stripe",
    );
    expect(lost.normalizedType).toBe("dispute.lost");
  });
});

describe("dispute / Razorpay APIs", () => {
  afterEach(() => nock.cleanAll());

  it("fetches, lists, accepts, and contests disputes", async () => {
    nock("https://api.razorpay.com")
      .get("/v1/disputes/disp_1")
      .reply(200, {
        id: "disp_1",
        payment_id: "pay_1",
        amount: 50000,
        currency: "INR",
        status: "open",
        phase: "chargeback",
        reason_code: "goods_or_services_not_provided",
        created_at: 1_700_000_000,
        respond_by: 1_700_100_000,
      })
      .get("/v1/disputes?count=2")
      .reply(200, {
        items: [
          {
            id: "disp_1",
            payment_id: "pay_1",
            amount: 50000,
            currency: "INR",
            status: "open",
          },
        ],
      })
      .post("/v1/disputes/disp_1/accept")
      .reply(200, {
        id: "disp_1",
        payment_id: "pay_1",
        amount: 50000,
        currency: "INR",
        status: "lost",
      })
      .patch("/v1/disputes/disp_2")
      .reply(200, {
        id: "disp_2",
        payment_id: "pay_2",
        amount: 20000,
        currency: "INR",
        status: "under_review",
      });

    const billing = razorpayBilling();
    const fetched = await billing.fetchDispute("disp_1");
    expect(fetched).toMatchObject({
      id: "disp_1",
      paymentId: "pay_1",
      amount: 50000,
      currency: "inr",
      status: "open",
      phase: "chargeback",
      reasonCode: "goods_or_services_not_provided",
    });
    expect(fetched.respondBy?.toISOString()).toBe(
      new Date(1_700_100_000 * 1000).toISOString(),
    );

    const listed = await billing.listDisputes({ count: 2 });
    expect(listed).toHaveLength(1);

    const accepted = await billing.acceptDispute({ disputeId: "disp_1" });
    expect(accepted.status).toBe("lost");

    const contested = await billing.contestDispute({
      disputeId: "disp_2",
      evidence: {
        explanation: "Product delivered",
        shippingProof: ["doc_ship_1"],
      },
    });
    expect(contested.status).toBe("under_review");
  });
});

describe("dispute / Stripe APIs", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches, lists, and submits dispute evidence", async () => {
    disputesRetrieve.mockResolvedValue({
      id: "dp_1",
      amount: 2500,
      currency: "usd",
      status: "needs_response",
      reason: "fraudulent",
      charge: "ch_1",
      payment_intent: "pi_1",
      created: 1_700_000_000,
      metadata: {},
      evidence_details: { due_by: 1_700_100_000, submission_count: 0 },
    });
    disputesList.mockResolvedValue({
      data: [
        {
          id: "dp_1",
          amount: 2500,
          currency: "usd",
          status: "needs_response",
          reason: "fraudulent",
          charge: "ch_1",
          payment_intent: "pi_1",
          created: 1_700_000_000,
          metadata: {},
          evidence_details: { due_by: null, submission_count: 0 },
        },
      ],
    });
    disputesUpdate.mockResolvedValue({
      id: "dp_1",
      amount: 2500,
      currency: "usd",
      status: "under_review",
      reason: "fraudulent",
      charge: "ch_1",
      payment_intent: "pi_1",
      created: 1_700_000_000,
      metadata: {},
      evidence_details: { due_by: null, submission_count: 1 },
    });

    const billing = stripeBilling();
    const fetched = await billing.fetchDispute("dp_1");
    expect(fetched.status).toBe("needs_response");
    expect(fetched.paymentId).toBe("pi_1");

    const listed = await billing.listDisputes({ count: 10 });
    expect(listed[0]?.id).toBe("dp_1");

    const updated = await billing.updateDisputeEvidence({
      disputeId: "dp_1",
      evidence: { explanation: "Legitimate charge" },
      submit: true,
    });
    expect(updated.status).toBe("under_review");
    expect(disputesUpdate).toHaveBeenCalledWith(
      "dp_1",
      expect.objectContaining({
        submit: true,
        evidence: expect.objectContaining({
          uncategorized_text: "Legitimate charge",
        }),
      }),
    );
  });
});

describe("dispute / webhook processing", () => {
  it("processes Razorpay dispute webhooks with dedupe", async () => {
    const billing = razorpayBilling();
    const signed = createSignedRazorpayWebhookRequest({
      payload: createMockRazorpayDispute("payment.dispute.created", {
        id: "disp_wh",
        payment_id: "pay_wh",
      }),
      secret: RAZORPAY_SECRET,
      asBuffer: true,
      eventId: "rzp_disp_evt_1",
    });
    const handler = jest.fn();
    const first = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );
    const second = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      handler,
    );

    expect(first.event.normalizedType).toBe("dispute.created");
    expect(first.event.entity.kind).toBe("dispute");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.duplicate).toBe(true);
  });

  it("revokes entitlements when a dispute is lost", async () => {
    const billing = razorpayBilling();
    await billing.setPlanFeatures({
      planId: "plan_disp",
      features: ["premium"],
    });
    await billing.syncSubscriptionEntitlements({
      subscription: {
        id: "sub_disp",
        customerId: "cus_disp",
        planId: "plan_disp",
        status: "active",
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        provider: "razorpay",
      },
    });
    await expect(billing.hasFeature("cus_disp", "premium")).resolves.toBe(true);

    const signed = createSignedRazorpayWebhookRequest({
      payload: createMockRazorpayDispute("payment.dispute.lost", {
        id: "disp_lost",
        customer_id: "cus_disp",
      }),
      secret: RAZORPAY_SECRET,
      asBuffer: true,
      eventId: "rzp_disp_lost",
    });
    await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      jest.fn(),
    );
    await expect(billing.hasFeature("cus_disp", "premium")).resolves.toBe(false);
  });

  it("processes Stripe dispute.closed won as dispute.won", async () => {
    const billing = stripeBilling();
    const payload = createMockStripeDispute("charge.dispute.closed", {
      id: "dp_won",
      status: "won",
    });
    const signed = createSignedStripeWebhookRequest({
      payload: JSON.stringify({
        ...JSON.parse(payload.body),
        id: "evt_dp_won",
      }),
      secret: STRIPE_SECRET,
      asBuffer: true,
    });
    const result = await billing.processWebhookFromHttp(
      { body: signed.rawBody, headers: signed.headers },
      jest.fn(),
    );
    expect(result.event.normalizedType).toBe("dispute.won");
  });
});
