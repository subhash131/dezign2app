import {
  BackendNode,
  BackendEdge,
  CustomTypeItem,
  CustomTypeField,
} from "@/types/canvas";
import { Endpoint, EndpointWithNode, Parameter } from "@workspace/canvas/types";
import { generateKeyBetween } from "fractional-indexing";
import { deriveRouteFileName, toPascalCase } from "@/lib/compiler/utils";
import { getLastIndex } from "../utils";
import {
  extractEndpointResponseFields,
  ExtractedEndpointResponseField,
} from "@/lib/utils/endpointFormGenerator";

/**
 * Normalizes field types into concrete, strictly typed TypeScript primitives.
 * Never returns 'any' or 'unknown'.
 */
function normalizeFieldType(rawType?: string): { type: string; isArray: boolean } {
  if (!rawType) return { type: "string", isArray: false };
  let trimmed = rawType.trim();
  let isArray = false;

  if (trimmed.endsWith("[]")) {
    isArray = true;
    trimmed = trimmed.slice(0, -2).trim();
  } else if (trimmed === "array") {
    return { type: "string", isArray: true };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "any" || lower === "unknown") {
    return { type: "string", isArray };
  }
  if (lower === "int" || lower === "integer" || lower === "float" || lower === "double") {
    return { type: "number", isArray };
  }
  if (lower === "bool" || lower === "boolean") {
    return { type: "boolean", isArray };
  }
  if (lower === "json" || lower === "jsonb" || lower === "object") {
    return { type: "Record<string, string | number | boolean>", isArray };
  }
  if (lower === "date" || lower === "timestamp" || lower === "timestamptz") {
    return { type: "string", isArray };
  }

  return { type: trimmed || "string", isArray };
}

/**
 * Converts endpoint definitions for a service into a list of CustomTypeItems.
 * Prioritizes success response types, request bodies, and error response types.
 * Generates concrete, strongly typed fields without 'any' or 'unknown'.
 */
