# Examples

```
examples/
├── basic-usage.ts
├── invoices-tax-pdf.ts
├── express/                 # Express: payments, invoices, refunds, raw-body webhooks
├── nextjs/                  # Next.js App Router route handlers
├── nestjs/                  # NestJS module / service / controller
├── testing/
│   ├── README.md
│   ├── webhook-local.ts
│   └── webhook-staging.ts
├── stripe/
│   ├── payments.ts
│   ├── subscriptions.ts
│   ├── billing-portal.ts
│   └── webhooks.ts
└── razorpay/
    ├── payments.ts
    ├── subscriptions.ts
    └── webhooks.ts
```

## Framework quickstarts

| Example | Highlights |
|---------|------------|
| [express/](./express/) | `createRawBodyMiddleware()` before `express.json()` |
| [nextjs/](./nextjs/) | App Router `route.ts` + `request.text()` for webhooks |
| [nestjs/](./nestjs/) | `BillingModule` / `BillingService` / controllers |

Each framework folder includes `.env.example`, payment / invoice / refund / webhook samples, and a README.

## Provider scripts

Set env vars from the root [`.env.example`](../.env.example) (or the framework folder’s `.env.example`), then run with `npx tsx` / `npx ts-node`.

Webhook testing helpers live in `billing-kit/testing` — see [`testing/README.md`](./testing/README.md).

Raw-body and secret-rotation issues: [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
