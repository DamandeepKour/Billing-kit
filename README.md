# billing-kit

Framework-agnostic Node.js billing SDK for invoices, tax (GST / VAT), Stripe and Razorpay payments, subscriptions, refunds, disputes, webhooks, and PDF generation.

```bash
npm install billing-kit
```

Requires **Node.js 18+**. TypeScript types are included.

Import paths stay simple:

```typescript
import { BillingKit } from "billing-kit";
import {
  createMockStripeEvent,
  generateStripeWebhookSignature,
} from "billing-kit/testing";
```

See [CHANGELOG.md](./CHANGELOG.md) for release history, [PUBLISHING.md](./PUBLISHING.md) for the maintainer release flow, [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for the v1.0.0 first-stable checklist, and [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for webhook signature / secret-rotation issues.

Framework integration examples: [Express](./examples/express/), [Next.js](./examples/nextjs/), [NestJS](./examples/nestjs/) — see [examples/README.md](./examples/README.md).

---

## Features
- **Invoices** — line items, discounts, tax, numbering, PDF export
- **Payments** — create, capture, cancel, status (Stripe PaymentIntents / Razorpay Orders)
- **Customer profiles** — reusable billing address, tax IDs, currency, notes, saved payment methods
- **Split payouts** — Razorpay Route platform/vendor splits, transfers, reversals, settlement details
- **Audit logs** — invoice/payment timelines, masked payloads, pluggable `auditLogRepository`
- **Refunds** — full and partial, with optional idempotency keys
- **Coupons / promos** — fixed & percentage discounts, promotion codes, invoice discount lines
- **Disputes** — fetch/list, Razorpay accept/contest, Stripe evidence, normalized webhook events
- **Subscriptions** — plans, create, pause / resume, cancel, schedule cancellation, renew
- **Entitlements** — plan→feature mapping, `hasFeature`, provision/revoke on subscription + webhooks
- **Usage billing** — metered events, day/month/cycle aggregation, per-seat & consumption pricing
- **Tax** — GST (CGST/SGST/IGST), VAT, sales tax, `autoTax`, place of supply
- **Multi-currency** — `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd` (amounts in smallest units)
- **Webhooks** — signature verification, normalized events, idempotent processing
- **Webhook testing** — Stripe/Razorpay fixtures, local signature helpers (`billing-kit/testing`)
- **Billing portal** — Stripe Customer Portal sessions and payment-method update flows
- **Pluggable storage** — inject your own invoice / transaction / webhook repositories
- **Idempotency** — safe retries for payments, refunds, and Route transfers
- **Dunning / recovery** — failed payment & invoice retries, grace period, uncollectible
- **Observability** — structured logger, success/failure hooks, audit correlation fields
- **Diagnostics** — `healthCheck`, `verifyProviderConfig`, and `runDiagnostics` (no secret leakage)
- **Error normalization** — `BillingAuthError`, `BillingValidationError`, `BillingRetryableError`

---

## Installation

```bash
npm install billing-kit
```

```typescript
import { BillingKit } from "billing-kit";
```

CommonJS:

```js
const { BillingKit } = require("billing-kit");
```

Webhook test helpers (optional):

```typescript
import {
  createMockStripeEvent,
  generateStripeWebhookSignature,
} from "billing-kit/testing";
```

---

## Framework examples

| Framework | Path | Notes |
|-----------|------|--------|
| Express | [examples/express](./examples/express/) | Raw-body webhooks via `createRawBodyMiddleware()` |
| Next.js | [examples/nextjs](./examples/nextjs/) | App Router route handlers + `request.text()` |
| NestJS | [examples/nestjs](./examples/nestjs/) | Module / service / controller |

Each includes `.env.example` plus payment, invoice, refund, and webhook samples. Index: [examples/README.md](./examples/README.md).

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

// Tax preview (amounts in paise)
const tax = billing.calculateGST({
  amount: 10000, // ₹100.00
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
    { description: "Pro Plan", quantity: 1, unitAmount: 99900 }, // ₹999.00
  ],
});

const pdf = await billing.generateInvoicePdf({ invoice });
const payment = await billing.createPayment({
  amount: invoice.total,
  currency: invoice.currency,
  idempotencyKey: "checkout_ord_123",
});
```

> **Amounts are always in the smallest currency unit** (paise / cents).  
> `99900` = ₹999.00 · `4900` = $49.00

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
  currency: "inr", // default currency (smallest-unit amounts)
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
});
```

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `"stripe" \| "razorpay"` | Payment provider |
| `secretKey` | `string` | Stripe secret key or Razorpay key secret |
| `keyId` | `string` | Razorpay key ID (required for Razorpay) |
| `webhookSecret` | `string` | Current webhook signing secret |
| `webhookSecrets` | `string[]` | Previous secrets during rotation (retries) |
| `currency` | `string` | Default ISO currency (`inr`, `usd`, …) |
| `company` | `CompanyDetails` | Seller details for invoices / PDFs |
| `tax` | `TaxConfig` | Default tax behavior |
| `retry` | `RetryPolicyConfig` | Dunning / recovery policy |
| `logger` | `Logger` | Structured logger (default: noop) |
| `observabilityHooks` | `BillingObservabilityHooks` | Success / failure monitoring |
| `*Repository` | interfaces | Persist invoices, transactions, webhooks, audits, etc. |

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

// Manual capture flow (PaymentIntents are created with capture_method: manual)
const captured = await billing.capturePayment({
  paymentId: payment.id,
  idempotencyKey: "order_1001_capture",
});

console.log(captured.status, captured.observability?.durationMs);
```

Self-serve Customer Portal:

```typescript
const portal = await billing.createBillingPortalSession({
  customerId: customer.id,
  returnUrl: "https://app.example.com/account/billing",
});
// Redirect the browser to portal.url
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

// Create an order for Checkout / custom UI
const order = await billing.createOrder({
  amount: 99900, // ₹999.00
  currency: "inr",
  receipt: "rcpt_1001",
  notes: { orderId: "1001" },
});

// After the customer pays on the client, verify the signature
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

## GST / VAT / sales tax example

billing-kit includes a tax engine for **GST** (India), **VAT** (EU and other), and **regional sales tax** (US). Amounts are in smallest currency units.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: {
    enabled: true,
    autoTax: true, // detect GST / VAT / sales tax from country
    defaultRate: 18,
    taxType: "gst",
    sellerState: "MH",
    sellerCountry: "IN",
  },
});

// Intra-state GST → CGST + SGST
const intra = billing.calculateGST({
  amount: 10000, // ₹100.00
  sellerState: "MH",
  buyerState: "MH",
  customerTaxId: "27AAAAA0000A1Z5",
});
// intra.taxLines → CGST 9% + SGST 9%

// Inter-state GST → IGST
const inter = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "KA",
});
// inter.taxLines → IGST 18%

