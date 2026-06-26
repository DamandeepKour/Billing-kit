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
      refunds: {
        create: refundsCreate,
      },
      products: { create: jest.fn(), update: jest.fn() },
      prices: { create: jest.fn(), retrieve: jest.fn() },
      subscriptions: { create: jest.fn(), update: jest.fn() },
      webhooks: new actualStripe.default("sk_test").webhooks,
    })),
  };
});

describe("Stripe payment integration (SDK mocked)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a payment through BillingKit → StripeGateway", async () => {
    paymentIntentsCreate.mockResolvedValue({
      id: "pi_integration_test",
      status: "requires_capture",
      amount: 5000,
      currency: "inr",
      metadata: {},
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_integration",
      currency: "inr",
    });

    const payment = await billing.createPayment({ amount: 5000 });

    expect(paymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "inr" }),
      undefined,
    );
    expect(payment.id).toBe("pi_integration_test");
    expect(payment.status).toBe("authorized");
  });

  it("captures a payment through BillingKit → StripeGateway", async () => {
    paymentIntentsCapture.mockResolvedValue({
      id: "pi_capture_test",
      status: "succeeded",
      amount: 5000,
      currency: "inr",
      metadata: {},
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_integration",
    });

    const payment = await billing.capturePayment({
      paymentId: "pi_capture_test",
      amount: 5000,
    });

    expect(paymentIntentsCapture).toHaveBeenCalledWith("pi_capture_test", {
      amount_to_capture: 5000,
    });
    expect(payment.status).toBe("captured");
  });

  it("refunds a payment through BillingKit → StripeGateway", async () => {
    refundsCreate.mockResolvedValue({
      id: "re_integration_test",
      amount: 2500,
      status: "succeeded",
      payment_intent: "pi_refund_test",
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_integration",
    });

    const refund = await billing.refundPayment({
      paymentId: "pi_refund_test",
      amount: 2500,
    });

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_refund_test",
        amount: 2500,
      }),
      undefined,
    );
    expect(refund.id).toBe("re_integration_test");
    expect(refund.status).toBe("succeeded");
  });
});

describe("Stripe webhook integration", () => {
  it("verifies a real Stripe webhook signature", () => {
    const Stripe = jest.requireActual<typeof import("stripe")>("stripe").default;
    const webhookSecret = "whsec_test_secret";
    const payload = JSON.stringify({
      id: "evt_test",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test" } },
    });

    const stripe = new Stripe("sk_test_x");
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      webhookSecret,
    });

    const event = billing.verifyWebhook(payload, header);

    expect(event.type).toBe("payment_intent.succeeded");
    expect(event.provider).toBe("stripe");
  });
});
