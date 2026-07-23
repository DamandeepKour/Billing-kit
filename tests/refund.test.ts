import { RefundService } from "../src/refund";
import { BillingValidationError } from "../src/utils/errors";
import { createMockGateway } from "./helpers";

describe("refund / happy path", () => {
  it("refunds full amount when amount is omitted", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_full",
      paymentId: "pay_1",
      amount: 99900,
      status: "succeeded",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway({ refundPayment }),
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
      createMockGateway({ refundPayment }),
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

  it("allows explicit zero amount through to the gateway", async () => {
    const refundPayment = jest.fn().mockResolvedValue({
      id: "re_zero",
      paymentId: "pay_1",
      amount: 0,
      status: "succeeded",
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway({ refundPayment }),
    ).refundPayment({ paymentId: "pay_1", amount: 0 });

    expect(refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 0 }),
    );
    expect(result.amount).toBe(0);
  });
});

describe("refund / status propagation", () => {
  it.each([
    ["failed", "re_fail"],
    ["pending", "re_pending"],
  ] as const)("propagates %s refund status", async (status, id) => {
    const refundPayment = jest.fn().mockResolvedValue({
      id,
      paymentId: "pay_1",
      amount: 1000,
      status,
      provider: "mock",
    });

    const result = await new RefundService(
      createMockGateway({ refundPayment }),
    ).refundPayment({ paymentId: "pay_1", amount: 1000 });

    expect(result.status).toBe(status);
  });
});

describe("refund / errors and edge cases", () => {
  it("rejects negative refund amounts before calling the gateway", async () => {
    const refundPayment = jest.fn();

    await expect(
      new RefundService(createMockGateway({ refundPayment })).refundPayment({
        paymentId: "pay_1",
        amount: -1,
      }),
    ).rejects.toThrow(BillingValidationError);

    await expect(
      new RefundService(createMockGateway({ refundPayment })).refundPayment({
        paymentId: "pay_1",
        amount: -500,
      }),
    ).rejects.toMatchObject({
      name: "BillingValidationError",
      code: "INVALID_REFUND_AMOUNT",
      param: "amount",
    });

    expect(refundPayment).not.toHaveBeenCalled();
  });

  it("propagates gateway errors", async () => {
    const refundPayment = jest
      .fn()
      .mockRejectedValue(new Error("insufficient funds"));

    await expect(
      new RefundService(createMockGateway({ refundPayment })).refundPayment({
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

    await new RefundService(createMockGateway({ refundPayment })).refundPayment({
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
