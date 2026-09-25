import { ConnectionContext } from "../types";

const STORAGE_REF_NODE_TYPES = new Set([
  "StorageBucketRefNode",
  "storage_bucket_ref",
  "bucket_ref",
  "storage_operation_ref",
  "storage_ref",
  "StorageOperationRefNode",
]);

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

  if (!isStorageToRef) {
    return;
  }

  const rawHandle = connection.sourceHandle || "";
  const bucketMatch = rawHandle.match(/^(?:buckets?):out:(.+)$/);
  const rawBucketId = bucketMatch ? bucketMatch[1] : undefined;

  const buckets = sourceNode.data?.buckets || [];
  const matchedBucket = rawBucketId
    ? buckets.find((b) => b.id === rawBucketId || b.name === rawBucketId)
    : buckets[0];

  const resolvedBucketName =
    matchedBucket?.name || rawBucketId || "default-bucket";
  const resolvedBucketId =
    matchedBucket?.id || rawBucketId || resolvedBucketName;

  get().updateNode(targetNode.id, {
    data: {
      ...targetNode.data,
      storageNodeId: sourceNode.id,
      bucketId: resolvedBucketId,
      bucketName: resolvedBucketName,
      storageProvider:
        sourceNode.data?.storageProvider ||
        targetNode.data?.storageProvider ||
        "s3",
      label: targetNode.data?.label || resolvedBucketName,
    },
  });
}
