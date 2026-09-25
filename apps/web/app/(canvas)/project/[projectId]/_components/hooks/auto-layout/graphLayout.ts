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
import { layoutHangingStateStoreNodes } from "./hangingStateStoreLayout";
import { layoutTypesNodes } from "./typesNodeLayout";
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
  fitView: (options?: { duration?: number; padding?: number; maxZoom?: number }) => void;
  direction?: string;
  storeEndpoints?: EndpointWithNode[];
  storeEvents?: EventWithNode[];
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
        targetNode?.type === "bucket_ref")
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
    const isTransType =
      sourceNode.type === "transformer_ref" ||
      sourceNode.type === "transformer" ||
      sourceNode.type === "hook" ||
      sourceNode.type === "hook_ref";
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

  const headEdges: LayoutEdge[] = graphEdges.filter(isHeadConnectionEdge);
  const hangingEdges: LayoutEdge[] = graphEdges.filter(isHangingTransformerEdge);
  const hangingRefEdges: LayoutEdge[] = graphEdges.filter(isHangingReferenceEdge);
  const paymentsPluginEdges: LayoutEdge[] = graphEdges.filter(isPaymentsPluginEdge);
  const hangingStateStoreEdges: LayoutEdge[] = graphEdges.filter(isHangingStateStoreEdge);

  // 3. Identify attached head nodes, hanging transformer nodes, and hanging reference nodes
  const attachedHeadNodeIdSet = new Set<string>(
    headEdges.map((e: LayoutEdge) => e.source),
  );
  const attachedHeadNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    attachedHeadNodeIdSet.has(n.id),
  );

  const hangingTransformerNodeIdSet = new Set<string>(
    hangingEdges.map((e: LayoutEdge) => e.source),
  );
  const hangingTransformerNodes: LayoutNode[] = graphNodes.filter((n: LayoutNode) =>
    hangingTransformerNodeIdSet.has(n.id),
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
      !hangingRefNodeIdSet.has(e.source) &&
      !hangingRefNodeIdSet.has(e.target) &&
      !paymentsPluginNodeIdSet.has(e.source) &&
      !paymentsPluginNodeIdSet.has(e.target) &&
      !hangingStateStoreNodeIdSet.has(e.source) &&
      !hangingStateStoreNodeIdSet.has(e.target) &&
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

  const mainGraphNodes: LayoutNode[] = graphNodes.filter(
    (n: LayoutNode) =>
      !attachedHeadNodeIdSet.has(n.id) &&
      !hangingTransformerNodeIdSet.has(n.id) &&
      !hangingRefNodeIdSet.has(n.id) &&
      !paymentsPluginNodeIdSet.has(n.id) &&
      !hangingStateStoreNodeIdSet.has(n.id) &&
      !stackedSecondaryNodeIdSet.has(n.id),
  );

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
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

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

  // 6.5. Layout hanging transformer nodes in a dedicated column right before their connected service node
  layoutHangingTransformerNodes({
    nodes: graphNodes,
    positionsMap,
    hangingEdges,
    hangingTransformerNodes,
    isHorizontal,
    storeEndpoints,
    storeEvents,
  });

  // 6.6. Layout hanging reference nodes (Table Ref, Redis Cache Ref, Vector DB Ref) in a dedicated column right after their connected service node
  layoutHangingReferenceNodes({
    nodes: graphNodes,
    positionsMap,
    hangingRefEdges,
    hangingRefNodes,
    isHorizontal,
    storeEndpoints,
    storeEvents,
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

  // 6.69. Layout hanging StateStore nodes immediately preceding their connected WebPage node
  layoutHangingStateStoreNodes({
    nodes: graphNodes,
    positionsMap,
    hangingStateStoreEdges,
    hangingStateStoreNodes,
    isHorizontal,
    stackedZonesList,
  });

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

  // 6.7. Layout TypesNodes in dedicated away column(s) on the left margin
  if (typesNodes.length > 0) {
    layoutTypesNodes({
      typesNodes,
      positionsMap,
      edges,
      startMarginX: 60,
      startMarginY: 60,
    });
  }

  // 7. Update node positions atomically
  const allLayoutNodes = [...graphNodes, ...typesNodes];
  if (onNodesChange) {
    const nodeChanges: PositionNodeChange[] = allLayoutNodes.map((node: LayoutNode) => {
      const pos = positionsMap.get(node.id) ?? {
        x: node.position.x,
        y: node.position.y,
      };
      const isAttachedHead = attachedHeadNodeIdSet.has(node.id);
      const isTypesNode = node.type === "types";
      return {
        id: node.id,
        type: "position",
        position: pos,
        sourcePosition: isAttachedHead
          ? Position.Bottom
          : isTypesNode
            ? Position.Right
            : isHorizontal
              ? Position.Right
              : Position.Bottom,
        targetPosition: isAttachedHead
          ? Position.Top
          : isTypesNode
            ? Position.Left
            : isHorizontal
              ? Position.Left
              : Position.Top,
      };
    });
    onNodesChange(nodeChanges);
  } else {
    useBackendCanvasStore.setState((state) => {
      const updatedNodes = state.nodes.map((node) => {
        const pos = positionsMap.get(node.id);
        if (!pos) return node;
        const isAttachedHead = attachedHeadNodeIdSet.has(node.id);
        const isTypesNode = node.type === "types";
        return {
          ...node,
          position: pos,
          sourcePosition: isAttachedHead
            ? Position.Bottom
            : isTypesNode
              ? Position.Right
              : isHorizontal
                ? Position.Right
                : Position.Bottom,
          targetPosition: isAttachedHead
            ? Position.Top
            : isTypesNode
              ? Position.Left
              : isHorizontal
                ? Position.Left
                : Position.Top,
        };
      });

      const movedNodeIds = new Set(positionsMap.keys());
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

  setTimeout(() => {
    fitView({ duration: 300, padding: 0.2, maxZoom: 0.85 });
  }, 50);
}
