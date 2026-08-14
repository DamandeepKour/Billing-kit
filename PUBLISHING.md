# Publishing & release guide

Maintainer notes for versioning, changelog updates, and publishing `billing-kit` to npm.

**Related docs**

| Doc | Purpose |
|-----|---------|
| [VERSIONING.md](./VERSIONING.md) | SemVer policy and public API surface |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Copy-paste checklist per release |
| [UPGRADING.md](./UPGRADING.md) | Consumer upgrade / migration notes |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Webhooks, retries, duplicates, publish failures |
| [CHANGELOG.md](./CHANGELOG.md) | User-facing release notes |

---

## Quick path (npm publish)

Preferred production path — **do not** publish from a laptop:

```bash
# 1. Prep on main
git checkout main && git pull
# Move [Unreleased] → ## [X.Y.Z] - YYYY-MM-DD in CHANGELOG.md
npm version patch -m "chore: release v%s"   # or minor / major
npm run ci
npm run release:check -- --release --pack
npm publish --dry-run

# 2. Push code + tag (triggers .github/workflows/publish.yml)
git push origin main
git push origin vX.Y.Z

# 3. Confirm
gh run watch
npm view billing-kit version
```

The Publish workflow:

1. Checks `vX.Y.Z` matches `package.json`
2. Runs `release:check --release` and `npm run ci`
3. Publishes with OIDC provenance (`publishConfig.provenance: true`)
4. Creates a GitHub Release from the matching CHANGELOG section

One-time npm setup: Package → Settings → **Trusted Publisher** → GitHub Actions → workflow `publish.yml` (repo `DamandeepKour/Billing-kit`).

---

## Versioning

See **[VERSIONING.md](./VERSIONING.md)** for the full policy.

Summary: **MAJOR.MINOR.PATCH** SemVer. Breaking public API → major; features → minor; fixes/docs/CI → patch. First stable line is `1.0.0`.

---

## Changelog

Update [`CHANGELOG.md`](./CHANGELOG.md) for every release:

1. Move items from **[Unreleased]** into a new section `## [X.Y.Z] - YYYY-MM-DD`
2. Group under `Added` / `Changed` / `Fixed` / `Deprecated` / `Removed` / `Security` as needed
3. Leave an empty **[Unreleased]** section at the top for ongoing work
4. Update the compare links at the bottom of the file
5. If the change affects callers, add a short note in [UPGRADING.md](./UPGRADING.md)

Write entries for **users of the library** (what changed and why it matters), not commit lists.

---

## Release flow (detailed)

### 1. Prepare

```bash
git checkout main
git pull
npm run ci              # lint + typecheck + test + build + release:check + pack validation
npm run release:check -- --release   # require CHANGELOG section for package.json version
npm publish --dry-run   # runs prepublishOnly + prepack hooks
```

Confirm:

- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` lists the upcoming version
- [ ] `npm run validate:pack` passes
- [ ] `npm run release:check -- --release` passes
- [ ] `npm run security:check` passes — no secrets in the repo or the package (see [Secrets & safe release behavior](#secrets--safe-release-behavior))
- [ ] Trusted Publisher on npm points at `publish.yml` (for OIDC releases)
- [ ] [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) filled for this version

### 2. Bump the version

Prefer npm’s version command so `package.json` and git stay in sync:

```bash
# pick one:
npm version patch -m "chore: release v%s"
npm version minor -m "chore: release v%s"
npm version major -m "chore: release v%s"
```

Or set the version manually in `package.json`, then:

```bash
git add package.json package-lock.json CHANGELOG.md UPGRADING.md RELEASE_CHECKLIST.md
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
```

Tag format: **`vX.Y.Z`** (leading `v`).

### 3. Publish to npm (preferred: GitHub Actions + provenance)

**Do not publish from a laptop for production releases.** Prefer the `Publish` workflow so npm records [provenance](https://docs.npmjs.com/generating-provenance-statements) attestations (build repo, commit, and workflow).

#### One-time trusted publisher setup

1. Create the package on npm (first release only) or open the existing package page
2. npmjs.com → **Package** → **Settings** → **Trusted Publisher**
3. Choose **GitHub Actions** and set:
   - Organization or user: `DamandeepKour`
   - Repository: `Billing-kit`
   - Workflow filename: `publish.yml` (filename only, including extension)
4. Optional hardening after the first successful OIDC publish:
   - Publishing access → require 2FA and **disallow tokens**
   - GitHub → Settings → Environments → `npm` → required reviewers
   - Protect `v*` tags so only maintainers can push release tags

Requires **Node ≥ 22.14** and **npm CLI ≥ 11.5.1** in CI (the publish workflow uses Node 24).

#### Cut a release

```bash
# After version bump + CHANGELOG on main
git push origin main
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

