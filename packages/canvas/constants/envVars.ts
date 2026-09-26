export interface EnvVarTemplate {
  id: string;
  name: string;
  description?: string;
}

export const DEFAULT_STORAGE_ENV_VARS: EnvVarTemplate[] = [
  { id: "aws-access-key-id", name: "AWS_ACCESS_KEY_ID", description: "S3 Access Key ID" },
  { id: "aws-secret-access-key", name: "AWS_SECRET_ACCESS_KEY", description: "S3 Secret Access Key" },
  { id: "aws-region", name: "AWS_REGION", description: "S3 Region (e.g. us-east-1)" },
  { id: "s3-endpoint-url", name: "S3_ENDPOINT_URL", description: "Custom S3 endpoint URL (MinIO, R2, SeaweedFS)" },
];

export const DEFAULT_DATABASE_ENGINE_ENV_VARS: Record<string, EnvVarTemplate[]> = {
  sqlite: [
    { id: "db-url", name: "DATABASE_URL", description: "SQLite connection string (file:./local.db)" },
    { id: "db-file-path", name: "DB_FILE_PATH", description: "SQLite local file storage path" },
  ],
  postgres: [
    { id: "db-url", name: "DATABASE_URL", description: "PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/mydb)" },
  ],
  mysql: [
    { id: "db-url", name: "DATABASE_URL", description: "MySQL connection string (e.g. mysql://user:pass@localhost:3306/mydb)" },
  ],
  mariadb: [
    { id: "db-url", name: "DATABASE_URL", description: "MariaDB connection string" },
  ],
  redis: [
    { id: "redis-url", name: "REDIS_URL", description: "Redis connection URI (e.g. redis://localhost:6379)" },
  ],
  mongodb: [
    { id: "mongodb-uri", name: "MONGODB_URI", description: "MongoDB connection string" },
  ],
};

export const DEFAULT_SERVICE_ENV_VARS: EnvVarTemplate[] = [
  { id: "srv-port", name: "PORT", description: "HTTP server listen port" },
  { id: "srv-node-env", name: "NODE_ENV", description: "Environment mode (development, production)" },
];

export const DEFAULT_WEB_APP_ENV_VARS: EnvVarTemplate[] = [
  { id: "app-port", name: "PORT", description: "Web application server port" },
  { id: "app-url", name: "NEXT_PUBLIC_APP_URL", description: "Public canonical app URL" },
];

export const DEFAULT_AUTH_ENV_VARS: EnvVarTemplate[] = [
  { id: "auth-secret", name: "BETTER_AUTH_SECRET", description: "Better Auth secret key for session signing" },
  { id: "auth-url", name: "BETTER_AUTH_URL", description: "Base URL of the authentication server" },
];

export const DEFAULT_PAYMENTS_ENV_VARS: EnvVarTemplate[] = [
  { id: "pay-api-key", name: "CREEM_API_KEY", description: "Creem Payments API key" },
  { id: "pay-webhook-secret", name: "CREEM_WEBHOOK_SECRET", description: "Creem webhook secret" },
];

/**
 * Returns sensible default environment variables for a given node type and its data.
 */
export function getDefaultNodeEnvVars(
  nodeType?: string,
  nodeData?: Record<string, any>,
): EnvVarTemplate[] {
  if (!nodeType) return [];

  if (nodeType === "storage") {
    const accessKey = nodeData?.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
    const secretKey = nodeData?.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
    const region = nodeData?.defaultRegion || "us-east-1";
    return [
      { id: "storage-access-key", name: accessKey, description: "S3 Access Key ID" },
      { id: "storage-secret-key", name: secretKey, description: "S3 Secret Access Key" },
      { id: "storage-region", name: "AWS_REGION", description: `S3 Region (e.g. ${region})` },
      { id: "storage-endpoint", name: "S3_ENDPOINT_URL", description: "Custom S3 endpoint URL (MinIO, R2, SeaweedFS)" },
    ];
  }

  if (nodeType === "database") {
    const engine = (nodeData?.dbEngine || "sqlite").toLowerCase();
    const connEnv = nodeData?.connectionStringEnv;
    const fileEnv = nodeData?.dbFilePathEnv;

    if (engine === "sqlite") {
      return [
        { id: "db-url", name: connEnv || "DATABASE_URL", description: "SQLite connection string (file:./local.db)" },
        { id: "db-file-path", name: fileEnv || "DB_FILE_PATH", description: "SQLite local file storage path" },
      ];
    }
    if (engine === "redis") {
      return [
        { id: "redis-url", name: connEnv || "REDIS_URL", description: "Redis connection URI (e.g. redis://localhost:6379)" },
      ];
    }
    if (engine === "mongodb") {
      return [
        { id: "mongodb-uri", name: connEnv || "MONGODB_URI", description: "MongoDB connection URI" },
      ];
    }
    return [
      { id: "db-url", name: connEnv || "DATABASE_URL", description: `${engine.toUpperCase()} database connection URL` },
    ];
  }

  if (nodeType === "service") {
    return [
      { id: "srv-port", name: "PORT", description: `HTTP server port (default: ${nodeData?.port || 8080})` },
      { id: "srv-node-env", name: "NODE_ENV", description: "Environment mode (development, production)" },
    ];
  }

  if (nodeType === "webApp") {
    return [
      { id: "app-port", name: "PORT", description: `Web app port (default: ${nodeData?.port || 3000})` },
      { id: "app-url", name: "NEXT_PUBLIC_APP_URL", description: "Canonical public app URL" },
    ];
  }

  if (nodeType === "auth") {
    return [
      { id: "auth-secret", name: "BETTER_AUTH_SECRET", description: "Better Auth secret key for session signing" },
      { id: "auth-url", name: "BETTER_AUTH_URL", description: "Base URL of the authentication server" },
    ];
  }

  if (nodeType === "payments") {
    return [
      { id: "pay-api-key", name: nodeData?.apiKeyEnv || "CREEM_API_KEY", description: "Creem Payments API key" },
      { id: "pay-webhook-secret", name: nodeData?.webhookSecretEnv || "CREEM_WEBHOOK_SECRET", description: "Creem webhook secret" },
    ];
  }

  if (nodeType === "kafka") {
    return [
      { id: "kafka-brokers", name: "KAFKA_BROKERS", description: "Comma-separated Kafka broker addresses" },
    ];
  }

  if (nodeType === "sqs") {
    return [
      { id: "sqs-region", name: "AWS_REGION", description: "AWS Region for SQS" },
      { id: "sqs-queue-url", name: "SQS_QUEUE_URL", description: "Amazon SQS Queue URL" },
    ];
  }

  if (
    nodeType === "redis-streams" ||
    nodeType === "redis-pubsub" ||
    nodeType === "redis_instance" ||
    nodeType === "redis-cache"
  ) {
    return [
      { id: "redis-url", name: "REDIS_URL", description: "Redis connection URI (redis://localhost:6379)" },
    ];
  }

  return [];
}
