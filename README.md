# billing-kit

Node.js billing SDK for invoices, tax, payments, refunds, subscriptions, webhooks, and PDF generation.

```bash
npm install billing-kit
```

## Features

- Invoice generation with line items, discounts, tax, and PDF export
- Payments — create, capture, cancel, status
- Refunds — full and partial
- Subscriptions — plans, create, pause / resume, cancel, scheduleCancellation, renew; lifecycle states for Stripe + Razorpay
- Billing portal — Stripe Customer Portal sessions, customer invoices/subscriptions, payment method update flows
- Observability — structured logger, success/failure hooks, request/webhook IDs, durations on audits
- Webhooks — raw-body signature verification + normalized event types (Stripe / Razorpay)
- Webhook testing — mock payloads, local signature helpers, localhost/staging fixtures
- Tax engine — GST / VAT / sales tax with `autoTax`, place of supply, and tax line breakdowns
- Coupons & promotion codes — amountOff / percentOff, duration, usage limits, checkout apply/remove
- Customer billing profiles — reusable tax IDs, address, currency, saved payment methods
- Marketplace routing — idempotent splits, transfers, reversals, and reconciliation (Razorpay Route)
- Audit trail — invoice, payment, refund, tax, and webhook event timelines
- Usage billing — event recording, daily/monthly/cycle aggregation, per-unit and tiered pricing
- Feature entitlements — plan mappings, provisioning, access checks, and lifecycle revocation
- Transactions — record payment, refund, subscription, renewal, chargeback events
- Pluggable storage — inject your own invoice / transaction repositories
- Multi-currency — presentment vs settlement, FX metadata, fee/net reporting (`inr`, `usd`, `eur`, `gbp`, `aed`, `sgd`)
- Retry / dunning — failed payment & invoice recovery with policy, grace period, and hooks

## Supported providers

| Provider | Config | Notes |
|----------|--------|--------|
| **Stripe** | `provider: "stripe"`, `secretKey` | PaymentIntents, Prices/subscriptions, customers, hosted invoices, metered usage, refunds, webhooks |
| **Razorpay** | `provider: "razorpay"`, `keyId`, `secretKey` | Orders, payment signature, captures, plans, subscriptions, refunds, Route transfers, raw-body webhooks |

```typescript
import { BillingKit } from "billing-kit";

// Stripe
const stripe = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
});

// Razorpay
const razorpay = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
});
```

## Usage

```typescript
const tax = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});

const invoice = await billing.generateInvoice({
  customer: { name: "John Doe" },
  billingAddress: {
    line1: "42 MG Road",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
  lineItems: [{ description: "Pro Plan", quantity: 1, unitAmount: 99900 }],
});

const pdf = await billing.generateInvoicePdf({ invoice });
const payment = await billing.createPayment({ amount: invoice.total });
await billing.refundPayment({ paymentId: payment.id });
```

Amounts are in the smallest currency unit (paise / cents). `99900` = ₹999.00.

## Multi-currency

Supported ISO codes: `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd`.

Resolution order for invoices and payments:

1. Explicit `currency` on the call
2. `customer.defaultCurrency` (invoices)
3. Global `BillingKit` config `currency`
4. Fallback: `inr`

```typescript
import {
  BillingKit,
  formatAmount,
  toMinorUnits,
  convertSmallestUnit,
} from "billing-kit";

// Global default
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Helpers
toMinorUnits(49, "usd");        // 4900
convertSmallestUnit(4900, "usd"); // 49
formatAmount(4900, "usd");      // "$49.00"

// Invoice override (Stripe multi-currency invoices)
const usdInvoice = await billing.generateInvoice({
  currency: "usd",
  customer: { name: "Acme Inc", defaultCurrency: "usd" },
  billingAddress: {
    line1: "1 Market St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  },
  lineItems: [
    { description: "Pro Plan", quantity: 1, unitAmount: 4900, currency: "usd" },
  ],
});

// Payment in a different currency
const payment = await billing.createPayment({
  amount: toMinorUnits(999, "inr"),
  currency: "inr",
  customerId: "cus_xxx",
});

// Razorpay (same API — currency on config or payment)
const razorpay = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  currency: "inr",
});

await razorpay.createPayment({ amount: 99900, currency: "inr" });
```

Line items that set `currency` must match the invoice currency, or `CurrencyMismatchError` is thrown.

### Presentment vs settlement (global billing)

Stripe distinguishes the **presentment** currency (what the customer pays) from the **settlement** currency (what lands in your balance). Record both on transactions, plus fee breakdown and FX metadata:

```typescript
import {
  BillingKit,
  TransactionType,
  calculateFeeBreakdown,
} from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Customer paid €50.00; settled to USD balance after Stripe fees
const fees = calculateFeeBreakdown({
  gross: 5200, // $52.00 settlement gross
  fee: 181,
  taxOnFee: 0,
});

await billing.recordTransaction({
  type: TransactionType.PAYMENT,
  amount: 5000,
  currency: "eur",
  presentmentCurrency: "eur",
  presentmentAmount: 5000,
  settlementCurrency: "usd",
  settlementAmount: fees.net,
  exchangeRate: {
    rate: 1.04,
    source: "stripe",
    asOf: new Date().toISOString(),
  },
  fees,
  providerResponse: {
    balance_transaction: "txn_xxx",
    exchange_rate: 1.04,
  },
  referenceId: "pi_xxx",
});

// Reporting
const revenue = await billing.getRevenueByCurrency();
// revenue.byPresentmentCurrency / revenue.bySettlementCurrency

const settlement = await billing.getSettlementSummary();
// settlement.bySettlementCurrency[].netSettlement, feeTotal, taxOnFeeTotal
```

