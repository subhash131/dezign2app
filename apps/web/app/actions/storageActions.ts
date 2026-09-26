"use server";

import {
  checkStorageConnectionLive,
  executeStorageOperationLive,
  listStorageBucketsLive,
  createStorageBucketLive,
  type StorageConnectionConfig,
  type CheckStorageConnectionResult,
  type ExecuteStorageOperationPayload,
  type ExecuteStorageOperationResult,
  type ListStorageBucketsResult,
  type CreateStorageBucketResult,
  type ServerBucketInfo,
} from "@/lib/utils/storageRunner";

export type {
  StorageConnectionConfig,
  CheckStorageConnectionResult,
  ExecuteStorageOperationPayload,
  ExecuteStorageOperationResult,
  ListStorageBucketsResult,
  CreateStorageBucketResult,
  ServerBucketInfo,
};

/**
 * Server action to check live storage connection against the configured S3 / storage server.
 * Dispatches a real network request (HEAD / Ping) to the target server endpoint.
 */
export async function checkStorageConnectionAction(
  config: StorageConnectionConfig,
): Promise<CheckStorageConnectionResult> {
  return checkStorageConnectionLive(config);
}

/**
 * Server action to execute a storage operation (upload, download, exists, delete, list)
 * directly against the configured live storage server.
 */
export async function executeStorageOperationAction(
  payload: ExecuteStorageOperationPayload,
): Promise<ExecuteStorageOperationResult> {
  return executeStorageOperationLive(payload);
}

/**
 * Server action to discover and list all buckets on the configured storage server.
 */
export async function listStorageBucketsAction(
  config: StorageConnectionConfig,
): Promise<ListStorageBucketsResult> {
  return listStorageBucketsLive(config);
}

/**
 * Server action to create a new bucket directly on the configured storage server.
 */
export async function createStorageBucketAction(
  config: StorageConnectionConfig,
  bucketName: string,
): Promise<CreateStorageBucketResult> {
  return createStorageBucketLive(config, bucketName);
}

