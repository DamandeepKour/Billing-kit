# billing-kit

Node.js billing SDK for invoices, tax, payments, refunds, subscriptions, webhooks, and PDF generation.

```bash
npm install billing-kit
```

## Features

- Invoice generation with line items, discounts, tax, and PDF export
- Payments — create, capture, cancel, status
- Refunds — full and partial
- Subscriptions — plans, create, cancel, renew (monthly / quarterly / yearly)
- Webhooks — signature verification for Stripe and Razorpay
- Tax — GST (CGST / SGST / IGST) and VAT
- Coupons — percentage and flat discounts
- Transactions — record payment, refund, subscription, renewal, chargeback events
- Pluggable storage — inject your own invoice / transaction repositories
- Multi-currency — `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd` at config, customer, invoice, and payment level

## Supported providers

| Provider | Config | Notes |
|----------|--------|--------|
| **Stripe** | `provider: "stripe"`, `secretKey` | PaymentIntents, invoices, subscriptions, refunds, webhooks |
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

Create a plan, subscribe a customer, then cancel or renew. Recurring charges and invoice.paid events usually arrive via webhooks — see [Webhook verification](#webhook-verification).

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
| `createPlan` | Creates a recurring price/plan on the selected provider |
| `createSubscription` | Starts billing for a customer on that plan |
| `cancelSubscription` | Schedules cancel at period end |
| `renewSubscription` | Clears cancel-at-period-end so billing continues |

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

| Method | Use |
|--------|-----|
| `calculateGST()` | India GST — same state → CGST + SGST; different state → IGST |
| `calculateVAT()` | Single VAT rate |

```typescript
// Intra-state (seller MH, buyer MH)
billing.calculateGST({
  amount: 100000,
  rate: 18,
  sellerState: "MH",
  buyerState: "MH",
});
// → cgst: 9000, sgst: 9000, igst: 0, totalTax: 18000, total: 118000

// Inter-state (seller MH, buyer KA)
billing.calculateGST({
  amount: 100000,
  rate: 18,
  sellerState: "MH",
  buyerState: "KA",
});
// → igst: 18000, cgst: 0, sgst: 0, total: 118000

billing.calculateVAT({ amount: 100000, rate: 20 });
// → vat: 20000, total: 120000
```

On invoices, set `taxMode: "gst"` or `"vat"` plus `taxRate` / `sellerState`. Config defaults: `tax.enabled`, `tax.defaultRate`, `tax.sellerState`.

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
| Tax | `calculateGST`, `calculateVAT` |
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
| Done | Multi-currency (INR, USD, EUR, GBP, AED, SGD) |
| Next | Idempotency store interface for payments and refunds |
| Next | Zod (or similar) runtime validation on public inputs |
| Next | Webhook event registry / typed handlers on `BillingKit` |
| Next | Subpath exports (`billing-kit/tax`, `billing-kit/invoice`) |
| Later | Additional gateways (PayPal, Cashfree) |
| Later | Proration helpers for mid-cycle plan changes |
| Later | Usage / metered billing calculators |

## Scripts

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
