/**
 * Dockerfile generator for Node.js/Express, Python/FastAPI, and LangGraph
 */
export function generateServiceDockerfile(
  techStack: string,
  folderName: string,
  port: string,
): string {
  if (techStack === "fastapi") {
    return `# ==============================================================================
# FastAPI Microservice Dockerfile
# ==============================================================================
FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PORT=${port}

RUN apt-get update && apt-get install -y --no-install-recommends curl gcc && rm -rf /var/lib/apt/lists/*

COPY apps/${folderName}/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/${folderName} .

EXPOSE ${port}

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${port}/health || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port \${PORT}"]
`;
  }

  if (techStack === "nextjs") {
    return generateNextjsDockerfile(folderName, port);
  }

  // Node.js / Express or LangGraph (Turborepo Multi-Stage)
  return `# ==============================================================================
# Express / Node.js Microservice Dockerfile (Turborepo Multi-Stage)
# ==============================================================================
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

FROM base AS builder
WORKDIR /app
RUN apk update && apk add --no-cache libc6-compat python3 make g++ curl

# Copy entire monorepo workspace definition & packages
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @workspace/${folderName}... build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=${port}

COPY --from=builder /app /app

EXPOSE ${port}

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:${port}/health || exit 1

CMD ["pnpm", "--filter", "@workspace/${folderName}", "start"]
`;
}

/**
 * Dockerfile generator for Next.js Web Applications
 */
export function generateNextjsDockerfile(
  folderName: string,
  port: string = "3000",
): string {
  return `# ==============================================================================
# Next.js Web app Dockerfile (Turborepo Multi-Stage)
# ==============================================================================
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

FROM base AS builder
WORKDIR /app
RUN apk update && apk add --no-cache libc6-compat curl

COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @workspace/${folderName}... build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=${port}

COPY --from=builder /app /app

EXPOSE ${port}

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -f http://localhost:${port} || exit 1

CMD ["pnpm", "--filter", "@workspace/${folderName}", "start"]
`;
}

/**
 * .dockerignore generator for apps
 */
export function generateAppDockerignore(techStack: string): string {
  if (techStack === "fastapi") {
    return `__pycache__/
*.py[cod]
*$py.class
.pytest_cache/
.env
venv/
.venv/
`;
  }

  return `node_modules
dist
.next
.turbo
.env
.env*.local
*.log
`;
}