Invoices accept the same optional fields (`presentmentCurrency`, `settlementCurrency`, `exchangeRate`, `fees`, `providerResponse`).

## Subscriptions

Create a recurring plan (Stripe Price / Razorpay Plan), subscribe a customer, then cancel, renew, pause, or resume. Recurring charges and `invoice.paid` events usually arrive via webhooks — see [Webhook verification](#webhook-verification).

### Monthly and yearly plans (Stripe)

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Monthly — creates a Stripe Product + recurring Price (interval: month)
const monthly = await billing.createPlan({
  name: "Pro Monthly",
  amount: 2900, // $29.00
  currency: "usd",
  interval: "monthly",
});

// Yearly — recurring Price with interval: year
const yearly = await billing.createPlan({
  name: "Pro Yearly",
  amount: 29000, // $290.00
  currency: "usd",
  interval: "yearly",
});

const customer = await billing.createCustomer({
  email: "user@example.com",
  name: "Jane Doe",
  paymentMethodId: "pm_xxx", // optional — attach + set as default
});

const subscription = await billing.createSubscription({
  customerId: customer.id,
  planId: monthly.id, // or yearly.id
  trialDays: 14,
  defaultPaymentMethodId: "pm_xxx",
});

await billing.retrieveSubscription(subscription.id);
await billing.pauseSubscription({ subscriptionId: subscription.id });
await billing.resumeSubscription(subscription.id);
await billing.scheduleCancellation(subscription.id); // cancel at period end
await billing.renewSubscription(subscription.id);    // clear cancel-at-period-end
await billing.cancelSubscription(subscription.id);   // cancel immediately
```

### Metered / usage-based billing (Stripe)

```typescript
const metered = await billing.createPlan({
  name: "API Calls",
  amount: 1, // $0.01 per unit
  currency: "usd",
  interval: "monthly",
  usageType: "metered",
  aggregateUsage: "sum",
});

const sub = await billing.createSubscription({
  customerId: customer.id,
  planId: metered.id,
});

await billing.reportUsage({
  subscriptionItemId: sub.subscriptionItemId!,
  quantity: 500,
  action: "increment",
});
```

### Provider-agnostic usage billing

Record local meter events for Stripe, Razorpay, or offline billing. This API is separate from Stripe's provider-side `reportUsage`.

```typescript
await billing.recordUsageEvent({
  customerId: "cus_123",
  subscriptionId: "sub_123",
  meter: "api_calls",
  quantity: 500,
  timestamp: new Date(),
});

const daily = await billing.aggregateUsage({
  customerId: "cus_123",
  meter: "api_calls",
  period: "day", // day | month | billing_cycle
  from: new Date("2026-07-01T00:00:00Z"),
  to: new Date("2026-08-01T00:00:00Z"),
});

const result = await billing.generateUsageInvoice({
  usage: {
    customerId: "cus_123",
    meter: "api_calls",
    period: "billing_cycle",
    from: new Date("2026-07-01T00:00:00Z"),
    to: new Date("2026-08-01T00:00:00Z"),
  },
  prices: [{
    type: "tiered", // per_unit | metered | tiered
    meter: "api_calls",
    currency: "usd",
    tiers: [
      { upTo: 10000, unitAmount: 2 },
      { upTo: "inf", unitAmount: 1 },
    ],
  }],
  customer: { id: "cus_123", name: "Acme" },
  billingAddress,
  currency: "usd",
});

console.log(result.aggregates, result.lineItems, result.invoice.total);
```

Aggregation supports `sum`, `max`, and `last`. Billing-cycle aggregation requires explicit `from` and `to` boundaries. Amounts are in the currency's smallest unit.

### Hosted Stripe invoices

```typescript
// Provider invoice (Stripe), not a local billing-kit invoice
const invoice = await billing.retrieveProviderInvoice("in_xxx");
console.log(invoice.hostedInvoiceUrl); // customer-facing hosted page
console.log(invoice.invoicePdfUrl);

const invoices = await billing.listCustomerInvoices({
  customerId: "cus_xxx",
  status: "paid",
});
```

### Self-serve account billing (Stripe Customer Portal)

Give customers a Stripe-hosted UI to manage payment methods, invoices, and subscriptions. Enable features in the [Customer portal settings](https://dashboard.stripe.com/settings/billing/portal), then create a short-lived session and redirect.

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
});

// Full portal homepage
const portal = await billing.createBillingPortalSession({
  customerId: "cus_xxx",
  returnUrl: "https://app.example.com/account/billing",
});
// redirect the browser to portal.url

// Payment method update deep-link
const updateCard = await billing.createPaymentMethodUpdateSession({
  customerId: "cus_xxx",
  returnUrl: "https://app.example.com/account/billing",
});

const active = await billing.listActiveSubscriptions("cus_xxx");
const methods = await billing.listPaymentMethods({ customerId: "cus_xxx" });
await billing.setDefaultPaymentMethod({
  customerId: "cus_xxx",
  paymentMethodId: methods[0].id,
});
// await billing.detachPaymentMethod({ paymentMethodId: "pm_xxx" });
```

| Method | Behavior |
|--------|----------|
| `createBillingPortalSession` | Stripe Customer Portal session URL (optional `flow` deep-links) |
| `createPaymentMethodUpdateSession` | Portal session opened on payment method update |
| `listCustomerInvoices` | Provider invoices for a customer |
| `listActiveSubscriptions` / `listCustomerSubscriptions` | Subscriptions for a customer |
| `listPaymentMethods` / `detachPaymentMethod` | Saved cards and removal |
| `attachPaymentMethod` / `setDefaultPaymentMethod` | Programmatic payment method update without the portal |

Full example: [`examples/stripe/billing-portal.ts`](./examples/stripe/billing-portal.ts)

### Plan features and entitlements

Map provider plans to application features and check access without calling the provider on each request.

```typescript
await billing.setPlanFeatures({
  planId: "price_pro",
  features: ["exports", "sso", "audit_logs"],
});

// Or attach the mapping while creating a plan:
const plan = await billing.createPlan({
  name: "Pro",
  amount: 4900,
  currency: "usd",
  interval: "monthly",
  features: ["exports", "sso"],
});

const subscription = await billing.createSubscription({
  customerId: "cus_123",
  planId: plan.id,
});

if (await billing.hasFeature("cus_123", "sso")) {
  // allow access
}
```

Subscription creation, cancellation, renewal, pause/resume, retrieval, payment failures, recoveries, and idempotent webhook processing synchronize local entitlements. Access is the union of active subscriptions; revoking one subscription does not remove features granted by another.

```typescript
await billing.revokeFeatureAccess({
  subscriptionId: subscription.id,
  reason: "manual compliance hold",
});

const access = await billing.getCustomerFeatureAccess("cus_123");
// access.features, access.entitlements
```

### Shared subscription API

```typescript
// Plan (monthly | quarterly | yearly)
const plan = await billing.createPlan({
  name: "Pro Monthly",
  amount: 99900,
  interval: "monthly",
  description: "Pro plan billed every month",
});

// Subscribe
const subscription = await billing.createSubscription({
  customerId: "cus_xxx", // Stripe Customer / Razorpay customer id
  planId: plan.id,
  trialDays: 14,
});

// Cancel at period / cycle end
const scheduled = await billing.scheduleCancellation(subscription.id);
// scheduled.cancelAtPeriodEnd === true

// Clear a scheduled cancellation
const renewed = await billing.renewSubscription(subscription.id);
// renewed.cancelAtPeriodEnd === false

// Or cancel immediately
const cancelled = await billing.cancelSubscription(subscription.id);
```

| Method | Behavior |
|--------|----------|
| `createPlan` | Creates a recurring price/plan (`usageType: "metered"` for usage billing on Stripe) |
| `createSubscription` | Starts billing for a customer on that plan |
| `pauseSubscription` | Pause billing (Stripe `pause_collection`; Razorpay pause — active only) |
| `resumeSubscription` | Resume a paused subscription |
| `scheduleCancellation` | Cancel at period / cycle end |
| `cancelSubscription` | Cancel immediately |
| `renewSubscription` | Clears a scheduled cancellation so billing continues |
| `retrieveSubscription` | Fetch current subscription + canonical status |
| `createCustomer` | Stripe only — create Customer |
| `attachPaymentMethod` / `setDefaultPaymentMethod` | Stripe only |
| `retrieveProviderInvoice` | Stripe only — hosted invoice URL + PDF |
| `reportUsage` | Stripe only — metered usage records |

Subscription results expose a canonical `status` (`active` | `paused` | `cancelled` | `past_due` | `pending`) plus optional `providerStatus` for the raw Stripe/Razorpay value. Razorpay only allows pause from `active` (pausing `authenticated` cancels); resume is only allowed from `paused`.

Full flow: [`examples/stripe/subscriptions.ts`](./examples/stripe/subscriptions.ts), [`examples/razorpay/subscriptions.ts`](./examples/razorpay/subscriptions.ts)

## Invoices

Generate tax invoices with GSTIN / VAT IDs, custom or auto numbering, retrieve them, and download PDFs.

```typescript
// Intra-state (MH → MH) → CGST + SGST
const intra = await billing.generateInvoice({
  invoiceNumber: "INV-2026-MH-00042", // optional; else INV-YYYY-00001
  taxMode: "gst",
  taxRate: 18,
  sellerState: "MH",
  customer: {
    name: "Local Retailer",
    email: "buyer@example.com",
    gstin: "27AAAAA0000A1Z5",
  },
  billingAddress: {
    line1: "10 Linking Road",
    city: "Mumbai",
    state: "MH",
    postalCode: "400050",
    country: "IN",
  },
  lineItems: [
    {
      description: "Cloud hosting",
      quantity: 1,
      unitAmount: 100000,
      hsnOrSac: "998315",
    },
  ],
});
// intra.tax → { cgst, sgst, igst: 0, totalTax, total }

// Inter-state (MH → KA) → IGST
const inter = await billing.generateInvoice({
  taxMode: "gst",
  taxRate: 18,
  sellerState: "MH",
  customer: { name: "KA Buyer", gstin: "29BBBBB0000B1Z5" },
  billingAddress: {
    line1: "88 Indiranagar",
    city: "Bengaluru",
    state: "KA",
    postalCode: "560038",
    country: "IN",
  },
  lineItems: [{ description: "API credits", quantity: 1, unitAmount: 100000 }],
});
// inter.tax → { igst, cgst: 0, sgst: 0 }

// VAT invoice
const vatInvoice = await billing.generateInvoice({
  taxMode: "vat",
  taxRate: 20,
  currency: "eur",
  customer: { name: "Berlin GmbH", vatNumber: "DE123456789" },
  billingAddress: {
    line1: "Friedrichstr. 1",
    city: "Berlin",
    state: "BE",
    postalCode: "10117",
    country: "DE",
  },
  lineItems: [{ description: "SaaS license", quantity: 1, unitAmount: 100000 }],
});

const summary = await billing.getInvoiceSummary(intra.id);
const stored = await billing.getInvoice(intra.id);

// Downloadable PDF (Buffer → file or HTTP response)
const pdf = await billing.generateInvoicePdf({ invoice: intra });
// fs.writeFileSync(`./tmp/${intra.number}.pdf`, pdf);
// res.setHeader("Content-Type", "application/pdf");
// res.setHeader("Content-Disposition", `attachment; filename="${intra.number}.pdf"`);
// res.send(pdf);
```

| Field / method | Purpose |
|----------------|---------|
| `invoiceNumber` | Custom number; omit for `INV-YYYY-#####` |
| `customer.gstin` / `customer.vatNumber` | Printed on PDF |
| `company.gstin` / `company.taxId` | Seller tax ID on PDF |
| `lineItems[].hsnOrSac` | HSN / SAC column on PDF |
| `taxMode` | `"gst"` \| `"vat"` \| `"none"` |
| `getInvoice` / `getInvoiceSummary` | Retrieve by id |
| `generateInvoicePdf` | Returns `Buffer` |

Full samples (writes PDFs to `./tmp/`): [`examples/invoices-tax-pdf.ts`](./examples/invoices-tax-pdf.ts)

## Coupons & promotion codes

Stripe-style coupons (`amountOff` / `percentOff`, `duration`) and promotion codes with expiry, usage limits, and minimum amount checks.

```typescript
billing.registerCoupon({
  code: "SAVE20",
  type: "percentage",
  percentOff: 20,
  duration: "repeating",
  durationInMonths: 3,
  maxRedemptions: 100,
});

billing.createPromotionCode({
  code: "LAUNCH20",
  coupon: "SAVE20",
  expiresAt: new Date("2027-01-01"),
  minAmount: 1000,
});

const checkout = billing.applyCheckoutDiscount({
  amount: 99900,
  currency: "inr",
  promotionCode: "LAUNCH20",
});
// checkout.finalAmount, checkout.discountLines

billing.removePromotionCode({ amount: 99900, currency: "inr" });

await billing.generateInvoice({
  /* ... */
  promotionCode: "LAUNCH20", // discount line items on invoice + PDF
});

await billing.createPayment({
  amount: 99900,
  promotionCode: "LAUNCH20", // charges discounted amount
});

await billing.createSubscription({
  customerId: "cus_xxx",
  planId: "price_xxx",
  planAmount: 99900,
  promotionCode: "LAUNCH20",
});
```

## Customer billing profiles

Reusable customer records with tax IDs, billing address, default currency, payment preferences, and saved payment methods.

```typescript
const profile = await billing.createCustomerProfile({
  name: "Ada Lovelace",
  email: "ada@acme.com",
  companyName: "Acme India",
  gstin: "29AAAAA0000A1Z5",
  isBusinessCustomer: true,
  billingAddress: {
    line1: "14 MG Road",
    city: "Bengaluru",
    state: "KA",
    postalCode: "560001",
    country: "IN",
  },
  defaultCurrency: "inr",
  billingNotes: "Net 15",
  paymentPreferences: { allowAutoCharge: true },
});

await billing.attachPaymentMethod({
  profileId: profile.id,
  paymentMethodId: "pm_card_visa",
  type: "card",
  last4: "4242",
  setAsDefault: true,
});

// Reuse on invoices / payments
await billing.generateInvoice({
  customerProfileId: profile.id,
  lineItems: [{ description: "Pro", quantity: 1, unitAmount: 99900 }],
});

await billing.createPayment({
  amount: 99900,
  customerProfileId: profile.id,
});
```

Pass `syncProvider: true` on create/attach to also create/attach against Stripe when `provider: "stripe"`.

## Marketplace splits (Razorpay Route)

Split a captured payment between the platform and linked vendor accounts. Supports commission rules, settlement holds, transfers, and reversals.

```typescript
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
});

// Preview allocation
billing.calculateSplit({
  paymentId: "pay_xxx",
  amount: 100000,
  platformCommission: { type: "percent", percent: 10 },
  transfers: [
    { linkedAccountId: "acc_vendor_a", percent: 60 },
    { linkedAccountId: "acc_vendor_b", percent: 40, onHold: true },
  ],
});

const split = await billing.splitPayment({
  paymentId: "pay_xxx",
  amount: 100000,
  idempotencyKey: "split_order_123",
  platformCommission: { type: "percent", percent: 10 },
  transfers: [
    { linkedAccountId: "acc_vendor_a", percent: 60 },
    { linkedAccountId: "acc_vendor_b", percent: 40, onHold: true },
  ],
});
// split.platformFee, split.vendorAmount, split.transfers

await billing.createTransfer({
  linkedAccountId: "acc_vendor_a",
  amount: 50000,
  paymentId: "pay_xxx", // or omit for a direct transfer
  idempotencyKey: "transfer_order_123",
});

await billing.reverseTransfer({
  transferId: "trf_xxx",
  amount: 10000,
  idempotencyKey: "reverse_order_123",
});
await billing.getSettlementDetails({ settlementId: "setl_xxx" });

const request = await billing.getTransferRequest("transfer_order_123");
const reconciled = await billing.reconcileTransferRequest(
  "transfer_order_123",
);
```

Repeated calls with the same key and payload return the persisted result without creating another transfer. Reusing a key with different input throws `IdempotencyConflictError`. Direct transfers send Razorpay Route's `X-Transfer-Idempotency` header; payment splits and reversals use the local atomic request store.

Transactions record `routedAmount`, `platformFee`, `vendorAmount`, and `settlementStatus`. Transfer requests persist processing state, provider responses, transfer IDs, errors, and reconciliation status through `TransferRequestRepository`.

This integration covers Razorpay Route transfers. RazorpayX payouts and `X-Payout-Idempotency` are separate APIs and are not represented by these methods.

## Tax support

Country/state tax engine for **GST**, **VAT**, and **sales tax**. Structured breakdown includes `taxType`, `taxPercent`, `taxLines`, and totals.

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  tax: {
    enabled: true,
    autoTax: true,          // pick GST / VAT / sales tax from country
    defaultRate: 18,
    sellerState: "MH",
    sellerCountry: "IN",
  },
});

