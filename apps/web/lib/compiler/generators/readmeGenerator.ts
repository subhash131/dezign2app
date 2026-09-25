import { CompiledFile } from "@workspace/canvas/types";

export function generateRootReadme(
  projectName: string,
  serviceNodesCount: number,
  webClientNodesCount: number,
  entityNodesCount: number,
  services: { id: string; name: string; folderName: string }[],
  webClients: { id: string; name: string; folderName: string }[],
  hasKafka: boolean = false,
  hasRedis: boolean = false,
  hasDb: boolean = false,
  redisPackageFolder: string = "redis",
  redisPackageLabel?: string,
  hasStorage: boolean = false,
): CompiledFile {
  const kafkaSection = hasKafka
    ? `- **Kafka Broker Package**: \`packages/kafka\` (\`@workspace/kafka\`)\n`
    : "";

  const redisSection = hasRedis
    ? `- **Redis Package${redisPackageLabel ? ` (${redisPackageLabel})` : ""}**: \`packages/${redisPackageFolder}\` (\`@workspace/${redisPackageFolder}\`)\n`
    : "";

  const dbSection = hasDb
    ? `- **Database Package**: \`packages/db\` (\`@workspace/db\`)\n`
    : "";

  const storageSection = hasStorage
    ? `- **Object Storage Package**: \`packages/storage\` (\`@workspace/storage\`)\n`
    : "";

  const hasInfra = hasKafka || hasRedis || entityNodesCount > 0;

  const infraDevCmd = hasInfra
    ? `\n# 2. Start infrastructure only (Postgres / Redis / Kafka)\ndocker compose -f docker-compose.infra.yml up -d\n`
    : "";

  const dbPushCmd = hasDb
    ? `\n# 5. Push database schema (first run or after schema changes)\ncd packages/db && pnpm push\n`
    : "";

  const dbSchemaSection = hasDb
    ? `\n### Database Schema Management\n\n\`\`\`bash\ncd packages/db\npnpm push    # push schema to DB\npnpm studio  # open Drizzle Studio\n\`\`\`\n`
    : "";

  const readmeContent = `# ${projectName} Workspace\n\nGenerated Turborepo + pnpm monorepo architecture containing ${serviceNodesCount} backend service(s), ${webClientNodesCount} web page(s), and ${entityNodesCount} database entity table(s).\n\n## Workspace Structure\n\n- **Shared TS Config**: \`packages/typescript-config\` (\`@workspace/typescript-config\`)\n- **Shared Types & Schemas**: \`packages/types\` (\`@workspace/types\`)\n- **Shared UI Package (Shadcn UI)**: \`packages/ui\` (\`@workspace/ui\`)\n${dbSection}- **Logger Package**: \`packages/logger\` (\`@workspace/logger\`)\n${kafkaSection}${redisSection}${storageSection}${services.map((s) => `- **${s.name}**: \`apps/${s.folderName}\``).join("\n")}\n${webClients.map((w) => `- **${w.name} (Next.js App)**: \`apps/${w.folderName}\``).join("\n")}\n\n## Shared Types & API Contracts\n\nAll API request/response contracts, route params, and event schemas are stored in \`packages/types\` (\`@workspace/types\`).\nMicroservices and frontend applications import shared types directly:\n\n\`\`\`typescript\nimport { GetUsersResponse, PostCreateUserBody, postCreateUserBodySchema } from "@workspace/types";\n\`\`\`\n\n## Getting Started\n\n### Option A: Dev Mode — Hot Reload (Recommended)\n\nRun infrastructure in Docker; apps run natively with full hot reload.\n\n\`\`\`bash\n# One-command setup (macOS / Linux)\nbash dev-setup.sh\n\n# One-command setup (Windows)\ndev-setup.bat\n\`\`\`\n\nOr step-by-step:\n\n\`\`\`bash\n# 1. Sync .env files (adds new keys, keeps your existing values)\nnode scripts/sync-env.mjs\n${infraDevCmd}\n# 3. Install dependencies\npnpm install\n\n# 4. Start all apps with hot reload\npnpm dev\n${dbPushCmd}\`\`\`\n\n### Option B: Production — Full Docker Stack\n\n\`\`\`bash\ndocker compose up --build -d\n\n# Convenience scripts:\nbash start-prod.sh   # macOS / Linux\nstart-prod.bat       # Windows\n\n# View live logs\ndocker compose logs -f\n\n# Stop\ndocker compose down\n\`\`\`\n${dbSchemaSection}`;

  return {
    filename: "README.md",
    language: "markdown",
    content: readmeContent,
  };
}
