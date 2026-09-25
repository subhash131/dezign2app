import { ConfigItemData } from "../types";

export function toVarNameSafe(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return clean ? clean.charAt(0).toLowerCase() + clean.slice(1) : "bucket";
}

export function toPascalCaseSafe(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "Bucket";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export function generateSdkSnippet(item: ConfigItemData): string {
  const allowedOps = Array.isArray(item.allowedOperations)
    ? item.allowedOperations
    : ["read", "write"];
  const corsMethodsList = Array.isArray(item.corsMethods)
    ? item.corsMethods
    : ["GET", "PUT", "POST", "HEAD"];
  const activeTriggers = Array.isArray(item.eventTriggers)
    ? item.eventTriggers
    : [];

  const region = item.region || "us-east-1";
  const isCustomEndpoint = Boolean(item.endpointUrl && item.endpointUrl.trim().length > 0);
  const resolvedEndpoint = isCustomEndpoint
    ? item.endpointUrl || ""
    : `https://s3.${region}.amazonaws.com`;

  const bucketName = item.name || "my-bucket";
  const storageClass = item.storageClass || "STANDARD";
  const accessKeyName = item.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyName = item.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
  const encryptionType = item.encryption || "SSE-S3";
  const sseHeader =
    encryptionType === "SSE-KMS"
      ? "aws:kms"
      : encryptionType === "None"
        ? undefined
        : "AES256";

  const accessPolicy = item.accessPolicy || "private";
  const aclMode =
    accessPolicy === "public-read"
      ? "public-read"
      : accessPolicy === "authenticated-read"
        ? "authenticated-read"
        : "private";

  const isPresigned = Boolean(
    item.enablePresignedUrls || accessPolicy === "presigned-only",
  );
  const presignedTtlSeconds = Number(item.presignedUrlTtl) || 900;
  const bucketVar = toVarNameSafe(bucketName);
  const bucketPascal = toPascalCaseSafe(bucketName);

  return [
    `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";`,
    ...(isPresigned ? [`import { getSignedUrl } from "@aws-sdk/s3-request-presigner";`] : []),
    ``,
    `// ─── 1. Authenticated S3 Client Init ───`,
    `export const s3 = new S3Client({`,
    `  region: "${region}",`,
    isCustomEndpoint
      ? `  endpoint: "${item.endpointUrl}",`
      : `  // endpoint: auto-resolved to "${resolvedEndpoint}"`,
    `  forcePathStyle: ${Boolean(item.forcePathStyle)},`,
    `  credentials: {`,
    `    accessKeyId: process.env.${accessKeyName}!,`,
    `    secretAccessKey: process.env.${secretKeyName}!,`,
    ...(item.sessionTokenEnv ? [`    sessionToken: process.env.${item.sessionTokenEnv},`] : []),
    `  },`,
    `});`,
    ``,
    `// ─── 2. Complete Bucket Configuration & Policy Spec ───`,
    `export const ${bucketVar}Config = {`,
    `  bucket: "${bucketName}",`,
    `  region: "${region}",`,
    `  storageClass: "${storageClass}",`,
    `  accessPolicy: "${accessPolicy}",`,
    `  allowedOperations: ${JSON.stringify(allowedOps)},`,
    ...(item.maxFileSize ? [`  maxFileSize: "${item.maxFileSize}",`] : []),
    ...(item.allowedExtensions ? [`  allowedExtensions: "${item.allowedExtensions}",`] : []),
    `  encryption: "${encryptionType}",`,
    ...(encryptionType === "SSE-KMS" && item.kmsKeyId ? [`  kmsKeyId: "${item.kmsKeyId}",`] : []),
    `  versioning: "${item.versioning || "Disabled"}",`,
    ...(item.enableCors
      ? [
          `  cors: {`,
          `    origins: ${JSON.stringify(item.corsOrigins ? item.corsOrigins.split(",").map((s) => s.trim()) : ["*"])},`,
          `    methods: ${JSON.stringify(corsMethodsList)},`,
          ...(item.corsMaxAge ? [`    maxAgeSeconds: ${Number(item.corsMaxAge) || 3600},`] : []),
          `  },`,
        ]
      : []),
    ...(item.lifecycleExpirationDays || item.lifecycleGlacierDays
      ? [
          `  lifecycle: {`,
          ...(item.lifecycleGlacierDays ? [`    glacierDays: ${Number(item.lifecycleGlacierDays) || 90},`] : []),
          ...(item.lifecycleExpirationDays ? [`    expirationDays: ${Number(item.lifecycleExpirationDays) || 365},`] : []),
          `  },`,
        ]
      : []),
    ...(activeTriggers.length > 0
      ? [
          `  eventTriggers: ${JSON.stringify(activeTriggers)},`,
          ...(item.eventPrefixFilter ? [`  eventPrefix: "${item.eventPrefixFilter}",`] : []),
          ...(item.eventSuffixFilter ? [`  eventSuffix: "${item.eventSuffixFilter}",`] : []),
        ]
      : []),
    `};`,
    ``,
    `// ─── 3. Upload Operation with Configured Tier, ACL & Encryption ───`,
    `export async function uploadTo${bucketPascal}(key: string, file: Buffer) {`,
    `  return await s3.send(`,
    `    new PutObjectCommand({`,
    `      Bucket: "${bucketName}",`,
    `      Key: key,`,
    `      Body: file,`,
    `      StorageClass: "${storageClass}",`,
    `      ACL: "${aclMode}",`,
    ...(sseHeader ? [`      ServerSideEncryption: "${sseHeader}",`] : []),
    ...(encryptionType === "SSE-KMS" && item.kmsKeyId ? [`      SSEKMSKeyId: "${item.kmsKeyId}",`] : []),
    `    })`,
    `  );`,
    `}`,
    ...(isPresigned
      ? [
          ``,
          `// ─── 4. Presigned Direct Upload URL Generator ───`,
          `export async function get${bucketPascal}UploadUrl(key: string) {`,
          `  const command = new PutObjectCommand({ Bucket: "${bucketName}", Key: key });`,
          `  return await getSignedUrl(s3, command, { expiresIn: ${presignedTtlSeconds} });`,
          `}`,
        ]
      : []),
    ...(item.enableCdn && item.cdnDomain
      ? [
          ``,
          `// ─── 5. CDN Distribution URL Resolver ───`,
          `export function get${bucketPascal}CdnUrl(key: string) {`,
          `  return "https://${item.cdnDomain.replace(/^https?:\/\//, "")}/${bucketName}/" + key;`,
          `}`,
        ]
      : []),
  ].join("\n");
}

export function generateConfigSpec(item: ConfigItemData): string {
  const allowedOps = Array.isArray(item.allowedOperations)
    ? item.allowedOperations
    : ["read", "write"];
  const storedTypes = Array.isArray(item.storedDataTypes)
    ? item.storedDataTypes
    : [];
  const corsMethodsList = Array.isArray(item.corsMethods)
    ? item.corsMethods
    : ["GET", "PUT", "POST", "HEAD"];
  const activeTriggers = Array.isArray(item.eventTriggers)
    ? item.eventTriggers
    : [];

  const region = item.region || "us-east-1";
  const isCustomEndpoint = Boolean(item.endpointUrl && item.endpointUrl.trim().length > 0);
  const resolvedEndpoint = isCustomEndpoint
    ? item.endpointUrl || ""
    : `https://s3.${region}.amazonaws.com`;

  const bucketName = item.name || "my-bucket";
  const storageClass = item.storageClass || "STANDARD";
  const accessKeyName = item.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyName = item.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
  const encryptionType = item.encryption || "SSE-S3";
  const accessPolicy = item.accessPolicy || "private";
  const isPresigned = Boolean(
    item.enablePresignedUrls || accessPolicy === "presigned-only",
  );
  const presignedTtlSeconds = Number(item.presignedUrlTtl) || 900;

  return JSON.stringify(
    {
      bucket: bucketName,
      provider: "s3",
      region,
      endpointUrl: isCustomEndpoint ? item.endpointUrl : resolvedEndpoint,
      endpointType: isCustomEndpoint ? "custom" : "aws-auto",
      forcePathStyle: Boolean(item.forcePathStyle),
      storageClass,
      accessPolicy,
      allowedOperations: allowedOps,
      credentials: {
        accessKeyIdEnv: accessKeyName,
        secretAccessKeyEnv: secretKeyName,
        sessionTokenEnv: item.sessionTokenEnv || null,
        roleArn: item.roleArn || null,
      },
      cors: {
        enabled: Boolean(item.enableCors),
        origins: item.corsOrigins || "*",
        methods: corsMethodsList,
        maxAge: item.corsMaxAge || null,
      },
      presignedUrls: {
        enabled: isPresigned,
        ttlSeconds: presignedTtlSeconds,
      },
      dataConstraints: {
        maxFileSize: item.maxFileSize || null,
        allowedExtensions: item.allowedExtensions || null,
        storedDataTypes: storedTypes,
      },
      cdn: {
        enabled: Boolean(item.enableCdn),
        domain: item.cdnDomain || null,
        cacheControl: item.cdnCacheControl || null,
      },
      security: {
        encryption: encryptionType,
        kmsKeyId: item.kmsKeyId || null,
        versioning: item.versioning || "Disabled",
      },
      lifecycle: {
        glacierDays: item.lifecycleGlacierDays || null,
        expirationDays: item.lifecycleExpirationDays || null,
      },
      events: {
        triggers: activeTriggers,
        prefixFilter: item.eventPrefixFilter || null,
        suffixFilter: item.eventSuffixFilter || null,
      },
    },
    null,
    2,
  );
}

export function generateEnvSnippet(item: ConfigItemData): string {
  const region = item.region || "us-east-1";
  const isCustomEndpoint = Boolean(item.endpointUrl && item.endpointUrl.trim().length > 0);
  const accessKeyName = item.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyName = item.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";

  return [
    `# ─── AWS S3 Connection ───`,
    `STORAGE_REGION=${region}`,
    ...(isCustomEndpoint ? [`STORAGE_ENDPOINT_URL=${item.endpointUrl}`] : []),
    `STORAGE_FORCE_PATH_STYLE=${Boolean(item.forcePathStyle)}`,
    ...(item.enableCdn && item.cdnDomain
      ? [`STORAGE_CDN_URL=https://${item.cdnDomain.replace(/^https?:\/\//, "")}`]
      : []),
    ``,
    `# ─── AWS Credentials ───`,
    `${accessKeyName}=AKIAIOSFODNN7EXAMPLE`,
    `${secretKeyName}=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
    ...(item.sessionTokenEnv ? [`${item.sessionTokenEnv}=AQoDYXdzEJr1EXAMPLE...`] : []),
    ...(item.roleArn ? [`AWS_ROLE_ARN=${item.roleArn}`] : []),
    ...(item.kmsKeyId ? [`AWS_KMS_KEY_ID=${item.kmsKeyId}`] : []),
  ].join("\n");
}
