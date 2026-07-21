# Webhook testing examples

Generate signed Stripe / Razorpay webhook requests for localhost and staging.

```bash
# Print a curl command for localhost
npx ts-node examples/testing/webhook-local.ts razorpay payment
npx ts-node examples/testing/webhook-local.ts stripe refund

# Verify fixtures against BillingKit (no live provider needed)
npx ts-node examples/testing/webhook-staging.ts
```

Environment variables:

| Variable | Purpose |
|----------|---------|
| `WEBHOOK_URL` | Target URL for the printed curl (default localhost) |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to sign Razorpay payloads |
| `STRIPE_WEBHOOK_SECRET` | Secret used to sign Stripe payloads |

Always POST the **exact** raw body that was signed. Do not `JSON.parse` then re-stringify before verification.