// VAT (explicit) + reverse charge for EU B2B with tax ID
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
// reverse.reverseCharge === true, totalTax === 0

// US sales tax (region table, or pass rate)
const sales = billing.calculateSalesTax({
  amount: 10000,
  state: "CA",
  country: "US",
});

// Auto tax from country
const auto = billing.calculateTax({
  amount: 10000,
  autoTax: true,
  country: "DE", // → VAT @ 19%
});

// Invoice applies tax + exposes summary
const invoice = await billing.generateInvoice({
  customer: {
    name: "Acme",
    gstin: "29AAAAA0000A1Z5",
    customerTaxId: "29AAAAA0000A1Z5",
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

console.log(invoice.tax.taxLines, invoice.tax.totalTax, invoice.total);
const taxSummary = await billing.getInvoiceTaxSummary(invoice.id);
// taxSummary → taxType, taxLines, cgst/sgst/igst or vat/salesTax, totals
```

**Rules of thumb**

| Mode | Trigger |
|------|---------|
| GST | `taxType: "gst"` or `autoTax` + `country: "IN"` |
| VAT | `taxType: "vat"` or `autoTax` + EU (or other non-US) country |
| Sales tax | `taxType: "sales_tax"` or `autoTax` + `country: "US"` |
| Reverse charge | VAT + `isBusinessCustomer` + `customerTaxId` |

---

## Multi-currency example

Supported currencies: **`inr`**, **`usd`**, **`eur`**, **`gbp`**, **`aed`**, **`sgd`**.

All API amounts are **integers in the smallest unit** (paise / cents). Use the helpers below to convert and format.

```typescript
import {
  BillingKit,
  toMinorUnits,
  fromMinorUnits,
  formatAmount,
  convertAmount,
  convertSmallestUnit,
  resolveCurrency,
  assertLineItemCurrencies,
} from "billing-kit";

// Global default currency
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

toMinorUnits(49, "usd"); // 4900
fromMinorUnits(4900, "usd"); // 49
formatAmount(4900, "usd"); // "$49.00"
convertSmallestUnit(99900, "inr"); // 999
convertAmount({ amount: 10000, from: "inr", to: "usd", rate: 0.012 }); // 120

// Per-invoice override (ignores global "usd")
const usdInvoice = await billing.generateInvoice({
  currency: "usd",
  customer: { name: "US Buyer", email: "us@example.com" },
  billingAddress: {
    line1: "1 Market St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  },
  lineItems: [
    { description: "Pro", quantity: 1, unitAmount: 4900, currency: "usd" },
  ],
  taxMode: "none",
});

// Customer default currency (when invoice/payment currency is omitted)
const eurInvoice = await billing.generateInvoice({
  customer: { name: "EU Buyer", defaultCurrency: "eur" },
  billingAddress: {
    line1: "1 Grafton St",
    city: "Dublin",
    state: "D",
    postalCode: "D02",
    country: "IE",
  },
  lineItems: [{ description: "Seat", quantity: 1, unitAmount: 1999 }],
  taxMode: "none",
});

// Per-payment override
const inrPayment = await billing.createPayment({
  amount: toMinorUnits(999, "inr"),
  currency: "inr",
});

// Or via customer profile defaultCurrency
const profile = await billing.createCustomerProfile({
  name: "EU Buyer",
  defaultCurrency: "eur",
  billingAddress: {
    line1: "1 Grafton St",
    city: "Dublin",
    state: "D",
    postalCode: "D02",
    country: "IE",
  },
});
await billing.createPayment({
  amount: 2000,
  customerProfileId: profile.id, // resolves to eur
});
```

Currency resolution order:

1. Explicit `currency` on the call (invoice / payment)  
2. Customer `defaultCurrency` or profile `defaultCurrency`  
3. `BillingKit` config `currency`  
4. Fallback: `inr`

Line items that set `currency` must match the resolved invoice currency (mixed currencies throw `CurrencyMismatchError`).

---

## Webhook example

Always verify signatures against the **raw request body** (not a re-serialized JSON object).
`processWebhook` / `createWebhookHttpHandler` also **dedupe by event id** so duplicate provider deliveries are safe no-ops.

After rotating a Razorpay (or Stripe) webhook secret, keep the previous value in `webhookSecrets` so in-flight retries still verify — see **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)**.

### Idempotent webhook handling

Processed event ids are stored in `webhookEventRepository` (in-memory by default). Replays are ignored (`duplicate: true`), older resource events after a newer one are marked `ignored` (`outOfOrder: true`), and the handler is **not** re-run. Prefer returning **2xx** for both cases so providers stop retrying.

| Provider | Dedupe key |
|----------|------------|
| Stripe | Verified payload `event.id` |
| Razorpay | `X-Razorpay-Event-Id` header (`x-razorpay-event-id`), else SHA-256 body fingerprint |

```typescript
import {
  BillingKit,
  createRawBodyMiddleware,
  InMemoryWebhookEventRepository,
} from "billing-kit";
import express from "express";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  // Durable store for multi-instance dedupe (swap for Redis/Postgres in production)
  webhookEventRepository: new InMemoryWebhookEventRepository(),
});

const app = express();

app.post(
  "/webhooks/razorpay",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    // Normalized shape: event.normalizedType, event.entity.id, event.occurredAt
    switch (event.normalizedType) {
      case "payment.captured":
        // fulfill — safe under provider retries
        break;
      case "payment.failed":
        break;
      case "refund.processed":
        break;
    }
  }),
);

// Or: ack HTTP 200 right after verify + claim, then run the handler
app.post(
  "/webhooks/razorpay-fast",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(
    async (event) => {
      /* slower side effects */
    },
    { fastAcknowledge: true },
  ),
);

// Manual fast-ack composition (verify → claim → 200 → handle)
app.post("/webhooks/razorpay-manual", createRawBodyMiddleware(), async (req, res) => {
  const request = billing.parseWebhookRequest({
    rawBody: req.body,
    headers: req.headers, // includes X-Razorpay-Event-Id when present
  });
  const claim = await billing.verifyAndClaimWebhook(request);
  res.status(200).json({
    ok: true,
    duplicate: claim.duplicate,
    outOfOrder: claim.outOfOrder,
    eventId: claim.record.eventId,
  });
  if (!claim.shouldHandle) return;
  try {
    // fulfill from claim.event.normalizedType / claim.event.entity
    await billing.completeWebhookProcessing(claim.record, { status: "processed" });
  } catch (error) {
    await billing.completeWebhookProcessing(claim.record, {
      status: "failed",
      error,
    });
  }
});
```

### Express (recommended)

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
  // Optional: persist claims in Redis/Postgres for multi-instance dedupe
  // webhookEventRepository: new RedisWebhookEventRepository(),
});

const app = express();

// Option A — SDK middleware (buffers req.rawBody / req.body as Buffer)
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    switch (event.normalizedType) {
      case "payment.captured":
        // fulfill order — event.entity.id
        break;
      case "payment.failed":
        // notify customer
        break;
      case "subscription.activated":
        // provision access
        break;
      case "refund.processed":
        // update refund state
        break;
      case "dispute.created":
      case "dispute.action_required":
        // notify ops / gather evidence
        break;
      case "dispute.lost":
        // access revoked automatically when entitlements are enabled
        break;
      case "dispute.won":
        // access restored automatically when entitlements are enabled
        break;
    }
  }),
);

// Option B — express.raw (same raw-body requirement)
app.post(
  "/webhooks/razorpay",
  express.raw(EXPRESS_WEBHOOK_RAW_BODY),
  async (req, res) => {
    const result = await billing.processWebhookFromHttp(req, async (event) => {
      // event.normalizedType is the internal enum
    });
    if (result.duplicate) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    res.status(200).json({ ok: true });
  },
);
```

