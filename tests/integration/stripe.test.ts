import { BillingKit } from "../../src/core/BillingKit";

const paymentIntentsCreate = jest.fn();
const paymentIntentsCapture = jest.fn();
const refundsCreate = jest.fn();

jest.mock("stripe", () => {
  const actualStripe = jest.requireActual<typeof import("stripe")>("stripe");

  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      paymentIntents: {
        create: paymentIntentsCreate,
        capture: paymentIntentsCapture,
        cancel: jest.fn(),
        retrieve: jest.fn(),
      },
      refunds: { create: refundsCreate },
      products: { create: jest.fn(), update: jest.fn() },
      prices: { create: jest.fn(), retrieve: jest.fn() },
      subscriptions: { create: jest.fn(), update: jest.fn() },
      webhooks: new actualStripe.default("sk_test").webhooks,
    })),
  };
});

describe("Stripe payments", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates payment", async () => {
    paymentIntentsCreate.mockResolvedValue({
      id: "pi_test",
      status: "requires_capture",
      amount: 5000,
      currency: "inr",
      metadata: {},
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "inr",
    });

    const payment = await billing.createPayment({ amount: 5000 });

    expect(payment.id).toBe("pi_test");
    expect(payment.status).toBe("authorized");
  });

  it("captures payment", async () => {
    paymentIntentsCapture.mockResolvedValue({
      id: "pi_test",
      status: "succeeded",
      amount: 5000,
      currency: "inr",
      metadata: {},
    });

    const billing = new BillingKit({ provider: "stripe", secretKey: "sk_test" });
    const payment = await billing.capturePayment({ paymentId: "pi_test", amount: 5000 });

    expect(payment.status).toBe("captured");
  });

  it("refunds payment", async () => {
    refundsCreate.mockResolvedValue({
      id: "re_test",
      amount: 2500,
      status: "succeeded",
      payment_intent: "pi_test",
    });

    const billing = new BillingKit({ provider: "stripe", secretKey: "sk_test" });
    const refund = await billing.refundPayment({ paymentId: "pi_test", amount: 2500 });

    expect(refund.status).toBe("succeeded");
  });
});

describe("Stripe webhooks", () => {
  it("verifies signature", () => {
    const Stripe = jest.requireActual<typeof import("stripe")>("stripe").default;
    const secret = "whsec_test";
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test" } },
    });

    const header = new Stripe("sk_test").webhooks.generateTestHeaderString({
      payload,
      secret,
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      webhookSecret: secret,
    });

    const event = billing.verifyWebhook(payload, header);
    expect(event.type).toBe("payment_intent.succeeded");
  });
});
