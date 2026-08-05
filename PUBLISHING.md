# Publishing & release guide

Maintainer notes for versioning, changelog updates, and publishing `billing-kit` to npm.

## Versioning

This package follows [Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**.

| Change | Bump | Examples |
|--------|------|----------|
| Breaking public API | **MAJOR** | Renamed/removed exports, changed default amounts semantics, stricter required config that breaks existing callers |
| Backward-compatible features | **MINOR** | New methods, optional config fields, new normalized webhook types |
| Backward-compatible fixes | **PATCH** | Bug fixes, docs, CI, internal refactors with no API change |

### Public API surface

Treat these as the semver contract:

- Package exports: `billing-kit` and `billing-kit/testing`
- Types and classes re-exported from `src/index.ts` / `src/testing/index.ts`
- Documented `BillingKit` methods and config (`BillingKitConfig`)
- Normalized webhook event shapes (`normalizedType`, `entity`, etc.)

Internal modules under `src/` that are not exported may change without a major bump.

### Pre-1.x note

`1.0.0` is the first stable line. After `1.0.0`, do not publish breaking changes without a major version bump.

---

## Changelog

Update [`CHANGELOG.md`](./CHANGELOG.md) for every release:

1. Move items from **[Unreleased]** into a new section `## [X.Y.Z] - YYYY-MM-DD`
2. Group under `Added` / `Changed` / `Fixed` / `Deprecated` / `Removed` / `Security` as needed
3. Leave an empty **[Unreleased]** section at the top for ongoing work
4. Update the compare links at the bottom of the file

Write entries for **users of the library** (what changed and why it matters), not commit lists.

---

## Release flow

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
- [ ] No secrets in the package (`npm pack --dry-run` / inspect tarball)
- [ ] Trusted Publisher on npm points at `publish.yml` (for OIDC releases)

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
git add package.json package-lock.json CHANGELOG.md
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

## Dry-run & packing

```bash
npm run build
npm run validate:package   # docs + dist + exports + smoke load
npm run validate:pack      # above + npm pack tarball contents
npm run release:check      # workflow / SemVer / changelog / publishConfig checks
npm run release:check -- --release --pack
npm pack --dry-run         # list files that would be published
npm publish --dry-run      # simulate publish (runs lifecycle hooks)
```

---

## Hotfix / follow-up patch

1. Fix on `main` (or a short-lived branch → PR)
2. Add a **Fixed** entry under Unreleased → cut as patch
3. `npm version patch` → push tag `v*` → GitHub Actions publishes with provenance → GitHub release

---

## Rollback (npm)

npm does not allow reusing a version. If a bad release ships:

1. Publish a **patch** that fixes the issue (preferred), or
2. `npm deprecate billing-kit@X.Y.Z "reason"` while you prepare the fix

Do not force-unpublish except in rare security cases (npm policy applies).

---

## Checklist (copy per release)

```text
[ ] CI green on main
[ ] CHANGELOG.md updated for X.Y.Z
[ ] Version bumped (package.json + git tag vX.Y.Z)
[ ] Trusted publisher on npm points at publish.yml (OIDC)
[ ] npm run release:check -- --release passes
[ ] npm run validate:pack passes
[ ] npm publish --dry-run looks correct
[ ] Tag pushed; Publish workflow succeeded (provenance + GitHub Release)
[ ] npm view billing-kit version matches
[ ] Provenance visible on the npm package version page
```

### First stable release (`1.0.0`)

Use the filled checklist in **[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)**.  
Prep items are marked complete; publish steps stay unchecked until you intentionally run `npm publish`.
