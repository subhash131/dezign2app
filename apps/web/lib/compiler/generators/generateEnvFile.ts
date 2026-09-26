// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  generateEnvFile
// LAYER:   generators
// PURPOSE: Collects environment variable definitions from a target app node
//          (service / webApp / langgraph) AND every package node it is
//          connected to (database, storage, redis, kafka, auth, payments),
//          then renders a structured `.env` / `.env.example` output.
//
//  Strategy:
//    1. Own envVars   — pulled directly from the app node's `data.envVars[]`
//    2. Package envVars — pulled from every directly-connected package node
//       (database, redis_instance, storage, kafka, auth, payments) via edges.
//       These are listed under a banner so the developer knows where they come
//       from (they do NOT own a .env themselves; their values land here).
//    3. Fallback inferred lines — for legacy nodes that have no envVars yet
//       (keeps existing behaviour for services with DB / Redis / etc).
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge } from "@/types/canvas";

export interface EnvVarEntry {
  name: string;
  description?: string;
  /** Example / default value shown in .env.example */
  exampleValue?: string;
}

export interface EnvSection {
  /** Human-readable section heading */
  heading: string;
  /** Optional sub-heading context (e.g. package node label) */
  subheading?: string;
  vars: EnvVarEntry[];
}

// ── Package node type helpers ────────────────────────────────────────────────

const PACKAGE_NODE_TYPES = new Set([
  "database",
  "redis_instance",
  "storage",
  "kafka",
  "sqs",
  "redis-pubsub",
  "redis-streams",
  "redis-cache",
  "auth",
  "payments",
  "external",
]);

function isPackageNode(nodeType: string | undefined): boolean {
  return !!nodeType && PACKAGE_NODE_TYPES.has(nodeType);
}

function sectionHeadingForNodeType(nodeType: string): string {
  const map: Record<string, string> = {
    database: "Database",
    redis_instance: "Redis",
    "redis-pubsub": "Redis Pub/Sub",
    "redis-streams": "Redis Streams",
    "redis-cache": "Redis Cache",
    storage: "Object Storage (S3 / R2 / MinIO)",
    kafka: "Kafka",
    sqs: "AWS SQS",
    auth: "Authentication",
    payments: "Payments",
    external: "External API",
  };
  return map[nodeType] ?? nodeType;
}

// ── Infer example values for common env var names ───────────────────────────

export function inferExampleValue(name: string, nodeType?: string): string {
  const n = name.toUpperCase();

  // Database
  if (n === "DATABASE_URL") {
    if (nodeType === "database") return "postgresql://user:password@localhost:5432/mydb";
    return "file:./local.db";
  }
  if (n === "DATABASE_PATH" || n === "DB_FILE_PATH") return "../../packages/db/sqlite.db";
  if (n === "REDIS_URL" || (n.endsWith("_URL") && n.includes("REDIS"))) return "redis://localhost:6379";
  if (n === "MONGODB_URI") return "mongodb://localhost:27017/mydb";

  // Storage
  if (n === "AWS_ACCESS_KEY_ID") return "AKIAIOSFODNN7EXAMPLE";
  if (n === "AWS_SECRET_ACCESS_KEY") return "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  if (n === "AWS_REGION") return "us-east-1";
  if (n === "S3_ENDPOINT_URL") return "https://your-custom-endpoint.com";

  // Auth
  if (n === "BETTER_AUTH_SECRET") return "your_super_secret_key_change_in_production";
  if (n === "BETTER_AUTH_URL" || n === "NEXT_PUBLIC_BETTER_AUTH_URL") return "http://localhost:3001";
  if (n === "AUTH_BASE_URL") return "http://localhost:3001";

  // Payments
  if (n.includes("CREEM") && n.includes("KEY")) return "creem_live_xxxxxxxxxxxx";
  if (n.includes("CREEM") && n.includes("SECRET")) return "whsec_xxxxxxxxxxxx";
  if (n.includes("STRIPE") && n.includes("KEY")) return "sk_test_xxxxxxxxxxxx";
  if (n.includes("STRIPE") && n.includes("SECRET")) return "whsec_xxxxxxxxxxxx";

  // Kafka
  if (n === "KAFKA_BROKERS") return "localhost:9092";
  if (n === "KAFKA_CLIENT_ID") return "my-service";

  // SQS
  if (n === "SQS_QUEUE_URL") return "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue";

  // Common
  if (n === "PORT") return "8080";
  if (n === "NODE_ENV") return "development";
  if (n === "LOG_LEVEL") return "info";
  if (n.endsWith("_BASE_URL")) return "http://localhost:8080";
  if (n.endsWith("_API_KEY")) return "your_api_key_here";

  return "";
}

// ── Core collection logic ────────────────────────────────────────────────────

/**
 * Collects all env var sections for a given **app node** (service / webApp / langgraph).
 *
 * @param appNode  - The app node being compiled (service / webApp / langgraph).
 * @param allNodes - Full flat node list from the canvas.
 * @param allEdges - Full edge list from the canvas.
 * @returns        - Ordered array of {@link EnvSection} objects, ready for rendering.
 */