// Unified engine
billing.calculateTax({
  amount: 10000,
  autoTax: true,
  country: "IN",
  sellerState: "MH",
  buyerState: "MH",
  rate: 18,
});
// → taxType: "gst", taxLines: [{ CGST 9% }, { SGST 9% }], totalTax: 1800

// MH → DL (inter-state IGST)
billing.calculateTax({
  amount: 10000,
  taxType: "gst",
  rate: 18,
  sellerState: "MH",
  buyerState: "DL",
  placeOfSupply: "DL",
  country: "IN",
});
// → taxLines: [{ IGST 18% }], igst: 1800

// EU VAT (+ reverse charge for B2B with VAT ID)
billing.calculateTax({
  amount: 10000,
  taxType: "vat",
  rate: 20,
  country: "DE",
  isBusinessCustomer: true,
  customerTaxId: "DE123456789",
});
// → reverseCharge: true, totalTax: 0
```

| Field | Purpose |
|-------|---------|
| `taxType` | `gst` \| `vat` \| `sales_tax` \| `none` |
| `autoTax` | Infer type from `country` (IN→GST, EU→VAT, US→sales tax) |
| `country` / `state` / `placeOfSupply` | Jurisdiction |
| `sellerState` / `buyerState` | GST intra vs inter-state |
| `customerTaxId` / `isBusinessCustomer` | VAT reverse charge |

Invoice tax summary:

```typescript
const invoice = await billing.generateInvoice({
  autoTax: true,
  country: "IN",
  sellerState: "MH",
  customer: { name: "Buyer", gstin: "27AAAAA0000A1Z5", customerTaxId: "27AAAAA0000A1Z5" },
  billingAddress: {
    line1: "…",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
  lineItems: [{ description: "Service", quantity: 1, unitAmount: 10000 }],
});

invoice.tax;
// {
//   taxType: "gst",
//   taxPercent: 18,
//   taxLines: [{ name: "CGST", rate: 9, amount: 900 }, { name: "SGST", rate: 9, amount: 900 }],
//   taxableAmount, cgst, sgst, igst, vat, salesTax, totalTax, total, placeOfSupply
// }
```

Helpers: `calculateGST()`, `calculateVAT()`, `calculateTax()`.

## Webhook verification

Always verify with the **raw request body**. Do not `JSON.parse` or otherwise transform the body before verification — Razorpay and Stripe both require the exact bytes that were signed.

Use `processWebhook` or `createRawWebhookHandler` to combine signature verification, atomic deduplication, and safe handling of out-of-order events. Duplicate and stale deliveries return successfully without invoking your handler.

### Express — Razorpay (raw body)

```typescript
import express from "express";
import { BillingKit, WebhookVerificationError } from "billing-kit";

const app = express();

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});

