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
npm run ci              # lint + typecheck + test + build + pack validation
npm publish --dry-run   # runs prepublishOnly + prepack hooks
```

Confirm:

- [ ] CI is green on `main`
- [ ] `CHANGELOG.md` lists the upcoming version
- [ ] `npm run validate:pack` passes
- [ ] No secrets in the package (`npm pack --dry-run` / inspect tarball)
- [ ] You are logged into npm (`npm whoami`) with publish rights

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

### 3. Publish to npm

```bash
npm publish
```

`prepublishOnly` runs lint, typecheck, and tests. `prepack` rebuilds and validates package contents (README, LICENSE, CHANGELOG, dist entrypoints, CJS/ESM load). Use `npm run validate:pack` to also inspect the npm tarball.

The package is public (`publishConfig.access: "public"`). Published files are whatever `package.json` → `files` allows (`dist`, `README.md`, `LICENSE`, `CHANGELOG.md`).

### 4. Push and GitHub release

```bash
git push origin main --follow-tags
```

Create a GitHub Release from the tag (UI or CLI):

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
```

Prefer pasting the matching `CHANGELOG.md` section as the release notes.

### 5. Verify

```bash
npm view billing-kit version
npm install billing-kit@X.Y.Z   # in a scratch project
```

---

## Dry-run & packing

```bash
npm run build
npm run validate:package   # docs + dist + exports + smoke load
npm run validate:pack      # above + npm pack tarball contents
npm pack --dry-run         # list files that would be published
npm publish --dry-run      # simulate publish (runs lifecycle hooks)
```

---

## Hotfix / follow-up patch

1. Fix on `main` (or a short-lived branch → PR)
2. Add a **Fixed** entry under Unreleased → cut as patch
3. `npm version patch` → `npm publish` → push tag → GitHub release

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
[ ] npm run validate:pack passes
[ ] npm publish --dry-run looks correct
[ ] npm publish succeeded
[ ] git push --follow-tags
[ ] GitHub Release created
[ ] npm view billing-kit version matches
```

### First stable release (`1.0.0`)

Use the filled checklist in **[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)**.  
Prep items are marked complete; publish steps stay unchecked until you intentionally run `npm publish`.
