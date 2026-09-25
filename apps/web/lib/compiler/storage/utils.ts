import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";

/** Convert a label like "Media Storage" → "media-storage" */
export function toStorageFolderName(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "storage"
  );
}

/** Convert a bucket name like "user-uploads" → "USER_UPLOADS" */
export function toBucketKey(name: string): string {
  if (!name) return "BUCKET";
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return cleaned || "BUCKET";
}

/**
 * Checks if a given node is an object storage node.
 */
export function isStorageNode(n: BackendNode): boolean {
  return n.type === "storage";
}

/**
 * Determines whether a specific service or web app node is actively connected to any storage node.
 */
export function isServiceConnectedToStorage(
  serviceNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  endpoints: (Endpoint & { nodeId?: string })[] = [],
  events: (AnyMessagingResource & { nodeId?: string })[] = [],
): boolean {
  const storageNodes = allNodes.filter(isStorageNode);
  if (storageNodes.length === 0) return false;

  const storageNodeIds = new Set(storageNodes.map((s) => s.id));
  const storageBucketIds = new Set(
    storageNodes.flatMap((s) => (s.data?.buckets || []).map((b) => b.id)),
  );

  // 1. Direct or handle-based edges between service and storage node
  const serviceEndpoints = [
    ...(serviceNode.data?.endpoints || []),
    ...(serviceNode.data?.routeGroups?.flatMap((rg) => rg.endpoints || []) || []),
    ...endpoints.filter((ep) => ep.nodeId === serviceNode.id),
  ];
  const serviceEndpointIds = new Set(serviceEndpoints.map((ep) => ep.id));

  const serviceEvents = [
    ...(serviceNode.data?.publishedEvents || []),
    ...(serviceNode.data?.consumedEvents || []),
    ...events.filter((ev) => ev.nodeId === serviceNode.id),
  ];
  const serviceEventIds = new Set(serviceEvents.map((ev) => ev.id));

  const hasConnectedEdge = allEdges.some((edge) => {
    if (!edge) return false;
    const isSourceService = edge.source === serviceNode.id;
    const isTargetService = edge.target === serviceNode.id;
    const isSourceStorage = storageNodeIds.has(edge.source);
    const isTargetStorage = storageNodeIds.has(edge.target);

    // Direct edge between service node and storage node
    if ((isSourceService && isTargetStorage) || (isTargetService && isSourceStorage)) {
      return true;
    }

    // Endpoint -> Storage edge
    if (edge.sourceHandle?.startsWith("endpoint-out-")) {
      const epId = edge.sourceHandle.replace("endpoint-out-", "");
      if (serviceEndpointIds.has(epId) && isTargetStorage) return true;
    }

    // Storage handle connections (storage-target or storage-source)
    if (
      (isSourceService && (edge.targetHandle === "storage-target" || edge.targetHandle === "storage-source")) ||
      (isTargetService && (edge.sourceHandle === "storage-target" || edge.sourceHandle === "storage-source"))
    ) {
      return true;
    }

    // Check if handle references a bucket resource ID
    if (isSourceService && edge.targetHandle) {
      for (const bucketId of storageBucketIds) {
        if (edge.targetHandle.includes(bucketId)) return true;
      }
    }
    if (isTargetService && edge.sourceHandle) {
      for (const bucketId of storageBucketIds) {
        if (edge.sourceHandle.includes(bucketId)) return true;
      }
    }

    return false;
  });

  if (hasConnectedEdge) return true;

  // 2. Events or endpoints referencing a storage node or bucket ID
  const allEvents = [
    ...serviceEvents,
    ...serviceEndpoints.flatMap((ep) => ep.publishedEvents || []),
  ];

  const hasStorageRef = allEvents.some((ev) => {
    const brokerId =
      "brokerNodeId" in ev && typeof ev.brokerNodeId === "string"
        ? ev.brokerNodeId
        : "";
    const resId =
      "messagingResourceId" in ev && typeof ev.messagingResourceId === "string"
        ? ev.messagingResourceId
        : "";
    if (brokerId && storageNodeIds.has(brokerId)) return true;
    if (resId && storageBucketIds.has(resId)) return true;
    return false;
  });

  return hasStorageRef;
}
