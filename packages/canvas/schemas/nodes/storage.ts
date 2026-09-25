import { z } from "zod";
import { baseNodeDataSchema, resourceItemSchema } from "./base";

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

export const storageDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    buckets: z.array(resourceItemSchema).optional(),
    storageProvider: z.string().optional(),
    storageProviderOther: z.string().optional(),
    defaultRegion: z.string().optional(),
    endpointUrl: z.string().optional(),
    cdnUrl: z.string().optional(),
    accessPolicy: z.string().optional(),
    publicAccess: z.boolean().optional(),
    versioning: z.boolean().optional(),
    encryption: z.string().optional(),
    corsEnabled: z.boolean().optional(),
    accessKeyIdEnv: z.string().optional(),
    secretAccessKeyEnv: z.string().optional(),
    sessionTokenEnv: z.string().optional(),
    roleArn: z.string().optional(),
    forcePathStyle: z.boolean().optional(),
    kmsKeyId: z.string().optional(),
    storageOperations: z.array(storageOperationFunctionSchema).optional(),
  })
  .strict();
