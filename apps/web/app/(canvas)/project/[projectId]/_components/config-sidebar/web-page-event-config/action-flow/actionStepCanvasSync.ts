import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type {
  BackendNode,
  BackendEdge,
  RealtimeConnection,
  PageSection,
  UIEventItem,
} from "@workspace/canvas";
import type { FrontendActionStepDraft } from "./types";

export function getWebPageSourceHandle(webPageNodeId: string, actionId: string): string {
  const store = useBackendCanvasStore.getState();
  const wpNode = store.nodes.find((n) => n.id === webPageNodeId);
  const isRealtime =
    actionId.startsWith("rtc-") ||
    Boolean(wpNode?.data?.realtimeConnections?.some((c: RealtimeConnection) => c.id === actionId));
  return isRealtime ? `rtc-out-${actionId}` : `events-${actionId}`;
}

export interface EnsureActionServiceConnectionParams {
  webPageNodeId: string;
  actionId: string;
  serviceNodeId: string;
  endpointId: string;
  stepOrder: number;
  previousEdgeId?: string;
}

export function ensureActionServiceConnection({
  webPageNodeId,
  actionId,
  serviceNodeId,
  endpointId,
  stepOrder,
  previousEdgeId,
}: EnsureActionServiceConnectionParams): string | undefined {
  if (!webPageNodeId || !actionId || !serviceNodeId || !endpointId) return undefined;

  const store = useBackendCanvasStore.getState();
  const sourceHandle = getWebPageSourceHandle(webPageNodeId, actionId);
  const targetHandle = `endpoint-in-${endpointId}`;

  // 1. Identify previous edge for this step (if any)
  const prevEdge =
    (previousEdgeId ? store.edges.find((e) => e.id === previousEdgeId) : undefined) ||
    store.edges.find(
      (e) =>
        e.source === webPageNodeId &&
        e.sourceHandle === sourceHandle &&
        (e.data?.sequenceOrder === stepOrder ||
          e.data?.label === String(stepOrder)),
    );

  // 2. Find existing edge already targeting this exact service & endpoint
  const existingTargetEdge = store.edges.find((e) => {
    const forwardMatch =
      e.source === webPageNodeId &&
      e.target === serviceNodeId &&
      e.sourceHandle === sourceHandle &&
      (e.targetHandle === targetHandle ||
        e.targetHandle === `func-in-${endpointId}` ||
        e.targetHandle?.includes(endpointId));
    return forwardMatch;
  });

  if (prevEdge) {
    // If an edge to the target already exists and is distinct from prevEdge, remove prevEdge
    if (existingTargetEdge && existingTargetEdge.id !== prevEdge.id) {
      store.deleteEdge(prevEdge.id);
      if (
        existingTargetEdge.targetHandle !== targetHandle ||
        existingTargetEdge.data?.sequenceOrder !== stepOrder ||
        existingTargetEdge.data?.label !== String(stepOrder)
      ) {
        store.updateEdge(existingTargetEdge.id, {
          targetHandle,
          data: {
            ...existingTargetEdge.data,
            sequenceOrder: stepOrder,
            label: String(stepOrder),
          },
        });
      }
      return existingTargetEdge.id;
    }

    // Otherwise, update prevEdge to the new service and endpoint
    const oldTargetId = prevEdge.target;
    store.updateEdge(prevEdge.id, {
      target: serviceNodeId,
      targetHandle,
      data: {
        ...prevEdge.data,
        sequenceOrder: stepOrder,
        label: String(stepOrder),
      },
    });

    // If prevEdge was previously pointing to an orphaned StorageBucketRefNode, clean it up
    if (oldTargetId !== serviceNodeId) {
      const remainingEdges = store.edges.filter(
        (e) => e.id !== prevEdge.id && (e.target === oldTargetId || e.source === oldTargetId),
      );
      const oldNode = store.nodes.find((n) => n.id === oldTargetId);
      if (
        remainingEdges.length === 0 &&
        oldNode &&
        (oldNode.type === "StorageBucketRefNode" ||
          oldNode.type === "storage_ref" ||
          oldNode.type === "storage_operation_ref")
      ) {
        store.deleteNode(oldTargetId);
      }
    }

    return prevEdge.id;
  }

  if (existingTargetEdge) {
    if (
      existingTargetEdge.targetHandle !== targetHandle ||
      existingTargetEdge.data?.sequenceOrder !== stepOrder ||
      existingTargetEdge.data?.label !== String(stepOrder)
    ) {
      store.updateEdge(existingTargetEdge.id, {
        targetHandle,
        data: {
          ...existingTargetEdge.data,
          sequenceOrder: stepOrder,
          label: String(stepOrder),
        },
      });
    }
    return existingTargetEdge.id;
  }

  // Draw new edge automatically on canvas
  const newEdgeId = `edge-action-${actionId}-${serviceNodeId}-${endpointId}-${Date.now()}`;
  store.addEdge({
    id: newEdgeId,
    source: webPageNodeId,
    target: serviceNodeId,
    sourceHandle,
    targetHandle,
    type: "connection",
    data: {
      sequenceOrder: stepOrder,
      label: String(stepOrder),
    },
  });

  return newEdgeId;
}

