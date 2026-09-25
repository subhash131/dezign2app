"use client";

import { useMemo, useCallback } from "react";
import { BackendNode, UIEventItem, Endpoint, Schema, StoreActionBinding, StoreActionType } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";

export interface UseTargetStateStoreBindingParams {
  nodeId: string;
  actionId: string;
  actionName: string;
  actionEvent?: string;
  storeBinding?: UIEventItem["storeActionBinding"];
  storeBindings?: UIEventItem["storeActionBindings"];
  stateStoreNodes: BackendNode[];
  isEndpointConnected: boolean;
  connectedEndpoint?: Endpoint;
  eventRequestBody?: Schema;
  onUpdateStoreBinding?: (binding?: UIEventItem["storeActionBinding"]) => void;
  onUpdateStoreBindings?: (bindings: StoreActionBinding[]) => void;
}

export function getStoreSourceHandle(b: StoreActionBinding): string {
  const actId = b.actionId || "";
  if (actId.startsWith("setter-")) {
    const fId = b.targetFieldId || actId.replace("setter-", "");
    return `setter-out-${fId}`;
  }
  if (actId.startsWith("append-")) {
    const fId = b.targetFieldId || actId.replace("append-", "");
    return `append-out-${fId}`;
  }
  if (actId.startsWith("pop-")) {
    const fId = b.targetFieldId || actId.replace("pop-", "");
    return `pop-out-${fId}`;
  }
  if (b.actionType === "populate" || actId === "builtin-populate" || actId === "populate") {
    return "populate-out";
  }
  if (b.actionType === "reset" || actId === "builtin-reset" || actId === "reset") {
    return "reset-out";
  }
  if (actId) {
    return `store-action-out-${actId}`;
  }
  return "mutate-out";
}

