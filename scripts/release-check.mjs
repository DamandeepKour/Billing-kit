#!/usr/bin/env node
/**
 * Pre-release safety checks for billing-kit.
 *
 * Usage:
 *   node scripts/release-check.mjs           # local / CI readiness
 *   node scripts/release-check.mjs --release # require CHANGELOG section for package version
 *   node scripts/release-check.mjs --pack    # also run validate:pack
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractChangelogSection } from "./extract-changelog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const wantRelease = process.argv.includes("--release");
const wantPack = process.argv.includes("--pack");

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function mustExist(relativePath) {
  if (!existsSync(join(root, relativePath))) {
    fail(`Missing ${relativePath}`);
    return false;
  }
  ok(relativePath);
  return true;
}

function isSemVer(version) {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version);
}

function main() {
  console.log("Running release safety checks…");

  mustExist("package.json");
  mustExist("CHANGELOG.md");
  mustExist("LICENSE");
  mustExist("README.md");
  mustExist("PUBLISHING.md");
  mustExist("VERSIONING.md");
  mustExist("UPGRADING.md");
  mustExist("TROUBLESHOOTING.md");
  mustExist("RELEASE_CHECKLIST.md");
  mustExist(".github/workflows/ci.yml");
  mustExist(".github/workflows/publish.yml");
  mustExist("scripts/validate-package.mjs");
  mustExist("scripts/check-secrets.mjs");

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const publish = readFileSync(
    join(root, ".github/workflows/publish.yml"),
    "utf8",
  );

  if (!isSemVer(pkg.version)) {
    fail(`package.json version "${pkg.version}" is not valid SemVer`);
  } else {
    ok(`SemVer version ${pkg.version}`);
  }

  if (pkg.private === true) {
    fail('package.json must not set "private": true for npm releases');
  }

  for (const script of [
    "lint",
    "typecheck",
    "test",
    "build",
    "validate:package",
    "validate:pack",
    "security:check",
    "prepublishOnly",
    "prepack",
    "ci",
    "release:check",
  ]) {
    if (!pkg.scripts?.[script]) {
      fail(`package.json scripts missing "${script}"`);
    }
  }
  if (errors.every((message) => !message.includes("scripts missing"))) {
    ok("package.json release scripts");
  }

  if (!pkg.scripts?.["security:check"]?.includes("check-secrets.mjs")) {
    fail('package.json scripts."security:check" must run scripts/check-secrets.mjs');
  }
  if (!pkg.scripts?.ci?.includes("security:check")) {
    fail('package.json scripts.ci must run "security:check"');
  }
  if (!pkg.scripts?.prepublishOnly?.includes("check-secrets.mjs")) {
    fail("package.json scripts.prepublishOnly must run the secret scanner");
  }
  if (
    errors.every(
      (message) =>
        !message.includes("security:check") && !message.includes("secret scanner"),
    )
  ) {
    ok("security:check wired into ci + prepublishOnly");
  }

  if (!pkg.publishConfig?.access || pkg.publishConfig.provenance !== true) {
    fail("publishConfig.access/public + provenance required");
  } else {
    ok("publishConfig public + provenance");
  }

  if (!changelog.includes("## [Unreleased]")) {
    fail("CHANGELOG.md must start with an [Unreleased] section");
  } else {
    ok("CHANGELOG.md has [Unreleased]");
  }

  if (
    !changelog.includes("Keep a Changelog") ||
    !changelog.includes("Semantic Versioning")
  ) {
    fail("CHANGELOG.md should reference Keep a Changelog and SemVer");
  } else {
    ok("CHANGELOG.md Keep a Changelog / SemVer starter");
  }

  const versionSection = extractChangelogSection(changelog, pkg.version);
  if (wantRelease) {
    if (!versionSection) {
      fail(
        `CHANGELOG.md missing "## [${pkg.version}]" section required for release`,
      );
    } else {
      ok(`CHANGELOG.md has release section [${pkg.version}]`);
    }
  } else if (!versionSection) {
    warn(
      `No "## [${pkg.version}]" section yet (ok while work is under [Unreleased])`,
    );
  } else {
    ok(`CHANGELOG.md has section [${pkg.version}]`);
  }

  if (!/npm run lint/.test(ci) || !/typecheck/.test(ci) || !/npm test/.test(ci)) {
    fail("ci.yml must run lint, typecheck, and test");
  }
  if (!/npm run build/.test(ci) || !/validate:pack/.test(ci)) {
    fail("ci.yml must run build and validate:pack");
  } else {
    ok("ci.yml lint/typecheck/test/build/pack");
  }

  if (!/security:check|check-secrets/.test(ci)) {
    fail("ci.yml must run the secret scanner (security:check)");
  } else {
    ok("ci.yml runs the secret scanner");
  }

  if (!publish.includes("tags:") || !publish.includes("v*")) {
    fail("publish.yml must trigger on v* tags");
  }
  if (!publish.includes("id-token: write") || !publish.includes("npm publish")) {
    fail("publish.yml must use OIDC (id-token: write) and npm publish");
  }
  if (!publish.includes("npm run ci")) {
    fail("publish.yml must run npm run ci before publish");
  } else {
    ok("publish.yml tag + OIDC + ci gate");
  }

  for (const message of warnings) {
    console.warn(`  ⚠ ${message}`);
  }

  if (wantPack) {
    console.log("\nRunning validate:pack…");
    execFileSync("npm", ["run", "validate:pack"], {
      cwd: root,
      stdio: "inherit",
    });
  }

  if (errors.length > 0) {
    console.error("\nRelease checks failed:");
    for (const error of errors) {
      console.error(`  ✗ ${error}`);
    }
    process.exit(1);
  }

  console.log("\nRelease checks passed.");
}

main();
