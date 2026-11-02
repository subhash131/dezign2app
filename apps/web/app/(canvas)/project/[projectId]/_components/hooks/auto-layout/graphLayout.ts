import { Position } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  HEAD_TARGET_HANDLES,
  HEAD_NODE_TYPES,
  TARGET_NODE_TYPES,
  type LayoutNode,
  type LayoutEdge,
  type PositionNodeChange,
} from "./types";
import { getNodeDimensions } from "./nodeDimensions";
import { runBarycenterRefinement } from "./barycenterLayout";
import { layoutHeadNodes } from "./headNodeLayout";
import { layoutHangingTransformerNodes } from "./hangingTransformerLayout";
import {
  layoutHangingReferenceNodes,
  REFERENCE_NODE_TYPES,
} from "./hangingReferenceLayout";
import { layoutPaymentsPluginNodes } from "./paymentsPluginLayout";
import { layoutAuthNodes } from "./authNodeLayout";
import { layoutHangingStateStoreNodes } from "./hangingStateStoreLayout";
import { layoutTypesNodes } from "./typesNodeLayout";
import { computeTierRanks } from "./serviceTierLayout";
import type { EndpointWithNode, EventWithNode } from "@workspace/canvas";
import {
  CARD_HEADER_OFFSET_X,
  CARD_HEADER_OFFSET_Y,
  sortZonePages,
} from "../../backend-nodes/graph-nodes/nodes/gateway/web-page/useZoneHandLayout";

export interface PerformGraphLayoutOptions {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  onNodesChange?: (changes: PositionNodeChange[]) => void;
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number; nodes?: { id: string }[] }) => void;
  direction?: string;
  storeEndpoints?: EndpointWithNode[];
  storeEvents?: EventWithNode[];
}

/**
 * Extracts only the connected flow nodes from start/entry to end/sink in GraphView.
 * Ignores definition/auxiliary nodes (types, entity, database) and any disconnected nodes.
 */
export function getGraphFlowNodes(
  nodes: LayoutNode[],
  edges: LayoutEdge[] = [],
): LayoutNode[] {
  if (nodes.length === 0) return [];

  // Exclude types, entity, database, redis, group nodes
  const candidateNodes = nodes.filter(
    (n) =>
      n.type !== "types" &&
      n.type !== "group" &&
      n.type !== "entity" &&
      n.type !== "database" &&
      n.type !== "redis_instance" &&
      n.type !== "redis_schema",
  );
  if (candidateNodes.length === 0) return [];

  const candidateIdSet = new Set(candidateNodes.map((n) => n.id));

  // Graph flow edges between candidates
  const flowEdges = edges.filter(
    (e) =>
      candidateIdSet.has(e.source) &&
      candidateIdSet.has(e.target) &&
      e.type !== "database-connection" &&
      e.type !== "foreign-key" &&
      e.type !== "type-reference",
  );

  // If there are no flow edges at all, return all candidate nodes
  if (flowEdges.length === 0) {
    return candidateNodes;
  }

  // Count degrees in the flow graph
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const undirectedAdj = new Map<string, string[]>();

  candidateNodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
    undirectedAdj.set(n.id, []);
  });

  flowEdges.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
    undirectedAdj.get(e.source)?.push(e.target);
    undirectedAdj.get(e.target)?.push(e.source);
  });

  // Disconnected nodes have total degree 0
  const connectedNodeIds = new Set<string>();
  candidateNodes.forEach((n) => {
    const deg = (inDegree.get(n.id) ?? 0) + (outDegree.get(n.id) ?? 0);
    if (deg > 0) {
      connectedNodeIds.add(n.id);
    }
  });

  if (connectedNodeIds.size === 0) {
    return candidateNodes;
  }

  // Identify entry / start nodes:
  // Explicit entry types (webApp, webPage, gateway) or nodes in connected components with inDegree === 0
  const isExplicitStart = (n: LayoutNode) =>
    n.type === "webApp" ||
    n.type === "webPage" ||
    n.type === "gateway" ||
    n.type === "api_gateway" ||
    n.type === "start" ||
    n.type === "START";

  const explicitStartNodes = candidateNodes.filter(
    (n) => connectedNodeIds.has(n.id) && isExplicitStart(n),
  );

  const rootNodes = candidateNodes.filter(
    (n) => connectedNodeIds.has(n.id) && (inDegree.get(n.id) ?? 0) === 0,
  );

  const startNodes =
    explicitStartNodes.length > 0 ? explicitStartNodes : rootNodes;

  const bfs = (
    startIds: string[],
    adjMap: Map<string, string[]>,
  ): Set<string> => {
    const visited = new Set<string>();
    const queue = [...startIds];
    startIds.forEach((id) => visited.add(id));

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adjMap.get(curr) || [];
      for (const nbr of neighbors) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      }
    }
    return visited;
  };

  // Traverse connected components from start/entry nodes
  const startIds = startNodes.map((n) => n.id);
  const flowConnected =
    startIds.length > 0 ? bfs(startIds, undirectedAdj) : connectedNodeIds;

  // Nodes to include: all nodes in the connected flow from start to end
  const selectedNodeIds =
    flowConnected.size > 0 ? flowConnected : connectedNodeIds;

  const resultNodes: LayoutNode[] = [];
  candidateNodes.forEach((n) => {
    if (selectedNodeIds.has(n.id)) {
      resultNodes.push(n);
    }
  });

  return resultNodes.length > 0 ? resultNodes : candidateNodes;
}