Pushing the annotated tag runs [`.github/workflows/publish.yml`](./.github/workflows/publish.yml):

- Verifies `vX.Y.Z` matches `package.json` version
- Runs `npm run release:check -- --release` (CHANGELOG section required)
- Runs `npm run ci`
- Publishes with OIDC (`id-token: write`) — **no `NPM_TOKEN` secret**
- Emits provenance automatically for this public repo (`publishConfig.provenance: true`)
- Creates a GitHub Release using the matching `CHANGELOG.md` section

`prepublishOnly` / `prepack` still run inside `npm publish`. Published files are whatever `package.json` → `files` allows (`dist`, `README.md`, `LICENSE`, `CHANGELOG.md`).

#### Manual / emergency publish (no provenance from OIDC)

Only if Actions is unavailable. Local publishes do **not** get trusted-publisher provenance:

```bash
npm run ci
npm run release:check -- --release --pack
npm publish --access public
```

Prefer restoring the OIDC workflow instead of relying on long-lived tokens.

### 4. GitHub release

Tag push already published the package **and** created the GitHub Release (CHANGELOG section via `scripts/extract-changelog.mjs`).

Manual fallback if needed:

```bash
npm run release:notes -- --version X.Y.Z --out release-notes.md
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file release-notes.md
```

### 5. Verify

```bash
npm view billing-kit version
npm view billing-kit dist.attestations   # provenance present when published via OIDC
npm install billing-kit@X.Y.Z   # in a scratch project
```

On the package page, npm should show a **Provenance** badge for the version published from GitHub Actions.

---

## npm publish steps (reference)

| Step | Command / action | Notes |
|------|------------------|-------|
| 1 | Update CHANGELOG + UPGRADING | Move Unreleased → version section |
| 2 | `npm version <patch\|minor\|major>` | Bumps `package.json` + creates tag (or tag later) |
| 3 | `npm run ci` | Lint, typecheck, test, build, security scan, release:check, pack |
| 4 | `npm run release:check -- --release` | Requires `## [X.Y.Z]` in CHANGELOG |
| 5 | `npm publish --dry-run` | Runs `prepublishOnly` + `prepack`; no upload |
| 6 | `git push origin main && git push origin vX.Y.Z` | Triggers Publish workflow |
| 7 | Watch Actions + check npm | Provenance badge + `npm view` |
| 8 | Smoke install | Fresh project `npm install billing-kit@X.Y.Z` |

Lifecycle hooks:

- **`prepublishOnly`**: secret scan (repo-only) → lint → typecheck → test → `release:check --release`
- **`prepack`**: build → `validate:package` (docs, exports, CJS/ESM smoke load)

Safety scripts:

```bash
npm run validate:package   # docs + dist + exports + smoke load
npm run validate:pack      # above + npm pack tarball contents
npm run security:check     # secrets/credentials in the repo AND the npm pack tarball
npm run release:check      # SemVer / changelog / workflow / publishConfig
npm run release:notes      # print CHANGELOG section for current version
```

---

## Dry-run & packing

```bash
npm run build
npm run validate:package
npm run validate:pack
npm run security:check
npm run release:check
npm run release:check -- --release --pack
npm pack --dry-run
npm publish --dry-run
```

