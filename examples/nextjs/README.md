# billing-kit — Next.js (App Router) example

Route handlers for payments, invoices, refunds, and webhooks.

## Setup

Copy these files into a Next.js 13+ App Router project (or scaffold with `create-next-app`).

```bash
cp .env.example .env.local
npm install billing-kit
```

## Routes

| Method | Path | File |
|--------|------|------|
| `POST` | `/api/payments` | `app/api/payments/route.ts` |
| `GET` | `/api/payments/[id]` | `app/api/payments/[id]/route.ts` |
| `POST` | `/api/invoices` | `app/api/invoices/route.ts` |
| `GET` | `/api/invoices/[id]` | `app/api/invoices/[id]/route.ts` |
| `POST` | `/api/refunds` | `app/api/refunds/route.ts` |
| `POST` | `/api/webhooks/stripe` | `app/api/webhooks/stripe/route.ts` |
| `POST` | `/api/webhooks/razorpay` | `app/api/webhooks/razorpay/route.ts` |
| `GET` | `/api/health` | `app/api/health/route.ts` |

Shared client: `lib/billing.ts`.

## Webhooks (raw body)

Next.js App Router gives you the raw body via `request.text()` / `request.arrayBuffer()`. Pass that string/Buffer to `processWebhook` — do **not** `request.json()` first.

```typescript
const rawBody = await request.text();
const signature = request.headers.get("stripe-signature");
await billing.processWebhook({ rawBody, signature }, handler);
```

Disable body parsing hacks from Pages Router are **not** needed for App Router route handlers when you read the body yourself as text.

See [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md).
