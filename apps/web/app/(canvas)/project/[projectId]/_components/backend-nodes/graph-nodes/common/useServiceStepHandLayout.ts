import React, { useCallback, useMemo } from "react";
import type { NodeChange } from "@xyflow/react";
import { BackendNode, BackendEdge, Endpoint } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const STEP_CARD_HEADER_OFFSET_Y = 44;
export const STEP_CARD_HEADER_OFFSET_X = -8;
export const STEP_CARD_EXPANDED_GAP_Y = 360;

export const SERVICE_STEP_NODE_TYPES = new Set<string>([
  "transformer_ref",
  "transformer",
  "db_ref",
  "redis-cache",
  "langgraph",
  "storage_operation_ref",
]);

export interface ServiceStepHandLayoutInfo {
  connectedServiceNode: BackendNode | null;
  targetEndpointId: string | null;
  siblingSteps: BackendNode[];
  cardIndex: number;
  totalCards: number;
  hasMultipleCards: boolean;
  isStacked: boolean;
  isStackExpanded: boolean;
  toggleStack: () => void;
  selectCard: (targetIndex: number) => void;
  moveCard: (direction: "up" | "down") => void;
  bringCardToFront: () => void;
}

/**
 * Sorts service step reference nodes in a stable, logical order:
 * 1. Custom stackOrder if present
 * 2. Execution order in endpoint.pipelineSteps if matched
 * 3. Stable alphabetical by label
 */
export function sortServiceStepNodes(
  steps: BackendNode[],
  serviceNode?: BackendNode | null,
  endpointId?: string | null,
): BackendNode[] {
  const endpoint = endpointId && serviceNode?.data?.endpoints
    ? (serviceNode.data.endpoints as Endpoint[]).find((e) => e.id === endpointId)
    : undefined;
  const pipelineSteps = endpoint?.pipelineSteps || [];

  return [...steps].sort((a, b) => {
    const orderA = typeof a.data?.stackOrder === "number" ? a.data.stackOrder : undefined;
    const orderB = typeof b.data?.stackOrder === "number" ? b.data.stackOrder : undefined;

    if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
      return orderA - orderB;
    }
    if (orderA !== undefined && orderB === undefined) return -1;
    if (orderB !== undefined && orderA === undefined) return 1;

    // Compare by index in endpoint.pipelineSteps
    if (pipelineSteps.length > 0) {
      const idxA = pipelineSteps.findIndex(
        (ps) =>
          ps.transformerNodeId === a.id ||
          ps.tableNodeId === a.id ||
          ps.langGraphTargetNodeId === a.id ||
          ps.name === a.data?.label ||
          (a.type === "transformer_ref" && ps.transformerNodeId === a.data?.transformerRef),
      );
      const idxB = pipelineSteps.findIndex(
        (ps) =>
          ps.transformerNodeId === b.id ||
          ps.tableNodeId === b.id ||
          ps.langGraphTargetNodeId === b.id ||
          ps.name === b.data?.label ||
          (b.type === "transformer_ref" && ps.transformerNodeId === b.data?.transformerRef),
      );

      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) {
        return idxA - idxB;
      }
      if (idxA !== -1 && idxB === -1) return -1;
      if (idxB !== -1 && idxA === -1) return 1;
    }

    const labelA = (a.data?.label || "").trim().toLowerCase();
    const labelB = (b.data?.label || "").trim().toLowerCase();
    return labelA.localeCompare(labelB);
  });
}

/**
 * Hook for service step reference nodes (db_ref, transformer_ref, redis-cache, langgraph)
 * to manage their hand-of-cards stack status on the left of their service node.
 */
