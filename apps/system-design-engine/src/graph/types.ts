import type {
  BackendNode,
  BackendEdge,
  BackendNodeType,
  BackendEdgeType,
  TestCaseItem,
} from "@workspace/canvas";
import type { Endpoint } from "@workspace/canvas";

// Re-export for convenience within the graph module
export type { BackendNodeType, BackendEdgeType };

// ─── Core Identity ────────────────────────────────────────────────────────────

export type NodeId = string;

// ─── Graph Node ───────────────────────────────────────────────────────────────

export interface GraphNode {
  nodeId: NodeId;
  type: BackendNodeType;
  label: string;
  description: string;
  /** Full data blob from Convex — used for serialization */
  data: BackendNode["data"];
}

// ─── Graph Edge ───────────────────────────────────────────────────────────────

export interface GraphEdge {
  id: string;
  source: NodeId;
  target: NodeId;
  type: BackendEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Human-readable label from edge data, or empty string */
  label: string;
}

// ─── In-Memory Graph ──────────────────────────────────────────────────────────

export interface CanvasGraph {
  /** All nodes keyed by their nodeId */
  nodes: Map<NodeId, GraphNode>;
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Adjacency list: source nodeId → outgoing edges */
  outgoing: Map<NodeId, GraphEdge[]>;
  /** Adjacency list: target nodeId → incoming edges */
  incoming: Map<NodeId, GraphEdge[]>;
}

// ─── Traversal Result ─────────────────────────────────────────────────────────

export interface TraversalHit {
  node: GraphNode;
  depth: number;
}

export interface NeighbourHit {
  node: GraphNode;
  edge: GraphEdge;
}

// ─── Summarised Endpoint (for MCP output) ────────────────────────────────────

export interface EndpointSummary {
  nodeId: NodeId;
  id: string;
  name: string;
  type: string;
  summary: string;
  businessLogic: string;
  requiredRoles: string[];
}

// ─── Summarised Test Case (for MCP output) ───────────────────────────────────

export interface TestCaseSummary {
  nodeId: NodeId;
  name: string;
  expectedStatus: number | undefined;
}

// ─── Raw elements returned by api.canvas.getBackendElements ──────────────────

export interface RawNodeRecord {
  id?: string;
  nodeId?: string;
  type?: BackendNodeType;
  data?: BackendNode["data"];
}

export interface RawEdgeRecord {
  id?: string;
  edgeId?: string;
  source: string;
  target: string;
  type?: BackendEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: BackendEdge["data"];
}

export interface RawEndpointRecord extends Endpoint {
  nodeId: NodeId;
}

export interface RawEventRecord {
  id: string;
  nodeId: NodeId;
  name: string;
  variant: "publish" | "consume";
  brokerNodeId?: string;
  messagingResourceId?: string;
  payloadSchema?: { id?: string; rawJson?: string };
  publishedWhen?: string;
}

export interface RawTestCaseRecord extends TestCaseItem {
  id: string;
}

export interface CanvasElements {
  nodes: RawNodeRecord[];
  edges: RawEdgeRecord[];
  endpoints: RawEndpointRecord[];
  events?: RawEventRecord[];
  testCases: RawTestCaseRecord[];
}
