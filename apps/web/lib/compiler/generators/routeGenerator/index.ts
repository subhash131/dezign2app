import { Endpoint, AnyMessagingResource, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { toVarName, toPascalCase, toPascalServiceName, deriveRouteFileName } from "../../utils";
import { isRouteConnectedToAuthenticatedPage } from "../../traceResolver";
import { generateDefaultRoute } from "./defaultRouteGenerator";
import { generateEndpointRouteHandler } from "./endpointHandlerGenerator";
import {
  generateRequireAuthMiddleware,
  generateVerifyTokenHelper,
} from "../auth-providers/better-auth/v1.6/generateRequireAuthMiddleware";
import { resolveServiceAuthContext } from "./handlers/authResolver";
import { classifyEndpointShape } from "./endpointTypeClassifier";
import type { PipelineStep } from "@workspace/canvas/types";

function hasAuthVerifyStepRecursive(steps?: PipelineStep[]): boolean {
  if (!steps || !Array.isArray(steps)) return false;
  return steps.some(
    (s) =>
      s.enabled !== false &&
      (s.type === "auth_verify" ||
        hasAuthVerifyStepRecursive(s.thenSteps) ||
        hasAuthVerifyStepRecursive(s.elseSteps) ||
        hasAuthVerifyStepRecursive(s.trySteps) ||
        hasAuthVerifyStepRecursive(s.catchSteps) ||
        hasAuthVerifyStepRecursive(s.cacheMissSteps) ||
        hasAuthVerifyStepRecursive(s.loopBody) ||
        hasAuthVerifyStepRecursive(s.switchDefault) ||
        s.switchCases?.some((c) => hasAuthVerifyStepRecursive(c.steps)) ||
        s.parallelBranches?.some((b) => hasAuthVerifyStepRecursive(b.steps))),
  );
}

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
  storageFunctions: ReusableFunction[] = [],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const routeImports: string[] = [];
  const routeRegistrations: string[] = [];
  const usedFileNames = new Set<string>();

  const nameForTypes = folderName || serviceName;
  const pascalServiceName = toPascalServiceName(nameForTypes);
  const serviceFolderName = toVarName(nameForTypes);

  if (nodeEndpoints.length === 0) {
    const isProtected = serviceNode
      ? isRouteConnectedToAuthenticatedPage(serviceNode, undefined, allNodes, allEdges)
      : false;
    const defaultRouteResult = generateDefaultRoute(serviceName, dbFunctions, isProtected);
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
        storageFunctions,
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

  // Emit verifyToken.ts whenever any route needs requireAuth OR any endpoint/event uses an auth_verify step.
  const hasAuthVerifyInEndpoints = nodeEndpoints.some((ep) =>
    hasAuthVerifyStepRecursive(ep.pipelineSteps),
  );
  const hasAuthVerifyInServiceEvents = Boolean(
    serviceNode?.data?.consumedEvents?.some((ev) =>
      hasAuthVerifyStepRecursive(ev.pipelineSteps),
    ),
  );
  const needsVerifyToken =
    hasAuthEndpoints || hasAuthVerifyInEndpoints || hasAuthVerifyInServiceEvents;

  if (needsVerifyToken) {
    const authCtx = resolveServiceAuthContext(serviceNode, allNodes, allEdges);
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

  // Emit the requireAuth middleware and Express types augmentation once per service, only when needed.
  if (hasAuthEndpoints) {
    const authCtx = resolveServiceAuthContext(serviceNode, allNodes, allEdges);
    files.push({
      filename: "src/middleware/requireAuth.ts",
      language: "typescript",
      content: generateRequireAuthMiddleware(authCtx.strategy, {
        authServerUrl: authCtx.authServerUrl,
        issuer: authCtx.issuer,
        audience: authCtx.audience,
        redisRevocationPackageName: authCtx.redisRevocationPackageName,
      }),
    });
    files.push({
      filename: "src/types.d.ts",
      language: "typescript",
      content: `import "express";
import type { AuthUser } from "@workspace/types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
export {};
`,
    });
  }

  return files;
}
