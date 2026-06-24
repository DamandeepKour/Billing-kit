# billing-kit

Backend Node.js + TypeScript NPM package for **invoicing**, **GST tax**, **Stripe payments**, **refunds**, and **webhooks**.

> **Important:** This is an **SDK/library**, not a hosted API server. It does **not** expose HTTP endpoints by itself. You install it in your Node.js app and call methods from your code — or wrap those methods in your own REST routes.

---

## What you need before using

| Requirement | Required for | Where to get it |
|-------------|--------------|-----------------|
| **Node.js 18+** | Everything | [nodejs.org](https://nodejs.org) |
| **Stripe account** | Payments, invoices, refunds | [stripe.com](https://stripe.com) |
| `STRIPE_SECRET_KEY` | All Stripe operations | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification only | Stripe Dashboard → Webhooks → signing secret |
| **Stripe Customer ID** (`cus_xxx`) | Invoices & subscriptions | Create via Stripe API or Dashboard |

### Optional config

| Config | Purpose | Example |
|--------|---------|---------|
| `currency` | Default currency | `"inr"` (default) |
| `tax.enabled` | Apply GST on invoices | `true` |
| `tax.defaultRate` | GST % | `18` |
| `tax.stateCode` | Your business state (seller) | `"MH"` |

Copy env template:

```bash
cp .env.example .env
# Edit .env with your Stripe test keys
```

---

## Install

### As a consumer (after publishing to npm)

```bash
npm install billing-kit
```

### For local development (this repo)

```bash
git clone <your-repo-url>
cd billing-kit
npm install
npm run build
npm test
```

---

## Quick start

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET, // only for webhooks
  currency: "inr",
  tax: {
    enabled: true,
    defaultRate: 18,
    stateCode: "MH", // your seller state
  },
});

// 1. Calculate GST (no Stripe call — runs locally)
const tax = billing.calculateTax({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});
console.log(tax);
// { cgst: 900, sgst: 900, igst: 0, totalTax: 1800, total: 11800 }

// 2. Create invoice (calls Stripe)
const invoice = await billing.createInvoice({
  customerId: "cus_xxxxxxxx",
  lineItems: [
    { description: "Pro plan", quantity: 1, unitAmount: 99900 }, // paise
  ],
  buyerState: "MH",
});

// 3. Create payment (calls Stripe)
const payment = await billing.createPayment({
  amount: 99900,
  customerId: "cus_xxxxxxxx",
});

// 4. Refund (calls Stripe)
const refund = await billing.refundPayment({
  paymentId: payment.id,
  reason: "requested_by_customer",
});
```

---

## SDK API reference (methods you call in code)

These are **not HTTP URLs** — they are TypeScript/JavaScript methods on `BillingKit`:

| Method | Description | Stripe call? |
|--------|-------------|--------------|
| `calculateTax(input)` | GST breakdown (CGST/SGST/IGST) | No |
| `createInvoice(input)` | Create draft invoice with line items | Yes |
| `getInvoice(id)` | Fetch invoice by ID | Yes |
| `finalizeInvoice(id)` | Finalize & make invoice payable | Yes |
| `createPayment(input)` | Create PaymentIntent | Yes |
| `getPayment(id)` | Get payment status | Yes |
| `refundPayment(input)` | Full or partial refund | Yes |
| `createSubscription(input)` | Start subscription | Yes |
| `cancelSubscription(id)` | Cancel at period end | Yes |
| `verifyWebhook(payload, sig)` | Verify Stripe webhook signature | No |
| `handleWebhook(event, handlers)` | Run your handlers by event type | No |

### Input examples

```typescript
// Invoice
await billing.createInvoice({
  customerId: "cus_xxx",
  lineItems: [
    { description: "Item A", quantity: 2, unitAmount: 50000 },
  ],
  dueDate: new Date("2026-07-01"),
  buyerState: "KA",
  metadata: { orderId: "order_123" },
});

