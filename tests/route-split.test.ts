import { BillingKit } from "../src/core/BillingKit";
import { calculateSplitAllocations, SplitValidationError } from "../src/utils/split";
import { UnsupportedOperationError } from "../src/utils/stripe-errors";
import { TransactionType } from "../src/types/transaction";
import {
  IdempotencyConflictError,
  IdempotencyInFlightError,
} from "../src/utils/errors";

const paymentsTransfer = jest.fn();
const transfersCreate = jest.fn();
const transfersReverse = jest.fn();
const transfersFetch = jest.fn();
const settlementsFetch = jest.fn();

jest.mock("razorpay", () => {
  return jest.fn().mockImplementation(() => ({
    orders: { create: jest.fn() },
    payments: {
      fetch: jest.fn(),
      capture: jest.fn(),
      refund: jest.fn(),
      transfer: paymentsTransfer,
    },
    refunds: { fetch: jest.fn() },
    transfers: {
      create: transfersCreate,
      reverse: transfersReverse,
      fetch: transfersFetch,
    },
    settlements: { fetch: settlementsFetch },
    plans: { create: jest.fn(), fetch: jest.fn() },
    subscriptions: { create: jest.fn(), cancel: jest.fn(), fetch: jest.fn() },
  }));
});

function razorpayBilling(): BillingKit {
  return new BillingKit({
    provider: "razorpay",
    keyId: "rzp_test",
    secretKey: "secret",
    currency: "inr",
  });
}

describe("split allocation math", () => {
  it("calculates single-vendor split with platform commission", () => {
    const result = calculateSplitAllocations({
      paymentId: "pay_1",
      amount: 10000,
      transfers: [{ linkedAccountId: "acc_vendor", percent: 100 }],
      platformCommission: { type: "percent", percent: 10 },
    });

    expect(result.platformFee).toBe(1000);
    expect(result.routedAmount).toBe(9000);
    expect(result.allocations).toEqual([
      { linkedAccountId: "acc_vendor", amount: 9000, onHold: false },
    ]);
  });

  it("calculates multi-vendor payout splits", () => {
    const result = calculateSplitAllocations({
      paymentId: "pay_2",
      amount: 10000,
      platformCommission: { type: "flat", amount: 500 },
      transfers: [
        { linkedAccountId: "acc_a", percent: 40 },
        { linkedAccountId: "acc_b", percent: 60, onHold: true },
      ],
    });

    expect(result.platformFee).toBe(500);
    expect(result.allocations).toEqual([
      { linkedAccountId: "acc_a", amount: 3800, onHold: false },
      { linkedAccountId: "acc_b", amount: 5700, onHold: true },
    ]);
    expect(result.routedAmount).toBe(9500);
  });

  it("rejects over-allocation", () => {
    expect(() =>
      calculateSplitAllocations({
        paymentId: "pay_3",
        amount: 1000,
        transfers: [
          { linkedAccountId: "acc_a", amount: 800 },
          { linkedAccountId: "acc_b", amount: 800 },
        ],
      }),
    ).toThrow(SplitValidationError);
  });
});

