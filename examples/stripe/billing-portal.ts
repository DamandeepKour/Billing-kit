import { BillingKit } from "../../src";

/**
 * Self-serve account billing with Stripe Customer Portal.
 *
 * Configure portal features in the Stripe Dashboard:
 * https://dashboard.stripe.com/settings/billing/portal
 */
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

async function run(): Promise<void> {
  const customerId = process.env.STRIPE_CUSTOMER_ID ?? "cus_xxx";

  // Full account portal (invoices, subscriptions, payment methods)
  const portal = await billing.createBillingPortalSession({
    customerId,
    returnUrl: "https://app.example.com/account/billing",
  });
  console.log("Open portal:", portal.url);

  // Deep-link into payment method update only
  const updatePm = await billing.createPaymentMethodUpdateSession({
    customerId,
    returnUrl: "https://app.example.com/account/billing",
  });
  console.log("Update payment method:", updatePm.url);

  const subscriptions = await billing.listActiveSubscriptions(customerId);
  console.log(
    "Active subscriptions:",
    subscriptions.map((item) => ({ id: item.id, status: item.status })),
  );

  const invoices = await billing.listCustomerInvoices({
    customerId,
    limit: 5,
  });
  console.log(
    "Recent invoices:",
    invoices.map((item) => ({
      id: item.id,
      status: item.status,
      hostedInvoiceUrl: item.hostedInvoiceUrl,
    })),
  );

  const methods = await billing.listPaymentMethods({ customerId });
  console.log(
    "Payment methods:",
    methods.map((item) => ({
      id: item.id,
      brand: item.brand,
      last4: item.last4,
      isDefault: item.isDefault,
    })),
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