const processWebhook = billing.createRawWebhookHandler(async (event) => {
  switch (event.normalizedType) {
    case "payment.captured":
    case "refund.processed":
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.cancelled":
      // grant / revoke access, record ledger, etc.
      break;
    default:
      break;
  }
});

// Important: use express.raw on this route only — not express.json()
app.post(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    if (typeof signature !== "string") {
      res.status(400).send("Missing signature");
      return;
    }

    try {
      const result = await processWebhook({
        rawBody: req.body,
        signature,
        eventId: req.headers["x-razorpay-event-id"] as string | undefined,
      });
      res.json({
        received: true,
        duplicate: result.duplicate,
        outOfOrder: result.outOfOrder,
      });
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        res.status(400).send("Invalid signature");
        return;
      }
      throw err;
    }
  },
);
```

### Stripe / shared API

```typescript
import { BillingKit, WebhookVerificationError } from "billing-kit";

// Stripe — header: Stripe-Signature (also requires raw body)
try {
  const event = billing.verifyWebhook(
    req.body,
    req.headers["stripe-signature"] as string,
  );
  // event.type, event.normalizedType, event.entity, event.data, event.provider
} catch (err) {
  if (err instanceof WebhookVerificationError) {
    // invalid signature — return 400
  }
  throw err;
}

