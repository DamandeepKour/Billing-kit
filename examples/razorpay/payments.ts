import { BillingKit, TransactionType } from "../../src";
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  currency: "inr",
});
async function run(): Promise<void> {
  const order = await billing.createOrder({
    amount: 99900,
    receipt: `rcpt_${Date.now()}`,
    notes: { orderId: "order_1001" },
  });
  console.log("order:", order.id, order.status);
  const paymentId = process.env.RAZORPAY_PAYMENT_ID;
  const signature = process.env.RAZORPAY_PAYMENT_SIGNATURE;
  if (paymentId && signature) {
    const ok = billing.verifyPaymentSignature({
      orderId: order.id,
      paymentId,
      signature,
    });
    console.log("signature valid:", ok);
    if (ok) {
      const payment = await billing.fetchPayment(paymentId);
      console.log("payment:", payment.id, payment.status);
      if (payment.status === "authorized") {
        const captured = await billing.capturePayment({
          paymentId,
          amount: order.amount,
        });
        console.log("captured:", captured.status);
      }
      const refund = await billing.refundPayment({
        paymentId,
        amount: 20000,
      });
      const fetchedRefund = await billing.fetchRefund(refund.id);
      await billing.recordTransaction({
        type: TransactionType.REFUND,
        amount: fetchedRefund.amount,
        currency: "inr",
        referenceId: fetchedRefund.id,
        metadata: { paymentId },
      });
      console.log("refund:", fetchedRefund.id, fetchedRefund.status);
    }
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
