# Release checklist — v1.0.0 (first stable)

Track preparation for the first public npm release.  
**Do not mark publish steps done until they have actually been performed.**

Package: `billing-kit@1.0.0`  
Tag: `v1.0.0`  
Registry: https://registry.npmjs.org/

---

## Prep (release-ready — complete before publish)

- [x] `package.json` / `package-lock.json` version set to `1.0.0`
- [x] `publishConfig.access` is `"public"`
- [x] `publishConfig.provenance` is `true`
- [x] Publish workflow (`.github/workflows/publish.yml`) uses OIDC (`id-token: write`)
- [x] `files` includes `dist`, `README.md`, `LICENSE`, `CHANGELOG.md`
- [x] Exports defined for `.` and `./testing` (CJS + ESM + types)
- [x] MIT `LICENSE` present
- [x] Production `README.md` with install + usage
- [x] `CHANGELOG.md` has a complete `[1.0.0]` section
- [x] `PUBLISHING.md` documents SemVer + release flow
- [x] CI workflow runs lint, typecheck, test, build, pack validation
- [x] `npm run ci` passes locally
- [x] `npm run validate:pack` passes
- [x] `npm run release:check -- --release` passes
- [x] `npm publish --dry-run` succeeds (no upload)
- [x] Tarball contents reviewed (14 files; no `src/` / `tests/`)
- [ ] Working tree committed on `main` (include this checklist + changelog updates)
- [ ] GitHub Actions CI green on `main` after push

---

## Publish (not done yet — run when ready; prefer OIDC + provenance)

- [ ] On npmjs.com, configure **Trusted Publisher** → GitHub Actions → workflow `publish.yml` (repo `DamandeepKour/Billing-kit`)
- [ ] Optional: GitHub Environment `npm` with required reviewers; tag protection for `v*`
- [ ] Optional after first OIDC success: npm Publishing access → require 2FA and disallow tokens
- [ ] Create annotated tag: `git tag -a v1.0.0 -m "v1.0.0"`
- [ ] Push tag: `git push origin v1.0.0` (triggers Publish workflow — no local `npm publish`)
- [ ] Confirm Publish workflow is green and version shows **Provenance** on npm
- [ ] `git push origin main --follow-tags` if main / other tags still need pushing
- [ ] Create GitHub Release for `v1.0.0` using the changelog section below
- [ ] Verify: `npm view billing-kit version` → `1.0.0`
- [ ] Smoke install in a scratch project: `npm install billing-kit@1.0.0`

---

## Suggested git commands (after committing prep)

```bash
# Commit release-ready docs if not already committed
git add CHANGELOG.md RELEASE_CHECKLIST.md PUBLISHING.md README.md
git commit -m "$(cat <<'EOF'
chore: prepare v1.0.0 stable release

EOF
)"

# Tag only when you are about to publish (do not push tag until ready)
git tag -a v1.0.0 -m "v1.0.0"

# Pushing the tag runs .github/workflows/publish.yml (OIDC + provenance)
git push origin main
git push origin v1.0.0

# Watch the Publish workflow; do not run local `npm publish` for this path
gh run watch

gh release create v1.0.0 --title "v1.0.0" --notes-file - <<'EOF'
See CHANGELOG.md section [1.0.0] for full notes.

First stable release of billing-kit (published with npm provenance).
EOF
```

---

## GitHub Release notes (paste)

```markdown
## billing-kit v1.0.0

First stable release.

### Highlights
- Stripe + Razorpay billing facade (`BillingKit`)
- GST / VAT / sales tax, multi-currency invoices, PDFs
- Payments, refunds, subscriptions, billing portal helpers
- Webhooks: raw-body verification, normalization, event-id dedupe
- `billing-kit/testing` fixtures and signed webhook helpers
- CI + prepublish package validation

### Install
```bash
npm install billing-kit
```

Full notes: [CHANGELOG.md](./CHANGELOG.md)
```

---

## Dry-run evidence (prep)

Last local checks before release docs were finalized:

| Check | Result |
|-------|--------|
| Version | `1.0.0` |
| `npm run validate:pack` | passed |
| `npm publish --dry-run` | `+ billing-kit@1.0.0` (no upload) |
| Tarball | `billing-kit-1.0.0.tgz`, 14 files, ~132 kB packed |

---

## After publish

1. Tick every item under **Publish** above
2. Move any post-release follow-ups into `CHANGELOG.md` → `[Unreleased]`
3. For the next release, copy a fresh checklist from [PUBLISHING.md](./PUBLISHING.md)
