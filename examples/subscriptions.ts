/**
 * Subscription + invoice flow (Stripe or Razorpay).
 *
 * Typical billing loop:
 *   1. createPlan
 *   2. createSubscription
 *   3. handle invoice.paid / subscription.* via webhooks
 *   4. cancelSubscription or renewSubscription as needed
 *
 * Pair with examples/stripe-webhooks.ts or examples/razorpay-webhooks.ts.
 */
import { BillingKit, TransactionType } from "../src";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
});

async function run(): Promise<void> {
  // 1. Create a recurring plan
  const plan = await billing.createPlan({
    name: "Pro Monthly",
    amount: 99900,
    interval: "monthly",
    description: "Pro plan billed every month",
  });

  // 2. Start a subscription (Stripe customer / Razorpay customer id)
  const subscription = await billing.createSubscription({
    customerId: process.env.CUSTOMER_ID ?? "cus_xxx",
    planId: plan.id,
    trialDays: 14,
    metadata: { planName: plan.name },
  });

  await billing.recordTransaction({
    type: TransactionType.SUBSCRIPTION,
    amount: plan.amount,
    currency: plan.currency,
    referenceId: subscription.id,
    metadata: { planId: plan.id, status: subscription.status },
  });

  // 3. Local invoice (your app catalog) — generate, retrieve, PDF
  const invoice = await billing.generateInvoice({
    customer: { name: "John Doe", email: "john@example.com", id: subscription.customerId },
    billingAddress: {
      line1: "42 MG Road",
      city: "Mumbai",
      state: "MH",
      postalCode: "400001",
      country: "IN",
    },
    lineItems: [
      {
        description: `${plan.name} — first cycle`,
        quantity: 1,
        unitAmount: plan.amount,
      },
    ],
    notes: `Subscription ${subscription.id}`,
  });

  const summary = await billing.getInvoiceSummary(invoice.id);
  const stored = await billing.getInvoice(invoice.id);
  const pdf = await billing.generateInvoicePdf({ invoice });

  console.log({
    planId: plan.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    periodEnd: subscription.currentPeriodEnd,
    invoiceId: invoice.id,
    invoiceTotal: summary.total,
    retrieved: stored?.number,
    pdfBytes: pdf.length,
  });

  // 4. Cancel at period end (Stripe: cancel_at_period_end = true)
  const cancelled = await billing.cancelSubscription(subscription.id);
  console.log("cancelAtPeriodEnd:", cancelled.cancelAtPeriodEnd);

  // 5. Undo cancel / keep billing (renew)
  const renewed = await billing.renewSubscription(subscription.id);
  console.log("renewed cancelAtPeriodEnd:", renewed.cancelAtPeriodEnd);

  await billing.recordTransaction({
    type: TransactionType.RENEWAL,
    amount: plan.amount,
    currency: plan.currency,
    referenceId: renewed.id,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
