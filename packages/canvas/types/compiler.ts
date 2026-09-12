import type { ReusableFunction, BackendNode } from "./nodes";
import type { BackendEdge } from "./edges";
import type { Endpoint } from "../schemas";

export interface ServiceInfo {
  id: string;
  name: string;
  folderName: string;
}

export interface WebClientInfo {
  id: string;
  name: string;
  folderName: string;
}

export type WebAppInfo = WebClientInfo;

export interface DockerGeneratorOptions {
  nodes: BackendNode[];
  edges: BackendEdge[];
  services: ServiceInfo[];
  webApps?: WebAppInfo[];
  webClients?: WebClientInfo[];
  projectName: string;
  hasKafka?: boolean;
  hasRedis?: boolean;
}

export interface ComposeGeneratorContext {
  nodes: BackendNode[];
  edges: BackendEdge[];
  services: ServiceInfo[];
  webApps?: WebAppInfo[];
  webClients?: WebClientInfo[];
  projectSlug: string;
  hasPostgres: boolean;
  hasSqlite: boolean;
  hasKafka: boolean;
  hasRedis: boolean;
}

export interface InfraComposeContext {
  projectSlug: string;
  hasPostgres: boolean;
  hasKafka: boolean;
  hasRedis: boolean;
  nodes?: BackendNode[];
}

export interface CompiledFile {
  filename: string;
  language: string;
  content: string;
}

export interface CompiledServiceResult {
  serviceId: string;
  serviceName: string;
  files: CompiledFile[];
}

export interface CompiledDatabasePackage {
  packageName: string;
  packageFolder: string;
  dbEngine: string;
  databaseNodeId?: string;
  databaseLabel?: string;
  files: CompiledFile[];
  reusableFunctions: ReusableFunction[];
}

export interface CompiledDatabaseResult {
  files: CompiledFile[];
  packages?: CompiledDatabasePackage[];
  /** Reusable raw SQL CRUD functions generated for each table */
  reusableFunctions: ReusableFunction[];
}

export interface CompiledKafkaResult {
  files: CompiledFile[];
  /** Reusable publish/consume functions generated for each topic */
  reusableFunctions: ReusableFunction[];
  /** The folder name used under packages/ e.g. "order-events" → packages/order-events */
  packageFolder: string;
  /** The npm package name e.g. "@workspace/order-events" */
  packageName: string;
}

export interface CompiledRedisPackage {
  packageName: string;
  packageFolder: string;
  redisNodeId?: string;
  redisLabel?: string;
  files: CompiledFile[];
  reusableFunctions: ReusableFunction[];
}

export interface CompiledRedisResult {
  files: CompiledFile[];
  packages?: CompiledRedisPackage[];
  reusableFunctions?: ReusableFunction[];
  packageFolder?: string;
  packageName?: string;
}

export interface CompiledWebPageResult {
  webPageId: string;
  webPageName: string;
  files: CompiledFile[];
}

export interface CompiledMonorepoResult {
  projectName: string;
  files: CompiledFile[];
  services: { id: string; name: string; folderName: string }[];
  webClients?: { id: string; name: string; folderName: string }[];
}

export interface AuthPageMetaInfo {
  nodeId?: string;
  slug?: string;
  routePath?: string;
  isAuthPage?: boolean;
}

export interface LinkedEndpointInfo {
  targetNodeId: string;
  targetNodeName: string;
  serviceName?: string;
  targetNodePort: string;
  endpointId?: string;
  endpointName: string;
  method: string;
  path: string;
  fullUrl: string;
  requireAuth?: boolean;
  endpoint?: Endpoint;
}

export interface LinkedPageRefInfo {
  targetNodeId: string;
  targetNodeName: string;
  targetRoute: string;
}

export interface LinkedRealtimeConnectionInfo {
  connectionId: string;
  protocol: "SSE" | "WEBSOCKET" | "WEBRTC" | "POLLING" | "API_PUSH";
  eventName?: string;
  room?: string;
  sourceServiceNodeId?: string;
  sourceServiceName?: string;
  sourceEventId?: string;
  description?: string;
  sourceServicePort?: string;
  streamUrl?: string;
}

export interface PageInfo {
  nodeId: string;
  label: string;
  description?: string;
  slug: string;
  routePath: string;
  componentName: string;
  isRoot: boolean;
  routeGroup?: string;
  accessType?: "public" | "private" | "role-gated" | "payment-gated" | "org-gated";
  allowedRoles?: string[];
  requiredPlans?: string[];
  allowedOrgRoles?: string[];
  redirectTo?: string;
  isAuthPage?: boolean;
  appSlug?: string;
  appName?: string;
  realtimeConnections?: LinkedRealtimeConnectionInfo[];
}

export interface NodeConnectionDetail {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  detail: string;
  dataContext?: string;
  isProtected?: boolean;
}

export interface EndpointTraceResult {
  incoming: NodeConnectionDetail[];
  outgoing: NodeConnectionDetail[];
}

export interface SectionMeta {
  id: string;
  name: string;
  folderName: string;
  componentName: string;
  renderMode?: "server" | "client";
}

export interface CompiledTypesResult {
  files: CompiledFile[];
}

export interface DatabaseEntityInfo {
  name: string;
  pascalName: string;
  singularName: string;
  pluralName: string;
  columns: {
    name: string;
    type?: string;
    required?: boolean;
    isPrimaryKey?: boolean;
  }[];
}

export interface EventTraceResult {
  incoming: NodeConnectionDetail[];
  outgoing: NodeConnectionDetail[];
}