export function collectEnvSections(
  appNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): EnvSection[] {
  const sections: EnvSection[] = [];

  // ── 1. Own env vars (defined directly on the app node) ─────────────────
  const ownVars = ((appNode.data?.envVars ?? []) as EnvVarEntry[]);
  if (ownVars.length > 0) {
    sections.push({
      heading: "Application",
      vars: ownVars.map((v) => ({
        name: v.name,
        description: v.description,
        exampleValue: v.exampleValue ?? inferExampleValue(v.name, appNode.type),
      })),
    });
  }

  // ── 2. Connected package node env vars ──────────────────────────────────
  // Walk all edges where this app node is the source OR target, find package nodes.
  const seenNodeIds = new Set<string>();

  allEdges.forEach((edge) => {
    const connectedId =
      edge.source === appNode.id ? edge.target :
      edge.target === appNode.id ? edge.source : null;

    if (!connectedId || seenNodeIds.has(connectedId)) return;

    const connectedNode = allNodes.find((n) => n.id === connectedId);
    if (!connectedNode || !isPackageNode(connectedNode.type)) return;

    seenNodeIds.add(connectedId);

    const pkgVars = ((connectedNode.data?.envVars ?? []) as EnvVarEntry[]);
    if (pkgVars.length === 0) return;

    const heading = sectionHeadingForNodeType(connectedNode.type ?? "");
    const nodeLabel = connectedNode.data?.label as string | undefined;

    sections.push({
      heading,
      subheading: nodeLabel
        ? `from package node: "${nodeLabel}"`
        : `from package node (id: ${connectedId.slice(0, 8)})`,
      vars: pkgVars.map((v) => ({
        name: v.name,
        description: v.description,
        exampleValue: v.exampleValue ?? inferExampleValue(v.name, connectedNode.type),
      })),
    });
  });

  return sections;
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Renders an array of {@link EnvSection} objects into a `.env` file string.
 * Values are set to their example values (developer can edit them).
 */
export function renderEnvFile(sections: EnvSection[], comment?: string): string {
  const lines: string[] = [];

  if (comment) {
    lines.push(`# ${comment}`, "");
  }

  // Deduplicate across sections (first definition wins)
  const seen = new Set<string>();

  sections.forEach((section) => {
    const freshVars = section.vars.filter((v) => !seen.has(v.name));
    if (freshVars.length === 0) return;

    lines.push(
      `# ${'='.repeat(65)}`,
      `# ${section.heading}${section.subheading ? ` — ${section.subheading}` : ""}`,
      `# ${'='.repeat(65)}`,
    );

    freshVars.forEach((v) => {
      if (v.description) {
        lines.push(`# ${v.description}`);
      }
      lines.push(`${v.name}=${v.exampleValue ?? ""}`);
      seen.add(v.name);
    });

    lines.push("");
  });

  return lines.join("\n");
}

/**
 * Renders an array of {@link EnvSection} objects into a `.env.example` string
 * with placeholder values and full commentary.
 */
export function renderEnvExampleFile(sections: EnvSection[], appLabel?: string): string {
  const lines: string[] = [
    "# ═══════════════════════════════════════════════════════════════════",
    `# Environment Variables${appLabel ? ` — ${appLabel}` : ""}`,
    "# Generated by Dezign2App Compiler",
    "#",
    "# Copy this file to .env and fill in the real values.",
    "# NEVER commit .env to source control — it contains secrets!",
    "# ═══════════════════════════════════════════════════════════════════",
    "",
  ];

  const seen = new Set<string>();

  sections.forEach((section) => {
    const freshVars = section.vars.filter((v) => !seen.has(v.name));
    if (freshVars.length === 0) return;

    lines.push(
      `# ─── ${section.heading}${section.subheading ? ` (${section.subheading})` : ""} ${'-'.repeat(Math.max(0, 55 - section.heading.length))}`,
    );

    freshVars.forEach((v) => {
      if (v.description) {
        lines.push(`# ${v.description}`);
      }
      lines.push(`${v.name}=${v.exampleValue ? `<${v.exampleValue}>` : "<your_value_here>"}`);
      seen.add(v.name);
    });

    lines.push("");
  });

  return lines.join("\n");
}

// ── Convenience one-shot API ─────────────────────────────────────────────────

/**
 * Builds both `.env` and `.env.example` content strings for an app node.
 *
 * @returns `{ env, envExample }` — ready to write as compiled files.
 */
export function generateEnvFilesForNode(
  appNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): { env: string; envExample: string } {
  const sections = collectEnvSections(appNode, allNodes, allEdges);
  const label = appNode.data?.label as string | undefined;

  const env = renderEnvFile(
    sections,
    label ? `${label} — Environment Configuration` : undefined,
  );
  const envExample = renderEnvExampleFile(sections, label);

  return { env, envExample };
}