Inspect the tarball: it must include `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, and must **not** include `src/`, `tests/`, `examples/`, or `.github/`.

---

## Release trust & npm 2FA checklist

`billing-kit` already publishes via OIDC Trusted Publishing (see [One-time trusted publisher setup](#one-time-trusted-publisher-setup)) — there is no long-lived `NPM_TOKEN` for an attacker to steal. The items below are the remaining trust surface: your npm **account**, and the tag/commit provenance chain that trusted publishing is built on top of.

### One-time npm account hardening

- [ ] **Enable two-factor authentication** on the npm account that owns `billing-kit`: npmjs.com → avatar → **Account Settings** → **Two-Factor Authentication**.
- [ ] **Require 2FA for publishing**, not just login: set the requirement level to **"Authorization and Publishing"** (not "Authorization only" — that protects login but not publish/write actions). This is what actually gates `npm publish` on a one-time code.
- [ ] If `billing-kit` is ever moved under an **npm Organization**, additionally enable that org's **"Require two-factor authentication"** setting so it applies to every member, not just this account.
- [ ] Store the recovery codes somewhere durable and *not* next to the 2FA device itself (a password manager, not a sticky note).
- [ ] Confirm no long-lived **publish**-scoped access tokens exist for this account (npmjs.com → Access Tokens) beyond what's strictly needed — Trusted Publishing means you shouldn't need one for CI at all.
- [ ] If a classic token must exist for some other reason, scope it **read-only** and give it an expiration.

With "Authorization and Publishing" enabled, the [manual/emergency publish path](#manual--emergency-publish-no-provenance-from-oidc) (`npm publish --access public`, run when Actions is unavailable) will prompt for a one-time code at the terminal — that's expected, not a bug.

### Repository-level trust

- [ ] **Trusted Publisher** on npm points at the exact workflow filename (`publish.yml`) and repo (`DamandeepKour/Billing-kit`) — see [One-time trusted publisher setup](#one-time-trusted-publisher-setup). A mismatch here is the #1 cause of OIDC publish failures.
- [ ] GitHub → Settings → **Environments** → `npm` has required reviewers configured, so a compromised or careless CI run still can't publish unattended (`publish.yml` already targets `environment: npm`).
- [ ] GitHub → Settings → **Tags** → protect the `v*` pattern so only maintainers can push (or force-push) release tags.
- [ ] GitHub → Settings → **Branches** → `main` requires the CI check to pass before merge, so nothing unreviewed reaches the commit a tag can point at.

### Tag signing (optional, recommended for solo/small-team maintainers)

An annotated tag (`git tag -a`, already used throughout this doc) records a tagger, timestamp, and message — but anyone with push access can create one claiming to be anyone. A **signed** tag adds a GPG (or SSH, via `gitsign`) signature that `git tag -v` / GitHub's "Verified" badge can check:

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"   # -s instead of -a — requires a GPG key configured with git
git tag -v vX.Y.Z               # verify a signature before trusting a tag you didn't create
```

This is optional — OIDC Trusted Publishing already ties the published package to a specific GitHub Actions run, which is a stronger guarantee than a signed tag alone. Sign tags additionally if you want the tag itself (not just the resulting npm package) to be independently verifiable.

### Fixing a tag pushed to the wrong commit

Never reuse a version number, but a **tag** (before anything was published from it) can be safely moved if you catch the mistake immediately:

```bash
git tag -d vX.Y.Z              # delete locally
git push origin :refs/tags/vX.Y.Z   # delete on the remote
git tag -a vX.Y.Z -m "vX.Y.Z"  # re-tag the correct commit
git push origin vX.Y.Z
```

