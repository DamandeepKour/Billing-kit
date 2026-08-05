# billing-kit

Framework-agnostic Node.js billing SDK for **Stripe** and **Razorpay**: invoices, tax (GST / VAT / sales tax), payments, refunds, subscriptions, webhooks, and PDF generation.

```bash
npm install billing-kit
```

Requires **Node.js 18+**. TypeScript types are included.

```typescript
import { BillingKit } from "billing-kit";
// Optional test helpers:
import { createMockStripeEvent } from "billing-kit/testing";
```

**Important:** all monetary amounts are **integers in the smallest currency unit** (paise / cents). See [Amounts](#amounts-smallest-currency-units).

Related docs: [CHANGELOG.md](./CHANGELOG.md) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [examples/](./examples/) (Express, Next.js, NestJS)

---

## Overview

| Area | What you get |
|------|----------------|
| Invoices | Line items, discounts, tax, numbering, PDF export |
| Payments | Create / capture / cancel (Stripe PaymentIntents, Razorpay Orders) |
| Refunds | Full and partial, with idempotency keys |
| Subscriptions | Plans, create, pause / resume, cancel, schedule cancellation |
| Tax | GST (CGST/SGST/IGST), VAT, sales tax, `autoTax` |
| Multi-currency | `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd` |
| Webhooks | Raw-body signature verification, normalized events, event-id dedupe |
| Storage | Pluggable repositories (in-memory defaults) |

Also included: coupons, customer profiles, entitlements, usage billing, Razorpay Route splits, audit logs, dunning, and diagnostics — see [API reference](#api-reference).

---

## Install

```bash
npm install billing-kit
```

ESM:

```typescript
import { BillingKit } from "billing-kit";
```

CommonJS:

```js
const { BillingKit } = require("billing-kit");
```

---

## Quick start

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
});

// Tax preview — amount is in paise (₹100.00)
const tax = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});

const invoice = await billing.generateInvoice({
  customer: { name: "Ada Lovelace", email: "ada@example.com" },
  billingAddress: {
    line1: "42 MG Road",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
  lineItems: [
    { description: "Pro plan", quantity: 1, unitAmount: 99900 }, // ₹999.00
  ],
  taxType: "gst",
  sellerState: "MH",
});

const pdf = await billing.generateInvoicePdf({ invoice });
// pdf is a Buffer
```

---

## Configuration

```typescript
import { BillingKit, ConsoleLogger } from "billing-kit";

const billing = new BillingKit({
  // Required
  provider: "stripe", // or "razorpay"
  secretKey: process.env.STRIPE_SECRET_KEY!,

  // Razorpay also requires:
  // keyId: process.env.RAZORPAY_KEY_ID!,

  // Optional
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  webhookSecrets: [], // previous secrets during rotation
  currency: "inr",
  company: {
    name: "Acme Pvt Ltd",
    address: "Mumbai, IN",
    gstin: "27AAAAA0000A1Z5",
    email: "billing@acme.com",
  },
  tax: {
    enabled: true,
    autoTax: true,
    defaultRate: 18,
    taxType: "gst",
    sellerState: "MH",
    sellerCountry: "IN",
  },
  retry: {
    maxRetries: 3,
    retryIntervalsMs: [86_400_000, 259_200_000, 432_000_000],
    gracePeriodMs: 604_800_000,
  },
  logger: new ConsoleLogger({ json: true, minLevel: "info" }),
  observabilityHooks: {
    onSuccess: (event) => {
      /* metrics */
    },
    onFailure: (event) => {
      /* alerts — event.requestId */
    },
  },

  // Optional pluggable repositories (default: in-memory)
  // invoiceRepository,
  // transactionRepository,
  // webhookEventRepository,
  // auditLogRepository,
  // idempotencyRequestRepository,
  // transferRequestRepository,
  // entitlementRepository,
  // usageEventRepository,
  // customerProfileRepository,
});
```

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `"stripe" \| "razorpay"` | Payment provider |
| `secretKey` | `string` | Stripe secret key or Razorpay key secret |
| `keyId` | `string` | Razorpay key ID (**required** for Razorpay) |
| `webhookSecret` | `string` | Current webhook signing secret |
| `webhookSecrets` | `string[]` | Previous secrets during rotation |
| `currency` | `string` | Default currency (`inr`, `usd`, …) |
| `company` | `CompanyDetails` | Seller details for invoices / PDFs |
| `tax` | `TaxConfig` | Default tax behavior |
| `retry` | `RetryPolicyConfig` | Dunning / recovery policy |
| `logger` | `Logger` | Structured logger (default: noop) |
| `observabilityHooks` | `BillingObservabilityHooks` | Success / failure monitoring |
| `*Repository` | interfaces | Persist invoices, webhooks, audits, etc. |

---

## Amounts (smallest currency units)

All API amounts are **integers in the smallest currency unit**. Do **not** pass major units like `99.99`.

| Currency | Unit | Example |
|----------|------|---------|
| `inr` | paise | `99900` = ₹999.00 |
| `usd` | cents | `4900` = $49.00 |
| `eur` | cents | `1999` = €19.99 |
| `gbp` | pence | `1000` = £10.00 |
| `aed` | fils | `100` = AED 1.00 |
| `sgd` | cents | `2500` = S$25.00 |

```typescript
import {
  toMinorUnits,
  fromMinorUnits,
  formatAmount,
  convertAmount,
  assertSmallestUnitAmount,
} from "billing-kit";

toMinorUnits(999, "inr"); // 99900
fromMinorUnits(99900, "inr"); // 999
formatAmount(99900, "inr"); // "₹999.00"
assertSmallestUnitAmount(4900, { currency: "usd" }); // ok
```

Currency resolution order for invoices / payments:

1. Explicit `currency` on the call  
2. Customer / profile `defaultCurrency`  
3. `BillingKit` config `currency`  
4. Fallback: `inr`

---

## Stripe example

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "usd",
});

const customer = await billing.createCustomer({
  email: "buyer@example.com",
  name: "Buyer",
  paymentMethodId: process.env.STRIPE_PAYMENT_METHOD_ID,
});

const payment = await billing.createPayment({
  amount: 4900, // $49.00
  currency: "usd",
  customerId: customer.id,
  idempotencyKey: "order_1001_pay",
  metadata: { orderId: "1001" },
});

// PaymentIntents use capture_method: manual by default
const captured = await billing.capturePayment({
  paymentId: payment.id,
  idempotencyKey: "order_1001_capture",
});

console.log(captured.status);

// Customer Portal
const portal = await billing.createBillingPortalSession({
  customerId: customer.id,
  returnUrl: "https://app.example.com/account/billing",
});
// Redirect to portal.url
```

---

## Razorpay example

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  currency: "inr",
});

