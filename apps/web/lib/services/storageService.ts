import {
  checkStorageConnectionAction,
  executeStorageOperationAction,
  type StorageConnectionConfig,
  type CheckStorageConnectionResult,
  type ExecuteStorageOperationPayload,
  type ExecuteStorageOperationResult,
} from "@/app/actions/storageActions";

export type {
  StorageConnectionConfig,
  CheckStorageConnectionResult,
  ExecuteStorageOperationPayload,
  ExecuteStorageOperationResult,
};

/**
 * Check storage connection and reachability against the configured server.
 * Uses Next.js Server Actions to execute network requests from the server environment.
 */
export async function checkStorageConnection(
  config: StorageConnectionConfig,
): Promise<CheckStorageConnectionResult> {
  return checkStorageConnectionAction(config);
}

/**
 * Execute an operation directly against the configured storage server.
 */
export async function executeStorageOperation(
  payload: ExecuteStorageOperationPayload,
): Promise<ExecuteStorageOperationResult> {
  return executeStorageOperationAction(payload);
}