// Razorpay — header: X-Razorpay-Signature
const event = billing.verifyWebhook(
  req.body,
  req.headers["x-razorpay-signature"] as string,
);
```

| Provider | Header | Common events (raw → normalized) |
|----------|--------|----------------------------------|
| Stripe | `Stripe-Signature` | `payment_intent.succeeded` → `payment.captured`, `charge.refunded` → `refund.processed`, `customer.subscription.deleted` → `subscription.cancelled`, `invoice.paid` → `subscription.charged` / `invoice.paid` |
| Razorpay | `X-Razorpay-Signature` | `payment.captured`, `refund.processed`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `invoice.paid` |

Example handlers: [`examples/stripe/webhooks.ts`](./examples/stripe/webhooks.ts), [`examples/razorpay/webhooks.ts`](./examples/razorpay/webhooks.ts)

### Testing webhooks locally

Import helpers from `billing-kit/testing` (not the main package entry). They generate mock Stripe/Razorpay payloads and signatures that pass `verifyWebhook` / `processWebhook`.

```typescript
import { BillingKit } from "billing-kit";
import {
  createMockRazorpayPaymentCaptured,
  createMockStripePaymentIntentSucceeded,
  createSignedWebhookRequest,
  formatWebhookCurl,
  generateRazorpayWebhookSignature,
  generateStripeWebhookSignature,
  webhookFixtures,
} from "billing-kit/testing";

