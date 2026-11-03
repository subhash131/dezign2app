import {
  BackendNode,
  BackendEdge,
  Endpoint,
  SimulationTestCase,
} from "@/types/canvas";
import { CompiledServiceResult } from "@workspace/canvas/types";
import { compileLangGraph } from "../langgraph/typescript/v1";
import { extractLangGraphInput } from "./extractLangGraphInput";
import { resolveRouteEndpoints } from "./resolveRouteEndpoints";

export function compileLangGraphNode(
  node: BackendNode,
  context?: {
    edges?: BackendEdge[];
    nodes?: BackendNode[];
    endpoints?: Endpoint[];
    events?: Array<{ id: string; name?: string; variant?: string }>;
    testCases?: SimulationTestCase[];
    outputMode?: "app" | "package";
    packageName?: string;
    dbPackageName?: string;
    dbEngine?: string;
    redisPackageName?: string;
    trackTokenUsage?: boolean;
  },
): CompiledServiceResult {
  const serviceName = node.data?.label || "LangGraph Service";
  const input = extractLangGraphInput(node);

  if (context?.outputMode) {
    input.outputMode = context.outputMode;
  }
  if (context?.packageName) {
    input.packageName = context.packageName;
  }
  if (context?.trackTokenUsage !== undefined) {
    input.trackTokenUsage = context.trackTokenUsage;
  }

  // Resolve dbEngine: from context or infer from canvas nodes
  let dbEngine = context?.dbEngine;
  if (!dbEngine && context?.nodes) {
    const linkedDbId = node.data?.memoryConfig?.checkpointerNodeId;
    const dbNode =
      (linkedDbId ? context.nodes.find((n) => n.id === linkedDbId) : undefined) ||
      context.nodes.find((n) => n.type === "database");
    if (dbNode) {
      dbEngine =
        dbNode.data?.dbEngine || dbNode.data?.provider || dbNode.data?.dbType;
    }
  }
  if (dbEngine) {
    input.dbEngine = dbEngine;
  }

  // During SQLite, the DB package has no connection pool (better-sqlite3).
  // Never link dbPackageName for Postgres checkpointer during SQLite.
  if (dbEngine === "sqlite") {
    input.dbPackageName = undefined;
  } else if (context?.dbPackageName) {
    input.dbPackageName = context.dbPackageName;
  }

  if (context?.redisPackageName) {
    input.redisPackageName = context.redisPackageName;
  }

  // Resolve connected route callers from the main canvas edge graph (app mode only).
  // In package mode, the LangGraph node is compiled as a pure reusable library without HTTP routes.
  if (
    context &&
    context.outputMode !== "package" &&
    context.edges &&
    context.edges.length > 0
  ) {
    const outputChannels = node.data?.outputChannels ?? [];
    const routeEndpoints = resolveRouteEndpoints(
      node.id,
      context.edges,
      context.nodes ?? [],
      context.endpoints ?? [],
      context.events ?? [],
      outputChannels,
    );
    input.routeEndpoints = routeEndpoints;
  }

  if (context?.testCases) {
    input.testCases = context.testCases.filter(
      (testCase) => testCase.targetNodeId === node.id,
    );
  }

  const files = compileLangGraph(input);

  return {
    serviceId: node.id,
    serviceName,
    files,
  };
}
