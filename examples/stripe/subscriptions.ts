/**
 * Stripe — plan + subscription lifecycle.
 *
 * Requires STRIPE_SECRET_KEY and STRIPE_CUSTOMER_ID.
 * Recurring charges arrive via webhooks (see ./webhooks.ts).
 */
import { BillingKit, TransactionType } from "../../src";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
    customerId: process.env.STRIPE_CUSTOMER_ID ?? "cus_xxx",
    planId: plan.id,
    trialDays: 14,
  });

  await billing.recordTransaction({
    type: TransactionType.SUBSCRIPTION,
    amount: plan.amount,
    currency: plan.currency,
    referenceId: subscription.id,
    metadata: { planId: plan.id },
  });

  console.log("subscription:", subscription.id, subscription.status);

  const cancelled = await billing.cancelSubscription(subscription.id);
  console.log("cancelAtPeriodEnd:", cancelled.cancelAtPeriodEnd);

  const renewed = await billing.renewSubscription(subscription.id);
  console.log("renewed:", renewed.cancelAtPeriodEnd);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
