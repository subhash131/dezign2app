import { BackendNode } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";

export function generateStorageOperationsFile(node: BackendNode): CompiledFile {
  const content = `// ═══════════════════════════════════════════════════════════════════════════
// Storage Operations (Upload, Download, Presigned URLs, Delete, List)
// ═══════════════════════════════════════════════════════════════════════════

import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  ObjectCannedACL,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "./client";
import { getBucketMetadata } from "./buckets";

export interface PresignedUrlOptions {
  expiresInSeconds?: number;
  contentType?: string;
  acl?: ObjectCannedACL;
}

export interface UploadObjectOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: ObjectCannedACL;
}

/**
 * Generates a presigned PUT URL allowing clients to upload directly to S3/R2/GCS.
 */
export async function getUploadPresignedUrl(
  bucketName: string,
  key: string,
  options?: PresignedUrlOptions,
): Promise<string> {
  const meta = getBucketMetadata(bucketName);
  const ttl = options?.expiresInSeconds ?? meta?.presignedUrlTtl ?? 900;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: options?.contentType,
    ACL: options?.acl,
  });

  return getSignedUrl(s3Client, command, { expiresIn: ttl });
}

/**
 * Generates a presigned GET URL allowing clients to download private files securely.
 */
export async function getDownloadPresignedUrl(
  bucketName: string,
  key: string,
  options?: { expiresInSeconds?: number },
): Promise<string> {
  const ttl = options?.expiresInSeconds ?? 3600;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: ttl });
}

/**
 * Uploads an object directly from server memory or stream.
 */
export async function uploadObject(
  bucketName: string,
  key: string,
  body: string | Uint8Array | Buffer | ReadableStream | Blob,
  options?: UploadObjectOptions,
) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body as any,
    ContentType: options?.contentType,
    Metadata: options?.metadata,
    ACL: options?.acl,
  });

  return s3Client.send(command);
}

/**
 * Downloads an object from storage.
 */
export async function downloadObject(bucketName: string, key: string) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3Client.send(command);
  return response.Body;
}

/**
 * Deletes a single object from storage.
 */
export async function deleteObject(bucketName: string, key: string) {
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return s3Client.send(command);
}

/**
 * Deletes multiple objects in a single batch request.
 */
export async function deleteObjects(bucketName: string, keys: string[]) {
  const command = new DeleteObjectsCommand({
    Bucket: bucketName,
    Delete: {
      Objects: keys.map((k) => ({ Key: k })),
    },
  });

  return s3Client.send(command);
}

/**
 * Lists objects in a bucket under a specified prefix.
 */
export async function listObjects(
  bucketName: string,
  prefix?: string,
  maxKeys: number = 1000,
) {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);
  return response.Contents || [];
}

/**
 * Returns a public CDN or direct URL for an object if configured.
 */
export function getPublicObjectUrl(bucketName: string, key: string): string {
  const meta = getBucketMetadata(bucketName);
  if (meta?.cdnUrl) {
    const base = meta.cdnUrl.replace(/\\/+$/, "");
    return \`\${base}/\${key.replace(/^\\/+/, "")}\`;
  }
  return \`https://\${bucketName}.s3.amazonaws.com/\${key.replace(/^\\/+/, "")}\`;
}
`;

  return {
    filename: "src/operations.ts",
    language: "typescript",
    content,
  };
}
