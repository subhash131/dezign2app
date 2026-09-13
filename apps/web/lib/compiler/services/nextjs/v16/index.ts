import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, CompiledServiceResult, ReusableFunction } from "@workspace/canvas/types";
import { generateNextjsRoutes } from "./routeGenerator";
import { generateNextjsConfigFiles } from "./configGenerator";

/**
 * Compiles a Service Node into a Next.js App Router (v16.x) API microservice application
 */
export function compileNextjsV16Service(
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
  const serviceName = node.data?.label || node.id || "Service";
  const sanitizedName =
    folderName ||
    serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "service";
  const port = String(node.data?.port || "8080");
  const cors = Boolean(node.data?.cors);
  const corsOrigins = String(node.data?.corsOrigins || "*");

  // Check connected resources
  const connectedEdges = allEdges.filter((e) => e.source === node.id || e.target === node.id);
  const hasDb =
    dbFunctions.length > 0 ||
    connectedEdges.some((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = allNodes.find((n) => n.id === otherId);
      return other?.type === "entity" || other?.type === "database" || other?.type === "db_ref";
    });

  const hasKafka =
    kafkaFunctions.length > 0 ||
    connectedEdges.some((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = allNodes.find((n) => n.id === otherId);
      return other?.type === "kafka" || other?.type === "pubsub" || other?.type === "queue";
    });

  const hasRedis =
    redisFunctions.length > 0 ||
    connectedEdges.some((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const other = allNodes.find((n) => n.id === otherId);
      return other?.type === "redis_instance" || other?.type === "redis-cache" || other?.type === "redis-streams";
    });

  const files: CompiledFile[] = [
    // 1. Next.js App Router Route Handlers
    ...generateNextjsRoutes({
      serviceName,
      nodeEndpoints: endpoints,
      serviceNode: node,
      allNodes,
      allEdges,
      allEndpoints: endpoints,
      dbFunctions,
      kafkaFunctions,
      hasDb,
    }),

    // 2. Project Configurations (package.json, next.config.ts, tsconfig.json, etc.)
    ...generateNextjsConfigFiles({
      node,
      sanitizedName,
      serviceName,
      port,
      cors,
      corsOrigins,
      hasDb,
      hasKafka,
      hasRedis,
    }),
  ];

  return {
    serviceId: node.id,
    serviceName,
    files,
  };
}

export { generateNextjsRoutes, generateNextjsConfigFiles };
