# Webhook troubleshooting

Razorpay and Stripe both require **raw-body** signature verification. Razorpay also warns that after you rotate a webhook secret, **older retries stay signed with the previous secret**. This guide covers the failures that usually show up in production.

Related: [README webhook example](./README.md#webhook-example), [local/staging testing](./examples/testing/README.md).

---

## Symptoms

| Symptom | Likely cause |
|---------|----------------|
| `WebhookVerificationError` / `WEBHOOK_VERIFICATION_FAILED` | Parsed JSON body, wrong secret, or secret rotation gap |
| Webhooks work in Dashboard “test” but fail in your app | Framework parsed `req.body` before verify |
| Failures only after rotating the secret | Retries still signed with the **old** secret |
| Duplicate handler side effects | Missing event-id dedupe / not using `processWebhook` |
| Razorpay disables the webhook endpoint | Non-2xx responses for ~24h of retries |

---

## 1. Always verify the raw body

Razorpay ([docs](https://razorpay.com/docs/webhooks/validate-test/)):

> While generating the signature at your end, ensure that the webhook body passed as an argument is the **raw webhook request body**. Do not parse or cast the webhook request body.

Stripe has the same rule: `constructEvent` must see the exact bytes Razorpay/Stripe signed.

### Wrong

```typescript
app.use(express.json()); // parses EVERY route, including webhooks
app.post("/webhooks/razorpay", (req, res) => {
  // req.body is already an object — HMAC will not match
  billing.verifyWebhook(JSON.stringify(req.body), signature);
});
```

Re-serializing with `JSON.stringify` changes whitespace/key order and almost always fails.

### Right (billing-kit)

```typescript
import {
  BillingKit,
  createRawBodyMiddleware,
  EXPRESS_WEBHOOK_RAW_BODY,
} from "billing-kit";
import express from "express";

const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
});

const app = express();

// Mount raw-body ONLY on the webhook path, before express.json()
app.post(
  "/webhooks/razorpay",
  createRawBodyMiddleware(), // or express.raw(EXPRESS_WEBHOOK_RAW_BODY)
  billing.createWebhookHttpHandler(async (event) => {
    // handle event.normalizedType
  }),
);

app.use(express.json());
```

Helpers:

- `ensureRawWebhookBody(req.body)` — throws early if the body was already parsed
- `parseWebhookRequest` / `processWebhookFromHttp` — read `Buffer`/`string` + signature headers

### Checklist

- [ ] Webhook route is registered **before** global `express.json()` / `bodyParser.json()`
- [ ] Body is `Buffer` or raw `string`, not a plain object
- [ ] You are not calling `JSON.stringify` before `verifyWebhook`
- [ ] Proxies (nginx, Cloudflare, API gateways) are not rewriting the body

---

## 2. Secret rotation (Razorpay)

From Razorpay ([FAQ](https://razorpay.com/docs/webhooks/faqs/)):

> If you have changed your webhook secret, remember to use the **old secret** for webhook signature validation while retrying older requests. The new secret can only be used for all events generated after the secret is updated.

Retries use the secret that was active when the event was **first signed**. During the retry window (exponential backoff, up to ~24 hours), your endpoint must accept **both** secrets.

### Config

```typescript
const billing = new BillingKit({
  provider: "razorpay",
  keyId: process.env.RAZORPAY_KEY_ID!,
  secretKey: process.env.RAZORPAY_KEY_SECRET!,
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!, // current
  webhookSecrets: [
    process.env.RAZORPAY_WEBHOOK_SECRET_PREVIOUS!, // previous, until retries drain
  ].filter(Boolean),
});
```

billing-kit tries `webhookSecret`, then each entry in `webhookSecrets`, and accepts the first match.

### Rotation runbook

1. Generate the new secret in the Razorpay Dashboard (do not drop the old one from your app yet).
2. Deploy with `webhookSecret` = **new**, `webhookSecrets` = **[old]**.
3. Update the webhook secret in the Dashboard.
4. Keep the previous secret in `webhookSecrets` for at least **24 hours** (Razorpay’s retry window).
5. Remove the previous secret from config once retries for pre-rotation events have stopped.

### Notes

- The webhook secret is **not** your Razorpay Key Secret (`key_secret`).
- Stripe follows the same dual-secret pattern during endpoint secret rotation; `webhookSecrets` works for Stripe too.
- After ~24 hours of continuous failures, Razorpay may **disable** the webhook — fix verification, then re-enable it in the Dashboard.

---

## 3. Wrong secret / wrong header

| Check | Razorpay | Stripe |
|-------|----------|--------|
| Signature header | `X-Razorpay-Signature` | `Stripe-Signature` |
| Algorithm | HMAC-SHA256 hex of raw body | Stripe scheme (`t=…,v1=…`) |
| Secret source | Webhook settings on Dashboard | Endpoint signing secret (`whsec_…`) |

Typical mistakes:

- Using the API **key secret** instead of the **webhook secret**
- Trailing whitespace / quotes in env vars (`"whsec_…"`, newline from `.env`)
- Pointing staging at the production webhook secret (or the reverse)

---

## 4. Retries, duplicates, and handler errors

- Prefer `processWebhook` / `createWebhookHttpHandler` so event-id dedupe is applied.
- Razorpay dedupe key: `X-Razorpay-Event-Id` (fallback: body fingerprint).
- Stripe dedupe key: verified payload `event.id`.
- Return **2xx** after a successful verify + durable handle (or after a known duplicate). Non-2xx triggers provider retries.
- Failed handler runs are reclaimable on retry; do not treat “duplicate” as an error response.

---

## 5. Quick diagnosis

```typescript
import { ensureRawWebhookBody, WebhookVerificationError } from "billing-kit";

try {
  ensureRawWebhookBody(req.body); // fails fast if JSON middleware ran
  await billing.processWebhookFromHttp(req, handler);
} catch (error) {
  if (error instanceof WebhookVerificationError) {
    // 1) Log whether body is Buffer/string vs object
    // 2) Confirm webhookSecret / webhookSecrets for rotation
    // 3) Confirm X-Razorpay-Signature / Stripe-Signature is present
  }
  throw error;
}
```

Local signed fixtures: `import { createSignedRazorpayWebhookRequest, … } from "billing-kit/testing"` — see [examples/testing](./examples/testing/README.md).

---

## 6. Still stuck?

1. Compare your route with the [README webhook example](./README.md#webhook-example).
2. Hit the endpoint with a fixture from `billing-kit/testing` (proves your app wiring, independent of Dashboard delivery).
3. Confirm Dashboard webhook URL, active events, and that the endpoint is enabled.
4. After a secret rotation, keep the previous secret in `webhookSecrets` until the retry window ends.
