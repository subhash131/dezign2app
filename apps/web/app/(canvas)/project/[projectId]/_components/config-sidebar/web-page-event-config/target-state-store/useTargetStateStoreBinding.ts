"use client";

import React from "react";
import { BackendNode, UIEventItem, Endpoint, Schema, StoreActionType } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { AvailablePath } from "../../pipeline-step-editor/types";
import { extractPathsFromObject } from "../../pipeline-step-editor/sourcePaths";
import { parseSchemaJson } from "@/lib/compiler/utils";
import { toPascalCase, isSourceKind, SourceKind } from "./types";

export interface UseTargetStateStoreBindingParams {
  nodeId: string;
  actionId: string;
  actionName: string;
  actionEvent?: string;
  storeBinding?: UIEventItem["storeActionBinding"];
  stateStoreNodes: BackendNode[];
  isEndpointConnected: boolean;
  connectedEndpoint?: Endpoint;
  eventRequestBody?: Schema;
  onUpdateStoreBinding: (binding?: UIEventItem["storeActionBinding"]) => void;
}

export function useTargetStateStoreBinding({
  nodeId,
  actionId,
  actionName,
  actionEvent,
  storeBinding,
  stateStoreNodes,
  isEndpointConnected,
  connectedEndpoint,
  eventRequestBody,
  onUpdateStoreBinding,
}: UseTargetStateStoreBindingParams) {
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const selectedStoreNode = stateStoreNodes.find(
    (n) => n.id === storeBinding?.storeNodeId,
  );

  const fields = selectedStoreNode?.data?.fields || [];
  const customActions = selectedStoreNode?.data?.actions || [];

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

  // Helper to sync canvas edge from State Store (source) to WebPage action (target)
  const syncStoreEdge = (
    storeNodeId: string | undefined,
    storeSourceHandle: string = "mutate-out",
    storeName?: string,
    actionDisplayName?: string,
  ) => {
    // 1. Remove any existing store action edges for this action (checking both directions)
    const existingEdges = edges.filter(
      (e) =>
        ((e.target === nodeId && (e.targetHandle === webTargetHandle || e.targetHandle === `events-${actionId}` || e.targetHandle?.endsWith(`-${actionId}`))) ||
         (e.source === nodeId && (e.sourceHandle === `events-${actionId}` || e.sourceHandle === webTargetHandle))) &&
        stateStoreNodes.some((sn) => sn.id === e.source || sn.id === e.target),
    );
    existingEdges.forEach((e) => deleteEdge(e.id));

    // 2. If a store is selected, add the edge FROM StateStoreNode TO WebPageNode!
    if (storeNodeId) {
      addEdge({
        id: `edge-store-action-${storeNodeId}-${actionId}-${nodeId}`,
        source: storeNodeId,
        target: nodeId,
        sourceHandle: storeSourceHandle,
        targetHandle: webTargetHandle,
        type: "connection",
        data: {
          isStoreAction: true,
          isStoreActionBinding: true,
          storeName: storeName || "Store",
          actionName: actionDisplayName || "action",
        },
      });
    }
  };

  const handleStoreChange = (storeId: string) => {
    if (storeId === "none" || !storeId) {
      syncStoreEdge(undefined);
      onUpdateStoreBinding(undefined);
      return;
    }

    const sn = stateStoreNodes.find((s) => s.id === storeId);
    if (!sn) return;

    const storeName = sn.data?.storeName || sn.data?.label || "App";
    const storeFields = sn.data?.fields || [];
    const storeActions = sn.data?.actions || [];

    // Default to first field setter, or first custom action, or reset
    let defaultActionId: string;
    let defaultActionName: string;
    let defaultActionType: StoreActionType;
    let defaultTargetFieldId: string | undefined = undefined;
    let defaultTargetFieldName: string | undefined = undefined;
    let storeSourceHandle: string;

    if (storeFields.length > 0) {
      const firstField = storeFields[0]!;
      defaultActionId = `setter-${firstField.id}`;
      defaultActionName = `set${toPascalCase(firstField.name)}`;
      defaultActionType = "set";
      defaultTargetFieldId = firstField.id;
      defaultTargetFieldName = firstField.name;
      storeSourceHandle = `setter-out-${firstField.id}`;
    } else if (storeActions.length > 0) {
      const firstAct = storeActions[0]!;
      defaultActionId = firstAct.id;
      defaultActionName = firstAct.name;
      defaultActionType = firstAct.actionType || "custom";
      storeSourceHandle = `store-action-out-${firstAct.id}`;
    } else {
      defaultActionId = "builtin-reset";
      defaultActionName = "reset";
      defaultActionType = "reset";
      storeSourceHandle = "reset-out";
    }

    const defaultSource = isEndpointConnected ? "response" : "payload";

    const nextBinding: NonNullable<UIEventItem["storeActionBinding"]> = {
      storeNodeId: storeId,
      storeName,
      actionId: defaultActionId,
      actionName: defaultActionName,
      actionType: defaultActionType,
      targetFieldId: defaultTargetFieldId,
      targetFieldName: defaultTargetFieldName,
      updateSource: defaultSource,
    };

    syncStoreEdge(storeId, storeSourceHandle, storeName, defaultActionName);
    onUpdateStoreBinding(nextBinding);
  };

  const handleActionChange = (actionKey: string) => {
    if (!storeBinding || !selectedStoreNode) return;
    const storeName = selectedStoreNode.data?.storeName || selectedStoreNode.data?.label || "App";

    let storeSourceHandle = "mutate-out";
    let updatedBinding: NonNullable<UIEventItem["storeActionBinding"]>;

    if (actionKey === "builtin-reset") {
      storeSourceHandle = "reset-out";
      updatedBinding = {
        ...storeBinding,
        actionId: "builtin-reset",
        actionName: "reset",
        actionType: "reset",
        targetFieldId: undefined,
        targetFieldName: undefined,
        updateSource: "direct",
        valuePath: undefined,
      };
    } else if (actionKey === "builtin-populate") {
      storeSourceHandle = "populate-out";
      updatedBinding = {
        ...storeBinding,
        actionId: "builtin-populate",
        actionName: "populate",
        actionType: "populate",
        targetFieldId: undefined,
        targetFieldName: undefined,
        updateSource: isEndpointConnected ? "response" : "payload",
        parameterMappings: storeBinding.parameterMappings || {},
      };
    } else if (actionKey.startsWith("setter-")) {
      const fieldId = actionKey.replace("setter-", "");
      storeSourceHandle = `setter-out-${fieldId}`;
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const setterName = `set${toPascalCase(fieldName)}`;
      updatedBinding = {
        ...storeBinding,
        actionId: actionKey,
        actionName: setterName,
        actionType: "set",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    } else if (actionKey.startsWith("append-")) {
      const fieldId = actionKey.replace("append-", "");
      storeSourceHandle = `append-out-${fieldId}`;
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const appendName = `append${toPascalCase(fieldName)}`;
      updatedBinding = {
        ...storeBinding,
        actionId: actionKey,
        actionName: appendName,
        actionType: "append",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    } else if (actionKey.startsWith("pop-")) {
      const fieldId = actionKey.replace("pop-", "");
      storeSourceHandle = `pop-out-${fieldId}`;
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const popName = `pop${toPascalCase(fieldName)}`;
      updatedBinding = {
        ...storeBinding,
        actionId: actionKey,
        actionName: popName,
        actionType: "remove",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: "direct",
      };
    } else {
      // Custom action
      const matchedAct = customActions.find((a) => a.id === actionKey);
      storeSourceHandle = `store-action-out-${actionKey}`;
      updatedBinding = {
        ...storeBinding,
        actionId: actionKey,
        actionName: matchedAct?.name || "action",
        actionType: matchedAct?.actionType || "custom",
        targetFieldId: matchedAct?.targetFieldId,
        targetFieldName: undefined,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    }

    syncStoreEdge(storeBinding.storeNodeId, storeSourceHandle, storeName, updatedBinding.actionName);
    onUpdateStoreBinding(updatedBinding);
  };

  const endpointResponsePaths = React.useMemo((): AvailablePath[] => {
    if (!connectedEndpoint?.responseBody) return [];
    const paths: AvailablePath[] = [];

    if (Array.isArray(connectedEndpoint.responseBody.fields) && connectedEndpoint.responseBody.fields.length > 0) {
      connectedEndpoint.responseBody.fields.forEach((f) => {
        if (f.name) {
          paths.push({
            path: f.name,
            type: f.type,
            description: f.description,
          });
        }
      });
    }

    if (connectedEndpoint.responseBody.rawJson) {
      const parsed = parseSchemaJson(connectedEndpoint.responseBody.rawJson);
      if (parsed && typeof parsed === "object") {
        const jsonPaths = extractPathsFromObject(parsed);
        jsonPaths.forEach((jp) => {
          if (!paths.some((p) => p.path === jp.path)) {
            paths.push(jp);
          }
        });
      }
    }

    return paths;
  }, [connectedEndpoint?.responseBody]);

  const payloadPaths = React.useMemo((): AvailablePath[] => {
    if (!eventRequestBody) return [];
    const paths: AvailablePath[] = [];

    if (Array.isArray(eventRequestBody.fields) && eventRequestBody.fields.length > 0) {
      eventRequestBody.fields.forEach((f) => {
        if (f.name) {
          paths.push({
            path: f.name,
            type: f.type,
            description: f.description,
          });
        }
      });
    }

    if (eventRequestBody.rawJson) {
      const parsed = parseSchemaJson(eventRequestBody.rawJson);
      if (parsed && typeof parsed === "object") {
        const jsonPaths = extractPathsFromObject(parsed);
        jsonPaths.forEach((jp) => {
          if (!paths.some((p) => p.path === jp.path)) {
            paths.push(jp);
          }
        });
      }
    }

    return paths;
  }, [eventRequestBody]);

  const selectedSourceKind = React.useMemo((): SourceKind => {
    if (storeBinding?.updateSource === "response" || storeBinding?.updateSource === "response_property") {
      return isEndpointConnected ? "endpoint" : "payload";
    }
    if (storeBinding?.updateSource === "payload") {
      return "payload";
    }
    if (storeBinding?.updateSource === "static") {
      return "static";
    }
    if (storeBinding?.updateSource === "direct") {
      return "direct";
    }
    return isEndpointConnected ? "endpoint" : "payload";
  }, [storeBinding?.updateSource, isEndpointConnected]);

  const currentSuggestedPaths = React.useMemo(() => {
    if (selectedSourceKind === "endpoint") return endpointResponsePaths;
    if (selectedSourceKind === "payload") return payloadPaths;
    return [];
  }, [selectedSourceKind, endpointResponsePaths, payloadPaths]);

  const handleSourceKindChange = (srcKind: string) => {
    if (!storeBinding || !isSourceKind(srcKind)) return;
    if (srcKind === "endpoint") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: storeBinding.valuePath ? "response_property" : "response",
      });
    } else if (srcKind === "payload") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: "payload",
      });
    } else if (srcKind === "static") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: "static",
        customValue: storeBinding.customValue || "true",
      });
    } else if (srcKind === "direct") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: "direct",
      });
    }
  };

  const handlePathChange = (path: string) => {
    if (!storeBinding) return;
    const cleanPath = path.trim();
    if (selectedSourceKind === "endpoint") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: cleanPath ? "response_property" : "response",
        valuePath: cleanPath || undefined,
      });
    } else if (selectedSourceKind === "payload") {
      onUpdateStoreBinding({
        ...storeBinding,
        updateSource: "payload",
        valuePath: cleanPath || undefined,
      });
    }
  };

  const handleCustomValueChange = (val: string) => {
    if (!storeBinding) return;
    onUpdateStoreBinding({
      ...storeBinding,
      customValue: val,
    });
  };

  const handleFieldMappingChange = (fieldName: string, path: string) => {
    if (!storeBinding) return;
    const cleanPath = path.trim();
    const currentMappings: Record<string, string> = { ...(storeBinding.parameterMappings || {}) };
    if (cleanPath) {
      currentMappings[fieldName] = cleanPath;
    } else {
      delete currentMappings[fieldName];
    }
    onUpdateStoreBinding({
      ...storeBinding,
      parameterMappings: currentMappings,
    });
  };

  const handleAutoMatchPopulate = () => {
    if (!storeBinding || fields.length === 0) return;
    const nextMappings: Record<string, string> = { ...(storeBinding.parameterMappings || {}) };
    fields.forEach((f) => {
      const fieldLower = f.name.toLowerCase();
      const match = currentSuggestedPaths.find((p) => {
        const parts = p.path.split(".");
        const lastPart = parts[parts.length - 1]?.toLowerCase();
        return lastPart === fieldLower || p.path.toLowerCase() === fieldLower;
      });
      if (match) {
        nextMappings[f.name] = match.path;
      }
    });
    onUpdateStoreBinding({
      ...storeBinding,
      parameterMappings: nextMappings,
    });
  };

  const isResetAction = storeBinding?.actionType === "reset";
  const targetField = fields.find((f) => f.id === storeBinding?.targetFieldId || f.name === storeBinding?.targetFieldName);

  const selectedCustomAction = React.useMemo(() => {
    return customActions.find((a) => a.id === storeBinding?.actionId);
  }, [customActions, storeBinding?.actionId]);

  const customActionParameters = selectedCustomAction?.parameters || [];

  const isPopulateAction =
    storeBinding?.actionId === "builtin-populate" ||
    storeBinding?.actionName === "populate" ||
    storeBinding?.actionType === "populate";

  return {
    selectedStoreNode,
    fields,
    customActions,
    targetField,
    selectedCustomAction,
    customActionParameters,
    isPopulateAction,
    isResetAction,
    selectedSourceKind,
    currentSuggestedPaths,
    handleStoreChange,
    handleActionChange,
    handleSourceKindChange,
    handlePathChange,
    handleCustomValueChange,
    handleFieldMappingChange,
    handleAutoMatchPopulate,
  };
}
