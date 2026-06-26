import { BillingKit } from "../../src/core/BillingKit";
import type { InvoiceRepository } from "../../src/interfaces/InvoiceRepository";
import type { TransactionRepository } from "../../src/interfaces/TransactionRepository";
import type { Invoice } from "../../src/types/invoice";
import { TransactionType } from "../../src/types/transaction";
import type { Transaction } from "../../src/types/transaction";

/** Simulates a consumer's Postgres-backed repository. */
class PostgresInvoiceRepository implements InvoiceRepository {
  private readonly rows: Invoice[] = [];

  async save(invoice: Invoice): Promise<Invoice> {
    this.rows.push(invoice);
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

class PostgresTransactionRepository implements TransactionRepository {
  private readonly rows: Transaction[] = [];

  async save(transaction: Transaction): Promise<Transaction> {
    this.rows.push(transaction);
    return transaction;
  }

  async findById(id: string): Promise<Transaction | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }
}

describe("BillingKit with custom repositories", () => {
  it("persists invoices and transactions through injected repos", async () => {
    const invoiceRepo = new PostgresInvoiceRepository();
    const transactionRepo = new PostgresTransactionRepository();

    const billing = new BillingKit({
      provider: "stripe",
      secretKey: "sk_test_x",
      tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
      invoiceRepository: invoiceRepo,
      transactionRepository: transactionRepo,
    });

    const invoice = await billing.generateInvoice({
      customer: { name: "Alice" },
      billingAddress: {
        line1: "10 Park Lane",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      },
      lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
    });

    const txn = await billing.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: invoice.total,
      currency: "inr",
      referenceId: invoice.id,
    });

    expect(await invoiceRepo.findById(invoice.id)).not.toBeNull();
    expect(await transactionRepo.findById(txn.id)).not.toBeNull();
    expect((await billing.getTransaction(txn.id)).referenceId).toBe(invoice.id);
  });
});