describe("Razorpay Route splitPayment", () => {
  beforeEach(() => jest.clearAllMocks());

  it("splits a payment to a single vendor and records routing fields", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_1",
          amount: 9000,
          currency: "INR",
          status: "pending",
          recipient: "acc_vendor",
          on_hold: false,
          source: "pay_1",
        },
      ],
    });

    const billing = razorpayBilling();
    const result = await billing.splitPayment({
      paymentId: "pay_1",
      amount: 10000,
      currency: "inr",
      platformCommission: { type: "percent", percent: 10 },
      transfers: [{ linkedAccountId: "acc_vendor", percent: 100 }],
    });

    expect(paymentsTransfer).toHaveBeenCalledWith(
      "pay_1",
      expect.objectContaining({
        transfers: [
          expect.objectContaining({
            account: "acc_vendor",
            amount: 9000,
            currency: "INR",
          }),
        ],
      }),
    );
    expect(result.platformFee).toBe(1000);
    expect(result.vendorAmount).toBe(9000);
    expect(result.transfers[0]?.id).toBe("trf_1");

    const txns = await billing.getSettlementSummary();
    expect(txns.transactionCount).toBe(1);
  });

  it("splits to multiple vendors with settlement hold", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_a",
          amount: 4000,
          currency: "INR",
          status: "pending",
          recipient: "acc_a",
          on_hold: false,
        },
        {
          id: "trf_b",
          amount: 4000,
          currency: "INR",
          status: "pending",
          recipient: "acc_b",
          on_hold: true,
        },
      ],
    });

    const result = await razorpayBilling().splitPayment({
      paymentId: "pay_multi",
      amount: 10000,
      platformCommission: { type: "flat", amount: 2000 },
      transfers: [
        { linkedAccountId: "acc_a", amount: 4000 },
        { linkedAccountId: "acc_b", amount: 4000, onHold: true },
      ],
    });

    expect(result.transfers).toHaveLength(2);
    expect(result.settlementStatus).toBe("on_hold");
    expect(result.routedAmount).toBe(8000);
    expect(result.platformFee).toBe(2000);
  });

  it("creates a direct transfer and reverses it", async () => {
    transfersCreate.mockResolvedValue({
      id: "trf_direct",
      amount: 2500,
      currency: "INR",
      status: "processed",
      recipient: "acc_x",
      on_hold: false,
    });
    transfersReverse.mockResolvedValue({
      id: "rev_1",
      amount: 2500,
      currency: "INR",
      status: "processed",
    });

    const billing = razorpayBilling();
    const transfer = await billing.createTransfer({
      linkedAccountId: "acc_x",
      amount: 2500,
    });
    expect(transfer.id).toBe("trf_direct");
    expect(transfer.status).toBe("settled");

    const reversal = await billing.reverseTransfer({
      transferId: transfer.id,
      amount: 2500,
    });
    expect(reversal.id).toBe("rev_1");
    expect(reversal.status).toBe("settled");
  });

  it("fetches settlement details", async () => {
    settlementsFetch.mockResolvedValue({
      id: "setl_1",
      amount: 8000,
      currency: "INR",
      status: "processed",
      fees: 100,
      tax: 18,
      utr: "UTR123",
      created_at: 1_700_000_000,
    });

    const details = await razorpayBilling().getSettlementDetails({
      settlementId: "setl_1",
    });

    expect(details.id).toBe("setl_1");
    expect(details.utr).toBe("UTR123");
    expect(details.fees).toBe(100);
    expect(details.status).toBe("settled");
  });

  it("records routed amount / platform fee / vendor amount on transactions", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_z",
          amount: 7000,
          currency: "INR",
          status: "pending",
          recipient: "acc_z",
        },
      ],
    });

    const billing = razorpayBilling();
    await billing.splitPayment({
      paymentId: "pay_z",
      amount: 10000,
      platformCommission: { type: "flat", amount: 3000 },
      transfers: [{ linkedAccountId: "acc_z", amount: 7000 }],
    });

    const txn = await billing.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 10000,
      currency: "inr",
      referenceId: "pay_z_ledger",
      routedAmount: 7000,
      platformFee: 3000,
      vendorAmount: 7000,
      settlementStatus: "pending",
      transferIds: ["trf_z"],
    });

    expect(txn.routedAmount).toBe(7000);
    expect(txn.platformFee).toBe(3000);
    expect(txn.vendorAmount).toBe(7000);
    expect(txn.settlementStatus).toBe("pending");
  });
});

