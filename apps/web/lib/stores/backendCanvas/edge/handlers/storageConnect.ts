import { ConnectionContext } from "../types";

import { STORAGE_REF_NODE_TYPES } from "../utils";

/**
 * Handles storage connections:
 * When connecting a bucket on StorageNode to the header of StorageBucketRefNode,
 * synchronizes storageNodeId, bucketId, bucketName, and storageProvider on the target ref node.
 */
export function handleStorageConnect({
  get,
  connection,
  sourceNode,
  targetNode,
}: ConnectionContext): void {
  const isStorageToRef =
    sourceNode.type === "storage" &&
    STORAGE_REF_NODE_TYPES.has(targetNode.type) &&
    (connection.targetHandle === "storage-ref-header" ||
      !connection.targetHandle ||
      connection.targetHandle.startsWith("storage-ref-header"));

  const isRefToStorage =
    STORAGE_REF_NODE_TYPES.has(sourceNode.type) &&
    targetNode.type === "storage" &&
    (connection.sourceHandle === "storage-ref-header" ||
      connection.sourceHandle === "storage-ref-header-out" ||
      !connection.sourceHandle ||
      connection.sourceHandle.startsWith("storage-ref-header"));

  if (!isStorageToRef && !isRefToStorage) {
    return;
  }

  const storageNode = isStorageToRef ? sourceNode : targetNode;
  const refNode = isStorageToRef ? targetNode : sourceNode;
  const rawHandle =
    (isStorageToRef ? connection.sourceHandle : connection.targetHandle) || "";
  const bucketMatch =
    rawHandle.match(/^(?:buckets?):(out|in):(.+)$/) ||
    rawHandle.match(/^(?:buckets?):out:(.+)$/);
  const rawBucketId = bucketMatch ? bucketMatch[2] || bucketMatch[1] : undefined;

  const buckets = storageNode.data?.buckets || [];
  const matchedBucket = rawBucketId
    ? buckets.find((b) => b.id === rawBucketId || b.name === rawBucketId)
    : buckets[0];

  const resolvedBucketName =
    matchedBucket?.name || rawBucketId || "default-bucket";
  const resolvedBucketId =
    matchedBucket?.id || rawBucketId || resolvedBucketName;

  get().updateNode(refNode.id, {
    data: {
      ...refNode.data,
      storageNodeId: storageNode.id,
      bucketId: resolvedBucketId,
      bucketName: resolvedBucketName,
      storageProvider:
        storageNode.data?.storageProvider ||
        refNode.data?.storageProvider ||
        "s3",
      label: refNode.data?.label || resolvedBucketName,
    },
  });
}
