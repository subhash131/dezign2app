import { z } from "zod";
import { EndpointInputType } from "../types";
import {
  parameterSchema,
  schemaModelSchema,
  processingStepSchema,
  architectureMetadataSchema,
} from "./shared";
import { publishedEventSchema, publishedEventInputSchema } from "./events";

export const endpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  authRuleId: z.string().optional(),
  databaseNodeIds: z.array(z.string()).optional(),
  databaseNodeId: z.string().optional(),
  headers: z.array(parameterSchema).optional(),
  pathParams: z.array(parameterSchema).optional(),
  queryParams: z.array(parameterSchema).optional(),
  requestBody: schemaModelSchema.optional(),
  responseBody: schemaModelSchema.optional(),
  simulationOutput: z.unknown().optional(),
  processingSteps: z.array(processingStepSchema).optional(),
  publishedEvents: z.array(publishedEventSchema).optional(),
  metadata: architectureMetadataSchema.optional(),
  // Frontend-specific legacy fields
  params: z.array(parameterSchema).optional(),
  body: z.string().optional(),
  businessLogic: z.string().optional(),
  summary: z.string().optional(),
  requiredRoles: z.array(z.string()).optional(),
  requiredScopes: z.array(z.string()).optional(),
  audience: z.string().optional(),
  output: z.string().optional(),
});
export type Endpoint = z.infer<typeof endpointSchema>;

export const endpointInputSchema: z.ZodType<EndpointInputType> = z.object({
  id: z.string().optional(),
  name: z.string().describe("Endpoint path (e.g., /api/users)"),
  type: z.string().describe("HTTP method (GET, POST, etc.)"),
  authRuleId: z.string().optional().describe("Reusable API gateway auth rule ID, when this endpoint is routed through a gateway."),
  headers: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Request headers. Use [] when none are required."),
  pathParams: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Path parameters, such as id in /products/{id}. Use [] when none."),
  queryParams: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Query parameters such as page, limit, or q. Use [] when none."),
  requestBody: z.object({
    id: z.string().optional(),
    fields: z.array(z.object({
      id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
      description: z.string().optional(),
    }).passthrough()),
    rawJson: z.string().optional(),
  }).passthrough().describe("Request body schema. Use fields: [] only for endpoints with no body."),
  responseBody: z.object({
    id: z.string().optional(),
    fields: z.array(z.object({
      id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
      description: z.string().optional(),
    }).passthrough()),
    rawJson: z.string().optional(),
  }).passthrough().describe("Response body schema; define the actual returned fields."),
  simulationOutput: z.unknown().optional().describe("Fixture returned by this endpoint during simulation; passed unchanged to the next connected endpoint."),
  processingSteps: z.array(z.object({
    id: z.string().optional(),
    text: z.string(),
    operation: z.string().optional(),
    config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))])).optional(),
  }).passthrough()).describe("Executable request-processing steps in order."),
  output: z.string().optional().describe("Short response description; do not use this instead of responseBody."),
  businessLogic: z.string().optional().describe("Human-readable purpose of the endpoint."),
  summary: z.string().optional().describe("Summary of what the endpoint does."),
  requiredRoles: z.array(z.string()).optional().describe("List of roles required to access this endpoint."),
  requiredScopes: z.array(z.string()).optional().describe("List of scopes required to access this endpoint."),
  audience: z.string().optional().describe("The intended audience for this endpoint."),
  databaseNodeIds: z.array(z.string()).optional().describe(
    "IDs of db_ref nodes this endpoint reads from or writes to. REQUIRED whenever this endpoint uses a database; one endpoint may target multiple tables."
  ),
  databaseNodeId: z.string().optional().describe(
    "Single db_ref node ID this endpoint uses; prefer databaseNodeIds when there is more than one."
  ),
  publishedEvents: z.array(publishedEventInputSchema).optional(),
}) as z.ZodType<EndpointInputType>;
