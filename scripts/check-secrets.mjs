#!/usr/bin/env node
/**
 * Security safety check for billing-kit releases.
 *
 * Scans (1) every git-tracked file in the repo and (2) the actual `npm pack`
 * tarball for accidentally committed / accidentally published secrets and
 * credential files. Exits non-zero on any hard failure.
 *
 * Run this after `npm run build` (dist/ must exist) — same position as
 * `validate:pack` — so packing can use `--ignore-scripts` and scan the real,
 * current dist/ without triggering a redundant second build.
 *
 * Usage:
 *   node scripts/check-secrets.mjs                    # repo + tarball
 *   node scripts/check-secrets.mjs --repo-only        # skip the npm pack step (fast, no build needed)
 *   node scripts/check-secrets.mjs --root <path>      # scan a different git repo root (used by tests)
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootFlagIndex = process.argv.indexOf("--root");
const root =
  rootFlagIndex !== -1 && process.argv[rootFlagIndex + 1]
    ? resolve(process.argv[rootFlagIndex + 1])
    : resolve(__dirname, "..");
const repoOnly = process.argv.includes("--repo-only");

/**
 * Filenames that are exempt from the "looks like a secret file" check even
 * though their extension/basename would otherwise match — because they are
 * committed, checked-in *placeholder* files with no real secrets inside.
 */
const ALLOWED_ENV_SUFFIXES = ["example", "sample", "template"];

/**
 * Directories whose content is allowed to contain fixture strings shaped
 * like a "live" provider key (billing-kit's own tests exercise Stripe/
 * Razorpay live-vs-test mode detection using deliberately fake live-shaped
 * keys — see tests/diagnostics.test.ts, tests/audit.test.ts). Matches here
 * are reported as warnings, not failures. Every other pattern below (private
 * keys, cloud credentials, platform tokens) is still a hard failure even in
 * these directories, since there is never a legitimate reason for those to
 * appear anywhere in the repo.
 */
const LIVE_KEY_FIXTURE_DIRS = ["tests/", "examples/"];

/** Patterns that are ALWAYS a hard failure, wherever they are found. */
const HARD_FAIL_PATTERNS = [
  {
    id: "pem-private-key",
    label: "PEM private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  },
  {
    id: "aws-access-key",
    label: "AWS access key id",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    id: "github-token",
    label: "GitHub personal access / app token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  },
  {
    id: "slack-token",
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: "npm-auth-token",
    label: "npm registry auth token",
    // Require a realistic token-shaped value (8+ token characters) after the
    // `=` — a bare `_authToken=` followed by a single stray character (e.g.
    // punctuation from surrounding prose) is not an actual leaked token.
    pattern: /_authToken\s*=\s*[\w./+=-]{8,}/i,
  },
];

/**
 * Patterns that are a hard failure outside LIVE_KEY_FIXTURE_DIRS, and a
 * warning (visible, non-blocking) inside them.
 */
const LIVE_KEY_PATTERNS = [
  {
    id: "stripe-live-key",
    label: "Stripe live secret/restricted key",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}\b/,
  },
  {
    id: "razorpay-live-key",
    label: "Razorpay live key id",
    pattern: /\brzp_live_[A-Za-z0-9]{10,}\b/,
  },
];

/** Credential-shaped file extensions/basenames — never legitimate to commit. */
const CREDENTIAL_FILE_PATTERNS = [
  /\.(pem|key|p12|pfx|crt|cer)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.pgpass$/i,
];

function isEnvFile(basename) {
  const match = /^\.env(?:\.(.+))?$/.exec(basename);
  if (!match) return false;
  const suffix = match[1];
  if (!suffix) return true; // bare ".env"
  return !ALLOWED_ENV_SUFFIXES.includes(suffix.toLowerCase());
}

function isCredentialFile(basename) {
  return CREDENTIAL_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

function isLikelyBinary(buffer) {
  const sample = buffer.subarray(0, 512);
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

/**
 * Scan one file's content for secret-shaped strings.
 * @param {string} content
 * @param {string} displayPath - path used in output (e.g. "src/foo.ts" or "package/dist/index.js")
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function scanContentForSecrets(content, displayPath) {
  const errors = [];
  const warnings = [];
  const isFixtureDir = LIVE_KEY_FIXTURE_DIRS.some((dir) =>
    displayPath.startsWith(dir),
  );

  for (const { label, pattern } of HARD_FAIL_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`${displayPath}: contains a ${label}`);
    }
  }

  for (const { label, pattern } of LIVE_KEY_PATTERNS) {
    if (pattern.test(content)) {
      const message = `${displayPath}: contains what looks like a ${label}`;
      if (isFixtureDir) {
        warnings.push(
          `${message} (allowed: looks like a test fixture under ${LIVE_KEY_FIXTURE_DIRS.join(" or ")})`,
        );
      } else {
        errors.push(message);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Check a list of relative file paths for env/credential filenames.
 * @param {string[]} paths
 * @returns {string[]} error messages
 */
export function findUnsafeFilenames(paths) {
  const errors = [];
  for (const path of paths) {
    const basename = path.split("/").pop() ?? path;
    if (isEnvFile(basename)) {
      errors.push(`${path}: looks like a real .env file (must never be tracked or published)`);
    } else if (isCredentialFile(basename)) {
      errors.push(`${path}: looks like a credential/key file (must never be tracked or published)`);
    }
  }
  return errors;
}

function listFilesRecursive(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full, base));
    } else if (entry.isFile()) {
      files.push(relative(base, full));
    }
  }
  return files;
}

