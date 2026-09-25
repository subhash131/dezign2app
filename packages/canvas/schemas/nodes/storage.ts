import { z } from "zod";
import {
  baseNodeDataSchema,
  resourceItemSchema,
  storageOperationKindSchema,
  storageOperationParamSchema,
  storageOperationBadgeSchema,
  storageOperationFunctionSchema,
  storageOperationRefDataSchema,
  storageBucketRefDataSchema,
  storageOperationRefDataInputSchema,
  storageBucketRefDataInputSchema,
} from "./base";

export {
  storageOperationKindSchema,
  storageOperationParamSchema,
  storageOperationBadgeSchema,
  storageOperationFunctionSchema,
  storageOperationRefDataSchema,
  storageBucketRefDataSchema,
  storageOperationRefDataInputSchema,
  storageBucketRefDataInputSchema,
};

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
