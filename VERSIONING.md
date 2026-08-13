# Versioning policy

`billing-kit` follows [Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**.

See also: [PUBLISHING.md](./PUBLISHING.md) · [CHANGELOG.md](./CHANGELOG.md) · [UPGRADING.md](./UPGRADING.md) · [docs/compatibility.md](./docs/compatibility.md) (Node version matrix + Stripe/Razorpay feature parity)

---

## Bump rules

| Change | Bump | Examples |
|--------|------|----------|
| Breaking public API | **MAJOR** | Renamed/removed exports, changed default amount semantics, stricter required config that breaks existing callers |
| Backward-compatible features | **MINOR** | New methods, optional config fields, new normalized webhook types |
| Backward-compatible fixes | **PATCH** | Bug fixes, docs, CI, internal refactors with no API change |

Pre-release identifiers (for example `1.1.0-beta.1`) are allowed for experimental cuts; stable tags remain `vMAJOR.MINOR.PATCH`.

---

## Public API surface (semver contract)

Treat these as covered by SemVer:

- Package exports: `billing-kit` and `billing-kit/testing`
- Types and classes re-exported from `src/index.ts` / `src/testing/index.ts`
- Documented `BillingKit` methods and config (`BillingKitConfig`)
- Normalized webhook event shapes (`normalizedType`, `entity`, etc.)
- Documented error types (`InvalidConfigError`, `WebhookVerificationError`, …)

**Not** part of the semver contract (may change in a minor/patch):

- Internal modules under `src/` that are not exported
- Example apps under `examples/`
- In-memory repository internals
- Diagnostic recommendation wording

---

## Compatibility promises

- **Node.js**: `engines.node` is `>=18`. Raising the minimum Node version is a **major** change.
- **Amounts**: public APIs use **smallest currency units** (paise / cents). Changing that convention is a **major** change.
- **Providers**: supported providers are Stripe and Razorpay. Dropping a provider is a **major** change.
- **Webhooks**: adding new `normalizedType` values is a **minor** change; renaming or removing existing ones is a **major** change.

For the current Node version matrix and the exact Stripe vs Razorpay feature parity these promises apply to, see **[docs/compatibility.md](./docs/compatibility.md)**.

---

## Stable line

`1.0.0` is the first stable release. After `1.0.0`:

- Do not publish breaking changes without a **major** bump
- Document breaking changes in [UPGRADING.md](./UPGRADING.md) and the CHANGELOG `### Changed` / `### Removed` sections
- Prefer deprecation in a minor release before removal in a later major, when practical — a deprecation always ships with a `### Deprecated` CHANGELOG entry and a `@deprecated` JSDoc tag on the affected field/function; see [UPGRADING.md § Deprecated API guidance](./UPGRADING.md#deprecated-api-guidance) for how to find these and a real example (`Coupon.value` → `amountOff`/`percentOff`)

---

## Choosing the bump

1. Does an existing documented call fail or change meaning? → **major**
2. Can callers ignore the change and keep working? New optional API? → **minor**
3. Fix / docs / tooling only? → **patch**

When unsure, prefer the higher bump and explain the impact in UPGRADING.md.
