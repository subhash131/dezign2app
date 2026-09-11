import { BackendNode, BackendEdge } from "@/types/canvas";
import { EndpointWithNode } from "../types";

export interface PreparedNodeResult {
  nodes: BackendNode[];
  edges: BackendEdge[];
  endpoints: EndpointWithNode[];
  pendingNodes: BackendNode[];
  pendingEdges: BackendEdge[];
  pendingEndpoints: EndpointWithNode[];
}

export interface NodeEdgeSyncResult {
  nextEdges: BackendEdge[];
  edgesChanged: boolean;
  newPendingEdgeRemovals: string[];
  newPendingEdgeUpserts: BackendEdge[];
}

export function isSchemaNodeType(type: string | undefined): boolean {
  return (
    type === "entity" ||
    type === "database" ||
    type === "group" ||
    type === "redis_instance" ||
    type === "redis_schema"
  );
}
