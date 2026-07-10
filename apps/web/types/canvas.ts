import { TLStoreSnapshot } from "tldraw";

export type CanvasMode = "frontend" | "backend";
export type BackendCanvasView = "graph" | "sequence";

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
  | "external";

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
    }[];
    isActor?: boolean;
  };
  fractionalIndex: string; // For Z-order
};

export type BackendEdgeType = "connection" | "foreign-key" | "message";

export type BackendEdge = {
  id: string;
  source: string;
  target: string;
  type: BackendEdgeType;
  data?: {
    label?: string;
    sequenceOrder?: number;
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
