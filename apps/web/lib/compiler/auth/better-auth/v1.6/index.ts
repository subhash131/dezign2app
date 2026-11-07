import { BackendNode, BackendEdge } from "@/types/canvas";
import { CompiledFile, CompiledServiceResult } from "@workspace/canvas/types";
import { BetterAuthV16NodeData } from "./types";
import {
  generateAuthConfig,
  generateNextJsRouteHandler,
  generateEnvExample,
  generateFastApiMiddleware,
} from "./generators";
import { generateAuthClient } from "../../../generators/auth-providers/better-auth/v1.6/generateAuthClient";

export * from "./types";
export * from "./adapters";
export * from "./providers";
export * from "./generators";

/**
 * Compiles a Canvas Auth Node into integrated monorepo auth artifacts (Better Auth config,
 * client SDK, Next.js route handler, FastAPI middleware, and environment variables).
 */
export function compileBetterAuthV16(
  node: BackendNode,
  _allNodes: BackendNode[] = [],
  _allEdges: BackendEdge[] = []
): CompiledServiceResult & { authNodeId: string } {
  const rawData: BetterAuthV16NodeData = node.data || {};
  const serviceName = rawData.label || "Auth";
  const authPort = rawData.port || "3000";
  const authBaseUrl = rawData.baseUrl || `http://localhost:${authPort}`;

  // Check if Payments node is wired to this AuthNode
  const paymentsEdge = _allEdges.find(
    (e) =>
      (e.target === node.id && (e.targetHandle === "payments-plugin-in" || e.targetHandle === "auth-in")) ||
      (e.source === node.id && e.sourceHandle === "payments-plugin-in")
  );
  const connectedPaymentsNode = paymentsEdge
    ? _allNodes.find(
        (n) => n.id === (paymentsEdge.target === node.id ? paymentsEdge.source : paymentsEdge.target) && n.type === "payments"
      )
    : _allNodes.find((n) => n.type === "payments" && _allNodes.filter((x) => x.type === "auth").length <= 1);

  // Resolve connected DB node if any to infer dbAdapter
  const connectedDbEdge = _allEdges.find(
    (e) =>
      ((e.target === node.id || e.target === node.nodeId) &&
        _allNodes.some((n) => (n.id === e.source || n.nodeId === e.source) && n.type === "database")) ||
      ((e.source === node.id || e.source === node.nodeId) &&
        _allNodes.some((n) => (n.id === e.target || n.nodeId === e.target) && n.type === "database"))
  );
  const connectedEdgeDbNode = connectedDbEdge
    ? _allNodes.find(
        (n) =>
          (n.id === (connectedDbEdge.target === node.id ? connectedDbEdge.source : connectedDbEdge.target) ||
            n.nodeId === (connectedDbEdge.target === node.id ? connectedDbEdge.source : connectedDbEdge.target)) &&
          n.type === "database"
      )
    : undefined;

  const connectedDbNode =
    _allNodes.find((n) => n.id === rawData.databaseId) ||
    connectedEdgeDbNode ||
    _allNodes.find((n) => n.type === "database" && n.data?.dbEngine !== "redis");
  const resolvedDbEngine = (connectedDbNode?.data?.dbEngine || "").toLowerCase();
  const resolvedDbAdapter =
    rawData.dbAdapter ||
    (resolvedDbEngine.includes("postgres") || resolvedDbEngine.includes("pg")
      ? "postgres"
      : resolvedDbEngine.includes("mysql")
      ? "mysql"
      : "sqlite-raw");

  const resolvedConnectionString =
    rawData.connectionString ||
    connectedDbNode?.data?.connectionString ||
    connectedDbNode?.data?.connectionStringPooled;

  const data: BetterAuthV16NodeData = {
    ...rawData,
    dbAdapter: resolvedDbAdapter,
    dbEngine: resolvedDbEngine || rawData.dbEngine,
    connectionString: resolvedConnectionString,
    validateSchema: rawData.validateSchema ?? false,
    paymentsPlugin: rawData.paymentsPlugin || (connectedPaymentsNode
      ? {
          provider: "creem",
          apiKeyEnv: connectedPaymentsNode.data?.apiKeyEnv || "CREEM_API_KEY",
          webhookSecretEnv: connectedPaymentsNode.data?.webhookSecretEnv || "CREEM_WEBHOOK_SECRET",
        }
      : undefined),
  };

  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
  const clientPlugins: string[] = [];
  if (enabledPlugins.includes("admin")) clientPlugins.push("adminClient");
  if (enabledPlugins.includes("organization")) clientPlugins.push("organizationClient");
  if (clientPlugins.length === 0) {
    clientPlugins.push("adminClient", "organizationClient");
  }

  const files: CompiledFile[] = [
    {
      filename: "auth.ts",
      language: "typescript",
      content: generateAuthConfig(data),
    },
    {
      filename: "auth-client.ts",
      language: "typescript",
      content: generateAuthClient({
        baseURL: authBaseUrl,
        plugins: clientPlugins,
      }),
    },
    {
      filename: "route.ts",
      language: "typescript",
      content: generateNextJsRouteHandler(data),
    },
    {
      filename: ".env",
      language: "env",
      content: generateEnvExample(data),
    },
    {
      filename: ".env.example",
      language: "env",
      content: generateEnvExample(data),
    },
    {
      filename: "auth_middleware.py",
      language: "python",
      content: generateFastApiMiddleware(data),
    },
  ];

  return {
    authNodeId: node.id,
    serviceId: node.id,
    serviceName,
    files,
  };
}

export const compileBetterAuthV16Service = compileBetterAuthV16;

