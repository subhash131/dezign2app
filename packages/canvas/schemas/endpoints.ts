import { z } from "zod";
import { EndpointInputType } from "../types";
import {
  parameterSchema,
  responseFieldSchema,
  responseFieldInputSchema,
  schemaModelSchema,
  processingStepSchema,
  architectureMetadataSchema,
  pipelineStepSchema,
  pipelineStepInputSchema,
} from "./shared";
import { publishedEventSchema, publishedEventInputSchema } from "./events";
import {
  simulationTestCaseSchema,
  simulationTestCaseInputSchema,
} from "./simulation";
import {
  INTER_SERVICE_PROTOCOL_HTTP,
  INTER_SERVICE_PROTOCOL_GRPC,
} from "../constants";

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
  errorResponseBody: schemaModelSchema.optional(),
  simulationOutput: z.unknown().optional(),
  testCases: z.array(simulationTestCaseSchema).optional(),
  processingSteps: z.array(processingStepSchema).optional(),
  /** Ordered pipeline steps with explicit per-argument field bindings */
  pipelineSteps: z.array(pipelineStepSchema).optional(),
  publishedEvents: z.array(publishedEventSchema).optional(),
  metadata: architectureMetadataSchema.optional(),
  // Frontend-specific legacy fields
  params: z.array(parameterSchema).optional(),
  body: z.string().optional(),
  code: z.string().optional(),
  businessLogic: z.string().optional(),
  logicMode: z.enum(["natural_language", "code"]).optional(),
  prompt: z.string().optional(),
  summary: z.string().optional(),
  route: z.string().optional(),
  connectedStorageNodeId: z.string().optional(),
  uploadMaxFileSizeMb: z.number().optional(),
  uploadAcceptedMimeTypes: z.string().optional(),
  requiredRoles: z.array(z.string()).optional(),
  requiredScopes: z.array(z.string()).optional(),
  audience: z.string().optional(),
  crudOperations: z
    .record(z.string(), z.array(z.string()))
    .optional(),
  crudExplanations: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  dbFunctionNames: z.array(z.string()).optional(),
  responseMode: z.enum(["field_builder", "raw_json", "custom_expression", "schema_builder", "inferred"]).optional(),
  responseFields: z.array(responseFieldSchema).optional(),
  responseExpression: z.string().optional(),
  output: z.string().optional(),
  interServiceProtocol: z
    .enum([INTER_SERVICE_PROTOCOL_HTTP, INTER_SERVICE_PROTOCOL_GRPC])
    .optional(),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional(),
  requireAuth: z.boolean().optional(),
});
export type Endpoint = z.infer<typeof endpointSchema>;