export function convertEndpointsToCustomTypes(
  endpoints: Endpoint[],
  serviceName: string,
  existingTypes: CustomTypeItem[] = [],
): CustomTypeItem[] {
  const result: CustomTypeItem[] = [];
  const pascalService = toPascalCase(serviceName || "Service");

  endpoints.forEach((ep, index) => {
    const routeFileName = deriveRouteFileName(ep, index, serviceName);
    const pascalRoute = toPascalCase(routeFileName);
    const method = (ep.type || "GET").toUpperCase();
    const endpointId = ep.id || `ep-${index}`;
    const isHealthEndpoint =
      routeFileName.toLowerCase().includes("health") ||
      (ep.name && ep.name.toLowerCase().includes("health"));

    // Check if endpoint has an active streaming LangGraph step
    const hasStreamingStep = Boolean(
      ep.pipelineSteps?.some(
        (s: any) =>
          s.enabled !== false &&
          (s.type === "langgraph_invoke" || Boolean(s.langGraphTargetNodeId)) &&
          Boolean(
            s.langGraphStreamingEnabled ||
            s.langGraphStreamingProtocol === "sse" ||
            s.langGraphStreamingProtocol === "raw" ||
            (s.langGraphStreamingProtocol !== "websocket" &&
              s.langGraphStreamingProtocol !== "kafka" &&
              s.langGraphStreamingProtocol !== "redis_stream" &&
              s.langGraphStreamingEnabled !== false),
          ),
      ),
    );

    // 0. Nested types for real-time streaming (created first so parent interfaces can reference them)
    const usagePayloadTypeName = "UsagePayload";
    const toolCallTypeName = "StreamToolCall";

    if (hasStreamingStep) {
      // 0a. UsagePayload interface
      const usagePayloadTypeId = `type-endpoint-usage-${endpointId}`;
      const existingUsage = existingTypes.find(
        (t) => t.id === usagePayloadTypeId || t.name === usagePayloadTypeName,
      );
      if (!result.some((t) => t.name === usagePayloadTypeName)) {
        result.push({
          id: usagePayloadTypeId,
          name: usagePayloadTypeName,
          kind: "interface",
          description: "Token usage metrics payload for real-time stream execution",
          fields: [
            {
              id: existingUsage?.fields?.find((f) => f.name === "input_tokens")?.id || `f-usage-${endpointId}-input`,
              name: "input_tokens",
              type: "number",
              required: false,
              isArray: false,
              description: "Input / prompt tokens consumed",
            },
            {
              id: existingUsage?.fields?.find((f) => f.name === "output_tokens")?.id || `f-usage-${endpointId}-output`,
              name: "output_tokens",
              type: "number",
              required: false,
              isArray: false,
              description: "Output / completion tokens consumed",
            },
            {
              id: existingUsage?.fields?.find((f) => f.name === "total_tokens")?.id || `f-usage-${endpointId}-total`,
              name: "total_tokens",
              type: "number",
              required: false,
              isArray: false,
              description: "Total tokens consumed",
            },
            {
              id: existingUsage?.fields?.find((f) => f.name === "reasoning_tokens")?.id || `f-usage-${endpointId}-reasoning`,
              name: "reasoning_tokens",
              type: "number",
              required: false,
              isArray: false,
              description: "Reasoning / thinking tokens consumed",
            },
          ],
          isReadOnly: true,
          isExtendable: true,
        });
      }

      // 0b. StreamToolCall interface
      const toolCallTypeId = `type-endpoint-tool-call-${endpointId}`;
      const existingToolCall = existingTypes.find(
        (t) => t.id === toolCallTypeId || t.name === toolCallTypeName,
      );
      if (!result.some((t) => t.name === toolCallTypeName)) {
        result.push({
          id: toolCallTypeId,
          name: toolCallTypeName,
          kind: "interface",
          description: "Invoked tool call metadata emitted during execution",
          fields: [
            {
              id: existingToolCall?.fields?.find((f) => f.name === "id")?.id || `f-tool-${endpointId}-id`,
              name: "id",
              type: "string",
              required: false,
              isArray: false,
              description: "Tool call identifier",
            },
            {
              id: existingToolCall?.fields?.find((f) => f.name === "name")?.id || `f-tool-${endpointId}-name`,
              name: "name",
              type: "string",
              required: true,
              isArray: false,
              description: "Tool function name",
            },
            {
              id: existingToolCall?.fields?.find((f) => f.name === "args")?.id || `f-tool-${endpointId}-args`,
              name: "args",
              type: "Record<string, unknown>",
              required: false,
              isArray: false,
              description: "Arguments passed to the tool",
            },
          ],
          isReadOnly: true,
          isExtendable: true,
        });
      }
    }

    // 1. Success Response Type (CRITICAL for frontend rendering and stores)
    const responseTypeName = `${pascalService}${pascalRoute}Response`;
    const responseTypeId = `type-endpoint-response-${endpointId}`;
    const existingResponse = existingTypes.find(
      (t) => t.id === responseTypeId || t.name === responseTypeName,
    );

    const extractedFields: ExtractedEndpointResponseField[] = extractEndpointResponseFields(ep);
    let responseFields: CustomTypeField[] = [];

    if (hasStreamingStep) {
      // For streaming LangGraph endpoints, populate complete streaming response contract
      responseFields = [
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "content")?.id || `f-res-${endpointId}-content`,
          name: "content",
          type: "string",
          isArray: false,
          required: true,
          description: "Accumulated AI response content / text stream",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "token")?.id || `f-res-${endpointId}-token`,
          name: "token",
          type: "string",
          isArray: false,
          required: false,
          description: "Streamed LLM token chunk",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "node")?.id || `f-res-${endpointId}-node`,
          name: "node",
          type: "string",
          isArray: false,
          required: false,
          description: "Graph node emitting the stream event",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "reasoning")?.id || `f-res-${endpointId}-reasoning`,
          name: "reasoning",
          type: "string",
          isArray: false,
          required: false,
          description: "Model reasoning / thought trace tokens",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "threadId")?.id || `f-res-${endpointId}-threadId`,
          name: "threadId",
          type: "string",
          isArray: false,
          required: false,
          description: "Active session / conversation thread ID",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "usage")?.id || `f-res-${endpointId}-usage`,
          name: "usage",
          type: usagePayloadTypeName,
          isArray: false,
          required: false,
          description: "Token usage metrics payload",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "done")?.id || `f-res-${endpointId}-done`,
          name: "done",
          type: "boolean",
          isArray: false,
          required: true,
          description: "Stream completion indicator",
          defaultValue: "false",
        },
        {
          id: existingResponse?.fields?.find((ef) => ef.name === "streamed")?.id || `f-res-${endpointId}-streamed`,
          name: "streamed",
          type: "boolean",
          isArray: false,
          required: true,
          description: "Whether the response was streamed over SSE",
          defaultValue: "true",
        },
      ];

      // Add any additional channel fields extracted from step configuration
      extractedFields.forEach((ef) => {
        if (!responseFields.some((rf) => rf.name === ef.name)) {
          const { type, isArray } = normalizeFieldType(ef.type);
          responseFields.push({
            id: existingResponse?.fields?.find((f) => f.name === ef.name)?.id || `f-res-${endpointId}-${ef.name}`,
            name: ef.name,
            type,
            isArray,
            required: false,
            description: ef.description || `Streamed channel '${ef.name}'`,
          });
        }
      });
    } else if (extractedFields.length > 0) {
      responseFields = extractedFields.map((f, fIdx) => {
        const { type, isArray } = normalizeFieldType(f.type);
        const existingField = existingResponse?.fields?.find((ef) => ef.name === f.name);
        return {
          id: existingField?.id || `f-res-${endpointId}-${fIdx}-${f.name}`,
          name: f.name,
          type,
          isArray,
          required: true,
          description: f.description || `Response field '${f.name}'`,
          defaultValue: f.defaultValue !== undefined ? String(f.defaultValue) : undefined,
        };
      });
    } else if (ep.responseBody?.fields && ep.responseBody.fields.length > 0) {
      responseFields = ep.responseBody.fields.map((f: Parameter, fIdx: number) => {
        const { type, isArray } = normalizeFieldType(f.type);
        const fName = f.name || f.key || `field_${fIdx}`;
        const existingField = existingResponse?.fields?.find((ef) => ef.name === fName);
        return {
          id: existingField?.id || `f-res-${endpointId}-${fIdx}-${fName}`,
          name: fName,
          type,
          isArray,
          required: f.required !== false,
          description: f.description,
          defaultValue: f.defaultValue || f.value,
        };
      });
    } else if (isHealthEndpoint) {
      responseFields = [
        {
          id: `f-res-${endpointId}-status`,
          name: "status",
          type: "string",
          isArray: false,
          required: true,
          description: "Service operational status (e.g. 'ok', 'healthy')",
          defaultValue: '"ok"',
        },
        {
          id: `f-res-${endpointId}-uptime`,
          name: "uptime",
          type: "number",
          isArray: false,
          required: true,
          description: "Service uptime duration in seconds",
          defaultValue: "0",
        },
        {
          id: `f-res-${endpointId}-timestamp`,
          name: "timestamp",
          type: "string",
          isArray: false,
          required: true,
          description: "ISO timestamp of the health check inspection",
        },
      ];
    } else {
      // Concrete default response payload with explicit fields
      responseFields = [
        {
          id: `f-res-${endpointId}-success`,
          name: "success",
          type: "boolean",
          isArray: false,
          required: true,
          description: `Indicates whether the ${method} ${ep.name || "/"} operation succeeded`,
          defaultValue: "true",
        },
        {
          id: `f-res-${endpointId}-message`,
          name: "message",
          type: "string",
          isArray: false,
          required: true,
          description: `Summary message returned by ${method} ${ep.name || "/"}`,
          defaultValue: '"Operation completed successfully"',
        },
        {
          id: `f-res-${endpointId}-id`,
          name: "id",
          type: "string",
          isArray: false,
          required: false,
          description: `Identifier of the affected resource`,
        },
      ];
    }

    result.push({
      id: responseTypeId,
      name: responseTypeName,
      kind: "interface",
      description: hasStreamingStep
        ? `Real-time streaming response (SSE) for ${method} ${ep.name || "/"} in ${serviceName}`
        : `Success response (200 OK) for ${method} ${ep.name || "/"} in ${serviceName}`,
      fields: responseFields,
      isReadOnly: true,
      isExtendable: true,
    });

    // 1b. Real-time Stream Chunk Type (when endpoint has an active streaming LangGraph step)
    if (hasStreamingStep) {
      const streamChunkTypeName = `${pascalService}${pascalRoute}StreamChunk`;
      const streamChunkTypeId = `type-endpoint-stream-chunk-${endpointId}`;
      const existingChunk = existingTypes.find(
        (t) => t.id === streamChunkTypeId || t.name === streamChunkTypeName,
      );
      result.push({
        id: streamChunkTypeId,
        name: streamChunkTypeName,
        kind: "interface",
        description: `Real-time streaming event chunk for ${method} ${ep.name || "/"} in ${serviceName}`,
        fields: [
          {
            id: existingChunk?.fields?.find((f) => f.name === "token")?.id || `f-chunk-${endpointId}-token`,
            name: "token",
            type: "string",
            required: false,
            isArray: false,
            description: "Streamed LLM token chunk",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "node")?.id || `f-chunk-${endpointId}-node`,
            name: "node",
            type: "string",
            required: false,
            isArray: false,
            description: "Graph node emitting the event",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "reasoning")?.id || `f-chunk-${endpointId}-reasoning`,
            name: "reasoning",
            type: "string",
            required: false,
            isArray: false,
            description: "Model reasoning / thinking tokens",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "type")?.id || `f-chunk-${endpointId}-type`,
            name: "type",
            type: "string",
            required: false,
            isArray: false,
            description: "Stream chunk event type",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "mode")?.id || `f-chunk-${endpointId}-mode`,
            name: "mode",
            type: "string",
            required: false,
            isArray: false,
            description: "Stream mode ('messages' | 'updates' | 'values' | 'custom')",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "tool_call")?.id || `f-chunk-${endpointId}-tool-call`,
            name: "tool_call",
            type: toolCallTypeName,
            required: false,
            isArray: false,
            description: "Invoked tool call metadata",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "tool_calls")?.id || `f-chunk-${endpointId}-tool-calls`,
            name: "tool_calls",
            type: toolCallTypeName,
            required: false,
            isArray: true,
            description: "List of tool calls executed during streaming",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "usage")?.id || `f-chunk-${endpointId}-usage`,
            name: "usage",
            type: usagePayloadTypeName,
            required: false,
            isArray: false,
            description: "Token usage metrics payload",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "done")?.id || `f-chunk-${endpointId}-done`,
            name: "done",
            type: "boolean",
            required: false,
            isArray: false,
            description: "Stream completion flag",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "content")?.id || `f-chunk-${endpointId}-content`,
            name: "content",
            type: "string",
            required: false,
            isArray: false,
            description: "Accumulated AI response content / text stream",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "response")?.id || `f-chunk-${endpointId}-response`,
            name: "response",
            type: "string",
            required: false,
            isArray: false,
            description: "Accumulated AI text response",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "threadId")?.id || `f-chunk-${endpointId}-threadId`,
            name: "threadId",
            type: "string",
            required: false,
            isArray: false,
            description: "Session thread ID",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "thread_id")?.id || `f-chunk-${endpointId}-thread-id`,
            name: "thread_id",
            type: "string",
            required: false,
            isArray: false,
            description: "Session thread ID (alias)",
          },
          {
            id: existingChunk?.fields?.find((f) => f.name === "raw")?.id || `f-chunk-${endpointId}-raw`,
            name: "raw",
            type: "string",
            required: false,
            isArray: false,
            description: "Raw incoming stream event chunk",
          },
        ],
        isReadOnly: true,
        isExtendable: true,
      });
    }

    // 2. Request Body Type (for mutating endpoints)
    const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
    const bodyFields = ep.requestBody?.fields || [];
    if (isBodyMethod && (bodyFields.length > 0 || ep.requestBody?.rawJson)) {
      const bodyTypeName = `${pascalService}${pascalRoute}RequestBody`;
      const bodyTypeId = `type-endpoint-body-${endpointId}`;
      const existingBody = existingTypes.find(
        (t) => t.id === bodyTypeId || t.name === bodyTypeName,
      );

      const fields: CustomTypeField[] = bodyFields.map((f: Parameter, fIdx: number) => {
        const { type, isArray } = normalizeFieldType(f.type);
        const fName = f.name || f.key || `field_${fIdx}`;
        const existingField = existingBody?.fields?.find((ef) => ef.name === fName);
        return {
          id: existingField?.id || `f-req-${endpointId}-${fIdx}-${fName}`,
          name: fName,
          type,
          isArray,
          required: Boolean(f.required),
          description: f.description,
          defaultValue: f.defaultValue || f.value,
        };
      });

      result.push({
        id: bodyTypeId,
        name: bodyTypeName,
        kind: "interface",
        description: `Request payload for ${method} ${ep.name || "/"} in ${serviceName}`,
        fields:
          fields.length > 0
            ? fields
            : [
                {
                  id: `f-req-${endpointId}-payload`,
                  name: "payload",
                  type: "string",
                  required: true,
                  isArray: false,
                  description: "Raw request payload string",
                },
              ],
        isReadOnly: true,
        isExtendable: true,
      });
    }

    // 3. Error Response Type
    const errorTypeName = `${pascalService}${pascalRoute}ErrorResponse`;
    const errorTypeId = `type-endpoint-err-${endpointId}`;
    result.push({
      id: errorTypeId,
      name: errorTypeName,
      kind: "interface",
      description: `Error response for ${method} ${ep.name || "/"} in ${serviceName}`,
      fields: [
        { id: `f-err-${endpointId}-1`, name: "error", type: "string", required: true, isArray: false },
        { id: `f-err-${endpointId}-2`, name: "message", type: "string", required: true, isArray: false },
        { id: `f-err-${endpointId}-3`, name: "statusCode", type: "number", required: false, isArray: false },
        { id: `f-err-${endpointId}-4`, name: "details", type: "string", required: false, isArray: false },
      ],
      isReadOnly: true,
      isExtendable: true,
    });
  });

  return result;
}

