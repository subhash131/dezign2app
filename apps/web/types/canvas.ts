import { TLStoreSnapshot } from "tldraw";

export type CanvasMode = "frontend" | "backend";
export type BackendCanvasView = "graph" | "sequence" | "schema";

// --- Frontend Canvas Types ---

export type FrontendDesignDoc = {
  snapshot: TLStoreSnapshot | null;
};

// --- Backend Canvas Types ---

export type BackendNodeType =
  | "service"
  | "database"
  | "queue"
  | "entity"
  | "actor"
  | "external"
  | "group";

export type BackendNode = {
  id: string;
  type: BackendNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    columns?: {
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isForeignKey?: boolean;
      isNotNull?: boolean;
      isUnique?: boolean;
    }[];
    indexes?: {
      name: string;
      columns: string;
      isUnique?: boolean;
    }[];
    isActor?: boolean;
    parentId?: string;
    graphPosition?: { x: number; y: number };
    schemaPosition?: { x: number; y: number };
    // New fields for Graph tab detailed nodes
    events?: { id: string; name: string }[];
    inputs?: { id: string; name: string }[];
    logic?: { id: string; name: string }[];
    outputs?: { id: string; name: string }[];
    actions?: { id: string; name: string }[];
    messages?: { id: string; name: string }[];
    tableRef?: string; // Reference to an entity node ID
    techStack?: string;
    dbType?: string;
    baseUrl?: string;
    queueType?: string;
    cors?: boolean;
    corsOrigins?: string;
    rateLimit?: string;
    port?: string;
    endpoints?: { 
      id: string; 
      name: string; 
      type: string;
      headers?: { id: string; key: string; value: string }[];
      params?: { id: string; key: string; type: string }[];
      body?: string;
    }[];
  };
  fractionalIndex: string; // For Z-order
  parentId?: string;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
  selected?: boolean;
};

export type BackendEdgeType = "connection" | "foreign-key" | "message";

export type BackendEdge = {
  id: string;
  source: string;
  target: string;
  type: BackendEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: {
    label?: string;
    sequenceOrder?: number;
    sourceCardinality?: "1" | "N";
    targetCardinality?: "1" | "N";
  };
  fractionalIndex: string; // For sequence diagram ordering
};

export type BackendDesignDoc = {
  nodes: BackendNode[];
  edges: BackendEdge[];
};

// --- AI Adapter Types ---

export type CanvasOperation =
  | { op: "add_node"; type: BackendNodeType; label: string; position?: { x: number; y: number }; data?: any }
  | { op: "update_node"; id: string; changes: any }
  | { op: "delete_node"; id: string }
  | { op: "add_edge"; source: string; target: string; type: BackendEdgeType; data?: any }
  | { op: "update_edge"; id: string; changes: any }
  | { op: "delete_edge"; id: string }
  | { op: "run_auto_layout" }
  | { op: "add_shape"; type: string; x: number; y: number; props: any }
  | { op: "update_shape"; id: string; props: any }
  | { op: "delete_shape"; id: string };

export interface CanvasAdapter<TDoc> {
  getState: () => TDoc;
  applyOperations: (ops: CanvasOperation[]) => void;
  serialize: () => string; // For AI context
}
