#!/usr/bin/env node
/**
 * Validates billing-kit is ready to pack/publish:
 * - required docs (README, LICENSE, CHANGELOG)
 * - package.json entrypoints / exports / files
 * - built dist artifacts + types
 * - CJS/ESM smoke load
 * - optional tarball content check (`--pack`)
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const wantPack = process.argv.includes("--pack");
const inPrepack = process.env.npm_lifecycle_event === "prepack";

const errors = [];

function fail(message) {
  errors.push(message);
}

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function mustExist(relativePath, label = relativePath) {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute)) {
    fail(`Missing ${label} (${relativePath})`);
    return false;
  }
  ok(label);
  return true;
}

function readPackageJson() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function validatePackageJson(pkg) {
  const requiredFields = [
    "name",
    "version",
    "description",
    "license",
    "main",
    "module",
    "types",
    "exports",
    "files",
    "engines",
    "publishConfig",
  ];

  for (const field of requiredFields) {
    if (pkg[field] == null) {
      fail(`package.json missing required field: ${field}`);
    }
  }

  if (pkg.license !== "MIT") {
    fail(`Expected license "MIT", got ${JSON.stringify(pkg.license)}`);
  }

  if (pkg.publishConfig?.access !== "public") {
    fail('publishConfig.access must be "public"');
  }

  if (pkg.publishConfig?.provenance !== true) {
    fail("publishConfig.provenance must be true (npm supply-chain attestations)");
  }

  const repositoryUrl = pkg.repository?.url;
  if (
    typeof repositoryUrl !== "string" ||
    !repositoryUrl.includes("github.com/DamandeepKour/Billing-kit")
  ) {
    fail(
      'repository.url must point at github.com/DamandeepKour/Billing-kit for provenance',
    );
  }

  if (!pkg.engines?.node) {
    fail("package.json engines.node is required");
  }

  const requiredFiles = ["dist", "README.md", "LICENSE", "CHANGELOG.md"];
  for (const entry of requiredFiles) {
    if (!Array.isArray(pkg.files) || !pkg.files.includes(entry)) {
      fail(`package.json files[] must include "${entry}"`);
    }
  }

  for (const entryPoint of [".", "./testing"]) {
    const entry = pkg.exports?.[entryPoint];
    const importTypes = entry?.import?.types;
    const requireTypes = entry?.require?.types;
    if (!importTypes || !entry?.import?.default || !requireTypes || !entry?.require?.default) {
      fail(
        `exports["${entryPoint}"] must define import.types/import.default and require.types/require.default (so ESM and CJS consumers each resolve their own .d.mts/.d.ts)`,
      );
    }
  }

  if (!Array.isArray(pkg.keywords) || pkg.keywords.length < 5) {
    fail("package.json keywords should list discovery terms");
  }

  if (pkg.homepage == null || pkg.bugs?.url == null) {
    fail("package.json homepage and bugs.url are required");
  }

  if (errors.length === 0) {
    ok("package.json metadata and exports");
  }
}

function stripLeadingDot(path) {
  return path.replace(/^\.\//, "");
}

function validateEntrypoints(pkg) {
  const paths = [
    pkg.main,
    pkg.module,
    pkg.types,
    pkg.exports["."].require.default,
    pkg.exports["."].require.types,
    pkg.exports["."].import.default,
    pkg.exports["."].import.types,
    pkg.exports["./testing"].require.default,
    pkg.exports["./testing"].require.types,
    pkg.exports["./testing"].import.default,
    pkg.exports["./testing"].import.types,
  ]
    .filter(Boolean)
    .map(stripLeadingDot);

  for (const relative of new Set(paths)) {
    mustExist(relative, `entrypoint ${relative}`);
  }

  // Extra dual-package / testing artifacts commonly expected by consumers
  for (const relative of [
    "dist/index.d.mts",
    "dist/testing/index.d.mts",
  ]) {
    mustExist(relative);
  }
}

function validateDocs() {
  mustExist("README.md");
  mustExist("LICENSE");
  mustExist("CHANGELOG.md");

  const readme = readFileSync(join(root, "README.md"), "utf8");
  if (!readme.includes("billing-kit") || readme.trim().length < 200) {
    fail("README.md looks empty or missing package name");
  } else {
    ok("README.md content");
  }

  const license = readFileSync(join(root, "LICENSE"), "utf8");
  if (!/MIT/i.test(license)) {
    fail("LICENSE does not appear to be MIT");
  } else {
    ok("LICENSE is MIT");
  }

  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  if (!changelog.includes("## [") && !changelog.includes("## [Unreleased]")) {
    fail("CHANGELOG.md missing Keep a Changelog sections");
  } else {
    ok("CHANGELOG.md sections");
  }
}

async function smokeLoad() {
  try {
    const cjs = require(join(root, "dist/index.js"));
    require(join(root, "dist/testing/index.js"));
    if (typeof cjs.BillingKit !== "function") {
      fail("CJS export missing BillingKit");
    } else {
      ok("CJS require(dist) exports BillingKit");
    }
  } catch (error) {
    fail(`CJS require failed: ${error instanceof Error ? error.message : error}`);
  }

  try {
    const esm = await import(pathToFileURL(join(root, "dist/index.mjs")).href);
    await import(pathToFileURL(join(root, "dist/testing/index.mjs")).href);
    if (typeof esm.BillingKit !== "function") {
      fail("ESM export missing BillingKit");
    } else {
      ok("ESM import(dist) exports BillingKit");
    }
  } catch (error) {
    fail(`ESM import failed: ${error instanceof Error ? error.message : error}`);
  }
}

function validateTarballContents(pkg) {
  const dir = mkdtempSync(join(tmpdir(), "billing-kit-pack-"));
  try {
    const packed = execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--pack-destination", dir, "--json"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const [meta] = JSON.parse(packed);
    const tarball = join(dir, meta.filename);
    if (!existsSync(tarball)) {
      fail(`npm pack did not produce ${meta.filename}`);
      return;
    }

    const listing = execFileSync("tar", ["-tzf", tarball], {
      encoding: "utf8",
    });
    const entries = new Set(
      listing
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^package\//, "")),
    );

    const requiredInTarball = [
      "package.json",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
      stripLeadingDot(pkg.main),
      stripLeadingDot(pkg.module),
      stripLeadingDot(pkg.types),
      stripLeadingDot(pkg.exports["./testing"].require.default),
      stripLeadingDot(pkg.exports["./testing"].require.types),
      stripLeadingDot(pkg.exports["./testing"].import.default),
      stripLeadingDot(pkg.exports["./testing"].import.types),
    ];

    for (const entry of requiredInTarball) {
      if (!entries.has(entry)) {
        fail(`tarball missing ${entry}`);
      }
    }

    for (const entry of entries) {
      if (
        entry.startsWith("src/") ||
        entry.startsWith("tests/") ||
        entry.startsWith("examples/") ||
        entry.startsWith(".github/")
      ) {
        fail(`tarball must not include ${entry}`);
      }
    }

    if (!errors.some((message) => message.includes("tarball"))) {
      ok(`npm pack tarball contains required files (${entries.size} entries)`);
    }
  } catch (error) {
    fail(
      `npm pack validation failed: ${
        error instanceof Error ? error.message : error
      }`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log("Validating npm package…");
  const pkg = readPackageJson();

  validateDocs();
  validatePackageJson(pkg);
  validateEntrypoints(pkg);
  await smokeLoad();

  if (wantPack) {
    if (inPrepack) {
      console.log(
        "  • skipping nested npm pack during prepack (use npm run validate:pack)",
      );
    } else {
      validateTarballContents(pkg);
    }
  }

  if (errors.length > 0) {
    console.error("\nPackage validation failed:");
    for (const error of errors) {
      console.error(`  ✗ ${error}`);
    }
    process.exit(1);
  }

  console.log("\nPackage validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