function scanFileSet(baseDir, relativePaths, { label }) {
  const errors = [];
  const warnings = [];
  const filenameErrors = findUnsafeFilenames(relativePaths);
  errors.push(...filenameErrors);

  for (const relPath of relativePaths) {
    const absPath = join(baseDir, relPath);
    if (!existsSync(absPath) || !statSync(absPath).isFile()) continue;
    const buffer = readFileSync(absPath);
    if (isLikelyBinary(buffer)) continue; // skip binaries (e.g. any stray images)
    const content = buffer.toString("utf8");
    const result = scanContentForSecrets(content, relPath);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (errors.length === 0) {
    console.log(`  ✓ ${label}: no secrets found (${relativePaths.length} files scanned)`);
  }
  return { errors, warnings };
}

function gitTrackedFiles() {
  const output = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  });
  return output.split("\n").filter(Boolean);
}

function packTarball() {
  const dir = mkdtempSync(join(tmpdir(), "billing-kit-security-"));
  // --ignore-scripts: assumes `npm run build` already ran (this script is
  // meant to run after "Build package" in CI, same as validate:pack) so we
  // scan the real, current dist/ without triggering a second redundant build.
  const listing = execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", dir, "--json"],
    { cwd: root, encoding: "utf8" },
  );
  const [meta] = JSON.parse(listing);
  const tarball = join(dir, meta.filename);
  const extractDir = join(dir, "extracted");
  mkdirSync(extractDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarball, "-C", extractDir]);
  const packageDir = join(extractDir, "package");
  const files = listFilesRecursive(packageDir);
  return { dir, packageDir, files };
}

function main() {
  console.log("Running security safety checks…\n");
  const allErrors = [];
  const allWarnings = [];

  console.log("Scanning git-tracked repository files…");
  const tracked = gitTrackedFiles();
  const repoResult = scanFileSet(root, tracked, { label: "Repository" });
  allErrors.push(...repoResult.errors);
  allWarnings.push(...repoResult.warnings);

  if (!repoOnly) {
    console.log("\nPacking and scanning the npm tarball (package output)…");
    let tmp;
    try {
      const { dir, packageDir, files } = packTarball();
      tmp = dir;
      const tarballResult = scanFileSet(packageDir, files, {
        label: "Package output",
      });
      allErrors.push(...tarballResult.errors);
      allWarnings.push(...tarballResult.warnings);

      // The tarball must never contain an env/credential file at all, full stop.
      const shipped = new Set(files);
      const dangerousShipped = [...shipped].filter(
        (f) => isEnvFile(f.split("/").pop() ?? f) || isCredentialFile(f.split("/").pop() ?? f),
      );
      if (dangerousShipped.length > 0) {
        allErrors.push(
          `Tarball ships credential-shaped file(s): ${dangerousShipped.join(", ")}`,
        );
      } else {
        console.log(`  ✓ Package output: no .env or credential files shipped`);
      }
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    console.log("\n(--repo-only: skipping npm pack / package output scan)");
  }

  if (allWarnings.length > 0) {
    // Non-blocking, so keep this on stdout alongside the ✓/pass output —
    // console.warn() would split it onto stderr inconsistently with the
    // "Warnings" header above it, which is printed via console.log().
    console.log("\nWarnings (non-blocking):");
    for (const warning of allWarnings) {
      console.log(`  ⚠ ${warning}`);
    }
  }

  if (allErrors.length > 0) {
    console.error("\nSecurity checks failed:");
    for (const error of allErrors) {
      console.error(`  ✗ ${error}`);
    }
    console.error(
      "\nIf a real secret was committed: rotate it immediately at the provider," +
        " then remove it from git history (not just a new commit) before pushing.",
    );
    process.exit(1);
  }

  console.log("\nSecurity checks passed.");
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
