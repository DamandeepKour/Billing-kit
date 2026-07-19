import type { TransactionRepository } from "../../interfaces/TransactionRepository";
import type { ReportingFilter } from "../../types/settlement";
import type { Transaction } from "../../types/transaction";
export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly store = new Map<string, Transaction>();
  async save(transaction: Transaction): Promise<Transaction> {
    this.store.set(transaction.id, transaction);
    return transaction;
  }
  async findById(id: string): Promise<Transaction | null> {
    return this.store.get(id) ?? null;
  }
  async list(filter?: ReportingFilter): Promise<Transaction[]> {
    let rows = [...this.store.values()];
    if (filter?.from) {
      const from = filter.from;
      rows = rows.filter((t) => t.createdAt >= from);
    }
    if (filter?.to) {
      const to = filter.to;
      rows = rows.filter((t) => t.createdAt <= to);
    }
    if (filter?.types?.length) {
      const types = new Set(filter.types);
      rows = rows.filter((t) => types.has(t.type));
    }
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
