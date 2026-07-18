/**
 * Stripe — recurring plans (monthly / yearly), subscriptions, customers, metered usage.
 *
 * Requires STRIPE_SECRET_KEY.
 * Optional: STRIPE_PAYMENT_METHOD_ID for attaching a default card.
 */
import { BillingKit, TransactionType } from "../../src";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "usd",
});

async function run(): Promise<void> {
  // Customer + payment method
  const customer = await billing.createCustomer({
    email: "subscriber@example.com",
    name: "Subscriber",
    paymentMethodId: process.env.STRIPE_PAYMENT_METHOD_ID,
  });

  // Monthly plan (Stripe Product + recurring Price)
  const monthly = await billing.createPlan({
    name: "Pro Monthly",
    amount: 2900,
    currency: "usd",
    interval: "monthly",
    description: "Pro plan billed every month",
  });

  // Yearly plan
  const yearly = await billing.createPlan({
    name: "Pro Yearly",
    amount: 29000,
    currency: "usd",
    interval: "yearly",
    description: "Pro plan billed every year",
  });

  // Metered / usage-based price
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
  console.log("paused:", paused.paused);

  const resumed = await billing.resumeSubscription(subscription.id);
  console.log("resumed paused:", resumed.paused);

  // Report usage against a metered subscription item (after subscribing to metered plan)
  if (subscription.subscriptionItemId && metered.usageType === "metered") {
    // typically: createSubscription({ planId: metered.id }) then reportUsage
  }

  const cancelled = await billing.cancelSubscription(subscription.id);
  console.log("cancelAtPeriodEnd:", cancelled.cancelAtPeriodEnd);

  // Hosted Stripe invoice (provider invoice id from webhooks / Dashboard)
  if (process.env.STRIPE_INVOICE_ID) {
    const invoice = await billing.retrieveProviderInvoice(process.env.STRIPE_INVOICE_ID);
    console.log("hosted invoice:", invoice.hostedInvoiceUrl);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
