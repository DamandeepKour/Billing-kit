import { RefundService } from "../src/refund";
import type { PaymentGateway } from "../src/interfaces/PaymentGateway";

function createMockGateway(
  refundPayment: PaymentGateway["refundPayment"],
): PaymentGateway {
  return {
    name: "mock",
    createPayment: jest.fn(),
    capturePayment: jest.fn(),
    cancelPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    refundPayment,
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    cancelPlan: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    renewSubscription: jest.fn(),
    verifyWebhook: jest.fn(),
  };
}

describe("RefundService", () => {
  it("refunds full amount when amount is omitted", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_full",
      paymentId: "pay_1",
      amount: 99900,
      status: "succeeded",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway(refundPayment),
    ).refundPayment({ paymentId: "pay_1" });

    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay_1" }),
    );
    expect(result.amount).toBe(99900);
    expect(result.status).toBe("succeeded");
    expect(result.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("refunds partial amount with reason", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_partial",
      paymentId: "pay_1",
      amount: 25000,
      status: "succeeded",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway(refundPayment),
    ).refundPayment({
      paymentId: "pay_1",
      amount: 25000,
      reason: "requested_by_customer",
    });

    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: "pay_1",
        amount: 25000,
        reason: "requested_by_customer",
      }),
    );
    expect(result.id).toBe("re_partial");
    expect(result.amount).toBe(25000);
  });

  it("propagates failed refund status", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_fail",
      paymentId: "pay_1",
      amount: 1000,
      status: "failed",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway(refundPayment),
    ).refundPayment({ paymentId: "pay_1", amount: 1000 });

    expect(result.status).toBe("failed");
  });

  it("propagates pending refund status", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_pending",
      paymentId: "pay_1",
      amount: 1000,
      status: "pending",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway(refundPayment),
    ).refundPayment({ paymentId: "pay_1", amount: 1000 });

    expect(result.status).toBe("pending");
  });

  it("propagates gateway errors", async () => {
    const refundPayment = jest
      .fn()
      .mockRejectedValue(new Error("insufficient funds"));

    await expect(
      new RefundService(createMockGateway(refundPayment)).refundPayment({
        paymentId: "pay_1",
        amount: 1000,
      }),
    ).rejects.toThrow("insufficient funds");
  });

  it("passes idempotency key through to the gateway", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_idem",
      paymentId: "pay_1",
      amount: 1000,
      status: "succeeded",
      provider: "mock",
    });

    await new RefundService(createMockGateway(refundPayment)).refundPayment({
      paymentId: "pay_1",
      amount: 1000,
      idempotencyKey: "idem_123",
    });

    expect(refundPayment).toHaveBeenCalledWith({
      paymentId: "pay_1",
      amount: 1000,
      idempotencyKey: "idem_123",
    });
  });
});