Duplicate protection keys:

| Provider | Event id source |
|----------|-----------------|
| Stripe | Verified payload `event.id` |
| Razorpay | `X-Razorpay-Event-Id` header, else SHA-256 body fingerprint |

Failed handler runs are **reclaimable** (provider retries can succeed). Out-of-order resource events are marked `ignored`.

### Helpers

```typescript
import {
  ensureRawWebhookBody,
  parseWebhookRequest,
  normalizeStripeWebhook,
  normalizeRazorpayWebhook,
} from "billing-kit";

// Reject JSON-parsed bodies early
ensureRawWebhookBody(req.body);

// Headers → RawWebhookRequest (signature + Razorpay event id)
const request = billing.parseWebhookRequest({
  rawBody: req.body,
  headers: req.headers,
});

const result = await billing.processWebhook(request, handler);
```

Verify-only (no handler / persistence):

```typescript
const event = billing.verifyWebhook(rawBody, signature);
```

---

## Local webhook testing

Use the `billing-kit/testing` entrypoint for mock Stripe / Razorpay payloads, local signature generation, and signed raw-body requests — no live provider required.

```typescript
import { BillingKit } from "billing-kit";
import {
  createMockRazorpayPaymentCaptured,
  createMockRazorpayRefundProcessed,
  createMockStripePaymentIntentSucceeded,
  createMockStripeChargeRefunded,
  createMockStripeSubscription,
  createSignedWebhookRequest,
  createSignedRazorpayWebhookRequest,
  createSignedStripeWebhookRequest,
  formatWebhookCurl,
  generateRazorpayWebhookSignature,
  generateStripeWebhookSignature,
  webhookFixtures,
} from "billing-kit/testing";

const razorpaySecret = "whsec_rzp_test";
const stripeSecret = "whsec_stripe_test";

// Sample raw-body fixtures (JSON string + parsed object)
const rzpPay = createMockRazorpayPaymentCaptured({ id: "pay_1", amount: 5000 });
const stripePay = createMockStripePaymentIntentSucceeded({ id: "pi_1", amount: 5000 });
// rzpPay.body / stripePay.body → exact raw body to POST

// Sign locally
const rzpSig = generateRazorpayWebhookSignature(rzpPay.body, razorpaySecret);
const stripeSig = generateStripeWebhookSignature(stripePay.body, stripeSecret);

// Or build a full signed request (headers + rawBody + signature)
const signed = createSignedWebhookRequest({
  provider: "razorpay",
  payload: rzpPay,
  secret: razorpaySecret,
  eventId: "evt_local_1", // sets X-Razorpay-Event-Id for dedupe tests
  asBuffer: true,
});

const billing = new BillingKit({
  provider: "razorpay",
  keyId: "rzp_test",
  secretKey: "secret",
  webhookSecret: razorpaySecret,
});

// Verify / process in unit tests
const event = billing.verifyWebhook(signed.rawBody, signed.signature);
// event.normalizedType → "payment.captured"

await billing.processWebhook(signed, async (evt) => {
  // assert side effects from evt.entity.id / evt.normalizedType
});

// Curl for a local Express/Next route (POST the exact signed body)
console.log(
  formatWebhookCurl({
    url: "http://localhost:3000/webhooks/razorpay",
    request: signed,
  }),
);

// Catalog of common fixtures
webhookFixtures.razorpay.paymentCaptured();
webhookFixtures.stripe.invoicePaid();
```

| Helper | Purpose |
|--------|---------|
| `createMockRazorpay*` / `createMockStripe*` | Sample event payloads (`body` = raw JSON) |
| `generateRazorpayWebhookSignature` / `generateStripeWebhookSignature` | Local HMAC / Stripe test header |
| `createSigned*WebhookRequest` | `{ rawBody, signature, headers }` ready for `processWebhook` |
| `formatWebhookCurl` | Print a curl that preserves the signed raw body |
| `webhookFixtures` | Shortcut map of common payment/refund/subscription/dispute events |

CLI examples: [examples/testing](./examples/testing/README.md). Signature failures: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

Subscription lifecycle simulations (Stripe Test Clock style — no live API):

```typescript
import {
  createTestClock,
  createSimulatedSubscription,
  renewSimulatedSubscription,
  failSimulatedPayment,
  upgradeSimulatedSubscription,
  createSimulatedSchedule,
  advanceSchedulePhase,
  toStripeSubscriptionObject,
} from "billing-kit/testing";

const clock = createTestClock(new Date("2026-01-01"));
let sub = createSimulatedSubscription(clock, {
  customerId: "cus_1",
  priceId: "price_pro",
  trialDays: 14,
});
clock.advanceTo(sub.trialEnd!);
sub = renewSimulatedSubscription(sub, clock); // period advance
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
const full = await billing.refundPayment({
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

console.log(partial.status, partial.observability?.correlationId);
```

Reusing the same `idempotencyKey` with the same payload returns the stored result. A different payload with the same key throws `IdempotencyConflictError`.

---

## Customer billing profiles

Store reusable customer billing data once, then pass `customerProfileId` on invoices and payments. Profiles hold billing address, tax IDs, default currency, email, notes, and saved payment methods.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
  tax: { enabled: true, taxType: "gst", sellerState: "KA", defaultRate: 18 },
});

const profile = await billing.createCustomerProfile({
  name: "Ada Lovelace",
  email: "ada@acme.com",
  companyName: "Analytical Engines Pvt Ltd",
  gstin: "29AAAAA0000A1Z5",
  customerTaxId: "29AAAAA0000A1Z5",
  isBusinessCustomer: true,
  defaultCurrency: "inr",
  billingNotes: "Net 30 · PO required",
  billingAddress: {
    line1: "14 MG Road",
    city: "Bengaluru",
    state: "KA",
    postalCode: "560001",
    country: "IN",
  },
  paymentPreferences: {
    allowAutoCharge: true,
    invoiceDelivery: "email",
  },
});

