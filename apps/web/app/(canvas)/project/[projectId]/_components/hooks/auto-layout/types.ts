import type { CSSProperties } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { BackendEdge, BackendNodeData, WebAppZone, PageSection } from "@/types/canvas";

export {
  HEAD_TARGET_HANDLES,
  HEAD_NODE_TYPES,
  TARGET_NODE_TYPES,
} from "@workspace/canvas";

export type LayoutNode = Node<BackendNodeData> & {
  fractionalIndex?: string;
  nodeId?: string;
  parentId?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  sourcePosition?: string;
  targetPosition?: string;
};
export type LayoutEdge = Edge | BackendEdge;

export type PositionNodeChange = {
  id: string;
  type: "position";
  position: { x: number; y: number };
  sourcePosition?: string;
  targetPosition?: string;
};

export interface UseAutoLayoutOptions {
  nodes?: LayoutNode[];
  edges?: LayoutEdge[];
  onNodesChange?: (changes: PositionNodeChange[]) => void;
  layoutType?: "schema" | "graph" | "langgraph";
}

export interface LayoutNodeLike {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: object;
  measured?: { width?: number; height?: number };
  style?: CSSProperties | Record<string, string | number | boolean | null | undefined>;
  width?: number;
  height?: number;
  fractionalIndex?: string;
  nodeId?: string;
  parentId?: string;
  sourcePosition?: string;
  targetPosition?: string;
}

export interface LayoutEdgeLike {
  id?: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export type UseGraphAutoLayoutOptions = UseAutoLayoutOptions;
export type UseSchemaAutoLayoutOptions = UseAutoLayoutOptions;

export interface UseLangGraphAutoLayoutOptions<
  TNode extends LayoutNodeLike = LayoutNodeLike,
  TEdge extends LayoutEdgeLike = LayoutEdgeLike
> {
  nodes?: TNode[];
  edges?: TEdge[];
  onNodesChange?: (changes: PositionNodeChange[]) => void;
}

export interface NodeHandleData {
  endpoints?: Array<{ id?: string; _id?: string }>;
  events?: Array<{ id?: string; _id?: string }>;
  topics?: Array<{ id?: string; _id?: string; name?: string }>;
  consumedEvents?: Array<string | { id?: string; _id?: string }>;
  publishedEvents?: Array<string | { id?: string; _id?: string }>;
  zones?: WebAppZone[];
  sections?: PageSection[];
  fields?: any[];
  actions?: any[];
}

export interface DagreNodeInfo {
  rank?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface DagreGraph {
  node(id: string): DagreNodeInfo | undefined;
}
