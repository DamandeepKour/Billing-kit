# Upgrading & migration notes

Guidance for consumers upgrading `billing-kit` between published versions.

Maintainers: add a section here whenever a release changes call sites, config shape, amount semantics, or normalized webhook types. Pair with [CHANGELOG.md](./CHANGELOG.md) and the bump rules in [VERSIONING.md](./VERSIONING.md).

---

## How to upgrade

```bash
npm install billing-kit@latest
# or pin a version:
npm install billing-kit@X.Y.Z
```

1. Read the `[X.Y.Z]` section in [CHANGELOG.md](./CHANGELOG.md)
2. Apply any steps listed for that version below
3. Run your test suite (especially webhook signature + payment/refund idempotency paths)
4. Redeploy with the same webhook secrets during any secret-rotation window (see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md))

---

## Compatibility baseline (1.x)

| Topic | Expectation |
|-------|-------------|
| Node.js | `>= 18` |
| Amounts | Smallest currency units (paise / cents), non-negative integers |
| Providers | `stripe` \| `razorpay` |
| Entrypoints | `billing-kit`, `billing-kit/testing` |
| Webhooks | Raw body required; use `processWebhook` / HTTP helpers for dedupe |

Minor and patch releases on `1.x` must remain usable without code changes unless marked **Breaking** in the CHANGELOG / this file.

---

## From pre-release / local builds → 1.0.0

If you adopted billing-kit before the first stable npm cut:

1. Install the published package: `npm install billing-kit@1.0.0`
2. Import from package exports only:
   - `import { BillingKit } from "billing-kit"`
   - `import { createSignedWebhookRequest } from "billing-kit/testing"`
3. Ensure startup config passes validation (`InvalidConfigError` on bad keys, currency, tax, repositories, webhook secrets)
4. Prefer `processWebhook` / `createWebhookHttpHandler` over manual `verifyWebhook` + ad-hoc dedupe
5. Keep amounts in smallest units — do not pass major-unit floats into payment/invoice APIs

No automated codemod is provided for 1.0.0; treat README examples as the source of truth.

---

## Planned / future majors

When a **2.0.0** (or later) ships, document:

- Removed or renamed exports
- Config fields that become required
- Changes to normalized webhook `normalizedType` values
- Amount or currency behavior changes
- Minimum Node version bumps

Until then, this section stays empty on purpose.

---

## Migration checklist (any version)

- [ ] Dependency bumped in `package.json` / lockfile
- [ ] CHANGELOG section for the target version reviewed
- [ ] Breaking items in this file applied
- [ ] Webhook route still uses raw body (`Buffer` / string)
- [ ] `webhookSecret` / `webhookSecrets` still correct after deploy
- [ ] Idempotency keys unchanged for in-flight payments/refunds
- [ ] Durable `webhookEventRepository` deployed if you run multiple instances
- [ ] App tests / staging webhook delivery verified

---

## Getting help

- Runtime webhook / retry issues → [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- Publishing billing-kit itself → [PUBLISHING.md](./PUBLISHING.md)
- API examples → [README.md](./README.md)