// Save cards / UPI / etc. and pick a default
await billing.attachPaymentMethod({
  profileId: profile.id,
  paymentMethodId: "pm_card_visa",
  type: "card",
  brand: "visa",
  last4: "4242",
  setAsDefault: true,
});

await billing.setDefaultPaymentMethod({
  profileId: profile.id,
  paymentMethodId: "pm_card_visa",
});

// Updates merge into the stored profile
await billing.updateCustomerProfile({
  profileId: profile.id,
  billingNotes: "Net 45",
  defaultCurrency: "usd",
});

// Invoice + payment reuse address, tax IDs, currency, and notes
const invoice = await billing.generateInvoice({
  customerProfileId: profile.id,
  lineItems: [{ description: "Pro seat", quantity: 1, unitAmount: 10000 }],
  taxType: "gst",
  sellerState: "KA",
});
// invoice.customer.gstin, invoice.billingAddress, invoice.currency, invoice.notes

const payment = await billing.createPayment({
  amount: invoice.total,
  customerProfileId: profile.id,
});
// payment.currency from profile; metadata.defaultPaymentMethodId when set

const loaded = await billing.getCustomerProfile(profile.id);
const all = await billing.listCustomerProfiles();
```

Pass `syncProvider: true` on create/attach/set-default to also sync a Stripe Customer and payment methods when using the Stripe gateway.

---

## Coupons & promotion codes

Register coupons (fixed or percentage), attach customer-facing promotion codes, and apply them on invoices, payments, and subscriptions. Discount lines appear on invoices and PDFs.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Fixed (amountOff) and percentage (percentOff) coupons — amounts in smallest units
billing.registerCoupon({
  code: "SAVE20",
  type: "percentage",
  percentOff: 20,
  duration: "once",
  maxRedemptions: 100,
  minAmount: 1000, // require ≥ $10.00
  expiresAt: new Date("2027-01-01"),
});

billing.registerCoupon({
  code: "FLAT500",
  type: "flat",
  amountOff: 500, // $5.00
  currency: "usd",
  duration: "forever",
});

const promo = billing.createPromotionCode({
  code: "LAUNCH20",
  coupon: "SAVE20",
  maxRedemptions: 50,
});

// Preview / cart helpers
const preview = billing.applyPromotionCode({
  amount: 4900,
  code: promo.code,
  currency: "usd",
});
// preview.finalAmount, preview.discountLine

billing.removePromotionCode({ amount: 4900, currency: "usd", code: "LAUNCH20" });
// clears discount math and deactivates the code

// Invoice — discountLines shown on PDF
const invoice = await billing.generateInvoice({
  customer: { name: "Ada" },
  billingAddress: {
    line1: "1 Market St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  },
  lineItems: [{ description: "Pro", quantity: 1, unitAmount: 4900 }],
  promotionCode: "LAUNCH20", // or coupon: { ... }
  taxType: "none",
});
console.log(invoice.discountLines, invoice.discountTotal, invoice.total);

// Payment — charges the discounted amount
await billing.createPayment({
  amount: 4900,
  currency: "usd",
  promotionCode: "LAUNCH20",
});

// Subscription — pass planAmount to compute discountAmount metadata
await billing.createSubscription({
  customerId: "cus_xxx",
  planId: "plan_xxx",
  planAmount: 2900,
  promotionCode: "LAUNCH20",
});
```

Validation covers **expiry**, **usage limits** (`maxRedemptions`), **minimum amount**, inactive codes, and currency mismatches (`CouponError`).

---

## Vendor payout routing (Razorpay Route)

Split a captured payment between the platform and one or more linked vendor accounts. Transfer rules support fixed amounts or percentages; optional platform commission is withheld before routing. Settlement can be held (`onHold`) and reversed later.

Requires `provider: "razorpay"` with Route-enabled linked accounts. Amounts are in the smallest currency unit (paise).

```typescript
import { BillingKit, calculateSplitAllocations } from "billing-kit";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  currency: "inr",
});

// Preview allocations without calling the API
const preview = billing.calculateSplit({
  paymentId: "pay_xxx",
  amount: 10000, // ₹100.00
  platformCommission: { type: "percent", percent: 10 }, // ₹10 platform fee
  transfers: [
    { linkedAccountId: "acc_vendor_a", percent: 60 },
    { linkedAccountId: "acc_vendor_b", percent: 40, onHold: true },
  ],
});
// preview.platformFee → 1000, routedAmount → 9000, allocations → …

// Same math available as a pure helper
calculateSplitAllocations({
  paymentId: "pay_xxx",
  amount: 10000,
  platformCommission: { type: "flat", amount: 500 },
  transfers: [{ linkedAccountId: "acc_vendor", percent: 100 }],
});

// Route the payment (records routedAmount + platformFee on the transaction ledger)
const split = await billing.splitPayment({
  paymentId: "pay_xxx",
  amount: 10000,
  currency: "inr",
  platformCommission: { type: "percent", percent: 10 },
  transfers: [
    { linkedAccountId: "acc_vendor_a", percent: 60 },
    { linkedAccountId: "acc_vendor_b", percent: 40, onHold: true },
  ],
  idempotencyKey: "split_ord_55", // safe retries
});
console.log(split.platformFee, split.routedAmount, split.transfers);

// Direct transfer to a linked account (with or without a source payment)
const transfer = await billing.createTransfer({
  linkedAccountId: "acc_vendor_a",
  amount: 2500,
  currency: "inr",
  paymentId: "pay_xxx", // omit for a direct transfer
  idempotencyKey: "trf_ord_55",
});

// Reverse (full or partial)
await billing.reverseTransfer({
  transferId: transfer.id,
  amount: 1000,
  idempotencyKey: "rev_ord_55",
});

// Settlement / transfer status
const details = await billing.getSettlementDetails({
  transferId: transfer.id, // or settlementId: "setl_xxx"
});
console.log(details.status, details.utr, details.fees);
```

Over-allocation, empty transfer rules, and invalid commissions throw `SplitValidationError`. Stripe (and other non-Route gateways) throw `UnsupportedOperationError`.

### Safe retries (transfer / payout idempotency)

Pass a stable `idempotencyKey` (4–36 chars: letters, numbers, `_`, `-`) on `createTransfer`, `splitPayment`, and `reverseTransfer`. billing-kit stores a **request fingerprint** plus the **provider response** in `transferRequestRepository` (in-memory by default).

| Retry scenario | Behavior |
|----------------|----------|
| Same key + same payload | Returns the stored transfer/split result — **no second provider transfer** |
| Same key + different payload | Throws `IdempotencyConflictError` |
| Same key while first call is in flight | Throws `IdempotencyInFlightError` |
| Definitive failure, then retry with same key | Allowed (claim is reclaimable) |
| Ambiguous / timeout (“uncertain”) | Use `reconcileTransferRequest(key)` — does not create a new logical payout |

