import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("compatibility documentation", () => {
  it("ships docs/compatibility.md", () => {
    expect(existsSync(join(root, "docs/compatibility.md"))).toBe(true);
  });

  it("documents the Node.js version support matrix", () => {
    const doc = read("docs/compatibility.md");

    expect(doc).toContain("Node.js version support");
    expect(doc).toContain("18.x");
    expect(doc).toContain("20.x");
    expect(doc).toContain("22.x");
    expect(doc).toMatch(/engines\.node/);
  });

  it("documents the Stripe vs Razorpay feature support table with all four labels", () => {
    const doc = read("docs/compatibility.md");

    expect(doc).toContain("Stripe vs Razorpay feature support");
    expect(doc).toContain("Label legend");
    expect(doc).toMatch(/Supported/);
    expect(doc).toMatch(/Partial/);
    expect(doc).toMatch(/Planned/);
    expect(doc).toMatch(/N\/A/);
  });

  it("documents runtime and provider limitation notes", () => {
    const doc = read("docs/compatibility.md");

    expect(doc).toContain("Runtime limitation notes");
    expect(doc).toContain("Provider limitation notes");
    expect(doc).toMatch(/UnsupportedOperationError/);
  });

  it("matches package.json's declared engines.node floor", () => {
    const pkg = JSON.parse(read("package.json")) as {
      engines?: { node?: string };
    };
    const doc = read("docs/compatibility.md");

    expect(pkg.engines?.node).toBe(">=18");
    expect(doc).toContain('engines.node: ">=18"');
  });

  it("is cross-linked from README, VERSIONING.md, and UPGRADING.md", () => {
    expect(read("README.md")).toContain("docs/compatibility.md");
    expect(read("VERSIONING.md")).toContain("docs/compatibility.md");
    expect(read("UPGRADING.md")).toContain("docs/compatibility.md");
  });
});
