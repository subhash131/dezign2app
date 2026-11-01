import { BackendNode, BackendEdge } from "@/types/canvas";
import { MESSAGING_RESOURCE_TYPES, getDefaultNodeEnvVars } from "@workspace/canvas";
import type { MessagingResourceType } from "@workspace/canvas";

import { toEnvVarName, toServiceBaseUrlEnvName } from "@/lib/compiler/utils";
import { saveLocalEnvVariable } from "@/lib/utils/localEnvSync";



export const MESSAGING_NODE_TYPES = [
  "kafka",
  "queue",
  "eventstream",
  "pubsub",
  "redis-streams",
  "sqs",
  "redis-pubsub",
] as const;

/** Narrows a plain string to MessagingResourceType without any cast. */
export function isMessagingResourceType(
  value: string,
): value is MessagingResourceType {
  return MESSAGING_RESOURCE_TYPES.some((t) => t === value);
}

/** Enforces matching DB engine (Redis DB -> Redis Entity, SQL DB -> SQL/Doc Entity) */
export function validateDatabaseEngine(
  sourceNode: BackendNode,
  targetNode: BackendNode,
): boolean {
  if (sourceNode.type === "database" && targetNode.type === "entity") {
    const isRedisDb = sourceNode.data?.dbEngine === "redis";
    const isRedisEntity = targetNode.data?.dbType === "redis";
    if (isRedisDb !== isRedisEntity) {
      console.warn(
        "Cannot connect Redis instance to SQL table or SQL database to Redis schema",
      );
    }
  }
  return true;
}

export const STORAGE_REF_NODE_TYPES = new Set([
  "StorageBucketRefNode",
  "storage_bucket_ref",
  "bucket_ref",
  "storage_operation_ref",
  "storage_ref",
  "StorageOperationRefNode",
]);

export function isStorageRefNode(type?: string): boolean {
  return Boolean(type && STORAGE_REF_NODE_TYPES.has(type));
}

/**
 * Finds target WebApp node(s) associated with a given WebPage (or all WebApps on canvas).
 */
export function findTargetWebAppsForPage(
  webPageNodeId: string | undefined,
  nodes: BackendNode[],
  edges: BackendEdge[],
): BackendNode[] {
  if (webPageNodeId) {
    const connectedWebApps = nodes.filter((n) => {
      if (n.type !== "webApp") return false;
      return edges.some(
        (e) =>
          (e.source === n.id && e.target === webPageNodeId) ||
          (e.target === n.id && e.source === webPageNodeId),
      );
    });

    if (connectedWebApps.length > 0) {
      return connectedWebApps;
    }
  }

  return nodes.filter((n) => n.type === "webApp");
}

/**
 * Synchronizes service base URL environment variables (<SERVICE>_BASE_URL and NEXT_PUBLIC_<SERVICE>_BASE_URL)
 * to a target WebApp node if they don't already exist.
 */
export function syncServiceBaseUrlToWebApp({
  webAppNode,
  serviceNode,
  updateNode,
  projectId,
}: {
  webAppNode: BackendNode;
  serviceNode: BackendNode;
  updateNode: (id: string, updates: Partial<BackendNode>) => void;
  projectId?: string;
}): boolean {
  if (webAppNode.type !== "webApp") return false;

  const srvLabel = (serviceNode.data?.label || serviceNode.id || "service").trim();
  const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(srvLabel);
  const rawPrefix = toEnvVarName(srvLabel);
  const legacyPublicName = `NEXT_PUBLIC_${rawPrefix}_BASE_URL`;
  const legacyNonPublicName = `${rawPrefix}_BASE_URL`;
  const srvPort =
    serviceNode.data?.port ||
    serviceNode.data?.server?.port ||
    serviceNode.data?.serverConfig?.port ||
    8080;
  const srvUrl = `http://localhost:${srvPort}`;

  const rawVars =
    webAppNode.data?.envVars !== undefined
      ? [...webAppNode.data.envVars]
      : getDefaultNodeEnvVars("webApp", webAppNode.data);

  // Filter out redundant non-public base URLs and legacy base URLs (e.g. without _SERVICE)
  const currentVars = rawVars.filter(
    (v: { name?: string }) =>
      v.name !== envVarName &&
      v.name !== legacyNonPublicName &&
      (v.name !== legacyPublicName || legacyPublicName === publicEnvVarName),
  );
  const hadRedundantVar = rawVars.length !== currentVars.length;

  const existingVarNames = new Set(currentVars.map((v: { name?: string }) => v.name));
  const varsToAdd: { id: string; name: string; description?: string }[] = [];

  if (!existingVarNames.has(publicEnvVarName)) {
    varsToAdd.push({
      id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: publicEnvVarName,
      description: `Public base URL for ${srvLabel}`,
    });
    existingVarNames.add(publicEnvVarName);
  }

  if (varsToAdd.length > 0 || hadRedundantVar) {
    updateNode(webAppNode.id, {
      data: {
        ...webAppNode.data,
        envVars: [...currentVars, ...varsToAdd],
      },
    });
    saveLocalEnvVariable(publicEnvVarName, srvUrl, projectId).catch(() => {});
    return true;
  }

  return false;
}