const razorpaySecret = process.env.RAZORPAY_WEBHOOK_SECRET!;
const mock = createMockRazorpayPaymentCaptured({ amount: 99900 });
const signature = generateRazorpayWebhookSignature(mock.body, razorpaySecret);

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: razorpaySecret,
});

billing.verifyWebhook(mock.body, signature);
// → payment.captured

const stripeRequest = createSignedWebhookRequest({
  provider: "stripe",
  payload: createMockStripePaymentIntentSucceeded(),
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
});
// stripeRequest.headers["stripe-signature"]
```

Reusable fixtures cover payment, refund, and subscription flows for both providers via `webhookFixtures.razorpay.*` and `webhookFixtures.stripe.*`.

Print a localhost curl (signs the exact body you must POST):

```bash
npx ts-node examples/testing/webhook-local.ts razorpay payment
npx ts-node examples/testing/webhook-local.ts stripe refund
```

Run fixture verification without a live provider:

```bash
npx ts-node examples/testing/webhook-staging.ts
```

Razorpay webhook validation requires the **raw body** HMAC (`X-Razorpay-Signature`). Checkout payment signatures (`orderId|paymentId`) are separate — use `generateRazorpayPaymentSignature` for those.

Examples: [`examples/testing/`](./examples/testing/)

### Razorpay Orders + payment signature

```typescript
const order = await billing.createOrder({
  amount: 99900,
  currency: "inr",
  receipt: `rcpt_${Date.now()}`,
});

// After Checkout, verify client response before fulfilling
const ok = billing.verifyPaymentSignature({
  orderId: order.id,
  paymentId: "pay_xxx",
  signature: "from_checkout_response",
});

const payment = await billing.fetchPayment("pay_xxx");
const refund = await billing.fetchRefund("rfnd_xxx");
```

Wire subscription lifecycle with webhooks — e.g. on `invoice.paid` / `subscription.charged` grant access; on `customer.subscription.deleted` / `subscription.cancelled` revoke it.
## Storage adapters

Invoices and transactions use repositories. Defaults are in-memory; swap them for Postgres, Mongo, Redis, etc.

```typescript
import type { InvoiceRepository, TransactionRepository } from "billing-kit";

class PostgresInvoiceRepository implements InvoiceRepository {
  async save(invoice) {
    // INSERT / UPSERT
    return invoice;
  }
  async findById(id) {
    // SELECT
    return null;
  }
}

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  invoiceRepository: new PostgresInvoiceRepository(),
  transactionRepository: myTransactionRepo,
});
```

| Interface | Methods | Default |
|-----------|---------|---------|
| `InvoiceRepository` | `save`, `findById` | `InMemoryInvoiceRepository` |
| `TransactionRepository` | `save`, `findById`, `list` | `InMemoryTransactionRepository` |
| `RetryAttemptRepository` | `save`, `findById`, `findByReference`, `list` | `InMemoryRetryAttemptRepository` |
| `CustomerProfileRepository` | `save`, `findById`, `findByEmail`, `list`, `delete` | `InMemoryCustomerProfileRepository` |
| `AuditLogRepository` | `save`, `findById`, `list` | `InMemoryAuditLogRepository` |
| `WebhookEventRepository` | `claim`, `save`, `find`, `list` | `InMemoryWebhookEventRepository` |
| `UsageEventRepository` | `save`, `findById`, `list` | `InMemoryUsageEventRepository` |
| `EntitlementRepository` | plan mappings, subscription grants, customer lookup | `InMemoryEntitlementRepository` |
| `TransferRequestRepository` | `claim`, `save`, `findByKey`, `list` | `InMemoryTransferRequestRepository` |

## Audit trail

BillingKit records a unified event timeline for support, reconciliation, and compliance. Sensitive fields (secrets, tokens, card numbers) are masked before persistence.

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  auditLogRepository: myAuditRepo, // optional; defaults to in-memory
  auditActor: { type: "api", id: "checkout-service" },
});

await billing.generateInvoice({ /* ... */ });
await billing.createPayment({ /* ... */ });
await billing.refundPayment({ paymentId: "pay_xxx", amount: 500 });
billing.calculateTax({ amount: 10000, taxType: "gst", rate: 18, sellerState: "MH", buyerState: "KA" });

const timeline = await billing.getInvoiceTimeline("inv_xxx");
const paymentLog = await billing.getPaymentAuditLog("pay_xxx");

await billing.recordBillingEvent({
  action: "billing.event",
  resourceType: "invoice",
  resourceId: "inv_xxx",
  payload: { note: "manual adjustment", secretKey: "will-be-masked" },
});
```

Each entry includes `timestamp`, `actor`, `provider`, `resourceType`, `resourceId`, and a masked `payloadSummary`.


## Observability

Pluggable structured logging and success/failure hooks keep async billing systems in sync. Enable a logger and hooks on `BillingKit`:

```typescript
import { BillingKit, ConsoleLogger } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  logger: new ConsoleLogger({ json: true, minLevel: "info" }),
  observabilityHooks: {
    onSuccess: (event) => {
      // metrics.increment("billing.success", { action: event.action })
    },
    onFailure: (event) => {
      // alert(event.error?.message, event.requestId)
    },
  },
});

const payment = await billing.createPayment({
  amount: 99900,
  metadata: { orderId: "ord_123", accountId: "acc_9" },
});
// payment.observability.durationMs / correlationId
// payment.metadata stays on the result for downstream systems

const invoice = await billing.generateInvoice({
  /* ... */
  metadata: { orderId: "ord_123" },
});
```

