import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: "dist",
    clean: true,
    // Bundle all @workspace/* packages inline so the final dist/index.js
    // is fully self-contained JS with no runtime resolution of .ts files.
    noExternal: [/@workspace\//],
  },
  {
    entry: ["src/mcp/index.ts"],
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: "dist/mcp",
    noExternal: [/@workspace\//],
  },
]);
