# billing-kit

A Node.js billing library for invoices, GST, Stripe payments, refunds, and webhooks.

Install it in your backend. Call methods from your code. Done.

```bash
npm install billing-kit
```

---

## What is this?

`billing-kit` is a **library** (SDK), not a website or API server.

You use it inside your own Node.js app — Express, Fastify, NestJS, or a plain script.

```
Your app  →  billing-kit  →  Stripe
```

It handles the billing logic so you don't have to wire Stripe calls yourself every time.

**It does NOT:**
- Start a server
- Give you ready-made URLs like `https://billing-kit.com/api/pay`
- Include a frontend

**It DOES:**
- Create invoices
- Calculate GST (CGST / SGST / IGST)
- Take payments via Stripe
- Process refunds
- Verify Stripe webhooks

---

## What you need

1. **Node.js 18+**
2. A **Stripe account** → [stripe.com](https://stripe.com)
3. Your **Stripe secret key** → Dashboard → Developers → API keys  
   Use test key first: `sk_test_...`
4. For webhooks only: **Webhook signing secret** → Dashboard → Webhooks → `whsec_...`
5. A **Stripe customer ID** (`cus_xxx`) when creating invoices or subscriptions

Create a `.env` file:

```bash
cp .env.example .env
```

```env
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
```

Never commit `.env` to git. It's already in `.gitignore`.

---

## Quick start

```typescript
import { BillingKit } from "billing-kit";

// 1. Create one instance (do this once when your app starts)
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: {
    enabled: true,
    defaultRate: 18,      // 18% GST
    stateCode: "MH",      // your business state
  },
});

// 2. Calculate tax (runs locally — no Stripe call)
const tax = billing.calculateTax({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});
// → totalTax: 1800, total: 11800

// 3. Create an invoice (calls Stripe)
const invoice = await billing.createInvoice({
  customerId: "cus_xxxxxxxx",
  lineItems: [
    { description: "Pro plan", quantity: 1, unitAmount: 99900 },
  ],
  buyerState: "MH",
});

// 4. Take a payment (calls Stripe)
const payment = await billing.createPayment({
  amount: 99900,
  customerId: "cus_xxxxxxxx",
});

// 5. Refund if needed (calls Stripe)
await billing.refundPayment({
  paymentId: payment.id,
  reason: "requested_by_customer",
});
```

**Note on amounts:** Use the smallest unit — paise for INR, cents for USD.  
`99900` = ₹999.00

---

## All available methods

| Method | What it does |
|--------|--------------|
| `calculateTax()` | GST breakdown — CGST, SGST, or IGST |
| `createInvoice()` | Create a draft invoice |
| `getInvoice()` | Get invoice by ID |
| `finalizeInvoice()` | Lock invoice and make it payable |
| `createPayment()` | Create a Stripe payment |
| `getPayment()` | Check payment status |
| `refundPayment()` | Full or partial refund |
| `createSubscription()` | Start a subscription |
| `cancelSubscription()` | Cancel at end of billing period |
| `verifyWebhook()` | Check that a Stripe webhook is real |
| `handleWebhook()` | Run your code when events arrive |

---

## Want REST API endpoints?

`billing-kit` doesn't ship endpoints. **You** add them in your app.

Think of it like this:

```
POST /api/invoices     →  billing.createInvoice(req.body)
GET  /api/invoices/:id →  billing.getInvoice(req.params.id)
POST /api/payments     →  billing.createPayment(req.body)
POST /api/tax          →  billing.calculateTax(req.body)
POST /webhooks/stripe  →  billing.verifyWebhook(body, signature)
```

### Minimal Express example

```typescript
import express from "express";
import { BillingKit } from "billing-kit";

const app = express();
app.use(express.json());

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  tax: { enabled: true, defaultRate: 18, stateCode: "MH" },
});

// Calculate GST
app.post("/api/tax", (req, res) => {
  res.json(billing.calculateTax(req.body));
});

// Create invoice
app.post("/api/invoices", async (req, res) => {
  const invoice = await billing.createInvoice(req.body);
  res.status(201).json(invoice);
});

// Create payment
app.post("/api/payments", async (req, res) => {
  const payment = await billing.createPayment(req.body);
  res.status(201).json(payment);
});

// Stripe webhook (must use raw body, not express.json)
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const event = billing.verifyWebhook(req.body, sig);

  await billing.handleWebhook(event, {
    "invoice.paid": async () => {
      // e.g. mark order as paid in your database
    },
  });

  res.json({ received: true });
});

app.listen(3000);
```

More examples: `examples/basic-usage.ts` and `examples/express-server.ts`

---

## Webhooks (Stripe → your server)

When a payment succeeds or an invoice is paid, Stripe sends an HTTP POST to your server.

**Setup:**
1. Stripe Dashboard → Developers → Webhooks
2. Add URL: `https://your-domain.com/webhooks/stripe`
3. Pick events: `invoice.paid`, `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Copy the signing secret → put in `STRIPE_WEBHOOK_SECRET`
5. Always call `billing.verifyWebhook()` before trusting the request

---

## GST rules (built-in)

| Buyer and seller in same state | CGST + SGST (split 50/50) |
|------------------------------|---------------------------|
| Buyer and seller in different states | IGST only |

```typescript
// Same state (Maharashtra → Maharashtra)
billing.calculateTax({ amount: 10000, rate: 18, sellerState: "MH", buyerState: "MH" });
// cgst: 900, sgst: 900, igst: 0

// Different states (Maharashtra → Karnataka)
billing.calculateTax({ amount: 10000, rate: 18, sellerState: "MH", buyerState: "KA" });
// igst: 1800, cgst: 0, sgst: 0
```

---

## Project layout

```
src/
├── BillingKit.ts     ← start here — main class
├── invoice/          ← invoice logic
├── payment/          ← Stripe integration
├── tax/              ← GST calculator
├── refund/
├── subscription/
├── webhook/
└── types/            ← TypeScript types
```

---

## Development

```bash
npm install       # first time only (~20s)
npm run build     # compile to dist/
npm test          # run tests
```

---

## Git

```bash
git init
git add .
git commit -m "Add billing-kit"
```

Safe to commit: source code, `package.json`, `README.md`  
Never commit: `.env`, `node_modules/`, `dist/`

---

## Publish to npm

```bash
npm run build
npm test
npm publish
```

---

## More docs

See [PACKAGE_GUIDE.md](./PACKAGE_GUIDE.md) for full architecture and API design details.

## License

MIT
