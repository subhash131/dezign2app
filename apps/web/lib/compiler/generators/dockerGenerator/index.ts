import {
  CompiledFile,
  ServiceInfo,
  WebClientInfo,
  WebAppInfo,
  DockerGeneratorOptions,
  ComposeGeneratorContext,
  InfraComposeContext,
} from "@workspace/canvas/types";
import {
  generateServiceDockerfile,
  generateNextjsDockerfile,
  generateAppDockerignore,
} from "./serviceDockerfiles";
import {
  generateRootDockerCompose,
  generateInfraDockerCompose,
} from "./composeGenerators";
import {
  generateRootEnvExample,
  generateServiceEnvExample,
  generateWebClientEnvExample,
  generateSyncEnvScript,
} from "./envGenerators";
import {
  generateDevSetupSh,
  generateDevSetupBat,
  generateProdStartSh,
  generateProdStartBat,
} from "./devScripts";

export type {
  ServiceInfo,
  WebClientInfo,
  WebAppInfo,
  DockerGeneratorOptions,
  ComposeGeneratorContext,
  InfraComposeContext,
};

export {
  generateServiceDockerfile,
  generateNextjsDockerfile,
  generateAppDockerignore,
  generateRootDockerCompose,
  generateInfraDockerCompose,
  generateRootEnvExample,
  generateServiceEnvExample,
  generateWebClientEnvExample,
  generateSyncEnvScript,
  generateDevSetupSh,
  generateDevSetupBat,
  generateProdStartSh,
  generateProdStartBat,
};

/**
 * Generates all Docker-related manifests for the monorepo:
 * 1. Dockerfile & .dockerignore for each Express, FastAPI, LangGraph microservice
 * 2. Dockerfile & .dockerignore for each Next.js Web application
 * 3. Root docker-compose.yml (orchestrating all apps, DB, Redis, Kafka)
 * 4. docker-compose.infra.yml (orchestrating Postgres/Redis/Kafka for dev mode if needed)
 * 5. Root .dockerignore
 * 6. Root & per-service .env.example files
 * 7. scripts/sync-env.mjs smart environment merge script
 * 8. dev-setup.sh / dev-setup.bat & start-prod.sh / start-prod.bat
 */
export function generateDockerFiles(
  options: DockerGeneratorOptions,
): CompiledFile[] {
  const {
    nodes,
    edges,
    services,
    webApps: propWebApps,
    webClients: propWebClients,
    projectName,
    hasKafka = false,
    hasRedis = false,
  } = options;
  const webApps = propWebApps || propWebClients || [];

  const files: CompiledFile[] = [];
  const projectSlug =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "dezign2app";

  // Check database configuration
  const dbNodes = nodes.filter((n) => n.type === "database");
  const hasPostgres = dbNodes.some((n) => {
    const engine = (
      n.data?.dbEngine ||
      n.data?.provider ||
      n.data?.dbType ||
      ""
    ).toLowerCase();
    return engine.includes("postgres") || engine.includes("pg");
  });

  const hasEntityOrDb = nodes.some(
    (n) => n.type === "entity" || n.type === "db_ref" || n.type === "database",
  );

  const hasSqlite = hasEntityOrDb && !hasPostgres;
  const hasInfra = hasPostgres || hasRedis || hasKafka;

  // 1. Generate Per-Service Dockerfiles
  services.forEach((srv) => {
    const srvNode = nodes.find((n) => n.id === srv.id);
    const techStack =
      srvNode?.data?.techStack ||
      (srvNode?.type === "langgraph" ? "langgraph" : "express");
    const port = String(srvNode?.data?.port || "8080");

    const dockerfileContent = generateServiceDockerfile(
      techStack,
      srv.folderName,
      port,
    );
    files.push({
      filename: `apps/${srv.folderName}/Dockerfile`,
      language: "dockerfile",
      content: dockerfileContent,
    });

    files.push({
      filename: `apps/${srv.folderName}/.dockerignore`,
      language: "gitignore",
      content: generateAppDockerignore(techStack),
    });

    // Per-service .env.example
    files.push({
      filename: `apps/${srv.folderName}/.env.example`,
      language: "dotenv",
      content: generateServiceEnvExample(
        port,
        hasPostgres,
        hasSqlite,
        hasRedis,
        hasKafka,
        projectSlug,
        techStack,
        nodes,
      ),
    });
  });

  // 2. Generate Per-WebApp Dockerfiles
  webApps.forEach((client, idx) => {
    const webPort = idx === 0 ? "3000" : `${3000 + idx}`;
    // Dockerfile always exposes 3000 - Next.js internal container port.
    // docker-compose maps webPort:3000 on the host. Dev mode uses webPort natively.
    const dockerfileContent = generateNextjsDockerfile(
      client.folderName,
      "3000",
    );
    files.push({
      filename: `apps/${client.folderName}/Dockerfile`,
      language: "dockerfile",
      content: dockerfileContent,
    });

    files.push({
      filename: `apps/${client.folderName}/.dockerignore`,
      language: "gitignore",
      content: generateAppDockerignore("nextjs"),
    });

    // Per-web-app .env.example uses webPort for native dev mode
    files.push({
      filename: `apps/${client.folderName}/.env.example`,
      language: "dotenv",
      content: generateWebClientEnvExample(
        webPort,
        hasPostgres,
        hasSqlite,
        projectSlug,
        services,
        nodes,
      ),
    });
  });

  // 3. Generate Root docker-compose.yml (production - all containers)
  const dockerComposeContent = generateRootDockerCompose({
    nodes,
    edges,
    services,
    webApps,
    projectSlug,
    hasPostgres,
    hasSqlite,
    hasKafka,
    hasRedis,
  });

  files.push({
    filename: "docker-compose.yml",
    language: "yaml",
    content: dockerComposeContent,
  });

  // 4. Generate docker-compose.infra.yml (dev - infra services only)
  if (hasInfra) {
    files.push({
      filename: "docker-compose.infra.yml",
      language: "yaml",
      content: generateInfraDockerCompose({
        projectSlug,
        hasPostgres,
        hasKafka,
        hasRedis,
        nodes,
      }),
    });
  }

  // 5. Root .env.example (shared infra URLs)
  files.push({
    filename: ".env.example",
    language: "dotenv",
    content: generateRootEnvExample(
      hasPostgres,
      hasSqlite,
      hasRedis,
      hasKafka,
      projectSlug,
      nodes,
    ),
  });

  // 6. scripts/sync-env.mjs - smart env merge (add new keys, keep existing values, remove deleted keys)
  files.push({
    filename: "scripts/sync-env.mjs",
    language: "javascript",
    content: generateSyncEnvScript(),
  });

  // 7. Root .dockerignore
  files.push({
    filename: ".dockerignore",
    language: "gitignore",
    content: `node_modules
dist
.next
.turbo
.git
.env*.local
*.log
*.sqlite
*.sqlite3
*.db
*.db-journal
*.db-wal
*.db-shm
.DS_Store
`,
  });

  // 8. dev-setup scripts (infra only + native apps)
  files.push({
    filename: "dev-setup.sh",
    language: "shell",
    content: generateDevSetupSh(projectName, hasInfra, services, webApps),
  });

  files.push({
    filename: "dev-setup.bat",
    language: "bat",
    content: generateDevSetupBat(projectName, hasInfra, services, webApps),
  });

  // 9. Production start scripts (full docker stack)
  files.push({
    filename: "start-prod.sh",
    language: "shell",
    content: generateProdStartSh(projectName),
  });

  files.push({
    filename: "start-prod.bat",
    language: "bat",
    content: generateProdStartBat(projectName),
  });

  return files;
}
