import { BackendNode } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";

export function generateStorageClientFile(node: BackendNode): CompiledFile {
  const content = `// ═══════════════════════════════════════════════════════════════════════════
// S3 / Object Storage Client Singleton
// ═══════════════════════════════════════════════════════════════════════════

import { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { storageConfig } from "./config";

const clientOptions: S3ClientConfig = {
  region: storageConfig.region,
  endpoint: storageConfig.endpoint,
  credentials: storageConfig.credentials,
  forcePathStyle: storageConfig.forcePathStyle,
};

/**
 * Shared S3Client instance configured for ${node.data?.label || "Storage"}.
 */
export const s3Client = new S3Client(clientOptions);

/**
 * Creates a fresh S3Client with custom overrides if needed.
 */
export function createStorageClient(overrides?: Partial<S3ClientConfig>): S3Client {
  return new S3Client({
    ...clientOptions,
    ...overrides,
  });
}
`;

  return {
    filename: "src/client.ts",
    language: "typescript",
    content,
  };
}
