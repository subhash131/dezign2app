import { BackendNode, BackendEdge, PageSection, UIEventItem, FrontendActionStepDraft } from "@/types/canvas";
import { generateKeyBetween } from "fractional-indexing";
import { getLastIndex } from "../../utils";
import { ConnectionContext } from "../types";
import { handleWebPageActionConnect } from "./webPageActionConnect";

/**
 * Handles transformer to service endpoint, consumed event, or WebPage action connections.
 * For global transformers: ensures 1 transformer_ref node per service or WebPage, links edges, and removes direct edge.
 * For local/ref transformers: updates targetEndpointIds/targetEventIds/targetActionIds.
 *
 * @returns boolean `true` if direct edge was intercepted and removed (global transformer case), `false` otherwise.
 */
export function handleTransformerConnect({
  set,
  get,
  connection,
  sourceNode,
  targetNode,
  newEdge,
}: ConnectionContext): boolean {
  const isTransformerSource =
    sourceNode.type === "transformer" || sourceNode.type === "transformer_ref";
  const isTransformerTarget =
    targetNode.type === "transformer" || targetNode.type === "transformer_ref";
  const isTargetService = targetNode.type === "service";
  const isTargetWebPage = targetNode.type === "webPage";
  const isSourceWebPage = sourceNode.type === "webPage";

  // -------------------------------------------------------------------------
  // 1. GLOBAL TRANSFORMER <-> SERVICE (Endpoint or Consumed Event)
  // -------------------------------------------------------------------------
  if (
    sourceNode.type === "transformer" &&
    sourceNode.data?.scope === "global" &&
    isTargetService
  ) {
    const serviceId = targetNode.id;
    const targetHandle = connection.targetHandle ?? "";
    const isEndpoint = targetHandle.startsWith("endpoint-in-");
    const isConsumer = targetHandle.startsWith("consumedEvents-in-");
    const targetId = isEndpoint
      ? targetHandle.replace("endpoint-in-", "")
      : isConsumer
      ? targetHandle.replace("consumedEvents-in-", "")
      : targetHandle;

    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const fnName =
      sourceNode.data?.functionName || sourceNode.data?.label || "transformData";

    // 1 Ref per service/transformer rule: Check if this service already has a transformer_ref node for this transformer
    const existingRefNode = currentNodes.find(
      (n) =>
        n.type === "transformer_ref" &&
        (n.data?.transformerRef === sourceNode.id ||
          n.data?.transformerRef === sourceNode.data?.functionName ||
          n.data?.transformerRef === sourceNode.data?.label) &&
        (n.data?.targetServiceId === serviceId ||
          currentEdges.some(
            (e) => e.source === n.id && e.target === serviceId,
          )),
    );

    let refNodeId = existingRefNode?.id;

    if (!refNodeId) {
      refNodeId = crypto.randomUUID();
      const serviceX = targetNode.position?.x ?? 0;
      const serviceY = targetNode.position?.y ?? 0;

      const newRefNode: BackendNode = {
        id: refNodeId,
        type: "transformer_ref",
        position: {
          x: Math.max(0, serviceX - 300),
          y: serviceY + 40,
        },
        data: {
          label: `${fnName} (Ref)`,
          transformerRef: sourceNode.id,
          targetServiceId: serviceId,
          targetEndpointId: isEndpoint ? targetId : undefined,
          targetEndpointIds: isEndpoint && targetId ? [targetId] : [],
          targetEventId: isConsumer ? targetId : undefined,
          targetEventIds: isConsumer && targetId ? [targetId] : [],
        },
        fractionalIndex: generateKeyBetween(getLastIndex(currentNodes), null),
      };
      get().addNode(newRefNode);
    } else {
      const currentLiveRef = currentNodes.find((n) => n.id === refNodeId);
      if (currentLiveRef?.data) {
        if (isEndpoint && targetId) {
          const curEpIds: string[] =
            currentLiveRef.data.targetEndpointIds ||
            (currentLiveRef.data.targetEndpointId
              ? [currentLiveRef.data.targetEndpointId]
              : []);
          const nextEpIds = curEpIds.includes(targetId)
            ? curEpIds
            : [...curEpIds, targetId];
          get().updateNode(refNodeId, {
            data: {
              ...currentLiveRef.data,
              transformerRef:
                currentLiveRef.data.transformerRef || sourceNode.id,
              targetServiceId: serviceId,
              targetEndpointIds: nextEpIds,
              targetEndpointId: nextEpIds[0],
            },
          });
        } else if (isConsumer && targetId) {
          const curEvIds: string[] =
            currentLiveRef.data.targetEventIds ||
            (currentLiveRef.data.targetEventId
              ? [currentLiveRef.data.targetEventId]
              : []);
          const nextEvIds = curEvIds.includes(targetId)
            ? curEvIds
            : [...curEvIds, targetId];
          get().updateNode(refNodeId, {
            data: {
              ...currentLiveRef.data,
              transformerRef:
                currentLiveRef.data.transformerRef || sourceNode.id,
              targetServiceId: serviceId,
              targetEventIds: nextEvIds,
              targetEventId: nextEvIds[0],
            },
          });
        }
      }
    }

    // Ensure reference edge from global transformer to transformer_ref
    const refLinkExists = get().edges.some(
      (e) =>
        (e.type === "transformer-reference" || e.type === "reference") &&
        e.source === sourceNode.id &&
        e.target === refNodeId,
    );
    if (!refLinkExists) {
      get().addEdge({
        id: `edge-ref-link-${sourceNode.id}-${refNodeId}`,
        source: sourceNode.id,
        target: refNodeId,
        sourceHandle: "transformer-out",
        targetHandle: "transformer-in",
        type: "transformer-reference",
      });
    }

    // Ensure connection edge from transformer_ref to service
    const refConnExists = get().edges.some(
      (e) =>
        e.source === refNodeId &&
        e.target === serviceId &&
        e.targetHandle === targetHandle,
    );
    if (!refConnExists) {
      get().addEdge({
        id: `edge-ref-${refNodeId}-${targetId || "conn"}-${Date.now()}`,
        source: refNodeId,
        target: serviceId,
        sourceHandle: "transformer-out",
        targetHandle,
        type: "connection",
      });
    }

    // Remove direct edge created by ReactFlow AND any existing direct edges between master and service
    const directEdgeIds = get().edges
      .filter(
        (e) =>
          e.id === newEdge.id ||
          (((e.source === sourceNode.id && e.target === serviceId) ||
            (e.target === sourceNode.id && e.source === serviceId)) &&
            e.type !== "transformer-reference" &&
            e.type !== "reference"),
      )
      .map((e) => e.id);

    set((state) => ({
      edges: state.edges.filter((e) => !directEdgeIds.includes(e.id)),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(
        (e) => !directEdgeIds.includes(e.id),
      ),
      pendingEdgeRemovals: [
        ...state.pendingEdgeRemovals,
        ...directEdgeIds.filter((id) => !state.pendingEdgeRemovals.includes(id)),
      ],
    }));
    return true;
  }

  // -------------------------------------------------------------------------
  // 2. GLOBAL TRANSFORMER / TRANSFORMER REF <-> WEBPAGE (Action Step or Page Inbound)
  // Handles:
  // a) Global transformer (source) -> WebPage (target)
  // b) WebPage (source) -> Global transformer (target)
  // c) Transformer ref (source) -> WebPage (target)
  // d) WebPage (source) -> Transformer ref (target)
  // -------------------------------------------------------------------------
  const isTransOrRefNode = (node: BackendNode) =>
    node.type === "transformer_ref" ||
    (node.type === "transformer" &&
      (node.data?.scope === "global" || !node.data?.scope || node.data?.isGlobal === true));

  if (
    (isTransOrRefNode(sourceNode) && isTargetWebPage) ||
    (isTransOrRefNode(targetNode) && isSourceWebPage)
  ) {
    const isSourceRef = sourceNode.type === "transformer_ref";
    const isTargetRef = targetNode.type === "transformer_ref";
    const passedRefNode = isSourceRef ? sourceNode : isTargetRef ? targetNode : undefined;
    const webPageNode = isTargetWebPage ? targetNode : sourceNode;
    const webPageId = webPageNode.id;
    const webHandle = isTargetWebPage
      ? (connection.targetHandle ?? "")
      : (connection.sourceHandle ?? "");

    const isActionHandle =
      webHandle.startsWith("events-") ||
      webHandle.startsWith("event-in-") ||
      webHandle.startsWith("pageload-in-") ||
      webHandle.startsWith("action-in-") ||
      webHandle.startsWith("rtc-out-") ||
      webHandle.startsWith("rtc-in-");

    let actionId = isActionHandle
      ? webHandle.replace(
          /^(?:events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/,
          "",
        )
      : (passedRefNode?.data?.targetActionId || "");

    if (!actionId && webPageNode.data?.sections) {
      const sections: PageSection[] = webPageNode.data.sections;
      const allActions: UIEventItem[] = sections.flatMap(
        (sec: PageSection): UIEventItem[] => sec.actions || [],
      );
      const nonPageLoad = allActions.find(
        (a: UIEventItem): boolean =>
          a.event !== "pageLoad" &&
          a.name !== "pageLoad" &&
          a.id !== "pageLoad",
      );
      actionId = nonPageLoad?.id || allActions[0]?.id || "";
    }

    const currentNodes = get().nodes;
    const currentEdges = get().edges;

    const masterNode = passedRefNode
      ? currentNodes.find(
          (n) =>
            n.id === passedRefNode.data?.transformerRef ||
            (n.type === "transformer" &&
              (n.data?.functionName === passedRefNode.data?.transformerRef ||
                n.data?.label === passedRefNode.data?.transformerRef)),
        ) || passedRefNode
      : (sourceNode.type === "transformer" ? sourceNode : targetNode);

    const fnName =
      masterNode.data?.functionName || masterNode.data?.label || "transformData";

    // 1 Ref per webPage/master rule: Check if a transformer_ref node already exists for this master transformer
    const existingRefNode = passedRefNode || currentNodes.find(
      (n) =>
        n.type === "transformer_ref" &&
        (n.data?.transformerRef === masterNode.id ||
          n.data?.transformerRef === masterNode.data?.functionName ||
          n.data?.transformerRef === masterNode.data?.label) &&
        (n.data?.targetWebPageId === webPageId ||
          currentEdges.some(
            (e) =>
              (e.source === n.id && e.target === webPageId) ||
              (e.target === n.id && e.source === webPageId),
          )),
    );

    let refNodeId = existingRefNode?.id;

    if (!refNodeId) {
      refNodeId = crypto.randomUUID();
      const pageX = webPageNode.position?.x ?? 0;
      const pageY = webPageNode.position?.y ?? 0;

      const existingRefsForPage = currentNodes.filter(
        (n) =>
          n.type === "transformer_ref" &&
          (n.data?.targetWebPageId === webPageId ||
            currentEdges.some(
              (e) => (e.source === n.id && e.target === webPageId) || (e.target === n.id && e.source === webPageId),
            )),
      );

      // Position hanging node to the left of webPage (same as service) with vertical offset
      const refX = Math.max(0, pageX - 300);
      const refY = pageY + 40 + existingRefsForPage.length * 80;

      const newRefNode: BackendNode = {
        id: refNodeId,
        type: "transformer_ref",
        position: {
          x: refX,
          y: refY,
        },
        data: {
          label: `${fnName} (Ref)`,
          transformerRef: masterNode.id,
          targetWebPageId: webPageId,
          targetActionId: actionId || undefined,
          targetActionIds: actionId ? [actionId] : [],
        },
        fractionalIndex: generateKeyBetween(getLastIndex(currentNodes), null),
      };
      get().addNode(newRefNode);
    } else {
      const currentLiveRef = currentNodes.find((n) => n.id === refNodeId);
      if (currentLiveRef?.data && actionId) {
        const curActIds: string[] =
          currentLiveRef.data.targetActionIds ||
          (currentLiveRef.data.targetActionId
            ? [currentLiveRef.data.targetActionId]
            : []);
        const nextActIds = curActIds.includes(actionId)
          ? curActIds
          : [...curActIds, actionId];
        get().updateNode(refNodeId, {
          data: {
            ...currentLiveRef.data,
            transformerRef: currentLiveRef.data.transformerRef || masterNode.id,
            targetWebPageId: webPageId,
            targetActionIds: nextActIds,
            targetActionId: nextActIds[0],
          },
        });
      }
    }

    // Ensure reference edge from global transformer to transformer_ref
    const refLinkExists = get().edges.some(
      (e) =>
        (e.type === "transformer-reference" || e.type === "reference") &&
        e.source === masterNode.id &&
        e.target === refNodeId,
    );
    if (!refLinkExists) {
      get().addEdge({
        id: `edge-ref-link-${masterNode.id}-${refNodeId}`,
        source: masterNode.id,
        target: refNodeId,
        sourceHandle: "transformer-out",
        targetHandle: "transformer-in",
        type: "transformer-reference",
      });
    }

    // Ensure connection edge from transformer_ref (transformer-out) to webPage (event-in-* or pageload-in-*)
    const resolvedInbound = resolveWebPageActionInboundHandle(webPageNode, actionId);
    const pageInHandle = resolvedInbound.handle;
    if (resolvedInbound.actionId) {
      actionId = resolvedInbound.actionId;
    }
    const connSource = refNodeId;
    const connTarget = webPageId;
    const connSourceHandle = "transformer-out";
    const connTargetHandle = pageInHandle;

    const refConnExists = get().edges.some(
      (e) =>
        e.source === connSource &&
        e.target === connTarget &&
        e.sourceHandle === connSourceHandle &&
        e.targetHandle === connTargetHandle,
    );

    if (!refConnExists) {
      const createdEdge: BackendEdge = {
        id: `edge-ref-${refNodeId}-${actionId || "conn"}-${Date.now()}`,
        source: connSource,
        target: connTarget,
        sourceHandle: connSourceHandle,
        targetHandle: connTargetHandle,
        type: "connection",
        fractionalIndex: safeGenerateKey(getLastIndex(get().edges)),
        data: newEdge.data || {
          sequenceOrder: 1,
          label: "1",
        },
      };
      get().addEdge(createdEdge);

      // Auto-configure the action step on the WebPage node via handleWebPageActionConnect
      const freshRefNode = get().nodes.find((n) => n.id === refNodeId);
      if (freshRefNode) {
        handleWebPageActionConnect({
          set,
          get,
          connection: {
            source: connSource,
            target: connTarget,
            sourceHandle: connSourceHandle,
            targetHandle: connTargetHandle,
          },
          sourceNode: freshRefNode,
          targetNode: webPageNode,
          newEdge: createdEdge,
        });
      }
    }

    // Remove direct edge created by ReactFlow AND any existing direct/inverted edges
    const directEdgeIds = get().edges
      .filter(
        (e) =>
          e.id === newEdge.id ||
          (((e.source === masterNode.id && e.target === webPageId) ||
            (e.target === masterNode.id && e.source === webPageId)) &&
            e.type !== "transformer-reference" &&
            e.type !== "reference") ||
          (refNodeId &&
            ((e.source === webPageId && e.target === refNodeId) ||
              (e.source === refNodeId && e.target === webPageId && e.targetHandle && e.targetHandle.startsWith("events-")))),
      )
      .map((e) => e.id);

    set((state) => ({
      edges: state.edges.filter((e) => !directEdgeIds.includes(e.id)),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(
        (e) => !directEdgeIds.includes(e.id),
      ),
      pendingEdgeRemovals: [
        ...state.pendingEdgeRemovals,
        ...directEdgeIds.filter((id) => !state.pendingEdgeRemovals.includes(id)),
      ],
    }));
    return true;
  }

  // -------------------------------------------------------------------------
  // 3. LOCAL / REF TRANSFORMER METADATA UPDATES
  // -------------------------------------------------------------------------
  if (isTransformerSource && isTargetService) {
    if (connection.targetHandle?.startsWith("endpoint-in-")) {
      const epId = connection.targetHandle.replace("endpoint-in-", "");
      const currentEpIds: string[] =
        sourceNode.data?.targetEndpointIds ||
        (sourceNode.data?.targetEndpointId
          ? [sourceNode.data.targetEndpointId]
          : []);
      if (!currentEpIds.includes(epId)) {
        const nextEpIds = [...currentEpIds, epId];
        get().updateNode(sourceNode.id, {
          data: {
            ...sourceNode.data,
            targetServiceId: targetNode.id,
            targetEndpointIds: nextEpIds,
            targetEndpointId: nextEpIds[0],
          },
        });
      }
    } else if (connection.targetHandle?.startsWith("consumedEvents-in-")) {
      const evId = connection.targetHandle.replace("consumedEvents-in-", "");
      const currentEvIds: string[] =
        sourceNode.data?.targetEventIds ||
        (sourceNode.data?.targetEventId
          ? [sourceNode.data.targetEventId]
          : []);
      if (!currentEvIds.includes(evId)) {
        const nextEvIds = [...currentEvIds, evId];
        get().updateNode(sourceNode.id, {
          data: {
            ...sourceNode.data,
            targetServiceId: targetNode.id,
            targetEventIds: nextEvIds,
            targetEventId: nextEvIds[0],
          },
        });
      }
    }
  }

  if (
    (isTransformerSource && isTargetWebPage) ||
    (isSourceWebPage && isTransformerTarget)
  ) {
    const tNode = isTransformerSource ? sourceNode : targetNode;
    const wpNode = isTargetWebPage ? targetNode : sourceNode;
    const webHandle = isTargetWebPage
      ? (connection.targetHandle ?? "")
      : (connection.sourceHandle ?? "");
    const actionId = webHandle.replace(
      /^(?:events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/,
      "",
    );

    if (actionId) {
      const currentActIds: string[] =
        tNode.data?.targetActionIds ||
        (tNode.data?.targetActionId ? [tNode.data.targetActionId] : []);
      if (!currentActIds.includes(actionId)) {
        const nextActIds = [...currentActIds, actionId];
        get().updateNode(tNode.id, {
          data: {
            ...tNode.data,
            targetWebPageId: wpNode.id,
            targetActionIds: nextActIds,
            targetActionId: nextActIds[0],
          },
        });
      }
    }
  }

  return false;
}

export function resolveWebPageActionInboundHandle(
  webPageNode?: BackendNode,
  actionId?: string,
): { handle: string; actionId: string } {
  if (!webPageNode || !webPageNode.data?.sections) {
    return {
      handle:
        actionId === "pageLoad"
          ? "pageload-in-pageLoad"
          : actionId
          ? `event-in-${actionId}`
          : "event-in",
      actionId: actionId || "",
    };
  }

  const sections: PageSection[] = webPageNode.data.sections;
  const allActions: UIEventItem[] = sections.flatMap((s: PageSection): UIEventItem[] => s.actions || []);

  // Find matching action
  let matchedAction = actionId
    ? allActions.find(
        (a: UIEventItem): boolean =>
          a.id === actionId ||
          a.name === actionId ||
          a.event === actionId ||
          (actionId === "pageLoad" && (a.event === "pageLoad" || a.name === "pageLoad")),
      )
    : undefined;

  // If no actionId or not found, check which action has a transform actionStep
  if (!matchedAction) {
    matchedAction = allActions.find((a: UIEventItem): boolean =>
      Boolean(a.actionSteps?.some((s: FrontendActionStepDraft): boolean => s.type === "transform")),
    );
  }

  // Fallback: first non-pageLoad action, or first action
  if (!matchedAction) {
    matchedAction =
      allActions.find(
        (a: UIEventItem): boolean =>
          a.event !== "pageLoad" && a.name !== "pageLoad" && a.id !== "pageLoad",
      ) || allActions[0];
  }

  if (!matchedAction) {
    return {
      handle: actionId ? `event-in-${actionId}` : "event-in",
      actionId: actionId || "",
    };
  }

  const actId = matchedAction.id;
  const evtStr = (matchedAction.event || matchedAction.name || "").toLowerCase();
  const isPageLoad =
    evtStr === "pageload" ||
    actId === "pageLoad" ||
    actId.toLowerCase().includes("pageload");
  const isSse = evtStr === "sse" || evtStr === "ssemessage";
  const isWebsocket =
    evtStr === "websocket" ||
    evtStr === "ws" ||
    evtStr === "websocketmessage";
  const isWebrtc = evtStr === "webrtc";

  const handle = isPageLoad
    ? `pageload-in-${actId}`
    : isSse
    ? `sse-in-${actId}`
    : isWebsocket
    ? `websocket-in-${actId}`
    : isWebrtc
    ? `webrtc-in-${actId}`
    : `event-in-${actId}`;

  return { handle, actionId: actId };
}

function safeGenerateKey(lastIdx: string | null): string {
  try {
    return generateKeyBetween(lastIdx, null);
  } catch {
    try {
      return generateKeyBetween(null, null);
    } catch {
      return "a0";
    }
  }
}

/**
 * Self-heals any legacy or direct edges saved between global transformers and WebPages or Services.
 * Converts direct cross-canvas edges into a hanging `transformer_ref` node with:
 * - A `transformer-reference` edge from master transformer to ref node
 * - A `connection` edge between the ref node and the target node
 * - Obsolete direct edge removed from canvas and queued for Convex deletion
 * - WebPage action steps synchronized to reference the new ref node
 */
export function healDirectTransformerEdges({
  nodes,
  edges,
  pendingEdgeRemovals = [],
  pendingEdgeUpserts = [],
  pendingNodeUpserts = [],
}: {
  nodes: BackendNode[];
  edges: BackendEdge[];
  pendingEdgeRemovals?: string[];
  pendingEdgeUpserts?: BackendEdge[];
  pendingNodeUpserts?: BackendNode[];
}): {
  changed: boolean;
  nodes: BackendNode[];
  edges: BackendEdge[];
  pendingEdgeRemovals: string[];
  pendingEdgeUpserts: BackendEdge[];
  pendingNodeUpserts: BackendNode[];
} {
  const isGlobalTrans = (node?: BackendNode) => node?.type === "transformer";

  const directEdges = edges.filter((e) => {
    if (e.type === "transformer-reference" || e.type === "reference") return false;
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    if (!src || !tgt) return false;

    if (isGlobalTrans(src) && (tgt.type === "webPage" || tgt.type === "service")) return true;
    if (isGlobalTrans(tgt) && (src.type === "webPage" || src.type === "service")) return true;
    return false;
  });

  const invertedRefEdges = edges.filter((e) => {
    if (e.type === "transformer-reference" || e.type === "reference") return false;
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    if (!src || !tgt) return false;

    // Inverted: webPage -> transformer_ref
    if (src.type === "webPage" && tgt.type === "transformer_ref") return true;

    // Or invalid handles: refNode -> webPage with sourceHandle: transformer-in or targetHandle: events-*
    if (
      src.type === "transformer_ref" &&
      tgt.type === "webPage" &&
      (e.sourceHandle === "transformer-in" || (e.targetHandle && e.targetHandle.startsWith("events-")))
    ) {
      return true;
    }

    return false;
  });

  const unconnectedRefNodes = nodes.filter((n) => {
    if (n.type !== "transformer_ref") return false;
    const hasOutgoing = edges.some(
      (e) =>
        e.source === n.id &&
        e.sourceHandle === "transformer-out" &&
        (e.type === "connection" || !e.type),
    );
    const hasIncomingRef = edges.some(
      (e) =>
        e.target === n.id &&
        (e.type === "transformer-reference" || e.type === "reference"),
    );
    return !hasOutgoing || !hasIncomingRef;
  });

  if (
    directEdges.length === 0 &&
    invertedRefEdges.length === 0 &&
    unconnectedRefNodes.length === 0
  ) {
    return {
      changed: false,
      nodes,
      edges,
      pendingEdgeRemovals,
      pendingEdgeUpserts,
      pendingNodeUpserts,
    };
  }

  let nextNodes = [...nodes];
  let nextEdges = [...edges];
  const nextEdgeRemovals = new Set(pendingEdgeRemovals);
  let nextEdgeUpserts = [...pendingEdgeUpserts];
  let nextNodeUpserts = [...pendingNodeUpserts];

  for (const directEdge of directEdges) {
    const src = nextNodes.find((n) => n.id === directEdge.source);
    const tgt = nextNodes.find((n) => n.id === directEdge.target);
    if (!src || !tgt) continue;

    const masterNode = isGlobalTrans(src) ? src : tgt;
    const targetNode = isGlobalTrans(src) ? tgt : src;
    const isTargetWebPage = targetNode.type === "webPage";
    const webHandle =
      targetNode.id === directEdge.source
        ? (directEdge.sourceHandle ?? "")
        : (directEdge.targetHandle ?? "");

    const actionId = isTargetWebPage
      ? webHandle.replace(/^(?:events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/, "")
      : "";
    const targetId = !isTargetWebPage
      ? webHandle.replace(/^(?:endpoint-in-|consumedEvents-in-)/, "")
      : "";

    // 1. Find or create transformer_ref node
    let refNode = nextNodes.find(
      (n) =>
        n.type === "transformer_ref" &&
        (n.data?.transformerRef === masterNode.id ||
          n.data?.transformerRef === masterNode.data?.functionName ||
          n.data?.transformerRef === masterNode.data?.label) &&
        (isTargetWebPage
          ? n.data?.targetWebPageId === targetNode.id ||
            nextEdges.some(
              (e) => (e.source === n.id && e.target === targetNode.id) || (e.target === n.id && e.source === targetNode.id)
            )
          : n.data?.targetServiceId === targetNode.id ||
            nextEdges.some((e) => e.source === n.id && e.target === targetNode.id))
    );

    const fnName = masterNode.data?.functionName || masterNode.data?.label || "Transformer";

    if (!refNode) {
      const refNodeId = crypto.randomUUID();
      const targetX = targetNode.position?.x ?? 0;
      const targetY = targetNode.position?.y ?? 0;
      const existingRefsForTarget = nextNodes.filter(
        (n) =>
          n.type === "transformer_ref" &&
          (isTargetWebPage
            ? n.data?.targetWebPageId === targetNode.id ||
              nextEdges.some(
                (e) => (e.source === n.id && e.target === targetNode.id) || (e.target === n.id && e.source === targetNode.id),
              )
            : n.data?.targetServiceId === targetNode.id ||
              nextEdges.some((e) => e.source === n.id && e.target === targetNode.id)),
      );
      const refX = Math.max(0, targetX - 300);
      const refY = targetY + 40 + existingRefsForTarget.length * 80;

      const newRef: BackendNode = {
        id: refNodeId,
        type: "transformer_ref",
        position: { x: refX, y: refY },
        data: {
          label: `${fnName} (Ref)`,
          transformerRef: masterNode.id,
          targetWebPageId: isTargetWebPage ? targetNode.id : undefined,
          targetActionId: actionId || undefined,
          targetActionIds: actionId ? [actionId] : [],
          targetServiceId: !isTargetWebPage ? targetNode.id : undefined,
          targetEndpointId: !isTargetWebPage && targetId ? targetId : undefined,
          targetEndpointIds: !isTargetWebPage && targetId ? [targetId] : [],
        },
        fractionalIndex: safeGenerateKey(getLastIndex(nextNodes)),
      };

      nextNodes.push(newRef);
      nextNodeUpserts.push(newRef);
      refNode = newRef;
    } else {
      // Update existing ref node data
      const curData = refNode.data || {};
      const curActIds: string[] = curData.targetActionIds || (curData.targetActionId ? [curData.targetActionId] : []);
      const nextActIds = actionId && !curActIds.includes(actionId) ? [...curActIds, actionId] : curActIds;
      const curEpIds: string[] = curData.targetEndpointIds || (curData.targetEndpointId ? [curData.targetEndpointId] : []);
      const nextEpIds = targetId && !curEpIds.includes(targetId) ? [...curEpIds, targetId] : curEpIds;

      const updatedRef: BackendNode = {
        ...refNode,
        data: {
          ...curData,
          transformerRef: curData.transformerRef || masterNode.id,
          targetWebPageId: isTargetWebPage ? targetNode.id : curData.targetWebPageId,
          targetActionIds: nextActIds,
          targetActionId: nextActIds[0] || curData.targetActionId,
          targetServiceId: !isTargetWebPage ? targetNode.id : curData.targetServiceId,
          targetEndpointIds: nextEpIds,
          targetEndpointId: nextEpIds[0] || curData.targetEndpointId,
        },
      };
      nextNodes = nextNodes.map((n) => (n.id === updatedRef.id ? updatedRef : n));
      nextNodeUpserts = [...nextNodeUpserts.filter((n) => n.id !== updatedRef.id), updatedRef];
      refNode = updatedRef;
    }

    // 2. Ensure reference edge from master to ref node
    const refEdgeExists = nextEdges.some(
      (e) =>
        (e.type === "transformer-reference" || e.type === "reference") &&
        e.source === masterNode.id &&
        e.target === refNode.id
    );
    if (!refEdgeExists) {
      const refEdge: BackendEdge = {
        id: `edge-ref-link-${masterNode.id}-${refNode.id}`,
        source: masterNode.id,
        target: refNode.id,
        sourceHandle: "transformer-out",
        targetHandle: "transformer-in",
        type: "transformer-reference",
        fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
      };
      nextEdges.push(refEdge);
      nextEdgeUpserts.push(refEdge);
    }

    // 3. Ensure connection edge between ref node and target node
    const resolvedInbound1 = isTargetWebPage
      ? resolveWebPageActionInboundHandle(targetNode, actionId)
      : { handle: webHandle, actionId };
    const pageInHandle = resolvedInbound1.handle;
    const connSource = refNode.id;
    const connTarget = targetNode.id;
    const connSourceHandle = "transformer-out";
    const connTargetHandle = isTargetWebPage ? pageInHandle : webHandle;

    const connEdgeExists = nextEdges.some(
      (e) =>
        e.source === connSource &&
        e.target === connTarget &&
        (e.sourceHandle ?? null) === (connSourceHandle ?? null) &&
        (e.targetHandle ?? null) === (connTargetHandle ?? null)
    );

    let connEdgeId = "";
    if (!connEdgeExists) {
      const connEdge: BackendEdge = {
        id: `edge-ref-${refNode.id}-${actionId || targetId || "conn"}-${Date.now()}`,
        source: connSource,
        target: connTarget,
        sourceHandle: connSourceHandle,
        targetHandle: connTargetHandle,
        type: "connection",
        data: directEdge.data || { sequenceOrder: 1, label: "1" },
        fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
      };
      nextEdges.push(connEdge);
      nextEdgeUpserts.push(connEdge);
      connEdgeId = connEdge.id;
    } else {
      const foundConn = nextEdges.find(
        (e) =>
          e.source === connSource &&
          e.target === connTarget &&
          (e.sourceHandle ?? null) === (connSourceHandle ?? null) &&
          (e.targetHandle ?? null) === (connTargetHandle ?? null)
      );
      connEdgeId = foundConn?.id || "";
    }

    // 4. Remove direct edge and any other direct edges between master and target
    const allDirectEdgeIds = nextEdges
      .filter(
        (e) =>
          e.id === directEdge.id ||
          (((e.source === masterNode.id && e.target === targetNode.id) ||
            (e.target === masterNode.id && e.source === targetNode.id)) &&
            e.type !== "transformer-reference" &&
            e.type !== "reference"),
      )
      .map((e) => e.id);

    nextEdges = nextEdges.filter((e) => !allDirectEdgeIds.includes(e.id));
    nextEdgeUpserts = nextEdgeUpserts.filter((e) => !allDirectEdgeIds.includes(e.id));
    allDirectEdgeIds.forEach((id) => nextEdgeRemovals.add(id));

    // 5. Update WebPage action step if target is WebPage
    if (isTargetWebPage && actionId) {
      const wpNode = nextNodes.find((n) => n.id === targetNode.id);
      if (wpNode?.data) {
        let actionUpdated = false;
        const sections: PageSection[] = wpNode.data.sections || [];
        const updatedSections = sections.map((sec: PageSection): PageSection => ({
          ...sec,
          actions: (sec.actions || []).map((act: UIEventItem): UIEventItem => {
            if (act.id === actionId) {
              actionUpdated = true;
              const existingSteps: FrontendActionStepDraft[] = act.actionSteps || [];
              const transStepIdx = existingSteps.findIndex(
                (s: FrontendActionStepDraft): boolean =>
                  s.type === "transform" &&
                  (s.transformerRefNodeId === refNode.id || s.transformerNodeId === masterNode.id || s.edgeId === directEdge.id),
              );
              const existingStep: FrontendActionStepDraft | undefined =
                transStepIdx >= 0 ? existingSteps[transStepIdx] : undefined;
              const stepToUse: FrontendActionStepDraft = {
                id: existingStep ? existingStep.id : `step-${Date.now()}`,
                order: existingStep ? existingStep.order : existingSteps.length + 1,
                type: "transform",
                name: masterNode.data?.functionName || masterNode.data?.label || "transformData",
                transformerNodeId: masterNode.id,
                transformerRefNodeId: refNode.id,
                transformerName: masterNode.data?.functionName || masterNode.data?.label || "Transformer",
                edgeId: connEdgeId || directEdge.id,
                functionRef: {
                  name: masterNode.data?.functionName || masterNode.data?.label || "transformData",
                  importPath: "@workspace/transformers",
                  isGlobal: true,
                  inputSchema: masterNode.data?.inputSchema,
                  returnSchema: masterNode.data?.returnSchema,
                },
                transformBindings: (masterNode.data?.inputSchema || []).map((field: { name: string }) => ({
                  argName: field.name,
                  source: { kind: "literal" as const, value: "" },
                })),
              };
              const nextSteps: FrontendActionStepDraft[] =
                transStepIdx >= 0
                  ? existingSteps.map((s: FrontendActionStepDraft, i: number): FrontendActionStepDraft => (i === transStepIdx ? stepToUse : s))
                  : [...existingSteps, stepToUse];
              return { ...act, actionSteps: nextSteps };
            }
            return act;
          }),
        }));

        if (actionUpdated) {
          const updatedWp: BackendNode = {
            ...wpNode,
            data: {
              ...wpNode.data,
              sections: updatedSections,
            },
          };
          nextNodes = nextNodes.map((n) => (n.id === updatedWp.id ? updatedWp : n));
          nextNodeUpserts = [...nextNodeUpserts.filter((n) => n.id !== updatedWp.id), updatedWp];
        }
      }
    }
  }

  // 4. Heal any inverted or invalid edges between webPage and transformer_ref nodes
  for (const invEdge of invertedRefEdges) {
    const src = nextNodes.find((n) => n.id === invEdge.source);
    const tgt = nextNodes.find((n) => n.id === invEdge.target);
    if (!src || !tgt) continue;

    const webPageNode = src.type === "webPage" ? src : tgt;
    const refNode = src.type === "transformer_ref" ? src : tgt;
    if (!webPageNode || !refNode) continue;

    const rawHandle =
      src.type === "webPage" ? (invEdge.sourceHandle ?? "") : (invEdge.targetHandle ?? "");
    const actionId =
      rawHandle.replace(
        /^(?:events-|event-in-|pageload-in-|action-in-|rtc-out-|rtc-in-)/,
        "",
      ) || (refNode.data?.targetActionId || "");

    const pageInHandle = actionId
      ? (actionId === "pageLoad" ? `pageload-in-${actionId}` : `event-in-${actionId}`)
      : "event-in";

    // Remove the inverted/invalid edge
    nextEdges = nextEdges.filter((e) => e.id !== invEdge.id);
    nextEdgeRemovals.add(invEdge.id);

    // Ensure correct connection edge: refNode (transformer-out, right) -> webPage (pageInHandle, left)
    const connSource = refNode.id;
    const connTarget = webPageNode.id;
    const connSourceHandle = "transformer-out";
    const connTargetHandle = pageInHandle;

    const connEdgeExists = nextEdges.some(
      (e) =>
        e.source === connSource &&
        e.target === connTarget &&
        (e.sourceHandle ?? null) === (connSourceHandle ?? null) &&
        (e.targetHandle ?? null) === (connTargetHandle ?? null),
    );

    let connEdgeId = "";
    if (!connEdgeExists) {
      const connEdge: BackendEdge = {
        id: `edge-ref-${refNode.id}-${actionId || "conn"}-${Date.now()}`,
        source: connSource,
        target: connTarget,
        sourceHandle: connSourceHandle,
        targetHandle: connTargetHandle,
        type: "connection",
        data: invEdge.data || {
          sequenceOrder: 1,
          label: "1",
        },
        fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
      };
      nextEdges.push(connEdge);
      nextEdgeUpserts.push(connEdge);
      connEdgeId = connEdge.id;
    } else {
      connEdgeId = nextEdges.find(
        (e) =>
          e.source === connSource &&
          e.target === connTarget &&
          (e.sourceHandle ?? null) === (connSourceHandle ?? null) &&
          (e.targetHandle ?? null) === (connTargetHandle ?? null),
      )!.id;
    }

    // Update action step in webPageNode
    const sections: PageSection[] = webPageNode.data?.sections || [];
    let sectionUpdated = false;
    const updatedSections = sections.map((sec) => ({
      ...sec,
      actions: (sec.actions || []).map((act) => {
        if (!actionId || act.id === actionId) {
          const steps: FrontendActionStepDraft[] = act.actionSteps || [];
          const stepIdx = steps.findIndex(
            (s) =>
              s.edgeId === invEdge.id ||
              s.transformerRefNodeId === refNode.id ||
              (refNode.data?.transformerRef && s.transformerNodeId === refNode.data.transformerRef),
          );
          const stepToUpdate: FrontendActionStepDraft | undefined =
            stepIdx >= 0 ? steps[stepIdx] : undefined;
          if (stepToUpdate) {
            sectionUpdated = true;
            const updatedSteps = [...steps];
            updatedSteps[stepIdx] = {
              ...stepToUpdate,
              edgeId: connEdgeId,
              transformerRefNodeId: refNode.id,
              transformerNodeId: refNode.data?.transformerRef || stepToUpdate.transformerNodeId,
            };
            return { ...act, actionSteps: updatedSteps };
          }
        }
        return act;
      }),
    }));

    if (sectionUpdated) {
      const updatedPage: BackendNode = {
        ...webPageNode,
        data: {
          ...webPageNode.data,
          sections: updatedSections,
        },
      };
      nextNodes = nextNodes.map((n) => (n.id === updatedPage.id ? updatedPage : n));
      nextNodeUpserts = [...nextNodeUpserts.filter((n) => n.id !== updatedPage.id), updatedPage];
    }
  }

  // 5. Heal any unconnected transformer_ref nodes by creating outgoing connection edge
  for (const refNode of unconnectedRefNodes) {
    const masterId = refNode.data?.transformerRef;
    const masterNode = nextNodes.find(
      (n) =>
        n.id === masterId ||
        (n.type === "transformer" &&
          (n.data?.functionName === masterId || n.data?.label === masterId)),
    );

    // Ensure reference edge from master to ref node
    if (masterNode) {
      const refEdgeExists = nextEdges.some(
        (e) =>
          (e.type === "transformer-reference" || e.type === "reference") &&
          e.source === masterNode.id &&
          e.target === refNode.id,
      );
      if (!refEdgeExists) {
        const refEdge: BackendEdge = {
          id: `edge-ref-link-${masterNode.id}-${refNode.id}`,
          source: masterNode.id,
          target: refNode.id,
          sourceHandle: "transformer-out",
          targetHandle: "transformer-in",
          type: "transformer-reference",
          fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
        };
        nextEdges.push(refEdge);
        nextEdgeUpserts.push(refEdge);
      }
    }

    const alreadyConnected = nextEdges.some(
      (e) =>
        e.source === refNode.id &&
        e.sourceHandle === "transformer-out" &&
        (e.type === "connection" || !e.type),
    );
    if (alreadyConnected) continue;

    // Determine target: WebPage or Service
    let targetWebPage = refNode.data?.targetWebPageId
      ? nextNodes.find((n) => n.id === refNode.data?.targetWebPageId)
      : undefined;

    if (!targetWebPage) {
      targetWebPage = nextNodes.find(
        (n: BackendNode): boolean =>
          n.type === "webPage" &&
          Boolean(
            (n.data?.sections || []).some((sec: PageSection): boolean =>
              (sec.actions || []).some((act: UIEventItem): boolean =>
                Boolean(
                  (act.actionSteps || []).some(
                    (step: FrontendActionStepDraft): boolean =>
                      step.type === "transform" &&
                      (step.transformerRefNodeId === refNode.id ||
                        (masterNode !== undefined && step.transformerNodeId === masterNode.id)),
                  ),
                ),
              ),
            ),
          ),
      );
    }

    if (targetWebPage) {
      // If an edge between this ref node and target was marked for removal, do NOT recreate it
      const isBeingRemoved = Array.from(nextEdgeRemovals).some((removedId) => {
        const oldE = edges.find((e) => e.id === removedId);
        return (
          oldE &&
          ((oldE.source === refNode.id && oldE.target === targetWebPage.id) ||
            (oldE.target === refNode.id && oldE.source === targetWebPage.id))
        );
      });
      if (isBeingRemoved) continue;

      let targetActId =
        refNode.data?.targetActionId ||
        refNode.data?.targetActionIds?.[0] ||
        "";

      // Check if any action on targetWebPage has a transform step referencing this refNode or masterNode
      if (targetWebPage.data?.sections) {
        for (const sec of targetWebPage.data.sections as PageSection[]) {
          for (const act of sec.actions || []) {
            const hasStep = (act.actionSteps || []).some(
              (s: FrontendActionStepDraft): boolean =>
                s.type === "transform" &&
                (s.transformerRefNodeId === refNode.id ||
                  (masterNode !== undefined && s.transformerNodeId === masterNode.id)),
            );
            if (hasStep) {
              targetActId = act.id;
              break;
            }
          }
          if (targetActId && targetActId !== refNode.data?.targetActionId) break;
        }
      }

      const { handle: pageInHandle, actionId } = resolveWebPageActionInboundHandle(targetWebPage, targetActId);

      if (actionId) {
        const existingEdge = nextEdges.find(
          (e) =>
            e.source === refNode.id &&
            e.target === targetWebPage.id &&
            (e.type === "connection" || !e.type),
        );

        let connEdge: BackendEdge;
        if (existingEdge) {
          connEdge = {
            ...existingEdge,
            sourceHandle: "transformer-out",
            targetHandle: pageInHandle,
            type: "connection",
          };
          nextEdges = nextEdges.map((e) => (e.id === connEdge.id ? connEdge : e));
          nextEdgeUpserts = [...nextEdgeUpserts.filter((e) => e.id !== connEdge.id), connEdge];
        } else {
          connEdge = {
            id: `edge-ref-${refNode.id}-${actionId}-${Date.now()}`,
            source: refNode.id,
            target: targetWebPage.id,
            sourceHandle: "transformer-out",
            targetHandle: pageInHandle,
            type: "connection",
            data: { sequenceOrder: 1, label: "1" },
            fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
          };
          nextEdges.push(connEdge);
          nextEdgeUpserts.push(connEdge);
        }

        // Update refNode data
        const curActIds: string[] =
          refNode.data?.targetActionIds ||
          (refNode.data?.targetActionId ? [refNode.data.targetActionId] : []);
        const nextActIds = !curActIds.includes(actionId)
          ? [...curActIds, actionId]
          : curActIds;
        const updatedRef: BackendNode = {
          ...refNode,
          data: {
            ...refNode.data,
            targetWebPageId: targetWebPage.id,
            targetActionId: actionId,
            targetActionIds: nextActIds,
          },
        };
        nextNodes = nextNodes.map((n) => (n.id === updatedRef.id ? updatedRef : n));
        nextNodeUpserts = [
          ...nextNodeUpserts.filter((n) => n.id !== updatedRef.id),
          updatedRef,
        ];

        // Sync action step in WebPage
        const fnName =
          masterNode?.data?.functionName ||
          masterNode?.data?.label ||
          refNode.data?.label?.replace(" (Ref)", "") ||
          "transformData";

        const sections: PageSection[] = targetWebPage.data?.sections || [];
        const updatedSections = sections.map((sec: PageSection): PageSection => ({
          ...sec,
          actions: (sec.actions || []).map((act: UIEventItem): UIEventItem => {
            if (act.id === actionId) {
              const existingSteps: FrontendActionStepDraft[] = act.actionSteps || [];
              const transStepIdx = existingSteps.findIndex(
                (s: FrontendActionStepDraft): boolean =>
                  s.type === "transform" &&
                  (s.transformerRefNodeId === refNode.id ||
                    (masterNode !== undefined && s.transformerNodeId === masterNode.id)),
              );
              const existingStep: FrontendActionStepDraft | undefined =
                transStepIdx >= 0 ? existingSteps[transStepIdx] : undefined;
              const stepToUse: FrontendActionStepDraft = {
                id: existingStep ? existingStep.id : `step-${Date.now()}`,
                order: existingStep ? existingStep.order : existingSteps.length + 1,
                type: "transform",
                name: fnName,
                transformerNodeId:
                  masterNode?.id || refNode.data?.transformerRef || "",
                transformerRefNodeId: refNode.id,
                transformerName: fnName,
                edgeId: connEdge.id,
                functionRef: {
                  name: fnName,
                  importPath: "@workspace/transformers",
                  isGlobal: true,
                  inputSchema: masterNode?.data?.inputSchema,
                  returnSchema: masterNode?.data?.returnSchema,
                },
                transformBindings: (masterNode?.data?.inputSchema || []).map(
                  (field: { name: string }) => ({
                    argName: field.name,
                    source: { kind: "literal" as const, value: "" },
                  }),
                ),
              };
              const nextSteps: FrontendActionStepDraft[] =
                transStepIdx >= 0
                  ? existingSteps.map((s: FrontendActionStepDraft, i: number): FrontendActionStepDraft =>
                      i === transStepIdx ? stepToUse : s,
                    )
                  : [...existingSteps, stepToUse];
              return { ...act, actionSteps: nextSteps };
            }
            return act;
          }),
        }));

        const updatedWp: BackendNode = {
          ...targetWebPage,
          data: {
            ...targetWebPage.data,
            sections: updatedSections,
          },
        };
        nextNodes = nextNodes.map((n) => (n.id === updatedWp.id ? updatedWp : n));
        nextNodeUpserts = [
          ...nextNodeUpserts.filter((n) => n.id !== updatedWp.id),
          updatedWp,
        ];
      }
    } else if (refNode.data?.targetServiceId) {
      const targetService = nextNodes.find((n) => n.id === refNode.data?.targetServiceId);
      if (targetService) {
        const epId =
          refNode.data?.targetEndpointId ||
          refNode.data?.targetEndpointIds?.[0] ||
          targetService.data?.endpoints?.[0]?.id;
        const handle = epId ? `endpoint-in-${epId}` : "endpoint-in";
        const connEdge: BackendEdge = {
          id: `edge-ref-${refNode.id}-${epId || "conn"}-${Date.now()}`,
          source: refNode.id,
          target: targetService.id,
          sourceHandle: "transformer-out",
          targetHandle: handle,
          type: "connection",
          data: { sequenceOrder: 1, label: "1" },
          fractionalIndex: safeGenerateKey(getLastIndex(nextEdges)),
        };
        nextEdges.push(connEdge);
        nextEdgeUpserts.push(connEdge);
      }
    }
  }

  return {
    changed: true,
    nodes: nextNodes,
    edges: nextEdges,
    pendingEdgeRemovals: Array.from(nextEdgeRemovals),
    pendingEdgeUpserts: nextEdgeUpserts,
    pendingNodeUpserts: nextNodeUpserts,
  };
}
