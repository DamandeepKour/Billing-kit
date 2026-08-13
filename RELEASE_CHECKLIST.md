# Release checklist

Copy this template for every release. Fill in `X.Y.Z`, then work top to bottom.  
Full flow: [PUBLISHING.md](./PUBLISHING.md) · Policy: [VERSIONING.md](./VERSIONING.md) · Migrations: [UPGRADING.md](./UPGRADING.md)

**Do not mark publish steps done until they have actually been performed.**

---

## Template (copy for vX.Y.Z)

```text
Package: billing-kit@X.Y.Z
Tag:     vX.Y.Z
Date:    YYYY-MM-DD
Bump:    patch | minor | major
```

### Docs & version

- [ ] [CHANGELOG.md](./CHANGELOG.md): moved `[Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD`
- [ ] Empty `[Unreleased]` section left at top; compare links updated
- [ ] [UPGRADING.md](./UPGRADING.md) updated if callers are affected
- [ ] [VERSIONING.md](./VERSIONING.md) bump choice matches the change set
- [ ] `package.json` / lockfile version is `X.Y.Z`

### Local safety checks

- [ ] `npm run ci` passes
- [ ] `npm run release:check -- --release` passes
- [ ] `npm run validate:pack` passes
- [ ] `npm run security:check` passes — no secrets/credential files in the repo or the tarball (see [PUBLISHING.md § Secrets & safe release behavior](./PUBLISHING.md#secrets--safe-release-behavior))
- [ ] `npm publish --dry-run` succeeds (no upload)
- [ ] Tarball reviewed (dist + docs only; no `src/` / `tests/` / `examples/`)

### GitHub / npm prep

- [ ] CI green on `main`
- [ ] Trusted Publisher on npm points at `publish.yml` (OIDC)
- [ ] Optional: GitHub Environment `npm` reviewers; `v*` tag protection
- [ ] Working tree committed on `main`

### Publish (OIDC — preferred)

- [ ] Annotated tag created: `git tag -a vX.Y.Z -m "vX.Y.Z"`
- [ ] Tag pushed: `git push origin vX.Y.Z` (triggers Publish workflow)
- [ ] Publish workflow green (lint/test/build/pack + `npm publish --provenance`)
- [ ] GitHub Release created automatically (or via `npm run release:notes`)
- [ ] npm shows version **X.Y.Z** with **Provenance**
- [ ] Smoke: `npm install billing-kit@X.Y.Z` in a scratch project

### After publish

- [ ] Checklist archived / noted under **Release log** below
- [ ] Any follow-ups filed under CHANGELOG `[Unreleased]`

### Commands

```bash
npm run ci
npm run release:check -- --release --pack
npm publish --dry-run

git push origin main
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
gh run watch

npm view billing-kit version
```

---

## Release log: 1.0.0 (first stable)

Package: `billing-kit@1.0.0` · Tag: `v1.0.0` · Registry: https://registry.npmjs.org/

### Prep (release-ready)

- [x] `package.json` / `package-lock.json` version set to `1.0.0`
- [x] `publishConfig.access` is `"public"`
- [x] `publishConfig.provenance` is `true`
- [x] Publish workflow (`.github/workflows/publish.yml`) uses OIDC (`id-token: write`)
- [x] `files` includes `dist`, `README.md`, `LICENSE`, `CHANGELOG.md`
- [x] Exports defined for `.` and `./testing` (CJS + ESM + types)
- [x] MIT `LICENSE` present
- [x] Production `README.md` with install + usage
- [x] `CHANGELOG.md` has a complete `[1.0.0]` section
- [x] `PUBLISHING.md` / `VERSIONING.md` document SemVer + release flow
- [x] CI workflow runs lint, typecheck, test, build, pack validation
- [x] `npm run ci` passes locally
- [x] `npm run validate:pack` passes
- [x] `npm run release:check -- --release` passes
- [x] `npm publish --dry-run` succeeds (no upload)
- [x] Tarball contents reviewed (14 files; no `src/` / `tests/`)
- [ ] Working tree committed on `main`
- [ ] GitHub Actions CI green on `main` after push

### Publish (not done until intentionally executed)

- [ ] Trusted Publisher → GitHub Actions → `publish.yml` (`DamandeepKour/Billing-kit`)
- [ ] Optional: GitHub Environment `npm` + `v*` tag protection
- [ ] Optional after first OIDC success: require 2FA / disallow tokens
- [ ] `git tag -a v1.0.0 -m "v1.0.0"`
- [ ] `git push origin v1.0.0`
- [ ] Publish workflow green + Provenance on npm
- [ ] GitHub Release for `v1.0.0`
- [ ] `npm view billing-kit version` → `1.0.0`
- [ ] Smoke install: `npm install billing-kit@1.0.0`

### Dry-run evidence (prep)

| Check | Result |
|-------|--------|
| Version | `1.0.0` |
| `npm run validate:pack` | passed |
| `npm publish --dry-run` | `+ billing-kit@1.0.0` (no upload) |
| Tarball | `billing-kit-1.0.0.tgz`, 14 files, ~132 kB packed |
