import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, CompiledServiceResult, ReusableFunction } from "@workspace/canvas/types";
import { generateRoutes } from "../../../generators/routeGenerator";
import { generateConsumers } from "../../../generators/consumerGenerator";
import { generateProducers } from "../../../generators/producerGenerator";
import {
  generateLibFiles,
  generateServerFile,
  generateConfigFiles,
  resolveServiceRealtimeCapabilities,
} from "../../../generators/configGenerator";
import { generateServiceUnitTests } from "../../../generators/testGenerator";
import { generateVerifyTokenHelper } from "../../../generators/auth-providers/better-auth/v1.6/generateRequireAuthMiddleware";
import { resolveServiceAuthContext } from "../../../generators/routeGenerator/handlers/authResolver";
import type { PipelineStep } from "@workspace/canvas/types";

function hasAuthVerifyInSteps(steps?: PipelineStep[]): boolean {
  if (!steps || !Array.isArray(steps)) return false;
  return steps.some(
    (s) =>
      s.enabled !== false &&
      (s.type === "auth_verify" ||
        hasAuthVerifyInSteps(s.thenSteps) ||
        hasAuthVerifyInSteps(s.elseSteps) ||
        hasAuthVerifyInSteps(s.trySteps) ||
        hasAuthVerifyInSteps(s.catchSteps) ||
        hasAuthVerifyInSteps(s.cacheMissSteps) ||
        hasAuthVerifyInSteps(s.loopBody) ||
        hasAuthVerifyInSteps(s.switchDefault) ||
        s.switchCases?.some((c) => hasAuthVerifyInSteps(c.steps)) ||
        s.parallelBranches?.some((b) => hasAuthVerifyInSteps(b.steps))),
  );
}

/**
 * Compiles a Service Node into an Express.js 4.x microservice application
 */
export function compileExpressV4Service(
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
  allEndpoints: (Endpoint & { nodeId: string })[] = [],
  redisFunctions: ReusableFunction[] = [],
  storageFunctions: ReusableFunction[] = [],
): CompiledServiceResult {
  const serviceName = node.data?.label || node.id || "Service";
  const sanitizedName =
    folderName ||
    serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "service";
  const port = String(node.data?.port || "8080");
  const cors = node.data?.cors || false;
  const corsOrigins = node.data?.corsOrigins || "*";

  let nodeEndpoints = endpoints.filter(
    (e) =>
      e.nodeId === node.id ||
      (e.nodeId &&
        ((node.data?.label && e.nodeId === node.data.label) ||
          (node.data?.label && e.nodeId === node.data.label.toLowerCase()))),
  );
  if (nodeEndpoints.length === 0 && endpoints.length > 0 && endpoints.every((e) => !e.nodeId || e.nodeId === node.id)) {
    nodeEndpoints = endpoints;
  }
  const totalEndpointsCount = allEndpoints.length > 0 ? allEndpoints.length : endpoints.length;
  if (nodeEndpoints.length === 0 && totalEndpointsCount === 0 && node.data?.endpoints) {
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

  let nodeConsumedEvents = events.filter(
    (e) =>
      (e.nodeId === node.id ||
        (node.data?.label && e.nodeId === node.data.label) ||
        (node.data?.label && e.nodeId === node.data.label.toLowerCase())) &&
      e.variant === "consume",
  );
  if (nodeConsumedEvents.length === 0 && node.data?.consumedEvents) {
    nodeConsumedEvents = node.data.consumedEvents.map((e) => ({
      ...e,
      nodeId: node.id,
      variant: "consume" as const,
    }));
  }

  let nodePublishedEvents = events.filter(
    (e) =>
      (e.nodeId === node.id ||
        (node.data?.label && e.nodeId === node.data.label) ||
        (node.data?.label && e.nodeId === node.data.label.toLowerCase())) &&
      e.variant === "publish",
  );
  if (nodePublishedEvents.length === 0 && node.data?.publishedEvents) {
    nodePublishedEvents = node.data.publishedEvents.map((e) => ({
      ...e,
      nodeId: node.id,
      variant: "publish" as const,
    }));
  }

  const hasDb = allNodes.some(
    (n) => n.type === "database" || n.type === "entity" || n.type === "db_ref" || n.type === "auth",
  );

  const { hasSse, hasWs } = resolveServiceRealtimeCapabilities(
    node,
    nodeEndpoints,
    nodeConsumedEvents,
    allNodes,
    allEdges,
  );
  const hasRealtime = hasSse || hasWs;

  const files: CompiledFile[] = [
    ...generateRoutes(
      serviceName,
      nodeEndpoints,
      node,
      allNodes,
      allEdges,
      endpoints,
      dbFunctions,
      kafkaFunctions,
      nodePublishedEvents,
      sanitizedName,
      redisFunctions,
      storageFunctions,
    ),
    ...generateConsumers(
      serviceName,
      nodeConsumedEvents,
      node,
      allNodes,
      allEdges,
    ),
    ...generateProducers(
      serviceName,
      nodePublishedEvents,
      node,
      allNodes,
      allEdges,
    ),
    ...generateLibFiles(hasDb, { sse: hasSse, ws: hasWs }),
    generateServerFile(
      serviceName,
      port,
      cors,
      corsOrigins,
      node,
      allNodes,
      allEdges,
      nodeEndpoints,
      nodeConsumedEvents,
    ),

    ...generateConfigFiles(
      node,
      sanitizedName,
      serviceName,
      port,
      cors,
      nodeEndpoints,
      nodeConsumedEvents,
      allNodes,
      allEdges,
    ),
    ...generateServiceUnitTests(serviceName, nodeEndpoints, testCases),
  ];

  // Ensure verifyToken.ts exists if any Kafka consumer uses an auth_verify step
  // even when HTTP routes on this service do not have requireAuth enabled.
  const consumerUsesAuthVerify = nodeConsumedEvents.some((ev) =>
    hasAuthVerifyInSteps(ev.pipelineSteps),
  );
  if (consumerUsesAuthVerify && !files.some((f) => f.filename === "src/middleware/verifyToken.ts")) {
    const authCtx = resolveServiceAuthContext(node, allNodes, allEdges);
    files.push({
      filename: "src/middleware/verifyToken.ts",
      language: "typescript",
      content: generateVerifyTokenHelper(authCtx.strategy, {
        authServerUrl: authCtx.authServerUrl,
        issuer: authCtx.issuer,
        audience: authCtx.audience,
        redisRevocationPackageName: authCtx.redisRevocationPackageName,
      }),
    });
  }

  // Guarantee that src/index.ts always includes the default express import
  const serverFile = files.find((f) => f.filename === "src/index.ts");
  if (serverFile && !serverFile.content.includes("import express")) {
    if (serverFile.content.includes("from \"express\"")) {
      serverFile.content = serverFile.content.replace(
        /import\s+(\{[^}]*\})\s+from\s+["']express["']/,
        'import express, $1 from "express"'
      );
    } else {
      serverFile.content = `import express from "express";\n${serverFile.content}`;
    }
  }

  return {
    serviceId: node.id,
    serviceName,
    files,
  };
}
