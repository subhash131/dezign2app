import { z } from "zod";
import { baseNodeDataSchema } from "./base";
import { transformerHelperSchema, transformerHelperInputSchema } from "../shared";
import { nodeDependencyItemSchema, nodeDependencyItemInputSchema } from "./services";

export const transformerParameterSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional().default(true),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  enabled: z.boolean().optional(),
  enumValues: z.array(z.string()).optional(),
  isArray: z.boolean().optional(),
  nestedFields: z.array(z.any()).optional(),
});
export type TransformerParameter = z.infer<typeof transformerParameterSchema>;

export const transformerParameterInputSchema = transformerParameterSchema.extend({
  name: z.string().optional(),
  type: z.string().optional(),
  required: z.boolean().optional(),
});

export const transformerNodeDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    functionName: z.string().optional(),
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetServiceId: z.string().optional(),
    targetWebPageId: z.string().optional(),
    targetActionId: z.string().optional(),
    targetActionIds: z.array(z.string()).optional(),
    targetEndpointId: z.string().optional(),
    targetEndpointIds: z.array(z.string()).optional(),
    targetEventId: z.string().optional(),
    targetEventIds: z.array(z.string()).optional(),
    transformerRef: z.string().optional(),
    inputSchemaMode: z.enum(["field_builder", "raw_json"]).optional(),
    inputSchemaRawJson: z.string().optional(),
    inputSchema: z.array(transformerParameterSchema).optional(),
    logicMode: z.enum(["natural_language", "code"]).optional().default("code"),
    prompt: z.string().optional(),
    code: z.string().optional(),
    returnSchemaMode: z.enum(["field_builder", "raw_json"]).optional(),
    returnSchemaRawJson: z.string().optional(),
    returnSchema: z.array(transformerParameterSchema).optional(),
    isAsync: z.boolean().optional().default(false),
    transformerHelpers: z.array(transformerHelperSchema).optional(),
    importedTransformerIds: z.array(z.string()).optional(),
    packageImports: z
      .array(
        z.object({
          id: z.string(),
          packageName: z.string(),
          namedImports: z.array(z.string()).optional(),
          defaultImport: z.string().optional(),
          namespaceImport: z.string().optional(),
          isTypeOnly: z.boolean().optional(),
        }),
      )
      .optional(),
    returnType: z.string().optional(),
    returnTypeMode: z.string().optional(),
    customDependencies: z.array(nodeDependencyItemSchema).optional(),
  })
  .passthrough();
export type TransformerNodeData = z.infer<typeof transformerNodeDataSchema>;

export const transformerNodeDataInputSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    functionName: z.string().optional(),
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetServiceId: z.string().optional(),
    targetWebPageId: z.string().optional(),
    targetActionId: z.string().optional(),
    targetActionIds: z.array(z.string()).optional(),
    targetEndpointId: z.string().optional(),
    targetEndpointIds: z.array(z.string()).optional(),
    targetEventId: z.string().optional(),
    targetEventIds: z.array(z.string()).optional(),
    transformerRef: z.string().optional(),
    inputSchemaMode: z.enum(["field_builder", "raw_json"]).optional(),
    inputSchemaRawJson: z.string().optional(),
    inputSchema: z.array(transformerParameterInputSchema).optional(),
    logicMode: z.enum(["natural_language", "code"]).optional(),
    prompt: z.string().optional(),
    code: z.string().optional(),
    returnSchemaMode: z.enum(["field_builder", "raw_json"]).optional(),
    returnSchemaRawJson: z.string().optional(),
    returnSchema: z.array(transformerParameterInputSchema).optional(),
    isAsync: z.boolean().optional(),
    transformerHelpers: z.array(transformerHelperInputSchema).optional(),
    importedTransformerIds: z.array(z.string()).optional(),
    returnType: z.string().optional(),
    returnTypeMode: z.string().optional(),
    customDependencies: z.array(nodeDependencyItemInputSchema).optional(),
  })
  .passthrough();

export const transformerRefDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    transformerRef: z.string().optional(),
    targetServiceId: z.string().optional(),
    targetWebPageId: z.string().optional(),
    targetActionId: z.string().optional(),
    targetActionIds: z.array(z.string()).optional(),
    targetEndpointId: z.string().optional(),
    targetEndpointIds: z.array(z.string()).optional(),
    targetEventId: z.string().optional(),
    targetEventIds: z.array(z.string()).optional(),
    graphPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  })
  .passthrough();
export type TransformerRefData = z.infer<typeof transformerRefDataSchema>;

export const transformerRefDataInputSchema = transformerRefDataSchema;
