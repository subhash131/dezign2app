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
import { isServiceConnectedToStorage, toBucketKey } from "../storage/utils";
import {
  getDefaultNodeEnvVars,
  EndpointLike,
  PipelineStepDraft,
  INTER_SERVICE_PROTOCOL_GRPC,
} from "@workspace/canvas";
import { toEnvVarName, toServiceBaseUrlEnvName } from "../utils";

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
  "langgraph",
]);

function isPackageNode(nodeType: string | undefined): boolean {
  return !!nodeType && PACKAGE_NODE_TYPES.has(nodeType);
}

export function isStorageRefNode(type?: string): boolean {
  return (
    type === "StorageBucketRefNode" ||
    type === "StorageOperationRefNode" ||
    type === "storage_bucket_ref" ||
    type === "storage_operation_ref" ||
    type === "bucket_ref" ||
    type === "storage_ref"
  );
}

export function resolveStorageNodeFromRef(
  refNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): BackendNode | undefined {
  const storageNodes = allNodes.filter((n) => n.type === "storage");
  if (storageNodes.length === 0) return undefined;

  // 1. Direct reference in refNode.data
  const storageId =
    refNode.data.storageNodeId ||
    refNode.data.connectedStorageNodeId;
  if (storageId) {
    const found = storageNodes.find((n) => n.id === storageId);
    if (found) return found;
  }

  // 2. Edge from StorageNode to refNode (or vice versa)
  const edgeToStorage = allEdges.find((e) => {
    if (!e) return false;
    const isTarget = e.target === refNode.id;
    const isSource = e.source === refNode.id;
    if (!isTarget && !isSource) return false;
    const otherId = isTarget ? e.source : e.target;
    return storageNodes.some((sn) => sn.id === otherId);
  });
  if (edgeToStorage) {
    const targetId = edgeToStorage.target === refNode.id ? edgeToStorage.source : edgeToStorage.target;
    const found = storageNodes.find((n) => n.id === targetId);
    if (found) return found;
  }

  // 3. Bucket matching
  const bucketKey = refNode.data.bucketId || refNode.data.bucketName;
  if (bucketKey) {
    const found = storageNodes.find((sn) =>
      sn.data.buckets?.some(
        (b) => b.id === bucketKey || b.name === bucketKey,
      ),
    );
    if (found) return found;
  }

  // 4. Default: single storage node on canvas
  if (storageNodes.length === 1) {
    return storageNodes[0];
  }

  return undefined;
}

export function isDatabaseRefNode(type?: string): boolean {
  return type === "db_ref" || type === "DatabaseTableRefNode" || type === "entity";
}

export function resolveDatabaseNodeFromRef(
  refNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): BackendNode | undefined {
  const dbNodes = allNodes.filter((n) => n.type === "database" && n.data?.dbEngine !== "redis");
  if (dbNodes.length === 0) return undefined;

  const dbId = refNode.data.databaseId || refNode.data.dbRef;
  if (dbId) {
    const found = dbNodes.find((n) => n.id === dbId);
    if (found) return found;
  }

  const edgeToDb = allEdges.find((e) => {
    if (!e) return false;
    const isTarget = e.target === refNode.id;
    const isSource = e.source === refNode.id;
    if (!isTarget && !isSource) return false;
    const otherId = isTarget ? e.source : e.target;
    return dbNodes.some((dn) => dn.id === otherId);
  });
  if (edgeToDb) {
    const foundId = edgeToDb.target === refNode.id ? edgeToDb.source : edgeToDb.target;
    const found = dbNodes.find((n) => n.id === foundId);
    if (found) return found;
  }

  if (dbNodes.length === 1) {
    return dbNodes[0];
  }

  return undefined;
}

export function isRedisRefNode(type?: string): boolean {
  return (
    type === "redis_schema" ||
    type === "RedisSchemaNode" ||
    type === "redis-cache" ||
    type === "redis-streams" ||
    type === "redis-pubsub"
  );
}

