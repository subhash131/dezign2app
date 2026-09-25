import { BackendNode } from "@/types/canvas";
import {
  StepBinding,
  StorageOperationFunction,
  StorageOperationKind,
  StorageOperationParam,
  StorageOperationBadge,
  AnyMessagingResource,
} from "@workspace/canvas/types";

export type {
  StorageOperationFunction,
  StorageOperationKind,
  StorageOperationParam,
  StorageOperationBadge,
};

export const BASE_STORAGE_OPERATIONS: readonly StorageOperationFunction[] = [
  {
    id: "storage-getUploadPresignedUrl",
    name: "getUploadPresignedUrl",
    label: "Get Upload Presigned URL",
    kind: "presign_upload",
    description: "Generate a signed PUT URL allowing clients to upload directly to cloud storage",
    signature:
      "getUploadPresignedUrl(bucketName: string, key: string, options?: PresignedUrlOptions): Promise<string>",
    returnType: "Promise<string>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key/path" },
      { name: "options", type: "PresignedUrlOptions", required: false, description: "TTL, Content-Type, ACL options" },
    ],
    badge: {
      label: "PRESIGN-PUT",
      colorClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    },
  },
  {
    id: "storage-getDownloadPresignedUrl",
    name: "getDownloadPresignedUrl",
    label: "Get Download Presigned URL",
    kind: "presign_download",
    description: "Generate a temporary signed GET URL allowing clients to download private files securely",
    signature:
      "getDownloadPresignedUrl(bucketName: string, key: string, options?: { expiresInSeconds?: number }): Promise<string>",
    returnType: "Promise<string>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key/path" },
      { name: "options", type: "{ expiresInSeconds?: number }", required: false, description: "Expiration time in seconds" },
    ],
    badge: {
      label: "PRESIGN-GET",
      colorClass: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
  },
  {
    id: "storage-uploadObject",
    name: "uploadObject",
    label: "Upload Object",
    kind: "upload",
    description: "Uploads an object directly from server memory or stream into storage",
    signature:
      "uploadObject(bucketName: string, key: string, body: Buffer | Uint8Array | Blob | string, options?: UploadObjectOptions): Promise<PutObjectCommandOutput>",
    returnType: "Promise<PutObjectCommandOutput>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key/path" },
      { name: "body", type: "Buffer | Uint8Array | Blob | string", required: true, description: "Payload file data or stream" },
      { name: "options", type: "UploadObjectOptions", required: false, description: "Content-Type, metadata, ACL" },
    ],
    badge: {
      label: "WRITE",
      colorClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
  },
  {
    id: "storage-downloadObject",
    name: "downloadObject",
    label: "Download Object",
    kind: "download",
    description: "Downloads an object payload as a stream or buffer from storage",
    signature: "downloadObject(bucketName: string, key: string): Promise<ReadableStream | Blob | undefined>",
    returnType: "Promise<ReadableStream | Blob | undefined>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key/path" },
    ],
    badge: {
      label: "READ",
      colorClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    },
  },
  {
    id: "storage-deleteObject",
    name: "deleteObject",
    label: "Delete Object",
    kind: "delete",
    description: "Deletes a single object from storage by key",
    signature: "deleteObject(bucketName: string, key: string): Promise<DeleteObjectCommandOutput>",
    returnType: "Promise<DeleteObjectCommandOutput>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key to remove" },
    ],
    badge: {
      label: "DEL",
      colorClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    },
  },
  {
    id: "storage-deleteObjects",
    name: "deleteObjects",
    label: "Batch Delete Objects",
    kind: "batch_delete",
    description: "Deletes multiple objects in a single batch request",
    signature: "deleteObjects(bucketName: string, keys: string[]): Promise<DeleteObjectsCommandOutput>",
    returnType: "Promise<DeleteObjectsCommandOutput>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "keys", type: "string[]", required: true, description: "Array of object keys to remove" },
    ],
    badge: {
      label: "BATCH-DEL",
      colorClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    },
  },
  {
    id: "storage-listObjects",
    name: "listObjects",
    label: "List Objects",
    kind: "list",
    description: "Lists objects in a bucket under a specified prefix or folder",
    signature: "listObjects(bucketName: string, prefix?: string, maxKeys?: number): Promise<_Object[]>",
    returnType: "Promise<_Object[]>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "prefix", type: "string", required: false, description: "Optional folder/key prefix filter" },
      { name: "maxKeys", type: "number", required: false, description: "Maximum objects to return (default 1000)" },
    ],
    badge: {
      label: "LIST",
      colorClass: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    },
  },
  {
    id: "storage-objectExists",
    name: "objectExists",
    label: "Check Object Exists",
    kind: "exists",
    description: "Lightweight HEAD check to test if an object exists without downloading body",
    signature: "objectExists(bucketName: string, key: string): Promise<boolean>",
    returnType: "Promise<boolean>",
    params: [
      { name: "bucketName", type: "string", required: true, description: "Target bucket name" },
      { name: "key", type: "string", required: true, description: "Target object key/path" },
    ],
    badge: {
      label: "CHECK",
      colorClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
  },
  {
    id: "storage-copyObject",
    name: "copyObject",
    label: "Copy Object",
    kind: "copy",
    description: "Server-side copy between objects or buckets without local memory transfer",
    signature:
      "copyObject(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<CopyObjectCommandOutput>",
    returnType: "Promise<CopyObjectCommandOutput>",
    params: [
      { name: "sourceBucket", type: "string", required: true, description: "Source bucket name" },
      { name: "sourceKey", type: "string", required: true, description: "Source object key" },
      { name: "destBucket", type: "string", required: true, description: "Destination bucket name" },
      { name: "destKey", type: "string", required: true, description: "Destination object key" },
    ],
    badge: {
      label: "COPY",
      colorClass: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    },
  },
];