export function performGraphLayout({
  nodes,
  edges,
  onNodesChange,
  fitView,
  direction = "LR",
  storeEndpoints = [],
  storeEvents = [],
}: PerformGraphLayoutOptions) {
  const isHorizontal = direction === "LR";

  // Partition types nodes away from the main architecture DAG flow
  const typesNodes = nodes.filter((n: LayoutNode) => n.type === "types");
  const graphNodes = nodes.filter(
    (n: LayoutNode) =>
      n.type !== "group" &&
      n.type !== "entity" &&
      n.type !== "database" &&
      n.type !== "redis_instance" &&
      n.type !== "redis_schema" &&
      n.type !== "types",
  );
  if (graphNodes.length === 0 && typesNodes.length === 0) return;

  const typesNodeIdSet = new Set(typesNodes.map((n) => n.id));
  const graphEdges = edges.filter((e: LayoutEdge) => {
    if (
      e.type === "database-connection" ||
      e.type === "foreign-key" ||
      e.type === "transformer-reference" ||
      e.type === "storage-reference" ||
      e.type === "reference" ||
      e.type === "type-reference"
    ) {
      return false;
    }
    if (typesNodeIdSet.has(e.source) || typesNodeIdSet.has(e.target)) {
      return false;
    }
    const sourceNode = graphNodes.find((n) => n.id === e.source);
    const targetNode = graphNodes.find((n) => n.id === e.target);
    if (
      sourceNode?.type === "transformer" &&
      targetNode?.type === "transformer_ref"
    ) {
      return false;
    }
    if (
      sourceNode?.type === "storage" &&
      (targetNode?.type === "storage_operation_ref" ||
        targetNode?.type === "storage_ref" ||
        targetNode?.type === "bucket_ref" ||
        targetNode?.type === "storage_bucket_ref" ||
        targetNode?.type === "StorageBucketRefNode" ||
        targetNode?.type === "StorageOperationRefNode")
    ) {
      return false;
    }
    return true;
  });

  // 1. Identify Target nodes (nodes that can have attached head nodes)
  const targetNodeIds = new Set<string>();
  graphNodes.forEach((n: LayoutNode) => {
    if (TARGET_NODE_TYPES.has(n.type ?? "")) {
      targetNodeIds.add(n.id);
    }
  });
  graphEdges.forEach((edge: LayoutEdge) => {
    if (HEAD_TARGET_HANDLES.has(edge.targetHandle ?? "")) {
      targetNodeIds.add(edge.target);
    }
  });

  // 2. Identify head-connection edges vs hanging transformer edges vs main flow edges
  const isHeadConnectionEdge = (edge: LayoutEdge): boolean => {
    const isTargetMatch = targetNodeIds.has(edge.target);
    const isHeadHandle = HEAD_TARGET_HANDLES.has(edge.targetHandle ?? "");
    const sourceNodeType =
      graphNodes.find((n: LayoutNode) => n.id === edge.source)?.type ?? "";
    const isHeadSourceType = HEAD_NODE_TYPES.has(sourceNodeType);
    return isTargetMatch && (isHeadHandle || isHeadSourceType);
  };

  const isHangingTransformerEdge = (edge: LayoutEdge): boolean => {
    const sourceNode = graphNodes.find((n: LayoutNode) => n.id === edge.source);
    const targetNode = graphNodes.find((n: LayoutNode) => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;
    if (edge.type === "transformer-reference" || edge.type === "reference") return false;
    const isTransType =
      sourceNode.type === "transformer_ref" ||
      sourceNode.type === "transformer" ||
      sourceNode.type === "hook" ||
      sourceNode.type === "hook_ref" ||
      targetNode.type === "transformer_ref" ||
      targetNode.type === "transformer" ||
      targetNode.type === "hook" ||
      targetNode.type === "hook_ref";
    return isTransType;
  };

  const isHangingReferenceEdge = (edge: LayoutEdge): boolean => {
    const targetNode = graphNodes.find((n: LayoutNode) => n.id === edge.target);
    const sourceNode = graphNodes.find((n: LayoutNode) => n.id === edge.source);
    if (targetNode && REFERENCE_NODE_TYPES.has(targetNode.type ?? "")) return true;
    if (sourceNode && REFERENCE_NODE_TYPES.has(sourceNode.type ?? "")) return true;
    return false;
  };

  const isPaymentsPluginEdge = (edge: LayoutEdge): boolean => {
    const sourceNode = graphNodes.find((n: LayoutNode) => n.id === edge.source);
    const targetNode = graphNodes.find((n: LayoutNode) => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.type === "payments" && targetNode.type === "auth") {
      return (
        edge.targetHandle === "payments-plugin-in" ||
        edge.sourceHandle === "injects-plugin-out" ||
        !edge.targetHandle
      );
    }
    if (targetNode.type === "payments" && sourceNode.type === "auth") {
      return (
        edge.sourceHandle === "payments-plugin-in" ||
        edge.targetHandle === "injects-plugin-out"
      );
    }
    return false;
  };

  const isHangingStateStoreEdge = (edge: LayoutEdge): boolean => {
    const sourceNode = graphNodes.find((n: LayoutNode) => n.id === edge.source);
    const targetNode = graphNodes.find((n: LayoutNode) => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;
    return (
      (sourceNode.type === "state_store" && targetNode.type === "webPage") ||
      (targetNode.type === "state_store" && sourceNode.type === "webPage")
    );
  };

  const isAuthWebAppEdge = (edge: LayoutEdge): boolean => {
    const sourceNode = graphNodes.find((n: LayoutNode) => n.id === edge.source);
    const targetNode = graphNodes.find((n: LayoutNode) => n.id === edge.target);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.type === "auth" && targetNode.type === "webApp") {
      return (
        edge.targetHandle === "auth-in" ||
        edge.sourceHandle === "auth-out" ||
        !edge.targetHandle
      );
    }
    if (targetNode.type === "auth" && sourceNode.type === "webApp") {
      return (
        edge.sourceHandle === "auth-in" ||
        edge.targetHandle === "auth-out" ||
        !edge.sourceHandle
      );
    }
    return false;
  };

  const headEdges: LayoutEdge[] = graphEdges.filter(isHeadConnectionEdge);
  const hangingEdges: LayoutEdge[] = graphEdges.filter(isHangingTransformerEdge);
  const hangingRefEdges: LayoutEdge[] = graphEdges.filter(isHangingReferenceEdge);
  const paymentsPluginEdges: LayoutEdge[] = graphEdges.filter(isPaymentsPluginEdge);
  const hangingStateStoreEdges: LayoutEdge[] = graphEdges.filter(isHangingStateStoreEdge);
  const authWebAppEdges: LayoutEdge[] = graphEdges.filter(isAuthWebAppEdge);

  // 3. Identify attached head nodes, hanging transformer nodes, and hanging reference nodes
  const attachedHeadNodeIdSet = new Set<string>(
    headEdges.map((e: LayoutEdge) => e.source),
  );
  const attachedHeadNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    attachedHeadNodeIdSet.has(n.id),
  );

  const hangingTransformerNodeIdSet = new Set<string>();
  hangingEdges.forEach((e: LayoutEdge) => {
    const src = graphNodes.find((n) => n.id === e.source);
    const tgt = graphNodes.find((n) => n.id === e.target);
    if (src && (src.type === "transformer_ref" || (src.type === "transformer" && src.data?.scope === "local") || src.type === "hook" || src.type === "hook_ref")) {
      hangingTransformerNodeIdSet.add(src.id);
    }
    if (tgt && (tgt.type === "transformer_ref" || (tgt.type === "transformer" && tgt.data?.scope === "local") || tgt.type === "hook" || tgt.type === "hook_ref")) {
      hangingTransformerNodeIdSet.add(tgt.id);
    }
  });
  const hangingTransformerNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    hangingTransformerNodeIdSet.has(n.id),
  );

  const transformerDefNodes: LayoutNode[] = graphNodes.filter(
    (n: LayoutNode) =>
      n.type === "transformer" && !hangingTransformerNodeIdSet.has(n.id),
  );
  const transformerDefNodeIdSet = new Set<string>(
    transformerDefNodes.map((n) => n.id),
  );

  const hangingRefNodeIdSet = new Set<string>();
  graphNodes.forEach((n: LayoutNode) => {
    if (REFERENCE_NODE_TYPES.has(n.type ?? "")) {
      hangingRefNodeIdSet.add(n.id);
    }
  });
  hangingRefEdges.forEach((e: LayoutEdge) => {
    const sourceNode = graphNodes.find((n) => n.id === e.source);
    const targetNode = graphNodes.find((n) => n.id === e.target);
    if (sourceNode && REFERENCE_NODE_TYPES.has(sourceNode.type ?? "")) {
      hangingRefNodeIdSet.add(sourceNode.id);
    }
    if (targetNode && REFERENCE_NODE_TYPES.has(targetNode.type ?? "")) {
      hangingRefNodeIdSet.add(targetNode.id);
    }
  });
  const hangingRefNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    hangingRefNodeIdSet.has(n.id),
  );

  const paymentsPluginNodeIdSet = new Set<string>();
  paymentsPluginEdges.forEach((e) => {
    const sourceNode = graphNodes.find((n) => n.id === e.source);
    const targetNode = graphNodes.find((n) => n.id === e.target);
    if (sourceNode?.type === "payments") paymentsPluginNodeIdSet.add(sourceNode.id);
    if (targetNode?.type === "payments") paymentsPluginNodeIdSet.add(targetNode.id);
  });
  const paymentsPluginNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    paymentsPluginNodeIdSet.has(n.id),
  );

  const hangingStateStoreNodeIdSet = new Set<string>();
  graphNodes.forEach((n: LayoutNode) => {
    if (n.type === "state_store") {
      hangingStateStoreNodeIdSet.add(n.id);
    }
  });
  hangingStateStoreEdges.forEach((e: LayoutEdge) => {
    const sourceNode = graphNodes.find((n) => n.id === e.source);
    const targetNode = graphNodes.find((n) => n.id === e.target);
    if (sourceNode?.type === "state_store") hangingStateStoreNodeIdSet.add(sourceNode.id);
    if (targetNode?.type === "state_store") hangingStateStoreNodeIdSet.add(targetNode.id);
  });
  const hangingStateStoreNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    hangingStateStoreNodeIdSet.has(n.id),
  );

  const connectedAuthNodeIdSet = new Set<string>();
  authWebAppEdges.forEach((e) => {
    const sourceNode = graphNodes.find((n) => n.id === e.source);
    const targetNode = graphNodes.find((n) => n.id === e.target);
    if (sourceNode?.type === "auth") connectedAuthNodeIdSet.add(sourceNode.id);
    if (targetNode?.type === "auth") connectedAuthNodeIdSet.add(targetNode.id);
  });
  graphNodes.forEach((n) => {
    if (
      n.type === "webApp" &&
      n.data &&
      typeof n.data === "object" &&
      "authNodeId" in n.data &&
      typeof (n.data as any).authNodeId === "string"
    ) {
      const authId = (n.data as any).authNodeId;
      if (graphNodes.some((gn) => gn.id === authId && gn.type === "auth")) {
        connectedAuthNodeIdSet.add(authId);
      }
    }
  });
  const connectedAuthNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    connectedAuthNodeIdSet.has(n.id),
  );

  // 3.5. Identify stacked WebPage zones attached to WebApp nodes
  const webAppNodes = graphNodes.filter((n) => n.type === "webApp");
  const stackedSecondaryNodeIdSet = new Set<string>();
  const stackedSecondaryEdgeIdSet = new Set<string>();
  const secondaryToLeadPageMap = new Map<string, string>();
  const dimensionOverrides = new Map<string, { width: number; height: number }>();
  const stackHandleRatios = new Map<string, number>();
  const stackedZonesList: Array<{
    leadPage: LayoutNode;
    sortedPages: LayoutNode[];
  }> = [];

  webAppNodes.forEach((webApp) => {
    const zones =
      webApp.data &&
      typeof webApp.data === "object" &&
      "zones" in webApp.data &&
      Array.isArray(webApp.data.zones) &&
      webApp.data.zones.length > 0
        ? webApp.data.zones
        : [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ];

    const expandedZones =
      webApp.data &&
      typeof webApp.data === "object" &&
      "expandedZones" in webApp.data &&
      Array.isArray(webApp.data.expandedZones)
        ? webApp.data.expandedZones
        : [];

    zones.forEach((zone: any) => {
      if (expandedZones.includes(zone.id)) return; // Zone is expanded / fanned out

      const handleId = zone.handleId;
      const zoneEdges = graphEdges.filter(
        (e) =>
          (e.source === webApp.id && e.sourceHandle === handleId) ||
          (e.target === webApp.id && e.targetHandle === handleId),
      );
      const pageIds = new Set(
        zoneEdges.map((e) => (e.source === webApp.id ? e.target : e.source)),
      );
      const zonePages = graphNodes.filter((n) => n.type === "webPage" && pageIds.has(n.id));

      if (zonePages.length > 1) {
        const sortedPages = sortZonePages(zonePages as any) as LayoutNode[];
        const leadPage = sortedPages[0];
        if (!leadPage) return;

        const count = sortedPages.length;
        const leadDim = getNodeDimensions(leadPage);
        const stackWidth = leadDim.width + (count - 1) * Math.abs(CARD_HEADER_OFFSET_X);
        const stackHeight = leadDim.height + (count - 1) * CARD_HEADER_OFFSET_Y;

        dimensionOverrides.set(leadPage.id, { width: stackWidth, height: stackHeight });

        // Handle center ratio for the stack:
        const handleCenterY = 18 + ((count - 1) * CARD_HEADER_OFFSET_Y) / 2;
        stackHandleRatios.set(leadPage.id, Math.min(0.95, Math.max(0.02, handleCenterY / stackHeight)));

        // Exclude secondary pages and their edges from Dagre & mainGraphNodes
        const secondaryPages = sortedPages.slice(1);
        secondaryPages.forEach((p) => {
          stackedSecondaryNodeIdSet.add(p.id);
          secondaryToLeadPageMap.set(p.id, leadPage.id);
        });

        zoneEdges.forEach((e) => {
          const otherId = e.source === webApp.id ? e.target : e.source;
          if (stackedSecondaryNodeIdSet.has(otherId)) {
            stackedSecondaryEdgeIdSet.add(e.id);
          }
        });

        stackedZonesList.push({ leadPage, sortedPages });
      }
    });
  });

  const baseFlowEdges: LayoutEdge[] = graphEdges.filter(
    (e: LayoutEdge) =>
      !isHeadConnectionEdge(e) &&
      !isHangingTransformerEdge(e) &&
      !isHangingReferenceEdge(e) &&
      !isPaymentsPluginEdge(e) &&
      !isHangingStateStoreEdge(e) &&
      !isAuthWebAppEdge(e) &&
      !hangingRefNodeIdSet.has(e.source) &&
      !hangingRefNodeIdSet.has(e.target) &&
      !paymentsPluginNodeIdSet.has(e.source) &&
      !paymentsPluginNodeIdSet.has(e.target) &&
      !hangingStateStoreNodeIdSet.has(e.source) &&
      !hangingStateStoreNodeIdSet.has(e.target) &&
      !connectedAuthNodeIdSet.has(e.source) &&
      !connectedAuthNodeIdSet.has(e.target) &&
      !stackedSecondaryEdgeIdSet.has(e.id),
  );

  // Remap external edges connected to secondary stacked pages to their stack's leadPage
  // so connected services and external nodes maintain DAG hierarchy and do not get orphaned/misplaced
  const flowEdges: LayoutEdge[] = [];
  const seenFlowEdgeKeys = new Set<string>();

  baseFlowEdges.forEach((e) => {
    const remappedSource = secondaryToLeadPageMap.get(e.source) ?? e.source;
    const remappedTarget = secondaryToLeadPageMap.get(e.target) ?? e.target;

    // Discard intra-stack edges (between pages of the same stack) to avoid self-loops in Dagre
    if (remappedSource === remappedTarget) return;

    // Skip if either endpoint is still an unmapped secondary page
    if (
      stackedSecondaryNodeIdSet.has(remappedSource) ||
      stackedSecondaryNodeIdSet.has(remappedTarget)
    ) {
      return;
    }

    const key = `${remappedSource}:${e.sourceHandle ?? ""}->${remappedTarget}:${e.targetHandle ?? ""}`;
    if (seenFlowEdgeKeys.has(key)) return;
    seenFlowEdgeKeys.add(key);

    flowEdges.push(
      remappedSource !== e.source || remappedTarget !== e.target
        ? { ...e, source: remappedSource, target: remappedTarget }
        : e,
    );
  });

  // Bridge external/upstream connections through hanging reference nodes to their service
  // so Dagre maintains proper topological rank ordering
  hangingRefNodes.forEach((refNode) => {
    const targetServiceId = (refNode.data as any)?.targetServiceId;
    const targetServiceEdge =
      targetServiceId &&
      hangingRefEdges.find(
        (e) =>
          (e.target === refNode.id && e.source === targetServiceId) ||
          (e.source === refNode.id && e.target === targetServiceId),
      );
    const serviceEdge =
      targetServiceEdge ||
      hangingRefEdges.find((e) => {
        const otherId = e.target === refNode.id ? e.source : e.target;
        const otherNode = graphNodes.find((n) => n.id === otherId);
        return (
          otherNode &&
          (otherNode.type === "service" ||
            otherNode.type === "microservice" ||
            otherNode.type === "backend" ||
            otherNode.type === "api")
        );
      });
    if (!serviceEdge) return;
    const serviceId =
      serviceEdge.target === refNode.id ? serviceEdge.source : serviceEdge.target;

    const callerEdges = graphEdges.filter(
      (e) =>
        e.id !== serviceEdge.id &&
        (e.target === refNode.id || e.source === refNode.id),
    );

    callerEdges.forEach((ce) => {
      const callerId = ce.target === refNode.id ? ce.source : ce.target;
      const callerNode = graphNodes.find((n) => n.id === callerId);
      if (
        callerNode &&
        callerNode.type !== "storage" &&
        callerNode.type !== "database" &&
        callerNode.type !== "redis_instance" &&
        callerNode.type !== "entity" &&
        callerId !== serviceId
      ) {
        const remappedCaller = secondaryToLeadPageMap.get(callerId) ?? callerId;
        const key = `${remappedCaller}:->${serviceId}:`;
        if (!seenFlowEdgeKeys.has(key)) {
          seenFlowEdgeKeys.add(key);
          flowEdges.push({
            id: `bridge-${remappedCaller}->${serviceId}`,
            source: remappedCaller,
            target: serviceId,
            type: "connection",
          });
        }
      }
    });
  });

  const mainGraphNodes: LayoutNode[] = graphNodes.filter(
    (n: LayoutNode) =>
      !attachedHeadNodeIdSet.has(n.id) &&
      !hangingTransformerNodeIdSet.has(n.id) &&
      !hangingRefNodeIdSet.has(n.id) &&
      !paymentsPluginNodeIdSet.has(n.id) &&
      !hangingStateStoreNodeIdSet.has(n.id) &&
      !connectedAuthNodeIdSet.has(n.id) &&
      !stackedSecondaryNodeIdSet.has(n.id) &&
      !transformerDefNodeIdSet.has(n.id),
  );

  // 3.9. Compute topological tier ranks:
  // - All client nodes form the entry tier (rank 0 / chained client ranks)
  // - All servers invoked by Client are placed at Level 1 (Service Tier 1)
  // - Intra-level invoked servers stay at the same level (do not get pushed to Level 2)
  // - Servers invoked by Level 1 servers are placed at Level 2
  const { assignedRankMap, intraRankEdgeIds } = computeTierRanks({
    mainGraphNodes,
    flowEdges,
    direction,
  });

  // 4. Run Dagre layout for mainGraphNodes and flowEdges
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    marginx: 80,
    marginy: 80,
    ranksep: isHorizontal ? 200 : 150,
    nodesep: 50,
  });

  mainGraphNodes.forEach((node: LayoutNode) => {
    const override = dimensionOverrides.get(node.id);
    const { width, height } = override ?? getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  flowEdges.forEach((edge: LayoutEdge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      const srcRank = assignedRankMap.get(edge.source);
      const tgtRank = assignedRankMap.get(edge.target);
      // Only add edges that strictly advance to a higher rank (srcRank < tgtRank).
      // Omit intra-rank edges so Dagre's ranker does not push same-level nodes into separate ranks!
      if (
        !intraRankEdgeIds.has(edge.id) &&
        srcRank !== undefined &&
        tgtRank !== undefined &&
        srcRank < tgtRank
      ) {
        dagreGraph.setEdge(edge.source, edge.target);
      }
    }
  });

  dagre.layout(dagreGraph);

  // Enforce the computed rank on every node in dagreGraph
  mainGraphNodes.forEach((node: LayoutNode) => {
    const assignedRank = assignedRankMap.get(node.id);
    if (assignedRank !== undefined) {
      const dNode = dagreGraph.node(node.id) as any;
      if (dNode) {
        dNode.rank = assignedRank;
      }
    }
  });

  // 5. Store positions computed by Dagre
  const positionsMap = new Map<string, { x: number; y: number }>();
  mainGraphNodes.forEach((node: LayoutNode) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const override = dimensionOverrides.get(node.id);
    const { width, height } = override ?? getNodeDimensions(node);
    if (nodeWithPosition) {
      positionsMap.set(node.id, {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      });
    } else {
      positionsMap.set(node.id, { x: node.position.x, y: node.position.y });
    }
  });

  // 5.5. Barycenter refinement pass
  runBarycenterRefinement({
    dagreGraph,
    flowNodes: mainGraphNodes,
    flowEdges,
    positionsMap,
    isHorizontal,
    storeEndpoints,
    storeEvents,
    hangingEdges,
    hangingRefEdges,
    hangingRefNodes,
    paymentsPluginEdges,
    hangingStateStoreEdges,
    dimensionOverrides,
    stackHandleRatios,
    secondaryToLeadPageMap,
  });

  // 6. Layout attached head nodes grouped by category columns above each target node
  layoutHeadNodes({
    targetNodeIds,
    nodes: graphNodes,
    positionsMap,
    headEdges,
    attachedHeadNodes,
  });

  // 6.6. Layout hanging reference nodes (Table Ref, Redis Cache Ref, Vector DB Ref, LangGraph, Storage Bucket Ref) in a dedicated column immediately preceding (to the left of) their connected service node
  const { stackedRefDeckGroups = [] } =
    layoutHangingReferenceNodes({
      nodes: graphNodes,
      positionsMap,
      hangingRefEdges,
      hangingRefNodes,
      isHorizontal,
      storeEndpoints,
      storeEvents,
    }) || {};

  // 6.64. Layout connected Auth nodes immediately behind their connected WebApp node
  layoutAuthNodes({
    nodes: graphNodes,
    positionsMap,
    authEdges: authWebAppEdges,
    authNodes: connectedAuthNodes,
    isHorizontal,
  });

  // 6.65. Layout Payments plugin nodes (Creem Payments) immediately preceding their connected Better Auth node
  layoutPaymentsPluginNodes({
    nodes: graphNodes,
    positionsMap,
    paymentsPluginEdges,
    paymentsPluginNodes,
    isHorizontal,
  });

  // 6.68. Stack WebPage nodes that are in hand-of-cards mode per WebApp zone
  stackedZonesList.forEach(({ leadPage, sortedPages }) => {
    const leadPos = positionsMap.get(leadPage.id);
    if (!leadPos) return;

    // Card 0 is placed at baseX = leadPos.x + (count - 1) * Math.abs(CARD_HEADER_OFFSET_X).
    // Card idx is placed at baseX + idx * CARD_HEADER_OFFSET_X.
    // This guarantees the front/leftmost card (idx = count - 1) starts at leadPos.x,
    // and the entire stack fits within the reserved stackWidth without intruding towards the WebApp node.
    const baseX = leadPos.x + (sortedPages.length - 1) * Math.abs(CARD_HEADER_OFFSET_X);
    const baseY = leadPos.y;

    sortedPages.forEach((page, idx) => {
      positionsMap.set(page.id, {
        x: baseX + idx * CARD_HEADER_OFFSET_X,
        y: baseY + idx * CARD_HEADER_OFFSET_Y,
      });
    });
  });

  // 6.69. Layout StateStore nodes directly on top of the WebApp node in the WebApp column
  layoutHangingStateStoreNodes({
    nodes: graphNodes,
    positionsMap,
    hangingStateStoreEdges,
    hangingStateStoreNodes,
    isHorizontal,
    stackedZonesList,
  });

  // 6.70. Layout hanging transformer nodes in a dedicated column right before their connected service or webPage node
  layoutHangingTransformerNodes({
    nodes: graphNodes,
    positionsMap,
    hangingEdges,
    hangingTransformerNodes,
    isHorizontal,
    storeEndpoints,
    storeEvents,
    secondaryToLeadPageMap,
  });

  // 6.695. Final safety overlap resolution pass for all positioned nodes
  const resolveAllNodeOverlaps = () => {
    const padding = 30;
    const maxIters = 25;
    let hasOverlaps = true;
    let iter = 0;

    while (hasOverlaps && iter < maxIters) {
      hasOverlaps = false;
      iter++;

      for (let i = 0; i < graphNodes.length; i++) {
        const nodeA = graphNodes[i]!;
        const posA = positionsMap.get(nodeA.id);
        if (!posA) continue;
        const dimA = getNodeDimensions(nodeA);

        for (let j = i + 1; j < graphNodes.length; j++) {
          const nodeB = graphNodes[j]!;
          const posB = positionsMap.get(nodeB.id);
          if (!posB) continue;

          // Skip pages that belong to the same hand-of-cards stack
          const leadA =
            secondaryToLeadPageMap.get(nodeA.id) ??
            (stackedZonesList.some((z) => z.leadPage.id === nodeA.id)
              ? nodeA.id
              : null);
          const leadB =
            secondaryToLeadPageMap.get(nodeB.id) ??
            (stackedZonesList.some((z) => z.leadPage.id === nodeB.id)
              ? nodeB.id
              : null);
          if (leadA && leadB && leadA === leadB) continue;

          // Skip reference cards that belong to the same endpoint deck of cards
          const inSameRefDeck = stackedRefDeckGroups.some(
            (group) => group.includes(nodeA.id) && group.includes(nodeB.id),
          );
          if (inSameRefDeck) continue;

          const dimB = getNodeDimensions(nodeB);

          const overlapX =
            Math.min(posA.x + dimA.width + padding, posB.x + dimB.width + padding) -
            Math.max(posA.x, posB.x);
          const overlapY =
            Math.min(posA.y + dimA.height + padding, posB.y + dimB.height + padding) -
            Math.max(posA.y, posB.y);

          if (overlapX > 0 && overlapY > 0) {
            hasOverlaps = true;
            if (isHorizontal) {
              if (posA.y <= posB.y) {
                positionsMap.set(nodeB.id, { x: posB.x, y: posB.y + overlapY });
              } else {
                positionsMap.set(nodeA.id, { x: posA.x, y: posA.y + overlapY });
              }
            } else {
              if (posA.x <= posB.x) {
                positionsMap.set(nodeB.id, { x: posB.x + overlapX, y: posB.y });
              } else {
                positionsMap.set(nodeA.id, { x: posA.x + overlapX, y: posA.y });
              }
            }
          }
        }
      }
    }
  };
  resolveAllNodeOverlaps();

  // 6.7. Enforce positive canvas origin margin (minX >= 60, minY >= 60)
  let globalMinX = Infinity;
  let globalMinY = Infinity;
  positionsMap.forEach((pos) => {
    if (pos.x < globalMinX) globalMinX = pos.x;
    if (pos.y < globalMinY) globalMinY = pos.y;
  });

  const shiftX = globalMinX < 60 ? 60 - globalMinX : 0;
  const shiftY = globalMinY < 60 ? 60 - globalMinY : 0;

  if (shiftX !== 0 || shiftY !== 0) {
    positionsMap.forEach((pos, id) => {
      positionsMap.set(id, {
        x: pos.x + shiftX,
        y: pos.y + shiftY,
      });
    });
  }

  // 6.7. Layout TypesNodes and Transformer definition nodes in dedicated away column(s) on the left margin
  if (typesNodes.length > 0 || transformerDefNodes.length > 0) {
    layoutTypesNodes({
      typesNodes,
      transformerNodes: transformerDefNodes,
      positionsMap,
      edges,
      startMarginX: 60,
      startMarginY: 60,
    });
  }

  // 7. Update node positions atomically (only for nodes whose position or handle orientation actually changed)
  const allLayoutNodes = [...graphNodes, ...typesNodes];
  if (onNodesChange) {
    const nodeChanges: PositionNodeChange[] = allLayoutNodes
      .filter((node: LayoutNode) => {
        const pos = positionsMap.get(node.id);
        if (!pos) return false;

        const isAttachedHead = attachedHeadNodeIdSet.has(node.id);
        const isTypesNode = node.type === "types";
        const isTransformerDef = transformerDefNodeIdSet.has(node.id);
        const nextSourcePosition = isAttachedHead
          ? Position.Bottom
          : isTypesNode || isTransformerDef
            ? Position.Right
            : isHorizontal
              ? Position.Right
              : Position.Bottom;
        const nextTargetPosition = isAttachedHead
          ? Position.Top
          : isTypesNode || isTransformerDef
            ? Position.Left
            : isHorizontal
              ? Position.Left
              : Position.Top;

        const hasPosChanged =
          Math.abs(node.position.x - pos.x) > 0.5 ||
          Math.abs(node.position.y - pos.y) > 0.5;
        const hasHandleChanged =
          (Boolean(node.sourcePosition) && node.sourcePosition !== nextSourcePosition) ||
          (Boolean(node.targetPosition) && node.targetPosition !== nextTargetPosition);

        return hasPosChanged || hasHandleChanged;
      })
      .map((node: LayoutNode) => {
        const pos = positionsMap.get(node.id) ?? {
          x: node.position.x,
          y: node.position.y,
        };
        const isAttachedHead = attachedHeadNodeIdSet.has(node.id);
        const isTypesNode = node.type === "types";
        const isTransformerDef = transformerDefNodeIdSet.has(node.id);
        return {
          id: node.id,
          type: "position",
          position: pos,
          sourcePosition: isAttachedHead
            ? Position.Bottom
            : isTypesNode || isTransformerDef
              ? Position.Right
              : isHorizontal
                ? Position.Right
                : Position.Bottom,
          targetPosition: isAttachedHead
            ? Position.Top
            : isTypesNode || isTransformerDef
              ? Position.Left
              : isHorizontal
                ? Position.Left
                : Position.Top,
        };
      });
    if (nodeChanges.length > 0) {
      onNodesChange(nodeChanges);
    }
  } else {
    useBackendCanvasStore.setState((state) => {
      const movedNodeIds = new Set<string>();
      const updatedNodes = state.nodes.map((node) => {
        const pos = positionsMap.get(node.id);
        if (!pos) return node;
        const isAttachedHead = attachedHeadNodeIdSet.has(node.id);
        const isTypesNode = node.type === "types";
        const isTransformerDef = transformerDefNodeIdSet.has(node.id);
        const nextSourcePosition = isAttachedHead
          ? Position.Bottom
          : isTypesNode || isTransformerDef
            ? Position.Right
            : isHorizontal
              ? Position.Right
              : Position.Bottom;
        const nextTargetPosition = isAttachedHead
          ? Position.Top
          : isTypesNode || isTransformerDef
            ? Position.Left
            : isHorizontal
              ? Position.Left
              : Position.Top;

        const hasPosChanged =
          Math.abs(node.position.x - pos.x) > 0.5 ||
          Math.abs(node.position.y - pos.y) > 0.5;
        const hasHandleChanged =
          (Boolean(node.sourcePosition) && node.sourcePosition !== nextSourcePosition) ||
          (Boolean(node.targetPosition) && node.targetPosition !== nextTargetPosition);

        if (hasPosChanged || hasHandleChanged) {
          movedNodeIds.add(node.id);
        }

        return {
          ...node,
          position: pos,
          sourcePosition: nextSourcePosition,
          targetPosition: nextTargetPosition,
        };
      });

      const upserts = updatedNodes.filter((n) => movedNodeIds.has(n.id));

      return {
        nodes: updatedNodes,
        pendingNodeUpserts: [
          ...state.pendingNodeUpserts.filter((u) => !movedNodeIds.has(u.id)),
          ...upserts,
        ],
      };
    });
  }

  const flowNodes = getGraphFlowNodes(nodes, edges);
  const targetNodes =
    flowNodes.length > 0
      ? flowNodes
      : graphNodes.length > 0
        ? graphNodes
        : nodes;

  setTimeout(() => {
    fitView({
      nodes: targetNodes.map((n) => ({ id: n.id })),
      duration: 300,
      padding: 0.2,
      maxZoom: 0.85,
    });
  }, 50);
}