export function resolveRedisNodeFromRef(
  refNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): BackendNode | undefined {
  const redisNodes = allNodes.filter((n) => n.type === "redis_instance");
  if (redisNodes.length === 0) return undefined;

  const redisId = refNode.data.schemaRef;
  if (redisId) {
    const found = redisNodes.find((n) => n.id === redisId);
    if (found) return found;
  }

  const edgeToRedis = allEdges.find((e) => {
    if (!e) return false;
    const isTarget = e.target === refNode.id;
    const isSource = e.source === refNode.id;
    if (!isTarget && !isSource) return false;
    const otherId = isTarget ? e.source : e.target;
    return redisNodes.some((rn) => rn.id === otherId);
  });
  if (edgeToRedis) {
    const foundId = edgeToRedis.target === refNode.id ? edgeToRedis.source : edgeToRedis.target;
    const found = redisNodes.find((n) => n.id === foundId);
    if (found) return found;
  }

  if (redisNodes.length === 1) {
    return redisNodes[0];
  }

  return undefined;
}

function resolveEnvValue(name: string, packageNode?: BackendNode): string {
  // Service node explicit ports / configs (takes priority over host process.env)
  if (packageNode?.type === "service") {
    const rawData = packageNode.data;
    const serverSection = rawData?.server || rawData?.serverConfig;
    if (name === "PORT") {
      const p = rawData?.port ?? serverSection?.port;
      if (p !== undefined && p !== null && String(p).trim() !== "") {
        return String(p).trim();
      }
    }
    if (name === "GRPC_PORT") {
      const gp = rawData?.grpcPort ?? serverSection?.grpcPort;
      if (gp !== undefined && gp !== null && String(gp).trim() !== "") {
        return String(gp).trim();
      }
    }
  }

  if (packageNode?.type === "webApp") {
    if (name === "PORT") {
      const p = packageNode.data?.port;
      if (p !== undefined && p !== null && String(p).trim() !== "") {
        return String(p).trim();
      }
    }
  }

  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`dezign2app_env_${name}`);
      if (cached) return cached;
    } catch {}
  }
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name]!;
  }

  if (packageNode?.type === "storage") {
    if (name === "AWS_REGION") {
      const r = packageNode.data.defaultRegion;
      if (r && r !== "AWS_REGION") return r;
    }
    if (name === "S3_ENDPOINT_URL" || name === "ENDPOINT_URL") {
      const u = packageNode.data.endpointUrl;
      if (u && u !== "S3_ENDPOINT_URL") return u;
    }
    if (name === (packageNode.data.accessKeyIdEnv || "AWS_ACCESS_KEY_ID")) {
      const k = packageNode.data.accessKeyId;
      if (k) return k;
    }
    if (name === (packageNode.data.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY")) {
      const s = packageNode.data.secretAccessKey;
      if (s) return s;
    }
    if (name === "AWS_ROLE_ARN" && packageNode.data.roleArn) {
      return packageNode.data.roleArn;
    }
    if ((name === "CDN_URL" || name === "AWS_CDN_URL") && packageNode.data.cdnUrl) {
      return packageNode.data.cdnUrl;
    }
    if (name.startsWith("STORAGE_BUCKET_") && packageNode.data.buckets) {
      const bKey = name.replace("STORAGE_BUCKET_", "");
      const foundBucket = packageNode.data.buckets.find(
        (b) => toBucketKey(b.name) === bKey || toBucketKey(b.id) === bKey,
      );
      if (foundBucket?.name) return foundBucket.name;
    }
  }

  if (packageNode?.type === "database") {
    const directKey = packageNode.data?.connectionStringEnv || "DATABASE_URL";
    const pooledKey = packageNode.data?.connectionStringPooledEnv || "DATABASE_URL_POOLED";
    const fileKey = packageNode.data?.dbFilePathEnv || "DB_FILE_PATH";

    if ((name === directKey || name === "DATABASE_URL") && packageNode.data?.connectionString) {
      return packageNode.data.connectionString;
    }
    if ((name === pooledKey || name === "DATABASE_URL_POOLED") && packageNode.data?.connectionStringPooled) {
      return packageNode.data.connectionStringPooled;
    }
    if ((name === fileKey || name === "DATABASE_PATH" || name === "DB_FILE_PATH") && packageNode.data?.dbFilePath) {
      return packageNode.data.dbFilePath;
    }
  }

  if (packageNode?.type === "langgraph") {
    const customLLMs = packageNode.data?.customLlmNodes || [];
    for (const llm of customLLMs) {
      const p = (llm.provider || "openai").toLowerCase();
      const expectedKey =
        p === "groq"
          ? "GROQ_API_KEY"
          : p === "openai"
            ? "OPENAI_API_KEY"
            : p === "anthropic"
              ? "ANTHROPIC_API_KEY"
              : p === "google"
                ? "GEMINI_API_KEY"
                : "LLM_API_KEY";

      const rawHeader = llm.apiKeyHeader
        ? String(llm.apiKeyHeader).replace(/^Bearer\s+/i, "").trim()
        : "";

      if (name === expectedKey || name === rawHeader) {
        if (
          rawHeader &&
          (rawHeader.startsWith("gsk_") ||
            rawHeader.startsWith("sk-") ||
            rawHeader.startsWith("AIza") ||
            rawHeader.length > 25 ||
            /[^A-Z0-9_]/.test(rawHeader))
        ) {
          return rawHeader;
        }
        const key = llm.apiKey;
        if (key) return key;
      }

      if (
        (p === "ollama" || p === "custom") &&
        (name.endsWith("_BASE_URL") || name === "OLLAMA_BASE_URL")
      ) {
        const targetUrl = llm.baseUrl || llm.url;
        if (targetUrl) return targetUrl;
      }
    }

    if (typeof window !== "undefined") {
      try {
        const prov = name
          .toLowerCase()
          .replace(/_api_key$/, "")
          .replace(/_key$/, "");
        const savedLgKey = localStorage.getItem(`dezign2app_lg_key_${prov}`);
        if (savedLgKey) return savedLgKey;
      } catch {}
    }

    const mem = packageNode.data?.memoryConfig;
    if (mem && name === mem.checkpointerEnvVar && mem.connectionString) {
      return mem.connectionString;
    }
  }

  return "";
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
    langgraph: "LangGraph Agent (LLM & Tools)",
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
  if (n === "DATABASE_URL_POOLED" || (n.includes("DATABASE") && n.includes("POOLED"))) {
    return "postgresql://user:password@ep-pooler.aws.neon.tech/mydb?sslmode=require";
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

  // LLM / AI Providers
  if (n === "GROQ_API_KEY") return "gsk_your_groq_api_key_here";
  if (n === "OPENAI_API_KEY") return "sk-proj-your_openai_api_key_here";
  if (n === "ANTHROPIC_API_KEY") return "sk-ant-your_anthropic_api_key_here";
  if (n === "GEMINI_API_KEY" || n === "GOOGLE_API_KEY") return "your_gemini_api_key_here";
  if (n === "OLLAMA_BASE_URL") return "http://localhost:11434";

  // Common
  if (n === "PORT") {
    if (nodeType === "webApp") return "3000";
    return "8080";
  }
  if (n === "GRPC_PORT") return "50051";
  if (n === "NODE_ENV") return "development";
  if (n === "LOG_LEVEL") return "info";
  if (n.endsWith("_BASE_URL")) return "http://localhost:8080";
  if (n.endsWith("_GRPC_URL")) return "localhost:50051";
  if (n.endsWith("_API_KEY")) return "your_api_key_here";

  return "";
}

// ── Core collection logic ────────────────────────────────────────────────────

export interface DetectedEnvVar {
  name: string;
  description?: string;
  exampleValue?: string;
  sourceNodeType: string;
  sourceNodeLabel: string;
  sourceNodeId: string;
}

/**
 * Discovers all environment variables declared on package nodes (storage, db, redis, auth, etc.)
 * that are connected to a target app node (directly or via reference nodes like StorageBucketRefNode).
 */
export function getDetectedPackageEnvVars(
  appNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  associatedNodes?: BackendNode[],
  allEndpoints?: EndpointLike[],
): DetectedEnvVar[] {
  const checkNodes = [appNode, ...(associatedNodes || [])];
  const detected: DetectedEnvVar[] = [];
  const seenNames = new Set<string>();
  const seenPackageNodeIds = new Set<string>();

  function collectFromPackageNode(packageNode: BackendNode) {
    if (seenPackageNodeIds.has(packageNode.id)) return;
    seenPackageNodeIds.add(packageNode.id);

    let pkgVars: EnvVarEntry[] = packageNode.data.envVars ? [...packageNode.data.envVars] : [];
    const defaults = getDefaultNodeEnvVars(packageNode.type, packageNode.data);
    if (pkgVars.length === 0) {
      if (defaults && defaults.length > 0) {
        pkgVars = defaults;
      }
    } else if (packageNode.type === "langgraph" && defaults.length > 0) {
      defaults.forEach((def) => {
        if (!pkgVars.some((pv) => pv.name === def.name)) {
          pkgVars.push(def);
        }
      });
    }

    const extraVars: EnvVarEntry[] = [];
    if (packageNode.type === "storage" && packageNode.data.buckets) {
      packageNode.data.buckets.forEach((b) => {
        const rawName = b.name || "bucket";
        const key = toBucketKey(rawName);
        extraVars.push({
          name: `STORAGE_BUCKET_${key}`,
          description: `Bucket name for ${rawName}`,
          exampleValue: rawName,
        });
      });
    }

    const allSectionVars = [...pkgVars, ...extraVars];
    const nodeLabel = packageNode.data.label || sectionHeadingForNodeType(packageNode.type || "");

    allSectionVars.forEach((v) => {
      if (seenNames.has(v.name)) return;
      seenNames.add(v.name);
      detected.push({
        name: v.name,
        description: v.description,
        exampleValue: resolveEnvValue(v.name, packageNode) || v.exampleValue || inferExampleValue(v.name, packageNode.type),
        sourceNodeType: packageNode.type || "package",
        sourceNodeLabel: nodeLabel,
        sourceNodeId: packageNode.id,
      });
    });
  }

  // A. Traverse edges touching checkNodes
  checkNodes.forEach((currNode) => {
    allEdges.forEach((edge) => {
      if (!edge) return;
      const isSource = edge.source === currNode.id;
      const isTarget = edge.target === currNode.id;
      if (!isSource && !isTarget) return;

      const connectedId = isSource ? edge.target : edge.source;
      if (!connectedId) return;

      const connectedNode = allNodes.find((n) => n.id === connectedId);
      if (!connectedNode) return;

      if (isPackageNode(connectedNode.type)) {
        collectFromPackageNode(connectedNode);
        return;
      }

      if (isStorageRefNode(connectedNode.type)) {
        const parentStorage = resolveStorageNodeFromRef(connectedNode, allNodes, allEdges);
        if (parentStorage) {
          collectFromPackageNode(parentStorage);
        }
        return;
      }

      if (isDatabaseRefNode(connectedNode.type)) {
        const parentDb = resolveDatabaseNodeFromRef(connectedNode, allNodes, allEdges);
        if (parentDb) {
          collectFromPackageNode(parentDb);
        }
        return;
      }

      if (isRedisRefNode(connectedNode.type)) {
        const parentRedis = resolveRedisNodeFromRef(connectedNode, allNodes, allEdges);
        if (parentRedis) {
          collectFromPackageNode(parentRedis);
        }
        return;
      }
    });
  });

  // B. Storage connection resolver fallback
  const storageNodes = allNodes.filter((n) => n.type === "storage");
  storageNodes.forEach((storageNode) => {
    if (seenPackageNodeIds.has(storageNode.id)) return;
    const isConnected =
      checkNodes.some((n) => isServiceConnectedToStorage(n, allNodes, allEdges)) ||
      checkNodes.some((n) => n.data?.connectedStorageNodeId === storageNode.id);

    if (isConnected) {
      collectFromPackageNode(storageNode);
    }
  });

  // C. Database connection resolver fallback
  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
  if (dbNodes.length > 0) {
    const isConnectedToDb =
      checkNodes.some((n) => n.data.databaseId || n.data.dbRef) ||
      allEdges.some(
        (e) =>
          checkNodes.some((cn) => cn.id === e.source || cn.id === e.target) &&
          (dbNodes.some((dn) => dn.id === e.source || dn.id === e.target) ||
            allNodes.some(
              (an) =>
                isDatabaseRefNode(an.type) &&
                (an.id === e.source || an.id === e.target),
            )),
      );

    if (isConnectedToDb || appNode.type === "webApp") {
      dbNodes.forEach((dbNode) => {
        if (!seenPackageNodeIds.has(dbNode.id)) {
          collectFromPackageNode(dbNode);
        }
      });
    }
  }

  // D. Endpoints invoking LangGraph steps
  const endpointsToCheck: EndpointLike[] = allEndpoints
    ? allEndpoints.filter((ep: EndpointLike) => ep.nodeId === appNode.id)
    : [];

  endpointsToCheck.forEach((ep: EndpointLike) => {
    const steps: PipelineStepDraft[] = ep.pipelineSteps || ep.steps || [];
    steps.forEach((s: PipelineStepDraft) => {
      if (s && s.type === "langgraph_invoke" && s.enabled !== false) {
        const targetNode =
          allNodes.find(
            (n) => n.id === s.langGraphTargetNodeId && n.type === "langgraph",
          ) ||
          allNodes.find(
            (n) => n.type === "langgraph" && n.data?.label === s.name,
          ) ||
          (allNodes.filter((n) => n.type === "langgraph").length === 1
            ? allNodes.find((n) => n.type === "langgraph")
            : undefined);
        if (targetNode) {
          collectFromPackageNode(targetNode);
        }
      }
    });
  });

  // E. Connected services for webApp or service
  const serviceNodes = allNodes.filter(
    (n) => n.type === "service" && n.id !== appNode.id,
  );
  serviceNodes.forEach((srvNode) => {
    if (seenPackageNodeIds.has(srvNode.id)) return;
    const isConnected =
      checkNodes.some((cn) =>
        allEdges.some(
          (e) =>
            (e.source === cn.id && e.target === srvNode.id) ||
            (e.target === cn.id && e.source === srvNode.id),
        ),
      ) ||
      (appNode.type === "webApp" && srvNode.data?.targetWebAppId === appNode.id) ||
      (appNode.type === "webApp" &&
        allNodes.filter((n) => n.type === "webApp").length <= 1 &&
        allEdges.some(
          (e) =>
            allNodes.some(
              (an) =>
                (an.type === "webPage" || an.type === "webApp") &&
                (an.id === e.source || an.id === e.target),
            ) &&
            (e.source === srvNode.id || e.target === srvNode.id),
        ));

    if (isConnected) {
      seenPackageNodeIds.add(srvNode.id);
      const srvLabel = srvNode.data?.label || "Service";
      const srvPort =
        String(srvNode.data?.port ?? srvNode.data?.server?.port ?? "8080").trim() ||
        "8080";
      const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(srvLabel);

      if (appNode.type === "webApp") {
        if (!seenNames.has(publicEnvVarName)) {
          seenNames.add(publicEnvVarName);
          detected.push({
            name: publicEnvVarName,
            description: `Public HTTP base URL for ${srvLabel}`,
            exampleValue: `http://localhost:${srvPort}`,
            sourceNodeType: "service",
            sourceNodeLabel: srvLabel,
            sourceNodeId: srvNode.id,
          });
        }
      } else {
        if (!seenNames.has(envVarName)) {
          seenNames.add(envVarName);
          detected.push({
            name: envVarName,
            description: `HTTP base URL for ${srvLabel}`,
            exampleValue: `http://localhost:${srvPort}`,
            sourceNodeType: "service",
            sourceNodeLabel: srvLabel,
            sourceNodeId: srvNode.id,
          });
        }
      }
    }
  });

  return detected;
}

// ── Core collection logic ────────────────────────────────────────────────────

/**
 * Collects all env var sections for a given **app node** (service / webApp / langgraph).
 * Only variables that the user explicitly configured or imported into `appNode.data.envVars`
 * will be rendered into .env, preventing accidental exposure of root keys to client apps.
 *
 * @param appNode         - The app node being compiled (service / webApp / langgraph).
 * @param allNodes        - Full flat node list from the canvas.
 * @param allEdges        - Full edge list from the canvas.
 * @param associatedNodes - Optional array of associated nodes (e.g. WebPages in a WebApp).
 * @returns               - Ordered array of {@link EnvSection} objects, ready for rendering.
 */
export function collectEnvSections(
  appNode: BackendNode,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  associatedNodes?: BackendNode[],
  allEndpoints?: EndpointLike[],
): EnvSection[] {
  const sections: EnvSection[] = [];
  const ownVars: EnvVarEntry[] = appNode.data.envVars ?? [];
  const ownVarNames = new Set(ownVars.map((v) => v.name));

  // Detect available package environment variables
  const detectedVars = getDetectedPackageEnvVars(appNode, allNodes, allEdges, associatedNodes, allEndpoints);
  const detectedMap = new Map<string, DetectedEnvVar>();
  detectedVars.forEach((d) => detectedMap.set(d.name, d));

  const packageSectionsMap = new Map<
    string,
    { heading: string; subheading?: string; vars: EnvVarEntry[] }
  >();
  const appVars: EnvVarEntry[] = [];

  ownVars.forEach((v) => {
    const detected = detectedMap.get(v.name);
    if (detected) {
      const pkgNode = allNodes.find((n) => n.id === detected.sourceNodeId);
      const heading = sectionHeadingForNodeType(detected.sourceNodeType);
      const subheading = detected.sourceNodeLabel
        ? `from package node: "${detected.sourceNodeLabel}"`
        : `from package node`;
      const key = `${heading}_${detected.sourceNodeId}`;

      if (!packageSectionsMap.has(key)) {
        packageSectionsMap.set(key, {
          heading,
          subheading,
          vars: [],
        });
      }
      packageSectionsMap.get(key)!.vars.push({
        name: v.name,
        description: v.description || detected.description,
        exampleValue:
          resolveEnvValue(v.name, pkgNode) ||
          v.exampleValue ||
          detected.exampleValue ||
          inferExampleValue(v.name, detected.sourceNodeType),
      });
    } else {
      let exVal = resolveEnvValue(v.name, appNode) || v.exampleValue;
      if (!exVal && v.name === "PORT") {
        exVal = String(appNode.data?.port ?? appNode.data?.server?.port ?? appNode.data?.serverConfig?.port ?? "8080");
      }
      if (!exVal && v.name === "GRPC_PORT") {
        exVal = String(appNode.data?.grpcPort ?? appNode.data?.server?.grpcPort ?? appNode.data?.serverConfig?.grpcPort ?? "50051");
      }
      if (!exVal) {
        exVal = inferExampleValue(v.name, appNode.type);
      }

      appVars.push({
        name: v.name,
        description: v.description,
        exampleValue: exVal,
      });
    }
  });

  // For connected LangGraph agents, automatically include their detected LLM variables
  // into the packageSectionsMap if not already in ownVars, so dev runtime has the required keys.
  if (appNode.type === "service") {
    detectedVars.forEach((d) => {
      if (d.sourceNodeType === "langgraph" && !ownVarNames.has(d.name)) {
        const heading = sectionHeadingForNodeType(d.sourceNodeType);
        const subheading = d.sourceNodeLabel
          ? `from package node: "${d.sourceNodeLabel}"`
          : `from package node`;
        const key = `${heading}_${d.sourceNodeId}`;

        if (!packageSectionsMap.has(key)) {
          packageSectionsMap.set(key, {
            heading,
            subheading,
            vars: [],
          });
        }
        const section = packageSectionsMap.get(key)!;
        if (!section.vars.some((v) => v.name === d.name)) {
          const pkgNode = allNodes.find((n) => n.id === d.sourceNodeId);
          section.vars.push({
            name: d.name,
            description: d.description,
            exampleValue:
              resolveEnvValue(d.name, pkgNode) ||
              d.exampleValue ||
              inferExampleValue(d.name, d.sourceNodeType),
          });
        }
      }
    });
  }

  // Ensure default app vars if the node has canvas-defined vars, connected package sections, or is a service/webApp
  const hasCanvasSections =
    ownVars.length > 0 ||
    packageSectionsMap.size > 0 ||
    appNode.type === "service" ||
    appNode.type === "webApp";
  if (hasCanvasSections) {
    if (appNode.type === "service") {
      const rawData = appNode.data;
      const serverSection = rawData?.server || rawData?.serverConfig;
      const portVal = String(rawData?.port ?? serverSection?.port ?? "8080").trim() || "8080";

      if (!ownVarNames.has("PORT")) {
        appVars.unshift({
          name: "PORT",
          description: `HTTP server port (default: ${portVal})`,
          exampleValue: portVal,
        });
      }
      if (!ownVarNames.has("NODE_ENV")) {
        appVars.push({
          name: "NODE_ENV",
          description: "Environment mode (development, production)",
          exampleValue: "development",
        });
      }

      const grpcEnabled =
        rawData?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC ||
        serverSection?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC ||
        Boolean(rawData?.grpcPort || serverSection?.grpcPort);

      if (grpcEnabled && !ownVarNames.has("GRPC_PORT")) {
        const grpcPortVal = String(rawData?.grpcPort ?? serverSection?.grpcPort ?? "50051").trim() || "50051";
        appVars.push({
          name: "GRPC_PORT",
          description: `gRPC server port (default: ${grpcPortVal})`,
          exampleValue: grpcPortVal,
        });
      }
    }

    if (appNode.type === "webApp") {
      if (!ownVarNames.has("NEXT_PUBLIC_LOG_LEVEL")) {
        appVars.push({
          name: "NEXT_PUBLIC_LOG_LEVEL",
          description: "Client logging level",
          exampleValue: "info",
        });
      }
      if (!ownVarNames.has("NEXT_PUBLIC_ENABLE_DEBUG_LOGS")) {
        appVars.push({
          name: "NEXT_PUBLIC_ENABLE_DEBUG_LOGS",
          description: "Enable/disable output logs on web pages (true/false)",
          exampleValue: "false",
        });
      }
      if (!ownVarNames.has("NEXT_PUBLIC_ENABLE_DEBUG_STATE")) {
        appVars.push({
          name: "NEXT_PUBLIC_ENABLE_DEBUG_STATE",
          description: "Enable/disable state variables preview on web pages (true/false)",
          exampleValue: "false",
        });
      }
    }
  }

  if (appVars.length > 0) {
    sections.push({
      heading: "Application",
      vars: appVars,
    });
  }

  packageSectionsMap.forEach((pkgSec) => {
    sections.push(pkgSec);
  });

  // If centralized database exists in monorepo and service/webApp has canvas sections, ensure db env vars
  if (hasCanvasSections && (appNode.type === "service" || appNode.type === "webApp")) {
    const hasDb = allNodes.some(
      (n) => n.type === "database" || n.type === "entity" || n.type === "db_ref" || n.type === "auth",
    );
    const postgresNode = allNodes.find(
      (n) => n.type === "database" && (n.data?.dbEngine === "postgres" || n.data?.provider === "supabase" || n.data?.provider === "neon"),
    );
    const mysqlNode = allNodes.find(
      (n) => n.type === "database" && n.data?.dbEngine === "mysql",
    );
    const hasDbSection = sections.some((s) => s.heading.toLowerCase().includes("database"));

    if (!hasDbSection && hasDb) {
      const dbVars: EnvVarEntry[] = [];
      if (postgresNode) {
        const pgConn =
          postgresNode.data?.connectionString ||
          postgresNode.data?.connectionStringPooled ||
          "postgresql://postgres:postgres@localhost:5432/postgres";
        const connKey = postgresNode.data?.connectionStringEnv || "DATABASE_URL";
        if (!ownVarNames.has(connKey)) {
          dbVars.push({
            name: connKey,
            description: "PostgreSQL database connection URL",
            exampleValue: pgConn,
          });
        }
        if (postgresNode.data?.connectionStringPooled && !ownVarNames.has("DATABASE_URL_POOLED")) {
          dbVars.push({
            name: "DATABASE_URL_POOLED",
            description: "Pooled PostgreSQL connection URL",
            exampleValue: postgresNode.data.connectionStringPooled,
          });
        }
      } else if (mysqlNode) {
        const myConn =
          mysqlNode.data?.connectionString ||
          "mysql://root:root@localhost:3306/dezign2app";
        const connKey = mysqlNode.data?.connectionStringEnv || "DATABASE_URL";
        if (!ownVarNames.has(connKey)) {
          dbVars.push({
            name: connKey,
            description: "MySQL database connection URL",
            exampleValue: myConn,
          });
        }
      } else {
        if (!ownVarNames.has("DATABASE_PATH")) {
          dbVars.push({
            name: "DATABASE_PATH",
            description: "Path to centralized SQLite database",
            exampleValue: "../../packages/db/sqlite.db",
          });
        }
        if (!ownVarNames.has("DATABASE_URL")) {
          dbVars.push({
            name: "DATABASE_URL",
            description: "URL or path to centralized SQLite database",
            exampleValue: "../../packages/db/sqlite.db",
          });
        }
      }

      if (dbVars.length > 0) {
        sections.push({
          heading: "Database (Centralized)",
          subheading: "from packages/db",
          vars: dbVars,
        });
      }
    }
  }

  // Connected microservices environment variables
  if (appNode.type === "service" || appNode.type === "webApp") {
    const connectedServicesMap = new Map<
      string,
      { label: string; port: string; grpcPort: string; usesGrpc: boolean }
    >();

    allEdges.forEach((edge) => {
      const checkNodeIds = new Set([appNode.id, ...(associatedNodes || []).map((n) => n.id)]);
      const targetId = checkNodeIds.has(edge.source) ? edge.target : (checkNodeIds.has(edge.target) ? edge.source : undefined);
      if (targetId) {
        const targetNode = allNodes.find(
          (n) => n.id === targetId && n.type === "service" && n.id !== appNode.id,
        );
        if (targetNode && !connectedServicesMap.has(targetNode.id)) {
          const tgtData = targetNode.data;
          const tgtServer = tgtData?.server || tgtData?.serverConfig;
          const tgtLabel = tgtData?.label || targetNode.id;
          const tgtPort = String(tgtData?.port ?? tgtServer?.port ?? "8080").trim() || "8080";
          const tgtGrpcPort = String(tgtData?.grpcPort ?? tgtServer?.grpcPort ?? "50051").trim() || "50051";
          const usesGrpc =
            appNode.data?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC ||
            appNode.data?.server?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC;

          connectedServicesMap.set(targetNode.id, {
            label: tgtLabel,
            port: tgtPort,
            grpcPort: tgtGrpcPort,
            usesGrpc,
          });
        }
      }
    });

    if (appNode.type === "webApp") {
      allNodes.forEach((node) => {
        if (node.type !== "service" || node.id === appNode.id || connectedServicesMap.has(node.id)) return;
        const isTargeted = node.data?.targetWebAppId === appNode.id;
        const isOnlyWebApp = allNodes.filter((n) => n.type === "webApp").length <= 1;
        const hasAnyWebEdge = allEdges.some(
          (e) =>
            allNodes.some(
              (an) =>
                (an.type === "webPage" || an.type === "webApp") &&
                (an.id === e.source || an.id === e.target),
            ) &&
            (e.source === node.id || e.target === node.id),
        );
        if (isTargeted || (isOnlyWebApp && hasAnyWebEdge)) {
          const tgtData = node.data;
          const tgtServer = tgtData?.server || tgtData?.serverConfig;
          const tgtLabel = tgtData?.label || node.id;
          const tgtPort = String(tgtData?.port ?? tgtServer?.port ?? "8080").trim() || "8080";
          const tgtGrpcPort = String(tgtData?.grpcPort ?? tgtServer?.grpcPort ?? "50051").trim() || "50051";
          const usesGrpc =
            appNode.data?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC ||
            appNode.data?.server?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC;

          connectedServicesMap.set(node.id, {
            label: tgtLabel,
            port: tgtPort,
            grpcPort: tgtGrpcPort,
            usesGrpc,
          });
        }
      });
    }

    if (connectedServicesMap.size > 0) {
      const serviceVars: EnvVarEntry[] = [];
      connectedServicesMap.forEach(
        ({ label, port: tgtPort, grpcPort: tgtGrpcPort, usesGrpc }) => {
          if (usesGrpc) {
            const envVarName = `${toEnvVarName(label)}_GRPC_URL`;
            if (!ownVarNames.has(envVarName)) {
              serviceVars.push({
                name: envVarName,
                description: `gRPC endpoint URL for ${label}`,
                exampleValue: `localhost:${tgtGrpcPort}`,
              });
            }
          } else {
            const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(label);
            if (appNode.type === "webApp") {
              if (!ownVarNames.has(publicEnvVarName)) {
                serviceVars.push({
                  name: publicEnvVarName,
                  description: `Public HTTP base URL for ${label}`,
                  exampleValue: `http://localhost:${tgtPort}`,
                });
              }
            } else {
              if (!ownVarNames.has(envVarName)) {
                serviceVars.push({
                  name: envVarName,
                  description: `HTTP base URL for ${label}`,
                  exampleValue: `http://localhost:${tgtPort}`,
                });
              }
            }
          }
        },
      );
      if (serviceVars.length > 0) {
        sections.push({
          heading: "Connected Services",
          vars: serviceVars,
        });
      }
    }
  }

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
      let exampleVal = v.exampleValue;
      if (
        exampleVal &&
        (exampleVal.startsWith("gsk_") ||
          exampleVal.startsWith("sk-") ||
          exampleVal.startsWith("AIza") ||
          exampleVal.startsWith("Bearer ") ||
          exampleVal.length > 25)
      ) {
        exampleVal = `your_${v.name.toLowerCase()}_here`;
      }
      lines.push(`${v.name}=${exampleVal ? `<${exampleVal}>` : "<your_value_here>"}`);
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
  associatedNodes?: BackendNode[],
  allEndpoints?: EndpointLike[],
): { env: string; envExample: string } {
  const sections = collectEnvSections(appNode, allNodes, allEdges, associatedNodes, allEndpoints);
  const rawLabel = appNode.data?.label;
  const label = typeof rawLabel === "string" ? rawLabel : undefined;

  const env = renderEnvFile(
    sections,
    label ? `${label} — Environment Configuration` : undefined,
  );
  const envExample = renderEnvExampleFile(sections, label);

  return { env, envExample };
}
