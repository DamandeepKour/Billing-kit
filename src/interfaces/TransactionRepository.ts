import type { Transaction } from "../types/transaction";
import type { ReportingFilter } from "../types/settlement";

export interface TransactionRepository {
  save(transaction: Transaction): Promise<Transaction>;
  findById(id: string): Promise<Transaction | null>;
  /** List transactions for reporting (optional filters). */
  list(filter?: ReportingFilter): Promise<Transaction[]>;
}
