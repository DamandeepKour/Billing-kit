# Examples

```
examples/
├── basic-usage.ts           # Quick start
├── invoices-tax-pdf.ts      # GST / VAT invoices + PDF download
├── stripe/
│   ├── payments.ts          # create / capture / refund
│   ├── subscriptions.ts     # plan + subscription lifecycle
│   └── webhooks.ts          # signature verify + event handlers
└── razorpay/
    ├── payments.ts
    ├── subscriptions.ts
    └── webhooks.ts
```

Set env vars from `.env.example`, then run with `npx ts-node` (or your preferred runner).
