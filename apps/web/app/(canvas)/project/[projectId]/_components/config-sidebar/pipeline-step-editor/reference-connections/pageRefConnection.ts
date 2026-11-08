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

  // 2. Look for existing page_ref node:
  // - By pageRefNodeId if provided
  // - Or already connected to this service & sourceHandle
  let pageRefNode = pageRefNodeId
    ? allNodes.find((n) => n.id === pageRefNodeId && n.type === "page_ref")
    : undefined;

  if (!pageRefNode) {
    const existingEdge = edges.find(
      (e) =>
        e.source === serviceNodeId &&
        (e.sourceHandle === sourceHandle || !e.sourceHandle) &&
        allNodes.some((n) => n.id === e.target && n.type === "page_ref"),
    );
    if (existingEdge) {
      pageRefNode = allNodes.find((n) => n.id === existingEdge.target);
    }
  }

  // 2b. If not found by edge, look for existing page_ref node targeting resolvedTargetPageId
  if (!pageRefNode && resolvedTargetPageId) {
    pageRefNode = allNodes.find(
      (n) =>
        n.type === "page_ref" &&
        (n.data?.targetPageId === resolvedTargetPageId ||
          n.data?.pageRefId === resolvedTargetPageId),
    );
  }

  // 3. If no page_ref node exists, create one!
  if (!pageRefNode) {
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const basePos = serviceNode?.position || { x: 300, y: 200 };
    const existingPageRefs = allNodes.filter((n) => n.type === "page_ref");
    const yOffset = existingPageRefs.length * 90;
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
  } else if (
    resolvedTargetPageId &&
    targetWebPage &&
    pageRefNode.data?.targetPageId !== resolvedTargetPageId
  ) {
    // If pageRefNode exists and targetPageId was updated, update pageRefNode details
    const isLayout = isLayoutNode(targetWebPage);
    const layoutDetails = isLayout ? getLayoutNodeDetails(targetWebPage, allNodes, edges) : null;
    const pageLabel = targetWebPage.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot = !isLayout && (targetWebPage.data?.isRoot === true || cleanLabel === "/");
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