Direct Razorpay transfers also send `X-Transfer-Idempotency` to the provider. Pair network retries (`withBackoffRetry`) with the same key:

```typescript
import { BillingKit, withBackoffRetry } from "billing-kit";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  // Durable store for multi-instance payout safety:
  // transferRequestRepository: new RedisTransferRequestRepository(),
});

await withBackoffRetry(
  () =>
    billing.createTransfer({
      linkedAccountId: "acc_vendor",
      amount: 2500,
      paymentId: "pay_xxx",
      idempotencyKey: "payout_ord_55", // reuse on every retry
    }),
  { maxRetries: 3, initialDelayMs: 100 },
);

const stored = await billing.getTransferRequest("payout_ord_55");
// stored.fingerprint, stored.result, stored.providerResponse, stored.providerTransferIds

// After a timeout / uncertain claim:
await billing.reconcileTransferRequest("payout_ord_55");
```

---

## Billing audit logs

Append-only audit trails for invoices, payments, refunds, tax calculations, and webhooks. Each entry stores timestamp, actor, provider, resource id, and a **masked** `payloadSummary` (secrets, tokens, and card-like numbers are redacted via `maskSensitiveFields`).

Invoice/payment/tax/webhook flows record events automatically; use `recordBillingEvent` for custom milestones. Inject `auditLogRepository` (defaults to in-memory) and optional `auditActor`.

```typescript
import { BillingKit, InMemoryAuditLogRepository, maskSensitiveFields } from "billing-kit";

const auditLogRepository = new InMemoryAuditLogRepository();

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  auditLogRepository,
  auditActor: { type: "api", id: "svc_billing", name: "Billing API" },
});

const invoice = await billing.generateInvoice({
  customer: { name: "Ada", email: "ada@example.com" },
  billingAddress: {
    line1: "1 Main St",
    city: "Mumbai",
    state: "MH",
    postalCode: "400001",
    country: "IN",
  },
  lineItems: [{ description: "Pro", quantity: 1, unitAmount: 4900 }],
  taxType: "none",
});
await billing.updateInvoiceStatus(invoice.id, "paid");

// Chronological invoice timeline (created → status → custom events)
const timeline = await billing.getInvoiceTimeline(invoice.id);
// timeline[i].timestamp, .actor, .provider, .resourceId, .payloadSummary

await billing.recordBillingEvent({
  action: "payment.attempted",
  resourceType: "payment",
  resourceId: "pay_123",
  payload: {
    amount: 4900,
    secretKey: "sk_live_should_be_masked", // stored as ****…sked
  },
});
await billing.recordBillingEvent({
  action: "refund.created",
  resourceType: "refund",
  resourceId: "rfnd_123",
  relatedResourceIds: ["pay_123"],
  payload: { paymentId: "pay_123", amount: 1000 },
});

const paymentLog = await billing.getPaymentAuditLog("pay_123");
// includes payment + related refunds/disputes, ordered by timestamp then sequence

const taxEvents = await billing.listAuditEvents({
  resourceType: "tax",
  action: "tax.calculated",
});
const webhooks = await billing.listAuditEvents({ resourceType: "webhook" });

// Standalone masking helper (also used when summarizing payloads)
maskSensitiveFields({ authorization: "Bearer secret", amount: 100 });
```

---

## Dispute example

Chargebacks / disputes are provider-initiated. billing-kit normalizes webhook events and exposes fetch + response APIs.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  keySecret: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});

const dispute = await billing.fetchDispute("disp_xxx");
const open = await billing.listDisputes({ count: 20 });

// Razorpay — accept or contest
await billing.acceptDispute({ disputeId: "disp_xxx" });
await billing.contestDispute({
  disputeId: "disp_yyy",
  amount: 50000,
  summary: "Service was delivered as described",
});

// Stripe — submit evidence
await billing.updateDisputeEvidence({
  disputeId: "dp_xxx",
  evidence: {
    product_description: "Annual Pro plan",
    customer_communication: "file_abc",
  },
  submit: true,
});
```

Normalized webhook types: `dispute.created`, `dispute.under_review`, `dispute.action_required`, `dispute.won`, `dispute.lost`, `dispute.closed`.

With entitlements enabled, `dispute.lost` revokes access and `dispute.won` restores it. `dispute.action_required` does **not** revoke — handle it in your webhook handler.

---

## Dunning & payment recovery

Failed payments and invoices move through: **`pending` → `failed` / `retrying` → `recovered`** or **`uncollectible`**.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  retry: {
    maxRetries: 3,
    // delays after failure #1, #2, #3
    retryIntervalsMs: [
      86_400_000, // 1 day
      259_200_000, // 3 days
      432_000_000, // 5 days
    ],
    gracePeriodMs: 604_800_000, // 7 days after final failure
  },
  retryHooks: {
    onPaymentFailed: async ({ attempt }) => {
      console.log("failed", attempt.referenceId, attempt.lastFailureReason);
    },
    onRetryScheduled: async ({ attempt }) => {
      // schedule charge job for attempt.nextRetryAt
    },
    onPaymentRecovered: async ({ attempt }) => {
      // restore access, send receipt
    },
    onMarkedUncollectible: async ({ attempt }) => {
      // cancel subscription / write off
    },
    onRecoveryEmail: async ({ attempt }) => {
      // send dunning email
    },
    onRecoveryWebhook: async ({ attempt }) => {
      // notify your backend
    },
  },
});

await billing.openBillingAttempt({
  kind: "payment", // or "invoice"
  referenceId: "pi_xxx",
  customerId: "cus_xxx",
  amount: 4900,
  currency: "usd",
});

// On decline / payment.failed webhook
const attempt = await billing.reportBillingFailure({
  kind: "payment",
  referenceId: "pi_xxx",
  reason: "card_declined",
});
// attempt.status === "retrying" while under maxRetries

// Cron: pull due retries and re-charge
const { dueRetries, markedUncollectible } =
  await billing.runRecoveryCycle();

for (const due of dueRetries) {
  try {
    await billing.createPayment({
      amount: due.amount!,
      currency: due.currency,
      customerId: due.customerId,
      metadata: { recoveryFor: due.referenceId },
    });
    await billing.reportBillingRecovered({
      referenceId: due.referenceId,
      kind: due.kind,
    });
  } catch {
    await billing.reportBillingFailure({
      kind: due.kind,
      referenceId: due.referenceId,
      reason: "retry_failed",
    });
  }
}

await billing.markBillingUncollectible("pi_xxx", "payment");
```

Invoice `status` stays in sync (`pending` / `retrying` / `failed` / `recovered` / `uncollectible`) when `kind: "invoice"`.

`processDueRetries()` returns the due list; prefer `runRecoveryCycle()` when you also need grace-period write-offs.

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
  features: ["exports", "sso"],
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

