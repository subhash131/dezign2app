import { CompiledFile, NodeDependencyItem } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";

export interface GenerateNextjsConfigParams {
  node: BackendNode;
  sanitizedName: string;
  serviceName: string;
  port: string;
  cors: boolean;
  corsOrigins: string;
  hasDb: boolean;
  hasKafka: boolean;
  hasRedis: boolean;
}

export function generateNextjsConfigFiles(params: GenerateNextjsConfigParams): CompiledFile[] {
  const {
    node,
    sanitizedName,
    serviceName,
    port,
    cors,
    corsOrigins,
    hasDb,
    hasKafka,
    hasRedis,
  } = params;

  const files: CompiledFile[] = [];

  // 1. package.json dependencies
  const dependencies: Record<string, string> = {
    next: "^16.0.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    zod: "^3.24.2",
    "@workspace/types": "workspace:*",
    "@workspace/logger": "workspace:*",
  };

  if (hasDb) {
    dependencies["@workspace/db"] = "workspace:*";
  }
  if (hasKafka) {
    dependencies["@workspace/kafka"] = "workspace:*";
  }
  if (hasRedis) {
    dependencies["@workspace/redis"] = "workspace:*";
  }

  // Add custom dependencies
  const customDeps: NodeDependencyItem[] = node.data?.customDependencies || [];
  customDeps.forEach((dep) => {
    if (dep.name && !dep.isDev) {
      dependencies[dep.name] = dep.version || "latest";
    }
  });

  const devDependencies: Record<string, string> = {
    "@workspace/typescript-config": "workspace:*",
    "@types/node": "^20.11.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    typescript: "^5.4.0",
  };

  customDeps.forEach((dep) => {
    if (dep.name && dep.isDev) {
      devDependencies[dep.name] = dep.version || "latest";
    }
  });

  const packageJsonContent = JSON.stringify(
    {
      name: `@workspace/${sanitizedName}`,
      version: "0.0.1",
      private: true,
      scripts: {
        dev: `next dev -p ${port}`,
        build: "next build",
        start: `next start -p ${port}`,
        lint: "next lint",
      },
      dependencies,
      devDependencies,
    },
    null,
    2,
  );

  files.push({
    filename: "package.json",
    language: "json",
    content: packageJsonContent,
  });

  // 2. next.config.ts
  const allowedOrigin = corsOrigins || "*";
  const nextConfigContent = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
${
  cors
    ? `  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "${allowedOrigin}" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, PATCH, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, X-Requested-With" },
        ],
      },
    ];
  },
`
    : ""
}};

export default nextConfig;
`;

  files.push({
    filename: "next.config.ts",
    language: "typescript",
    content: nextConfigContent,
  });

  // 3. tsconfig.json
  const tsconfigContent = JSON.stringify(
    {
      extends: "@workspace/typescript-config/base.json",
      compilerOptions: {
        target: "es5",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [
          {
            name: "next",
          },
        ],
        paths: {
          "@/*": ["./*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2,
  );

  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: tsconfigContent,
  });

  // 4. next-env.d.ts
  files.push({
    filename: "next-env.d.ts",
    language: "typescript",
    content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/basic-features/typescript for more information.
`,
  });

  // 5. .env.example
  files.push({
    filename: ".env.example",
    language: "dotenv",
    content: `PORT=${port}
NODE_ENV=development
${hasDb ? `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${sanitizedName}\n` : ""}${
      hasKafka ? `KAFKA_BROKERS=localhost:9092\n` : ""
    }${hasRedis ? `REDIS_URL=redis://localhost:6379\n` : ""}`,
  });

  // 6. .gitignore
  files.push({
    filename: ".gitignore",
    language: "text",
    content: `.next
node_modules
.env
.env*.local
dist
`,
  });

  // 7. README.md
  files.push({
    filename: "README.md",
    language: "markdown",
    content: `# ${serviceName} (Next.js API Service)

This microservice is built using **Next.js App Router (API Route Handlers)**.

## Getting Started

\`\`\`bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
\`\`\`

Listening on port: **${port}**
`,
  });

  return files;
}
