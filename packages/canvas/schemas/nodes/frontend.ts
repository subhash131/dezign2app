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
  type: z.string(),
  isArray: z.boolean().optional(),
  required: z.boolean().optional(),
  defaultValue: z.any().optional(),
  description: z.string().optional(),
});

export type GlobalStoreFieldSchemaType = z.infer<typeof globalStoreFieldSchema>;

export const globalStoreActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetFieldId: z.string().optional(),
  targetFieldName: z.string().optional(),
  actionType: z.enum([
    "set",
    "append",
    "pop",
    "remove",
    "toggle",
    "increment",
    "reset",
    "populate",
    "custom",
    "mutate",
  ]),
  code: z.string().optional(),
  parameters: z.array(parameterSchema).optional(),
  connectedEndpointId: z.string().optional(),
  responseMappingMode: z.enum(["replace", "merge", "custom"]).optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  defaultManipulatorType: z.enum(["populate", "reset", "setter", "mutate", "append", "pop"]).optional(),
});

export type GlobalStoreActionSchemaType = z.infer<typeof globalStoreActionSchema>;

export const stateStoreTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  manipulatorName: z.string(),
  payload: z.any().optional(),
  expectedField: z.string().optional(),
  expectedValue: z.any().optional(),
  status: z.enum(["passed", "failed", "idle"]).optional(),
  lastRunAt: z.string().optional(),
  error: z.string().optional(),
});

export type StateStoreTestCaseSchemaType = z.infer<typeof stateStoreTestCaseSchema>;

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
    testCases: z.array(stateStoreTestCaseSchema).optional(),
    description: z.string().optional(),
    disabledDefaultManipulators: z.array(z.string()).optional(),
    deletedDefaultManipulators: z.array(z.string()).optional(),
  })
  .passthrough();

export type StateStoreNodeData = z.infer<typeof stateStoreNodeDataSchema>;
