# Compatibility

Node.js version support and Stripe vs. Razorpay feature parity for `billing-kit`.

See also: [VERSIONING.md](../VERSIONING.md) (SemVer promises) · [UPGRADING.md](../UPGRADING.md) (migration notes) · [README.md](../README.md)

---

## Contents

1. [Node.js version support](#nodejs-version-support)
2. [Runtime limitation notes](#runtime-limitation-notes)
3. [Stripe vs Razorpay feature support](#stripe-vs-razorpay-feature-support)
4. [Provider limitation notes](#provider-limitation-notes)
5. [Label legend](#label-legend)

---

## Node.js version support

| Node.js version | Status | Tested in CI | Notes |
|------------------|--------|---------------|-------|
| < 18 | ❌ Unsupported | No | Below `engines.node` floor; global `fetch` and other required built-ins are not reliably available |
| 18.x | ✅ Supported | Yes ([ci.yml](../.github/workflows/ci.yml)) | Minimum supported version (`engines.node: ">=18"` in [package.json](../package.json)) |
| 20.x | ✅ Supported | Yes | |
| 22.x | ✅ Supported | Yes | Also used for the `npm pack` artifact upload in CI |
| 24.x | ✅ Supported (not CI-matrixed) | No | Used by [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) to publish releases; no known incompatibilities, just not part of the test matrix |

`engines.node` declares an **open-ended minimum** (`>=18`), which is correct semver practice for a library — it does not cap the maximum. Raising the minimum is a breaking (major) change; see [VERSIONING.md](../VERSIONING.md#compatibility-promises).

Behavior is identical across 18.x/20.x/22.x — there are no version-gated code paths in `billing-kit`. If you hit a Node-version-specific issue, please open an issue with the exact `node --version` output.

---

## Runtime limitation notes

- **Node.js only.** `billing-kit` is not tested or supported in browsers, Deno, Bun, or edge/Workers runtimes. It depends on Node's `crypto` module (`createHmac`, `createHash`, `randomUUID`) and the global `fetch` (used for Razorpay's transfer/settlement REST calls), and its repository interfaces assume a server-side process.
- **Global `fetch` required.** Node stabilized a built-in `fetch` in 18.0.0. No polyfill is bundled or needed on any supported Node version.
- **Full ICU assumed.** `formatAmount()` uses `Intl.NumberFormat`. Node ships with full ICU data by default since Node 13, so no `--icu-data-dir` or `full-icu` package is required on any supported version.
- **CJS and ESM both ship.** `dist/index.js` (CJs) and `dist/index.mjs` (ESM) are both built with correct, separate type declarations (`dist/index.d.ts` / `dist/index.d.mts`) — see the `exports` map in [package.json](../package.json). Bundlers using `moduleResolution: "bundler"` or `"node16"`/`"nodenext"` both resolve correctly.
- **No native addons.** Pure TypeScript/JavaScript; nothing to compile, so there are no platform-specific (arch/OS) restrictions beyond Node itself.
- **PDF generation** (`generateInvoicePdf`) uses [`pdfkit`](https://www.npmjs.com/package/pdfkit), a pure-JS renderer — no system font or native library dependency.

---

## Stripe vs Razorpay feature support

All amounts, tax, invoicing, coupons, entitlements, usage-ledger, audit-log, retry/dunning, and webhook-processing infrastructure are implemented in `billing-kit` itself and never call out to a provider API — those are **Supported** identically for both providers and are omitted from the table below for brevity. The table covers the surfaces where provider capabilities genuinely differ.

| Feature | Stripe | Razorpay | Notes |
|---|---|---|---|
| Payments: create / capture / cancel / status | ✅ Supported | ✅ Supported | Common `PaymentGateway` interface |
| Refunds (full / partial, idempotent) | ✅ Supported | ✅ Supported | |
| Subscriptions: create / cancel / pause / resume / renew / schedule cancellation | ✅ Supported | ✅ Supported | Same `BillingKit` methods; Razorpay enforces its own state machine (pause only from `active`/`authenticated`, resume only from `paused`) |
| Checkout / order flow | 🟡 Partial — via `createPayment` (PaymentIntents), no separate order step | ✅ Supported — `createOrder` + `verifyPaymentSignature` | Different checkout models by design; not a bug in either |
| Fetch a payment / refund by id directly from the provider | 🟡 Partial — returned inline from `createPayment`/`refundPayment`/`getPaymentStatus`, no separate fetch call | ✅ Supported — `fetchPayment` / `fetchRefund` | |
| Metered usage reported to the provider's own billing engine | ✅ Supported — `reportUsage` (Stripe usage records) | ⛔ N/A — Razorpay has no metered-subscription primitive | Use `billing-kit`'s own usage ledger (`recordUsageEvent` / `aggregateUsage` / `generateUsageInvoice`) instead — that path is ✅ Supported on both providers |
| Customer Portal (self-serve billing UI) | ✅ Supported — `createBillingPortalSession`, `createPaymentMethodUpdateSession` | ⛔ N/A — Razorpay has no equivalent hosted product | |
| Saved payment methods synced live to the provider | ✅ Supported — `listPaymentMethods`, `detachPaymentMethod` | ⛔ N/A — no Razorpay saved-card API wired | `CustomerProfileService`'s local payment-method ledger (`attachPaymentMethod`/`setDefaultPaymentMethod` on a profile) works on **both** providers; only the optional live `syncProvider: true` push is Stripe-only |
| List customer invoices / subscriptions from the provider | ✅ Supported — `listCustomerInvoices`, `listCustomerSubscriptions` | ⛔ N/A | |
| Disputes: fetch / list | ✅ Supported | ✅ Supported | |
| Disputes: respond — accept or contest | ⛔ N/A (see evidence, next row) | ✅ Supported — `acceptDispute` / `contestDispute` | Different provider workflows for responding to a dispute |
| Disputes: submit evidence | ✅ Supported — `updateDisputeEvidence` | ⛔ N/A (see accept/contest, above) | |
| Split payments / vendor payouts (Razorpay Route) | 🔜 Planned — no Stripe Connect–based equivalent implemented yet | ✅ Supported — `splitPayment`, `createTransfer`, `reverseTransfer`, `getSettlementDetails` | `calculateSplit()` (pure allocation math, no API call) works today regardless of provider |
| Webhooks: signature verification, dedupe, normalized events | ✅ Supported | ✅ Supported | Shared `WebhookEvent` shape; dispute webhook events are normalized for both providers even though the REST response workflow differs (row above) |

---

## Provider limitation notes

- **Checkout models differ by design.** Stripe's PaymentIntents flow (`createPayment` → `capturePayment`) has no direct Razorpay equivalent; Razorpay's Orders + client-side Checkout flow (`createOrder` → `verifyPaymentSignature`) has no direct Stripe equivalent. Calling a provider-specific method against the other provider throws a typed `UnsupportedOperationError` naming the operation and the configured provider — it never silently no-ops.
- **Dispute response workflow differs.** Stripe disputes are resolved by submitting evidence (`updateDisputeEvidence`); Razorpay disputes are resolved by accepting or contesting (`acceptDispute` / `contestDispute`). Fetching/listing disputes and receiving normalized `dispute.*` webhook events works identically on both.
- **Payouts/splits are Razorpay-only today.** Razorpay Route (`splitPayment`, `createTransfer`, `reverseTransfer`, `getSettlementDetails`) has no Stripe Connect equivalent implemented in `billing-kit` yet — this is the one row in the table above marked **Planned** rather than N/A, since Stripe Connect is a real product `billing-kit` could support in a future release. `calculateSplit()`'s allocation math has no provider dependency and works today regardless of which provider you configure.
- **Metered usage has two distinct meanings.** `reportUsage` pushes a usage record into Stripe's own metered-subscription billing (Stripe-only). `recordUsageEvent`/`aggregateUsage`/`generateUsageInvoice` are `billing-kit`'s own usage ledger and invoicing engine — fully provider-agnostic, and the recommended path if you need usage-based billing on Razorpay (or want the same code path on both providers).
- **Saved payment methods are tracked locally either way.** `CustomerProfileService` always stores payment methods against your own `customerProfileRepository`, on both providers. Only the *live sync* to the provider (creating/attaching an actual provider payment method via `syncProvider: true`) is Stripe-only; on Razorpay that flag is accepted but has no effect beyond the local record.
- **Webhook secret rotation applies to both providers identically** (`webhookSecret` + `webhookSecrets`) — see [TROUBLESHOOTING.md → Secret rotation](../TROUBLESHOOTING.md#secret-rotation).

---

## Label legend

| Label | Meaning |
|-------|---------|
| ✅ Supported | Implemented and tested for this provider today |
| 🟡 Partial | Implemented, but with a materially different shape/limitation than the other provider (see the Notes column) |
| 🔜 Planned | Not implemented yet; the underlying provider capability exists and could realistically be added in a future release — not a committed roadmap date |
| ⛔ N/A | The underlying provider has no equivalent capability, so there is nothing for `billing-kit` to implement |