/**
 * Checks whether a node is the service-derived TypesNode for a specific service.
 */
export function isNodeDerivedFromService(
  node: BackendNode,
  serviceId: string,
): boolean {
  if (node.type !== "types") return false;
  return (
    node.id === `types-service-${serviceId}` ||
    (Boolean(node.data?.isServiceEndpointSchemas) &&
      node.data?.sourceServiceId === serviceId)
  );
}

export interface BuildServiceTypesResult {
  typesNode: BackendNode;
  typesEdge: BackendEdge;
  isExistingNode: boolean;
}

/**
 * Builds or updates the companion TypesNode and Edge for a given ServiceNode.
 */
export function buildServiceTypesNodeAndEdge(
  serviceNode: BackendNode,
  endpoints: Endpoint[],
  existingNodes: BackendNode[],
  existingEdges: BackendEdge[],
  customPosition?: { x: number; y: number },
): BuildServiceTypesResult {
  const serviceId = serviceNode.id;
  const rawServiceName = serviceNode.data?.label || "Service";
  const typesNodeId = `types-service-${serviceId}`;
  const now = Date.now();

  const existingTypesNode = existingNodes.find(
    (n) => n.type === "types" && isNodeDerivedFromService(n, serviceId),
  );

  const existingTypes = existingTypesNode?.data?.types || [];
  const generatedTypes = convertEndpointsToCustomTypes(
    endpoints,
    rawServiceName,
    existingTypes,
  );

  if (existingTypesNode) {
    const updatedNode: BackendNode = {
      ...existingTypesNode,
      data: {
        ...existingTypesNode.data,
        label: `${rawServiceName} Types`,
        isServiceEndpointSchemas: true,
        sourceServiceId: serviceId,
        sourceServiceName: rawServiceName,
        serviceUpdatedAt: now,
        types: generatedTypes,
      },
    };

    const existingEdge = existingEdges.find(
      (e) =>
        (e.source === existingTypesNode.id && e.target === serviceId) ||
        (e.source === serviceId && e.target === existingTypesNode.id),
    );

    if (
      existingEdge &&
      existingEdge.source === existingTypesNode.id &&
      existingEdge.target === serviceId &&
      existingEdge.sourceHandle === "types-out" &&
      existingEdge.targetHandle === "types-in"
    ) {
      return {
        typesNode: updatedNode,
        typesEdge: existingEdge,
        isExistingNode: true,
      };
    }

    const lastEdgeIdx = getLastIndex(existingEdges);
    const typesEdgeIdx = existingEdge ? existingEdge.fractionalIndex : generateKeyBetween(lastEdgeIdx, null);
    const typesEdgeId = existingEdge ? existingEdge.id : `edge-types-${existingTypesNode.id}-${serviceId}`;
    const typesEdge: BackendEdge = {
      id: typesEdgeId,
      source: existingTypesNode.id,
      sourceHandle: "types-out",
      target: serviceId,
      targetHandle: "types-in",
      type: "type-reference",
      fractionalIndex: typesEdgeIdx,
      data: { label: "contracts", isTypeReference: true },
    };

    return {
      typesNode: updatedNode,
      typesEdge,
      isExistingNode: true,
    };
  }

  // Position companion TypesNode to the left of the ServiceNode
  const defaultPos = {
    x: Math.max(40, (serviceNode.position?.x || 100) - 360),
    y: serviceNode.position?.y || 100,
  };
  const typesPos = customPosition ?? defaultPos;

  const lastNodeIdx = getLastIndex(existingNodes);
  const typesIndex = generateKeyBetween(lastNodeIdx, null);

  const typesNode: BackendNode = {
    id: typesNodeId,
    type: "types",
    position: typesPos,
    fractionalIndex: typesIndex,
    selected: false,
    data: {
      label: `${rawServiceName} Types`,
      scope: "local",
      targetServiceId: serviceId,
      isServiceEndpointSchemas: true,
      sourceServiceId: serviceId,
      sourceServiceName: rawServiceName,
      serviceUpdatedAt: now,
      types: generatedTypes,
    },
  };

  const lastEdgeIdx = getLastIndex(existingEdges);
  const typesEdgeIdx = generateKeyBetween(lastEdgeIdx, null);
  const typesEdgeId = `edge-types-${typesNodeId}-${serviceId}`;
  const typesEdge: BackendEdge = {
    id: typesEdgeId,
    source: typesNodeId,
    sourceHandle: "types-out",
    target: serviceId,
    targetHandle: "types-in",
    type: "type-reference",
    fractionalIndex: typesEdgeIdx,
    data: { label: "contracts", isTypeReference: true },
  };

  return { typesNode, typesEdge, isExistingNode: false };
}

