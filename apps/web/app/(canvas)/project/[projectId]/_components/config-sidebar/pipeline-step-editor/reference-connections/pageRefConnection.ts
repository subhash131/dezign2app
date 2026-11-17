import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { PipelineStepDraft } from "../types";
import { flattenAllPipelineSteps } from "../stepConstants";
import { isLayoutNode, getLayoutNodeDetails } from "./pageRefLayoutUtils";

// ---------------------------------------------------------------------------
// Web Page Ref Node & Edge Synchronization Helpers
// ---------------------------------------------------------------------------

export interface EnsurePageRefConnectionParams {
  targetPageId?: string;
  pageRefNodeId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  stepId?: string;
}

export interface PageRefConnectionResult {
  pageRefNodeId: string;
  targetPageId?: string;
}

export interface CleanupPageRefConnectionParams {
  pageRefNodeId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  remainingSteps: PipelineStepDraft[];
}

/**
 * Ensures a PageRefNode (type="page_ref") exists on canvas for the given target page
 * and connects the ServiceNode endpoint/consumedEvent handle to it.
 */
export function ensurePageRefConnection({
  targetPageId,
  pageRefNodeId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  stepId,
}: EnsurePageRefConnectionParams): PageRefConnectionResult | undefined {
  if (!serviceNodeId) return undefined;
  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;
  const edges = store.edges;

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-out-${consumedEventId}`
    : `endpoint-out-${serviceNodeId}`;

  // 1. Locate target webPage if specified, or pick first webPage on canvas
  const allWebPages = allNodes.filter((n) => n.type === "webPage");
  const targetWebPage = targetPageId
    ? allWebPages.find((p) => p.id === targetPageId)
    : allWebPages[0];

  const resolvedTargetPageId = targetPageId || targetWebPage?.id;

  // 2. Locate or validate page_ref node:
  let pageRefNode = pageRefNodeId
    ? allNodes.find((n) => n.id === pageRefNodeId && n.type === "page_ref")
    : undefined;

  if (pageRefNode) {
    const currentTarget = pageRefNode.data?.targetPageId || pageRefNode.data?.pageRefId;
    if (resolvedTargetPageId && currentTarget && currentTarget !== resolvedTargetPageId) {
      // The step changed its target page!
      // Check if this pageRefNode is used by any other step in any endpoint or event:
      const isUsedByOtherStep =
        store.endpoints.some((ep) =>
          ep.pipelineSteps?.some(
            (s) =>
              (stepId ? s.id !== stepId : true) &&
              (s.clientDeliveryPageRefNodeId === pageRefNode!.id ||
                (!s.clientDeliveryPageRefNodeId && s.clientDeliveryTargetPageId === currentTarget)),
          ),
        ) ||
        store.events.some((ev) =>
          ev.pipelineSteps?.some(
            (s) =>
              (stepId ? s.id !== stepId : true) &&
              (s.clientDeliveryPageRefNodeId === pageRefNode!.id ||
                (!s.clientDeliveryPageRefNodeId && s.clientDeliveryTargetPageId === currentTarget)),
          ),
        );

      if (isUsedByOtherStep) {
        // Do NOT retarget this pageRefNode — other step(s) rely on it!
        // Instead, find or create another page_ref node for resolvedTargetPageId
        pageRefNode = undefined;
      } else {
        // No other step uses this pageRefNode.
        // Check if another page_ref node already targets resolvedTargetPageId
        const existingNodeForTarget = allNodes.find(
          (n) =>
            n.id !== pageRefNode!.id &&
            n.type === "page_ref" &&
            (n.data?.targetPageId === resolvedTargetPageId || n.data?.pageRefId === resolvedTargetPageId),
        );
        if (existingNodeForTarget) {
          // Clean up the orphaned old node and edge
          const oldEdges = edges.filter((e) => e.target === pageRefNode!.id || e.source === pageRefNode!.id);
          oldEdges.forEach((e) => store.deleteEdge(e.id));
          store.deleteNode(pageRefNode.id);
          pageRefNode = existingNodeForTarget;
        } else {
          // Safely update this pageRefNode in place
          const isLayout = isLayoutNode(targetWebPage);
          const layoutDetails = isLayout && targetWebPage ? getLayoutNodeDetails(targetWebPage, allNodes, edges) : null;
          const pageLabel = targetWebPage?.data?.label || "Page";
          const cleanLabel = pageLabel.trim().toLowerCase();
          const isRoot = !isLayout && (targetWebPage?.data?.isRoot === true || cleanLabel === "/");
          const displayLabel = layoutDetails ? layoutDetails.displayTitle : isRoot ? "/" : pageLabel;

          store.updateNode(pageRefNode.id, {
            data: {
              ...pageRefNode.data,
              targetPageId: resolvedTargetPageId,
              pageRefId: resolvedTargetPageId,
              targetPageLabel: layoutDetails ? layoutDetails.displayTitle : pageLabel,
              label: `Ref: ${displayLabel}`,
            },
          });
        }
      }
    }
  }

  // 3. If no matching pageRefNode found yet, check if there is an existing page_ref node
  // already connected to this service/handle that targets resolvedTargetPageId
  if (!pageRefNode && resolvedTargetPageId) {
    const existingEdge = edges.find((e) => {
      if (e.source !== serviceNodeId) return false;
      const matchesHandle =
        !e.sourceHandle ||
        e.sourceHandle === sourceHandle ||
        (endpointId && e.sourceHandle.includes(endpointId));
      if (!matchesHandle) return false;
      const targetNode = allNodes.find((n) => n.id === e.target && n.type === "page_ref");
      return (
        targetNode &&
        (targetNode.data?.targetPageId === resolvedTargetPageId ||
          targetNode.data?.pageRefId === resolvedTargetPageId)
      );
    });
    if (existingEdge) {
      pageRefNode = allNodes.find((n) => n.id === existingEdge.target);
    }
  }

  // 4. If not connected, look for ANY existing page_ref node targeting resolvedTargetPageId
  if (!pageRefNode && resolvedTargetPageId) {
    pageRefNode = allNodes.find(
      (n) =>
        n.type === "page_ref" &&
        (n.data?.targetPageId === resolvedTargetPageId ||
          n.data?.pageRefId === resolvedTargetPageId),
    );
  }

  // 5. If still no page_ref node exists, create one!
  if (!pageRefNode) {
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const basePos = serviceNode?.position || { x: 300, y: 200 };
    const existingPageRefs = allNodes.filter((n) => n.type === "page_ref");
    const yOffset = existingPageRefs.length * 110;
    const newPos = {
      x: basePos.x + 380,
      y: basePos.y + yOffset,
    };

    const newRefId = crypto.randomUUID();
    const isLayout = isLayoutNode(targetWebPage);
    const layoutDetails = isLayout && targetWebPage ? getLayoutNodeDetails(targetWebPage, allNodes, edges) : null;
    const pageLabel = targetWebPage?.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot = !isLayout && (targetWebPage?.data?.isRoot === true || cleanLabel === "/");
    const displayLabel = layoutDetails ? layoutDetails.displayTitle : isRoot ? "/" : pageLabel;

    store.addNode({
      id: newRefId,
      type: "page_ref",
      position: newPos,
      data: {
        label: targetWebPage ? `Ref: ${displayLabel}` : "Page Ref",
        targetPageId: resolvedTargetPageId,
        pageRefId: resolvedTargetPageId,
        targetPageLabel: layoutDetails ? layoutDetails.displayTitle : targetWebPage ? pageLabel : undefined,
        description: isLayout
          ? "Target layout reference for persistent real-time streaming"
          : "Target page reference for real-time delivery",
      },
    });

    pageRefNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === newRefId);
  }

  if (!pageRefNode) return undefined;

  // 4. Ensure canvas edge exists from service to pageRefNode
  const currentEdges = useBackendCanvasStore.getState().edges;
  const existingEdge = currentEdges.find((e) => {
    const forwardMatch =
      e.source === serviceNodeId &&
      e.target === pageRefNode!.id &&
      (e.sourceHandle === sourceHandle || !e.sourceHandle || (endpointId && e.sourceHandle.includes(endpointId))) &&
      (e.targetHandle === "page-ref-in" || e.targetHandle === "ref-in" || !e.targetHandle);

    const reverseMatch =
      e.source === pageRefNode!.id &&
      e.target === serviceNodeId &&
      (e.targetHandle === sourceHandle || !e.targetHandle || (endpointId && e.targetHandle.includes(endpointId))) &&
      (e.sourceHandle === "page-ref-in" || e.sourceHandle === "ref-in" || !e.sourceHandle);

    return forwardMatch || reverseMatch;
  });

  if (!existingEdge) {
    store.addEdge({
      id: `edge-pushclient-${serviceNodeId}-${endpointId || consumedEventId || "ep"}-${pageRefNode.id}-${Date.now()}`,
      source: serviceNodeId,
      target: pageRefNode.id,
      sourceHandle,
      targetHandle: "page-ref-in",
      type: "connection",
    });
  }

  return {
    pageRefNodeId: pageRefNode.id,
    targetPageId: resolvedTargetPageId,
  };
}

/**
 * Cleans up edge(s) connecting the service endpoint to a PageRefNode when
 * the push_to_client step is deleted or changes type.
 * Also cascades deletion of the PageRefNode if it has no remaining incoming edges.
 */
export function cleanupPageRefConnection({
  pageRefNodeId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  remainingSteps,
}: CleanupPageRefConnectionParams) {
  if (!serviceNodeId) return;
  const store = useBackendCanvasStore.getState();

  // Check if any other push_to_client in remainingSteps still uses this pageRefNodeId or endpoint
  const allRemainingSteps = flattenAllPipelineSteps(remainingSteps);
  const isStillUsed = allRemainingSteps.some(
    (s) =>
      (s.type === "push_to_client" || (s.type === "langgraph_invoke" && s.langGraphStreamingEnabled)) &&
      ((pageRefNodeId && s.clientDeliveryPageRefNodeId === pageRefNodeId) ||
        (!pageRefNodeId && (s.type === "push_to_client" || s.type === "langgraph_invoke"))),
  );
  if (isStillUsed) return;

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-out-${consumedEventId}`
    : undefined;

  // Find edges connecting this service/handle to page_ref node(s)
  const edgesToDelete = store.edges.filter((e) => {
    if (e.source !== serviceNodeId) return false;
    if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) return false;
    if (pageRefNodeId && e.target !== pageRefNodeId) return false;
    const targetNode = store.nodes.find((n) => n.id === e.target);
    return targetNode?.type === "page_ref";
  });

  edgesToDelete.forEach((e) => {
    store.deleteEdge(e.id);
    // Cascade deletion of orphaned page_ref node if no incoming edges remain
    const targetNode = store.nodes.find((n) => n.id === e.target);
    if (targetNode && targetNode.type === "page_ref") {
      const remainingIncoming = store.edges.filter(
        (edge) => edge.target === targetNode.id && edge.id !== e.id,
      );
      if (remainingIncoming.length === 0) {
        store.deleteNode(targetNode.id);
      }
    }
  });
}
