import { z } from "zod";
import { schemaModelSchema } from "../shared";
import {
  ALL_TECH_STACK_VALUES,
  ALL_TECH_VERSION_VALUES,
  ALL_DATABASE_ENGINE_VALUES,
  ALL_DATABASE_ENGINE_VERSION_VALUES,
} from "../../techStack";

export const envVarItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const baseNodeDataSchema = z.object({
  label: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  graphPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  parentId: z.string().optional(),
  targetServiceId: z.string().optional(),
  serviceNodeId: z.string().optional(),
  style: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  techStack: z.enum(ALL_TECH_STACK_VALUES).optional(),
  techVersion: z.enum(ALL_TECH_VERSION_VALUES).optional(),
  dbEngine: z.enum(ALL_DATABASE_ENGINE_VALUES).optional(),
  dbEngineVersion: z.enum(ALL_DATABASE_ENGINE_VERSION_VALUES).optional(),
  color: z.string().optional(),
  pageSourceCode: z.string().optional(),
  aiEditing: z.boolean().optional(),
  envVars: z.array(envVarItemSchema).optional(),
});

export const resourceItemSchema = z.object({
  id: z.string().default(""),
  name: z.string(),
  payloadSchema: schemaModelSchema.optional(),
  kind: z.string().optional(),
  storageType: z.string().optional(),
  storageTypeOther: z.string().optional(),
  storedDataTypes: z.array(z.string()).optional(),
  storedDataTypesOther: z.string().optional(),
  accessPolicy: z.string().optional(),
  allowedOperations: z.array(z.string()).optional(),
  maxFileSize: z.string().optional(),
  allowedMimeTypes: z.string().optional(),
  allowedExtensions: z.string().optional(),
  enablePresignedUrls: z.boolean().optional(),
  presignedUrlTtl: z.string().optional(),
  enableDirectUpload: z.boolean().optional(),
  enableCors: z.boolean().optional(),
  corsOrigins: z.string().optional(),
  corsMethods: z.array(z.string()).optional(),
  corsHeaders: z.string().optional(),
  corsMaxAge: z.string().optional(),
  enableCdn: z.boolean().optional(),
  cdnDomain: z.string().optional(),
  cdnCacheControl: z.string().optional(),
  enableMetadata: z.boolean().optional(),
  storageClass: z.string().optional(),
  region: z.string().optional(),
  endpointUrl: z.string().optional(),
  accessKeyIdEnv: z.string().optional(),
  secretAccessKeyEnv: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionTokenEnv: z.string().optional(),
  roleArn: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  versioning: z.string().optional(),
  encryption: z.string().optional(),
  kmsKeyId: z.string().optional(),
  lifecycleExpirationDays: z.string().optional(),
  lifecycleGlacierDays: z.string().optional(),
  eventTriggers: z.array(z.string()).optional(),
  eventPrefixFilter: z.string().optional(),
  eventSuffixFilter: z.string().optional(),
  ttl: z.string().optional(),
  cacheEviction: z.string().optional(),
  cacheDataType: z.string().optional(),
  keyPrefix: z.string().optional(),
  description: z.string().optional(),
  namespace: z.string().optional(),
  keyPattern: z.string().optional(),
  cacheStrategy: z.string().optional(),
  sourceOfTruth: z.string().optional(),
  invalidationRules: z.string().optional(),
  compression: z.string().optional(),
  serialization: z.string().optional(),
  maxObjectSize: z.string().optional(),
  persistence: z.string().optional(),
  replication: z.string().optional(),
  storageOperations: z.array(z.any()).optional(),
  publishedWhen: z.string().optional(),
  handlerLogic: z.string().optional(),
  /**
   * Pipeline steps stored as untyped any[] here to avoid zodToConvex
   * stack overflow from the recursive z.lazy() pipelineStepSchema.
   * Full typing is enforced at the endpoint/event level.
   */
  pipelineSteps: z.array(z.any()).optional(),
  retryPolicy: z.string().optional(),
  maxRetries: z.number().optional(),
  deadLetterQueue: z.string().optional(),
  isIdempotent: z.boolean().optional(),
  version: z.string().optional(),
  category: z.string().optional(),
  delivery: z.string().optional(),
  brokerNodeId: z.string().optional(),
  messagingResourceId: z.string().optional(),
  schema: z.string().optional(),
  _legacyName: z.string().optional(),
});


export const simpleDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
  })
  .strict();

export const dbRefDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    tableRef: z.string().optional(),
    databaseId: z.string().optional(),
    targetServiceId: z.string().optional(),
    serviceNodeId: z.string().optional(),
    graphPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  })
  .strict();

export const dbRefDataInputSchema = dbRefDataSchema;

export const storageOperationKindSchema = z.enum([
  "presign_upload",
  "presign_download",
  "upload",
  "download",
  "delete",
  "batch_delete",
  "list",
  "exists",
  "copy",
]);

export const storageOperationParamSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
});

export const storageOperationBadgeSchema = z.object({
  label: z.string(),
  colorClass: z.string(),
});

export const storageOperationFunctionSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string().optional(),
  kind: storageOperationKindSchema,
  description: z.string().optional(),
  signature: z.string().optional(),
  returnType: z.string().optional(),
  params: z.array(storageOperationParamSchema).optional(),
  badge: storageOperationBadgeSchema.optional(),
  enabled: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  code: z.string().optional(),
  defaultBucket: z.string().optional(),
});

export const storageOperationRefDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    storageNodeId: z.string().optional(),
    storageProvider: z.string().optional(),
    bucketId: z.string().optional(),
    bucketName: z.string().optional(),
    operationId: z.string().optional(),
    targetServiceId: z.string().optional(),
    serviceNodeId: z.string().optional(),
    graphPosition: z.object({ x: z.number(), y: z.number() }).optional(),
    storageOperations: z.array(storageOperationFunctionSchema).optional(),
  });

export const storageBucketRefDataSchema = storageOperationRefDataSchema;
export const storageOperationRefDataInputSchema = storageOperationRefDataSchema;
export const storageBucketRefDataInputSchema = storageBucketRefDataSchema;

