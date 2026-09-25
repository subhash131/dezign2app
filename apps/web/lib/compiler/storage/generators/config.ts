import { BackendNode } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";

export function generateStorageConfigFile(node: BackendNode): CompiledFile {
  const data = node.data || {};
  const provider = data.storageProvider || "s3";
  const defaultRegion = data.defaultRegion || "us-east-1";
  const endpointUrl = data.endpointUrl || "";
  const forcePathStyle = Boolean(data.forcePathStyle || provider === "minio");
  const accessKeyEnv = data.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyEnv = data.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
  const sessionTokenEnv = data.sessionTokenEnv || "AWS_SESSION_TOKEN";

  const content = `// ═══════════════════════════════════════════════════════════════════════════
// Storage Configuration & Credentials
// ═══════════════════════════════════════════════════════════════════════════

export interface StorageConfig {
  provider: "s3" | "r2" | "gcs" | "minio" | "custom" | string;
  region: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  forcePathStyle?: boolean;
}

const accessKeyId =
  process.env["${accessKeyEnv}"] ||
  process.env.AWS_ACCESS_KEY_ID ||
  process.env.STORAGE_ACCESS_KEY_ID;

const secretAccessKey =
  process.env["${secretKeyEnv}"] ||
  process.env.AWS_SECRET_ACCESS_KEY ||
  process.env.STORAGE_SECRET_ACCESS_KEY;

const sessionToken =
  process.env["${sessionTokenEnv}"] ||
  process.env.AWS_SESSION_TOKEN ||
  process.env.STORAGE_SESSION_TOKEN;

export const storageConfig: StorageConfig = {
  provider: process.env.STORAGE_PROVIDER || "${provider}",
  region:
    process.env.AWS_REGION ||
    process.env.STORAGE_REGION ||
    "${defaultRegion}",
  endpoint:
    process.env.AWS_ENDPOINT_URL_S3 ||
    process.env.STORAGE_ENDPOINT ||
    ${endpointUrl ? `"${endpointUrl}"` : "undefined"},
  credentials:
    accessKeyId && secretAccessKey
      ? {
          accessKeyId,
          secretAccessKey,
          ...(sessionToken ? { sessionToken } : {}),
        }
      : undefined,
  forcePathStyle:
    process.env.STORAGE_FORCE_PATH_STYLE !== undefined
      ? process.env.STORAGE_FORCE_PATH_STYLE === "true"
      : ${forcePathStyle},
};
`;

  return {
    filename: "src/config.ts",
    language: "typescript",
    content,
  };
}
