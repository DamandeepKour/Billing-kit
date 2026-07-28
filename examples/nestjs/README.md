# billing-kit — NestJS example

NestJS module / service / controller pattern for payments, invoices, refunds, and raw-body webhooks.

## Layout

```
src/
├── main.ts
├── app.module.ts
└── billing/
    ├── billing.module.ts
    ├── billing.service.ts      # wraps BillingKit
    ├── billing.controller.ts  # payments, invoices, refunds, health
    └── webhooks.controller.ts # Stripe + Razorpay (raw body)
```

## Setup

```bash
cp .env.example .env
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs billing-kit
npm install -D typescript ts-node @types/node @types/express
```

Copy this folder into a Nest app, or wire the `BillingModule` into your existing `AppModule`.

## Run

```bash
npx ts-node src/main.ts
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/billing/payments` | Create payment |
| `GET` | `/billing/payments/:id` | Payment status |
| `POST` | `/billing/invoices` | Generate invoice |
| `GET` | `/billing/invoices/:id` | Fetch invoice |
| `POST` | `/billing/refunds` | Refund |
| `POST` | `/billing/webhooks/stripe` | Stripe webhook (raw body) |
| `POST` | `/billing/webhooks/razorpay` | Razorpay webhook (raw body) |
| `GET` | `/billing/health` | Health check |

## Raw body for webhooks

`main.ts` disables Nest’s global JSON parser for webhook paths by using `rawBody: true` on `NestFactory.create` (Nest 8+) and reading `req.rawBody`, **or** applies `createRawBodyMiddleware()` on webhook routes only.

This example uses `createRawBodyMiddleware()` on the webhook controller routes so signature verification matches Express.

See [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md).
