import { BillingKit, TransactionType } from "../../src";
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
});
async function run(): Promise<void> {
  const payment = await billing.createPayment({
    amount: 99900,
    customerId: process.env.STRIPE_CUSTOMER_ID,
    description: "Pro plan",
    metadata: { orderId: "order_1001" },
  });
  console.log("created:", payment.id, payment.status);
  if (payment.status === "authorized" || payment.status === "pending") {
    const captured = await billing.capturePayment({
      paymentId: payment.id,
      amount: payment.amount,
    });
    console.log("captured:", captured.status);
  }
  const status = await billing.getPaymentStatus(payment.id);
  console.log("status:", status.status);
  const refund = await billing.refundPayment({
    paymentId: payment.id,
    amount: 20000,
    reason: "requested_by_customer",
  });
  await billing.recordTransaction({
    type: TransactionType.REFUND,
    amount: refund.amount,
    currency: payment.currency,
    referenceId: refund.id,
    metadata: { paymentId: payment.id },
  });
  console.log("refund:", refund.id, refund.status);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