// Payment
await billing.createPayment({
  amount: 100000,
  currency: "inr",
  customerId: "cus_xxx",
  paymentMethodId: "pm_xxx", // optional — auto-confirms if set
  metadata: { orderId: "order_123" },
});

// Refund (omit amount for full refund)
await billing.refundPayment({
  paymentId: "pi_xxx",
  amount: 50000,
  reason: "requested_by_customer",
});

// Subscription
await billing.createSubscription({
  customerId: "cus_xxx",
  priceId: "price_xxx",
  trialDays: 14,
});
```

> **Amounts** are in the **smallest currency unit** (paise for INR, cents for USD). Example: `99900` = ₹999.00

---

## How to expose REST endpoints (your app wraps billing-kit)

`billing-kit` does not ship a server. **You** add routes in Express, Fastify, NestJS, etc.:

| Your REST endpoint | billing-kit call |
|--------------------|------------------|
| `POST /api/invoices` | `billing.createInvoice(req.body)` |
| `GET /api/invoices/:id` | `billing.getInvoice(req.params.id)` |
| `POST /api/invoices/:id/finalize` | `billing.finalizeInvoice(req.params.id)` |
| `POST /api/payments` | `billing.createPayment(req.body)` |
| `GET /api/payments/:id` | `billing.getPayment(req.params.id)` |
| `POST /api/payments/:id/refund` | `billing.refundPayment({ paymentId: id, ...body })` |
| `POST /api/tax/calculate` | `billing.calculateTax(req.body)` |
| `POST /webhooks/stripe` | `billing.verifyWebhook(rawBody, signature)` |

### Express example — REST + webhook

```typescript
import express from "express";
import { BillingKit } from "billing-kit";

const app = express();
app.use(express.json());

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  tax: { enabled: true, defaultRate: 18, stateCode: "MH" },
});

// REST: calculate GST
app.post("/api/tax/calculate", (req, res) => {
  const tax = billing.calculateTax(req.body);
  res.json(tax);
});

// REST: create invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const invoice = await billing.createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// REST: create payment
app.post("/api/payments", async (req, res) => {
  const payment = await billing.createPayment(req.body);
  res.status(201).json(payment);
});

// Webhook (needs raw body — separate route)
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"] as string;
      const event = billing.verifyWebhook(req.body, sig);

      await billing.handleWebhook(event, {
        "invoice.paid": async () => { /* update DB */ },
        "payment_intent.succeeded": async () => { /* fulfill order */ },
      });

      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }
  },
);

app.listen(3000);
```

Full examples live in:

- `examples/basic-usage.ts`
- `examples/express-server.ts`

---

## Webhook setup (Stripe Dashboard)

1. Go to **Stripe Dashboard → Developers → Webhooks**
2. Add endpoint URL: `https://your-domain.com/webhooks/stripe`
3. Select events: `invoice.paid`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`
5. Use `billing.verifyWebhook()` on every incoming webhook before trusting the payload

---

## Project structure

```
billing-kit/
├── src/
│   ├── BillingKit.ts       # Main class — use this
│   ├── invoice/
│   ├── payment/            # Stripe provider
│   ├── tax/                # GST calculator
│   ├── subscription/
│   ├── refund/
│   ├── webhook/
│   ├── types/
│   └── utils/
├── tests/
├── examples/
├── package.json
├── tsconfig.json
└── PACKAGE_GUIDE.md        # Full architecture guide
```

---

## Development commands

```bash
npm install      # Install dependencies
npm run build    # Build dist/ (CJS + ESM + .d.ts)
npm test         # Run Vitest tests
npm run test:watch
```

---

## Git setup

```bash
cd billing-kit
git init
git add .
git commit -m "Initial billing-kit scaffold"
git remote add origin <your-repo-url>
git push -u origin main
```

`.gitignore` already excludes `node_modules/`, `dist/`, `.env`, and logs. **Never commit** `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.

---

## Publish to npm (when ready)

```bash
npm login
npm run build
npm test
npm publish
```

If the name `billing-kit` is taken, use a scoped name: `@yourorg/billing-kit`.

---

## License

MIT