const order = await billing.createOrder({
  amount: 99900, // ₹999.00
  currency: "inr",
  receipt: "rcpt_1001",
  notes: { orderId: "1001" },
});

// After Checkout / custom UI payment on the client:
const valid = billing.verifyPaymentSignature({
  orderId: order.id,
  paymentId: "pay_xxx",
  signature: "from_checkout_response",
});

if (valid) {
  const payment = await billing.fetchPayment("pay_xxx");
  console.log(payment.status, payment.amount);
}
```

---

## Tax example

Supports **GST** (India), **VAT**, and **US sales tax**. Amounts are in smallest units.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: {
    enabled: true,
    autoTax: true,
    defaultRate: 18,
    taxType: "gst",
    sellerState: "MH",
    sellerCountry: "IN",
  },
});

// Intra-state GST → CGST + SGST
const intra = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});

// Inter-state GST → IGST
const inter = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "KA",
});

// VAT + reverse charge (EU B2B with tax ID)
const vat = billing.calculateVAT({
  amount: 10000,
  rate: 20,
  country: "IE",
});
const reverse = billing.calculateVAT({
  amount: 10000,
  rate: 20,
  country: "DE",
  isBusinessCustomer: true,
  customerTaxId: "DE123456789",
});

// US sales tax
const sales = billing.calculateSalesTax({
  amount: 10000,
  state: "CA",
  country: "US",
});

// Auto-detect from country
const auto = billing.calculateTax({
  amount: 10000,
  autoTax: true,
  country: "DE",
});

// Invoice applies tax and exposes a summary
const invoice = await billing.generateInvoice({
  customer: {
    name: "Acme",
    gstin: "29AAAAA0000A1Z5",
    isBusinessCustomer: true,
  },
  billingAddress: {
    line1: "1 Residency Road",
    city: "Bengaluru",
    state: "KA",
    postalCode: "560025",
    country: "IN",
  },
  lineItems: [{ description: "Consulting", quantity: 1, unitAmount: 500000 }],
  taxMode: "gst",
  sellerState: "MH",
});

const taxSummary = await billing.getInvoiceTaxSummary(invoice.id);
```

| Mode | Trigger |
|------|---------|
| GST | `taxType: "gst"` or `autoTax` + `country: "IN"` |
| VAT | `taxType: "vat"` or `autoTax` + EU (or other non-US) country |
| Sales tax | `taxType: "sales_tax"` or `autoTax` + `country: "US"` |
| Reverse charge | VAT + `isBusinessCustomer` + `customerTaxId` |

---

