import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { pageRouteToUrl } from "@workspace/canvas";
import { toEnvVarName, toServiceBaseUrlEnvName } from "@/lib/compiler/utils";
import { LinkedEndpointInfo } from "./types";

export function getServicePort(targetNode: BackendNode): string {
  const data = targetNode.data;
  const serverSection = data?.server || data?.serverConfig;
  const rawPort = data?.port ?? serverSection?.port;
  if (rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== "") {
    return String(rawPort).trim();
  }
  const fw = (data?.framework || data?.techStack)?.toString().toLowerCase();
  if (fw === "fastapi" || fw === "python" || fw === "flask") return "8000";
  if (fw === "express" || fw === "node" || fw === "hono" || fw === "nest") return "8080";
  return "8080";
}

export function resolveLinkedEndpoint(
  fromNodeId: string,
  eventId: string,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  allEndpoints: (Endpoint & { nodeId: string })[] = [],
  depth: number = 0,
): LinkedEndpointInfo | null {
  if (depth > 5) return null;

  const edge = allEdges.find(
    (e) =>
      e.source === fromNodeId &&
      (e.sourceHandle === `events-${eventId}` ||
        e.sourceHandle === eventId ||
        e.sourceHandle?.endsWith(eventId)),
  );

  if (!edge || !edge.target) return null;

  const targetNode = allNodes.find((n) => n.id === edge.target);
  if (!targetNode) return null;

  const targetHandle = edge.targetHandle || "";

  if (
    targetHandle.startsWith("pageload-in-") ||
    targetHandle.startsWith("sse-in-") ||
    targetHandle.startsWith("websocket-in-") ||
    targetHandle.startsWith("ws-in-") ||
    targetHandle.startsWith("event-in-")
  ) {
    const nextEventId = targetHandle.replace(
      /^(pageload|sse|websocket|ws|event)-in-/,
      "",
    );
    return resolveLinkedEndpoint(
      edge.target,
      nextEventId,
      allNodes,
      allEdges,
      allEndpoints,
      depth + 1,
    );
  }

  if (targetNode.type === "service") {
    const targetPort = getServicePort(targetNode);
    const targetServiceName = targetNode.data?.label || "Service";

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

    let ep: Endpoint | undefined;

    if (endpointId) {
      ep = allEndpoints.find(
        (e) =>
          e.nodeId === targetNode.id &&
          (e.id === endpointId || e.name === endpointId),
      );

      if (!ep && targetNode.data?.endpoints) {
        ep = (targetNode.data.endpoints as Endpoint[]).find(
          (e) => e.id === endpointId || e.name === endpointId,
        );
      }

      if (!ep && targetNode.data?.routeGroups) {
        for (const group of targetNode.data.routeGroups) {
          if (group.endpoints) {
            ep = group.endpoints.find(
              (e: Endpoint) => e.id === endpointId || e.name === endpointId,
            );
            if (ep) break;
          }
        }
      }
    }

    if (!ep && endpointId) {
      const consumed = targetNode.data?.consumedEvents?.find(
        (e) => e.id === endpointId || e.name === endpointId,
      );
      const published = targetNode.data?.publishedEvents?.find(
        (e) => e.id === endpointId || e.name === endpointId,
      );
      const eventMatch = consumed || published;
      if (eventMatch) {
        ep = {
          id: eventMatch.id,
          name: eventMatch.name
            ? eventMatch.name.startsWith("/")
              ? eventMatch.name
              : `/events/${eventMatch.name}`
            : "/events",
          type: "POST",
        };
      }
    }

    if (!ep) {
      const srvEndpoints = allEndpoints.filter(
        (e) => e.nodeId === targetNode.id,
      );
      if (srvEndpoints.length > 0) {
        ep = srvEndpoints[0];
      } else if (
        targetNode.data?.endpoints &&
        (targetNode.data.endpoints as Endpoint[]).length > 0
      ) {
        ep = (targetNode.data.endpoints as Endpoint[])[0];
      }
    }

    const method = (ep?.type || "GET").toUpperCase();
    const rawPath = ep?.name || "data";
    let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    path = path.replace(/\s+/g, "-");

    if (targetNode.data?.techStack === "nextjs") {
      if (!path.startsWith("/api/") && path !== "/api") {
        path = `/api${path.startsWith("/") ? path : `/${path}`}`;
      }
    }

    const isColocated =
      targetNode.data?.techStack === "nextjs" &&
      allNodes.some((n) => n.type === "webApp");
    const fullUrl = isColocated ? path : `http://localhost:${targetPort}${path}`;
    const baseUrl = isColocated ? "" : `http://localhost:${targetPort}`;
    const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(targetServiceName);

    const requireAuth = ep ? ep.requireAuth !== false : true;

    return {
      targetNodeId: targetNode.id,
      targetNodeName: targetServiceName,
      serviceName: targetServiceName,
      targetNodePort: targetPort,
      endpointId: ep?.id,
      endpointName: ep?.name || "Endpoint",
      method,
      path,
      fullUrl,
      baseUrl,
      envVarName,
      publicEnvVarName,
      requireAuth,
      endpoint: ep,
    };
  }

  if (
    targetNode.type === "api_gateway" ||
    targetNode.type === "load_balancer"
  ) {
    const gatewayPort = String(targetNode.data?.port || "8000");
    const outgoingEdge = allEdges.find((e) => e.source === targetNode.id);
    if (outgoingEdge) {
      const downstreamNode = allNodes.find((n) => n.id === outgoingEdge.target);
      if (downstreamNode && downstreamNode.type === "service") {
        const downstreamPort = getServicePort(downstreamNode);
        const resolved = resolveLinkedEndpoint(
          targetNode.id,
          eventId,
          allNodes,
          allEdges,
          allEndpoints,
          depth + 1,
        );
        if (resolved) {
          return resolved;
        }
        return {
          targetNodeId: downstreamNode.id,
          targetNodeName: downstreamNode.data?.label || "Service",
          targetNodePort: downstreamPort,
          endpointName: "Gateway Route",
          method: "GET",
          path: "/api/v1",
          fullUrl: `http://localhost:${downstreamPort}/api/v1`,
          baseUrl: `http://localhost:${downstreamPort}`,
          ...toServiceBaseUrlEnvName(downstreamNode.data?.label || "Service"),
          requireAuth: true,
        };
      }
    }

    return {
      targetNodeId: targetNode.id,
      targetNodeName: targetNode.data?.label || "API Gateway",
      targetNodePort: gatewayPort,
      endpointName: "Gateway Endpoint",
      method: "GET",
      path: "/api/gateway",
      fullUrl: `http://localhost:${gatewayPort}/api/gateway`,
      baseUrl: `http://localhost:${gatewayPort}`,
      ...toServiceBaseUrlEnvName(targetNode.data?.label || "API_Gateway"),
      requireAuth: true,
    };
  }

  const messagingTypes = [
    "kafka",
    "sqs",
    "redis-streams",
    "redis-pubsub",
    "pubsub",
    "eventstream",
    "queue",
  ];
  if (messagingTypes.includes(targetNode.type)) {
    const resourceList =
      targetNode.data?.topics ||
      targetNode.data?.queues ||
      targetNode.data?.streams ||
      targetNode.data?.channels ||
      [];
    const resource = resourceList[0];
    const resourceName = resource?.name || targetNode.data?.label || "topic";
    const path = `/api/messages/${resourceName}`;
    const fullUrl = `http://localhost:8080${path}`;
    const baseUrl = "http://localhost:8080";
    const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(targetNode.data?.label || "Broker");

    return {
      targetNodeId: targetNode.id,
      targetNodeName: targetNode.data?.label || "Broker",
      targetNodePort: "8080",
      endpointName: resourceName,
      method: "POST",
      path,
      fullUrl,
      baseUrl,
      envVarName,
      publicEnvVarName,
      requireAuth: false,
    };
  }

  const STORAGE_NODE_TYPES = [
    "storage_operation_ref",
    "storage_ref",
    "storage_bucket_ref",
    "bucket_ref",
    "StorageBucketRefNode",
    "StorageOperationRefNode",
    "storage",
  ];
  if (STORAGE_NODE_TYPES.includes(targetNode.type)) {
    const downstreamEdge = allEdges.find(
      (e) =>
        (e.source === targetNode.id && e.target !== fromNodeId) ||
        (e.target === targetNode.id && e.source !== fromNodeId),
    );
    if (downstreamEdge) {
      const otherId =
        downstreamEdge.source === targetNode.id
          ? downstreamEdge.target
          : downstreamEdge.source;
      const downstreamNode = allNodes.find((n) => n.id === otherId);
      if (downstreamNode && downstreamNode.type === "service") {
        const srvHandle =
          downstreamEdge.source === downstreamNode.id
            ? downstreamEdge.sourceHandle
            : downstreamEdge.targetHandle;
        let endpointId = srvHandle
          ? srvHandle.replace(
              /^(endpoint-in-|endpoint-out-|endpoints-in-|endpoints-out-)/,
              "",
            )
          : undefined;
        if (endpointId && endpointId.includes("-in-")) {
          const parts = endpointId.split("-in-");
          endpointId = parts[parts.length - 1];
        }

        let ep: Endpoint | undefined;
        if (endpointId) {
          ep = allEndpoints.find(
            (e) =>
              e.nodeId === downstreamNode.id &&
              (e.id === endpointId || e.name === endpointId),
          );
          if (!ep && downstreamNode.data?.endpoints) {
            ep = (downstreamNode.data.endpoints as Endpoint[]).find(
              (e) => e.id === endpointId || e.name === endpointId,
            );
          }
        }
        if (!ep) {
          const srvEndpoints = allEndpoints.filter(
            (e) => e.nodeId === downstreamNode.id,
          );
          if (srvEndpoints.length > 0) ep = srvEndpoints[0];
          else if (
            downstreamNode.data?.endpoints &&
            (downstreamNode.data.endpoints as Endpoint[]).length > 0
          ) {
            ep = (downstreamNode.data.endpoints as Endpoint[])[0];
          }
        }

        const targetPort = getServicePort(downstreamNode);
        const targetServiceName = downstreamNode.data?.label || "Service";
        const method = (ep?.type || "POST").toUpperCase();
        const rawPath = ep?.name || "upload-image";
        let path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
        path = path.replace(/\s+/g, "-");

        if (downstreamNode.data?.techStack === "nextjs") {
          if (!path.startsWith("/api/") && path !== "/api") {
            path = `/api${path.startsWith("/") ? path : `/${path}`}`;
          }
        }

        const isColocated =
          downstreamNode.data?.techStack === "nextjs" &&
          allNodes.some((n) => n.type === "webApp");
        const fullUrl = isColocated
          ? path
          : `http://localhost:${targetPort}${path}`;
        const baseUrl = isColocated ? "" : `http://localhost:${targetPort}`;
        const { envVarName, publicEnvVarName } = toServiceBaseUrlEnvName(targetServiceName);

        return {
          targetNodeId: downstreamNode.id,
          targetNodeName: targetServiceName,
          serviceName: targetServiceName,
          targetNodePort: targetPort,
          endpointId: ep?.id,
          endpointName: ep?.name || "Upload Endpoint",
          method,
          path,
          fullUrl,
      baseUrl,
      envVarName,
      publicEnvVarName,
          requireAuth: ep ? ep.requireAuth !== false : false,
          endpoint: ep,
        };
      }
    }
  }

  return null;
}

