import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("release automation / package contract", () => {
  const pkg = JSON.parse(read("package.json")) as {
    version: string;
    private?: boolean;
    scripts: Record<string, string>;
    files: string[];
    publishConfig?: { access?: string; provenance?: boolean };
    exports: Record<string, unknown>;
  };

  it("exposes public publish metadata and dual entrypoints", () => {
    expect(pkg.private).not.toBe(true);
    expect(pkg.publishConfig).toMatchObject({
      access: "public",
      provenance: true,
    });
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", "README.md", "LICENSE", "CHANGELOG.md"]),
    );
    expect(pkg.exports["."]).toBeDefined();
    expect(pkg.exports["./testing"]).toBeDefined();
  });

  it("wires CI, prepublish, and pack validation scripts", () => {
    expect(pkg.scripts.lint).toContain("eslint");
    expect(pkg.scripts.typecheck).toContain("tsc");
    expect(pkg.scripts.test).toContain("jest");
    expect(pkg.scripts.build).toContain("tsup");
    expect(pkg.scripts["validate:package"]).toContain("validate-package.mjs");
    expect(pkg.scripts["validate:pack"]).toContain("--pack");
    expect(pkg.scripts["release:check"]).toContain("release-check.mjs");
    expect(pkg.scripts["release:notes"]).toContain("extract-changelog.mjs");
    expect(pkg.scripts.prepack).toMatch(/build.*validate:package/);
    expect(pkg.scripts.prepublishOnly).toMatch(/lint.*typecheck.*test/);
    expect(pkg.scripts.prepublishOnly).toContain("release:check");
    expect(pkg.scripts.ci).toMatch(
      /lint.*typecheck.*test.*build.*release:check.*validate:pack/,
    );
  });
});

describe("release automation / changelog starter", () => {
  const changelog = read("CHANGELOG.md");

  it("follows Keep a Changelog with Unreleased + SemVer links", () => {
    expect(changelog).toContain("Keep a Changelog");
    expect(changelog).toContain("Semantic Versioning");
    expect(changelog).toContain("## [Unreleased]");
    expect(changelog).toContain("## [1.0.0]");
    expect(changelog).toContain("[Unreleased]:");
    expect(changelog).toContain("[1.0.0]:");
  });

  it("extracts the packaged version section for release notes", () => {
    const version = JSON.parse(read("package.json")).version as string;
    const notes = execFileSync(
      process.execPath,
      ["scripts/extract-changelog.mjs", "--version", version],
      { cwd: root, encoding: "utf8" },
    );

    expect(notes).toContain(`## [${version}]`);
    expect(notes).toMatch(/Added|Core|billing-kit/i);
  });
});

describe("release automation / workflows", () => {
  it("CI runs lint, typecheck, test, build, release check, and pack validation", () => {
    const ci = read(".github/workflows/ci.yml");

    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("npm run release:check");
    expect(ci).toContain("npm run validate:pack");
    expect(ci).toContain("upload-artifact");
    expect(ci).toMatch(/node-version: \[18\.x, 20\.x, 22\.x\]/);
  });

  it("publish workflow gates on v* tags, OIDC, ci, and GitHub Release notes", () => {
    const publish = read(".github/workflows/publish.yml");

    expect(publish).toContain("tags:");
    expect(publish).toContain("v*");
    expect(publish).toContain("id-token: write");
    expect(publish).toContain("contents: write");
    expect(publish).toContain("npm run ci");
    expect(publish).toContain("release:check -- --release");
    expect(publish).toContain("npm publish --access public --provenance");
    expect(publish).toContain("extract-changelog.mjs");
    expect(publish).toContain("softprops/action-gh-release");
  });
});

describe("release automation / scripts present", () => {
  it("ships validation and release helper scripts", () => {
    expect(existsSync(join(root, "scripts/validate-package.mjs"))).toBe(true);
    expect(existsSync(join(root, "scripts/release-check.mjs"))).toBe(true);
    expect(existsSync(join(root, "scripts/extract-changelog.mjs"))).toBe(true);
    expect(existsSync(join(root, "PUBLISHING.md"))).toBe(true);
  });

  it("release:check passes for the current tree", () => {
    const output = execFileSync("npm", ["run", "release:check"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(output).toContain("Release checks passed");
  });
});
