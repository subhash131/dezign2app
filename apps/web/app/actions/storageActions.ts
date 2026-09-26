"use server";

import {
  checkStorageConnectionLive,
  executeStorageOperationLive,
  type StorageConnectionConfig,
  type CheckStorageConnectionResult,
  type ExecuteStorageOperationPayload,
  type ExecuteStorageOperationResult,
} from "@/lib/utils/storageRunner";

export type {
  StorageConnectionConfig,
  CheckStorageConnectionResult,
  ExecuteStorageOperationPayload,
  ExecuteStorageOperationResult,
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
