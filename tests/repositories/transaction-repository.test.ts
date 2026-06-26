import { InMemoryTransactionRepository } from "../../src/repositories";
import { TransactionType } from "../../src/types/transaction";

describe("InMemoryTransactionRepository", () => {
  const repository = new InMemoryTransactionRepository();

  it("saves and finds transaction by id", async () => {
    const txn = {
      id: "txn_test",
      type: TransactionType.PAYMENT,
      amount: 5000,
      currency: "inr",
      referenceId: "pay_123",
      createdAt: new Date(),
    };

    await repository.save(txn);
    const found = await repository.findById("txn_test");

    expect(found).toEqual(txn);
  });

  it("returns null for unknown id", async () => {
    expect(await repository.findById("missing")).toBeNull();
  });
});
