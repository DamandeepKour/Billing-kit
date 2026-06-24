# billing-kit — NPM Package Guide

A backend-only Node.js + TypeScript library for invoicing, payments, GST/tax, subscriptions, refunds, and webhooks. No frontend — consumers install it and call it from their own server.

```bash
npm install billing-kit
```

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
});

await billing.createInvoice({ ... });
await billing.createPayment({ ... });
await billing.refundPayment({ ... });
```

---

## 1. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Node.js 18+** | LTS, native `fetch`, wide deployment support |
| Language | **TypeScript 5.x** | First-class types for consumers; `.d.ts` shipped on publish |
| Payment provider (v1) | **Stripe** | Invoices, payments, refunds, subscriptions, webhooks |
| Tax (v1) | **Built-in GST module** | India GST (CGST/SGST/IGST); extensible for other regions later |
| Build | **tsup** or **tsc** | Single ESM + CJS bundle, tree-shakeable |
| Tests | **Vitest** | Fast, native TS, good for unit + integration mocks |
| Lint / format | **ESLint + Prettier** | Consistent public API surface |
| Validation | **Zod** (optional) | Runtime validation of config and input payloads |

**Not included (by design):** Express/Fastify server, database, UI, auth. Those stay in the host app; `billing-kit` is pure business logic + provider adapters.

---

## 2. Target Folder Structure

```
billing-kit/
├── src/
│   ├── index.ts                 # Public entry — exports BillingKit + types
│   ├── BillingKit.ts            # Main facade class
│   ├── types/
│   │   ├── config.ts
│   │   ├── invoice.ts
│   │   ├── payment.ts
│   │   ├── tax.ts
│   │   └── index.ts
│   ├── invoice/
│   │   ├── InvoiceService.ts
│   │   └── index.ts
│   ├── payment/
│   │   ├── PaymentService.ts
│   │   ├── providers/
│   │   │   ├── PaymentProvider.ts   # Interface
│   │   │   └── StripeProvider.ts
│   │   └── index.ts
│   ├── tax/
│   │   ├── GSTCalculator.ts
│   │   └── index.ts
│   ├── subscription/
│   │   ├── SubscriptionService.ts
│   │   └── index.ts
│   ├── refund/
│   │   ├── RefundService.ts
│   │   └── index.ts
│   ├── webhook/
│   │   ├── WebhookHandler.ts
│   │   └── index.ts
│   └── utils/
│       ├── errors.ts
│       └── currency.ts
├── tests/
│   ├── invoice.test.ts
│   ├── payment.test.ts
│   ├── tax.test.ts
│   └── webhook.test.ts
├── examples/
│   ├── express-server.ts        # How to wire webhooks in Express
│   └── basic-usage.ts
├── README.md
├── PACKAGE_GUIDE.md             # This file
├── package.json
└── tsconfig.json
```

---

## 3. Public API Design (What Consumers Use)

Everything flows through one class: **`BillingKit`**. Internal modules stay private; only documented methods and types are exported from `src/index.ts`.

### 3.1 Configuration

```typescript
// src/types/config.ts
export type BillingProvider = "stripe";

export interface BillingKitConfig {
  provider: BillingProvider;
  secretKey: string;
  webhookSecret?: string;       // Required if using verifyWebhook()
  currency?: string;            // Default: "inr"
  tax?: {
    enabled: boolean;
    defaultRate?: number;       // e.g. 18 for 18% GST
    stateCode?: string;         // For CGST/SGST vs IGST
  };
}
```

### 3.2 Main Class

```typescript
// src/BillingKit.ts
export class BillingKit {
  constructor(config: BillingKitConfig);

  // Invoice
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  getInvoice(invoiceId: string): Promise<Invoice>;
  finalizeInvoice(invoiceId: string): Promise<Invoice>;

  // Payment
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  getPayment(paymentId: string): Promise<Payment>;

  // Tax (standalone — also used inside createInvoice)
  calculateTax(input: TaxCalculationInput): TaxBreakdown;

  // Subscription (v1.1+ or optional in v1)
  createSubscription(input: CreateSubscriptionInput): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<Subscription>;

  // Refund
  refundPayment(input: RefundPaymentInput): Promise<Refund>;

  // Webhook
  verifyWebhook(payload: string | Buffer, signature: string): WebhookEvent;
  handleWebhook(event: WebhookEvent): Promise<void>;  // Optional default handlers
}
```

### 3.3 Core Types (exported)

```typescript
// Invoice
export interface CreateInvoiceInput {
  customerId: string;
  lineItems: LineItem[];
  dueDate?: Date;
  metadata?: Record<string, string>;
  applyTax?: boolean;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitAmount: number;   // in smallest currency unit (paise for INR)
  taxRate?: number;
}

