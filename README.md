# billing-kit

Framework-agnostic Node.js billing SDK for invoices, tax (GST / VAT), Stripe and Razorpay payments, subscriptions, refunds, webhooks, and PDF generation.

```bash
npm install billing-kit
```

Requires **Node.js 18+**. TypeScript types are included.

---

## Features
- **Invoices** — line items, discounts, tax, numbering, PDF export
- **Payments** — create, capture, cancel, status (Stripe PaymentIntents / Razorpay Orders)
- **Refunds** — full and partial, with optional idempotency keys
- **Subscriptions** — plans, create, pause / resume, cancel, schedule cancellation, renew
- **Tax** — GST (CGST/SGST/IGST), VAT, sales tax, `autoTax`, place of supply
- **Multi-currency** — `inr`, `usd`, `eur`, `gbp`, `aed`, `sgd` (amounts in smallest units)
- **Webhooks** — signature verification, normalized events, idempotent processing
- **Billing portal** — Stripe Customer Portal sessions and payment-method update flows
- **Pluggable storage** — inject your own invoice / transaction / webhook repositories
- **Idempotency** — safe retries for payments, refunds, and Route transfers
- **Observability** — structured logger, success/failure hooks, audit correlation fields
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
import { createMockStripeEvent, signStripePayload } from "billing-kit/testing";
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
| `webhookSecret` | `string` | Webhook signing secret |
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

## GST / VAT tax example

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: { enabled: true, sellerState: "MH", sellerCountry: "IN" },
});

// Intra-state GST → CGST + SGST
const intra = billing.calculateGST({
  amount: 10000, // ₹100.00
  sellerState: "MH",
  buyerState: "MH",
});
// intra.lines → CGST 9% + SGST 9%

// Inter-state GST → IGST
const inter = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "KA",
});
// inter.lines → IGST 18%

// VAT
const vat = billing.calculateVAT({
  amount: 10000,
  rate: 20,
  country: "IE",
});

// Invoice with tax applied
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

console.log(invoice.tax.total, invoice.total);
```

---

## Multi-currency example

Supported currencies: **`inr`**, **`usd`**, **`eur`**, **`gbp`**, **`aed`**, **`sgd`**.

```typescript
import {
  BillingKit,
  toMinorUnits,
  fromMinorUnits,
  formatAmount,
  convertSmallestUnit,
} from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "usd",
});

toMinorUnits(49, "usd"); // 4900
fromMinorUnits(4900, "usd"); // 49
formatAmount(4900, "usd"); // "$49.00"
convertSmallestUnit(4900, "usd"); // 49 (alias-friendly helper)

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
  lineItems: [{ description: "Pro", quantity: 1, unitAmount: 4900 }],
  taxMode: "none",
});

const inrPayment = await billing.createPayment({
  amount: 99900,
  currency: "inr",
  presentmentCurrency: "inr",
  settlementCurrency: "usd",
});
```

Currency resolution order:

1. Explicit `currency` on the call  
2. Customer / profile default (invoices)  
3. `BillingKit` config `currency`  
4. Fallback: `inr`

---

## Webhook example

Always verify signatures against the **raw request body** (not a re-serialized JSON object).

```typescript
import { BillingKit } from "billing-kit";
import express from "express";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

const app = express();

app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const result = await billing.processWebhook(
        {
          rawBody: req.body,
          signature: req.headers["stripe-signature"] as string,
        },
        async (event) => {
          switch (event.normalizedType) {
            case "payment.succeeded":
              // fulfill order — event.entity.id
              break;
            case "payment.failed":
              // notify customer
              break;
            case "subscription.activated":
              // provision access
              break;
          }
        },
      );

      // Duplicates / out-of-order deliveries are safe no-ops
      if (result.duplicate) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(400).send("Webhook Error");
    }
  },
);
```

Verify-only (no handler / persistence):

```typescript
const event = billing.verifyWebhook(rawBody, signature);
```

Local fixtures: `import { ... } from "billing-kit/testing"`.

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
| `IdempotencyConflictError` | `IDEMPOTENCY_CONFLICT` | Key reused with different payload |
| `WebhookVerificationError` | `WEBHOOK_VERIFICATION_FAILED` | Bad signature |
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
import { toMinorUnits, fromMinorUnits, formatAmount } from "billing-kit";

toMinorUnits(999, "inr"); // 99900
fromMinorUnits(99900, "inr"); // 999
formatAmount(99900, "inr"); // "₹999.00"
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

### Tax

| Method | Description |
|--------|-------------|
| `calculateGST(input)` | India GST breakdown |
| `calculateVAT(input)` | VAT breakdown |
| `calculateTax(input)` | Generic tax engine |

### Webhooks

| Method | Description |
|--------|-------------|
| `verifyWebhook(rawBody, signature)` | Verify + normalize |
| `processWebhook(request, handler)` | Verify, dedupe, handle |
| `createRawWebhookHandler(handler)` | Express-style adapter |
| `listWebhookEvents()` | Persisted webhook records |

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
| `recordBillingEvent` | Append audit entry |
| `getInvoiceTimeline` / `getPaymentAuditLog` | Audit timelines |
| `listAuditEvents` | Filter audit log |
| `getIdempotencyRequest` / `listIdempotencyRequests` | Idempotency store |

---

## npm scripts

```bash
npm install
npm run build    # tsup → dist (CJS + ESM + .d.ts)
npm test         # jest
npm run lint     # eslint
npm run format   # prettier
```

`prepublishOnly` runs `build` + `test` before `npm publish`.

---

## License

MIT © Damandeep
