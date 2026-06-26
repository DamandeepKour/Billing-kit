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

## Scripts

```bash
npm install
npm run build
npm test
npm run lint
```

## License

MIT