export interface LinkedPageRefInfo {
  targetNodeId: string;
  targetNodeName: string;
  targetRoute: string;
}

export function resolvePageRefLink(
  fromNodeId: string,
  eventId: string,
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  targetPageId?: string,
  targetRoute?: string,
): LinkedPageRefInfo {
  // Check if connected to a PageRef node via an edge
  const edge = allEdges.find(
    (e) =>
      e.source === fromNodeId &&
      (e.sourceHandle === `events-${eventId}` ||
        e.sourceHandle === eventId ||
        e.sourceHandle?.endsWith(eventId)),
  );

  let refTargetPageId = targetPageId;
  let customRoute = targetRoute;

  if (edge && edge.target) {
    const targetNode = allNodes.find((n) => n.id === edge.target);
    if (targetNode && targetNode.type === "page_ref") {
      refTargetPageId =
        (targetNode.data?.targetPageId as string | undefined) ||
        (targetNode.data?.pageRefId as string | undefined) ||
        refTargetPageId;
    }
  }

  if (refTargetPageId) {
    const targetPageNode = allNodes.find((n) => n.id === refTargetPageId);
    if (targetPageNode) {
      const pageLabel = targetPageNode.data?.label || "Page";
      const cleanLabel = pageLabel.trim().toLowerCase();
      const isRoot =
        targetPageNode.data?.isRoot === true ||
        cleanLabel === "/";
      const slug = isRoot
        ? "/"
        : pageRouteToUrl(pageLabel);

      return {
        targetNodeId: targetPageNode.id,
        targetNodeName: pageLabel,
        targetRoute: slug,
      };
    }
  }

  if (customRoute) {
    return {
      targetNodeId: "",
      targetNodeName: customRoute,
      targetRoute: customRoute.startsWith("/") ? customRoute : `/${customRoute}`,
    };
  }

  return {
    targetNodeId: "",
    targetNodeName: "Home",
    targetRoute: "/",
  };
}
