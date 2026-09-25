import { CompiledFile } from "@workspace/canvas/types";

export function generateStoragePackageJson(
  packageName: string,
  nodeLabel: string,
): CompiledFile {
  return {
    filename: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        private: true,
        description: `S3-compatible object storage client, buckets, and operations for ${nodeLabel}`,
        main: "src/index.ts",
        types: "src/index.ts",
        exports: {
          ".": "./src/index.ts",
          "./client": "./src/client.ts",
          "./config": "./src/config.ts",
          "./buckets": "./src/buckets.ts",
          "./operations": "./src/operations.ts",
        },
        scripts: {
          build: "tsc",
          "check-types": "tsc --noEmit",
        },
        dependencies: {
          "@aws-sdk/client-s3": "^3.750.0",
          "@aws-sdk/s3-request-presigner": "^3.750.0",
          "@workspace/logger": "workspace:*",
        },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          typescript: "^5.3.3",
        },
      },
      null,
      2,
    ),
  };
}

export function generateStorageTsConfig(): CompiledFile {
  return {
    filename: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: {
          outDir: "./dist",
          rootDir: "./src",
        },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  };
}

export function generateStorageIndexFile(): CompiledFile {
  return {
    filename: "src/index.ts",
    language: "typescript",
    content: `// ═══════════════════════════════════════════════════════════════════════════
// Storage Package Barrel Exports
// ═══════════════════════════════════════════════════════════════════════════

export * from "./config";
export * from "./client";
export * from "./buckets";
export * from "./operations";
`,
  };
}
