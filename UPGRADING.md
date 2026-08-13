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

For the full Node version support matrix and Stripe vs Razorpay feature parity (including what's Partial/Planned/N/A per provider), see **[docs/compatibility.md](./docs/compatibility.md)**.

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

## Deprecated API guidance

How deprecation actually works in `billing-kit`, so you can find out what's deprecated without waiting for something to break:

- **In your editor**: deprecated fields/functions carry a `/** @deprecated ... */` JSDoc tag. TypeScript and most editors render these with a strikethrough and show the replacement in the hover tooltip — no need to grep source.
- **In the CHANGELOG**: every deprecation gets a `### Deprecated` entry in the release that introduces it (see [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)), separate from `### Removed`, which only appears in the later major that actually deletes it.
- **The policy**: per [VERSIONING.md § Stable line](./VERSIONING.md#stable-line), a deprecation ships in a **minor** release and keeps working; removal only happens in a later **major**. You always get at least one minor release of advance notice before a `major` bump can remove something you're using.
- **Deprecated fields keep working, silently, until removed** — `billing-kit` does not print runtime warnings for deprecated fields today. Rely on your editor/TS, not console output, to catch them.

### Real example: `Coupon.value` → `amountOff` / `percentOff`

`Coupon.value` (the original, ambiguous field — did `10` mean 10% off or 10 currency units off?) is deprecated in favor of the explicit `amountOff` / `percentOff` fields, which say what they mean. Both still work today; `resolveCouponValue()` falls back to `value` when the specific field is absent (`src/coupon/CouponService.ts`):

```typescript
// Old (still works — value is inferred from `type`)
billing.registerCoupon({
  code: "SAVE10",
  type: "percentage",
  value: 10, // ⚠️ deprecated — ambiguous without reading `type`
});

// New (explicit, preferred)
billing.registerCoupon({
  code: "SAVE10",
  type: "percentage",
  percentOff: 10, // reads correctly on its own
});
```

```typescript
// Old
billing.registerCoupon({ code: "FLAT500", type: "flat", value: 500 });

// New
billing.registerCoupon({ code: "FLAT500", type: "flat", amountOff: 500 });
```

Nothing forces you to migrate this today — `value` is not scheduled for removal in any specific upcoming release. Prefer the explicit fields in new code, and migrate existing call sites opportunistically.

---

## Migrating to a new major version (template)

No major version has shipped since `1.0.0` — this section is a **template**, filled in for real the first time `2.0.0` (or later) ships. It exists now so you know what to expect from a `billing-kit` major migration before you ever need to do one.

When a new major ships, this section gets a dedicated `## vX.0.0` entry, in this shape:

```markdown
## v2.0.0

### What changed
- Bullet list of every breaking change, in plain language (not a commit log)

### Before / after
​```typescript
// v1.x
old.usage.here();
​```
​```typescript
// v2.x
new.usage.here();
​```

### Migration steps
1. Concrete, ordered steps — update this, then run that, then verify the other thing
2. ...

### Rollback
How to pin back to the last v1.x release if the migration doesn't go smoothly.
```

Every item listed in [VERSIONING.md § Public API surface](./VERSIONING.md#public-api-surface-semver-contract) as covered by SemVer is a candidate for a breaking change in that entry: package exports, documented `BillingKit` methods/config, normalized webhook shapes, and documented error types. Anything **not** on that list (internal `src/` modules, `examples/`, in-memory repository internals, diagnostic wording) can change without a major bump or an entry here.

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
