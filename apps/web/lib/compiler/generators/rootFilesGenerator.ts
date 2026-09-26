import { CompiledFile } from "@workspace/canvas/types";

/**
 * Generates root workspace files: package.json, pnpm-workspace.yaml, turbo.json, .gitignore
 */
export function generateRootFiles(projectName: string): CompiledFile[] {
  const files: CompiledFile[] = [];

  const rootPackageJson = JSON.stringify(
    {
      name: projectName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      version: "0.0.1",
      private: true,
      scripts: {
        build: "turbo build",
        dev: "turbo dev",
        test: "turbo test",
        lint: "turbo lint",
        "check-types": "turbo check-types",
        format: 'prettier --write "**/*.{ts,tsx,md}"',
        "docker:build": "docker compose build",
        "docker:up": "docker compose up -d",
        "docker:down": "docker compose down",
        "docker:logs": "docker compose logs -f",
        postinstall: 'node -e "try { const p = require(\'path\').dirname(require.resolve(\'better-sqlite3/package.json\', { paths: [\'./packages/db\'] })); require(\'child_process\').execSync(\'npx prebuild-install\', { cwd: p, stdio: \'inherit\' }); } catch (e) {}"',
      },
      devDependencies: {
        "@workspace/typescript-config": "workspace:*",
        prettier: "^3.7.4",
        turbo: "^2.6.3",
        typescript: "5.7.3",
        vitest: "^1.6.0",
      },
      packageManager: "pnpm@10.4.1",
      engines: {
        node: ">=20",
      },
    },
    null,
    2,
  );
  files.push({
    filename: "package.json",
    language: "json",
    content: rootPackageJson,
  });

  files.push({
    filename: "pnpm-workspace.yaml",
    language: "yaml",
    content: `packages:
  - "apps/*"
  - "packages/*"
  - "packages/grpc/*"
  - "packages/db/*"
  - "packages/storage/*"

onlyBuiltDependencies:
  - better-sqlite3
  - esbuild
  - "@prisma/client"
`,
  });


  const turboJson = JSON.stringify(
    {
      $schema: "https://turbo.build/schema.json",
      ui: "tui",
      tasks: {
        build: {
          dependsOn: ["^build"],
          outputs: [".next/**", "dist/**"],
        },
        dev: {
          cache: false,
          persistent: true,
        },
        test: {},
        lint: {},
        "check-types": {
          dependsOn: ["^check-types"],
        },
      },
    },
    null,
    2,
  );
  files.push({
    filename: "turbo.json",
    language: "json",
    content: turboJson,
  });

  const rootGitignore = `node_modules
dist
.turbo
.next
.env
*.log
.DS_Store
*.db
*.sqlite
*.sqlite3
*.db-journal
*.db-wal
*.db-shm
`;
  files.push({
    filename: ".gitignore",
    language: "gitignore",
    content: rootGitignore,
  });

  return files;
}

/**
 * Generates shared packages/typescript-config package (@workspace/typescript-config)
 */
export function generateTypescriptConfigPackage(): CompiledFile[] {
  const files: CompiledFile[] = [];

  const tsConfigPackageJson = JSON.stringify(
    {
      name: "@workspace/typescript-config",
      version: "0.0.0",
      private: true,
      license: "MIT",
    },
    null,
    2,
  );
  files.push({
    filename: "packages/typescript-config/package.json",
    language: "json",
    content: tsConfigPackageJson,
  });

  const tsConfigBase = JSON.stringify(
    {
      $schema: "https://json.schemastore.org/tsconfig",
      display: "Default",
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        esModuleInterop: true,
        incremental: false,
        isolatedModules: true,
        lib: ["es2022", "DOM", "DOM.Iterable"],
        module: "NodeNext",
        moduleDetection: "force",
        moduleResolution: "NodeNext",
        noUncheckedIndexedAccess: true,
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: true,
        target: "ES2022",
      },
    },
    null,
    2,
  );
  files.push({
    filename: "packages/typescript-config/base.json",
    language: "json",
    content: tsConfigBase,
  });

  const tsConfigNextjs = JSON.stringify(
    {
      $schema: "https://json.schemastore.org/tsconfig",
      display: "Next.js",
      extends: "./base.json",
      compilerOptions: {
        plugins: [{ name: "next" }],
        module: "ESNext",
        moduleResolution: "Bundler",
        declaration: false,
        declarationMap: false,
        allowJs: true,
        jsx: "preserve",
        noEmit: true,
      },
    },
    null,
    2,
  );
  files.push({
    filename: "packages/typescript-config/nextjs.json",
    language: "json",
    content: tsConfigNextjs,
  });

  const tsConfigReactLibrary = JSON.stringify(
    {
      $schema: "https://json.schemastore.org/tsconfig",
      display: "React Library",
      extends: "./base.json",
      compilerOptions: {
        jsx: "react-jsx",
        lib: ["es2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
      },
    },
    null,
    2,
  );
    files.push({
    filename: "packages/typescript-config/react-library.json",
    language: "json",
    content: tsConfigReactLibrary,
  });

  files.push({
    filename: "packages/typescript-config/tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "./base.json",
        files: [],
      },
      null,
      2,
    ),
  });

  return files;
}
