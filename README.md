# billing-kit

Node.js billing SDK — invoices, GST/VAT, Stripe, Razorpay, refunds, webhooks, PDF.

```bash
npm install billing-kit
```

## Setup

```typescript
import { BillingKit } from "billing-kit";

const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  currency: "inr",
  tax: { enabled: true, defaultRate: 18, sellerState: "MH" },
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

Amounts are in smallest currency unit (paise/cents). `99900` = ₹999.00.

## Razorpay

```typescript
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
});
```

## Custom storage

Pass your own repositories for invoices and transactions:

```typescript
const billing = new BillingKit({
  provider: "stripe",
  secretKey: process.env.STRIPE_SECRET_KEY!,
  invoiceRepository: myInvoiceRepo,
  transactionRepository: myTransactionRepo,
});
```

Defaults: `InMemoryInvoiceRepository`, `InMemoryTransactionRepository`.

## Webhooks

Verify the signature, then branch on `event.type`. Use the **raw request body**.

```typescript
// Stripe — header: Stripe-Signature
const event = billing.verifyWebhook(req.body, req.headers["stripe-signature"]);

// Razorpay — header: X-Razorpay-Signature
const event = billing.verifyWebhook(req.body, req.headers["x-razorpay-signature"]);
```

| Provider | Common events |
|----------|----------------|
| Stripe | `payment_intent.succeeded`, `invoice.paid`, `customer.subscription.updated`, `charge.refunded` |
| Razorpay | `payment.captured`, `refund.processed`, `subscription.activated`, `invoice.paid` |

Full handlers: `examples/stripe-webhooks.ts`, `examples/razorpay-webhooks.ts`

## Scripts

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
