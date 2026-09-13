export interface TechVersionOption {
  readonly value: string;
  readonly label: string;
}

export interface TechOption {
  readonly value: string;
  readonly label: string;
  readonly versions: readonly TechVersionOption[];
  readonly defaultVersion: string;
}

// Single Source of Truth definitions (as const)
export const SERVICE_TECH_OPTIONS = [
  {
    value: "express",
    label: "Express.js",
    versions: [{ value: "4.x", label: "4.x" }],
    defaultVersion: "4.x",
  },
  {
    value: "fastapi",
    label: "FastAPI (Python)",
    versions: [{ value: "0.110.x", label: "0.110.x" }],
    defaultVersion: "0.110.x",
  },
  {
    value: "nextjs",
    label: "Next.js API",
    versions: [{ value: "16.x", label: "16.x" }],
    defaultVersion: "16.x",
  },
] as const;

export const WEB_CLIENT_TECH_OPTIONS = [
  {
    value: "nextjs",
    label: "Next.js",
    versions: [{ value: "16.x", label: "16.x" }],
    defaultVersion: "16.x",
  },
] as const;

export const DATABASE_ENGINE_OPTIONS = [
  {
    value: "sqlite",
    label: "SQLite",
    versions: [{ value: "3.x", label: "3.x" }],
    defaultVersion: "3.x",
  },
  {
    value: "postgres",
    label: "PostgreSQL",
    versions: [{ value: "16.x", label: "16.x" }],
    defaultVersion: "16.x",
  },
  {
    value: "mysql",
    label: "MySQL",
    versions: [{ value: "8.x", label: "8.x" }],
    defaultVersion: "8.x",
  },
  {
    value: "mongodb",
    label: "MongoDB",
    versions: [{ value: "7.x", label: "7.x" }],
    defaultVersion: "7.x",
  },
  {
    value: "pinecone",
    label: "Pinecone",
    versions: [{ value: "v2", label: "v2" }],
    defaultVersion: "v2",
  },
  {
    value: "qdrant",
    label: "Qdrant",
    versions: [{ value: "1.x", label: "1.x" }],
    defaultVersion: "1.x",
  },
  {
    value: "convex",
    label: "Convex",
    versions: [{ value: "1.x", label: "1.x" }],
    defaultVersion: "1.x",
  },
  {
    value: "redis",
    label: "Redis",
    versions: [{ value: "7.x", label: "7.x" }],
    defaultVersion: "7.x",
  },
] as const;

// Derived TypeScript Types (inferred directly from the single source of truth!)
export type ServiceTechStack = (typeof SERVICE_TECH_OPTIONS)[number]["value"];
export type ServiceTechVersion =
  (typeof SERVICE_TECH_OPTIONS)[number]["versions"][number]["value"];

export type WebClientTechStack =
  (typeof WEB_CLIENT_TECH_OPTIONS)[number]["value"];
export type WebClientTechVersion =
  (typeof WEB_CLIENT_TECH_OPTIONS)[number]["versions"][number]["value"];

export type DatabaseEngine = (typeof DATABASE_ENGINE_OPTIONS)[number]["value"];
export type DatabaseEngineVersion =
  (typeof DATABASE_ENGINE_OPTIONS)[number]["versions"][number]["value"];

// Tuples for Zod z.enum validation (derived directly without re-typing)
export const ALL_TECH_STACK_VALUES = [
  ...SERVICE_TECH_OPTIONS.map((t) => t.value),
  ...WEB_CLIENT_TECH_OPTIONS.map((t) => t.value),
] as [string, ...string[]];

export const ALL_TECH_VERSION_VALUES = [
  ...SERVICE_TECH_OPTIONS.flatMap((t) => t.versions.map((v) => v.value)),
  ...WEB_CLIENT_TECH_OPTIONS.flatMap((t) => t.versions.map((v) => v.value)),
] as [string, ...string[]];

export const ALL_DATABASE_ENGINE_VALUES = [
  ...DATABASE_ENGINE_OPTIONS.map((e) => e.value),
] as [string, ...string[]];

export const ALL_DATABASE_ENGINE_VERSION_VALUES = [
  ...DATABASE_ENGINE_OPTIONS.flatMap((e) => e.versions.map((v) => v.value)),
] as [string, ...string[]];