## Feature access control (entitlements)

Map plans to internal feature keys, then gate product access with `hasFeature`. Subscription lifecycle methods and webhooks keep entitlements in sync (provision on create/activate/resume, revoke on cancel/pause/payment failure/dispute lost).

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
  // Optional: durable store for multi-instance feature checks
  // entitlementRepository: new PostgresEntitlementRepository(),
});

// Map a plan (or product price id) to features — also accepted on createPlan({ features })
await billing.setPlanFeatures({
  planId: "price_pro_monthly",
  features: ["sso", "exports", "api_access"],
});

const subscription = await billing.createSubscription({
  customerId: "cus_123",
  planId: "price_pro_monthly",
});
// → syncs entitlements automatically (source: subscription_create)

if (await billing.hasFeature("cus_123", "sso")) {
  // unlock SSO settings
}

const access = await billing.getCustomerFeatureAccess("cus_123");
// access.features → ["api_access", "exports", "sso"]
// access.entitlements → active/paused/revoked rows per subscription

// Manual sync (e.g. after an external status change)
await billing.syncSubscriptionEntitlements({
  subscription: await billing.retrieveSubscription(subscription.id),
  source: "manual",
});

// Explicit revoke / restore (payment recovery also restores payment_failure revokes)
await billing.revokeFeatureAccess({
  customerId: "cus_123",
  source: "manual",
  reason: "compliance hold",
});
await billing.restoreFeatureAccess({ customerId: "cus_123" });

await billing.cancelSubscription(subscription.id);
// → features revoked for that subscription
```

**Auto sync hooks** (no extra wiring required):

| Trigger | Effect |
|---------|--------|
| `createPlan({ features })` / `setPlanFeatures` | Store mapping; refresh active entitlements for that plan |
| `createSubscription` / `resumeSubscription` / `renewSubscription` / `retrieveSubscription` | Provision or refresh |
| `pauseSubscription` / `cancelSubscription` / `scheduleCancellation` | Pause or revoke |
| Webhooks (`subscription.*`, `payment.failed`, `invoice.paid`, `dispute.lost` / `dispute.won`) | Provision, revoke, or restore |

Use `hasFeature(customerId, featureKey)` in middleware/guards. Persist with `entitlementRepository` in production.

---

## Usage-based billing

Record meter events locally, aggregate by **day**, **month**, or **billing cycle**, then turn totals into invoice line items. Use per-seat (`per_unit`) and consumption (`metered`) helpers, or tiered pricing.

Amounts stay in smallest currency units. Stripe `reportUsage` remains available for provider-side metered subscription items.

```typescript
import {
  BillingKit,
  calculateConsumptionAmount,
  calculatePerSeatAmount,
  createConsumptionPrice,
  createPerSeatPrice,
  resolveUsagePeriodRange,
} from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

// Record usage (API calls, seats, storage, …)
await billing.recordUsageEvent({
  customerId: "cus_123",
  meter: "api_calls",
  quantity: 120,
  timestamp: new Date("2026-07-02T10:00:00Z"),
  subscriptionId: "sub_123",
});
await billing.recordUsageEvent({
  customerId: "cus_123",
  meter: "seats",
  quantity: 5,
  timestamp: new Date("2026-07-01T00:00:00Z"),
});

// Billing period windows (UTC). billing_cycle always needs from/to.
const july = resolveUsagePeriodRange({
  period: "billing_cycle",
  from: new Date("2026-07-01T00:00:00Z"),
  to: new Date("2026-08-01T00:00:00Z"),
});
const today = resolveUsagePeriodRange({ period: "day" }); // start/end of UTC day

const totals = await billing.aggregateUsage({
  customerId: "cus_123",
  meter: ["api_calls", "seats"],
  period: "billing_cycle",
  from: july.from,
  to: july.to,
  aggregationMethod: "sum", // or max | last
});

// Per-seat & consumption helpers
const seatPrice = createPerSeatPrice({ unitAmount: 1500, currency: "usd" }); // $15/seat
const apiPrice = createConsumptionPrice({
  meter: "api_calls",
  unitAmount: 2, // $0.02 per call
  currency: "usd",
  description: "API calls",
});
calculatePerSeatAmount(5, 1500); // 7500
calculateConsumptionAmount(120, 2); // 240

// Invoice with metered line items for the cycle
const { invoice, aggregates, lineItems } = await billing.generateUsageInvoice({
  usage: {
    customerId: "cus_123",
    meter: ["api_calls", "seats"],
    period: "billing_cycle",
    from: july.from,
    to: july.to,
  },
  prices: [apiPrice, seatPrice],
  customer: { id: "cus_123", name: "Acme" },
  billingAddress: {
    line1: "1 Meter Way",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "US",
  },
  taxMode: "none",
});

console.log(aggregates, lineItems, invoice.subtotal, invoice.total);

// Or compose manually: aggregate → line items → generateInvoice
const lines = billing.usageToInvoiceLineItems({
  aggregates: totals,
  prices: [apiPrice, seatPrice],
});
```

For Stripe subscription meters, also use `createPlan({ usageType: "metered" })` and `reportUsage({ subscriptionItemId, quantity })`.

---

## Custom repository example

Defaults use in-memory stores (fine for demos). For production, inject persistent repositories:

```typescript
import type { Invoice } from "billing-kit";
import type { InvoiceRepository } from "billing-kit";
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
  // transactionRepository: new PostgresTransactionRepository(),
  // webhookEventRepository: new RedisWebhookEventRepository(),
  // auditLogRepository: new PostgresAuditLogRepository(),
  // idempotencyRequestRepository: new RedisIdempotencyRepository(),
});
```

Available repository hooks on config:

- `invoiceRepository`
- `transactionRepository`
- `webhookEventRepository`
- `auditLogRepository`
- `retryAttemptRepository`
- `customerProfileRepository`
- `usageEventRepository`
- `entitlementRepository`
- `transferRequestRepository`
- `idempotencyRequestRepository`

---

## Diagnostics example

Offline provider readiness checks — no network calls, and secrets are never returned in the result.

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  currency: "inr",
  tax: { enabled: true, taxType: "gst", sellerState: "MH" },
});

const health = billing.healthCheck();
// health.status: "healthy" | "degraded" | "unhealthy"

const config = billing.verifyProviderConfig();
// config.valid === false only when there are failing checks

const report = billing.runDiagnostics();
console.log(report.status, report.errors, report.warnings);
console.log(report.recommendations);
// Razorpay: HTTPS, TLS 1.2+, raw-body signatures, secret rotation, IP allowlisting, …
// Stripe: credential scope, whsec_ webhook secret, raw-body verify, test/live separation, …
```

Use `runDiagnostics()` in boot scripts or admin endpoints. Prefer `healthCheck()` for lightweight readiness probes.

---

## Error handling