export interface Invoice {
  id: string;
  number: string;
  status: "draft" | "open" | "paid" | "void";
  subtotal: number;
  tax: TaxBreakdown;
  total: number;
  currency: string;
  hostedInvoiceUrl?: string;
}

// Payment
export interface CreatePaymentInput {
  amount: number;
  currency?: string;
  customerId?: string;
  invoiceId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

export interface Payment {
  id: string;
  status: "pending" | "succeeded" | "failed";
  amount: number;
  currency: string;
}

// Tax (GST)
export interface TaxCalculationInput {
  amount: number;
  rate?: number;
  sellerState: string;
  buyerState: string;
}

export interface TaxBreakdown {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
}

// Refund
export interface RefundPaymentInput {
  paymentId: string;
  amount?: number;      // Partial refund; omit for full
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  status: "pending" | "succeeded" | "failed";
}

// Webhook
export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
}
```

---

## 4. Module Responsibilities

### 4.1 `invoice/`

| Method | Responsibility |
|--------|----------------|
| `createInvoice` | Build line items, apply GST via `tax/`, call Stripe Invoices API (or create local draft) |
| `getInvoice` | Fetch by ID from provider |
| `finalizeInvoice` | Lock invoice and make it payable |

**Stripe mapping:** `stripe.invoices.create`, `invoiceItems.create`, `invoices.finalizeInvoice`.

### 4.2 `payment/`

| Method | Responsibility |
|--------|----------------|
| `createPayment` | PaymentIntent or charge linked to invoice/customer |
| `getPayment` | Status and amount |

**Provider pattern:** `PaymentProvider` interface so Razorpay/PayPal can be added later without breaking the public API.

```typescript
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  getPayment(id: string): Promise<Payment>;
  refund(input: RefundPaymentInput): Promise<Refund>;
}
```

### 4.3 `tax/` (GST)

Pure functions — no external API in v1.

| Rule | Logic |
|------|--------|
| Same state (seller === buyer) | Split rate: CGST = SGST = rate/2 |
| Different states | IGST = full rate |
| Export / SEZ | Extend later with `taxExempt` flag |

```typescript
// Example: ₹10,000 @ 18%, same state
calculateTax({ amount: 10000, rate: 18, sellerState: "MH", buyerState: "MH" });
// → cgst: 900, sgst: 900, igst: 0, totalTax: 1800, total: 11800
```

### 4.4 `subscription/`

Wraps Stripe Subscriptions: plan/price ID, customer, trial, cancel at period end. Can ship in v1.0 or v1.1 depending on scope.

### 4.5 `refund/`

Delegates to `PaymentProvider.refund()`. Supports full and partial refunds with idempotency keys (pass through to Stripe).

### 4.6 `webhook/`

| Method | Responsibility |
|--------|----------------|
| `verifyWebhook` | HMAC verify using `webhookSecret` (Stripe-Signature header) |
| `handleWebhook` | Parse event type; optional callbacks for `invoice.paid`, `payment_intent.succeeded`, etc. |

Consumers still own the HTTP route; the library only verifies and parses.

---

## 5. How Host Apps Expose HTTP (For “Someone Else”)

`billing-kit` does **not** start a server. The consumer’s Express/Fastify/Nest app adds routes that call your SDK.

### 5.1 Example: Express webhook route

```typescript
// examples/express-server.ts
import express from "express";
import { BillingKit } from "billing-kit";

const app = express();
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

// Stripe needs raw body for signature verification
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"] as string;
      const event = billing.verifyWebhook(req.body, sig);

      switch (event.type) {
        case "invoice.paid":
          // Update your DB, send email, etc.
          break;
        case "payment_intent.payment_failed":
          break;
      }

      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }
  }
);
```

### 5.2 Example: REST API wrapper (consumer’s API)

Your package gives **SDK methods**; the consumer maps them to REST if they want a public API:

| Consumer REST endpoint | billing-kit call |
|------------------------|------------------|
| `POST /api/invoices` | `billing.createInvoice(body)` |
| `GET /api/invoices/:id` | `billing.getInvoice(id)` |
| `POST /api/payments` | `billing.createPayment(body)` |
| `POST /api/payments/:id/refund` | `billing.refundPayment({ paymentId: id, ... })` |
| `POST /webhooks/stripe` | `billing.verifyWebhook(...)` |

### 5.3 Example: Direct usage in a service layer

```typescript
// consumer's services/billingService.ts
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  tax: { enabled: true, defaultRate: 18, stateCode: "MH" },
});

