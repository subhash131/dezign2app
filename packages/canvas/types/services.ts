import type { Endpoint, NodeDependencyItem } from "../schemas";
import type { InterServiceProtocol } from "../constants";
import type { UIEventItem, Schema, Parameter } from "./simulation";
import type { PipelineStepDraft } from "./pipeline";

export type { NodeDependencyItem };

export interface TransformerTestCase {
  id: string;
  label: string;
  inputs: Record<string, unknown>;
  lastOutput?: unknown;
  lastError?: string;
  lastRunAt?: string;
}

export interface TransformerPackageImport {
  id: string;
  packageName: string;
  namedImports?: string[];
  defaultImport?: string;
  namespaceImport?: string;
  isTypeOnly?: boolean;
}

/**
 * A small, pure data-transformation helper function.
 * 3-section model: Input | Logic | Return.
 * Scope: "local" means compiled into this service's src/helpers/.
 *        "global" means compiled into packages/transformers.
 */
export interface TransformerHelperNodeData {
  id: string;
  name: string;             // camelCase function name, e.g. slugifyProductInput
  description?: string;
  scope: "global" | "local";
  targetServiceId?: string;
  targetWebPageId?: string;
  targetActionId?: string;
  targetActionIds?: string[]; // For local scope, which service this belongs to
  targetEndpointId?: string; // Optional: specific endpoint within the service

  // Section 1: Input
  inputSchema: {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }[];
  inputSchemaMode?: "field_builder" | "raw_json";
  inputSchemaRawJson?: string;

  // Section 2: Logic
  logicMode: "natural_language" | "code";
  prompt?: string;   // NL description of the transformation
  code?: string;     // TypeScript function body (just the return expression, no function wrapper)

  // Section 3: Return
  returnSchema: {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }[];
  returnSchemaMode?: "field_builder" | "raw_json";
  returnSchemaRawJson?: string;

  isAsync?: boolean;
  importedTransformerIds?: string[];
  packageImports?: TransformerPackageImport[];
  customDependencies?: NodeDependencyItem[];
}

/** Service / web-client node fields — endpoints, routing, CORS, etc. (canvas type). */
export interface PublishedEventItem {
  id: string;
  name: string;
  description?: string;
  schema?: string;
  version?: string;
  targetNodeId?: string;
  brokerNodeId?: string;
  messagingResourceId?: string;
  topic?: string;
  payloadSchema?: Schema;
  pipelineSteps?: PipelineStepDraft[];
}

export interface ConsumedEventItem {
  id: string;
  name: string;
  description?: string;
  schema?: string;
  retryPolicy?: string;
  version?: string;
  handlerLogic?: string;
  targetNodeId?: string;
  brokerNodeId?: string;
  messagingResourceId?: string;
  topic?: string;
  payloadSchema?: Schema;
  pipelineSteps?: PipelineStepDraft[];
  nodeId?: string;
  variant?: "consume" | "publish";
}

export interface CanvasServiceServerConfig {
  port?: string | number;
  grpcPort?: string | number;
  cors?: boolean;
  corsOrigins?: string;
  rateLimit?: string;
  interServiceProtocol?: InterServiceProtocol | string;
}

export interface CanvasServiceNodeData {
  serviceFolder?: string;
  baseUrl?: string;
  cors?: boolean;
  corsOrigins?: string;
  rateLimit?: string;
  timeout?: string | number;
  port?: string | number;
  grpcPort?: string;
  interServiceProtocol?: InterServiceProtocol;
  server?: CanvasServiceServerConfig;
  serverConfig?: CanvasServiceServerConfig;
  endpoints?: Endpoint[];
  enableWebSocket?: boolean;
  enableSse?: boolean;
  enableRealtime?: boolean;

  isRoot?: boolean;
  isLayout?: boolean;
  layoutSidebarInitialized?: boolean;
  layoutTopbarInitialized?: boolean;
  isAuthPage?: boolean;
  routeGroup?: string;
  routeGroups?: {
    id: string;
    name: string;
    basePath: string;
    endpoints: Endpoint[];
  }[];
  // Graph-view event/logic lists (for web pages and services)
  events?: UIEventItem[] | { id: string; name: string }[];
  inputs?: { id: string; name: string }[];
  logic?: { id: string; name: string }[];
  outputs?: { id: string; name: string }[];
  publishedEvents?: PublishedEventItem[];
  consumedEvents?: ConsumedEventItem[];
  /** Local data-transformation helper functions attached to this service */
  transformerHelpers?: TransformerHelperNodeData[];
  customDependencies?: NodeDependencyItem[];
  expandedStepStacks?: string[];
  envVars?: Array<{ id: string; name: string; description?: string }>;
}

/** Standalone transformer node fields for canvas graph view. */
export interface CanvasTransformerNodeData {
  functionName?: string;
  scope?: "global" | "local";
  isGlobal?: boolean;
  targetServiceId?: string;
  targetWebPageId?: string;
  targetActionId?: string;
  targetActionIds?: string[];
  targetEndpointId?: string;
  targetEndpointIds?: string[];
  targetEventId?: string;
  targetEventIds?: string[];
  inputSchema?: {
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }[];
  inputSchemaMode?: "field_builder" | "raw_json";
  inputSchemaRawJson?: string;
  logicMode?: "natural_language" | "code";
  prompt?: string;
  code?: string;
  returnSchema?: Parameter[];
  returnSchemaMode?: "field_builder" | "raw_json";
  returnSchemaRawJson?: string;
  isAsync?: boolean;
  transformerHelpers?: TransformerHelperNodeData[];
  importedTransformerIds?: string[];
  packageImports?: TransformerPackageImport[];
  customDependencies?: NodeDependencyItem[];
  transformerTestCases?: TransformerTestCase[];
}

/** Transformer reference node fields (canvas type). */
export interface CanvasTransformerRefNodeData {
  transformerRef?: string;
  targetServiceId?: string;
  targetWebPageId?: string;
  targetActionId?: string;
  targetActionIds?: string[];
  targetEndpointId?: string;
  targetEndpointIds?: string[];
  targetEventId?: string;
  targetEventIds?: string[];
}