/**
 * Derives badge styling for an operation kind.
 */
export function getStorageKindBadge(kind: StorageOperationKind): { label: string; colorClass: string } {
  switch (kind) {
    case "presign_upload":
      return { label: "PRESIGN-PUT", colorClass: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
    case "presign_download":
      return { label: "PRESIGN-GET", colorClass: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "upload":
      return { label: "WRITE", colorClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "download":
      return { label: "READ", colorClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "delete":
      return { label: "DEL", colorClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    case "batch_delete":
      return { label: "BATCH-DEL", colorClass: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    case "list":
      return { label: "LIST", colorClass: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
    case "exists":
      return { label: "CHECK", colorClass: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "copy":
      return { label: "COPY", colorClass: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
    default:
      return { label: "CUSTOM", colorClass: "bg-purple-500/15 text-purple-400 border-purple-500/30" };
  }
}

/**
 * Evaluates whether an operation is allowed based on the bucket's access control settings.
 */
export function getOperationAccessRestrictedReason(
  op: StorageOperationFunction,
  allowedOps: readonly string[] = ["read", "write", "delete", "list"],
  accessPolicy: string = "private",
  enablePresignedUrls: boolean = true,
): string | null {
  const isPresignedOnly = accessPolicy === "presigned-only";
  const allowsRead = allowedOps.includes("read");
  const allowsWrite = allowedOps.includes("write");
  const allowsDelete = allowedOps.includes("delete");
  const allowsList = allowedOps.includes("list");
  const allowsPresigned = enablePresignedUrls || isPresignedOnly;

  switch (op.kind) {
    case "presign_upload":
      if (!allowsWrite) return "Write Permission Disabled";
      if (!allowsPresigned) return "Presigned URLs Disabled";
      return null;
    case "presign_download":
      if (!allowsRead) return "Read Permission Disabled";
      if (!allowsPresigned) return "Presigned URLs Disabled";
      return null;
    case "upload":
      if (!allowsWrite) return "Write Permission Disabled";
      if (isPresignedOnly) return "Presigned-Only Policy";
      return null;
    case "download":
    case "exists":
      if (!allowsRead) return "Read Permission Disabled";
      return null;
    case "delete":
    case "batch_delete":
      if (!allowsDelete) return "Delete Permission Disabled";
      return null;
    case "list":
      if (!allowsList) return "List Permission Disabled";
      return null;
    case "copy":
      if (!allowsWrite) return "Write Permission Disabled";
      if (!allowsRead) return "Read Permission Disabled";
      return null;
    default:
      return null;
  }
}

/**
 * Synchronizes storage operations according to access policy and allowed operations matrix.
 */
export function syncOperationsWithAccessControl(
  existingOps: StorageOperationFunction[],
  allowedOps: readonly string[] = ["read", "write", "delete", "list"],
  accessPolicy: string = "private",
  enablePresignedUrls: boolean = true,
): StorageOperationFunction[] {
  const baseSynced = BASE_STORAGE_OPERATIONS.map((baseOp) => {
    const existing = existingOps.find(
      (o) => o.id === baseOp.id || o.name === baseOp.name,
    );

    const restrictedReason = getOperationAccessRestrictedReason(
      baseOp,
      allowedOps,
      accessPolicy,
      enablePresignedUrls,
    );
    const isAllowedByAccess = restrictedReason === null;

    if (existing) {
      return {
        ...existing,
        enabled: isAllowedByAccess ? (existing.enabled ?? true) : false,
      };
    }

    return {
      ...baseOp,
      enabled: isAllowedByAccess ? (baseOp.enabled ?? true) : false,
    };
  });

  const customOps = existingOps.filter(
    (o) => !BASE_STORAGE_OPERATIONS.some((b) => b.id === o.id || b.name === o.name),
  );

  return [...baseSynced, ...customOps];
}

/**
 * Returns the list of standard storage operations with user overrides and custom functions.
 */
export function getStorageOperations(
  storageNode?: { type?: string; data?: BackendNode["data"] } | null,
  bucket?: AnyMessagingResource | null,
): StorageOperationFunction[] {
  const customOrOverridden: StorageOperationFunction[] =
    bucket?.storageOperations ||
    storageNode?.data?.storageOperations ||
    [];

  const defaultBucketName =
    bucket?.name ||
    storageNode?.data?.buckets?.[0]?.name ||
    "default-bucket";

  const allowedOps = bucket?.allowedOperations ?? ["read", "write", "delete", "list"];
  const accessPolicy = bucket?.accessPolicy ?? "private";
  const enablePresignedUrls = bucket?.enablePresignedUrls !== undefined
    ? Boolean(bucket.enablePresignedUrls)
    : true;

  const baseWithOverrides = BASE_STORAGE_OPERATIONS.map((baseOp) => {
    const override = customOrOverridden.find(
      (o) => o.id === baseOp.id || o.name === baseOp.name,
    );

    const restrictedReason = getOperationAccessRestrictedReason(
      baseOp,
      allowedOps,
      accessPolicy,
      enablePresignedUrls,
    );
    const isAllowedByAccess = restrictedReason === null;

    if (override) {
      return {
        ...baseOp,
        ...override,
        enabled: isAllowedByAccess ? (override.enabled ?? true) : false,
        badge: baseOp.badge,
        defaultBucket: override.defaultBucket || defaultBucketName,
      };
    }
    return {
      ...baseOp,
      enabled: isAllowedByAccess ? (baseOp.enabled ?? true) : false,
      defaultBucket: defaultBucketName,
    };
  });

  const customOps = customOrOverridden.filter(
    (o) => !BASE_STORAGE_OPERATIONS.some((b) => b.id === o.id || b.name === o.name),
  );

  return [...baseWithOverrides, ...customOps];
}

/**
 * Generates an illustrative TypeScript SDK snippet for a storage operation.
 */
export function generateStorageOperationSnippet(
  op: StorageOperationFunction,
  storageNode?: { type?: string; data?: BackendNode["data"] } | null,
): string {
  const defaultBucket =
    op.defaultBucket ||
    (storageNode?.data?.buckets && storageNode.data.buckets.length > 0
      ? storageNode.data.buckets[0]?.name
      : "my-bucket") ||
    "my-bucket";

  switch (op.kind) {
    case "presign_upload":
      return `import { getUploadPresignedUrl } from "@workspace/storage/operations";

// Generate client upload URL (valid for 15 minutes)
const uploadUrl = await getUploadPresignedUrl("${defaultBucket}", "uploads/user-avatar.png", {
  expiresInSeconds: 900,
  contentType: "image/png",
});

// Client uploads directly via HTTP PUT:
// await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "image/png" } });`;

    case "presign_download":
      return `import { getDownloadPresignedUrl } from "@workspace/storage/operations";

// Generate temporary signed download URL for private files
const downloadUrl = await getDownloadPresignedUrl("${defaultBucket}", "invoices/inv_2026_001.pdf", {
  expiresInSeconds: 3600,
});`;

    case "upload":
      return `import { uploadObject } from "@workspace/storage/operations";

// Upload directly from backend server buffer or stream
const response = await uploadObject(
  "${defaultBucket}",
  "documents/report.pdf",
  fileBuffer,
  { contentType: "application/pdf" }
);`;

    case "download":
      return `import { downloadObject } from "@workspace/storage/operations";

// Retrieve file stream into memory
const fileStream = await downloadObject("${defaultBucket}", "documents/data.csv");`;

    case "delete":
      return `import { deleteObject } from "@workspace/storage/operations";

// Delete an object from storage
await deleteObject("${defaultBucket}", "uploads/old-file.jpg");`;

    case "batch_delete":
      return `import { deleteObjects } from "@workspace/storage/operations";

// Delete multiple keys in a single batch request
await deleteObjects("${defaultBucket}", [
  "temp/file-1.tmp",
  "temp/file-2.tmp",
  "temp/file-3.tmp",
]);`;

    case "list":
      return `import { listObjects } from "@workspace/storage/operations";

// List all files under a specific folder prefix
const objects = await listObjects("${defaultBucket}", "users/usr_123/", 100);`;

    case "exists":
      return `import { objectExists } from "@workspace/storage/operations";

// Check if an object exists with a lightweight HEAD request
const exists = await objectExists("${defaultBucket}", "users/profile.jpg");
if (!exists) {
  throw new Error("File not found in storage");
}`;

    case "copy":
      return `import { copyObject } from "@workspace/storage/operations";

// Cloud server-side copy without local memory buffering
await copyObject(
  "${defaultBucket}",
  "temp/avatar.png",
  "${defaultBucket}",
  "public/avatars/user_123.png"
);`;

    default:
      if (op.code) {
        return op.code;
      }
      return `import { ${op.name} } from "@workspace/storage/operations";

// Custom storage operation execution
const result = await ${op.name}("${defaultBucket}");`;
  }
}

/**
 * Computes default bindings for a given storage operation in PipelineStepEditor.
 */
export function computeStorageOpBindings(
  op: StorageOperationFunction | undefined,
  currentBindings: StepBinding[] = [],
  defaultBucketName?: string,
): StepBinding[] {
  if (!op) return [];
  const params = op.params || [];

  return params.map((param) => {
    const existing = currentBindings.find(
      (b) => (b.argName || "").trim().toLowerCase() === param.name.toLowerCase(),
    );
    if (existing) {
      return existing;
    }

    if (param.name === "bucketName" || param.name === "sourceBucket" || param.name === "destBucket") {
      return {
        argName: param.name,
        source: {
          kind: "inline",
          value: defaultBucketName || "default-bucket",
        },
      };
    }

    if (param.name === "key" || param.name === "sourceKey" || param.name === "destKey") {
      return {
        argName: param.name,
        source: {
          kind: "req_body",
          field: "filename",
        },
      };
    }

    if (param.name === "body") {
      return {
        argName: param.name,
        source: {
          kind: "req_body",
          field: "file",
        },
      };
    }

    if (param.name === "prefix") {
      return {
        argName: param.name,
        source: {
          kind: "req_query",
          field: "prefix",
        },
      };
    }

    if (param.name === "keys") {
      return {
        argName: param.name,
        source: {
          kind: "req_body",
          field: "keys",
        },
      };
    }

    if (param.name === "options") {
      return {
        argName: param.name,
        source: {
          kind: "inline",
          value: "{}",
        },
      };
    }

    return {
      argName: param.name,
      source: {
        kind: "req_body",
        field: "",
      },
    };
  });
}
