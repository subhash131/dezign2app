import { BackendNode } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";
import { toBucketKey } from "../utils";

export function generateStorageBucketsFile(node: BackendNode): CompiledFile {
  const buckets = node.data?.buckets || [];

  const bucketEntries: string[] = [];
  const metadataEntries: string[] = [];

  if (buckets.length === 0) {
    bucketEntries.push(`  DEFAULT: process.env.STORAGE_BUCKET_DEFAULT || "default-bucket",`);
    metadataEntries.push(`  [STORAGE_BUCKETS.DEFAULT]: {
    name: STORAGE_BUCKETS.DEFAULT,
    accessPolicy: "${node.data?.accessPolicy || "private"}",
    corsEnabled: ${Boolean(node.data?.corsEnabled)},
    versioning: ${Boolean(node.data?.versioning)},
  },`);
  } else {
    buckets.forEach((b) => {
      const rawName = b.name || "bucket";
      const key = toBucketKey(rawName);
      const envVarName = `STORAGE_BUCKET_${key}`;
      bucketEntries.push(`  ${key}: process.env.${envVarName} || "${rawName}",`);

      const policy = b.accessPolicy || node.data?.accessPolicy || "private";
      const enableCdn = Boolean(b.enableCdn);
      const cdnUrl = b.cdnDomain || node.data?.cdnUrl || "";
      const maxFileSize = b.maxFileSize || "";
      const allowedMimeTypes = b.allowedMimeTypes || "";

      metadataEntries.push(`  [STORAGE_BUCKETS.${key}]: {
    name: STORAGE_BUCKETS.${key},
    accessPolicy: "${policy}",
    corsEnabled: ${Boolean(b.enableCors || node.data?.corsEnabled)},
    enableCdn: ${enableCdn},
    cdnUrl: ${cdnUrl ? `process.env.STORAGE_CDN_${key} || "${cdnUrl}"` : `process.env.STORAGE_CDN_${key} || undefined`},
    maxFileSize: ${maxFileSize ? `"${maxFileSize}"` : "undefined"},
    allowedMimeTypes: ${allowedMimeTypes ? `"${allowedMimeTypes}"` : "undefined"},
    enablePresignedUrls: ${b.enablePresignedUrls ?? true},
    presignedUrlTtl: ${b.presignedUrlTtl ? Number(b.presignedUrlTtl) || 900 : 900},
  },`);
    });
  }

  const content = `// ═══════════════════════════════════════════════════════════════════════════
// Storage Buckets & Metadata Definitions
// ═══════════════════════════════════════════════════════════════════════════

export const STORAGE_BUCKETS = {
${bucketEntries.join("\n")}
} as const;

export type StorageBucketKey = keyof typeof STORAGE_BUCKETS;
export type StorageBucketName = (typeof STORAGE_BUCKETS)[StorageBucketKey];

export interface BucketMetadata {
  name: string;
  accessPolicy: "private" | "public-read" | "authenticated-read" | string;
  corsEnabled?: boolean;
  enableCdn?: boolean;
  cdnUrl?: string;
  maxFileSize?: string;
  allowedMimeTypes?: string;
  enablePresignedUrls?: boolean;
  presignedUrlTtl?: number;
}

export const BUCKET_METADATA: Record<string, BucketMetadata> = {
${metadataEntries.join("\n")}
};

/**
 * Helper to retrieve configured metadata for a given bucket name.
 */
export function getBucketMetadata(bucketName: string): BucketMetadata | undefined {
  return BUCKET_METADATA[bucketName];
}
`;

  return {
    filename: "src/buckets.ts",
    language: "typescript",
    content,
  };
}
