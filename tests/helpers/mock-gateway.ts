import type { PaymentGateway } from "../../src/interfaces/PaymentGateway";
import type { Plan, Subscription } from "../../src/types/subscription";

export type MockPaymentGateway = jest.Mocked<PaymentGateway>;

const defaultPlan: Plan = {
  id: "plan_1",
  name: "Pro",
  amount: 99900,
  currency: "inr",
  interval: "monthly",
  provider: "mock",
};

const defaultSubscription: Subscription = {
  id: "sub_1",
  customerId: "cus_1",
  planId: "plan_1",
  status: "active",
  currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
  cancelAtPeriodEnd: false,
  provider: "mock",
};

/** Shared PaymentGateway mock — override only the methods a test needs. */
export function createMockGateway(
  overrides: Partial<MockPaymentGateway> = {},
): MockPaymentGateway {
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
    refundPayment: jest.fn().mockResolvedValue({
      id: "re_1",
      paymentId: "pay_1",
      amount: 5000,
      status: "succeeded",
      provider: "mock",
    }),
    createPlan: jest.fn().mockResolvedValue(defaultPlan),
    updatePlan: jest.fn(),
    cancelPlan: jest.fn(),
    createSubscription: jest.fn().mockResolvedValue(defaultSubscription),
    cancelSubscription: jest.fn().mockResolvedValue({
      ...defaultSubscription,
      status: "cancelled",
    }),
    scheduleCancellation: jest.fn().mockResolvedValue({
      ...defaultSubscription,
      cancelAtPeriodEnd: true,
    }),
    renewSubscription: jest.fn(),
    pauseSubscription: jest.fn(),
    resumeSubscription: jest.fn(),
    retrieveSubscription: jest.fn().mockResolvedValue(defaultSubscription),
    verifyWebhook: jest.fn(),
    ...overrides,
  };
}
