#!/usr/bin/env node
/**
 * Extracts a Keep a Changelog section for GitHub Releases / release notes.
 *
 * Usage:
 *   node scripts/extract-changelog.mjs [--version X.Y.Z] [--out path]
 *
 * Defaults version to package.json. Writes to stdout when --out is omitted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function packageVersion() {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

/**
 * @param {string} changelog
 * @param {string} version
 * @returns {string | null}
 */
export function extractChangelogSection(changelog, version) {
  const escaped = version.replace(/\./g, "\\.");
  const header = new RegExp(`^## \\[${escaped}\\].*$`, "m");
  const match = header.exec(changelog);
  if (!match || match.index == null) return null;

  const start = match.index;
  const afterHeader = changelog.slice(start + match[0].length);
  const nextHeader = afterHeader.search(/\n## \[/);
  const body =
    nextHeader === -1 ? afterHeader : afterHeader.slice(0, nextHeader);

  return `${match[0].trim()}\n${body.trimEnd()}\n`;
}

function main() {
  const version = readArg("--version") ?? packageVersion();
  const out = readArg("--out");
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const section = extractChangelogSection(changelog, version);

  if (!section) {
    console.error(
      `No CHANGELOG.md section found for version ${version} (expected "## [${version}]").`,
    );
    process.exit(1);
  }

  if (out) {
    writeFileSync(resolve(out), section, "utf8");
    console.error(`Wrote release notes for ${version} → ${out}`);
  } else {
    process.stdout.write(section);
  }
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
