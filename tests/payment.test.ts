import { PaymentGatewayFactory, PaymentManager, PaymentService } from "../src/payment";
import { SubscriptionService } from "../src/subscription";
import { StripeGateway } from "../src/payment/gateways/StripeGateway";
import { RazorpayGateway } from "../src/payment/gateways/RazorpayGateway";
import type { PaymentGateway } from "../src/interfaces/PaymentGateway";
import { InvalidConfigError } from "../src/utils/errors";

function createMockGateway(): jest.Mocked<PaymentGateway> {
  return {
    name: "mock",
    createPayment: jest.fn().mockResolvedValue({
      id: "pay_1",
      status: "pending",
      amount: 5000,
      currency: "inr",
      provider: "mock",
    }),
    capturePayment: jest.fn(),
    cancelPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    refundPayment: jest.fn(),
    createPlan: jest.fn().mockResolvedValue({
      id: "plan_1",
      name: "Pro",
      amount: 99900,
      currency: "inr",
      interval: "monthly",
      provider: "mock",
    }),
    updatePlan: jest.fn(),
    cancelPlan: jest.fn(),
    createSubscription: jest.fn().mockResolvedValue({
      id: "sub_1",
      customerId: "cus_1",
      planId: "plan_1",
      status: "active",
      currentPeriodEnd: new Date(),
      cancelAtPeriodEnd: false,
      provider: "mock",
    }),
    cancelSubscription: jest.fn(),
    scheduleCancellation: jest.fn(),
    renewSubscription: jest.fn(),
    pauseSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    retrieveSubscription: jest.fn(),
    verifyWebhook: jest.fn(),
  };
}

describe("PaymentGatewayFactory", () => {
  it("creates Stripe gateway", () => {
    const gateway = PaymentGatewayFactory.create({
      provider: "stripe",
      secretKey: "sk_test_x",
    });

    expect(gateway).toBeInstanceOf(StripeGateway);
  });

  it("creates Razorpay gateway", () => {
    const gateway = PaymentGatewayFactory.create({
      provider: "razorpay",
      keyId: "rzp_test",
      secretKey: "secret",
    });

    expect(gateway).toBeInstanceOf(RazorpayGateway);
  });

  it("throws for unsupported provider", () => {
    expect(() =>
      PaymentGatewayFactory.create({
        // @ts-expect-error testing invalid provider
        provider: "paypal",
        secretKey: "x",
      }),
    ).toThrow(InvalidConfigError);
  });
});

describe("PaymentManager", () => {
  it("creates stripe gateway from config", () => {
    const manager = new PaymentManager({
      provider: "stripe",
      secretKey: "sk_test_x",
    });

    expect(manager.getGateway().name).toBe("stripe");
  });
});

describe("PaymentService", () => {
  it("creates payment via gateway", async () => {
    const gateway = createMockGateway();
    const service = new PaymentService(gateway);

    const payment = await service.createPayment({ amount: 5000 });

    expect(payment.id).toBe("pay_1");
    expect(gateway.createPayment).toHaveBeenCalled();
  });
});

describe("SubscriptionService", () => {
  it("creates plan and subscription via gateway", async () => {
    const gateway = createMockGateway();
    const service = new SubscriptionService(gateway);

    const plan = await service.createPlan({
      name: "Pro",
      amount: 99900,
      interval: "monthly",
    });

    const sub = await service.createSubscription({
      customerId: "cus_1",
      planId: plan.id,
    });

    expect(plan.id).toBe("plan_1");
    expect(sub.id).toBe("sub_1");
  });
});
