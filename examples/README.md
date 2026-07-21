# Examples

```
examples/
├── basic-usage.ts           # Quick start
├── invoices-tax-pdf.ts      # GST / VAT invoices + PDF download
├── testing/
│   ├── README.md            # Localhost / staging webhook testing
│   ├── webhook-local.ts     # Print signed curl for localhost
│   └── webhook-staging.ts   # Verify fixtures against BillingKit
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

Webhook testing helpers live in `billing-kit/testing` — see [`examples/testing/README.md`](./testing/README.md).
