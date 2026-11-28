import { Endpoint, AnyMessagingResource, CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { toVarName, toPascalCase } from "../../../utils";
import { isRouteConnectedToAuthenticatedPage } from "../../../traceResolver";
import { resolveServiceAuthContext } from "../../../generators/routeGenerator/handlers/authResolver";

export interface NormalizedRoutePath {
  filePath: string;
  urlPath: string;
  paramNames: string[];
}

/**
 * Normalizes an arbitrary endpoint path (e.g. "/api/users/:id" or "/users/[id]")
 * into a Next.js App Router route.ts file path (e.g. "app/api/users/[id]/route.ts").
 */
export function normalizeNextjsRoutePath(rawPath: string): NormalizedRoutePath {
  let trimmed = (rawPath || "").trim();
  if (!trimmed || trimmed === "/") {
    return { filePath: "app/api/route.ts", urlPath: "/api", paramNames: [] };
  }

  // Strip leading and trailing slashes
  trimmed = trimmed.replace(/^\/+|\/+$/g, "");

  const segments = trimmed.split("/").map((seg) => {
    const s = seg.trim();
    // Convert :id or :orderId to [id] or [orderId]
    if (s.startsWith(":")) {
      return `[${s.slice(1)}]`;
    }
    return s;
  });

  // Ensure all Next.js API route handlers live under the "api" folder
  if (segments[0] !== "api") {
    segments.unshift("api");
  }

  const paramNames: string[] = [];
  segments.forEach((s) => {
    const match = s.match(/^\[\.{0,3}([a-zA-Z0-9_-]+)\]$/);
    if (match && match[1]) {
      paramNames.push(match[1]);
    }
  });

  const relativePath = segments.join("/");
  return {
    filePath: `app/${relativePath}/route.ts`,
    urlPath: `/${segments.map((s) => (s.startsWith("[") ? `:${s.replace(/^[\[.]+|[\]]+$/g, "")}` : s)).join("/")}`,
    paramNames,
  };
}

export interface GenerateNextjsRoutesParams {
  serviceName: string;
  nodeEndpoints: (Endpoint & { nodeId: string })[];
  serviceNode?: BackendNode;
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  allEndpoints?: (Endpoint & { nodeId: string })[];
  dbFunctions?: ReusableFunction[];
  kafkaFunctions?: ReusableFunction[];
  nodePublishedEvents?: (AnyMessagingResource & { nodeId: string; variant: "publish" | "consume" })[];
  hasDb?: boolean;
}

/**
 * Generates Next.js App Router route.ts files for a Service Node.
 * Groups endpoints by normalized path to satisfy Next.js's one-file-per-route requirement.
 */
export function generateNextjsRoutes(params: GenerateNextjsRoutesParams): CompiledFile[] {
  const {
    serviceName,
    nodeEndpoints,
    serviceNode,
    allNodes = [],
    allEdges = [],
    hasDb = false,
  } = params;

  const files: CompiledFile[] = [];

  const isConnectedToAuthPage = serviceNode
    ? isRouteConnectedToAuthenticatedPage(serviceNode, undefined, allNodes, allEdges)
    : false;

  const authCtx = resolveServiceAuthContext(serviceNode, allNodes, allEdges);
  const authVerifyHelper = `import { jwtVerify, createRemoteJWKSet } from "jose";

const AUTH_SERVER_URL =
  process.env.AUTH_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? ${JSON.stringify(authCtx.authServerUrl)};
const JWKS = createRemoteJWKSet(new URL(\`\${AUTH_SERVER_URL}/api/auth/jwks\`));

export interface VerifiedTokenUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Verifies a Bearer JWT cryptographically via the Auth server's cached JWKS keys.
 */
export async function verifyBearerToken(authHeader: string | null): Promise<VerifiedTokenUser | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7).trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    const id = String(payload.sub ?? payload.id ?? payload.userId ?? "");
    if (!id) return null;
    return {
      ...(payload as Record<string, string | number | boolean | null | undefined>),
      id,
      name: typeof payload.name === "string" ? payload.name : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role: typeof payload.role === "string" ? payload.role : "user",
    };
  } catch {
    return null;
  }
}
`;
  files.push({
    filename: "lib/verify-auth.ts",
    language: "typescript",
    content: authVerifyHelper,
  });

  // Fallback: If no endpoints exist, generate a default health-check route
  if (nodeEndpoints.length === 0) {
    const healthContent = isConnectedToAuthPage
      ? `import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@workspace/logger";
import { verifyBearerToken } from "@/lib/verify-auth";

const logger = createLogger("${serviceName}:health");

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  logger.info("Health check endpoint called");
  const user = await verifyBearerToken(request.headers.get("authorization"));
  return NextResponse.json({
    status: "healthy",
    service: "${serviceName}",
    timestamp: new Date().toISOString(),
    user,
  });
}
`
      : `import { NextResponse } from "next/server";
import { createLogger } from "@workspace/logger";

const logger = createLogger("${serviceName}:health");

export const dynamic = "force-dynamic";

export async function GET() {
  logger.info("Health check endpoint called");
  return NextResponse.json({
    status: "healthy",
    service: "${serviceName}",
    timestamp: new Date().toISOString(),
  });
}
`;

    files.push({
      filename: "app/api/health/route.ts",
      language: "typescript",
      content: healthContent,
    });
    return files;
  }

  // Group endpoints by normalized route.ts file path
  const groupedRoutes = new Map<
    string,
    {
      normalized: NormalizedRoutePath;
      endpoints: (Endpoint & { nodeId: string })[];
    }
  >();

  nodeEndpoints.forEach((ep) => {
    const normalized = normalizeNextjsRoutePath(ep.name);
    const existing = groupedRoutes.get(normalized.filePath);
    if (existing) {
      existing.endpoints.push(ep);
    } else {
      groupedRoutes.set(normalized.filePath, {
        normalized,
        endpoints: [ep],
      });
    }
  });

  // Render each route.ts file
  groupedRoutes.forEach(({ normalized, endpoints }, filePath) => {
    const methodsPresent = new Set<string>();
    const methodHandlerCodes: string[] = [];

    // Check if any endpoint in this file has database interaction
    const fileUsesDb =
      hasDb &&
      endpoints.some((ep) => {
        const hasDbId = Boolean(ep.databaseNodeId && ep.databaseNodeId !== "none");
        const hasDbIds = Boolean(ep.databaseNodeIds && ep.databaseNodeIds.length > 0);
        const hasCrud = Boolean(ep.crudOperations && Object.keys(ep.crudOperations).length > 0);
        const codeText = (ep.body || ep.code || "").toLowerCase();
        const hasDbCode = codeText.includes("db.") || codeText.includes("prisma.");
        return hasDbId || hasDbIds || hasCrud || hasDbCode;
      });

    endpoints.forEach((ep) => {
      const rawMethod = (ep.type || "GET").toUpperCase();
      const method = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"].includes(rawMethod)
        ? rawMethod
        : "GET";

      // Prevent duplicate exports of the same HTTP method in one file
      if (methodsPresent.has(method)) {
        return;
      }
      methodsPresent.add(method);

      const isBodyMethod = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
      const hasParams = normalized.paramNames.length > 0;
      const promptText = (ep.businessLogic || ep.prompt || ep.summary || "").trim();

      // Determine appropriate status code
      const successStatus = method === "POST" ? 201 : 200;

      let handlerCode = `/**
 * ${method} ${normalized.urlPath}
 * ${promptText ? promptText : `Handler for ${method} ${normalized.urlPath}`}
 */
export async function ${method}(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    logger.info("Handling ${method} ${normalized.urlPath}");
`;

      if (hasParams) {
        handlerCode += `    const params = await context.params;\n`;
        handlerCode += `    logger.debug("Route params", { params });\n`;
      }

      handlerCode += `    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());\n`;

      if (isBodyMethod) {
        handlerCode += `    let body: Record<string, string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>> = {};
    try {
      body = await request.json();
    } catch {
      // Body may be empty or non-JSON
    }
    logger.debug("Request body", { body });\n`;
      }

      if (promptText) {
        handlerCode += `\n    // AI CODING AGENT DIRECTIVE: ${promptText}\n`;
      }

      const isHealth =
        normalized.urlPath === "/health" ||
        normalized.urlPath === "/api/health" ||
        ep.name === "/health" ||
        ep.name === "health";
      const isEpConnectedToAuthPage = serviceNode
        ? isRouteConnectedToAuthenticatedPage(serviceNode, ep, allNodes, allEdges)
        : false;

      // Build sample response payload
      const responseDataProps: string[] = [
        `message: "Successfully executed ${method} ${normalized.urlPath}"`,
      ];
      if (hasParams) {
        responseDataProps.push(`params`);
      }
      if (isBodyMethod) {
        responseDataProps.push(`body`);
      }
      if (isHealth && (isEpConnectedToAuthPage || ep.requireAuth === true)) {
        handlerCode += `    const user = await verifyBearerToken(request.headers.get("authorization"));\n`;
        responseDataProps.push(`user`);
        responseDataProps.push(`status: "healthy"`);
        responseDataProps.push(`service: "${serviceName}"`);
        responseDataProps.push(`timestamp: new Date().toISOString()`);
      }

      handlerCode += `
    return NextResponse.json(
      {
        success: true,
        data: {
          ${responseDataProps.join(",\n          ")},
        },
      },
      { status: ${successStatus} }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error in ${method} ${normalized.urlPath}:", message);
    return NextResponse.json(
      { error: "Internal Server Error", details: message },
      { status: 500 }
    );
  }
}
`;
      methodHandlerCodes.push(handlerCode);
    });

    // Provide default OPTIONS handler for CORS preflight
    if (!methodsPresent.has("OPTIONS")) {
      methodHandlerCodes.push(`export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}
`);
    }

    const hasAuthHealth = endpoints.some((ep) => {
      const isHealth =
        normalized.urlPath === "/health" ||
        normalized.urlPath === "/api/health" ||
        ep.name === "/health" ||
        ep.name === "health";
      const isEpConnected = serviceNode
        ? isRouteConnectedToAuthenticatedPage(serviceNode, ep, allNodes, allEdges)
        : false;
      return isHealth && (isEpConnected || ep.requireAuth === true);
    });

    const fileContent = `import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@workspace/logger";
${fileUsesDb ? `import { db } from "@workspace/db";\n` : ""}${hasAuthHealth ? `import { verifyBearerToken } from "@/lib/verify-auth";\n` : ""}
const logger = createLogger("${serviceName}:${normalized.urlPath.replace(/[^a-zA-Z0-9]/g, "_")}");

export const dynamic = "force-dynamic";

${methodHandlerCodes.join("\n")}
`;

    files.push({
      filename: filePath,
      language: "typescript",
      content: fileContent,
    });
  });

  return files;
}