export async function issueInvoiceForOrder(order: Order) {
  return billing.createInvoice({
    customerId: order.stripeCustomerId,
    lineItems: order.items.map((i) => ({
      description: i.name,
      quantity: i.qty,
      unitAmount: i.priceInPaise,
    })),
    applyTax: true,
    metadata: { orderId: order.id },
  });
}
```

---

## 6. `package.json` (Publish-Ready Sketch)

```json
{
  "name": "billing-kit",
  "version": "1.0.0",
  "description": "Invoicing, GST, Stripe payments, refunds, and webhooks for Node.js",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0",
    "@types/node": "^20.0.0"
  },
  "keywords": ["billing", "invoice", "gst", "stripe", "payments", "webhooks"]
}
```

---

## 7. `tsconfig.json` (Sketch)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 8. Error Handling Convention

Export typed errors so consumers can branch cleanly:

```typescript
export class BillingKitError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export class PaymentFailedError extends BillingKitError {}
export class WebhookVerificationError extends BillingKitError {}
export class InvalidConfigError extends BillingKitError {}
```

---

## 9. Version 1.0 Scope Checklist

| Feature | v1.0 | Notes |
|---------|------|-------|
| Invoice generation | ✅ | Draft + finalize via Stripe |
| GST calculation | ✅ | CGST/SGST/IGST, same/different state |
| Stripe payments | ✅ | PaymentIntents |
| Refunds | ✅ | Full + partial |
| Webhooks | ✅ | Verify + typed event payload |
| TypeScript types | ✅ | Exported from package |
| Subscriptions | ⚠️ Optional | Stripe wrapper; can defer to v1.1 |
| Multi-provider | ❌ v2 | Interface ready; only Stripe implemented |

---

## 10. Implementation Order (Recommended)

1. **Scaffold** — `package.json`, `tsconfig`, `src/index.ts`, `BillingKit` shell  
2. **tax/** — GST calculator + unit tests (no Stripe dependency)  
3. **payment/providers** — `PaymentProvider` + `StripeProvider`  
4. **invoice/** — compose tax + Stripe invoices  
5. **refund/** — thin wrapper over provider  
6. **webhook/** — verify + event types  
7. **subscription/** — if in v1 scope  
8. **examples/** — `basic-usage.ts`, `express-server.ts`  
9. **README** — install, config, API reference, webhook setup  
10. **Publish** — `npm publish` (scoped name `@yourorg/billing-kit` if `billing-kit` is taken)

---

## 11. Testing Strategy

| Module | Test type |
|--------|-----------|
| `tax/GSTCalculator` | Unit — pure math, edge cases (0%, exempt) |
| `StripeProvider` | Integration — Stripe test mode + mocked HTTP (msw or stripe-mock) |
| `WebhookHandler` | Unit — fixture payloads + invalid signatures |
| `BillingKit` | Integration — facade calls with mocked provider |

Use env vars in CI: `STRIPE_SECRET_KEY=sk_test_...` (never commit keys).

---

## 12. Security Notes for Consumers

- Keep `secretKey` and `webhookSecret` in environment variables only.  
- Always use `verifyWebhook` before trusting webhook bodies.  
- Use Stripe idempotency keys for `createPayment` / `refundPayment` in high-traffic apps (expose as optional `idempotencyKey` on inputs).  
- Amounts in **smallest currency unit** (paise/cents) to avoid float bugs.

---

## 13. README Outline (for npm page)

1. Install  
2. Quick start (3–5 lines)  
3. Configuration  
4. API reference (link to types or table of methods)  
5. GST examples  
6. Webhook setup (Express snippet)  
7. Environment variables  
8. License  

---

## 14. Next Steps

1. Initialize the repo: `npm init`, add TypeScript + tsup + vitest + stripe.  
2. Implement `GSTCalculator` and tests first (fast feedback, no API keys).  
3. Implement `StripeProvider` behind `PaymentProvider` interface.  
4. Wire `BillingKit` facade and export public types from `src/index.ts`.  
5. Add `examples/basic-usage.ts` and document in README.  
6. Publish to npm (or private registry) as `1.0.0`.

If you want, the next pass can scaffold the actual `src/` files and a minimal working `createInvoice` + `calculateTax` implementation.
