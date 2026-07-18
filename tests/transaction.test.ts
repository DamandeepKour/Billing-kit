import { InMemoryTransactionRepository } from "../src/repositories";
import { TransactionService } from "../src/transaction";
import { TransactionType } from "../src/types/transaction";
import { TransactionNotFoundError } from "../src/utils/errors";

describe("TransactionService", () => {
  const service = new TransactionService(new InMemoryTransactionRepository());

  it("records and retrieves a transaction", async () => {
    const txn = await service.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 5000,
      currency: "inr",
      referenceId: "pay_123",
    });

    expect(txn.id).toMatch(/^txn_/);
    expect(txn.presentmentCurrency).toBe("inr");
    expect(txn.settlementCurrency).toBe("inr");
    expect((await service.getTransaction(txn.id)).referenceId).toBe("pay_123");
  });

  it("throws when transaction not found", async () => {
    await expect(service.getTransaction("missing")).rejects.toThrow(
      TransactionNotFoundError,
    );
  });
});
