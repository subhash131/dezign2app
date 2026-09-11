import { BackendNode, BackendEdge, BackendCanvasView } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  IdentityProvider,
  MessagingResourceType,
  VersionChangeSummary,
  ChangeSummary,
  VersionNodeSnapshot,
  VersionEdgeSnapshot,
  VersionEndpointSnapshot,
  VersionEventSnapshot,
  VersionIdentityProviderSnapshot,
  VersionTestCaseSnapshot,
  VersionSnapshot,
  VersionListItem,
  ConfigItemType,
  ActiveConfigItem,
  EndpointWithNode,
  EventWithNode,
  IdentityProviderWithNode,
  PendingEndpointRemoval,
  PendingEventRemoval,
  PendingIdentityProviderRemoval,
  CanvasSnapshotState,
} from "@workspace/canvas/types";
import { NodeChange, EdgeChange, Connection } from "@xyflow/react";
import { GraphSnapshot, SchemaSnapshot } from "./history/types";

export type {
  VersionChangeSummary,
  ChangeSummary,
  VersionNodeSnapshot,
  VersionEdgeSnapshot,
  VersionEndpointSnapshot,
  VersionEventSnapshot,
  VersionIdentityProviderSnapshot,
  VersionTestCaseSnapshot,
  VersionSnapshot,
  VersionListItem,
  ConfigItemType,
  ActiveConfigItem,
  EndpointWithNode,
  EventWithNode,
  IdentityProviderWithNode,
  PendingEndpointRemoval,
  PendingEventRemoval,
  PendingIdentityProviderRemoval,
  CanvasSnapshotState,
};



export interface BackendCanvasState {
  projectId: string | null;
  nodes: BackendNode[];
  edges: BackendEdge[];
  canvasView: BackendCanvasView;

  endpoints: EndpointWithNode[];
  events: EventWithNode[];
  identityProviders: IdentityProviderWithNode[];
  activeConfigItem: ActiveConfigItem | null;
  setActiveConfigItem: (item: ActiveConfigItem | null) => void;

  // History / Undo / Redo (fully separated history managers for graph and schema)
  graphUndoStack: GraphSnapshot[];
  graphRedoStack: GraphSnapshot[];
  schemaUndoStack: SchemaSnapshot[];
  schemaRedoStack: SchemaSnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  pushGraphHistorySnapshot: () => void;
  pushSchemaHistorySnapshot: () => void;
  pushHistorySnapshot: (view?: BackendCanvasView) => void;
  undoGraph: () => void;
  undoSchema: () => void;
  undo: () => void;
  redoGraph: () => void;
  redoSchema: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Pending Convex sync ops
  pendingNodeUpserts: BackendNode[];
  pendingNodeRemovals: string[];
  pendingEdgeUpserts: BackendEdge[];
  pendingEdgeRemovals: string[];
  pendingEndpointUpserts: EndpointWithNode[];
  pendingEndpointRemovals: PendingEndpointRemoval[];
  pendingEventUpserts: EventWithNode[];
  pendingEventRemovals: PendingEventRemoval[];
  pendingIdentityProviderUpserts: IdentityProviderWithNode[];
  pendingIdentityProviderRemovals: PendingIdentityProviderRemoval[];

  // Deletion confirmation
  nodesPendingDeletion: BackendNode[];
  setNodesPendingDeletion: (nodes: BackendNode[]) => void;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Manual actions
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  addTableNode: (
    parentId?: string,
    position?: { x: number; y: number },
  ) => void;
  addLangGraphStepNode: (
    parentId: string,
    position?: { x: number; y: number },
    name?: string,
    stepType?: BackendNode["data"]["stepType"],
  ) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  requestDeleteNode: (id: string) => void;
  requestDeleteNodes: (ids: string[]) => void;
  addEdge: (edge: Omit<BackendEdge, "fractionalIndex">) => void;
  updateEdge: (id: string, changes: Partial<BackendEdge>) => void;
  deleteEdge: (id: string) => void;

  addEndpoint: (nodeId: string, endpoint: Endpoint) => void;
  updateEndpoint: (id: string, changes: Partial<Endpoint>) => void;
  deleteEndpoint: (id: string) => void;

  addEvent: (
    nodeId: string,
    variant: "publish" | "consume",
    event: AnyMessagingResource,
  ) => void;
  updateEvent: (id: string, changes: Partial<AnyMessagingResource>) => void;
  deleteEvent: (id: string) => void;

  addIdentityProvider: (nodeId: string, provider: IdentityProvider) => void;
  updateIdentityProvider: (
    id: string,
    changes: Partial<IdentityProvider>,
  ) => void;
  deleteIdentityProvider: (id: string) => void;

  // Bulk load from Convex (no pending ops)
  setNodesAndEdges: (
    nodes: BackendNode[],
    edges: BackendEdge[],
    endpoints?: EndpointWithNode[],
    events?: EventWithNode[],
    identityProviders?: IdentityProviderWithNode[],
    projectId?: string,
  ) => void;
  setView: (view: BackendCanvasView) => void;

  // Called after Convex sync succeeds
  clearPending: (
    syncedNodeUpserts: BackendNode[],
    syncedNodeRemovals: string[],
    syncedEdgeUpserts: BackendEdge[],
    syncedEdgeRemovals: string[],
    syncedEndpointUpserts?: EndpointWithNode[],
    syncedEndpointRemovals?: PendingEndpointRemoval[],
    syncedEventUpserts?: EventWithNode[],
    syncedEventRemovals?: PendingEventRemoval[],
    syncedIdentityProviderUpserts?: IdentityProviderWithNode[],
    syncedIdentityProviderRemovals?: PendingIdentityProviderRemoval[],
  ) => void;
  reset: (projectId?: string | null) => void;
}