export function useServiceStepHandLayout(
  nodeId: string,
  nodes: BackendNode[],
  edges: BackendEdge[],
  updateNode: (id: string, changes: Partial<BackendNode>) => void,
): ServiceStepHandLayoutInfo {
  // Find edge connecting this node to a service or webPage node
  const serviceEdge = useMemo(() => {
    return edges.find((e) => {
      if (e.source === nodeId) {
        const target = nodes.find((n) => n.id === e.target);
        return target?.type === "service" || target?.type === "webPage";
      }
      if (e.target === nodeId) {
        const source = nodes.find((n) => n.id === e.source);
        return source?.type === "service" || source?.type === "webPage";
      }
      return false;
    });
  }, [edges, nodes, nodeId]);

  const connectedServiceNode = useMemo(() => {
    if (!serviceEdge) return null;
    const sId = serviceEdge.source === nodeId ? serviceEdge.target : serviceEdge.source;
    return nodes.find((n) => n.id === sId && (n.type === "service" || n.type === "webPage")) || null;
  }, [serviceEdge, nodes, nodeId]);

  const targetEndpointId = useMemo(() => {
    if (!serviceEdge || !connectedServiceNode) return null;
    const serviceHandle =
      serviceEdge.source === connectedServiceNode.id
        ? serviceEdge.sourceHandle
        : serviceEdge.targetHandle;
    if (!serviceHandle) return null;
    return serviceHandle.replace(
      /^(endpoint-in-|endpoint-out-|consumedEvents-in-|consumedEvents-out-|events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/,
      "",
    );
  }, [serviceEdge, connectedServiceNode]);

  // Find all sibling step nodes connected to the same service node & endpoint
  const siblingSteps = useMemo(() => {
    if (!connectedServiceNode) return [];
    const connectedEdges = edges.filter((e) => {
      const isSrc = e.source === connectedServiceNode.id;
      const isTgt = e.target === connectedServiceNode.id;
      if (!isSrc && !isTgt) return false;
      const otherId = isSrc ? e.target : e.source;
      const otherNode = nodes.find((n) => n.id === otherId);
      if (!otherNode || !SERVICE_STEP_NODE_TYPES.has(otherNode.type || "")) return false;

      if (targetEndpointId) {
        const handle = isSrc ? e.sourceHandle : e.targetHandle;
        return !handle || handle.includes(targetEndpointId);
      }
      return true;
    });

    const stepIds = new Set(
      connectedEdges.map((e) =>
        e.source === connectedServiceNode.id ? e.target : e.source,
      ),
    );
    const stepNodes = nodes.filter(
      (n) => SERVICE_STEP_NODE_TYPES.has(n.type || "") && stepIds.has(n.id),
    );

    return sortServiceStepNodes(stepNodes, connectedServiceNode, targetEndpointId);
  }, [connectedServiceNode, targetEndpointId, edges, nodes]);

  const cardIndex = useMemo(() => {
    const idx = siblingSteps.findIndex((s) => s.id === nodeId);
    return idx >= 0 ? idx : 0;
  }, [siblingSteps, nodeId]);

  const totalCards = siblingSteps.length;
  const hasMultipleCards = totalCards > 1;

  const stackKey = targetEndpointId || connectedServiceNode?.id || "default";

  const isStackExpanded = useMemo(() => {
    if (!connectedServiceNode) return false;
    const expandedList = Array.isArray(connectedServiceNode.data?.expandedStepStacks)
      ? connectedServiceNode.data.expandedStepStacks
      : [];
    return expandedList.includes(stackKey);
  }, [connectedServiceNode, stackKey]);

  const isStacked = hasMultipleCards && !isStackExpanded;

  // Auto-pack / re-align cards if offsets drift
  React.useEffect(() => {
    if (
      cardIndex !== 0 ||
      !hasMultipleCards ||
      isStackExpanded ||
      !connectedServiceNode
    )
      return;

    const firstCard = siblingSteps[0];
    const secondCard = siblingSteps[1];
    if (!firstCard?.position || !secondCard?.position) return;

    const deltaY = secondCard.position.y - firstCard.position.y;
    const deltaX = secondCard.position.x - firstCard.position.x;
    const needsAlignment =
      Math.abs(deltaY - STEP_CARD_HEADER_OFFSET_Y) > 5 ||
      Math.abs(deltaX - STEP_CARD_HEADER_OFFSET_X) > 2;

    if (needsAlignment) {
      const baseX = firstCard.position.x;
      const baseY = firstCard.position.y;
      siblingSteps.forEach((step, idx) => {
        updateNode(step.id, {
          position: {
            x: baseX + idx * STEP_CARD_HEADER_OFFSET_X,
            y: baseY + idx * STEP_CARD_HEADER_OFFSET_Y,
          },
        });
      });
    }
  }, [
    cardIndex,
    hasMultipleCards,
    isStackExpanded,
    connectedServiceNode,
    siblingSteps,
    updateNode,
  ]);

  const selectCard = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= siblingSteps.length) return;
      const targetNode = siblingSteps[targetIndex];
      if (!targetNode) return;

      const store = useBackendCanvasStore.getState();
      const selectChanges: NodeChange[] = nodes
        .filter((n) => SERVICE_STEP_NODE_TYPES.has(n.type || ""))
        .map((n) => ({
          type: "select",
          id: n.id,
          selected: n.id === targetNode.id,
        }));
      store.onNodesChange(selectChanges);
    },
    [siblingSteps, nodes],
  );

  const moveCard = useCallback(
    (direction: "up" | "down") => {
      if (siblingSteps.length <= 1) return;
      const currentIndex = siblingSteps.findIndex((s) => s.id === nodeId);
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= siblingSteps.length) return;

      const nextSteps = [...siblingSteps];
      const currentCard = nextSteps[currentIndex];
      const targetCard = nextSteps[targetIndex];
      if (!currentCard || !targetCard) return;

      nextSteps[currentIndex] = targetCard;
      nextSteps[targetIndex] = currentCard;

      const baseX = siblingSteps[0]?.position?.x ?? 0;
      const baseY = siblingSteps[0]?.position?.y ?? 0;

      nextSteps.forEach((step, idx) => {
        updateNode(step.id, {
          position: {
            x: baseX + idx * STEP_CARD_HEADER_OFFSET_X,
            y: baseY + idx * STEP_CARD_HEADER_OFFSET_Y,
          },
          data: {
            ...step.data,
            stackOrder: idx,
          },
        });
      });

      const store = useBackendCanvasStore.getState();
      const selectChanges: NodeChange[] = nodes
        .filter((n) => SERVICE_STEP_NODE_TYPES.has(n.type || ""))
        .map((n) => ({
          type: "select",
          id: n.id,
          selected: n.id === nodeId,
        }));
      store.onNodesChange(selectChanges);
    },
    [siblingSteps, nodeId, updateNode, nodes],
  );

  const bringCardToFront = useCallback(() => {
    if (siblingSteps.length <= 1) return;
    const currentIndex = siblingSteps.findIndex((s) => s.id === nodeId);
    if (currentIndex === -1) return;

    if (currentIndex === siblingSteps.length - 1) {
      selectCard(currentIndex);
      return;
    }

    const nextSteps = siblingSteps.filter((s) => s.id !== nodeId);
    const thisCard = siblingSteps[currentIndex];
    if (!thisCard) return;
    nextSteps.push(thisCard);

    const baseX = siblingSteps[0]?.position?.x ?? 0;
    const baseY = siblingSteps[0]?.position?.y ?? 0;

    nextSteps.forEach((step, idx) => {
      updateNode(step.id, {
        position: {
          x: baseX + idx * STEP_CARD_HEADER_OFFSET_X,
          y: baseY + idx * STEP_CARD_HEADER_OFFSET_Y,
        },
        data: {
          ...step.data,
          stackOrder: idx,
        },
      });
    });

    const store = useBackendCanvasStore.getState();
    const selectChanges: NodeChange[] = nodes
      .filter((n) => SERVICE_STEP_NODE_TYPES.has(n.type || ""))
      .map((n) => ({
        type: "select",
        id: n.id,
        selected: n.id === nodeId,
      }));
      store.onNodesChange(selectChanges);
  }, [siblingSteps, nodeId, updateNode, nodes, selectCard]);

  const toggleStack = useCallback(() => {
    if (!connectedServiceNode) return;
    const currentExpanded = Array.isArray(connectedServiceNode.data?.expandedStepStacks)
      ? connectedServiceNode.data.expandedStepStacks
      : [];
    const isNowExpanded = currentExpanded.includes(stackKey);
    const nextExpanded = isNowExpanded
      ? currentExpanded.filter((k: string) => k !== stackKey)
      : [...currentExpanded, stackKey];

    updateNode(connectedServiceNode.id, {
      data: {
        ...connectedServiceNode.data,
        expandedStepStacks: nextExpanded,
      },
    });

    const baseX = siblingSteps[0]?.position?.x ?? 0;
    const baseY = siblingSteps[0]?.position?.y ?? 0;

    if (!isNowExpanded) {
      // Fan out steps vertically
      siblingSteps.forEach((step, idx) => {
        updateNode(step.id, {
          position: {
            x: baseX,
            y: baseY + idx * STEP_CARD_EXPANDED_GAP_Y,
          },
        });
      });
    } else {
      // Collapse back to deck
      siblingSteps.forEach((step, idx) => {
        updateNode(step.id, {
          position: {
            x: baseX + idx * STEP_CARD_HEADER_OFFSET_X,
            y: baseY + idx * STEP_CARD_HEADER_OFFSET_Y,
          },
        });
      });
    }
  }, [connectedServiceNode, stackKey, siblingSteps, updateNode]);

  return {
    connectedServiceNode,
    targetEndpointId,
    siblingSteps,
    cardIndex,
    totalCards,
    hasMultipleCards,
    isStacked,
    isStackExpanded,
    toggleStack,
    selectCard,
    moveCard,
    bringCardToFront,
  };
}