export interface EnsureActionStorageConnectionParams {
  webPageNodeId: string;
  actionId: string;
  storageNodeId?: string;
  bucketId: string;
  stepOrder: number;
  previousEdgeId?: string;
}

export function ensureActionStorageConnection({
  webPageNodeId,
  actionId,
  storageNodeId,
  bucketId,
  stepOrder,
  previousEdgeId,
}: EnsureActionStorageConnectionParams): { edgeId: string; refNodeId: string } | undefined {
  if (!webPageNodeId || !actionId || !bucketId) return undefined;

  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;
  const sourceHandle = getWebPageSourceHandle(webPageNodeId, actionId);

  // 1. Look for an existing StorageBucketRefNode for this bucket
  let refNode = allNodes.find((n) => {
    const isRefType =
      n.type === "storage_operation_ref" ||
      n.type === "storage_ref" ||
      n.type === "StorageBucketRefNode";
    if (!isRefType) return false;
    return n.data?.bucketId === bucketId || n.data?.bucketName === bucketId;
  });

  // 2. If no ref node exists on canvas, create one!
  if (!refNode) {
    const webPageNode = allNodes.find((n) => n.id === webPageNodeId);
    const storageNode =
      allNodes.find((n) => n.id === storageNodeId) ||
      allNodes.find((n) => n.type === "storage");

    // Resolve the human-readable bucket name from the storage node's buckets array
    const storageBuckets = storageNode?.data?.buckets ?? [];
    const matchedBucket = storageBuckets.find(
      (b) => b.id === bucketId || b.name === bucketId,
    );
    const resolvedBucketName = matchedBucket?.name || bucketId;
    const resolvedBucketId = matchedBucket?.id || bucketId;

    const newRefNodeId = `storage-ref-${resolvedBucketId}-${Date.now()}`;
    const basePos = webPageNode?.position || { x: 300, y: 300 };
    const existingRefNodes = allNodes.filter(
      (n) =>
        n.type === "storage_operation_ref" ||
        n.type === "storage_ref" ||
        n.type === "StorageBucketRefNode",
    );
    const offset = (existingRefNodes.length + 1) * 80;

    store.addNode({
      id: newRefNodeId,
      type: "StorageBucketRefNode",
      position: {
        x: basePos.x + 360,
        y: basePos.y + offset,
      },
      data: {
        label: resolvedBucketName,
        bucketId: resolvedBucketId,
        bucketName: resolvedBucketName,
        storageNodeId: storageNode?.id || storageNodeId,
        storageOperations: [
          {
            id: "op-upload",
            name: "uploadObject",
            kind: "presign_upload",
            label: "Upload Object (PUT)",
          },
        ],
      },
    });

    refNode = useBackendCanvasStore.getState().nodes.find((n) => n.id === newRefNodeId);
  }

  if (!refNode) return undefined;

  const targetHandle = "func-in-uploadObject";

  // 3. Identify previous edge for this step (if any)
  const prevEdge =
    (previousEdgeId ? store.edges.find((e) => e.id === previousEdgeId) : undefined) ||
    store.edges.find(
      (e) =>
        e.source === webPageNodeId &&
        e.sourceHandle === sourceHandle &&
        (e.data?.sequenceOrder === stepOrder ||
          e.data?.label === String(stepOrder)),
    );

  // 4. Look for existing edge to this ref node
  const existingEdge = store.edges.find(
    (e) =>
      e.source === webPageNodeId &&
      e.target === refNode!.id &&
      e.sourceHandle === sourceHandle,
  );

  if (prevEdge) {
    if (existingEdge && existingEdge.id !== prevEdge.id) {
      store.deleteEdge(prevEdge.id);
      if (
        existingEdge.data?.sequenceOrder !== stepOrder ||
        existingEdge.data?.label !== String(stepOrder) ||
        existingEdge.data?.bucketId !== bucketId
      ) {
        store.updateEdge(existingEdge.id, {
          targetHandle,
          data: {
            ...existingEdge.data,
            sequenceOrder: stepOrder,
            label: String(stepOrder),
            operationName: "uploadObject",
            bucketId,
          },
        });
      }
      return { edgeId: existingEdge.id, refNodeId: refNode.id };
    }

    const oldTargetNodeId = prevEdge.target;
    store.updateEdge(prevEdge.id, {
      target: refNode.id,
      targetHandle,
      data: {
        ...prevEdge.data,
        sequenceOrder: stepOrder,
        label: String(stepOrder),
        operationName: "uploadObject",
        bucketId,
      },
    });

    if (oldTargetNodeId !== refNode.id) {
      const remainingEdges = store.edges.filter(
        (e) => e.id !== prevEdge.id && (e.target === oldTargetNodeId || e.source === oldTargetNodeId),
      );
      const oldNode = store.nodes.find((n) => n.id === oldTargetNodeId);
      if (
        remainingEdges.length === 0 &&
        oldNode &&
        (oldNode.type === "StorageBucketRefNode" ||
          oldNode.type === "storage_ref" ||
          oldNode.type === "storage_operation_ref")
      ) {
        store.deleteNode(oldTargetNodeId);
      }
    }

    return { edgeId: prevEdge.id, refNodeId: refNode.id };
  }

  if (existingEdge) {
    if (
      existingEdge.data?.sequenceOrder !== stepOrder ||
      existingEdge.data?.label !== String(stepOrder) ||
      existingEdge.data?.bucketId !== bucketId
    ) {
      store.updateEdge(existingEdge.id, {
        targetHandle,
        data: {
          ...existingEdge.data,
          sequenceOrder: stepOrder,
          label: String(stepOrder),
          operationName: "uploadObject",
          bucketId,
        },
      });
    }
    return { edgeId: existingEdge.id, refNodeId: refNode.id };
  }

  // Draw new edge to storage bucket ref
  const newEdgeId = `edge-action-${actionId}-${refNode.id}-${Date.now()}`;
  store.addEdge({
    id: newEdgeId,
    source: webPageNodeId,
    target: refNode.id,
    sourceHandle,
    targetHandle,
    type: "connection",
    data: {
      sequenceOrder: stepOrder,
      label: String(stepOrder),
      operationName: "uploadObject",
      bucketId,
    },
  });

  return { edgeId: newEdgeId, refNodeId: refNode.id };
}