All SDK errors extend `BillingKitError` and expose a stable `code`. Provider failures may also include `requestId`, `providerCode`, `provider`, and `statusCode`.

```typescript
import {
  BillingAuthError,
  BillingKitError,
  BillingRetryableError,
  BillingValidationError,
  IdempotencyConflictError,
  InvoiceNotFoundError,
  withBackoffRetry,
} from "billing-kit";

try {
  await withBackoffRetry(
    () =>
      billing.createPayment({
        amount: 5000,
        idempotencyKey: "pay_ord_55",
      }),
    { maxRetries: 3, initialDelayMs: 100 },
  );
} catch (err) {
  if (err instanceof BillingValidationError) {
    // Bad input / declined card — do not retry as-is
  } else if (err instanceof BillingAuthError) {
    // Check API keys / permissions
  } else if (err instanceof BillingRetryableError) {
    // Rate limit / 5xx / network — safe to retry with backoff
    console.error(err.requestId, err.retryAfterMs);
  } else if (err instanceof IdempotencyConflictError) {
    // Same key, different payload
  } else if (err instanceof InvoiceNotFoundError) {
    // Missing invoice
  } else if (err instanceof BillingKitError) {
    console.error(err.code, err.message);
  }
}
```

| Error | Code | Typical cause |
|-------|------|----------------|
| `BillingAuthError` | `BILLING_AUTH_ERROR` | Invalid keys / permissions |
| `BillingValidationError` | `BILLING_VALIDATION_ERROR` | Bad parameters |
| `BillingRetryableError` | `BILLING_RETRYABLE_ERROR` | Rate limits, timeouts, 5xx |
| `StripeCardError` | `STRIPE_CARD_ERROR` | Card declined |
| `StripeAuthenticationError` | `STRIPE_AUTHENTICATION_ERROR` | Bad Stripe key |
| `StripeInvalidRequestError` | `STRIPE_INVALID_REQUEST` | Invalid Stripe params |
| `IdempotencyConflictError` | `IDEMPOTENCY_CONFLICT` | Same key, different request fingerprint (payments/transfers) |
| `IdempotencyInFlightError` | `IDEMPOTENCY_IN_FLIGHT` | Same key still processing |
| `WebhookVerificationError` | `WEBHOOK_VERIFICATION_FAILED` | Bad signature / raw body / secret rotation — see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) |
| `CouponError` | `COUPON_ERROR` | Expired / limit / min amount / inactive promo |
| `UsageBillingError` | `USAGE_BILLING_ERROR` | Invalid usage event / price / period |
| `EntitlementError` | `ENTITLEMENT_ERROR` | Invalid plan mapping / revoke input |
| `CustomerProfileNotFoundError` | `CUSTOMER_PROFILE_NOT_FOUND` | Unknown `customerProfileId` |
| `SplitValidationError` | `SPLIT_VALIDATION_ERROR` | Invalid platform/vendor payout split |
| `InvoiceNotFoundError` | `INVOICE_NOT_FOUND` | Unknown invoice id |
| `UnsupportedOperationError` | `UNSUPPORTED_OPERATION` | Provider does not support the call |

`withBackoffRetry` only retries `BillingRetryableError` / network failures by default. Pair mutating retries with **idempotency keys**.

---

## Amounts (smallest currency units)

All monetary amounts in this SDK are **integers in the smallest currency unit**:

| Currency | Unit | Example |
|----------|------|---------|
| `inr` | paise | `99900` = ₹999.00 |
| `usd` | cents | `4900` = $49.00 |
| `eur` | cents | `1999` = €19.99 |
| `gbp` | pence | `1000` = £10.00 |
| `aed` | fils | `100` = AED 1.00 |
| `sgd` | cents | `2500` = S$25.00 |

Helpers:

```typescript
import {
  toMinorUnits,
  fromMinorUnits,
  formatAmount,
  convertAmount,
  getMinorUnitFactor,
  assertSmallestUnitAmount,
} from "billing-kit";

toMinorUnits(999, "inr"); // 99900
fromMinorUnits(99900, "inr"); // 999
formatAmount(99900, "inr"); // "₹999.00"
getMinorUnitFactor("eur"); // 100
assertSmallestUnitAmount(4900, { currency: "usd" }); // ok
```

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

### Razorpay Route / split payouts

| Method | Description |
|--------|-------------|
| `calculateSplit(input)` | Preview platform fee + vendor allocations |
| `splitPayment(input)` | Route a payment to linked accounts |
| `createTransfer(input)` | Direct or payment-sourced transfer |
| `reverseTransfer(input)` | Full / partial transfer reversal |
| `getSettlementDetails(input)` | Settlement or transfer status |
| `getTransferRequest` / `listTransferRequests` | Lookup stored fingerprint + response |
| `reconcileTransferRequest(key)` | Resolve uncertain / timed-out payout claims |

Pass `idempotencyKey` on `createTransfer` / `splitPayment` / `reverseTransfer` for safe retries (see **Safe retries** above). Persist with `transferRequestRepository`.

Also: `calculateSplitAllocations` (pure helper). Transaction records store `routedAmount`, `platformFee`, and `vendorAmount`.

### Customer billing profiles

| Method | Description |
|--------|-------------|
| `createCustomerProfile(input)` | Create reusable billing profile |
| `updateCustomerProfile(input)` | Update address, tax IDs, currency, notes, prefs |
| `getCustomerProfile(id)` / `listCustomerProfiles()` | Lookup |
| `attachPaymentMethod({ profileId, ... })` | Save a payment method on the profile |
| `setDefaultPaymentMethod({ profileId, ... })` | Set default PM for the profile |

Use `customerProfileId` on `generateInvoice` / `createPayment` to apply stored defaults (customer, address, tax IDs, currency, notes, default PM metadata).

### Coupons / promotions

| Method | Description |
|--------|-------------|
| `registerCoupon(coupon)` | Register fixed or % coupon |
| `createPromotionCode(input)` | Attach a customer-facing code |
| `applyCoupon` / `applyPromotionCode` | Compute discount |
| `removePromotionCode` / `deactivatePromotionCode` | Clear / disable promo |
| `applyCheckoutDiscount` | Cart helper (promo or coupon) |
| `getCoupon` / `getPromotionCode` | Lookup |

Use `promotionCode` or `coupon` on `generateInvoice`, `createPayment`, and `createSubscription`.

### Dunning / recovery

| Method | Description |
|--------|-------------|
| `openBillingAttempt(input)` | Start tracking a payment or invoice |
| `reportBillingFailure(input)` | Record failure → schedule retry or grace |
| `reportBillingRecovered(input)` | Mark recovered |
| `markBillingUncollectible(id, kind?)` | Write off |
| `processDueRetries(now?)` | List retries due now |
| `runRecoveryCycle(now?)` | Due retries + grace → uncollectible |
| `getRetryAttempt` / `listRetryAttempts` | Inspect attempts |