export interface SyncServiceTypesResult {
  nodes: BackendNode[];
  edges: BackendEdge[];
  updatedTypesNode?: BackendNode;
  newEdge?: BackendEdge;
}

/**
 * Synchronizes the companion TypesNode for a given service after endpoint changes.
 */
export function syncServiceTypesNode(
  serviceId: string,
  nodes: BackendNode[],
  edges: BackendEdge[],
  endpoints: EndpointWithNode[],
): SyncServiceTypesResult {
  const serviceNode = nodes.find((n) => n.id === serviceId && n.type === "service");
  if (!serviceNode) {
    return { nodes, edges };
  }

  const serviceEndpoints = endpoints.filter((e) => e.nodeId === serviceId);
  const companionRes = buildServiceTypesNodeAndEdge(
    serviceNode,
    serviceEndpoints,
    nodes,
    edges,
  );

  let nextNodes = nodes;
  if (companionRes.isExistingNode) {
    nextNodes = nodes.map((n) =>
      n.id === companionRes.typesNode.id ? companionRes.typesNode : n,
    );
  } else {
    nextNodes = [...nodes, companionRes.typesNode];
  }

  let nextEdges = edges;
  let newEdge: BackendEdge | undefined = undefined;
  if (!edges.some((e) => e.id === companionRes.typesEdge.id)) {
    nextEdges = [...edges, companionRes.typesEdge];
    newEdge = companionRes.typesEdge;
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    updatedTypesNode: companionRes.typesNode,
    newEdge,
  };
}
