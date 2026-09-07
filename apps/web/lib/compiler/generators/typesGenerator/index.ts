import { BackendNode } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, ServiceInfo } from "@workspace/canvas/types";
import { generateTypesPackageConfigs } from "./packageConfigs";
import { generateEntitiesModule } from "./entitiesGenerator";
import { generateServiceRouteTypes } from "./serviceRoutesGenerator";
import { generateEventsModule } from "./eventsGenerator";
import { generateCustomTypesModule } from "./customTypesGenerator";
import { generateResponseInterface } from "./responseInference";

export * from "./types";
export * from "./entitiesGenerator";
export * from "./responseInference";
export * from "./serviceRoutesGenerator";
export * from "./eventsGenerator";
export * from "./customTypesGenerator";
export * from "./packageConfigs";

export function generateTypesPackage(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  servicesInfo?: ServiceInfo[],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const barrelExports: string[] = [];

  // 1. package.json & tsconfig.json - Zero internal workspace dependencies to prevent cyclic dependencies
  files.push(...generateTypesPackageConfigs());

  // 2. Scan all endpoints to discover all referenced entities before generating entities module
  const referencedEntities = new Set<string>();
  const endpointNodes = nodes.filter(
    (n) =>
      n.type === "service" ||
      n.type === "api_gateway" ||
      n.type === "serverless" ||
      Boolean(n.data && (n.data.endpoints || n.data.routeGroups)),
  );

  endpointNodes.forEach((serviceNode) => {
    let nodeEndpoints = endpoints.filter(
      (e) =>
        e.nodeId === serviceNode.id ||
        (e.nodeId &&
          ((serviceNode.data?.label && e.nodeId === serviceNode.data.label) ||
            (serviceNode.data?.label && e.nodeId === serviceNode.data.label.toLowerCase()))),
    );
    if (nodeEndpoints.length === 0 && serviceNode.data?.endpoints) {
      nodeEndpoints = serviceNode.data.endpoints.map((ep) => ({
        ...ep,
        nodeId: serviceNode.id,
      }));
    }
    nodeEndpoints.forEach((ep) => {
      const res = generateResponseInterface("Temp", ep.responseFields, ep.responseBody, nodes, ep, serviceNode);
      res.entityImports.forEach((ent) => referencedEntities.add(ent));
    });
  });

  // 2.5 Entities & Schemas: src/entities/index.ts
  const entitiesModuleCode = generateEntitiesModule(nodes, referencedEntities);
  files.push({
    filename: "src/entities/index.ts",
    language: "typescript",
    content: entitiesModuleCode,
  });
  barrelExports.push(`export * from "./entities";`);

  // 3. Service Folders: src/<serviceFolderName>/<routeFileName>.ts
  const serviceRoutes = generateServiceRouteTypes(nodes, endpoints, servicesInfo);
  files.push(...serviceRoutes.files);
  barrelExports.push(...serviceRoutes.barrelExports);

  // 4. Events Types: src/events/index.ts
  const eventsModule = generateEventsModule(nodes, events);
  files.push(eventsModule.file);
  barrelExports.push(eventsModule.exportStatement);

  // 4.9 Custom Reusable Types (defined on canvas via Types nodes)
  const customTypes = generateCustomTypesModule(nodes);
  if (customTypes.file && customTypes.exportStatement) {
    files.push(customTypes.file);
    barrelExports.push(customTypes.exportStatement);
  }

  // 5. Root Index barrel: src/index.ts
  const indexContent = `/**
 * Shared Type Definitions & Zod Validation Schemas
 * Reused across all microservices (@workspace/*) and frontend web pages
 */
${barrelExports.join("\n")}
`;

  files.push({
    filename: "src/index.ts",
    language: "typescript",
    content: indexContent,
  });

  return files;
}
