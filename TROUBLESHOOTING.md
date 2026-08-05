# Troubleshooting

Operational guide for webhook verification, retries, duplicate events, and release/publish failures.

Related: [README webhook example](./README.md#webhook-example) · [local/staging testing](./examples/testing/README.md) · [PUBLISHING.md](./PUBLISHING.md) · [UPGRADING.md](./UPGRADING.md)

---

## Contents

1. [Symptoms cheat sheet](#symptoms-cheat-sheet)
2. [Webhook signature troubleshooting](#webhook-signature-troubleshooting)
3. [Secret rotation](#secret-rotation)
4. [Retry and duplicate event troubleshooting](#retry-and-duplicate-event-troubleshooting)
5. [Payment / refund idempotency](#payment--refund-idempotency)
6. [Release & npm publish](#release--npm-publish)
7. [Quick diagnosis snippets](#quick-diagnosis-snippets)

---

## Symptoms cheat sheet

| Symptom | Likely cause | Jump to |
|---------|----------------|---------|
| `WebhookVerificationError` / `WEBHOOK_VERIFICATION_FAILED` | Parsed JSON body, wrong secret, or rotation gap | [Signatures](#webhook-signature-troubleshooting) |
| Webhooks work in Dashboard “test” but fail in your app | Framework parsed `req.body` before verify | [Raw body](#1-always-verify-the-raw-body) |
| Failures only after rotating the secret | Retries still signed with the **old** secret | [Secret rotation](#secret-rotation) |
| Handler runs twice for one payment | Missing event-id dedupe / not using `processWebhook` | [Duplicates](#retry-and-duplicate-event-troubleshooting) |
| Provider keeps retrying for hours | Non-2xx responses or handler throws after verify | [Retries](#retry-and-duplicate-event-troubleshooting) |
| Razorpay disables the webhook endpoint | Non-2xx for ~24h of retries | [Retries](#retry-and-duplicate-event-troubleshooting) |
| `IdempotencyConflictError` on payment/refund | Same key, different payload | [Idempotency](#payment--refund-idempotency) |
| Publish workflow fails on tag | Version/CHANGELOG mismatch, CI red, OIDC setup | [Publish](#release--npm-publish) |

---

## Webhook signature troubleshooting

Razorpay and Stripe both require **raw-body** signature verification.

### 1. Always verify the raw body

Razorpay ([docs](https://razorpay.com/docs/webhooks/validate-test/)):

> While generating the signature at your end, ensure that the webhook body passed as an argument is the **raw webhook request body**. Do not parse or cast the webhook request body.

Stripe has the same rule: `constructEvent` must see the exact bytes Stripe signed.

#### Wrong

```typescript
app.use(express.json()); // parses EVERY route, including webhooks
app.post("/webhooks/razorpay", (req, res) => {
  // req.body is already an object — HMAC will not match
  billing.verifyWebhook(JSON.stringify(req.body), signature);
});
```

Re-serializing with `JSON.stringify` changes whitespace/key order and almost always fails.

#### Right (billing-kit)

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

#### Checklist

- [ ] Webhook route is registered **before** global `express.json()` / `bodyParser.json()`
- [ ] Body is `Buffer` or raw `string`, not a plain object
- [ ] You are not calling `JSON.stringify` before `verifyWebhook`
- [ ] Proxies (nginx, Cloudflare, API gateways) are not rewriting the body
- [ ] Next.js / serverless: use the **raw** request body API for the webhook route only

### 2. Wrong secret / wrong header

| Check | Razorpay | Stripe |
|-------|----------|--------|
| Signature header | `X-Razorpay-Signature` | `Stripe-Signature` |
| Algorithm | HMAC-SHA256 hex of raw body | Stripe scheme (`t=…,v1=…`) |
| Secret source | Webhook settings on Dashboard | Endpoint signing secret (`whsec_…`) |

Typical mistakes:

- Using the API **key secret** instead of the **webhook secret**
- Trailing whitespace / quotes in env vars (`"whsec_…"`, newline from `.env`)
- Pointing staging at the production webhook secret (or the reverse)
- Clock skew on Stripe signatures (default tolerance ~5 minutes) — fix NTP if `t=` is old

### 3. Local verification

Prove app wiring independent of Dashboard delivery:

```typescript
import {
  createSignedRazorpayWebhookRequest,
  createMockRazorpayPaymentCaptured,
} from "billing-kit/testing";

const request = createSignedRazorpayWebhookRequest({
  payload: createMockRazorpayPaymentCaptured(),
  secret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  asBuffer: true,
  eventId: "evt_local_1",
});

const event = billing.verifyWebhook(request.rawBody, request.signature);
// expect event.normalizedType === "payment.captured"
```

See [examples/testing](./examples/testing/README.md).

---

## Secret rotation

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

billing-kit tries `webhookSecret`, then each entry in `webhookSecrets`, and accepts the first match. Stripe endpoint secret rotation uses the same dual-secret pattern.

### Rotation runbook

1. Generate the new secret in the Dashboard (do not drop the old one from your app yet).
2. Deploy with `webhookSecret` = **new**, `webhookSecrets` = **[old]**.
3. Update the webhook secret in the Dashboard.
4. Keep the previous secret in `webhookSecrets` for at least **24 hours** (Razorpay’s retry window).
5. Remove the previous secret from config once retries for pre-rotation events have stopped.

### Notes

- The webhook secret is **not** your Razorpay Key Secret (`key_secret`).
- After ~24 hours of continuous failures, Razorpay may **disable** the webhook — fix verification, then re-enable it in the Dashboard.

---

## Retry and duplicate event troubleshooting

Providers retry deliveries when your endpoint returns non-2xx or times out. Your app must be **idempotent**.

### Prefer billing-kit’s processor

```typescript
const result = await billing.processWebhook(request, async (event) => {
  // side effects: fulfill order, update subscription, etc.
});

if (result.duplicate) {
  // already handled — return 200, do not charge / email again
}
```

Or HTTP helper:

```typescript
app.post(
  "/webhooks/stripe",
  createRawBodyMiddleware(),
  billing.createWebhookHttpHandler(async (event) => {
    /* ... */
  }),
);
```

### Dedupe keys

| Provider | Primary event id | Fallback |
|----------|------------------|----------|
| Stripe | Verified payload `event.id` | — |
| Razorpay | `X-Razorpay-Event-Id` header | SHA-256 fingerprint of raw body |

Multi-instance deployments **must** inject a durable `webhookEventRepository`. The in-memory default only dedupes inside a single process.

### Expected behaviors

| Situation | `duplicate` | `outOfOrder` | Handler runs? | HTTP status |
|-----------|-------------|--------------|---------------|-------------|
| First delivery | `false` | `false` | Yes | 2xx after success |
| Exact replay | `true` | `false` | No | 2xx |
| Older event after newer for same resource | `false` | `true` | No (ignored) | 2xx |
| Handler threw previously | reclaimable | — | Yes on retry | 2xx after success |

### Common failure modes

1. **Calling `verifyWebhook` only** — signature passes, but you implement your own handler without storing event ids → double fulfillments on retry.
2. **Returning 500 after a successful side effect** — provider retries; without dedupe you fulfill twice. Persist *before* returning, or use `processWebhook` so the claim is recorded.
3. **Fast-ack without completing** — if you use `verifyAndClaimWebhook` + `fastAcknowledge`, always call `completeWebhookProcessing` or failed claims stay reclaimable and may re-run the handler.
4. **Ignoring `result.duplicate`** — still return 2xx; never convert duplicates into errors.

### Out-of-order deliveries

Providers can deliver an older `payment.authorized` after `payment.captured` for the same payment. billing-kit may mark the older event `ignored` (`outOfOrder: true`). Do not rewind business state when that happens.

### Checklist

- [ ] Using `processWebhook` / `createWebhookHttpHandler` / `processWebhookFromHttp`
- [ ] Durable webhook event store in production
- [ ] Handler is safe if invoked again after a crash mid-flight
- [ ] Always respond **2xx** for verified duplicates and ignored out-of-order events
- [ ] Razorpay: forward `X-Razorpay-Event-Id` (do not strip hop-by-hop headers at the proxy)

---

## Payment / refund idempotency

Separate from webhook dedupe: API calls use `idempotencyKey`.

- Reusing the same key with the **same** payload returns the stored result.
- Reusing the same key with a **different** payload throws `IdempotencyConflictError`.
- Retries after network blips should reuse the **same** key.

See README payment / refund sections. Inject `idempotencyRequestRepository` for multi-instance safety.

---

## Release & npm publish

Maintainer-facing. Consumer upgrades: [UPGRADING.md](./UPGRADING.md). Full flow: [PUBLISHING.md](./PUBLISHING.md).

| Failure | Fix |
|---------|-----|
| Tag `vX.Y.Z` ≠ `package.json` version | Retag or bump version so they match |
| `release:check --release` fails | Add `## [X.Y.Z]` to CHANGELOG; fix publishConfig / workflows |
| `validate:pack` fails | Run `npm run build`; ensure exports and docs exist; no `src/` in tarball |
| `prepublishOnly` fails | Lint, typecheck, or tests red — fix before publish |
| OIDC / Trusted Publisher error | npm Package Settings → Trusted Publisher → `publish.yml`, repo `DamandeepKour/Billing-kit` |
| Missing provenance badge | Publish via Actions (`id-token: write`), not a local token publish |
| GitHub Release missing notes | `npm run release:notes -- --version X.Y.Z` and attach manually |

```bash
npm run release:check -- --release --pack
npm publish --dry-run
```

---

## Quick diagnosis snippets

```typescript
import { ensureRawWebhookBody, WebhookVerificationError } from "billing-kit";

try {
  ensureRawWebhookBody(req.body); // fails fast if JSON middleware ran
  const result = await billing.processWebhookFromHttp(req, handler);
  if (result.duplicate) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  res.status(200).json({ ok: true });
} catch (error) {
  if (error instanceof WebhookVerificationError) {
    // 1) Log whether body is Buffer/string vs object
    // 2) Confirm webhookSecret / webhookSecrets for rotation
    // 3) Confirm X-Razorpay-Signature / Stripe-Signature is present
  }
  throw error;
}
```

### Still stuck?

1. Compare your route with the [README webhook example](./README.md#webhook-example).
2. Hit the endpoint with a fixture from `billing-kit/testing`.
3. Confirm Dashboard webhook URL, active events, and that the endpoint is enabled.
4. After a secret rotation, keep the previous secret in `webhookSecrets` until the retry window ends.
5. For publish issues, re-read [PUBLISHING.md](./PUBLISHING.md) and [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
