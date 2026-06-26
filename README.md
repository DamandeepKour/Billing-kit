# billing-kit

A Node.js billing library for invoices, GST, Stripe payments, refunds, and webhooks.

Install it in your backend. Call methods from your code. Done.

```bash
npm install billing-kit
```

## What is this?

A **library** you install in your Node.js backend. Not a SaaS app. Not a frontend.

```
Your App  →  billing-kit  →  Stripe / Razorpay
```

You keep your own database and users. `billing-kit` handles billing logic.

## Requirements

- Node.js 18+
- Stripe or Razorpay account
- API keys in environment variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Razorpay
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

## Quick Start

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe", // or "razorpay"
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
});

// GST (local — no API call)
const tax = billing.calculateGST({
  amount: 10000,
  sellerState: "MH",
  buyerState: "MH",
});

// Generate invoice (persisted via repository)
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

// PDF invoice
const pdf = await billing.generateInvoicePdf({ invoice });

// Payment (calls Stripe/Razorpay)
const payment = await billing.createPayment({ amount: 99900 });

// Refund
await billing.refundPayment({ paymentId: payment.id });
```

## Pluggable Storage (Repositories)

By default, invoices and transactions use in-memory storage. For production, inject your own repository:

```typescript
import {
  BillingKit,
  type InvoiceRepository,
  type TransactionRepository,
} from "billing-kit";

class PostgresInvoiceRepository implements InvoiceRepository {
  async save(invoice) {
    // await db.invoices.insert(invoice);
    return invoice;
  }
  async findById(id) {
    // return await db.invoices.findById(id);
    return null;
  }
}

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  invoiceRepository: new PostgresInvoiceRepository(),
  transactionRepository: new MyTransactionRepository(),
});
```

Shipped defaults: `InMemoryInvoiceRepository`, `InMemoryTransactionRepository`.

## Razorpay Setup

```typescript
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
});
```

## Public API

| Method | Description |
|--------|-------------|
| `generateInvoice()` | Create invoice with totals, tax, discounts |
| `getInvoiceSummary()` | Get invoice totals by ID |
| `generateInvoicePdf()` | Generate PDF buffer |
| `createPayment()` | Create payment |
| `capturePayment()` | Capture authorized payment |
| `cancelPayment()` | Cancel payment |
| `getPaymentStatus()` | Check payment status |
| `refundPayment()` | Full or partial refund |
| `createPlan()` | Create subscription plan |
| `createSubscription()` | Start subscription |
| `cancelSubscription()` | Cancel subscription |
| `renewSubscription()` | Renew subscription |
| `calculateGST()` | India GST (CGST/SGST/IGST) |
| `calculateVAT()` | VAT calculation |
| `applyCoupon()` | Apply discount coupon |
| `validateCoupon()` | Validate coupon rules |
| `recordTransaction()` | Record billing event |
| `getTransaction()` | Get transaction by ID |
| `verifyWebhook()` | Verify Stripe/Razorpay webhook |

> Amounts are in smallest currency unit (paise/cents). `99900` = ₹999.00

## Architecture

Domain-driven, SOLID, framework-agnostic:

- **Strategy Pattern** — `PaymentGateway` (Stripe / Razorpay)
- **Factory Pattern** — `PaymentGatewayFactory`
- **Facade** — `BillingKit` single entry class

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for full details.

## Project Structure

```
src/
├── core/           # BillingKit entry
├── invoice/        # Invoice generation
├── payment/        # Stripe + Razorpay gateways
├── subscription/   # Plans & subscriptions
├── transaction/    # Event tracking
├── refund/         # Refunds
├── tax/            # GST & VAT
├── coupon/         # Discounts
├── webhook/        # Webhook verification
├── pdf/            # PDF generation
├── interfaces/     # PaymentGateway interface
└── types/          # TypeScript types
```

## Development

```bash
npm install
npm run build
npm run test:unit
npm run test:integration
npm run test:coverage
npm run lint
```

CI runs on GitHub Actions for Node 18 and 20 (lint, build, unit + integration tests).

## Examples

- `examples/basic-usage.ts` — invoice, tax, PDF, transaction

## License

MIT
