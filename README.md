# billing-kit

Framework-agnostic Node.js billing SDK for **Stripe** and **Razorpay** — invoices, GST/VAT/sales tax, payments, refunds, subscriptions, usage billing, webhooks, and PDF generation behind one typed API.

```bash
npm install billing-kit
```

Requires **Node.js 18+**. Ships CommonJS + ESM builds and full TypeScript types — no `@types/*` package needed.

**Important:** every monetary amount is an **integer in the smallest currency unit** (paise, cents, …), never a decimal major unit. See [Amounts (smallest currency units)](#amounts-smallest-currency-units).

Related docs: [CHANGELOG.md](./CHANGELOG.md) · [UPGRADING.md](./UPGRADING.md) · [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) · [PUBLISHING.md](./PUBLISHING.md) · [VERSIONING.md](./VERSIONING.md) · [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [examples/](./examples/) (Express, Next.js, NestJS)

---

## Contents

- [Overview](#overview)
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Stripe example](#stripe-example)
- [Razorpay example](#razorpay-example)
- [Tax example](#tax-example)
- [Multi-currency example](#multi-currency-example)
- [Refund and subscription examples](#refund-and-subscription-examples)
- [Webhook example](#webhook-example)
- [Custom repository example](#custom-repository-example)
- [Provider diagnostics](#provider-diagnostics)
- [API reference](#api-reference)
- [npm scripts](#npm-scripts)
- [Amounts (smallest currency units)](#amounts-smallest-currency-units)
- [License](#license)

---

## Overview

One `BillingKit` instance wraps a single payment provider (Stripe **or** Razorpay) and gives you a provider-agnostic surface on top:

| Area | What you get |
|------|----------------|
| Invoices | Line items, discounts, coupons, tax, numbering, PDF export |
| Payments | Create / capture / cancel (Stripe PaymentIntents, Razorpay Orders) |
| Refunds | Full and partial, with idempotency keys |
| Subscriptions | Plans, create, pause / resume, cancel, schedule cancellation, metered usage |
| Tax | GST (CGST/SGST/IGST), VAT (+ reverse charge), US sales tax, `autoTax` |
| Multi-currency | `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd`, with presentment/settlement tracking |
| Webhooks | Raw-body signature verification, normalized events, event-id dedupe |
| Storage | Pluggable repositories for every entity (in-memory by default) |

Also included: coupons & promotion codes, customer billing profiles, feature entitlements, Razorpay Route splits/transfers, dunning (retry/recovery), audit logs, and non-network diagnostics — all covered in the [API reference](#api-reference).

Swapping providers means changing `provider` in the config — the rest of your integration code (invoices, tax, refunds, webhooks) stays the same.

---

## Install

```bash
npm install billing-kit
```

ESM / TypeScript:

```typescript
import { BillingKit } from "billing-kit";
```

CommonJS:

```js
const { BillingKit } = require("billing-kit");
```

Test-only helpers (mock webhook fixtures, signed request builders) live on a separate subpath so they never ship in your app bundle unless imported:

```typescript
import { createMockStripeEvent } from "billing-kit/testing";
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

const pdf = await billing.generateInvoicePdf({ invoice }); // Buffer
```

More end-to-end scripts: [examples/basic-usage.ts](./examples/basic-usage.ts), [examples/invoices-tax-pdf.ts](./examples/invoices-tax-pdf.ts).

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
  webhookSecrets: [], // previous secrets, accepted during rotation
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

  // Optional pluggable repositories — see Custom repository example
  // (default: in-memory, fine for demos/tests, not for production)
  // invoiceRepository, transactionRepository, webhookEventRepository,
  // auditLogRepository, idempotencyRequestRepository, transferRequestRepository,
  // retryAttemptRepository, entitlementRepository, usageEventRepository,
  // customerProfileRepository,
});
```

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `"stripe" \| "razorpay"` | Payment provider (**required**) |
| `secretKey` | `string` | Stripe secret key or Razorpay key secret (**required**) |
| `keyId` | `string` | Razorpay key ID (**required** for Razorpay) |
| `webhookSecret` | `string` | Current webhook signing secret |
| `webhookSecrets` | `string[]` | Previous secrets, accepted during rotation |
| `currency` | `string` | Default currency (`inr`, `usd`, `eur`, `gbp`, `aed`, `sgd`) |
| `company` | `CompanyDetails` | Seller name/address/tax IDs for invoices and PDFs |
| `tax` | `TaxConfig` | Default tax mode, rate, `autoTax`, seller state/country |
| `retry` | `RetryPolicyConfig` | Dunning / recovery schedule (max retries, intervals, grace period) |
| `retryHooks` | `BillingRetryHooks` | Callbacks for retry lifecycle events |
| `logger` | `Logger` | Structured logger — defaults to a no-op logger |
| `observabilityHooks` | `BillingObservabilityHooks` | `onEvent` / `onSuccess` / `onFailure` monitoring callbacks |
| `auditActor` | `AuditActor` | Default actor recorded on audit log entries |
| `*Repository` | interface | Persist invoices, transactions, webhooks, audit logs, etc. — see [below](#custom-repository-example) |

Every field is validated at construction time (`validateBillingKitConfig`); an invalid provider, missing key, or malformed currency throws `InvalidConfigError` immediately instead of failing on the first API call.

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

// Stripe PaymentIntents are created with capture_method: "manual" by default
if (payment.status === "authorized" || payment.status === "pending") {
  const captured = await billing.capturePayment({
    paymentId: payment.id,
    idempotencyKey: "order_1001_capture",
  });
  console.log(captured.status);
}

// Stripe Customer Portal
const portal = await billing.createBillingPortalSession({
  customerId: customer.id,
  returnUrl: "https://app.example.com/account/billing",
});
// Redirect the browser to portal.url
```

More: [examples/stripe/payments.ts](./examples/stripe/payments.ts), [examples/stripe/subscriptions.ts](./examples/stripe/subscriptions.ts), [examples/stripe/billing-portal.ts](./examples/stripe/billing-portal.ts).

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
  receipt: `rcpt_${Date.now()}`,
  notes: { orderId: "1001" },
});

// After Checkout / your custom UI completes the payment on the client:
const valid = billing.verifyPaymentSignature({
  orderId: order.id,
  paymentId: "pay_xxx",
  signature: "signature_from_checkout_response",
});

if (valid) {
  const payment = await billing.fetchPayment("pay_xxx");
  if (payment.status === "authorized") {
    await billing.capturePayment({ paymentId: payment.id, amount: order.amount });
  }
  console.log(payment.status, payment.amount);
}
```

More: [examples/razorpay/payments.ts](./examples/razorpay/payments.ts), [examples/razorpay/subscriptions.ts](./examples/razorpay/subscriptions.ts), [examples/razorpay/webhooks.ts](./examples/razorpay/webhooks.ts).

---

## Tax example

Supports **GST** (India), **VAT** (with EU reverse charge), and **US sales tax** — all amounts in smallest units.

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

// Intra-state GST → split into CGST + SGST
const intra = billing.calculateGST({ amount: 10000, sellerState: "MH", buyerState: "MH" });

// Inter-state GST → IGST
const inter = billing.calculateGST({ amount: 10000, sellerState: "MH", buyerState: "KA" });

// VAT, and VAT with EU B2B reverse charge (tax ID present)
const vat = billing.calculateVAT({ amount: 10000, rate: 20, country: "IE" });
const reverseCharge = billing.calculateVAT({
  amount: 10000,
  rate: 20,
  country: "DE",
  isBusinessCustomer: true,
  customerTaxId: "DE123456789",
});

// US sales tax
const sales = billing.calculateSalesTax({ amount: 10000, state: "CA", country: "US" });

// Auto-detect GST / VAT / sales tax from country
const auto = billing.calculateTax({ amount: 10000, autoTax: true, country: "DE" });

// Invoices apply tax automatically and expose a summary
const invoice = await billing.generateInvoice({
  customer: { name: "Acme", gstin: "29AAAAA0000A1Z5", isBusinessCustomer: true },
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
| GST | `taxType: "gst"`, or `autoTax` + `country: "IN"` |
| VAT | `taxType: "vat"`, or `autoTax` + a non-US country |
| Sales tax | `taxType: "sales_tax"`, or `autoTax` + `country: "US"` |
| Reverse charge | VAT + `isBusinessCustomer: true` + `customerTaxId` |

---

## Multi-currency example

Amounts are always in the smallest unit of *their own* currency — see [Amounts](#amounts-smallest-currency-units) before converting anything.

```typescript
import { BillingKit, toMinorUnits, formatAmount, TransactionType } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Invoice billed (presented) in USD
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
console.log(formatAmount(usdInvoice.total, "usd")); // "$49.00"

// A charge presented in EUR but settled by the processor in USD:
// record the FX rate and both amounts so revenue reporting stays accurate.
await billing.recordTransaction({
  type: TransactionType.PAYMENT,
  amount: toMinorUnits(19.99, "eur"),
  currency: "eur",
  referenceId: "pi_eur_example",
  presentmentCurrency: "eur",
  settlementCurrency: "usd",
  presentmentAmount: toMinorUnits(19.99, "eur"),
  settlementAmount: toMinorUnits(21.5, "usd"),
  exchangeRate: { rate: 1.075, source: "stripe" },
});

// Revenue broken down by presentment currency *and* by settlement currency
const revenue = await billing.getRevenueByCurrency();
console.log(revenue.byPresentmentCurrency); // [{ currency: "eur", presentmentTotal, ... }]
console.log(revenue.bySettlementCurrency); //  [{ currency: "usd", settlementTotal, ... }]
```

Currency resolution order for invoices and payments when no explicit `currency` is given:

1. Customer / billing profile `defaultCurrency`
2. `BillingKit` config `currency`
3. Fallback: `inr`

---

## Refund and subscription examples

### Refunds

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

Reusing the same `idempotencyKey` with an identical payload returns the stored result. A different payload under the same key throws `IdempotencyConflictError` — safe to retry a refund on a flaky network without risking a double refund.

### Subscriptions

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

await billing.scheduleCancellation(subscription.id); // cancel at period end
await billing.cancelSubscription(subscription.id); // or cancel immediately

const current = await billing.retrieveSubscription(subscription.id);
console.log(current.status); // active | trialing | paused | cancelled | past_due | pending
```

Razorpay uses the same methods, with provider constraints enforced for you: `pauseSubscription` only succeeds from an `active` (or Razorpay `authenticated`) state, and `resumeSubscription` only from `paused` — otherwise a `SubscriptionLifecycleError` is thrown.

More: [examples/stripe/subscriptions.ts](./examples/stripe/subscriptions.ts), [examples/razorpay/subscriptions.ts](./examples/razorpay/subscriptions.ts).

---

## Webhook example

Always verify signatures against the **raw request body**, never a re-serialized JSON object. `processWebhook` additionally dedupes by event id (Stripe `event.id`, Razorpay's `X-Razorpay-Event-Id` header).

```typescript
import { BillingKit, createRawBodyMiddleware, EXPRESS_WEBHOOK_RAW_BODY } from "billing-kit";
import express from "express";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  // webhookEventRepository: /* durable store — required for dedupe across instances */,
});

const app = express();

// Option A — SDK middleware (handles verify → dedupe → your handler)
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    switch (event.normalizedType) {
      case "payment.captured":
        // fulfill order — event.entity.id
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

// Option B — express.raw, same underlying flow
app.post(
  "/webhooks/razorpay",
  express.raw(EXPRESS_WEBHOOK_RAW_BODY),
  async (req, res) => {
    const result = await billing.processWebhookFromHttp(req, async (event) => {
      // event.normalizedType
    });
    res.status(200).json({ ok: true, duplicate: result.duplicate });
  },
);
```

Verify-only, no dedupe (e.g. for a framework without raw-body middleware support):

```typescript
const event = billing.verifyWebhook(rawBody, signature);
```

Test locally without hitting a live provider:

```typescript
import {
  createMockStripePaymentIntentSucceeded,
  createSignedWebhookRequest,
  generateStripeWebhookSignature,
} from "billing-kit/testing";
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for signature/secret-rotation issues and duplicate/out-of-order delivery notes. Runnable fixtures: [examples/testing](./examples/testing/).

---

## Custom repository example

Every stateful entity (invoices, transactions, webhook events, audit logs, idempotency requests, transfer requests, retry attempts, entitlements, usage events, customer profiles) is read/written through a small repository interface. The in-memory defaults are fine for demos and tests, but don't survive a restart — inject your own for production:

```typescript
import type { Invoice, InvoiceRepository } from "billing-kit";
import { BillingKit } from "billing-kit";

class PostgresInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: MyDbClient) {}

  async save(invoice: Invoice): Promise<Invoice> {
    await this.db.query(
      `insert into invoices (id, data) values ($1, $2)
       on conflict (id) do update set data = $2`,
      [invoice.id, invoice],
    );
    return invoice;
  }

  async findById(id: string): Promise<Invoice | null> {
    const row = await this.db.queryOne("select data from invoices where id = $1", [id]);
    return row?.data ?? null;
  }
}

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  invoiceRepository: new PostgresInvoiceRepository(db),
  // webhookEventRepository, auditLogRepository, idempotencyRequestRepository, …
});
```

Every repository interface follows the same shape: a handful of `save`/`find*`/`list` methods, no ORM assumptions. Available config keys: `invoiceRepository`, `transactionRepository`, `webhookEventRepository`, `auditLogRepository`, `idempotencyRequestRepository`, `transferRequestRepository`, `retryAttemptRepository`, `entitlementRepository`, `usageEventRepository`, `customerProfileRepository`. Omit any of them and `BillingKit` falls back to its in-memory implementation.

---

## Provider diagnostics

Use these at startup or behind a `/health` route. They validate **local config only** — no network calls to Stripe/Razorpay — and never return raw secrets (details may include a short masked `hint`, last 4 characters only).

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe", // or "razorpay" + keyId
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  currency: "usd",
  tax: { enabled: true, taxType: "sales_tax", defaultRate: 8 },
});

const health = billing.healthCheck(); // readiness: credentials, currency, webhook, repositories
console.log(health.status, health.ok, health.errors, health.warnings);

const config = billing.verifyProviderConfig(); // deploy-time config review
console.log(config.valid, config.checks.map((c) => [c.id, c.status]));

const report = billing.runDiagnostics(); // health + config + provider recommendations
console.log(report.status, report.recommendations.slice(0, 5));
```

| Method | Use when |
|--------|----------|
| `healthCheck()` | Process readiness / k8s probes |
| `verifyProviderConfig()` | Deploy-time config review |
| `runDiagnostics()` | Support dumps / onboarding |

Every result shares `status` (`healthy` \| `degraded` \| `unhealthy`), `checks[]`, `errors`, `warnings`, `recommendations`, `checkedAt`. See it wired to `GET /health` in [examples/express](./examples/express/).

---

## API reference

### Invoices

| Method | Description |
|--------|-------------|
| `generateInvoice(input)` | Create a local tax invoice |
| `getInvoice(id)` | Fetch invoice by id |
| `getInvoiceSummary(id)` | Totals only |
| `generateInvoicePdf({ invoice })` | Render a PDF `Buffer` |
| `updateInvoiceStatus(id, status)` | Update lifecycle status |

### Payments

| Method | Description |
|--------|-------------|
| `createPayment(input)` | Create a payment / PaymentIntent / order |
| `capturePayment(input)` | Capture an authorized payment |
| `cancelPayment(id)` | Cancel a payment |
| `getPaymentStatus(id)` | Fetch current status |
| `createOrder(input)` | Razorpay order |
| `verifyPaymentSignature(input)` | Razorpay checkout signature check |
| `fetchPayment(id)` / `fetchRefund(id)` | Razorpay fetch helpers |
| `fetchDispute` / `listDisputes` / `acceptDispute` / `contestDispute` / `updateDisputeEvidence` | Dispute management |

### Refunds

| Method | Description |
|--------|-------------|
| `refundPayment(input)` | Full or partial refund, idempotent |

### Subscriptions

| Method | Description |
|--------|-------------|
| `createPlan` / `updatePlan` / `cancelPlan` | Plan management |
| `createSubscription` | Start a subscription |
| `pauseSubscription` / `resumeSubscription` | Pause / resume collection |
| `scheduleCancellation` | Cancel at period end |
| `cancelSubscription` | Cancel immediately |
| `renewSubscription` | Clear a scheduled cancellation |
| `retrieveSubscription` | Fetch + canonical status |
| `reportUsage` | Stripe metered usage |
| `createBillingPortalSession` / `createPaymentMethodUpdateSession` | Stripe Customer Portal URLs |
| `listActiveSubscriptions` / `listCustomerSubscriptions` / `listCustomerInvoices` / `listPaymentMethods` | Customer-facing lookups |

### Tax

| Method | Description |
|--------|-------------|
| `calculateGST(input)` | India GST (CGST/SGST or IGST) |
| `calculateVAT(input)` | VAT, with reverse charge |
| `calculateSalesTax(input)` | Regional US sales tax |
| `calculateTax(input)` | Generic engine (`autoTax` + region detection) |
| `summarizeTax(breakdown)` | Compact, invoice-friendly tax summary |
| `getInvoiceTaxSummary(id)` | Tax summary for a saved invoice |

### Transactions & multi-currency reporting

| Method | Description |
|--------|-------------|
| `recordTransaction(input)` | Record a payment/refund/subscription/chargeback event |
| `getTransaction(id)` | Fetch a recorded transaction |
| `getRevenueByCurrency(filter?)` | Revenue grouped by presentment and settlement currency |
| `getSettlementSummary(filter?)` | Gross/fee/tax-on-fee/net settlement rollup |

### Webhooks

| Method | Description |
|--------|-------------|
| `verifyWebhook(rawBody, signature)` | Verify + normalize, no dedupe |
| `verifyAndClaimWebhook(request)` | Verify + claim event id (fast-ack flow) |
| `processWebhook(request, handler)` | Verify, dedupe, run handler |
| `processWebhookFromHttp(req, handler)` | Parse headers/raw body from an HTTP request, then process |
| `createWebhookHttpHandler(handler, options?)` | Express-style route adapter |
| `listWebhookEvents()` | Persisted webhook records |

Helpers: `createRawBodyMiddleware()`, `ensureRawWebhookBody()`, `parseWebhookRequest()`, `parseWebhookRequestFromHttp()`, `EXPRESS_WEBHOOK_RAW_BODY`.

### Diagnostics

| Method | Description |
|--------|-------------|
| `healthCheck()` | Credentials, currency, webhook presence, repositories → `HealthCheckResult` |
| `verifyProviderConfig()` | Provider/tax/currency/webhook shape → `ProviderConfigVerification` |
| `runDiagnostics()` | Combined report + recommendations → `DiagnosticsReport` |

No network calls; secrets are never returned. See [Provider diagnostics](#provider-diagnostics).

### Other surfaces

| Area | Methods |
|------|---------|
| Coupons & promotions | `registerCoupon`, `applyCoupon`, `createPromotionCode`, `applyPromotionCode`, `applyCheckoutDiscount`, `deactivateCoupon` |
| Customer profiles | `createCustomerProfile`, `updateCustomerProfile`, `getCustomerProfile`, `attachPaymentMethod`, `setDefaultPaymentMethod` |
| Entitlements | `setPlanFeatures`, `hasFeature`, `listFeatures`, `syncSubscriptionEntitlements`, `revokeFeatureAccess`, `restoreFeatureAccess` |
| Usage billing | `recordUsageEvent`, `aggregateUsage`, `priceUsage`, `usageToInvoiceLineItems`, `generateUsageInvoice` |
| Route / payouts (Razorpay) | `calculateSplit`, `splitPayment`, `createTransfer`, `reverseTransfer`, `getSettlementDetails` |
| Dunning / retries | `openBillingAttempt`, `reportBillingFailure`, `reportBillingRecovered`, `processDueRetries`, `runRecoveryCycle` |
| Audit log | `recordBillingEvent`, `getInvoiceTimeline`, `getPaymentAuditLog`, `listAuditEvents` |

The full, always-current type surface is in `dist/index.d.ts` after `npm run build` — every method above is fully typed with request/response interfaces exported from `billing-kit`.

---

## npm scripts

```bash
npm install
npm run lint              # eslint
npm run typecheck         # tsc --noEmit
npm test                  # jest
npm run build             # tsup → dist (CJS + ESM + .d.ts / .d.mts)
npm run validate:package  # docs + dist entrypoints + CJS/ESM smoke load
npm run validate:pack     # validate:package + npm pack tarball contents
npm run release:check     # SemVer / changelog / workflow / publish safety checks
npm run release:notes     # print the CHANGELOG section for the current version
npm run ci                # lint + typecheck + test + build + release:check + validate:pack
npm run format            # prettier
```

GitHub Actions CI runs the same checks on Node 18 / 20 / 22 and uploads an `npm pack` artifact. `prepack` builds and validates entrypoints; `prepublishOnly` runs lint, typecheck, tests, and release checks before anything reaches the registry. Pushing a `v*` tag runs the publish workflow with OIDC provenance.

See [PUBLISHING.md](./PUBLISHING.md) for the full publish guide, [VERSIONING.md](./VERSIONING.md) for SemVer policy, [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for the per-release checklist, and [UPGRADING.md](./UPGRADING.md) for consumer migration notes.

---

## Amounts (smallest currency units)

All API amounts are **integers in the smallest currency unit** — the same convention Stripe and Razorpay use natively. Never pass a major-unit decimal like `99.99`; billing-kit will reject non-integer or negative amounts rather than silently misbill someone.

| Currency | Unit | Example |
|----------|------|---------|
| `inr` | paise | `99900` = ₹999.00 |
| `usd` | cents | `4900` = $49.00 |
| `eur` | cents | `1999` = €19.99 |
| `gbp` | pence | `1000` = £10.00 |
| `aed` | fils | `100` = AED 1.00 |
| `sgd` | cents | `2500` = S$25.00 |

Convert and validate with the exported helpers instead of hand-rolling `* 100`:

```typescript
import {
  toMinorUnits,
  fromMinorUnits,
  formatAmount,
  assertSmallestUnitAmount,
  listSupportedCurrencies,
} from "billing-kit";

toMinorUnits(999, "inr"); // 99900  — major → minor
fromMinorUnits(99900, "inr"); // 999 — minor → major
formatAmount(99900, "inr"); // "₹999.00"
assertSmallestUnitAmount(4900, { currency: "usd" }); // 4900, throws on 49.00 or -1
listSupportedCurrencies(); // ["inr", "usd", "eur", "gbp", "aed", "sgd"]
```

Currency resolution order when a call doesn't pass one explicitly: explicit `currency` on the call → customer/profile `defaultCurrency` → `BillingKit` config `currency` → `inr`. Mixing line-item currencies inside one invoice is rejected by `assertLineItemCurrencies` unless every line agrees.

---

## License

[MIT](./LICENSE) © Damandeep