Only do this if the Publish workflow has **not** already succeeded for that tag — once `npm publish` has run, follow [Rollback (npm)](#rollback-npm) instead; you cannot delete or reuse a published version.

---

## Secrets & safe release behavior

`npm run security:check` (**[scripts/check-secrets.mjs](./scripts/check-secrets.mjs)**) scans two things before every release:

1. **The repository** — every git-tracked file (`git ls-files`), so an accidental `git add` of a real credential is caught before it's ever pushed.
2. **The package output** — the actual `npm pack` tarball (extracted and scanned file-by-file), so what would land on the npm registry is checked directly, not inferred from `package.json` → `files`.

Both scans reject the same things:

| Check | Examples |
|-------|----------|
| Real `.env` files | `.env`, `.env.local`, `.env.production` — `.env.example` / `.env.sample` / `.env.template` are explicitly allowed (placeholder values only) |
| Credential/key files | `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `id_rsa`, `id_ed25519`, `.pgpass` |
| Private key material | Any `-----BEGIN ... PRIVATE KEY-----` block, wherever it appears |
| Cloud / platform tokens | AWS access key ids (`AKIA…`/`ASIA…`), GitHub tokens (`ghp_…`, `gho_…`, …), Slack tokens (`xox…`), an `_authToken=` assignment (e.g. in a committed `.npmrc`) |
| Live provider keys | Stripe `sk_live_…` / `rk_live_…`, Razorpay `rzp_live_…` |

The tarball is additionally asserted to contain **zero** files matching the `.env`/credential-file checks, full stop — regardless of what the content scan finds.

**Test fixtures are handled deliberately, not silently ignored.** `billing-kit`'s own tests exercise Stripe/Razorpay live-vs-test mode detection using deliberately fake `sk_live_…`/`rzp_live_…`-shaped strings (see `tests/diagnostics.test.ts`, `tests/audit.test.ts`). A live-key-*shaped* match under `tests/` or `examples/` is reported as a visible **warning**, not a failure — every other pattern above (private keys, cloud tokens, real `.env` files) is a hard failure everywhere, including in tests, since there is never a legitimate reason for those to appear anywhere in the repo.

```bash
npm run security:check              # full: repo + tarball (run after `npm run build`)
node scripts/check-secrets.mjs --repo-only  # fast: repo only, no build required
```

`security:check` runs as its own step in [CI](./.github/workflows/ci.yml) (after build, before pack validation), inside `npm run ci` (which [publish.yml](./.github/workflows/publish.yml) runs before publishing), and as a fast repo-only pass at the very start of `prepublishOnly` — so it also guards a manual/emergency `npm publish` that skips CI.

**If it ever finds a real secret:** rotate the credential at the provider **immediately** — treat it as compromised the moment it was committed, even if you catch it before pushing. A new commit that deletes the file is not enough; the secret is still in git history. Use `git filter-repo` (or contact GitHub Support for public repos) to purge it from history, then force-push and have every clone re-clone.

---

## Hotfix / follow-up patch

1. Fix on `main` (or a short-lived branch → PR)
2. Add a **Fixed** entry under Unreleased → cut as patch
3. Note any caller impact in [UPGRADING.md](./UPGRADING.md)
4. `npm version patch` → push tag `v*` → GitHub Actions publishes with provenance → GitHub release

---

## Rollback (npm)

npm does not allow reusing a version. If a bad release ships:

1. Publish a **patch** that fixes the issue (preferred), or
2. `npm deprecate billing-kit@X.Y.Z "reason"` while you prepare the fix

Do not force-unpublish except in rare security cases (npm policy applies).

Publish / CI failures: see [TROUBLESHOOTING.md → Release & npm publish](./TROUBLESHOOTING.md#release--npm-publish).

---

## Checklist

The five things every release actually depends on, each backed by an automated check above — work through these in order before running the final publish command:

- [ ] **2FA is enabled on the npm account** — [§ One-time npm account hardening](#one-time-npm-account-hardening)
- [ ] **2FA is required for publishing** (and org-wide, if applicable) — same section, "Authorization and Publishing"
- [ ] **Package contents verified** — `npm run validate:pack` and `npm pack --dry-run` both pass; both run automatically in [CI](./.github/workflows/ci.yml) and [Publish](./.github/workflows/publish.yml) — [§ Dry-run & packing](#dry-run--packing)
- [ ] **No secrets included** — `npm run security:check` passes for the repo *and* the packed tarball — [§ Secrets & safe release behavior](#secrets--safe-release-behavior)
- [ ] **Release tagged in git** — annotated `vX.Y.Z` tag, pushed, matching `package.json` (enforced by `publish.yml`) — [§ Bump the version](#2-bump-the-version)

Use the full copy-paste checklist in **[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)** for every release; this list is the trust-and-safety subset of it, kept here as the last thing you read before publishing.

First stable release prep history lives in RELEASE_CHECKLIST.md under **Release log: 1.0.0**.