export interface EnsureActionTransformerConnectionParams {
  webPageNodeId: string;
  actionId: string;
  transformerNodeId: string;
  stepOrder: number;
  previousEdgeId?: string;
}

export interface EnsureActionTransformerResult {
  edgeId: string;
  refNodeId?: string;
}

export function getWebPageActionInboundHandle(webPageNodeId: string, actionId: string): string {
  const store = useBackendCanvasStore.getState();
  const wpNode = store.nodes.find((n) => n.id === webPageNodeId);
  const sections: PageSection[] = wpNode?.data?.sections || [];
  const action: UIEventItem | undefined = sections
    .flatMap((s: PageSection): UIEventItem[] => s.actions || [])
    .find((a: UIEventItem): boolean => a.id === actionId || a.name === actionId || a.event === actionId);
  const evtStr = (action?.event || action?.name || "").toLowerCase();
  const isPageLoad =
    evtStr === "pageload" ||
    actionId === "pageLoad" ||
    actionId.toLowerCase().includes("pageload");
  const isSse = evtStr === "sse" || evtStr === "ssemessage";
  const isWebsocket =
    evtStr === "websocket" ||
    evtStr === "ws" ||
    evtStr === "websocketmessage";
  const isWebrtc = evtStr === "webrtc";

  const resolvedActionId = action?.id || actionId;

  return isPageLoad
    ? `pageload-in-${resolvedActionId}`
    : isSse
    ? `sse-in-${resolvedActionId}`
    : isWebsocket
    ? `websocket-in-${resolvedActionId}`
    : isWebrtc
    ? `webrtc-in-${resolvedActionId}`
    : `event-in-${resolvedActionId}`;
}

