import type { TransactionRepository } from "../interfaces/TransactionRepository";
import type {
  RecordTransactionInput,
  Transaction,
} from "../types/transaction";
import { TransactionNotFoundError } from "../utils/errors";
import { generateId } from "../utils/id";

export class TransactionService {
  constructor(private readonly repository: TransactionRepository) {}

  async recordTransaction(input: RecordTransactionInput): Promise<Transaction> {
    const transaction: Transaction = {
      id: generateId("txn"),
      ...input,
      createdAt: new Date(),
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
}
