import { z } from "zod";
import { baseNodeDataSchema } from "./base";
import { parameterSchema, parameterInputSchema } from "../shared";

export const hookNodeDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    hookName: z.string().optional(),
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetWebAppId: z.string().optional(),
    targetPageId: z.string().optional(),
    targetEndpointId: z.string().optional(),
    targetEventId: z.string().optional(),
    hookRef: z.string().optional(),
    hookType: z.enum(["query", "mutation", "subscription", "custom"]).optional().default("query"),
    inputParams: z.array(parameterSchema).optional(),
    returnSchema: z.array(parameterSchema).optional(),
    logicMode: z.enum(["natural_language", "code"]).optional().default("code"),
    prompt: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough();

export type HookNodeData = z.infer<typeof hookNodeDataSchema>;

export const hookNodeDataInputSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    hookName: z.string().optional(),
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetWebAppId: z.string().optional(),
    targetPageId: z.string().optional(),
    targetEndpointId: z.string().optional(),
    targetEventId: z.string().optional(),
    hookRef: z.string().optional(),
    hookType: z.enum(["query", "mutation", "subscription", "custom"]).optional(),
    inputParams: z.array(parameterInputSchema).optional(),
    returnSchema: z.array(parameterInputSchema).optional(),
    logicMode: z.enum(["natural_language", "code"]).optional(),
    prompt: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough();

export const hookRefDataSchema = baseNodeDataSchema
  .extend({
    hookRef: z.string().optional(),
    targetWebAppId: z.string().optional(),
    targetPageId: z.string().optional(),
    targetPageIds: z.array(z.string()).optional(),
  })
  .passthrough();

export type HookRefData = z.infer<typeof hookRefDataSchema>;

export const globalStoreFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  defaultValue: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .optional(),
  description: z.string().optional(),
});

export type GlobalStoreFieldSchemaType = z.infer<typeof globalStoreFieldSchema>;

export const globalStoreActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetFieldId: z.string().optional(),
  actionType: z.enum(["set", "append", "remove", "toggle", "custom"]),
});

export type GlobalStoreActionSchemaType = z.infer<typeof globalStoreActionSchema>;

export const stateStoreNodeDataSchema = baseNodeDataSchema
  .extend({
    storeName: z.string().optional(),
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetWebAppId: z.string().optional(),
    targetPageId: z.string().optional(),
    storage: z
      .enum(["memory", "localStorage", "sessionStorage"])
      .optional()
      .default("memory"),
    fields: z.array(globalStoreFieldSchema).optional(),
    actions: z.array(globalStoreActionSchema).optional(),
    description: z.string().optional(),
  })
  .passthrough();

export type StateStoreNodeData = z.infer<typeof stateStoreNodeDataSchema>;
