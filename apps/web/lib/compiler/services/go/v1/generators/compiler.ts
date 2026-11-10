import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
  CompiledServiceResult,
  ReusableFunction,
} from "@workspace/canvas/types";
import { generateModels } from "./modelGenerator";
import { generateRoutes } from "./routeGenerator";
import { generateCoreFiles } from "./coreGenerator";
import { generateManifestFiles } from "./manifestGenerators";

/**
 * Compiles a Service Node into a high-performance Go (Gin) microservice application
 */
export function compileGoV1Service(
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
  const cors = node.data?.cors ?? true;
  const corsOrigins = String(node.data?.corsOrigins || "*").trim() || "*";

  // Filter endpoints for this specific service node
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

  const files: CompiledFile[] = [];

  // 1. Models Generation (Request / Response structs from schemas)
  const { files: modelFiles, requestModelMap, responseModelMap } = generateModels(nodeEndpoints);
  files.push(...modelFiles);

  // 2. Routes Generation (Path params, query params, headers, body binding, returns)
  const { files: routeFiles, routeRegistrations } = generateRoutes({
    serviceName,
    moduleName: sanitizedName,
    nodeEndpoints,
    requestModelMap,
    responseModelMap,
  });
  files.push(...routeFiles);

  // 3. Core Server Bootstrap (main.go, config/config.go)
  files.push(
    ...generateCoreFiles({
      serviceName,
      moduleName: sanitizedName,
      port,
      cors,
      corsOrigins,
    }),
  );

  // 4. Manifests & Configs (go.mod, package.json, .air.toml, README.md)
  files.push(
    ...generateManifestFiles({
      serviceName,
      moduleName: sanitizedName,
      port,
      endpoints: routeRegistrations,
    }),
  );

  return {
    serviceId: node.id,
    serviceName,
    files,
  };
}

