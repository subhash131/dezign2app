import { z } from "zod";
import { processingOperationEnum } from "./primitives";

export const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
});

export const parameterInputSchema = parameterSchema.extend({
  id: z.string().optional(),
});

export const schemaModelSchema = z.object({
  id: z.string(),
  fields: z.array(parameterSchema),
});

export const schemaModelInputSchema = z.object({
  id: z.string().optional(),
  fields: z.array(parameterInputSchema),
});

export const processingStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  operation: processingOperationEnum.optional(),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type ProcessingStep = z.infer<typeof processingStepSchema>;

export const processingStepInputSchema = processingStepSchema.extend({
  id: z.string().optional(),
});

export const architectureMetadataSchema = z.object({
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  createdByAI: z.boolean().optional(),
});
