/**
 * Razorpay — create order, capture, refund.
 *
 * Requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
 */
import { BillingKit, TransactionType } from "../../src";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  currency: "inr",
});

async function run(): Promise<void> {
  const order = await billing.createPayment({
    amount: 99900,
    orderId: `rcpt_${Date.now()}`,
    description: "Pro plan",
    metadata: { orderId: "order_1001" },
  });

  console.log("order:", order.id, order.status);

  // After client checkout, capture the payment id from Razorpay
  const paymentId = process.env.RAZORPAY_PAYMENT_ID;
  if (paymentId) {
    const captured = await billing.capturePayment({
      paymentId,
      amount: 99900,
    });
    console.log("captured:", captured.status);

    const refund = await billing.refundPayment({
      paymentId,
      amount: 20000,
    });

    await billing.recordTransaction({
      type: TransactionType.REFUND,
      amount: refund.amount,
      currency: "inr",
      referenceId: refund.id,
      metadata: { paymentId },
    });

    console.log("refund:", refund.id, refund.status);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
