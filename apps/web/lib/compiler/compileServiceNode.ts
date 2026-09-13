import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledServiceResult, ReusableFunction } from "@workspace/canvas/types";
import { compileExpressV4Service } from "./services/express/v4";
import { compileFastAPIService } from "./services/fastapi/v0";
import { compileNextjsV16Service } from "./services/nextjs/v16";
import { compileDatabaseNodes } from "./compileDatabaseNodes";
import { compileKafkaNodes, isServiceConnectedToKafka } from "./compileKafkaNodes";
import { compileRedisNodes, isServiceConnectedToRedis } from "./compileRedisNodes";

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
): CompiledServiceResult {
  const techStack = node.data?.techStack || "express";

  if (dbFunctions.length === 0 && allNodes.length > 0) {
    const compiledDb = compileDatabaseNodes(allNodes, allEdges);
    dbFunctions = compiledDb.reusableFunctions || [];
  }

  const isConnectedToKafka = isServiceConnectedToKafka(node, allNodes, allEdges, endpoints, events);
  if (!isConnectedToKafka) {
    kafkaFunctions = [];
  } else if (kafkaFunctions.length === 0 && allNodes.length > 0) {
    const compiledKafka = compileKafkaNodes(allNodes, allEdges);
    kafkaFunctions = compiledKafka.reusableFunctions || [];
  }

  const isConnectedToRedis = isServiceConnectedToRedis(node, allNodes, allEdges, endpoints);
  if (!isConnectedToRedis) {
    redisFunctions = [];
  } else if (redisFunctions.length === 0 && allNodes.length > 0) {
    const compiledRedis = compileRedisNodes(allNodes, allEdges);
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

  switch (techStack) {
    case "nextjs":
      return compileNextjsV16Service(
        node,
        nodeEndpoints,
        nodeEvents,
        allNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
        folderName,
        redisFunctions,
      );
    case "fastapi":
      return compileFastAPIService(
        node,
        nodeEndpoints,
        nodeEvents,
        allNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
      );
    case "express":
    default:
      return compileExpressV4Service(
        node,
        nodeEndpoints,
        nodeEvents,
        allNodes,
        allEdges,
        testCases,
        dbFunctions,
        kafkaFunctions,
        folderName,
        endpoints,
        redisFunctions,
      );
  }
}
