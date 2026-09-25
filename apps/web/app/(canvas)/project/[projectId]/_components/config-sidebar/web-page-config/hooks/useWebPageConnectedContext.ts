import { useMemo } from "react";
import { BackendNode, BackendEdge, WebAppZone } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";

interface UseWebPageConnectedContextParams {
  nodeId: string;
  data: BackendNode["data"];
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  allEndpoints: (Endpoint & { nodeId?: string })[];
}

export function useWebPageConnectedContext({
  nodeId,
  data,
  allNodes,
  allEdges,
  allEndpoints,
}: UseWebPageConnectedContextParams) {
  // Determine connected WebApp section name & zone
  const { connectedWebApp, connectedZoneName, isZoneProtected, incomingEdge } = useMemo(() => {
    const edge = allEdges.find((e) => {
      const isTarget = e.target === nodeId;
      const isSource = e.source === nodeId;
      if (!isTarget && !isSource) return false;
      const otherId = isSource ? e.target : e.source;
      const otherNode = allNodes.find((n) => n.id === otherId);
      return otherNode?.type === "webApp";
    });
    const webApp = edge
      ? allNodes.find(
          (n) =>
            n.type === "webApp" &&
            (n.id === edge.source || n.id === edge.target),
        )
      : null;

    let zoneName: string | null = null;
    let zoneProtected = false;
    if (webApp && edge) {
      const handleId =
        edge.source === webApp.id
          ? edge.sourceHandle
          : edge.targetHandle;
      const defaultZones: WebAppZone[] = [
        {
          handleId: "public-in",
          name: "Public Section",
          accessType: "public",
          id: "zone-public",
          rule: {
            id: "rule-public",
            scope: "zone",
            conditions: { kind: "leaf", condition: { type: "auth", op: "signedOut" } },
            redirects: { default: "/login" },
          },
        },
        {
          handleId: "private-in",
          name: "Private Section",
          accessType: "protected",
          id: "zone-private",
          rule: {
            id: "rule-private",
            scope: "zone",
            conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
            redirects: { default: "/login" },
          },
        },
      ];
      const zones: WebAppZone[] =
        webApp.data?.zones && webApp.data.zones.length > 0
          ? webApp.data.zones
          : defaultZones;
      const matchedZone = zones.find((z: WebAppZone) => z.handleId === handleId);
      if (matchedZone) {
        zoneName = matchedZone.name;
        zoneProtected =
          matchedZone.accessType === "protected" ||
          matchedZone.id === "zone-private" ||
          matchedZone.handleId === "private-in" ||
          (matchedZone.accessType !== "public" && matchedZone.id !== "zone-public");
      } else if (handleId === "public-in" || handleId?.includes("public")) {
        zoneName = "Public Section";
        zoneProtected = false;
      } else if (handleId === "private-in" || handleId?.includes("private")) {
        zoneName = "Private Section";
        zoneProtected = true;
      }
    }

    return {
      connectedWebApp: webApp,
      connectedZoneName: zoneName,
      isZoneProtected: zoneProtected,
      incomingEdge: edge,
    };
  }, [allEdges, allNodes, nodeId]);

  const isProtected = useMemo(() => {
    if (data.useZoneDefault === false) {
      return (data.accessType && data.accessType !== "public") || Boolean(data.protectionOverride);
    }
    if (connectedWebApp) {
      return isZoneProtected;
    }
    return Boolean(
      connectedZoneName?.toLowerCase().includes("private") ||
        connectedZoneName?.toLowerCase().includes("protected") ||
        (data.accessType && data.accessType !== "public"),
    );
  }, [data.useZoneDefault, data.accessType, data.protectionOverride, connectedWebApp, isZoneProtected, connectedZoneName]);

  // Find connected service endpoint via any edge connected to this WebPage node
  const connectedEndpoint = useMemo<Endpoint | null>(() => {
    const connectedServiceEdge = allEdges.find(
      (e) =>
        (e.source === nodeId &&
          allNodes.some((n) => n.id === e.target && n.type === "service")) ||
        (e.target === nodeId &&
          allNodes.some((n) => n.id === e.source && n.type === "service")),
    );

    let activeServiceEdge = connectedServiceEdge;
    if (!activeServiceEdge) {
      const storageRefEdge = allEdges.find(
        (e) =>
          (e.source === nodeId &&
            allNodes.some(
              (n) =>
                n.id === e.target &&
                (n.type === "storage_operation_ref" ||
                  n.type === "storage_ref" ||
                  n.type === "bucket_ref" ||
                  n.type === "storage_bucket_ref" ||
                  n.type === "StorageBucketRefNode" ||
                  n.type === "StorageOperationRefNode"),
            )) ||
          (e.target === nodeId &&
            allNodes.some(
              (n) =>
                n.id === e.source &&
                (n.type === "storage_operation_ref" ||
                  n.type === "storage_ref" ||
                  n.type === "bucket_ref" ||
                  n.type === "storage_bucket_ref" ||
                  n.type === "StorageBucketRefNode" ||
                  n.type === "StorageOperationRefNode"),
            )),
      );

      if (storageRefEdge) {
        const refNodeId =
          storageRefEdge.source === nodeId
            ? storageRefEdge.target
            : storageRefEdge.source;
        activeServiceEdge = allEdges.find(
          (e) =>
            (e.source === refNodeId &&
              allNodes.some((n) => n.id === e.target && n.type === "service")) ||
            (e.target === refNodeId &&
              allNodes.some((n) => n.id === e.source && n.type === "service")),
        );
      }
    }

    if (!activeServiceEdge) return null;

    const isTargetService = allNodes.some(
      (n) => n.id === activeServiceEdge!.target && n.type === "service",
    );
    const targetNodeId = isTargetService
      ? activeServiceEdge.target
      : activeServiceEdge.source;
    const targetHandle = isTargetService
      ? activeServiceEdge.targetHandle
      : activeServiceEdge.sourceHandle;
    const targetNode = allNodes.find((n) => n.id === targetNodeId);

    if (!targetNode) return null;

    let endpointId = targetHandle
      ? targetHandle.replace(
          /^(endpoint-in-|endpoint-out-|endpoints-in-|endpoints-out-|events-in-|events-out-)/,
          "",
        )
      : undefined;

    if (endpointId && endpointId.includes("-in-")) {
      const parts = endpointId.split("-in-");
      endpointId = parts[parts.length - 1];
    }

    if (endpointId) {
      const endpointsList: Endpoint[] = targetNode.data?.endpoints || [];
      const found =
        allEndpoints.find(
          (ep) =>
            ep.nodeId === targetNode.id &&
            (ep.id === endpointId || ep.name === endpointId),
        ) ||
        endpointsList.find(
          (ep: Endpoint) => ep.id === endpointId || ep.name === endpointId,
        ) ||
        null;
      if (found) return found;
    }

    const srvEndpoints = allEndpoints.filter((ep) => ep.nodeId === targetNode.id);
    if (srvEndpoints.length > 0 && srvEndpoints[0]) {
      return srvEndpoints[0];
    }
    const nodeEndpointsList: Endpoint[] = targetNode.data?.endpoints || [];
    if (nodeEndpointsList.length > 0 && nodeEndpointsList[0]) {
      return nodeEndpointsList[0];
    }

    return null;
  }, [allEdges, allNodes, allEndpoints, nodeId]);

  return {
    connectedWebApp,
    connectedZoneName,
    isProtected,
    connectedEndpoint,
  };
}
