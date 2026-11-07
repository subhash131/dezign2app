import { CompiledFile, NodeDependencyItem } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";

export function generateProjectConfigFiles(
  appSlug: string = "web-app",
  customDependencies?: NodeDependencyItem[],
  hasDb: boolean = false,
  dbPackageName: string = "@workspace/db",
  dbNode?: BackendNode,
  hasTransformers: boolean = false,
): CompiledFile[] {
  const hasTrans =
    hasTransformers ||
    (Array.isArray(customDependencies) &&
      customDependencies.some((d) => d?.name === "@workspace/transformers"));

  const dependencies: Record<string, string> = {
    ...(hasDb ? { [dbPackageName]: "workspace:*" } : {}),
    ...(hasTrans ? { "@workspace/transformers": "workspace:*" } : {}),
    "@workspace/logger": "workspace:*",
    "@workspace/types": "workspace:*",
    "@workspace/ui": "workspace:*",
    "@hugeicons/core-free-icons": "^3.0.0",
    "@hugeicons/react": "^1.1.2",
    "class-variance-authority": "^0.7.1",
    "radix-ui": "^1.4.3",
    dotenv: "^16.4.5",
    "lucide-react": "^0.475.0",
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    sonner: "^2.0.7",
    zod: "^3.24.2",
  };

  const devDependencies: Record<string, string> = {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^20.19.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@workspace/typescript-config": "workspace:*",
    tailwindcss: "^4.0.0",
    typescript: "^5.7.3",
    vitest: "^1.6.0",
  };

  if (Array.isArray(customDependencies)) {
    customDependencies.forEach((dep) => {
      if (!dep || !dep.name) return;
      const ver = dep.version || "latest";
      if (dep.isDev) {
        devDependencies[dep.name] = ver;
      } else {
        dependencies[dep.name] = ver;
      }
    });
  }

  const packageJson = JSON.stringify(
    {
      name: `@workspace/${appSlug}`,
      version: "0.0.1",
      type: "module",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start",
        lint: "next lint",
        typecheck: "tsc --noEmit",
        test: "vitest run",
      },
      dependencies,
      devDependencies,
    },
    null,
    2,
  );

  const tsconfig = JSON.stringify(
    {
      extends: "@workspace/typescript-config/nextjs.json",
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./*"],
          "@workspace/ui/*": ["../../packages/ui/src/*"],
          ...(hasTrans
            ? {
                "@workspace/transformers": [
                  "../../packages/transformers/src/index.ts",
                ],
                "@workspace/transformers/*": [
                  "../../packages/transformers/src/*",
                ],
              }
            : {}),
          ...(hasDb
            ? {
                "@workspace/db/*": ["../../packages/db/*"],
                "@workspace/db": ["../../packages/db/index.ts"],
              }
            : {}),
        },
        declaration: false,
        declarationMap: false,
      },
      include: [
        "next-env.d.ts",
        "next.config.ts",
        "**/*.ts",
        "**/*.tsx",
        ".next/types/**/*.ts",
      ],
      exclude: ["node_modules"],
    },
    null,
    2,
  );

  const transpilePackages = [
    "@workspace/ui",
    "@workspace/logger",
    ...(hasDb ? [dbPackageName] : []),
    ...(hasTrans ? ["@workspace/transformers"] : []),
    "@workspace/types",
  ];

  const serverExternalPackages = [
    ...(hasDb ? ["better-sqlite3"] : []),
    "better-auth",
  ];

  const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ${JSON.stringify(transpilePackages)},
  serverExternalPackages: ${JSON.stringify(serverExternalPackages)},
};

export default nextConfig;
`;

  const envLines: string[] = [];
  if (hasDb) {
    const defaultPg =
      dbNode?.data?.connectionString ||
      dbNode?.data?.connectionStringPooled ||
      "postgresql://postgres:postgres@localhost:5432/postgres";
    const defaultMysql =
      dbNode?.data?.connectionString ||
      "mysql://root:root@localhost:3306/dezign2app";

    const isPostgres =
      dbPackageName.includes("postgres") ||
      dbPackageName.includes("pg") ||
      dbNode?.data?.dbEngine === "postgres" ||
      dbNode?.data?.provider === "supabase" ||
      dbNode?.data?.provider === "neon";

    const isMysql =
      dbPackageName.includes("mysql") ||
      dbNode?.data?.dbEngine === "mysql";

    if (isPostgres) {
      envLines.push(`DATABASE_URL=${defaultPg}`);
    } else if (isMysql) {
      envLines.push(`DATABASE_URL=${defaultMysql}`);
    } else {
      envLines.push("DATABASE_PATH=../../packages/db/sqlite.db");
      envLines.push("DATABASE_URL=../../packages/db/sqlite.db");
    }
  }
  envLines.push("NEXT_PUBLIC_LOG_LEVEL=info");
  envLines.push("NEXT_PUBLIC_ENABLE_DEBUG_LOGS=false");
  envLines.push("NEXT_PUBLIC_ENABLE_DEBUG_STATE=false\n");
  const envContent = envLines.join("\n");

  return [
    {
      filename: "package.json",
      language: "json",
      content: packageJson,
    },
    {
      filename: ".env",
      language: "dotenv",
      content: envContent,
    },
    {
      filename: ".env.example",
      language: "dotenv",
      content: envContent,
    },
    {
      filename: "postcss.config.mjs",
      language: "javascript",
      content: `export { default } from "@workspace/ui/postcss.config";\n`,
    },
    {
      filename: "tsconfig.json",
      language: "json",
      content: tsconfig,
    },
    {
      filename: "next.config.mjs",
      language: "javascript",
      content: nextConfig,
    },
    {
      filename: "app/globals.css",
      language: "css",
      content: `@import "@workspace/ui/globals.css";

@theme inline {
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
}
`,
    },
  ];
}
