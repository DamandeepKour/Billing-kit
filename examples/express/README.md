# billing-kit — Express example

Minimal Express app showing payments, invoices, refunds, and **raw-body** webhook verification.

## Setup

```bash
cp .env.example .env
# fill STRIPE_* (or Razorpay) values

npm install express billing-kit
# TypeScript (optional): npm install -D typescript tsx @types/express @types/node
```

From this repo you can also resolve the local package:

```bash
npm install express
npm install ../..   # link billing-kit workspace root
npx tsx src/server.ts
```

## Run

```bash
npx tsx src/server.ts
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/payments` | Create a payment |
| `GET` | `/payments/:id` | Payment status |
| `POST` | `/invoices` | Generate a local tax invoice |
| `GET` | `/invoices/:id` | Fetch invoice |
| `GET` | `/invoices/:id/pdf` | Invoice PDF |
| `POST` | `/refunds` | Refund a payment |
| `POST` | `/webhooks/stripe` | Stripe webhook (**raw body**) |
| `POST` | `/webhooks/razorpay` | Razorpay webhook (**raw body**) |
| `GET` | `/health` | `billing.healthCheck()` |

## Webhooks (important)

Signature verification requires the **exact raw bytes** the provider signed.

This example mounts `createRawBodyMiddleware()` on webhook routes **before** `express.json()`:

```typescript
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(handler),
);

app.use(express.json()); // JSON parser only for non-webhook routes
```

See also [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md).
