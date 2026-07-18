import { BillingKit } from "../src/core/BillingKit";
import { InMemoryTransactionRepository } from "../src/repositories";
import { TransactionService } from "../src/transaction";
import { TransactionType } from "../src/types/transaction";
import { TransactionNotFoundError } from "../src/utils/errors";
import {
  calculateFeeBreakdown,
  normalizeSettlementFields,
} from "../src/utils/settlement";

describe("Fee / net settlement calculations", () => {
  it("calculates net = gross - fee - taxOnFee", () => {
    expect(
      calculateFeeBreakdown({ gross: 10000, fee: 290, taxOnFee: 52 }),
    ).toEqual({
      gross: 10000,
      fee: 290,
      taxOnFee: 52,
      net: 9658,
    });
  });

  it("defaults taxOnFee to 0", () => {
    expect(calculateFeeBreakdown({ gross: 5000, fee: 145 })).toMatchObject({
      taxOnFee: 0,
      net: 4855,
    });
  });

  it("normalizes settlement defaults when FX omitted", () => {
    const fields = normalizeSettlementFields({
      amount: 2900,
      currency: "USD",
    });

    expect(fields).toMatchObject({
      presentmentCurrency: "usd",
      settlementCurrency: "usd",
      presentmentAmount: 2900,
      settlementAmount: 2900,
    });
  });

  it("preserves presentment vs settlement currencies and fees", () => {
    const fees = calculateFeeBreakdown({
      gross: 241425,
      fee: 7001,
      taxOnFee: 1260,
    });

    const fields = normalizeSettlementFields({
      amount: 2900,
      currency: "usd",
      presentmentCurrency: "usd",
      settlementCurrency: "inr",
      presentmentAmount: 2900,
      settlementAmount: fees.net,
      exchangeRate: { rate: 83.25, source: "stripe" },
      fees,
      providerResponse: { balance_transaction: "txn_stripe_1" },
    });

    expect(fields.presentmentCurrency).toBe("usd");
    expect(fields.settlementCurrency).toBe("inr");
    expect(fields.fees?.net).toBe(233164);
    expect(fields.providerResponse).toEqual({
      balance_transaction: "txn_stripe_1",
    });
  });
});

describe("TransactionService settlement storage", () => {
  it("records presentment and settlement currencies on history", async () => {
    const service = new TransactionService(new InMemoryTransactionRepository());
    const fees = calculateFeeBreakdown({
      gross: 10000,
      fee: 290,
      taxOnFee: 52,
    });

    const txn = await service.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 1200,
      currency: "eur",
      presentmentCurrency: "eur",
      settlementCurrency: "usd",
      presentmentAmount: 1200,
      settlementAmount: fees.net,
      exchangeRate: { rate: 1.08, source: "stripe", asOf: "2026-07-01" },
      fees,
      providerResponse: { id: "txn_1", exchange_rate: 1.08 },
      referenceId: "pi_eur_1",
    });

    expect(txn.currency).toBe("eur");
    expect(txn.presentmentCurrency).toBe("eur");
    expect(txn.settlementCurrency).toBe("usd");
    expect(txn.exchangeRate?.rate).toBe(1.08);
    expect(txn.fees?.net).toBe(9658);
    expect(txn.providerResponse).toMatchObject({ id: "txn_1" });

    const loaded = await service.getTransaction(txn.id);
    expect(loaded.settlementCurrency).toBe("usd");
  });

  it("throws when transaction not found", async () => {
    const service = new TransactionService(new InMemoryTransactionRepository());
    await expect(service.getTransaction("missing")).rejects.toThrow(
      TransactionNotFoundError,
    );
  });
});

describe("Currency reporting helpers", () => {
  it("getRevenueByCurrency and getSettlementSummary aggregate correctly", async () => {
    const repo = new InMemoryTransactionRepository();
    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test",
      currency: "usd",
      transactionRepository: repo,
    });

    await billing.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 2900,
      currency: "usd",
      presentmentCurrency: "usd",
      settlementCurrency: "usd",
      fees: calculateFeeBreakdown({ gross: 2900, fee: 114, taxOnFee: 0 }),
      referenceId: "pi_us_1",
    });

    await billing.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 99900,
      currency: "inr",
      presentmentCurrency: "inr",
      settlementCurrency: "inr",
      fees: calculateFeeBreakdown({ gross: 99900, fee: 2360, taxOnFee: 425 }),
      referenceId: "pi_in_1",
    });

    await billing.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 5000,
      currency: "eur",
      presentmentCurrency: "eur",
      settlementCurrency: "usd",
      settlementAmount: 5200,
      exchangeRate: { rate: 1.04, source: "stripe" },
      fees: calculateFeeBreakdown({ gross: 5200, fee: 181, taxOnFee: 0 }),
      providerResponse: { balance_transaction: "txn_fx" },
      referenceId: "pi_eu_1",
    });

    await billing.recordTransaction({
      type: TransactionType.REFUND,
      amount: 1000,
      currency: "usd",
      presentmentCurrency: "usd",
      settlementCurrency: "usd",
      fees: calculateFeeBreakdown({ gross: 1000, fee: 0, taxOnFee: 0 }),
      referenceId: "re_us_1",
    });

    const revenue = await billing.getRevenueByCurrency();
    expect(revenue.byPresentmentCurrency.map((r) => r.currency)).toEqual([
      "eur",
      "inr",
      "usd",
    ]);

    const usdPresentment = revenue.byPresentmentCurrency.find(
      (r) => r.currency === "usd",
    )!;
    // 2900 payment - 1000 refund
    expect(usdPresentment.presentmentTotal).toBe(1900);
    expect(usdPresentment.transactionCount).toBe(2);

    const summary = await billing.getSettlementSummary();
    expect(summary.transactionCount).toBe(4);

    const usdSettlement = summary.bySettlementCurrency.find(
      (r) => r.currency === "usd",
    )!;
    // settlement: 2900-114 net + (5200-181) net - 1000 refund
    expect(usdSettlement.netSettlement).toBe(2786 + 5019 - 1000);
    expect(usdSettlement.feeTotal).toBe(114 + 181);

    const inr = summary.bySettlementCurrency.find((r) => r.currency === "inr")!;
    expect(inr.netSettlement).toBe(99900 - 2360 - 425);
    expect(inr.taxOnFeeTotal).toBe(425);
  });
});