Operations emit structured fields: `requestId`, `webhookEventId`, `retryCount`, `durationMs`, `correlationId`, and `outcome`. The same fields are stored on audit log entries and (where applicable) on payment / invoice / refund results. Webhook processing records `durationMs` on the event record and fires `webhook.processed` / `webhook.failed` / `webhook.duplicate` hooks.

## Payment & refund idempotency

`createPayment`, `capturePayment`, and `refundPayment` accept an optional `idempotencyKey`. When omitted, BillingKit auto-generates a UUID. Keys and request fingerprints are persisted (in-memory by default, or your `idempotencyRequestRepository`) so safe retries return the same result without charging or refunding twice. Reusing a key with a different payload throws `IdempotencyConflictError`.

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  // idempotencyRequestRepository: myRepo, // optional; defaults to in-memory
});

const payment = await billing.createPayment({
  amount: 99900,
  currency: "inr",
  idempotencyKey: "checkout_order_123",
});

// Network timeout? Retry with the same key — same PaymentResult, one gateway call.
const retried = await billing.createPayment({
  amount: 99900,
  currency: "inr",
  idempotencyKey: "checkout_order_123",
});
expect(retried.id).toBe(payment.id);

await billing.refundPayment({
  paymentId: payment.id,
  amount: 99900,
  idempotencyKey: "refund_order_123",
});
```

On Stripe, the resolved key is forwarded as Stripe's idempotency key. Razorpay payment/refund calls rely on the local store (Route transfers use a separate transfer request store).

## Payment & invoice retries (dunning)

Configure Smart Retries–style recovery for failed payments and invoices: max retries, intervals, grace period, and hooks for email/webhook triggers.

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  retry: {
    maxRetries: 3,
    retryIntervalsMs: [
      24 * 60 * 60 * 1000,
      3 * 24 * 60 * 60 * 1000,
      5 * 24 * 60 * 60 * 1000,
    ],
    gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
  },
  retryHooks: {
    onPaymentFailed: async ({ attempt }) => { /* log / metrics */ },
    onRetryScheduled: async ({ attempt }) => { /* queue job at attempt.nextRetryAt */ },
    onPaymentRecovered: async ({ attempt }) => { /* restore access */ },
    onMarkedUncollectible: async ({ attempt }) => { /* cancel subscription */ },
    onRecoveryEmail: async ({ attempt }) => { /* send dunning email */ },
    onRecoveryWebhook: async ({ attempt }) => { /* notify your backend */ },
  },
});

await billing.openBillingAttempt({
  kind: "invoice",
  referenceId: invoice.id,
  amount: invoice.total,
  currency: invoice.currency,
});

await billing.reportBillingFailure({
  kind: "invoice",
  referenceId: invoice.id,
  reason: "card_declined",
});

const due = await billing.processDueRetries();
for (const attempt of due) {
  // charge again via createPayment / provider, then:
  // await billing.reportBillingRecovered({ referenceId: attempt.referenceId });
  // or reportBillingFailure again
}
```

States: `pending` → `failed` → `retrying` → `recovered` | `uncollectible`.

## Error handling

All SDK errors extend `BillingKitError` with a stable `code`. Provider failures also carry optional `requestId`, `providerCode`, `provider`, and `statusCode` for support and logging.

Normalized classes (Stripe + Razorpay map into these):

| Error | When |
|-------|------|
| `BillingAuthError` | Invalid keys / permissions (`StripeAuthenticationError` subclasses this) |
| `BillingValidationError` | Bad parameters (`StripeInvalidRequestError`, `StripeCardError` subclass this) |
| `BillingRetryableError` | Rate limits, connection failures, 5xx — safe to retry with backoff |

```typescript
import {
  BillingAuthError,
  BillingKitError,
  BillingRetryableError,
  BillingValidationError,
  InvoiceNotFoundError,
  withBackoffRetry,
} from "billing-kit";

try {
  await withBackoffRetry(() => billing.createPayment({ amount: 5000 }), {
    maxRetries: 3,
    initialDelayMs: 100,
  });
} catch (err) {
  if (err instanceof BillingValidationError) {
    // fix input — do not retry
  } else if (err instanceof BillingAuthError) {
    // check API keys
  } else if (err instanceof BillingRetryableError) {
    console.error(err.requestId, err.providerCode, err.retryAfterMs);
  } else if (err instanceof InvoiceNotFoundError) {
    // 404
  } else if (err instanceof BillingKitError) {
    console.error(err.code, err.message, err.requestId);
  }
}
```

`withBackoffRetry` uses exponential backoff (+ jitter) and only retries `BillingRetryableError` / network failures by default — not validation, auth, or card declines. Prefer pairing retries with idempotency keys on mutating calls.

| Error | Code |
|-------|------|
| `BillingAuthError` | `BILLING_AUTH_ERROR` |
| `BillingValidationError` | `BILLING_VALIDATION_ERROR` |
| `BillingRetryableError` | `BILLING_RETRYABLE_ERROR` |
| `InvalidConfigError` | `INVALID_CONFIG` |
| `PaymentError` | `PAYMENT_ERROR` |
| `StripeCardError` | `STRIPE_CARD_ERROR` |
| `StripeAuthenticationError` | `STRIPE_AUTHENTICATION_ERROR` |
| `StripeInvalidRequestError` | `STRIPE_INVALID_REQUEST` |
| `UnsupportedOperationError` | `UNSUPPORTED_OPERATION` |
| `CouponError` | `COUPON_ERROR` |
| `WebhookVerificationError` | `WEBHOOK_VERIFICATION_FAILED` |
| `CurrencyMismatchError` | `CURRENCY_MISMATCH` |
| `UnsupportedCurrencyError` | `UNSUPPORTED_CURRENCY` |
| `InvoiceNotFoundError` | `INVOICE_NOT_FOUND` |
| `TransactionNotFoundError` | `TRANSACTION_NOT_FOUND` |

