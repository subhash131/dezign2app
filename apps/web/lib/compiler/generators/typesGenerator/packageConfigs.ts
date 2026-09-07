import { CompiledFile } from "@workspace/canvas/types";

export function generateTypesPackageConfigs(): CompiledFile[] {
  const packageJson = JSON.stringify(
    {
      name: "@workspace/types",
      version: "0.0.0",
      private: true,
      description:
        "Shared TypeScript interfaces and Zod schemas across microservices and frontend clients",
      main: "src/index.ts",
      types: "src/index.ts",
      scripts: {
        build: "tsc",
        "check-types": "tsc --noEmit",
      },
      dependencies: {
        zod: "^3.24.2",
      },
      devDependencies: {
        "@workspace/typescript-config": "workspace:*",
        typescript: "^5.3.3",
      },
    },
    null,
    2,
  );

  const tsconfig = JSON.stringify(
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
  );

  return [
    {
      filename: "package.json",
      language: "json",
      content: packageJson,
    },
    {
      filename: "tsconfig.json",
      language: "json",
      content: tsconfig,
    },
  ];
}