## Multi-currency example

```typescript
import {
  BillingKit,
  toMinorUnits,
  formatAmount,
  convertAmount,
} from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

const usdInvoice = await billing.generateInvoice({
  customer: { name: "US Buyer" },
  billingAddress: {
    line1: "1 Market St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  },
  lineItems: [
    { description: "Pro", quantity: 1, unitAmount: toMinorUnits(49, "usd") },
  ],
  currency: "usd",
  taxMode: "none",
});

const eurPayment = await billing.createPayment({
  amount: toMinorUnits(19.99, "eur"),
  currency: "eur",
});

console.log(formatAmount(usdInvoice.total, "usd"));
console.log(convertAmount(4900, "usd", "eur", 0.92)); // rate is yours to supply
```

---

## Refund example

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
});

// Full refund
await billing.refundPayment({
  paymentId: "pi_xxx",
  idempotencyKey: "refund_ord_123_full",
});

// Partial refund
const partial = await billing.refundPayment({
  paymentId: "pi_xxx",
  amount: 1000, // $10.00 if USD
  reason: "requested_by_customer",
  idempotencyKey: "refund_ord_123_partial",
  metadata: { ticketId: "sup_55" },
});

console.log(partial.status);
```

Reusing the same `idempotencyKey` with the same payload returns the stored result. A different payload with the same key throws `IdempotencyConflictError`.

---

## Subscription example

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

const plan = await billing.createPlan({
  name: "Pro Monthly",
  amount: 2900, // $29.00
  currency: "usd",
  interval: "monthly",
  features: ["exports", "sso"], // optional entitlement mapping
});

const subscription = await billing.createSubscription({
  customerId: "cus_xxx",
  planId: plan.id,
  trialDays: 14,
});

await billing.pauseSubscription({
  subscriptionId: subscription.id,
  behavior: "mark_uncollectible",
});
await billing.resumeSubscription(subscription.id);

// Cancel at period end
await billing.scheduleCancellation(subscription.id);

// Or cancel immediately
await billing.cancelSubscription(subscription.id);

const current = await billing.retrieveSubscription(subscription.id);
console.log(current.status); // active | paused | cancelled | past_due | pending
```

Razorpay uses the same methods (`pause` only from `active`; resume only from `paused`).

---

## Webhook example

Always verify signatures against the **raw request body** (not re-serialized JSON).  
`processWebhook` dedupes by event id (Stripe `event.id`, Razorpay `X-Razorpay-Event-Id`).

```typescript
import {
  BillingKit,
  createRawBodyMiddleware,
  EXPRESS_WEBHOOK_RAW_BODY,
} from "billing-kit";
import express from "express";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  // webhookEventRepository: /* durable store for multi-instance dedupe */,
});

const app = express();

// Option A — SDK middleware
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    switch (event.normalizedType) {
      case "payment.captured":
        // fulfill — event.entity.id
        break;
      case "payment.failed":
        break;
      case "subscription.activated":
        break;
      case "refund.processed":
        break;
    }
  }),
);

// Option B — express.raw
app.post(
  "/webhooks/razorpay",
  express.raw(EXPRESS_WEBHOOK_RAW_BODY),
  async (req, res) => {
    const result = await billing.processWebhookFromHttp(req, async (event) => {
      // event.normalizedType
    });
    if (result.duplicate) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    res.status(200).json({ ok: true });
  },
);
```

Verify only:

```typescript
const event = billing.verifyWebhook(rawBody, signature);
```

Local fixtures (no live provider):

```typescript
import {
  createMockStripePaymentIntentSucceeded,
  createSignedWebhookRequest,
  generateStripeWebhookSignature,
} from "billing-kit/testing";
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for raw-body and secret-rotation issues, and [examples/testing](./examples/testing/) for curl helpers.

---

## Custom repository example

Defaults use in-memory stores (fine for demos). For production, inject persistent repositories:

```typescript
import type { Invoice, InvoiceRepository } from "billing-kit";
import { BillingKit } from "billing-kit";

