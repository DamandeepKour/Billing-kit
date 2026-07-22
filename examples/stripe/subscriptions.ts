import { BillingKit, TransactionType } from "../../src";
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "usd",
});
async function run(): Promise<void> {
  const customer = await billing.createCustomer({
    email: "subscriber@example.com",
    name: "Subscriber",
    paymentMethodId: process.env.STRIPE_PAYMENT_METHOD_ID,
  });
  const monthly = await billing.createPlan({
    name: "Pro Monthly",
    amount: 2900,
    currency: "usd",
    interval: "monthly",
    description: "Pro plan billed every month",
  });
  const yearly = await billing.createPlan({
    name: "Pro Yearly",
    amount: 29000,
    currency: "usd",
    interval: "yearly",
    description: "Pro plan billed every year",
  });
  const metered = await billing.createPlan({
    name: "API Calls",
    amount: 1,
    currency: "usd",
    interval: "monthly",
    usageType: "metered",
    aggregateUsage: "sum",
  });
  const subscription = await billing.createSubscription({
    customerId: customer.id,
    planId: monthly.id,
    trialDays: 14,
    defaultPaymentMethodId: process.env.STRIPE_PAYMENT_METHOD_ID,
  });
  await billing.recordTransaction({
    type: TransactionType.SUBSCRIPTION,
    amount: monthly.amount,
    currency: monthly.currency,
    referenceId: subscription.id,
    metadata: { planId: monthly.id, yearlyPlanId: yearly.id, meteredPlanId: metered.id },
  });
  console.log("subscription:", subscription.id, subscription.status);
  const retrieved = await billing.retrieveSubscription(subscription.id);
  console.log("retrieved status:", retrieved.status);
  const paused = await billing.pauseSubscription({
    subscriptionId: subscription.id,
    behavior: "mark_uncollectible",
  });
  console.log("paused:", paused.paused, paused.status);
  const resumed = await billing.resumeSubscription(subscription.id);
  console.log("resumed:", resumed.status, "paused:", resumed.paused);
  if (subscription.subscriptionItemId && metered.usageType === "metered") {
  }
  const scheduled = await billing.scheduleCancellation(subscription.id);
  console.log("scheduled cancelAtPeriodEnd:", scheduled.cancelAtPeriodEnd);
  const cancelled = await billing.cancelSubscription(subscription.id);
  console.log("cancelled:", cancelled.status);
  if (process.env.STRIPE_INVOICE_ID) {
    const invoice = await billing.retrieveProviderInvoice(process.env.STRIPE_INVOICE_ID);
    console.log("hosted invoice:", invoice.hostedInvoiceUrl);
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
