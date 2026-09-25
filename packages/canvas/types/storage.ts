export type StorageOperationKind =
  | "presign_upload"
  | "presign_download"
  | "upload"
  | "download"
  | "delete"
  | "batch_delete"
  | "list"
  | "exists"
  | "copy";

export interface StorageOperationParam {
  name: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  description?: string;
}

export interface StorageOperationBadge {
  label: string;
  colorClass: string;
}

export interface StorageOperationFunction {
  id: string;
  name: string;
  label?: string;
  kind: StorageOperationKind;
  description?: string;
  signature?: string;
  returnType?: string;
  params?: StorageOperationParam[];
  badge?: StorageOperationBadge;
  enabled?: boolean;
  isCustom?: boolean;
  code?: string;
  defaultBucket?: string;
}

export interface CanvasStorageOperationRefNodeData {
  storageNodeId?: string;
  storageProvider?: string;
  bucketId?: string;
  bucketName?: string;
  operationId?: string;
  targetServiceId?: string;
  serviceNodeId?: string;
  storageOperations?: StorageOperationFunction[];
}

export type CanvasStorageBucketRefNodeData = CanvasStorageOperationRefNodeData;