describe("Idempotent Razorpay Route transfers", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a cached split result for repeated calls", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_idem_split",
          amount: 9000,
          currency: "INR",
          status: "pending",
          recipient: "acc_vendor",
        },
      ],
    });
    const billing = razorpayBilling();
    const input = {
      paymentId: "pay_idem",
      amount: 10000,
      idempotencyKey: "split_retry_001",
      platformCommission: { type: "flat" as const, amount: 1000 },
      transfers: [{ linkedAccountId: "acc_vendor", amount: 9000 }],
    };

    const first = await billing.splitPayment(input);
    const repeated = await billing.splitPayment(input);

    expect(paymentsTransfer).toHaveBeenCalledTimes(1);
    expect(repeated).toEqual(first);
    await expect(
      billing.getTransferRequest("split_retry_001"),
    ).resolves.toMatchObject({
      kind: "split_payment",
      status: "succeeded",
      providerTransferIds: ["trf_idem_split"],
      providerResponse: expect.any(Object),
    });
  });

  it("rejects reuse of a key with a different transfer payload", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_conflict",
          amount: 1000,
          currency: "INR",
          status: "pending",
          recipient: "acc_vendor",
        },
      ],
    });
    const billing = razorpayBilling();
    await billing.createTransfer({
      linkedAccountId: "acc_vendor",
      paymentId: "pay_conflict",
      amount: 1000,
      idempotencyKey: "transfer_conflict_001",
    });

    await expect(
      billing.createTransfer({
        linkedAccountId: "acc_vendor",
        paymentId: "pay_conflict",
        amount: 2000,
        idempotencyKey: "transfer_conflict_001",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(paymentsTransfer).toHaveBeenCalledTimes(1);
  });

  it("blocks a concurrent request with the same key", async () => {
    let resolveTransfer:
      | ((value: Record<string, unknown>) => void)
      | undefined;
    paymentsTransfer.mockImplementation(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveTransfer = resolve;
        }),
    );
    const billing = razorpayBilling();
    const input = {
      linkedAccountId: "acc_vendor",
      paymentId: "pay_concurrent",
      amount: 1000,
      idempotencyKey: "transfer_concurrent_001",
    };

    const first = billing.createTransfer(input);
    await new Promise((resolve) => setImmediate(resolve));
    await expect(billing.createTransfer(input)).rejects.toBeInstanceOf(
      IdempotencyInFlightError,
    );
    resolveTransfer?.({
      items: [
        {
          id: "trf_concurrent",
          amount: 1000,
          currency: "INR",
          status: "pending",
          recipient: "acc_vendor",
        },
      ],
    });
    await expect(first).resolves.toMatchObject({ id: "trf_concurrent" });
    expect(paymentsTransfer).toHaveBeenCalledTimes(1);
  });

  it("allows retrying a definitively failed transfer", async () => {
    paymentsTransfer
      .mockRejectedValueOnce(new Error("provider rejected request"))
      .mockResolvedValueOnce({
        items: [
          {
            id: "trf_retry_success",
            amount: 1000,
            currency: "INR",
            status: "pending",
            recipient: "acc_vendor",
          },
        ],
      });
    const billing = razorpayBilling();
    const input = {
      linkedAccountId: "acc_vendor",
      paymentId: "pay_retry",
      amount: 1000,
      idempotencyKey: "transfer_retry_001",
    };

    await expect(billing.createTransfer(input)).rejects.toThrow(
      "provider rejected request",
    );
    await expect(
      billing.getTransferRequest("transfer_retry_001"),
    ).resolves.toMatchObject({ status: "failed" });

    await expect(billing.createTransfer(input)).resolves.toMatchObject({
      id: "trf_retry_success",
    });
    expect(paymentsTransfer).toHaveBeenCalledTimes(2);
  });

  it("sends the provider idempotency header for direct transfers", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: "trf_direct_idempotent",
          amount: 2500,
          currency: "INR",
          status: "processed",
          recipient: "acc_direct",
          on_hold: false,
        }),
    } as Response);
    try {
      const billing = razorpayBilling();
      const input = {
        linkedAccountId: "acc_direct",
        amount: 2500,
        idempotencyKey: "direct_transfer_001",
      };

      const first = await billing.createTransfer(input);
      const repeated = await billing.createTransfer(input);

      expect(first.id).toBe("trf_direct_idempotent");
      expect(repeated).toEqual(first);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.razorpay.com/v1/transfers",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Transfer-Idempotency": "direct_transfer_001",
          }),
        }),
      );
      expect(transfersCreate).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("reconciles an uncertain direct transfer without a new logical payout", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("network connection lost"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: "trf_after_timeout",
            amount: 2500,
            currency: "INR",
            status: "processed",
            recipient: "acc_direct",
            on_hold: false,
          }),
      } as Response);
    try {
      const billing = razorpayBilling();
      const input = {
        linkedAccountId: "acc_direct",
        amount: 2500,
        idempotencyKey: "direct_timeout_001",
      };

      await expect(billing.createTransfer(input)).rejects.toThrow(
        "network connection lost",
      );
      await expect(
        billing.getTransferRequest("direct_timeout_001"),
      ).resolves.toMatchObject({ status: "uncertain" });
      await expect(billing.createTransfer(input)).rejects.toBeInstanceOf(
        IdempotencyInFlightError,
      );

      const reconciled = await billing.reconcileTransferRequest(
        "direct_timeout_001",
      );
      expect(reconciled).toMatchObject({
        status: "succeeded",
        providerTransferIds: ["trf_after_timeout"],
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("reconciles persisted provider transfer status", async () => {
    paymentsTransfer.mockResolvedValue({
      items: [
        {
          id: "trf_reconcile",
          amount: 1000,
          currency: "INR",
          status: "pending",
          recipient: "acc_vendor",
        },
      ],
    });
    transfersFetch.mockResolvedValue({
      id: "trf_reconcile",
      amount: 1000,
      currency: "INR",
      status: "processed",
    });
    const billing = razorpayBilling();
    await billing.createTransfer({
      linkedAccountId: "acc_vendor",
      paymentId: "pay_reconcile",
      amount: 1000,
      idempotencyKey: "transfer_reconcile_001",
    });

    const reconciled = await billing.reconcileTransferRequest(
      "transfer_reconcile_001",
    );

    expect(transfersFetch).toHaveBeenCalledWith("trf_reconcile");
    expect(reconciled).toMatchObject({
      status: "succeeded",
      settlementStatus: "settled",
      reconciledAt: expect.any(Date),
    });
  });

  it("deduplicates transfer reversals", async () => {
    transfersReverse.mockResolvedValue({
      id: "rev_idempotent",
      amount: 500,
      currency: "INR",
      status: "processed",
    });
    const billing = razorpayBilling();
    const input = {
      transferId: "trf_reverse",
      amount: 500,
      idempotencyKey: "reversal_retry_001",
    };

    const first = await billing.reverseTransfer(input);
    const repeated = await billing.reverseTransfer(input);

    expect(repeated).toEqual(first);
    expect(transfersReverse).toHaveBeenCalledTimes(1);
  });
});

describe("Route helpers on other providers", () => {
  it("throws UnsupportedOperationError for Stripe", async () => {
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
    });

    await expect(
      billing.splitPayment({
        paymentId: "pay_1",
        amount: 1000,
        transfers: [{ linkedAccountId: "acc_1", amount: 1000 }],
      }),
    ).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
