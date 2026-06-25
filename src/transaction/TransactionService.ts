import type {
  RecordTransactionInput,
  Transaction,
} from "../types/transaction";
import { TransactionNotFoundError } from "../utils/errors";
import { generateId } from "../utils/id";

export class TransactionService {
  private readonly store = new Map<string, Transaction>();

  recordTransaction(input: RecordTransactionInput): Transaction {
    const transaction: Transaction = {
      id: generateId("txn"),
      ...input,
      createdAt: new Date(),
    };

    this.store.set(transaction.id, transaction);
    return transaction;
  }

  getTransaction(id: string): Transaction {
    const transaction = this.store.get(id);
    if (!transaction) {
      throw new TransactionNotFoundError(id);
    }
    return transaction;
  }

  listTransactions(): Transaction[] {
    return Array.from(this.store.values());
  }
}