## API overview

| Area | Methods |
|------|---------|
| Invoice | `generateInvoice`, `getInvoiceSummary`, `getInvoice`, `generateInvoicePdf` |
| Payment | `createPayment`, `capturePayment`, `cancelPayment`, `getPaymentStatus` |
| Razorpay | `createOrder`, `verifyPaymentSignature`, `fetchPayment`, `fetchRefund` |
| Refund | `refundPayment` |
| Idempotency | `getIdempotencyRequest`, `listIdempotencyRequests` |
| Subscription | `createPlan`, `updatePlan`, `cancelPlan`, `createSubscription`, `pauseSubscription`, `resumeSubscription`, `scheduleCancellation`, `cancelSubscription`, `renewSubscription`, `retrieveSubscription` |
| Stripe billing | `createCustomer`, `attachPaymentMethod`, `setDefaultPaymentMethod`, `detachPaymentMethod`, `listPaymentMethods`, `retrieveProviderInvoice`, `listCustomerInvoices`, `listActiveSubscriptions`, `listCustomerSubscriptions`, `createBillingPortalSession`, `createPaymentMethodUpdateSession`, `reportUsage` |
| Tax | `calculateTax`, `calculateGST`, `calculateVAT` |
| Coupon | `registerCoupon`, `createPromotionCode`, `applyCoupon`, `applyPromotionCode`, `removePromotionCode`, `applyCheckoutDiscount`, `validateCoupon` |
| Customer profile | `createCustomerProfile`, `updateCustomerProfile`, `getCustomerProfile`, `attachPaymentMethod`, `setDefaultPaymentMethod` |
| Route / splits | `splitPayment`, `createTransfer`, `reverseTransfer`, `getSettlementDetails`, `calculateSplit`, `getTransferRequest`, `listTransferRequests`, `reconcileTransferRequest` |
| Audit | `recordBillingEvent`, `getInvoiceTimeline`, `getPaymentAuditLog`, `listAuditEvents` |
| Observability | `logger` + `observabilityHooks` on config; fields on results/audits |
| Transaction | `recordTransaction`, `getTransaction`, `getRevenueByCurrency`, `getSettlementSummary` |
| Retry / dunning | `openBillingAttempt`, `reportBillingFailure`, `reportBillingRecovered`, `markBillingUncollectible`, `processDueRetries`, `listRetryAttempts` |
| Webhook | `verifyWebhook`, `processWebhook`, `createRawWebhookHandler`, `listWebhookEvents` |
| Usage billing | `recordUsageEvent`, `getUsageEvent`, `listUsageEvents`, `aggregateUsage`, `priceUsage`, `usageToInvoiceLineItems`, `generateUsageInvoice` |
| Entitlements | `setPlanFeatures`, `getPlanFeatures`, `hasFeature`, `listFeatures`, `getCustomerFeatureAccess`, `syncSubscriptionEntitlements`, `revokeFeatureAccess` |

## Examples

| Path | Description |
|------|-------------|
| [`examples/basic-usage.ts`](./examples/basic-usage.ts) | Quick start — tax, invoice, PDF |
| [`examples/invoices-tax-pdf.ts`](./examples/invoices-tax-pdf.ts) | Intra/inter-state GST, VAT, numbering, PDF files |
| [`examples/stripe/`](./examples/stripe/) | Payments, subscriptions, webhooks |
| [`examples/razorpay/`](./examples/razorpay/) | Payments, subscriptions, webhooks |
| [`examples/testing/`](./examples/testing/) | Localhost/staging webhook fixtures + signed curls |

See [`examples/README.md`](./examples/README.md) for the full layout.

## Roadmap

| Status | Item |
|--------|------|
| Done | Stripe + Razorpay payments, refunds, subscriptions |
| Done | GST / VAT, invoices, PDF, webhooks |
| Done | Pluggable invoice / transaction repositories |
| Done | Tax engine (GST / VAT / sales tax, autoTax, tax lines) |
| Done | Multi-currency (INR, USD, EUR, GBP, AED, SGD) |
| Done | Stripe customers, pause/resume, hosted invoices, metered usage |
| Done | Razorpay orders, payment signature, fetch helpers, normalized webhooks |
| Done | Presentment/settlement currencies, fee breakdown, revenue reporting |
| Done | Payment/invoice retry (dunning), grace period, recovery hooks |
| Done | Customer billing profiles with reusable payment methods |
| Done | Razorpay Route payment splits, transfers, reversals |
| Done | Unified billing audit trail with sensitive-field masking |
| Done | Webhook idempotency, duplicate suppression, out-of-order protection |
| Done | Usage event aggregation, pricing, and invoice generation |
| Done | Plan feature mapping and subscription entitlement provisioning |
| Done | Idempotent Route transfers with persisted request reconciliation |
| Done | Webhook testing helpers (`billing-kit/testing`) and local fixtures |
| Done | Idempotency store for payments and refunds |
| Next | Zod (or similar) runtime validation on public inputs |
| Next | Webhook event registry / typed handlers on `BillingKit` |
| Next | Additional subpath exports (`billing-kit/tax`, `billing-kit/invoice`) |
| Later | Additional gateways (PayPal, Cashfree) |
| Later | Proration helpers for mid-cycle plan changes |

## Scripts

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
