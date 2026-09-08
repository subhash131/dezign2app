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
import { layoutTypesNodes } from "./typesNodeLayout";
import type { EndpointWithNode, EventWithNode } from "@workspace/canvas";

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

  const headEdges: LayoutEdge[] = graphEdges.filter(isHeadConnectionEdge);
  const hangingEdges: LayoutEdge[] = graphEdges.filter(isHangingTransformerEdge);
  const hangingRefEdges: LayoutEdge[] = graphEdges.filter(isHangingReferenceEdge);

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

  const flowEdges: LayoutEdge[] = graphEdges.filter(
    (e: LayoutEdge) =>
      !isHeadConnectionEdge(e) &&
      !isHangingTransformerEdge(e) &&
      !isHangingReferenceEdge(e) &&
      !hangingRefNodeIdSet.has(e.source) &&
      !hangingRefNodeIdSet.has(e.target),
  );

  const mainGraphNodes: LayoutNode[] = graphNodes.filter(
    (n: LayoutNode) =>
      !attachedHeadNodeIdSet.has(n.id) &&
      !hangingTransformerNodeIdSet.has(n.id) &&
      !hangingRefNodeIdSet.has(n.id),
  );

  // 4. Run Dagre layout for mainGraphNodes and flowEdges
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    marginx: 80,
    marginy: 80,
    ranksep: isHorizontal
      ? hangingRefEdges.length > 0
        ? 520
        : 200
      : 150,
    nodesep: 50,
  });

  mainGraphNodes.forEach((node: LayoutNode) => {
    const { width, height } = getNodeDimensions(node);
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
    const { width, height } = getNodeDimensions(node);
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

  // 6.6. Enforce positive canvas origin margin (minX >= 60, minY >= 60)
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
