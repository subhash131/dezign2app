import { BackendNode } from "@/types/canvas";
import { MESSAGING_RESOURCE_TYPES } from "@workspace/canvas";
import type { MessagingResourceType } from "@workspace/canvas";

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
