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

export type TestingViewMode = "operations" | "connection" | "suite";

export interface StorageOperationOption {
  key: string;
  name: string;
  label: string;
  desc: string;
  kind: "write" | "read" | "presign" | "delete" | "query";
  defaultKey: string;
  defaultContentType?: string;
  defaultBody?: string;
  defaultTtl?: string;
}

export type OperationOption = StorageOperationOption;

export type BucketTestOperation =
  | "upload"
  | "download"
  | "presign_upload"
  | "presign_download"
  | "exists"
  | "delete"
  | "list"
  | "cors_preflight"
  | "event_notify";

export type BucketCallerRole = "authenticated" | "anonymous" | "admin";

export interface BucketAuditCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface BucketTestResult {
  id: string;
  operation: BucketTestOperation;
  timestamp: string;
  status: number;
  statusText: string;
  durationMs: number;
  data: Record<string, unknown>;
  headers: Record<string, string>;
  auditChecks: BucketAuditCheck[];
  emittedEvent?: Record<string, unknown>;
  signedUrl?: string;
  details?: string;
}

export interface StorageConnectionConfig {
  endpointUrl?: string;
  region?: string;
  bucketName: string;
  storageType?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  accessKeyIdEnv?: string;
  secretAccessKeyEnv?: string;
  sessionTokenEnv?: string;
  cdnUrl?: string;
}

export interface ServerBucketInfo {
  name: string;
  creationDate?: string;
}

export interface ListStorageBucketsResult {
  success: boolean;
  serverActive: boolean;
  status: number;
  statusText?: string;
  buckets: ServerBucketInfo[];
  endpoint: string;
  serverHeader?: string;
  error?: string;
  tip?: string;
}

export interface CreateStorageBucketResult {
  success: boolean;
  bucketName: string;
  status: number;
  statusText?: string;
  message: string;
  error?: string;
  tip?: string;
}

export interface CheckStorageConnectionResult {
  success: boolean;
  serverActive: boolean;
  bucketExists?: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  endpoint: string;
  bucket: string;
  region: string;
  serverHeader?: string;
  headers?: Record<string, string>;
  error?: string;
  tip?: string;
  details?: Record<string, unknown>;
}

export interface ExecuteStorageOperationPayload {
  connection: StorageConnectionConfig;
  operation: string;
  params: {
    key?: string;
    body?: string;
    contentType?: string;
    ttl?: string | number;
    prefix?: string;
    maxKeys?: number;
    sourceKey?: string;
    destKey?: string;
    metadata?: Record<string, string>;
  };
}

export interface ExecuteStorageOperationResult {
  success: boolean;
  serverActive: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  endpoint: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  data: unknown;
  rawResponse?: string;
  signedUrl?: string;
  error?: string;
  tip?: string;
}

