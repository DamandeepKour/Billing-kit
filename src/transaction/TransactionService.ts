import type { TransactionRepository } from "../interfaces/TransactionRepository";
import type {
  ReportingFilter,
  RevenueByCurrencyRow,
  SettlementSummary,
} from "../types/settlement";
import type {
  RecordTransactionInput,
  Transaction,
} from "../types/transaction";
import { TransactionStatus } from "../types/transaction";
import { TransactionNotFoundError } from "../utils/errors";
import { generateId } from "../utils/id";
import { normalizeCurrency } from "../utils/currency";
import { normalizeSettlementFields } from "../utils/settlement";

function emptyBucket(currency: string): RevenueByCurrencyRow {
  return {
    currency,
    presentmentTotal: 0,
    settlementTotal: 0,
    feeTotal: 0,
    taxOnFeeTotal: 0,
    netSettlement: 0,
    transactionCount: 0,
  };
}

function signForType(type: string): number {
  if (type === "REFUND" || type === "CHARGEBACK") return -1;
  return 1;
}

export class TransactionService {
  constructor(private readonly repository: TransactionRepository) {}

  async recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
    const settlement = normalizeSettlementFields({
      amount: input.amount,
      currency: normalizeCurrency(input.currency),
      presentmentCurrency: input.presentmentCurrency,
      settlementCurrency: input.settlementCurrency,
      presentmentAmount: input.presentmentAmount,
      settlementAmount: input.settlementAmount,
      exchangeRate: input.exchangeRate,
      fees: input.fees,
      providerResponse: input.providerResponse,
    });

    const transaction: Transaction = {
      id: generateId("txn"),
      type: input.type,
      amount: settlement.presentmentAmount,
      currency: settlement.presentmentCurrency,
      referenceId: input.referenceId,
      metadata: input.metadata,
      status: input.status ?? TransactionStatus.SUCCESS,
      createdAt: new Date(),
      ...settlement,
    };

    return this.repository.save(transaction);
  }

  async getTransaction(id: string): Promise<Transaction> {
    const transaction = await this.repository.findById(id);
    if (!transaction) {
      throw new TransactionNotFoundError(id);
    }
    return transaction;
  }

  /** Revenue / volume grouped by presentment and settlement currency. */
  async getRevenueByCurrency(
    filter?: ReportingFilter,
  ): Promise<{
    byPresentmentCurrency: RevenueByCurrencyRow[];
    bySettlementCurrency: RevenueByCurrencyRow[];
  }> {
    const summary = await this.getSettlementSummary(filter);
    return {
      byPresentmentCurrency: summary.byPresentmentCurrency,
      bySettlementCurrency: summary.bySettlementCurrency,
    };
  }

  /**
   * Settlement report: gross, fees, tax on fee, and net by presentment and
   * settlement currency (refunds/chargebacks reduce totals).
   */
  async getSettlementSummary(filter?: ReportingFilter): Promise<SettlementSummary> {
    const transactions = await this.repository.list(filter);
    const byPresentment = new Map<string, RevenueByCurrencyRow>();
    const bySettlement = new Map<string, RevenueByCurrencyRow>();

    for (const txn of transactions) {
      const sign = signForType(txn.type);
      const presentmentCurrency = normalizeCurrency(
        txn.presentmentCurrency ?? txn.currency,
      );
      const settlementCurrency = normalizeCurrency(
        txn.settlementCurrency ?? txn.currency,
      );
      const presentmentAmount =
        (txn.presentmentAmount ?? txn.amount) * sign;
      const settlementAmount =
        (txn.settlementAmount ?? txn.fees?.net ?? txn.amount) * sign;
      const fee = (txn.fees?.fee ?? 0) * (sign > 0 ? 1 : -1);
      const taxOnFee = (txn.fees?.taxOnFee ?? 0) * (sign > 0 ? 1 : -1);
      const net =
        (txn.fees?.net ?? txn.settlementAmount ?? txn.amount) * sign;

      const p = byPresentment.get(presentmentCurrency) ?? emptyBucket(presentmentCurrency);
      p.presentmentTotal += presentmentAmount;
      p.settlementTotal += settlementAmount;
      p.feeTotal += fee;
      p.taxOnFeeTotal += taxOnFee;
      p.netSettlement += net;
      p.transactionCount += 1;
      byPresentment.set(presentmentCurrency, p);

      const s = bySettlement.get(settlementCurrency) ?? emptyBucket(settlementCurrency);
      s.presentmentTotal += presentmentAmount;
      s.settlementTotal += settlementAmount;
      s.feeTotal += fee;
      s.taxOnFeeTotal += taxOnFee;
      s.netSettlement += net;
      s.transactionCount += 1;
      bySettlement.set(settlementCurrency, s);
    }

    const sortRows = (rows: RevenueByCurrencyRow[]) =>
      [...rows].sort((a, b) => a.currency.localeCompare(b.currency));

    return {
      from: filter?.from,
      to: filter?.to,
      byPresentmentCurrency: sortRows([...byPresentment.values()]),
      bySettlementCurrency: sortRows([...bySettlement.values()]),
      transactionCount: transactions.length,
    };
  }
}
