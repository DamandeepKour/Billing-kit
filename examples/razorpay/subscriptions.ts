import { BillingKit, TransactionType } from "../../src";
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  currency: "inr",
});
async function run(): Promise<void> {
  const plan = await billing.createPlan({
    name: "Pro Monthly",
    amount: 99900,
    interval: "monthly",
    description: "Pro plan billed every month",
  });
  const subscription = await billing.createSubscription({
    customerId: process.env.RAZORPAY_CUSTOMER_ID ?? "cust_xxx",
    planId: plan.id,
  });
  await billing.recordTransaction({
    type: TransactionType.SUBSCRIPTION,
    amount: plan.amount,
    currency: plan.currency,
    referenceId: subscription.id,
    metadata: { planId: plan.id },
  });
  console.log("subscription:", subscription.id, subscription.status);
  const paused = await billing.pauseSubscription({
    subscriptionId: subscription.id,
  });
  console.log("paused:", paused.status);
  const resumed = await billing.resumeSubscription(subscription.id);
  console.log("resumed:", resumed.status);
  const scheduled = await billing.scheduleCancellation(subscription.id);
  console.log("scheduled cancelAtPeriodEnd:", scheduled.cancelAtPeriodEnd);
  const cancelled = await billing.cancelSubscription(subscription.id);
  console.log("cancelled:", cancelled.status);
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