export function ensureActionTransformerConnection({
  webPageNodeId,
  actionId,
  transformerNodeId,
  stepOrder,
  previousEdgeId,
}: EnsureActionTransformerConnectionParams): EnsureActionTransformerResult | undefined {
  if (!webPageNodeId || !actionId || !transformerNodeId) return undefined;

  const store = useBackendCanvasStore.getState();
  const sourceHandle = "transformer-out";
  const targetHandle = getWebPageActionInboundHandle(webPageNodeId, actionId);

  const targetNode = store.nodes.find((n) => n.id === transformerNodeId);
  const isRefNode = targetNode?.type === "transformer_ref";
  const isGlobal = isRefNode || targetNode?.data?.scope !== "local";
  const masterId = isRefNode ? targetNode?.data?.transformerRef || targetNode?.id : targetNode?.id;

  let refNode: BackendNode | undefined = undefined;

  if (isRefNode) {
    refNode = targetNode;
  } else if (isGlobal && masterId) {
    // Look for existing transformer_ref node for this master transformer or webPage
    refNode = store.nodes.find(
      (n) =>
        n.type === "transformer_ref" &&
        (n.data?.transformerRef === masterId ||
          n.id === transformerNodeId ||
          n.data?.targetWebPageId === webPageNodeId),
    );

    // If no ref node exists on canvas, create one!
    if (!refNode) {
      const refNodeId = `transformer-ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const wpNode = store.nodes.find((n) => n.id === webPageNodeId);
      const basePos = wpNode?.position || { x: 300, y: 300 };
      const existingRefs = store.nodes.filter(
        (n) =>
          n.type === "transformer_ref" ||
          n.type === "storage_operation_ref" ||
          n.type === "StorageBucketRefNode",
      );
      const offset = (existingRefs.length + 1) * 80;
      const fnName = targetNode?.data?.label || targetNode?.data?.functionName || "Transformer";

      store.addNode({
        id: refNodeId,
        type: "transformer_ref",
        position: {
          x: Math.max(0, basePos.x - 300),
          y: basePos.y + offset,
        },
        data: {
          label: `${fnName} (Ref)`,
          transformerRef: masterId,
          targetWebPageId: webPageNodeId,
          targetActionId: actionId,
          targetActionIds: [actionId],
        },
      });
      refNode = useBackendCanvasStore.getState().nodes.find((n) => n.id === refNodeId);
    } else {
      const curActs: string[] = refNode.data?.targetActionIds || (refNode.data?.targetActionId ? [refNode.data.targetActionId] : []);
      const nextActs = !curActs.includes(actionId) ? [...curActs, actionId] : curActs;
      store.updateNode(refNode.id, {
        data: {
          ...refNode.data,
          transformerRef: refNode.data?.transformerRef || masterId,
          targetWebPageId: webPageNodeId,
          targetActionId: actionId,
          targetActionIds: nextActs,
        },
      });
    }

    // Ensure invisible reference edge from master global transformer to transformer_ref node
    if (refNode && masterId && masterId !== refNode.id) {
      const refEdgeExists = store.edges.some(
        (e) =>
          (e.type === "transformer-reference" || e.type === "reference") &&
          e.source === masterId &&
          e.target === refNode!.id,
      );
      if (!refEdgeExists) {
        store.addEdge({
          id: `edge-ref-link-${masterId}-${refNode.id}`,
          source: masterId,
          target: refNode.id,
          sourceHandle: "transformer-out",
          targetHandle: "transformer-in",
          type: "transformer-reference",
        });
      }
    }
  }

  const effectiveSourceId = refNode ? refNode.id : transformerNodeId;

  // Purge any obsolete direct edges between master global transformer and webPage
  if (masterId && masterId !== effectiveSourceId) {
    store.edges
      .filter(
        (e) =>
          (e.source === masterId && e.target === webPageNodeId) ||
          (e.source === webPageNodeId && e.target === masterId),
      )
      .forEach((e) => store.deleteEdge(e.id));
  }

  // 1. Identify previous edge for this step (if any)
  const prevEdge =
    (previousEdgeId ? store.edges.find((e) => e.id === previousEdgeId) : undefined) ||
    store.edges.find(
      (e) =>
        e.target === webPageNodeId &&
        (e.targetHandle === targetHandle || e.targetHandle?.endsWith(`-${actionId}`)) &&
        (e.data?.sequenceOrder === stepOrder ||
          e.data?.label === String(stepOrder)),
    ) ||
    store.edges.find(
      (e) =>
        e.source === webPageNodeId &&
        (e.sourceHandle?.endsWith(`-${actionId}`) || e.sourceHandle === `events-${actionId}`) &&
        (e.target === effectiveSourceId || (refNode && e.target === refNode.id)),
    );

  // 2. Find existing connection edge between effectiveSourceId and webPage
  const existingTargetEdge = store.edges.find(
    (e) =>
      e.source === effectiveSourceId &&
      e.target === webPageNodeId &&
      e.targetHandle === targetHandle,
  ) || store.edges.find(
    (e) =>
      (e.source === effectiveSourceId && e.target === webPageNodeId) ||
      (e.source === webPageNodeId && (e.target === effectiveSourceId || (refNode && e.target === refNode.id))),
  );

  if (prevEdge) {
    if (existingTargetEdge && existingTargetEdge.id !== prevEdge.id) {
      store.deleteEdge(prevEdge.id);
      store.updateEdge(existingTargetEdge.id, {
        source: effectiveSourceId,
        target: webPageNodeId,
        sourceHandle,
        targetHandle,
        data: {
          ...existingTargetEdge.data,
          sequenceOrder: stepOrder,
          label: String(stepOrder),
        },
      });
      return { edgeId: existingTargetEdge.id, refNodeId: refNode?.id };
    }

    const oldOtherNodeId = prevEdge.source === webPageNodeId ? prevEdge.target : prevEdge.source;
    store.updateEdge(prevEdge.id, {
      source: effectiveSourceId,
      target: webPageNodeId,
      sourceHandle,
      targetHandle,
      data: {
        ...prevEdge.data,
        sequenceOrder: stepOrder,
        label: String(stepOrder),
      },
    });

    if (oldOtherNodeId !== effectiveSourceId) {
      const remainingEdges = store.edges.filter(
        (e) =>
          e.id !== prevEdge.id &&
          (e.target === oldOtherNodeId || e.source === oldOtherNodeId) &&
          e.type !== "transformer-reference" &&
          e.type !== "reference",
      );
      const oldNode = store.nodes.find((n) => n.id === oldOtherNodeId);
      if (
        remainingEdges.length === 0 &&
        oldNode &&
        oldNode.type === "transformer_ref"
      ) {
        store.deleteNode(oldOtherNodeId);
      }
    }

    return { edgeId: prevEdge.id, refNodeId: refNode?.id };
  }

  if (existingTargetEdge) {
    store.updateEdge(existingTargetEdge.id, {
      source: effectiveSourceId,
      target: webPageNodeId,
      sourceHandle,
      targetHandle,
      data: {
        ...existingTargetEdge.data,
        sequenceOrder: stepOrder,
        label: String(stepOrder),
      },
    });
    return { edgeId: existingTargetEdge.id, refNodeId: refNode?.id };
  }

  // Draw new edge automatically on canvas: transformer-out (right) -> webPage left handle
  const newEdgeId = `edge-action-${actionId}-${effectiveSourceId}-${Date.now()}`;
  store.addEdge({
    id: newEdgeId,
    source: effectiveSourceId,
    target: webPageNodeId,
    sourceHandle,
    targetHandle,
    type: "connection",
    data: {
      sequenceOrder: stepOrder,
      label: String(stepOrder),
    },
  });

  return { edgeId: newEdgeId, refNodeId: refNode?.id };
}

export interface EnsureActionStateStoreConnectionParams {
  webPageNodeId: string;
  actionId: string;
  stateStoreNodeId: string;
  targetFieldId?: string;
  stepOrder: number;
  previousEdgeId?: string;
}

export function ensureActionStateStoreConnection({
  webPageNodeId,
  actionId,
  stateStoreNodeId,
  targetFieldId,
  stepOrder,
  previousEdgeId,
}: EnsureActionStateStoreConnectionParams): string | undefined {
  if (!webPageNodeId || !actionId || !stateStoreNodeId) return undefined;

  const store = useBackendCanvasStore.getState();
  const sourceHandle = targetFieldId ? `store-field-out-${targetFieldId}` : "store-out";
  const targetHandle = getWebPageActionInboundHandle(webPageNodeId, actionId);

  // 1. Identify previous edge for this step (if any)
  const prevEdge =
    (previousEdgeId ? store.edges.find((e) => e.id === previousEdgeId) : undefined) ||
    store.edges.find(
      (e) =>
        ((e.source === stateStoreNodeId && e.target === webPageNodeId) ||
          (e.source === webPageNodeId && e.target === stateStoreNodeId)) &&
        (e.data?.sequenceOrder === stepOrder ||
          e.data?.label === String(stepOrder)),
    );

  // 2. Find existing edge already targeting or connecting this state_store and action
  const existingTargetEdge = store.edges.find((e) => {
    const isMatchingNodes =
      (e.source === stateStoreNodeId && e.target === webPageNodeId) ||
      (e.source === webPageNodeId && e.target === stateStoreNodeId);
    if (!isMatchingNodes) return false;
    return (
      e.targetHandle === targetHandle ||
      e.sourceHandle === targetHandle ||
      e.targetHandle === `events-${actionId}` ||
      e.sourceHandle === `events-${actionId}` ||
      e.targetHandle?.endsWith(`-${actionId}`) ||
      e.sourceHandle?.endsWith(`-${actionId}`)
    );
  });

  if (prevEdge) {
    if (existingTargetEdge && existingTargetEdge.id !== prevEdge.id) {
      store.deleteEdge(prevEdge.id);
      if (
        existingTargetEdge.source !== stateStoreNodeId ||
        existingTargetEdge.target !== webPageNodeId ||
        existingTargetEdge.sourceHandle !== sourceHandle ||
        existingTargetEdge.targetHandle !== targetHandle ||
        existingTargetEdge.data?.sequenceOrder !== stepOrder ||
        existingTargetEdge.data?.label !== String(stepOrder) ||
        existingTargetEdge.data?.targetFieldId !== targetFieldId
      ) {
        store.updateEdge(existingTargetEdge.id, {
          source: stateStoreNodeId,
          target: webPageNodeId,
          sourceHandle,
          targetHandle,
          data: {
            ...existingTargetEdge.data,
            sequenceOrder: stepOrder,
            label: String(stepOrder),
            targetFieldId,
            isStateMutation: true,
          },
        });
      }
      return existingTargetEdge.id;
    }

    store.updateEdge(prevEdge.id, {
      source: stateStoreNodeId,
      target: webPageNodeId,
      sourceHandle,
      targetHandle,
      data: {
        ...prevEdge.data,
        sequenceOrder: stepOrder,
        label: String(stepOrder),
        targetFieldId,
        isStateMutation: true,
      },
    });
    return prevEdge.id;
  }

  if (existingTargetEdge) {
    if (
      existingTargetEdge.source !== stateStoreNodeId ||
      existingTargetEdge.target !== webPageNodeId ||
      existingTargetEdge.sourceHandle !== sourceHandle ||
      existingTargetEdge.targetHandle !== targetHandle ||
      existingTargetEdge.data?.sequenceOrder !== stepOrder ||
      existingTargetEdge.data?.label !== String(stepOrder) ||
      existingTargetEdge.data?.targetFieldId !== targetFieldId
    ) {
      store.updateEdge(existingTargetEdge.id, {
        source: stateStoreNodeId,
        target: webPageNodeId,
        sourceHandle,
        targetHandle,
        data: {
          ...existingTargetEdge.data,
          sequenceOrder: stepOrder,
          label: String(stepOrder),
          targetFieldId,
          isStateMutation: true,
        },
      });
    }
    return existingTargetEdge.id;
  }

  // Draw new edge automatically on canvas: from StateStore right handle to WebPage action left handle
  const newEdgeId = `edge-action-${actionId}-${stateStoreNodeId}-${Date.now()}`;
  store.addEdge({
    id: newEdgeId,
    source: stateStoreNodeId,
    target: webPageNodeId,
    sourceHandle,
    targetHandle,
    type: "connection",
    data: {
      sequenceOrder: stepOrder,
      label: String(stepOrder),
      targetFieldId,
      isStateMutation: true,
    },
  });

  return newEdgeId;
}

export function cleanupActionStepEdge(edgeId: string): void {
  if (!edgeId) return;
  const store = useBackendCanvasStore.getState();
  const edge = store.edges.find((e) => e.id === edgeId);
  if (!edge) return;
  const sourceId = edge.source;
  const targetId = edge.target;
  store.deleteEdge(edgeId);

  // If source or target was an orphaned transformer_ref or StorageBucketRefNode, clean it up!
  for (const candidateId of [sourceId, targetId]) {
    if (!candidateId) continue;
    const remainingEdges = store.edges.filter(
      (e) =>
        e.id !== edgeId &&
        (e.target === candidateId || e.source === candidateId) &&
        e.type !== "transformer-reference" &&
        e.type !== "reference",
    );
    const candidateNode = store.nodes.find((n) => n.id === candidateId);
    if (
      remainingEdges.length === 0 &&
      candidateNode &&
      (candidateNode.type === "transformer_ref" ||
        candidateNode.type === "StorageBucketRefNode" ||
        candidateNode.type === "storage_ref" ||
        candidateNode.type === "storage_operation_ref")
    ) {
      store.deleteNode(candidateId);
    }
  }
}

export function reorderActionStepEdges(
  steps: FrontendActionStepDraft[],
  webPageNodeId: string,
  actionId: string,
): void {
  const store = useBackendCanvasStore.getState();
  const sourceHandle = getWebPageSourceHandle(webPageNodeId, actionId);

  steps.forEach((step, idx) => {
    const newOrder = idx + 1;
    if (step.edgeId) {
      const edge = store.edges.find((e) => e.id === step.edgeId);
      if (edge && (edge.data?.sequenceOrder !== newOrder || edge.data?.label !== String(newOrder))) {
        store.updateEdge(edge.id, {
          ...edge,
          data: {
            ...edge.data,
            sequenceOrder: newOrder,
            label: String(newOrder),
          },
        });
      }
    }
  });
}
