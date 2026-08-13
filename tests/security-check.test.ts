import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(__dirname, "..");
const scriptPath = join(root, "scripts/check-secrets.mjs");

/**
 * The script is pure ESM (.mjs) and this test suite runs under ts-jest's
 * CommonJS transform, so — same as this repo's other script tests
 * (release-automation.test.ts / extract-changelog.mjs) — it's exercised as a
 * real subprocess rather than imported directly (`import` from a .mjs file
 * throws "Cannot use import statement outside a module" under Jest's CJS
 * runtime).
 */
function runCheck(
  scratchRoot: string,
  extraArgs: string[] = [],
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      [scriptPath, "--root", scratchRoot, "--repo-only", ...extraArgs],
      { encoding: "utf8" },
    );
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** Build a throwaway git repo (init + staged files, no commit needed for `git ls-files`). */
function initScratchRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "billing-kit-security-test-"));
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(dir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

/**
 * Fixture builders for every hard-fail/warn pattern check-secrets.mjs looks
 * for. Every one of these is assembled from fragments at runtime so the
 * full, matching, secret-shaped string never appears as one contiguous
 * literal in *this file's own* git-tracked source.
 *
 * This matters for two independent reasons, both proven while writing this
 * suite: (1) check-secrets.mjs itself scans every git-tracked file — including
 * its own tests — so a literal fixture here would make this file fail its
 * own repo-wide scan; (2) GitHub's push protection scans literal commit
 * content on `git push` and does not know a string is "just a test fixture"
 * — it rejected a real push over exactly this shape (see PUBLISHING.md
 * § Secrets & safe release behavior). Splitting each fixture via join()/
 * concatenation keeps every value realistic enough to exercise the real
 * detection logic without either scanner ever seeing the risky shape in
 * this file's own source text.
 */
function fakeLiveKey(prefix: "sk" | "rzp" | "rk"): string {
  return [prefix, "live", "abcdefghijklmnopqrstuvwx"].join("_");
}

function fakePemPrivateKeyBlock(): string {
  return ["-----BEGIN ", "RSA ", "PRIVATE KEY-----", "\nMIIB...\n"].join("");
}

function fakeAwsAccessKeyId(): string {
  return ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
}

function fakeGitHubToken(): string {
  return ["ghp_", "1234567890abcdefghijklmnopqrstuvwx"].join("");
}

function fakeNpmAuthTokenLine(): string {
  return ["//registry.npmjs.org/:_authToken", "=", "npm_abcdef1234567890"].join("");
}

const scratchDirs: string[] = [];
function scratch(files: Record<string, string>): string {
  const dir = initScratchRepo(files);
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (scratchDirs.length) {
    const dir = scratchDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("security check / filename detection", () => {
  it("fails on a real committed .env file", () => {
    const dir = scratch({
      // Content is irrelevant here — this test is about the filename check,
      // not the content scan — so it deliberately avoids anything shaped
      // like a real key (see the join()-built fixtures below for why).
      ".env": "STRIPE_SECRET_KEY=REDACTED_FOR_TEST\n",
      "README.md": "# fine",
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/\.env: looks like a real \.env file/);
  });

  it("allows .env.example / .env.sample / .env.template placeholders", () => {
    const dir = scratch({
      ".env.example": "STRIPE_SECRET_KEY=sk_test_your_key_here\n",
      ".env.sample": "STRIPE_SECRET_KEY=sk_test_your_key_here\n",
      ".env.template": "STRIPE_SECRET_KEY=sk_test_your_key_here\n",
    });

    const result = runCheck(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Security checks passed");
  });

  it("fails on credential-shaped files (PEM, PKCS12, SSH private keys)", () => {
    const dir = scratch({
      "certs/server.key": "not a real key, just checking the filename",
      "certs/server.pem": "not a real key, just checking the filename",
      "id_rsa": "not a real key, just checking the filename",
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/server\.key: looks like a credential/);
    expect(result.stderr).toMatch(/server\.pem: looks like a credential/);
    expect(result.stderr).toMatch(/id_rsa: looks like a credential/);
  });

  it("does not flag ordinary source, docs, or config files", () => {
    const dir = scratch({
      "package.json": "{}",
      "README.md": "# hello",
      "src/index.ts": "export const x = 1;",
    });

    const result = runCheck(dir);

    expect(result.status).toBe(0);
  });
});

describe("security check / content detection", () => {
  it("fails on a PEM private key block even with a safe filename", () => {
    const dir = scratch({
      "src/oops.ts": `const key = \`${fakePemPrivateKeyBlock()}\`;`,
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/PEM private key/);
  });

  it("fails on an AWS access key id anywhere, including under tests/", () => {
    const dir = scratch({
      "tests/whatever.test.ts": `const key = "${fakeAwsAccessKeyId()}";`,
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/AWS access key/);
  });

  it("fails on a GitHub token", () => {
    const dir = scratch({
      ".github/workflows/ci.yml": `GH_TOKEN: ${fakeGitHubToken()}`,
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/GitHub/);
  });

  it("fails on an npm registry auth token assignment", () => {
    const dir = scratch({
      ".npmrc": fakeNpmAuthTokenLine(),
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/npm registry auth token/);
  });

  it("fails on a Stripe/Razorpay live key outside tests/ and examples/", () => {
    const dir = scratch({
      "src/config.ts": `export const key = "${fakeLiveKey("sk")}";`,
    });

    const result = runCheck(dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Stripe live secret/);
  });

  it("warns but does not fail on a live-shaped key under tests/ or examples/", () => {
    const dir = scratch({
      "tests/diagnostics.test.ts": `secretKey: "${fakeLiveKey("sk")}",`,
      "examples/stripe/payments.ts": `keyId: "${fakeLiveKey("rzp")}",`,
    });

    const result = runCheck(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Security checks passed");
    expect(result.stdout).toMatch(/⚠.*Stripe live secret/);
    expect(result.stdout).toMatch(/⚠.*Razorpay live key/);
  });

  it("does not flag test-mode keys or ordinary placeholder strings", () => {
    const dir = scratch({
      "src/whatever.ts": `
        secretKey: "sk_test_diagnostics_secret_key_123456",
        keyId: "rzp_test_diagnostics_key_secret",
        placeholder: "sk_test_your_key_here",
      `,
    });

    const result = runCheck(dir);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Security checks passed");
  });
});

describe("security check / runs clean against the real repo", () => {
  it("passes with --repo-only for the current tree", () => {
    const output = execFileSync(
      process.execPath,
      [scriptPath, "--repo-only"],
      { cwd: root, encoding: "utf8" },
    );

    expect(output).toContain("Security checks passed");
  });
});
