import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  EndpointWithNode,
  EventWithNode,
  BackendCanvasState,
} from "../types";

export interface EdgeCleanupContext {
  currentState: BackendCanvasState;
  removedSet: Set<string>;
  nextEdges: BackendEdge[];
  nextNodes: BackendNode[];
  nextEndpoints: EndpointWithNode[];
  nextEvents: EventWithNode[];
  dbNodeIdsSet: Set<string>;
  pendingNodeUpserts: BackendNode[];
  pendingEndpointUpserts: EndpointWithNode[];
  pendingEventUpserts: EventWithNode[];
  pendingEdgeUpserts: BackendEdge[];
  deletedEventEntries: Array<{ nodeId: string; eventId: string }>;
  nodesChanged: boolean;
  endpointsChanged: boolean;
  eventsChanged: boolean;
  additionalRemovedEdgeIds?: string[];
}

export interface DeletedNodesMeta {
  allIdsSet: Set<string>;
  deletedBrokerNodes: BackendNode[];
  deletedBrokerIds: Set<string>;
  deletedBrokerTopicIds: Set<string>;
  deletedBrokerTopicNames: Set<string>;
  deletedBrokerPackageNames: Set<string>;
  deletedTransformerNodes: BackendNode[];
  deletedTransformerNames: Set<string>;
  deletedLangGraphNodes: BackendNode[];
  deletedLangGraphIds: Set<string>;
  deletedRedisNodes: BackendNode[];
  deletedRedisIds: Set<string>;
  deletedDbRefNodes: BackendNode[];
  deletedDbRefIds: Set<string>;
  deletedDbRefStepIds: Set<string>;
}
