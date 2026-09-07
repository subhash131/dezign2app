import { Endpoint, AnyMessagingResource, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { toVarName, toPascalCase, deriveRouteFileName } from "../../utils";
import { generateDefaultRoute } from "./defaultRouteGenerator";
import { generateEndpointRouteHandler } from "./endpointHandlerGenerator";
import { generateRequireAuthMiddleware } from "../auth-providers/better-auth/v1.6/generateRequireAuthMiddleware";
import { classifyEndpointShape } from "./endpointTypeClassifier";

export * from "./dbResolver";
export * from "./kafkaResolver";
export * from "./responseBuilder";
export * from "./defaultRouteGenerator";
export * from "./endpointHandlerGenerator";
export * from "./endpointTypeClassifier";

export function generateRoutes(
  serviceName: string,
  nodeEndpoints: (Endpoint & { nodeId: string })[],
  serviceNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  allEndpoints: (Endpoint & { nodeId: string })[] = [],
  dbFunctions: ReusableFunction[] = [],
  kafkaFunctions: ReusableFunction[] = [],
  nodePublishedEvents: (AnyMessagingResource & { nodeId: string; variant: "publish" | "consume" })[] = [],
  folderName?: string,
  redisFunctions: ReusableFunction[] = [],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const routeImports: string[] = [];
  const routeRegistrations: string[] = [];
  const usedFileNames = new Set<string>();

  const nameForTypes = folderName || serviceName;
  const pascalServiceName = toPascalCase(nameForTypes);
  const serviceFolderName = toVarName(nameForTypes);

  if (nodeEndpoints.length === 0) {
    const defaultRouteResult = generateDefaultRoute(serviceName, dbFunctions);
    files.push(...defaultRouteResult.files);
    routeImports.push(...defaultRouteResult.routeImports);
    routeRegistrations.push(...defaultRouteResult.routeRegistrations);
  } else {
    nodeEndpoints.forEach((ep, index) => {
      const result = generateEndpointRouteHandler({
        ep,
        index,
        serviceName,
        pascalServiceName,
        serviceFolderName,
        serviceNode,
        allNodes,
        allEdges,
        allEndpoints,
        dbFunctions,
        kafkaFunctions,
        redisFunctions,
        nodePublishedEvents,
        usedFileNames,
      });

      files.push(result.file);
      routeImports.push(result.routeImport);

      // Inject requireAuth() per-endpoint — only protected routes get the middleware.
      // Bare routes are registered as-is; no global service-level auth toggle.
      if (result.requiresAuth) {
        // authOptions is already JSON.stringify'd — safe to interpolate directly.
        const middlewareCall = `requireAuth(${result.authOptions === "{}" ? "" : result.authOptions})`;
        routeRegistrations.push(
          result.routeRegistration.replace(
            /^(router\.\w+\("[^"]*",\s*)(.+\);)$/,
            `$1${middlewareCall}, $2`,
          ),
        );
      } else {
        routeRegistrations.push(result.routeRegistration);
      }
    });
  }

  // Determine whether any route in this service needs auth so we know whether
  // to emit requireAuth.ts and add its import to the router index.
  const hasAuthEndpoints = routeRegistrations.some((r) => r.includes("requireAuth("));

  const requireAuthImport = hasAuthEndpoints
    ? `import { requireAuth } from "../middleware/requireAuth";\n`
    : "";

  const routesIndexCode = `import { Router } from "express";
${routeImports.join("\n")}
${requireAuthImport}
export const router: Router = Router();

${routeRegistrations.join("\n")}
`;

  files.push({
    filename: "src/routes/index.ts",
    language: "typescript",
    content: routesIndexCode,
  });

  // Emit the requireAuth middleware file once per service, only when needed.
  // Strategy defaults to "db" (shared SQLite via @workspace/db) — correct for
  // this monorepo. No authStrategy field exists on canvas nodes yet; add one
  // to BackendNodeData when per-project overrides are needed.
  if (hasAuthEndpoints) {
    files.push({
      filename: "src/middleware/requireAuth.ts",
      language: "typescript",
      content: generateRequireAuthMiddleware("db"),
    });
  }

  return files;
}