class PostgresInvoiceRepository implements InvoiceRepository {
  async save(invoice: Invoice): Promise<Invoice> {
    // INSERT ... ON CONFLICT UPDATE
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    // SELECT ...
    return null;
  }
}

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  invoiceRepository: new PostgresInvoiceRepository(),
  // webhookEventRepository, auditLogRepository, idempotencyRequestRepository, …
});
```

Available repository config keys: `invoiceRepository`, `transactionRepository`, `webhookEventRepository`, `auditLogRepository`, `idempotencyRequestRepository`, `transferRequestRepository`, `retryAttemptRepository`, `entitlementRepository`, `usageEventRepository`, `customerProfileRepository`.

---

## API reference

### Invoices

| Method | Description |
|--------|-------------|
| `generateInvoice(input)` | Create a local tax invoice |
| `getInvoice(id)` | Fetch invoice by id |
| `getInvoiceSummary(id)` | Totals only |
| `generateInvoicePdf({ invoice })` | PDF `Buffer` |
| `updateInvoiceStatus(id, status)` | Update lifecycle status |

### Payments

| Method | Description |
|--------|-------------|
| `createPayment(input)` | Create payment / PaymentIntent / order |
| `capturePayment(input)` | Capture an authorized payment |
| `cancelPayment(id)` | Cancel payment |
| `getPaymentStatus(id)` | Fetch status |
| `createOrder(input)` | Razorpay order |
| `verifyPaymentSignature(input)` | Razorpay checkout signature |
| `fetchPayment(id)` / `fetchRefund(id)` | Razorpay fetch helpers |

### Refunds

| Method | Description |
|--------|-------------|
| `refundPayment(input)` | Full or partial refund |

### Subscriptions

| Method | Description |
|--------|-------------|
| `createPlan` / `updatePlan` / `cancelPlan` | Plan management |
| `createSubscription` | Start subscription |
| `pauseSubscription` / `resumeSubscription` | Pause collection |
| `scheduleCancellation` | Cancel at period end |
| `cancelSubscription` | Cancel immediately |
| `renewSubscription` | Clear scheduled cancellation |
| `retrieveSubscription` | Fetch + canonical status |
| `reportUsage` | Stripe metered usage |
| `createBillingPortalSession` | Stripe Customer Portal URL |

### Tax

| Method | Description |
|--------|-------------|
| `calculateGST(input)` | India GST (CGST/SGST or IGST) |
| `calculateVAT(input)` | VAT (+ reverse charge) |
| `calculateSalesTax(input)` | Regional sales tax |
| `calculateTax(input)` | Generic engine (`autoTax` + region) |
| `summarizeTax(breakdown)` | Compact tax summary |
| `getInvoiceTaxSummary(id)` | Tax summary for a saved invoice |

### Webhooks

| Method | Description |
|--------|-------------|
| `verifyWebhook(rawBody, signature)` | Verify + normalize |
| `processWebhook(request, handler)` | Verify, dedupe, handle |
| `processWebhookFromHttp(req, handler)` | Parse headers/raw body, then process |
| `createWebhookHttpHandler(handler, options?)` | Express-style adapter |
| `listWebhookEvents()` | Persisted webhook records |

Helpers: `createRawBodyMiddleware()`, `ensureRawWebhookBody()`, `parseWebhookRequest()`, `EXPRESS_WEBHOOK_RAW_BODY`.

### Other surfaces

| Area | Methods |
|------|---------|
| Coupons | `registerCoupon`, `createPromotionCode`, `applyPromotionCode`, `applyCheckoutDiscount` |
| Customer profiles | `createCustomerProfile`, `updateCustomerProfile`, `attachPaymentMethod` |
| Entitlements | `setPlanFeatures`, `hasFeature`, `syncSubscriptionEntitlements` |
| Usage billing | `recordUsageEvent`, `aggregateUsage`, `generateUsageInvoice` |
| Route / payouts | `splitPayment`, `createTransfer`, `reverseTransfer`, `getSettlementDetails` |
| Audit | `recordBillingEvent`, `getInvoiceTimeline`, `getPaymentAuditLog` |
| Diagnostics | `healthCheck`, `verifyProviderConfig`, `runDiagnostics` |
| Disputes | `fetchDispute`, `listDisputes`, `acceptDispute`, `contestDispute` |

---

## npm scripts

```bash
npm install
npm run lint              # eslint
npm run typecheck         # tsc --noEmit
npm test                  # jest
npm run build             # tsup → dist (CJS + ESM + .d.ts)
npm run validate:package  # docs + dist entrypoints + smoke load
npm run validate:pack     # validate:package + npm tarball contents
npm run release:check     # SemVer / changelog / workflow / publish safety checks
npm run release:notes     # print CHANGELOG section for package.json version
npm run ci                # lint + typecheck + test + build + release:check + validate:pack
npm run format            # prettier
```

GitHub Actions CI runs the same checks on Node 18 / 20 / 22 (and uploads an `npm pack` artifact).  
`prepublishOnly` runs lint, typecheck, tests, and release checks; `prepack` builds and validates entrypoints.  
Pushing a `v*` tag runs the Publish workflow (OIDC provenance + GitHub Release from CHANGELOG).

See [PUBLISHING.md](./PUBLISHING.md) for the full release flow.

---

## License

[MIT](./LICENSE) © Damandeep