export function useTargetStateStoreBinding({
  nodeId,
  actionId,
  actionName,
  actionEvent,
  storeBinding,
  storeBindings,
  stateStoreNodes,
  isEndpointConnected,
  onUpdateStoreBinding,
  onUpdateStoreBindings,
}: UseTargetStateStoreBindingParams) {
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const isPageLoad = actionEvent === "pageLoad" || actionName === "pageLoad";
  const isSse = actionEvent === "sse" || actionEvent === "sseMessage";
  const isWebsocket = actionEvent === "websocket" || actionEvent === "ws" || actionEvent === "websocketMessage";
  const isWebrtc = actionEvent === "webrtc";

  const webTargetHandle = isPageLoad
    ? `pageload-in-${actionId}`
    : isSse
    ? `sse-in-${actionId}`
    : isWebsocket
    ? `websocket-in-${actionId}`
    : isWebrtc
    ? `webrtc-in-${actionId}`
    : `event-in-${actionId}`;

  // Normalized array of bindings with stable IDs
  const normalizedBindings = useMemo((): StoreActionBinding[] => {
    let list: StoreActionBinding[] = [];
    if (Array.isArray(storeBindings) && storeBindings.length > 0) {
      list = storeBindings;
    } else if (storeBinding) {
      list = [storeBinding];
    }
    return list.map((b, idx) => ({
      ...b,
      id: b.id || `bnd-${actionId}-${idx}`,
    }));
  }, [storeBindings, storeBinding, actionId]);

  // Syncs canvas edges for all manipulations in the list
  const syncCanvasEdges = useCallback(
    (targetBindings: StoreActionBinding[]) => {
      const actionHandles = [
        webTargetHandle,
        `event-in-${actionId}`,
        `pageload-in-${actionId}`,
        `sse-in-${actionId}`,
        `websocket-in-${actionId}`,
        `webrtc-in-${actionId}`,
        `events-${actionId}`,
      ];

      // Find all existing edges connected to this action's handles
      const existingStoreEdges = edges.filter(
        (e) =>
          ((e.target === nodeId &&
            actionHandles.some(
              (h) => e.targetHandle === h || e.targetHandle?.endsWith(`-${actionId}`),
            )) ||
            (e.source === nodeId &&
              actionHandles.some(
                (h) => e.sourceHandle === h || e.sourceHandle?.endsWith(`-${actionId}`),
              ))) &&
          stateStoreNodes.some((sn) => sn.id === e.source || sn.id === e.target),
      );

      const desiredEdges: Array<{
        id: string;
        source: string;
        target: string;
        sourceHandle: string;
        targetHandle: string;
        data: Record<string, unknown>;
      }> = [];

      targetBindings.forEach((b) => {
        if (!b.storeNodeId || !b.actionId) return;
        const sourceHandle = getStoreSourceHandle(b);
        const edgeId = `edge-store-action-${b.id}-${nodeId}-${actionId}`;
        desiredEdges.push({
          id: edgeId,
          source: b.storeNodeId,
          target: nodeId,
          sourceHandle,
          targetHandle: webTargetHandle,
          data: {
            isStoreAction: true,
            isStoreActionBinding: true,
            bindingId: b.id,
            storeName: b.storeName || "Store",
            actionName: b.actionName || "action",
            actionType: b.actionType,
            targetFieldId: b.targetFieldId,
            targetFieldName: b.targetFieldName,
          },
        });
      });

      // 1. Delete edges that are no longer in desiredEdges
      existingStoreEdges.forEach((ex) => {
        const matchesDesired = desiredEdges.some(
          (d) =>
            d.id === ex.id ||
            (d.source === ex.source &&
              d.sourceHandle === ex.sourceHandle &&
              d.target === ex.target &&
              d.targetHandle === ex.targetHandle),
        );
        if (!matchesDesired) {
          deleteEdge(ex.id);
        }
      });

      // 2. Add edges that don't exist yet
      desiredEdges.forEach((d) => {
        const alreadyExists = existingStoreEdges.some(
          (ex) =>
            ex.id === d.id ||
            (ex.source === d.source &&
              ex.sourceHandle === d.sourceHandle &&
              ex.target === d.target &&
              ex.targetHandle === d.targetHandle),
        );
        if (!alreadyExists) {
          addEdge({
            id: d.id,
            source: d.source,
            target: d.target,
            sourceHandle: d.sourceHandle,
            targetHandle: d.targetHandle,
            type: "connection",
            data: d.data,
          });
        }
      });
    },
    [edges, nodeId, actionId, webTargetHandle, stateStoreNodes, deleteEdge, addEdge],
  );

  const notifyBindings = useCallback(
    (newBindings: StoreActionBinding[]) => {
      if (onUpdateStoreBindings) {
        onUpdateStoreBindings(newBindings);
      } else if (onUpdateStoreBinding) {
        onUpdateStoreBinding(newBindings[0] || undefined);
      }
      syncCanvasEdges(newBindings);
    },
    [onUpdateStoreBindings, onUpdateStoreBinding, syncCanvasEdges],
  );

  const handleAddManipulation = useCallback(() => {
    if (stateStoreNodes.length === 0) {
      toast.info("No State Store nodes exist on the canvas. Add a State Store first.");
      return;
    }

    const newBinding: StoreActionBinding = {
      id: `bnd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      storeNodeId: undefined,
      storeName: undefined,
      actionId: undefined,
      actionName: undefined,
      actionType: undefined,
      targetFieldId: undefined,
      targetFieldName: undefined,
      updateSource: isEndpointConnected ? "response" : "payload",
    };

    const next = [...normalizedBindings, newBinding];
    notifyBindings(next);
  }, [stateStoreNodes.length, isEndpointConnected, normalizedBindings, notifyBindings]);

  const handleRemoveManipulation = useCallback(
    (index: number) => {
      const next = normalizedBindings.filter((_, i) => i !== index);
      notifyBindings(next);
    },
    [normalizedBindings, notifyBindings],
  );

  const handleMoveManipulation = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= normalizedBindings.length || toIndex >= normalizedBindings.length) {
        return;
      }
      const copy = [...normalizedBindings];
      const [moved] = copy.splice(fromIndex, 1);
      if (moved) {
        copy.splice(toIndex, 0, moved);
        notifyBindings(copy);
      }
    },
    [normalizedBindings, notifyBindings],
  );

  const handleUpdateManipulation = useCallback(
    (index: number, updatedBinding: StoreActionBinding) => {
      const copy = [...normalizedBindings];
      copy[index] = updatedBinding;
      notifyBindings(copy);
    },
    [normalizedBindings, notifyBindings],
  );

  return {
    bindings: normalizedBindings,
    handleAddManipulation,
    handleRemoveManipulation,
    handleMoveManipulation,
    handleUpdateManipulation,
  };
}