Statuses: `pending`, `failed`, `retrying`, `recovered`, `uncollectible`. Configure via `retry` + `retryHooks`.

### Disputes

| Method | Description |
|--------|-------------|
| `fetchDispute(id)` | Fetch a dispute by id |
| `listDisputes(input?)` | List disputes |
| `acceptDispute(input)` | Accept a Razorpay dispute |
| `contestDispute(input)` | Contest a Razorpay dispute |
| `updateDisputeEvidence(input)` | Submit Stripe dispute evidence |

### Subscriptions

| Method | Description |
|--------|-------------|
| `createPlan` / `updatePlan` / `cancelPlan` | Plan management |
| `createSubscription` | Start subscription |
| `pauseSubscription` / `resumeSubscription` | Pause collection |
| `scheduleCancellation` | Cancel at period / cycle end |
| `cancelSubscription` | Cancel immediately |
| `renewSubscription` | Clear scheduled cancellation |
| `retrieveSubscription` | Fetch + canonical status |
| `reportUsage` | Stripe metered subscription usage |

### Entitlements / feature access

| Method | Description |
|--------|-------------|
| `setPlanFeatures` / `getPlanFeatures` | Map plan/product → feature keys |
| `hasFeature(customerId, featureKey)` | Gate product access |
| `listFeatures` / `getCustomerFeatureAccess` | Active feature set + entitlement rows |
| `syncSubscriptionEntitlements` | Provision/refresh from subscription state |
| `revokeFeatureAccess` / `restoreFeatureAccess` | Explicit revoke / payment-recovery restore |
| `getSubscriptionEntitlement` | Entitlement row for one subscription |

Subscription + webhook flows sync entitlements automatically. Persist with `entitlementRepository`.

### Usage-based billing

| Method | Description |
|--------|-------------|
| `recordUsageEvent` / `getUsageEvent` / `listUsageEvents` | Local usage records |
| `aggregateUsage` | Totals by `day` / `month` / `billing_cycle` |
| `priceUsage` / `usageToInvoiceLineItems` | Price aggregates → amounts / line items |
| `generateUsageInvoice` | Aggregate + invoice in one call |
| `createPerSeatPrice` / `createConsumptionPrice` | Per-seat & metered price builders |
| `calculatePerSeatAmount` / `calculateConsumptionAmount` | Quick charge math |
| `resolveUsagePeriodRange` | UTC day/month/cycle window helper |

Also: `calculatePerSeatAmount`, `createPerSeatPrice`, `resolveUsagePeriodRange` as package exports. Persist with `usageEventRepository`.

### Tax

| Method | Description |
|--------|-------------|
| `calculateGST(input)` | India GST breakdown (CGST/SGST or IGST) |
| `calculateVAT(input)` | VAT breakdown (+ reverse charge) |
| `calculateSalesTax(input)` | Regional sales tax |
| `calculateTax(input)` | Generic engine (`autoTax` + region rules) |
| `summarizeTax(breakdown)` | Compact invoice tax summary |
| `getInvoiceTaxSummary(id)` | Tax summary for a saved invoice |

### Webhooks

| Method | Description |
|--------|-------------|
| `verifyWebhook(rawBody, signature)` | Verify + normalize |
| `verifyAndClaimWebhook(request)` | Verify + durable event-id claim (no handler) |
| `completeWebhookProcessing(record, outcome)` | Mark claimed event processed / failed |
| `processWebhook(request, handler)` | Verify, dedupe, handle |
| `processWebhookFromHttp(req, handler)` | Parse headers/raw body, then process |
| `parseWebhookRequest({ rawBody, headers })` | Build `RawWebhookRequest` (reads `X-Razorpay-Event-Id`) |
| `createWebhookHttpHandler(handler, options?)` | Express-style HTTP adapter (`fastAcknowledge` optional) |
| `createRawWebhookHandler(handler)` | `(RawWebhookRequest) => processWebhook` |
| `listWebhookEvents()` | Persisted webhook records |

Helpers: `createRawBodyMiddleware()`, `ensureRawWebhookBody()`, `parseWebhookRequest()`, `normalizeStripeWebhook()` / `normalizeRazorpayWebhook()`, `EXPRESS_WEBHOOK_RAW_BODY`, `RAZORPAY_EVENT_ID_HEADER`.

Testing (`billing-kit/testing`): `createMockStripe*` / `createMockRazorpay*`, `generate*WebhookSignature`, `createSignedWebhookRequest`, `formatWebhookCurl`, `webhookFixtures`.

### Diagnostics

| Method | Description |
|--------|-------------|
| `healthCheck()` | Credentials, currency, webhook presence, repositories |
| `verifyProviderConfig()` | Provider shape, tax, currency, webhook config |
| `runDiagnostics()` | Full report + provider recommendations |

Results include `status`, `checks`, `errors`, `warnings`, and `recommendations`. Secrets are masked/omitted.

### Stripe billing helpers

| Method | Description |
|--------|-------------|
| `createCustomer` | Create Stripe Customer |
| `attachPaymentMethod` / `setDefaultPaymentMethod` | Payment methods |
| `listPaymentMethods` / `detachPaymentMethod` | List / remove |
| `createBillingPortalSession` | Customer Portal URL |
| `createPaymentMethodUpdateSession` | Portal PM-update deep link |
| `listCustomerInvoices` | Provider invoices |
| `listActiveSubscriptions` | Active subscriptions for a customer |
| `reportUsage` | Metered usage records |

### Storage / audit / ops

| Method | Description |
|--------|-------------|
| `recordTransaction` / `getTransaction` | Ledger events |
| `recordBillingEvent` | Append audit entry (payloads are masked) |
| `getInvoiceTimeline(id)` | Chronological invoice audit trail |
| `getPaymentAuditLog(id)` | Payment + related refund/dispute events |
| `listAuditEvents(filter)` / `getAuditEvent(id)` | Query / fetch audit entries |
| `getIdempotencyRequest` / `listIdempotencyRequests` | Idempotency store |

Config: `auditLogRepository`, `auditActor`. Helper: `maskSensitiveFields` / `summarizePayload`.

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
npm run ci                # lint + typecheck + test + build + validate:pack
npm run format            # prettier
```

GitHub Actions runs the same checks on Node 18 / 20 / 22 for every push and pull request.

Lifecycle hooks:

- `prepublishOnly` — lint, typecheck, test (before `npm publish`)
- `prepack` — build + `validate:package` (before `npm pack` / publish tarball)
- `publishConfig.provenance` — npm provenance attestations when publishing via GitHub Actions OIDC

For maintainers: see **[PUBLISHING.md](./PUBLISHING.md)** (versioning, trusted publishing + provenance), **[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)** (v1.0.0 first stable), and **[CHANGELOG.md](./CHANGELOG.md)**.

---

## License

MIT © Damandeep
