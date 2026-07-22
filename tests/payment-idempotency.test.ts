import { PaymentService } from "../src/payment";
import { RefundService } from "../src/refund";
import { InMemoryIdempotencyRequestRepository } from "../src/repositories";
import type { PaymentGateway } from "../src/interfaces/PaymentGateway";
import type { PaymentResult } from "../src/types/payment";
import {
  IdempotencyConflictError,
  IdempotencyInFlightError,
} from "../src/utils/errors";

function createMockGateway(
  overrides: Partial<PaymentGateway> = {},
): PaymentGateway {
  return {
    name: "mock",
    createPayment: jest.fn().mockResolvedValue({
      id: "pay_1",
      status: "captured",
      amount: 5000,
      currency: "inr",
      provider: "mock",
    }),
    capturePayment: jest.fn().mockResolvedValue({
      id: "pay_1",
      status: "captured",
      amount: 5000,
      currency: "inr",
      provider: "mock",
    }),
    cancelPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    refundPayment: jest.fn().mockResolvedValue({
      id: "re_1",
      paymentId: "pay_1",
      amount: 5000,
      status: "succeeded",
      provider: "mock",
    }),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    cancelPlan: jest.fn(),
    createSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    renewSubscription: jest.fn(),
    verifyWebhook: jest.fn(),
    ...overrides,
  };
}

describe("payment and refund idempotency", () => {
  it("returns the same payment result for a retried createPayment", async () => {
    const gateway = createMockGateway();
    const repo = new InMemoryIdempotencyRequestRepository();
    const payments = new PaymentService(
      gateway,
      "inr",
      undefined,
      undefined,
      repo,
    );
    const input = {
      amount: 5000,
      currency: "inr",
      idempotencyKey: "pay_retry_001",
    };

    const first = await payments.createPayment(input);
    const repeated = await payments.createPayment(input);

    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
    expect(repeated).toEqual(first);
    expect(first.idempotencyKey).toBe("pay_retry_001");
    await expect(repo.findByKey("pay_retry_001")).resolves.toMatchObject({
      kind: "create_payment",
      status: "succeeded",
    });
  });

  it("rejects reuse of a payment key with a different payload", async () => {
    const gateway = createMockGateway();
    const payments = new PaymentService(
      gateway,
      "inr",
      undefined,
      undefined,
      new InMemoryIdempotencyRequestRepository(),
    );

    await payments.createPayment({
      amount: 5000,
      currency: "inr",
      idempotencyKey: "pay_conflict_001",
    });

    await expect(
      payments.createPayment({
        amount: 9999,
        currency: "inr",
        idempotencyKey: "pay_conflict_001",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(gateway.createPayment).toHaveBeenCalledTimes(1);
  });

  it("blocks a concurrent createPayment with the same key", async () => {
    let resolvePayment: ((value: PaymentResult) => void) | undefined;
    const gateway = createMockGateway({
      createPayment: () =>
        new Promise<PaymentResult>((resolve) => {
          resolvePayment = resolve;
        }),
    });
    const payments = new PaymentService(
      gateway,
      "inr",
      undefined,
      undefined,
      new InMemoryIdempotencyRequestRepository(),
    );
    const input = {
      amount: 5000,
      currency: "inr",
      idempotencyKey: "pay_concurrent_001",
    };

    const first = payments.createPayment(input);
    await new Promise((resolve) => setImmediate(resolve));
    await expect(payments.createPayment(input)).rejects.toBeInstanceOf(
      IdempotencyInFlightError,
    );
    resolvePayment?.({
      id: "pay_1",
      status: "captured",
      amount: 5000,
      currency: "inr",
      provider: "mock",
    });
    await expect(first).resolves.toMatchObject({ id: "pay_1" });
  });

  it("auto-generates an idempotency key when omitted", async () => {
    const gateway = createMockGateway();
    const payments = new PaymentService(
      gateway,
      "inr",
      undefined,
      undefined,
      new InMemoryIdempotencyRequestRepository(),
    );

    const result = await payments.createPayment({
      amount: 5000,
      currency: "inr",
    });

    expect(result.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(gateway.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: result.idempotencyKey }),
    );
  });

  it("retries a failed payment after clearing the failed claim", async () => {
    const createPayment = jest
      .fn()
      .mockRejectedValueOnce(new Error("card declined"))
      .mockResolvedValueOnce({
        id: "pay_2",
        status: "captured",
        amount: 5000,
        currency: "inr",
        provider: "mock",
      });
    const gateway = createMockGateway({ createPayment });
    const payments = new PaymentService(
      gateway,
      "inr",
      undefined,
      undefined,
      new InMemoryIdempotencyRequestRepository(),
    );
    const input = {
      amount: 5000,
      currency: "inr",
      idempotencyKey: "pay_retry_fail_001",
    };

    await expect(payments.createPayment(input)).rejects.toThrow(
      "card declined",
    );
    const recovered = await payments.createPayment(input);

    expect(createPayment).toHaveBeenCalledTimes(2);
    expect(recovered.id).toBe("pay_2");
  });

  it("returns the same refund result for a retried refundPayment", async () => {
    const gateway = createMockGateway();
    const repo = new InMemoryIdempotencyRequestRepository();
    const refunds = new RefundService(gateway, repo);
    const input = {
      paymentId: "pay_1",
      amount: 5000,
      idempotencyKey: "refund_retry_001",
    };

    const first = await refunds.refundPayment(input);
    const repeated = await refunds.refundPayment(input);

    expect(gateway.refundPayment).toHaveBeenCalledTimes(1);
    expect(repeated).toEqual(first);
    expect(first.idempotencyKey).toBe("refund_retry_001");
    await expect(repo.findByKey("refund_retry_001")).resolves.toMatchObject({
      kind: "refund_payment",
      status: "succeeded",
    });
  });

  it("rejects reuse of a refund key with a different payload", async () => {
    const gateway = createMockGateway();
    const refunds = new RefundService(
      gateway,
      new InMemoryIdempotencyRequestRepository(),
    );

    await refunds.refundPayment({
      paymentId: "pay_1",
      amount: 5000,
      idempotencyKey: "refund_conflict_001",
    });

    await expect(
      refunds.refundPayment({
        paymentId: "pay_1",
        amount: 1000,
        idempotencyKey: "refund_conflict_001",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(gateway.refundPayment).toHaveBeenCalledTimes(1);
  });
});
