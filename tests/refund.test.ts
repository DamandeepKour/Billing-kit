import { RefundService } from "../src/refund";
import { WebhookService } from "../src/webhook";
import type { PaymentGateway } from "../src/interfaces/PaymentGateway";

const mockGateway: PaymentGateway = {
  name: "mock",
  createPayment: jest.fn(),
  capturePayment: jest.fn(),
  cancelPayment: jest.fn(),
  getPaymentStatus: jest.fn(),
  refundPayment: jest.fn().mockResolvedValue({
    id: "re_1",
    paymentId: "pay_1",
    amount: 1000,
    status: "succeeded",
    provider: "mock",
  }),
  createPlan: jest.fn(),
  updatePlan: jest.fn(),
  cancelPlan: jest.fn(),
  createSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  renewSubscription: jest.fn(),
  verifyWebhook: jest.fn().mockReturnValue({
    id: "evt_1",
    type: "payment.success",
    provider: "mock",
    data: {},
  }),
};

describe("RefundService", () => {
  it("delegates refund to gateway", async () => {
    const service = new RefundService(mockGateway);
    const result = await service.refundPayment({ paymentId: "pay_1", amount: 1000 });

    expect(result.id).toBe("re_1");
    expect(mockGateway.refundPayment).toHaveBeenCalledWith({
      paymentId: "pay_1",
      amount: 1000,
    });
  });
});

describe("WebhookService", () => {
  it("delegates verification to gateway", () => {
    const service = new WebhookService(mockGateway);
    const event = service.verifyWebhook("{}", "sig");

    expect(event.type).toBe("payment.success");
    expect(mockGateway.verifyWebhook).toHaveBeenCalledWith("{}", "sig");
  });
});
