import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledServiceResult, ReusableFunction, PipelineStep } from "@workspace/canvas/types";
import {
  INTER_SERVICE_PROTOCOL_GRPC,
  INTER_SERVICE_PROTOCOL_HTTP,
  InterServiceProtocol,
  syncEndpointRouteWithPathParams,
  parseEndpointRouteWithParams,
} from "@workspace/canvas";
import { compileExpressV4Service } from "./services/express/v4";
import { compileFastAPIService } from "./services/fastapi/v0";
import { compileGoV1Service } from "./services/go/v1";
import { compileNextjsV16Service } from "./services/nextjs/v16";
import { compileDatabaseNodes } from "./compileDatabaseNodes";
import { compileKafkaNodes, isServiceConnectedToKafka } from "./compileKafkaNodes";
import { compileRedisNodes, isServiceConnectedToRedis } from "./compileRedisNodes";
import { cleanUnusedImports, toTableName, toSingular, toPlural, normalizeEndpointRequestBody } from "./utils";

/**
 * Determines whether a service node is actively configured to use WebSocket connections.
 * Inspects endpoint pipeline steps, event pipeline steps, and connected WebPage nodes.
 */
export function isServiceConnectedToWebSocket(
  serviceNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  endpoints: (Endpoint & { nodeId?: string })[] = [],
  events: (AnyMessagingResource & { nodeId?: string; variant?: "publish" | "consume" })[] = [],
): boolean {
  // Recursive pipeline step checker for WebSocket usage
  function hasWebSocketStep(steps: PipelineStep[] | undefined): boolean {
    if (!steps || !Array.isArray(steps)) return false;
    for (const step of steps) {
      if (step.enabled === false) continue;
      if (step.type === "push_to_client") {
        const proto = String(step.clientDeliveryProtocol || "SSE").toUpperCase();
        if (proto === "WEBSOCKET" || proto === "WS" || proto === "WEBRTC") {
          return true;
        }
      }
      if (step.type === "langgraph_invoke") {
        const streamProto = String(step.langGraphStreamingProtocol || "").toLowerCase();
        if (streamProto === "websocket" || streamProto === "ws") {
          return true;
        }
      }
      if (hasWebSocketStep(step.thenSteps)) return true;
      if (hasWebSocketStep(step.elseSteps)) return true;
      if (hasWebSocketStep(step.trySteps)) return true;
      if (hasWebSocketStep(step.catchSteps)) return true;
      if (hasWebSocketStep(step.loopBody)) return true;
      if (hasWebSocketStep(step.cacheMissSteps)) return true;
      if (step.switchCases && step.switchCases.some((c) => hasWebSocketStep(c.steps))) return true;
      if (hasWebSocketStep(step.switchDefault)) return true;
      if (step.parallelBranches && step.parallelBranches.some((b) => hasWebSocketStep(b.steps))) return true;
    }
    return false;
  }

  // 2. Check service endpoints
  const nodeLabel = serviceNode.data?.label;
  const serviceEndpoints = [
    ...(serviceNode.data?.endpoints || []),
    ...(serviceNode.data?.routeGroups?.flatMap((rg) => rg.endpoints || []) || []),
    ...endpoints.filter(
      (ep) =>
        ep.nodeId === serviceNode.id ||
        (ep.nodeId &&
          ((nodeLabel && ep.nodeId === nodeLabel) ||
            (nodeLabel && ep.nodeId === nodeLabel.toLowerCase()))),
    ),
  ];

  for (const ep of serviceEndpoints) {
    if (hasWebSocketStep(ep.pipelineSteps)) return true;
  }

  // 3. Check service events
  const serviceEvents = [
    ...(serviceNode.data?.consumedEvents || []),
    ...(serviceNode.data?.publishedEvents || []),
    ...events.filter(
      (ev) =>
        ev.nodeId === serviceNode.id ||
        (ev.nodeId &&
          ((nodeLabel && ev.nodeId === nodeLabel) ||
            (nodeLabel && ev.nodeId === nodeLabel.toLowerCase()))),
    ),
  ];

  for (const ev of serviceEvents) {
    if (hasWebSocketStep(ev.pipelineSteps)) return true;
  }

  // 4. Check connected WebPage nodes and page_ref nodes on canvas
  const connectedPageIds = new Set<string>();
  for (const edge of allEdges) {
    if (!edge) continue;
    if (edge.source === serviceNode.id || edge.target === serviceNode.id) {
      const otherId = edge.source === serviceNode.id ? edge.target : edge.source;
      const otherNode = allNodes.find((n) => n.id === otherId);
      if (otherNode?.type === "webPage") {
        connectedPageIds.add(otherNode.id);
      } else if (otherNode?.type === "page_ref") {
        if (otherNode.data?.targetPageId) connectedPageIds.add(String(otherNode.data.targetPageId));
        if (otherNode.data?.pageRefId) connectedPageIds.add(String(otherNode.data.pageRefId));
      }
    }
  }

  for (const n of allNodes) {
    if (n.type === "webPage") {
      const conns = Array.isArray(n.data?.realtimeConnections) ? n.data.realtimeConnections : [];
      for (const conn of conns) {
        let targetsThisService = false;
        if (conn.sourceServiceNodeId === serviceNode.id) {
          targetsThisService = true;
        } else if (
          connectedPageIds.has(n.id) ||
          allEdges.some(
            (e) =>
              (e.source === serviceNode.id && e.target === n.id) ||
              (e.target === serviceNode.id && e.source === n.id),
          )
        ) {
          targetsThisService = true;
        }

        if (targetsThisService) {
          const proto = String(conn.protocol || "SSE").toUpperCase();
          if (proto === "WEBSOCKET" || proto === "WS" || proto === "WEBRTC") {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Compiles a single Service Node into its modular microservice directory structure based on selected tech and version
 */
export function compileServiceNode(
  node: BackendNode,
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  testCases: SimulationTestCase[] = [],
  dbFunctions: ReusableFunction[] = [],
  kafkaFunctions: ReusableFunction[] = [],
  folderName?: string,
  redisFunctions: ReusableFunction[] = [],
  storageFunctions: ReusableFunction[] = [],
): CompiledServiceResult {
  // Normalize server configuration (supports flat node.data and nested server/serverConfig sections)
  const nodeData = node.data;
  const serverSection = nodeData?.server || nodeData?.serverConfig;

  const port = String(nodeData?.port ?? serverSection?.port ?? "8080").trim() || "8080";
  const interServiceProtocol: InterServiceProtocol =
    (nodeData?.interServiceProtocol || serverSection?.interServiceProtocol) === INTER_SERVICE_PROTOCOL_GRPC
      ? INTER_SERVICE_PROTOCOL_GRPC
      : INTER_SERVICE_PROTOCOL_HTTP;
  const explicitGrpcPort = nodeData?.grpcPort ?? serverSection?.grpcPort;
  const grpcPort = explicitGrpcPort !== undefined && explicitGrpcPort !== null && String(explicitGrpcPort).trim() !== ""
    ? String(explicitGrpcPort).trim()
    : interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC
      ? "50051"
      : undefined;
  const cors = nodeData?.cors !== undefined
    ? Boolean(nodeData.cors)
    : serverSection?.cors !== undefined
      ? Boolean(serverSection.cors)
      : true;
  const corsOrigins = String(nodeData?.corsOrigins ?? serverSection?.corsOrigins ?? "*").trim() || "*";
  const rateLimit = String(nodeData?.rateLimit ?? serverSection?.rateLimit ?? "").trim();

  const isConnectedToWs = isServiceConnectedToWebSocket(
    node,
    allNodes,
    allEdges,
    endpoints,
    events,
  );
  const rawDeps = node.data?.customDependencies;
  const cleanedCustomDeps = !isConnectedToWs && Array.isArray(rawDeps)
    ? rawDeps.filter((dep) => dep && dep.name !== "ws" && dep.name !== "@types/ws")
    : rawDeps;

  const effectiveNode: BackendNode = {
    ...node,
    data: {
      ...node.data,
      port,
      ...(grpcPort ? { grpcPort } : {}),
      cors,
      corsOrigins,
      rateLimit: rateLimit || undefined,
      interServiceProtocol,
      ...(!isConnectedToWs ? { enableWebSocket: false } : {}),
      ...(cleanedCustomDeps !== undefined ? { customDependencies: cleanedCustomDeps } : {}),
    },
  };

  const effectiveAllNodes: BackendNode[] = allNodes.map((n): BackendNode => {
    if (n.type !== "service") return n;
    if (n.id === node.id) return effectiveNode;
    const nData = n.data;
    const nServer = nData?.server || nData?.serverConfig;
    const nInterServiceProtocol: InterServiceProtocol =
      (nData?.interServiceProtocol || nServer?.interServiceProtocol) === INTER_SERVICE_PROTOCOL_GRPC
        ? INTER_SERVICE_PROTOCOL_GRPC
        : INTER_SERVICE_PROTOCOL_HTTP;
    const nExplicitGrpcPort = nData?.grpcPort ?? nServer?.grpcPort;
    const nGrpcPort = nExplicitGrpcPort !== undefined && nExplicitGrpcPort !== null && String(nExplicitGrpcPort).trim() !== ""
      ? String(nExplicitGrpcPort).trim()
      : nInterServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC
        ? "50051"
        : undefined;

    const nConnectedToWs = isServiceConnectedToWebSocket(
      n,
      allNodes,
      allEdges,
      endpoints,
      events,
    );
    const nRawDeps = nData?.customDependencies;
    const nCleanedDeps = !nConnectedToWs && Array.isArray(nRawDeps)
      ? nRawDeps.filter((dep) => dep && dep.name !== "ws" && dep.name !== "@types/ws")
      : nRawDeps;

    return {
      ...n,
      data: {
        ...n.data,
        port: String(nData?.port ?? nServer?.port ?? "8080").trim() || "8080",
        ...(nGrpcPort ? { grpcPort: nGrpcPort } : {}),
        cors: nData?.cors !== undefined ? Boolean(nData.cors) : nServer?.cors !== undefined ? Boolean(nServer.cors) : true,
        corsOrigins: String(nData?.corsOrigins ?? nServer?.corsOrigins ?? "*").trim() || "*",
        rateLimit: String(nData?.rateLimit ?? nServer?.rateLimit ?? "").trim() || undefined,
        interServiceProtocol: nInterServiceProtocol,
        ...(!nConnectedToWs ? { enableWebSocket: false } : {}),
        ...(nCleanedDeps !== undefined ? { customDependencies: nCleanedDeps } : {}),
      },
    };
  });

  const techStack = effectiveNode.data?.techStack || "express";

  if (dbFunctions.length === 0 && effectiveAllNodes.length > 0) {
    const compiledDb = compileDatabaseNodes(effectiveAllNodes, allEdges);
    dbFunctions = compiledDb.reusableFunctions || [];
  }

  const isConnectedToKafka = isServiceConnectedToKafka(effectiveNode, effectiveAllNodes, allEdges, endpoints, events);
  if (!isConnectedToKafka) {
    kafkaFunctions = [];
  } else if (kafkaFunctions.length === 0 && effectiveAllNodes.length > 0) {
    const compiledKafka = compileKafkaNodes(effectiveAllNodes, allEdges);
    kafkaFunctions = compiledKafka.reusableFunctions || [];
  }

  const isConnectedToRedis = isServiceConnectedToRedis(effectiveNode, effectiveAllNodes, allEdges, endpoints);
  if (!isConnectedToRedis) {
    redisFunctions = [];
  } else if (redisFunctions.length === 0 && effectiveAllNodes.length > 0) {
    const compiledRedis = compileRedisNodes(effectiveAllNodes, allEdges);
    redisFunctions = compiledRedis.reusableFunctions || [];
  }

  // Filter endpoints for this specific node
  let nodeEndpoints = endpoints.filter(
    (e) =>
      e.nodeId === node.id ||
      (e.nodeId &&
        ((node.data?.label && e.nodeId === node.data.label) ||
          (node.data?.label && e.nodeId === node.data.label.toLowerCase()))),
  );

  // If endpoints are passed and pre-filtered to this single node, preserve them
  if (nodeEndpoints.length === 0 && endpoints.length > 0 && endpoints.every((e) => !e.nodeId || e.nodeId === node.id)) {
    nodeEndpoints = endpoints;
  }

  // Fall back to node.data.endpoints ONLY if global endpoints array is empty
  if (nodeEndpoints.length === 0 && endpoints.length === 0 && node.data?.endpoints) {
    nodeEndpoints = node.data.endpoints.map((ep) => ({
      ...ep,
      nodeId: node.id,
    }));
  }

  if (node.data?.routeGroups) {
    for (const group of node.data.routeGroups) {
      if (group.endpoints) {
        const groupEndpoints = group.endpoints.map((ep) => ({
          ...ep,
          nodeId: node.id,
        }));
        nodeEndpoints = [...nodeEndpoints, ...groupEndpoints];
      }
    }
  }

  // Sanitize nodeEndpoints against allNodes if provided (clean up deleted nodes, edges, operations)
  if (allNodes.length > 0) {
    const existingNodeIds = new Set(allNodes.map((n) => n.id));
    const entityAndDbNodes = allNodes.filter(
      (n) => n.type === "entity" || n.type === "db_ref" || n.type === "database",
    );
    const existingDbNodeIds = new Set(entityAndDbNodes.map((n) => n.id));
    const existingEntityNames = new Set(
      entityAndDbNodes.flatMap((n) => {
        const raw = n.data?.label || n.data?.tableRef || "";
        const clean = toTableName(raw).toLowerCase();
        return [raw.toLowerCase(), clean, toSingular(clean), toPlural(clean)].filter(Boolean);
      }),
    );

    nodeEndpoints = nodeEndpoints.map((ep) => {
      let changed = false;
      let databaseNodeId = ep.databaseNodeId;
      let databaseNodeIds = ep.databaseNodeIds;
      let crudOperations = ep.crudOperations;
      let crudExplanations = ep.crudExplanations;
      let pipelineSteps = ep.pipelineSteps;

      if (databaseNodeId && databaseNodeId !== "none" && !existingNodeIds.has(databaseNodeId)) {
        databaseNodeId = "none";
        changed = true;
      }

      if (databaseNodeIds && databaseNodeIds.length > 0) {
        const filtered = databaseNodeIds.filter((id) => existingNodeIds.has(id));
        if (filtered.length !== databaseNodeIds.length) {
          databaseNodeIds = filtered;
          changed = true;
        }
      }

      if (crudOperations && Object.keys(crudOperations).length > 0) {
        const cleanedOps: Record<string, string[]> = {};
        for (const [key, ops] of Object.entries(crudOperations)) {
          if (existingDbNodeIds.has(key) || existingEntityNames.has(key.toLowerCase())) {
            cleanedOps[key] = ops;
          } else {
            changed = true;
          }
        }
        if (changed) {
          crudOperations = cleanedOps;
        }
      }

      if (crudExplanations && Object.keys(crudExplanations).length > 0) {
        const cleanedExp: Record<string, Record<string, string>> = {};
        for (const [key, exp] of Object.entries(crudExplanations)) {
          if (existingDbNodeIds.has(key) || existingEntityNames.has(key.toLowerCase())) {
            cleanedExp[key] = exp;
          } else {
            changed = true;
          }
        }
        if (changed) {
          crudExplanations = cleanedExp;
        }
      }

      if (pipelineSteps && pipelineSteps.length > 0) {
        const cleanedSteps = pipelineSteps.filter((step) => {
          if (step.type === "db_operation") {
            if (step.tableNodeId && !existingNodeIds.has(step.tableNodeId)) {
              return false;
            }
            if (step.databaseId && !existingNodeIds.has(step.databaseId)) {
              return false;
            }
            if (step.functionRef?.importPath?.includes("/helpers/")) {
              const helperMatch = step.functionRef.importPath.match(/\/helpers\/([^/]+)$/);
              if (helperMatch && helperMatch[1]) {
                const helperName = helperMatch[1].toLowerCase();
                if (
                  !existingEntityNames.has(helperName) &&
                  !existingEntityNames.has(toSingular(helperName)) &&
                  !existingEntityNames.has(toPlural(helperName))
                ) {
                  return false;
                }
              }
            }
          }
          return true;
        });
        if (cleanedSteps.length !== pipelineSteps.length) {
          pipelineSteps = cleanedSteps;
          changed = true;
        }
      }

      return changed
        ? {
            ...ep,
            databaseNodeId,
            databaseNodeIds,
            crudOperations,
            crudExplanations,
            pipelineSteps,
          }
        : ep;
    });
  }

  // Normalize endpoint requestBody schemas to align with parameters referenced in pipeline steps
  nodeEndpoints = nodeEndpoints.map(normalizeEndpointRequestBody);

  // Normalize endpoint path parameters and ensure route name is in sync with pathParams
  nodeEndpoints = nodeEndpoints.map((ep) => {
    let name = ep.name || "/";
    let pathParams = ep.pathParams || [];

    if (pathParams.length > 0) {
      name = syncEndpointRouteWithPathParams({
        currentRoute: name,
        oldPathParams: [],
        newPathParams: pathParams,
      });
    } else if (name.includes("/:")) {
      const parsed = parseEndpointRouteWithParams(name);
      if (parsed.extractedPathParams.length > 0) {
        pathParams = parsed.extractedPathParams;
      }
    }

    return {
      ...ep,
      name,
      pathParams,
    };
  });

  // Filter events for this specific node
  let nodeEvents = events.filter(
    (e) =>
      e.nodeId === node.id ||
      (e.nodeId &&
        ((node.data?.label && e.nodeId === node.data.label) ||
          (node.data?.label && e.nodeId === node.data.label.toLowerCase()))),
  );

  if (nodeEvents.length === 0) {
    if (node.data?.consumedEvents) {
      nodeEvents.push(
        ...node.data.consumedEvents.map((e) => ({
          ...e,
          nodeId: node.id,
          variant: "consume" as const,
        })),
      );
    }
    if (node.data?.publishedEvents) {
      nodeEvents.push(
        ...node.data.publishedEvents.map((e) => ({
          ...e,
          nodeId: node.id,
          variant: "publish" as const,
        })),
      );
    }
  }

  let result: CompiledServiceResult;

  switch (techStack) {
    case "nextjs":
      result = compileNextjsV16Service(
        effectiveNode,
        nodeEndpoints,
        nodeEvents,
        effectiveAllNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
        folderName,
        redisFunctions,
      );
      break;
    case "fastapi":
      result = compileFastAPIService(
        effectiveNode,
        nodeEndpoints,
        nodeEvents,
        effectiveAllNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
      );
      break;
    case "go":
      result = compileGoV1Service(
        effectiveNode,
        nodeEndpoints,
        nodeEvents,
        effectiveAllNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
        folderName,
        endpoints.length > 0 ? endpoints : nodeEndpoints,
        redisFunctions,
        storageFunctions,
      );
      break;
    case "express":
    default:
      result = compileExpressV4Service(
        effectiveNode,
        nodeEndpoints,
        nodeEvents,
        effectiveAllNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
        folderName,
        endpoints.length > 0 ? endpoints : nodeEndpoints,
        redisFunctions,
        storageFunctions,
      );
      break;
  }

  return {
    ...result,
    files: result.files.map((f) => {
      if (f.filename.endsWith(".ts") || f.filename.endsWith(".tsx")) {
        let content = cleanUnusedImports(f.content);
        // Guarantee that express service entry files always retain the express import
        if (
          techStack === "express" &&
          (f.filename === "src/index.ts" || f.filename === "index.ts") &&
          content.includes("express(") &&
          !content.includes("import express")
        ) {
          if (content.includes("from \"express\"")) {
            content = content.replace(
              /import\s+(\{[^}]*\})\s+from\s+["']express["']/,
              'import express, $1 from "express"',
            );
          } else {
            content = `import express from "express";\n${content}`;
          }
        }
        return {
          ...f,
          content,
        };
      }
      return f;
    }),
  };
}
