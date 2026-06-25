import { TransactionService } from "../src/transaction";
import { TransactionType } from "../src/types/transaction";
import { TransactionNotFoundError } from "../src/utils/errors";

describe("TransactionService", () => {
  const service = new TransactionService();

  it("records and retrieves a transaction", () => {
    const txn = service.recordTransaction({
      type: TransactionType.PAYMENT,
      amount: 5000,
      currency: "inr",
      referenceId: "pay_123",
    });

    expect(txn.id).toMatch(/^txn_/);
    expect(service.getTransaction(txn.id).referenceId).toBe("pay_123");
  });

  it("throws when transaction not found", () => {
    expect(() => service.getTransaction("missing")).toThrow(TransactionNotFoundError);
  });
});
