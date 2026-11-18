"use client";

import { useState, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { PageSection, UIEventItem, Endpoint } from "@/types/canvas";
import { SERVER_NODE_TYPES, collectEndpoints } from "@workspace/canvas";

export interface UseSectionActionsProps {
  nodeId: string;
  section: PageSection | undefined;
  handleUpdate: (changes: Partial<PageSection>) => void;
}

export function useSectionActions({
  nodeId,
  section,
  handleUpdate,
}: UseSectionActionsProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const onConnect = useBackendCanvasStore((s) => s.onConnect);

  const parentNode = nodes.find((n) => n.id === nodeId);
  const currentActions: UIEventItem[] = section?.actions || [];

  const [actionSearch, setActionSearch] = useState("");
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  const serviceNodes = useMemo(
    () => nodes.filter((n) => n.id !== nodeId && SERVER_NODE_TYPES.includes(n.type)),
    [nodes, nodeId]
  );

  const handleAddAction = (actionName = "New Action", eventType = "click") => {
    const newActionId = crypto.randomUUID();
    const newAction: UIEventItem = {
      id: newActionId,
      name: actionName,
      event: eventType,
      ...(eventType === "navigateToPage" ? { navigationType: "link" as const } : {}),
    };

    const nextActions = [...currentActions, newAction];
    handleUpdate({ actions: nextActions });

    if (eventType === "navigateToPage" && parentNode) {
      const pos = parentNode.position || { x: 100, y: 100 };
      const newRefId = crypto.randomUUID();
      addNode({
        id: newRefId,
        type: "page_ref",
        position: { x: pos.x + 340, y: pos.y + 60 },
        data: { label: "Page Ref", description: "Target page reference" },
      });
      addEdge({
        id: `edge-${Date.now()}`,
        source: nodeId,
        target: newRefId,
        sourceHandle: `events-${newActionId}`,
        targetHandle: "page-ref-in",
        type: "connection",
      });
    }

    setExpandedActionId(newActionId);
  };

  const handleUpdateAction = (actionId: string, changes: Partial<UIEventItem>) => {
    const prevAction = currentActions.find((a) => a.id === actionId);
    const nextActions = currentActions.map((act) =>
      act.id === actionId ? { ...act, ...changes } : act
    );
    handleUpdate({ actions: nextActions });

    if (changes.event && prevAction && prevAction.event !== changes.event) {
      const store = useBackendCanvasStore.getState();
      const existingEdge = store.edges.find(
        (e) => e.source === nodeId && e.sourceHandle === `events-${actionId}`
      );

      if (changes.event === "navigateToPage" && !existingEdge && parentNode) {
        const pos = parentNode.position || { x: 100, y: 100 };
        const newRefId = crypto.randomUUID();
        store.addNode({
          id: newRefId,
          type: "page_ref",
          position: { x: pos.x + 340, y: pos.y + 60 },
          data: { label: "Page Ref", description: "Target page reference" },
        });
        store.addEdge({
          id: `edge-${Date.now()}`,
          source: nodeId,
          target: newRefId,
          sourceHandle: `events-${actionId}`,
          targetHandle: "page-ref-in",
          type: "connection",
        });
      } else if (changes.event !== "navigateToPage" && existingEdge) {
        const targetNode = store.nodes.find((n) => n.id === existingEdge.target);
        if (targetNode && targetNode.type === "page_ref") {
          store.deleteEdge(existingEdge.id);
          const remaining = store.edges.filter(
            (e) => e.target === targetNode.id && e.id !== existingEdge.id
          );
          if (remaining.length === 0) store.deleteNode(targetNode.id);
        }
      }
    }
  };

  const handleDeleteAction = (actionId: string) => {
    const store = useBackendCanvasStore.getState();
    const matchingEdges = store.edges.filter(
      (e) =>
        (e.source === nodeId && (e.sourceHandle === `events-${actionId}` || e.sourceHandle?.endsWith(`-${actionId}`))) ||
        (e.target === nodeId &&
          (e.targetHandle === `event-in-${actionId}` ||
            e.targetHandle === `pageload-in-${actionId}` ||
            e.targetHandle === `mount-in-${actionId}` ||
            e.targetHandle === `onmount-in-${actionId}` ||
            e.targetHandle === `unmount-in-${actionId}` ||
            e.targetHandle === `interval-in-${actionId}` ||
            e.targetHandle === `effect-in-${actionId}` ||
            e.targetHandle === `sse-in-${actionId}` ||
            e.targetHandle === `websocket-in-${actionId}` ||
            e.targetHandle === `webrtc-in-${actionId}` ||
            e.targetHandle?.endsWith(`-${actionId}`)))
    );

    matchingEdges.forEach((edge) => {
      const otherNodeId = edge.source === nodeId ? edge.target : edge.source;
      const otherNode = store.nodes.find((n) => n.id === otherNodeId);
      store.deleteEdge(edge.id);
      if (otherNode && otherNode.type === "page_ref") {
        const remaining = store.edges.filter(
          (e) => e.target === otherNode.id && e.id !== edge.id
        );
        if (remaining.length === 0) store.deleteNode(otherNode.id);
      }
    });

    const nextActions = currentActions.filter((act) => act.id !== actionId);
    handleUpdate({ actions: nextActions });
  };

  const handleDuplicateAction = (act: UIEventItem) => {
    const newActionId = crypto.randomUUID();
    const cloned: UIEventItem = {
      ...act,
      id: newActionId,
      name: `${act.name || "Action"} (Copy)`,
    };
    handleUpdate({ actions: [...currentActions, cloned] });
  };

  const getActionLink = (actionId: string) => {
    const existingEdge = edges.find(
      (e) =>
        (e.source === nodeId && e.sourceHandle === `events-${actionId}`) ||
        (e.target === nodeId && e.targetHandle === `events-${actionId}`)
    );
    if (!existingEdge) return null;

    const isSource = existingEdge.source === nodeId;
    const targetNodeId = isSource ? existingEdge.target : existingEdge.source;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return null;

    const handle = isSource ? existingEdge.targetHandle : existingEdge.sourceHandle;
    let endpointId = handle ? handle.replace(/^endpoint-in-/, "") : undefined;
    if (endpointId && endpointId.includes("-in-")) {
      endpointId = endpointId.split("-in-").pop();
    }

    let targetEndpoint: Endpoint | undefined;
    if (endpointId) {
      const storeEndpoints = endpoints.filter(
        (ep) => ep.nodeId === targetNodeId && ep.id === endpointId
      );
      if (storeEndpoints.length > 0) targetEndpoint = storeEndpoints[0];
      if (!targetEndpoint && targetNode.data?.endpoints) {
        targetEndpoint = targetNode.data.endpoints.find(
          (ep: Endpoint) => ep.id === endpointId
        );
      }
    }

    if (!targetEndpoint) {
      const allTargetEndpoints = collectEndpoints(targetNode, endpoints);
      if (allTargetEndpoints.length > 0) targetEndpoint = allTargetEndpoints[0];
    }

    return { targetNode, endpoint: targetEndpoint };
  };

  const handleActionServiceLink = (
    actionId: string,
    serviceId: string,
    endpointId?: string
  ) => {
    const existingEdge = edges.find(
      (e) =>
        (e.source === nodeId && e.sourceHandle === `events-${actionId}`) ||
        (e.target === nodeId && e.targetHandle === `events-${actionId}`)
    );
    if (existingEdge) deleteEdge(existingEdge.id);

    if (serviceId === "none" || !serviceId) return;
    const targetService = serviceNodes.find((n) => n.id === serviceId);
    if (!targetService) return;

    const endpointsList = collectEndpoints(targetService, endpoints);
    const targetEp = endpointId
      ? endpointsList.find((e) => e.id === endpointId) || endpointsList[0]
      : endpointsList[0];

    if (targetEp) {
      onConnect({
        source: nodeId,
        target: serviceId,
        sourceHandle: `events-${actionId}`,
        targetHandle: `endpoint-in-${targetEp.id}`,
      });
    }
  };

  return {
    currentActions,
    actionSearch,
    setActionSearch,
    expandedActionId,
    setExpandedActionId,
    serviceNodes,
    endpoints,
    handleAddAction,
    handleUpdateAction,
    handleDeleteAction,
    handleDuplicateAction,
    getActionLink,
    handleActionServiceLink,
  };
}
