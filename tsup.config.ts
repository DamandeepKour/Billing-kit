import { defineConfig } from "tsup";

/**
 * Dual CJS/ESM build for npm.
 * Only these entrypoints ship (via package.json `files: ["dist", …]`).
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    "testing/index": "src/testing/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  target: "node18",
  outDir: "dist",
});