export const endpointInputSchema: z.ZodType<EndpointInputType> = z.object({
  id: z.string().optional(),
  name: z.string().describe("Endpoint path (e.g., /api/users)"),
  type: z.string().describe("HTTP method (GET, POST, etc.)"),
  authRuleId: z
    .string()
    .optional()
    .describe(
      "Reusable API gateway auth rule ID, when this endpoint is routed through a gateway.",
    ),
  headers: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional(),
        defaultValue: z.string().optional(),
      }),
    )
    .describe("Request headers. Use [] when none are required."),
  pathParams: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional(),
        defaultValue: z.string().optional(),
      }),
    )
    .describe(
      "Path parameters, such as id in /products/{id}. Use [] when none.",
    ),
  queryParams: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional(),
        defaultValue: z.string().optional(),
      }),
    )
    .describe("Query parameters such as page, limit, or q. Use [] when none."),
  requestBody: z
    .object({
      id: z.string().optional(),
      fields: z.array(
        z
          .object({
            id: z.string().optional(),
            name: z.string(),
            type: z.string(),
            required: z.boolean(),
            description: z.string().optional(),
          })
          .passthrough(),
      ),
      rawJson: z.string().optional(),
    })
    .passthrough()
    .describe(
      "Request body schema. Use fields: [] only for endpoints with no body.",
    ),
  responseBody: z
    .object({
      id: z.string().optional(),
      fields: z.array(
        z
          .object({
            id: z.string().optional(),
            name: z.string(),
            type: z.string(),
            required: z.boolean(),
            description: z.string().optional(),
          })
          .passthrough(),
      ),
      rawJson: z.string().optional(),
    })
    .passthrough()
    .describe("Response body schema; define the actual returned fields."),
  errorResponseBody: z
    .object({
      id: z.string().optional(),
      fields: z.array(
        z
          .object({
            id: z.string().optional(),
            name: z.string(),
            type: z.string(),
            required: z.boolean(),
            description: z.string().optional(),
          })
          .passthrough(),
      ),
      rawJson: z.string().optional(),
    })
    .passthrough()
    .optional()
    .describe("Error response body schema for 4xx/5xx failures."),
  simulationOutput: z
    .unknown()
    .optional()
    .describe(
      "Fixture returned by this endpoint during simulation; passed unchanged to the next connected endpoint.",
    ),
  testCases: z
    .array(simulationTestCaseInputSchema)
    .optional()
    .describe(
      "Optional list of test cases/scenarios for verifying endpoint implementation.",
    ),
  processingSteps: z
    .array(
      z
        .object({
          id: z.string().optional(),
          text: z.string(),
          operation: z.string().optional(),
          config: z
            .record(
              z.union([
                z.string(),
                z.number(),
                z.boolean(),
                z.null(),
                z.record(
                  z.union([z.string(), z.number(), z.boolean(), z.null()]),
                ),
              ]),
            )
            .optional(),
        })
        .passthrough(),
    )
    .describe("Executable request-processing steps in order."),
  output: z
    .string()
    .optional()
    .describe(
      "Short response description; do not use this instead of responseBody.",
    ),
  businessLogic: z
    .string()
    .optional()
    .describe("Human-readable purpose of the endpoint."),
  code: z
    .string()
    .optional()
    .describe("Executable custom code logic for the endpoint."),
  summary: z.string().optional().describe("Summary of what the endpoint does."),
  requiredRoles: z
    .array(z.string())
    .optional()
    .describe("List of roles required to access this endpoint."),
  requiredScopes: z
    .array(z.string())
    .optional()
    .describe("List of scopes required to access this endpoint."),
  audience: z
    .string()
    .optional()
    .describe("The intended audience for this endpoint."),
  databaseNodeIds: z
    .array(z.string())
    .optional()
    .describe(
      "IDs of db_ref nodes this endpoint reads from or writes to. REQUIRED whenever this endpoint uses a database; one endpoint may target multiple tables.",
    ),
  databaseNodeId: z
    .string()
    .optional()
    .describe(
      "Single db_ref node ID this endpoint uses; prefer databaseNodeIds when there is more than one.",
    ),
  publishedEvents: z.array(publishedEventInputSchema).optional(),
  responseMode: z.enum(["field_builder", "raw_json", "custom_expression", "schema_builder", "inferred"]).optional(),
  responseFields: z.array(responseFieldInputSchema).optional(),
  responseExpression: z
    .string()
    .optional()
    .describe("Dynamic expression or variable to return as response payload (e.g. dbResult, createdUser)."),
  requestBodyMode: z
    .enum(["field_builder", "raw_json"])
    .optional()
    .describe("UI mode for editing the request body schema: field_builder (structured fields) or raw_json (JSON textarea)."),
  requireAuth: z
    .boolean()
    .optional()
    .describe("Whether Authorization: Bearer <token> header validation/forwarding is enabled for this endpoint (defaults to true). Set to false to disable auth for internal/unauthenticated calls."),
  /** Ordered pipeline steps with explicit per-argument field bindings */
  pipelineSteps: z.array(pipelineStepInputSchema).optional().describe("Ordered pipeline steps that define the exact data flow through this endpoint, with explicit field-level input bindings per argument."),
}) as z.ZodType<EndpointInputType>;
