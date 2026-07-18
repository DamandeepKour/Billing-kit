# billing-kit

Node.js billing SDK for invoices, tax, payments, refunds, subscriptions, webhooks, and PDF generation.

```bash
npm install billing-kit
```

## Features

- Invoice generation with line items, discounts, tax, and PDF export
- Payments — create, capture, cancel, status
- Refunds — full and partial
- Subscriptions — plans, create, cancel, renew, pause / resume (Stripe); monthly / quarterly / yearly + metered
- Webhooks — signature verification for Stripe and Razorpay
- Tax engine — GST / VAT / sales tax with `autoTax`, place of supply, and tax line breakdowns
- Coupons — percentage and flat discounts
- Transactions — record payment, refund, subscription, renewal, chargeback events
- Pluggable storage — inject your own invoice / transaction repositories
- Multi-currency — `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd` at config, customer, invoice, and payment level

## Supported providers

| Provider | Config | Notes |
|----------|--------|--------|
| **Stripe** | `provider: "stripe"`, `secretKey` | PaymentIntents, Prices/subscriptions, customers, hosted invoices, metered usage, refunds, webhooks |
| **Razorpay** | `provider: "razorpay"`, `keyId`, `secretKey` | Orders, captures, plans, subscriptions, refunds, webhooks |

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
await billing.cancelSubscription(subscription.id); // cancel at period end
await billing.renewSubscription(subscription.id);  // clear cancel-at-period-end
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

### Hosted Stripe invoices

```typescript
// Provider invoice (Stripe), not a local billing-kit invoice
const invoice = await billing.retrieveProviderInvoice("in_xxx");
console.log(invoice.hostedInvoiceUrl); // customer-facing hosted page
console.log(invoice.invoicePdfUrl);
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

// Cancel at period end
const cancelled = await billing.cancelSubscription(subscription.id);
// cancelled.cancelAtPeriodEnd === true

// Resume billing (clear cancel-at-period-end)
const renewed = await billing.renewSubscription(subscription.id);
// renewed.cancelAtPeriodEnd === false
```

| Method | Behavior |
|--------|----------|
| `createPlan` | Creates a recurring price/plan (`usageType: "metered"` for usage billing on Stripe) |
| `createSubscription` | Starts billing for a customer on that plan |
| `cancelSubscription` | Schedules cancel at period end |
| `renewSubscription` | Clears cancel-at-period-end so billing continues |
| `pauseSubscription` | Stripe only — pause collection |
| `resumeSubscription` | Stripe only — resume collection |
| `retrieveSubscription` | Stripe only — fetch subscription |
| `createCustomer` | Stripe only — create Customer |
| `attachPaymentMethod` / `setDefaultPaymentMethod` | Stripe only |
| `retrieveProviderInvoice` | Stripe only — hosted invoice URL + PDF |
| `reportUsage` | Stripe only — metered usage records |

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

Always verify with the **raw request body**. Do not parse JSON before verification.

```typescript
import { BillingKit, WebhookVerificationError } from "billing-kit";

// Stripe — header: Stripe-Signature
try {
  const event = billing.verifyWebhook(
    req.body,
    req.headers["stripe-signature"] as string,
  );
  // event.type, event.id, event.data, event.provider
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

| Provider | Header | Common events |
|----------|--------|----------------|
| Stripe | `Stripe-Signature` | `payment_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded` |
| Razorpay | `X-Razorpay-Signature` | `payment.captured`, `refund.processed`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `invoice.paid` |

Example handlers: [`examples/stripe/webhooks.ts`](./examples/stripe/webhooks.ts), [`examples/razorpay/webhooks.ts`](./examples/razorpay/webhooks.ts)

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
| `TransactionRepository` | `save`, `findById` | `InMemoryTransactionRepository` |

## Error handling

All SDK errors extend `BillingKitError` and expose a `code` string.

```typescript
import {
  BillingKitError,
  InvalidConfigError,
  InvoiceNotFoundError,
  TransactionNotFoundError,
  WebhookVerificationError,
  CouponError,
  PaymentError,
  CurrencyMismatchError,
  UnsupportedCurrencyError,
} from "billing-kit";

try {
  await billing.getInvoiceSummary(id);
} catch (err) {
  if (err instanceof InvoiceNotFoundError) {
    // 404
  } else if (err instanceof BillingKitError) {
    console.error(err.code, err.message);
  }
}
```

| Error | Code |
|-------|------|
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
| Refund | `refundPayment` |
| Subscription | `createPlan`, `updatePlan`, `cancelPlan`, `createSubscription`, `cancelSubscription`, `renewSubscription` |
| Stripe billing | `pauseSubscription`, `resumeSubscription`, `retrieveSubscription`, `createCustomer`, `attachPaymentMethod`, `setDefaultPaymentMethod`, `retrieveProviderInvoice`, `reportUsage` |
| Tax | `calculateTax`, `calculateGST`, `calculateVAT` |
| Coupon | `applyCoupon`, `validateCoupon` |
| Transaction | `recordTransaction`, `getTransaction` |
| Webhook | `verifyWebhook` |

## Examples

| Path | Description |
|------|-------------|
| [`examples/basic-usage.ts`](./examples/basic-usage.ts) | Quick start — tax, invoice, PDF |
| [`examples/invoices-tax-pdf.ts`](./examples/invoices-tax-pdf.ts) | Intra/inter-state GST, VAT, numbering, PDF files |
| [`examples/stripe/`](./examples/stripe/) | Payments, subscriptions, webhooks |
| [`examples/razorpay/`](./examples/razorpay/) | Payments, subscriptions, webhooks |

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
| Next | Idempotency store interface for payments and refunds |
| Next | Zod (or similar) runtime validation on public inputs |
| Next | Webhook event registry / typed handlers on `BillingKit` |
| Next | Subpath exports (`billing-kit/tax`, `billing-kit/invoice`) |
| Later | Additional gateways (PayPal, Cashfree) |
| Later | Proration helpers for mid-cycle plan changes |
| Later | Additional usage / metered billing calculators |

## Scripts

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
