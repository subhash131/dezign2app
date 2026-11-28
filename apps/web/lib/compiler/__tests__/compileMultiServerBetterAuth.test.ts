import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { compileServiceNode } from "../compileServiceNode";
import { compileAuth } from "../compileAuth";
import { renderPipeline } from "../generators/routeGenerator/pipelineRenderer";
import { collectPipelineImports } from "../generators/routeGenerator/pipeline/importCollector";
import { resolveServiceAuthContext } from "../generators/routeGenerator/handlers/authResolver";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, PipelineStep } from "@workspace/canvas/types";

describe("Multi-server Better Auth + Redis + Kafka + auth_verify pipeline", () => {
  const authNode: BackendNode = {
    id: "node-auth-1",
    type: "auth",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: "AuthServer",
      framework: "better_auth",
      port: "3000",
      baseUrl: "http://localhost:3000",
      plugins: ["bearer", "admin", "organization", "jwt"],
      databaseId: "db-auth",
      secondaryStorage: {
        enabled: true,
        redisNodeId: "redis-auth",
        keyPrefix: "ba:",
        useForRateLimit: true,
      },
      jwtConfig: {
        algorithm: "RS256",
        expirationTime: "10m",
      },
      revocationCheck: {
        enabled: true,
        redisNodeId: "redis-auth",
      },
      session: {
        expiresInSeconds: 604800,
        updateAgeSeconds: 86400,
        storeSessionInDatabase: false,
        cookieCache: {
          enabled: true,
          maxAgeSeconds: 300,
          strategy: "jwe",
          refreshCache: true,
        },
        claims: [
          { key: "planTier", source: "entityColumn", targetValue: "pro", deliveryMode: "jwt", destination: "jwt" },
        ],
      },
    },
  };

  const authDbNode: BackendNode = {
    id: "db-auth",
    type: "database",
    position: { x: 0, y: 200 },
    fractionalIndex: "a1",
    data: { label: "AuthDB", dbEngine: "postgres" },
  };

  const redisNode: BackendNode = {
    id: "redis-auth",
    type: "redis_instance",
    position: { x: 200, y: 200 },
    fractionalIndex: "a2",
    data: { label: "AuthRedis", host: "localhost", port: 6379 },
  };

  const kafkaNode: BackendNode = {
    id: "kafka-1",
    type: "kafka",
    position: { x: 400, y: 200 },
    fractionalIndex: "a3",
    data: {
      label: "EventsKafka",
      topics: [{ id: "topic-orders", name: "order.created" }],
    },
  };

  it("compiles Better Auth with jwt({ definePayload }), Redis secondaryStorage, and cookieCache.strategy", () => {
    const compiled = compileAuth(authNode, [], [], [authNode, authDbNode, redisNode], []);
    const authTs = compiled.files.find((f) => f.filename === "auth.ts")?.content || "";
    const authClientTs = compiled.files.find((f) => f.filename === "auth-client.ts")?.content || "";

    expect(authTs).toContain('alg: "RS256"');
    expect(authTs).toContain('expirationTime: "10m"');
    expect(authTs).toContain("definePayload: async ({ user, session })");
    expect(authTs).toContain('import { findAuthOrgMemberRole } from "@workspace/db";');
    expect(authTs).toContain("activeOrganizationId,");
    expect(authTs).toContain("orgRole,");
    expect(authTs).toContain("planTier:");
    expect(authTs).toContain('import { getRedisClient } from "@workspace/auth-redis";');
    expect(authTs).toContain("secondaryStorage:");
    expect(authTs).toContain('storage: "secondary-storage"');
    expect(authTs).toContain('strategy: "jwe"');
    expect(authTs).toContain("refreshCache: true");
    expect(authTs).toContain("storeSessionInDatabase: false");
    expect(authClientTs).toContain("jwtClient");
    expect(authClientTs).toContain("jwtClient(),");
  });

  it("wires jwtClient() and authClient.token() into Next.js WebApp lib/auth-token.ts", () => {
    const webAppNode: BackendNode = {
      id: "webapp-1",
      type: "webApp",
      position: { x: 0, y: -200 },
      fractionalIndex: "a0",
      data: { label: "WebApp", appSlug: "web", authNodeId: "node-auth-1" },
    };
    const pageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      position: { x: 0, y: -100 },
      fractionalIndex: "a1",
      data: { label: "Dashboard", path: "/dashboard", requireAuth: true },
    };
    const result = compileMonorepo(
      [authNode, authDbNode, redisNode, webAppNode, pageNode],
      [],
      [],
      [
        { id: "e-auth-web", type: "connection", source: "node-auth-1", target: "webapp-1", fractionalIndex: "a0" },
        { id: "e-web-page", type: "connection", source: "webapp-1", target: "page-1", fractionalIndex: "a1" },
      ],
    );

    const authClientFile = result.files.find((f) => f.filename.endsWith("lib/auth-client.ts"));
    const authTokenFile = result.files.find((f) => f.filename.endsWith("lib/auth-token.ts"));
    const webPkgFile = result.files.find((f) => f.filename === "apps/web/package.json");

    expect(authClientFile?.content).toContain("jwtClient");
    expect(authTokenFile?.content).toContain("authClient.token");
    expect(authTokenFile?.content).toContain("parseJwtExpSeconds");
    expect(webPkgFile?.content).toContain('"@workspace/auth-redis": "workspace:*"');
  });

  it("selects JWKS strategy with module-scoped createRemoteJWKSet & Redis revocation in multi-server Express topologies", () => {
    const serviceA: BackendNode = {
      id: "srv-orders",
      type: "service",
      position: { x: 300, y: 0 },
      fractionalIndex: "a4",
      data: { label: "OrderService", port: "8081", techStack: "express" },
    };
    const serviceB: BackendNode = {
      id: "srv-billing",
      type: "service",
      position: { x: 600, y: 0 },
      fractionalIndex: "a5",
      data: { label: "BillingService", port: "8082", techStack: "express" },
    };
    const epA: Endpoint & { nodeId: string } = {
      id: "ep-create-order",
      nodeId: "srv-orders",
      name: "/orders",
      type: "POST",
      requireAuth: true,
      requiredRoles: ["admin"],
    };

    const result = compileServiceNode(
      serviceA,
      [epA],
      [],
      [authNode, authDbNode, redisNode, serviceA, serviceB],
      [],
    );

    const verifyTokenFile = result.files.find((f) => f.filename === "src/middleware/verifyToken.ts");
    const requireAuthFile = result.files.find((f) => f.filename === "src/middleware/requireAuth.ts");
    const envFile = result.files.find((f) => f.filename === ".env");

    expect(verifyTokenFile).toBeDefined();
    expect(verifyTokenFile!.content).toContain("createRemoteJWKSet");
    // JWKS client must be hoisted at module scope (before export async function verifyAuthToken)
    const jwksIdx = verifyTokenFile!.content.indexOf("const JWKS = createRemoteJWKSet(");
    const fnIdx = verifyTokenFile!.content.indexOf("export async function verifyAuthToken(");
    expect(jwksIdx).toBeGreaterThan(-1);
    expect(jwksIdx).toBeLessThan(fnIdx);
    expect(verifyTokenFile!.content).toContain('getCache(`auth:revoked:${jti}`)');
    expect(requireAuthFile!.content).toContain("verifyAuthToken");
    expect(envFile!.content).toContain("AUTH_SERVER_URL=http://localhost:3000");
  });

  it("compiles FastAPI and Go services with JWKS verification on protected routes", () => {
    const pyService: BackendNode = {
      id: "srv-py",
      type: "service",
      position: { x: 300, y: 0 },
      fractionalIndex: "a4",
      data: { label: "AiService", port: "8083", techStack: "fastapi" },
    };
    const goService: BackendNode = {
      id: "srv-go",
      type: "service",
      position: { x: 600, y: 0 },
      fractionalIndex: "a5",
      data: { label: "LedgerService", port: "8084", techStack: "go" },
    };
    const pyEp: Endpoint & { nodeId: string } = {
      id: "ep-py",
      nodeId: "srv-py",
      name: "/analyze",
      type: "POST",
      requireAuth: true,
      requiredRoles: ["analyst"],
    };
    const goEp: Endpoint & { nodeId: string } = {
      id: "ep-go",
      nodeId: "srv-go",
      name: "/ledger",
      type: "GET",
      requireAuth: true,
      requiredRoles: ["admin"],
    };

    const pyResult = compileServiceNode(pyService, [pyEp], [], [authNode, pyService, goService], []);
    const pyRoute = pyResult.files.find((f) => f.filename.startsWith("routes/") && f.filename !== "routes/__init__.py");
    const pyAuth = pyResult.files.find((f) => f.filename === "auth_middleware.py");
    expect(pyRoute?.content).toContain('Depends(require_roles(["analyst"]))');
    expect(pyAuth?.content).toContain("PyJWKClient(JWKS_URL)");

    const goResult = compileServiceNode(goService, [goEp], [], [authNode, pyService, goService], []);
    const goRouter = goResult.files.find((f) => f.filename === "routes/router.go");
    const goMiddleware = goResult.files.find((f) => f.filename === "middleware/auth.go");
    const goMod = goResult.files.find((f) => f.filename === "go.mod");
    expect(goMiddleware?.content).toContain("keyfunc.NewDefaultCtx");
    expect(goRouter?.content).toContain('middleware.RequireAuth("admin")');
    expect(goMod?.content).toContain("github.com/MicahParks/keyfunc/v3");
  });

  it("supports Kafka token header forwarding in Service A and auth_verify step in Service B consumer", () => {
    const serviceA: BackendNode = {
      id: "srv-a",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a4",
      data: { label: "OrderApi", port: "8081", techStack: "express" },
    };
    const serviceB: BackendNode = {
      id: "srv-b",
      type: "service",
      position: { x: 500, y: 0 },
      fractionalIndex: "a5",
      data: { label: "FulfillmentWorker", port: "8082", techStack: "express" },
    };

    const publishStep: PipelineStep = {
      id: "step-pub",
      name: "Publish Order Created",
      type: "kafka_publish",
      brokerNodeId: "kafka-1",
      messagingResourceId: "topic-orders",
      outputVariable: "pubRes",
      functionRef: {
        name: "publishOrderCreated",
        importPath: "@workspace/events-kafka",
      },
      inputBindings: [
        { argName: "orderId", source: { kind: "req_body", field: "orderId" } },
        { argName: "headers.authorization", source: { kind: "req_headers", field: "authorization" } },
      ],
    };

    const epA: Endpoint & { nodeId: string } = {
      id: "ep-a",
      nodeId: "srv-a",
      name: "/orders",
      type: "POST",
      requireAuth: true,
      pipelineSteps: [publishStep],
    };

    const authVerifyStep: PipelineStep = {
      id: "step-verify-b",
      name: "Verify Kafka Token",
      type: "auth_verify",
      outputVariable: "verifiedUser",
      authVerifyAuthNodeId: "node-auth-1",
      authVerifyMode: "jwks",
      authVerifyExpirationPolicy: "verify_signature_ignore_exp",
      authVerifyRequiredRoles: ["admin"],
      authVerifyCheckRedisRevocation: true,
      inputBindings: [
        { argName: "token", source: { kind: "event_headers", field: "authorization" } },
      ],
    };

    const consumedEv: AnyMessagingResource & { nodeId: string; variant: "consume" } = {
      id: "ev-consume-order",
      nodeId: "srv-b",
      variant: "consume",
      name: "order.created",
      brokerNodeId: "kafka-1",
      messagingResourceId: "topic-orders",
      pipelineSteps: [authVerifyStep],
    };

    const compiledB = compileServiceNode(
      serviceB,
      [],
      [consumedEv],
      [authNode, authDbNode, redisNode, kafkaNode, serviceA, serviceB],
      [],
    );

    const pubLines = renderPipeline([publishStep], "req.body");
    expect(pubLines.join("\n")).toContain('authorization: String(req.headers["authorization"] ?? "")');

    const consumerHandler = compiledB.files.find((f) => f.filename === "src/consumer/orderCreated.ts");
    const consumerIndex = compiledB.files.find((f) => f.filename === "src/consumer/index.ts");
    const verifyTokenFile = compiledB.files.find((f) => f.filename === "src/middleware/verifyToken.ts");

    expect(consumerIndex?.content).toContain("await handleOrderCreated(payload, headers);");
    expect(consumerHandler?.content).toContain('import { verifyAuthToken } from "../middleware/verifyToken";');
    expect(consumerHandler?.content).toContain(
      'const verifiedUser = await verifyAuthToken(String(headers["authorization"] ?? ""), { roles: ["admin"], ignoreExpiration: true });',
    );
    expect(verifyTokenFile?.content).toContain("createRemoteJWKSet");

    const imports = collectPipelineImports([authVerifyStep]);
    expect(imports.get("../middleware/verifyToken")?.has("verifyAuthToken")).toBe(true);

    // Also verify Service A compiles cleanly with headers forwarding
    const compiledA = compileServiceNode(
      serviceA,
      [epA],
      [],
      [authNode, authDbNode, redisNode, kafkaNode, serviceA, serviceB],
      [],
    );
    const routeA = compiledA.files.find((f) => f.filename === "src/routes/postOrders.ts");
    expect(routeA?.content).toContain("publishOrderCreated");
    expect(routeA?.content).toContain("authorization:");
  });

  it("resolves strategy to db for single-DB monolith and jwks for non-Better-Auth providers", () => {
    const singleService: BackendNode = {
      id: "srv-mono",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: { label: "MonolithService", techStack: "express", databaseId: "db-auth" },
    };
    const monoCtx = resolveServiceAuthContext(singleService, [authNode, authDbNode, singleService], []);
    expect(monoCtx.strategy).toBe("db");

    const externalIdpNode: BackendNode = {
      ...authNode,
      id: "node-auth-ext",
      data: {
        ...authNode.data,
        // Simulate a future external IdP framework until added to AUTH_FRAMEWORK_OPTIONS
        framework: "oidc" as BackendNode["data"]["framework"],
        serviceAuthStrategy: "auto",
      },
    };
    const extCtx = resolveServiceAuthContext(singleService, [externalIdpNode, authDbNode, singleService], []);
    expect(extCtx.strategy).toBe("jwks");
  });

  it("keeps default admin() / organization() output without auth-permissions.ts when no custom roles exist", () => {
    const compiled = compileAuth(authNode, [], [], [authNode, authDbNode, redisNode], []);
    const permissionsFile = compiled.files.find((f) => f.filename === "auth-permissions.ts");
    const authTs = compiled.files.find((f) => f.filename === "auth.ts")?.content || "";
    const authClientTs = compiled.files.find((f) => f.filename === "auth-client.ts")?.content || "";

    expect(permissionsFile).toBeUndefined();
    expect(authTs).toContain("admin(),");
    expect(authTs).not.toContain("./auth-permissions");
    expect(authClientTs).toContain("adminClient(),");
    expect(authClientTs).toContain("organizationClient(),");
  });

  it("emits auth-permissions.ts and wires createAccessControl when custom user and org roles are configured", () => {
    const customRolesAuthNode: BackendNode = {
      ...authNode,
      id: "node-auth-custom-rbac",
      data: {
        ...authNode.data,
        rbac: {
          roles: ["user", "admin", "editor"],
          defaultRole: "user",
          adminRoles: ["admin", "editor"],
        },
        organization: {
          enabled: true,
          multiOrg: true,
          teams: true,
          roles: ["owner", "admin", "member", "billing_manager"],
        },
      },
    };

    const compiled = compileAuth(customRolesAuthNode, [], [], [customRolesAuthNode, authDbNode, redisNode], []);
    const permissionsTs = compiled.files.find((f) => f.filename === "auth-permissions.ts")?.content || "";
    const authTs = compiled.files.find((f) => f.filename === "auth.ts")?.content || "";
    const authClientTs = compiled.files.find((f) => f.filename === "auth-client.ts")?.content || "";

    expect(permissionsTs).toContain('import { createAccessControl } from "better-auth/plugins/access";');
    expect(permissionsTs).toContain("export const adminAcInstance = createAccessControl(adminDefaultStatements);");
    expect(permissionsTs).toContain('"editor": adminAcInstance.newRole({ ...adminAc.statements }),');
    expect(permissionsTs).toContain("export const orgAcInstance = createAccessControl(orgDefaultStatements);");
    expect(permissionsTs).toContain('"billing_manager": orgAcInstance.newRole({ ...memberAc.statements }),');

    expect(authTs).toContain(
      'import { adminAcInstance, adminRolesMap, orgAcInstance, orgRolesMap } from "./auth-permissions";',
    );
    expect(authTs).toContain("ac: adminAcInstance,");
    expect(authTs).toContain("roles: adminRolesMap,");
    expect(authTs).toContain('defaultRole: "user",');
    expect(authTs).toContain('adminRoles: ["admin","editor"],');
    expect(authTs).toContain("ac: orgAcInstance,");
    expect(authTs).toContain("roles: orgRolesMap,");

    expect(authClientTs).toContain(
      'import { adminAcInstance, adminRolesMap, orgAcInstance, orgRolesMap } from "./auth-permissions";',
    );
    expect(authClientTs).toContain("adminClient({ ac: adminAcInstance, roles: adminRolesMap }");
    expect(authClientTs).toContain("organizationClient({ ac: orgAcInstance, roles: orgRolesMap }");

    // Verify Next.js WebApp monorepo output includes lib/auth-permissions.ts and custom lib/auth-client.ts
    const webAppNode: BackendNode = {
      id: "web-1",
      type: "webApp",
      position: { x: 400, y: 0 },
      fractionalIndex: "a4",
      data: { label: "WebApp", appSlug: "web", authNodeId: "node-auth-custom-rbac" },
    };
    const webToAuthEdge: BackendEdge = {
      id: "e-web-auth",
      type: "connection",
      source: "node-auth-custom-rbac",
      target: "web-1",
      fractionalIndex: "a0",
    };

    const monorepo = compileMonorepo(
      [customRolesAuthNode, authDbNode, redisNode, webAppNode],
      [],
      [],
      [webToAuthEdge],
    );
    const webAppPermFile = monorepo.files.find((f) => f.filename.endsWith("lib/auth-permissions.ts"));
    const webAppClientFile = monorepo.files.find((f) => f.filename.endsWith("lib/auth-client.ts"));

    expect(webAppPermFile?.content).toContain("export const adminRolesMap");
    expect(webAppClientFile?.content).toContain('from "./auth-permissions"');
    expect(webAppClientFile?.content).toContain("adminClient({ ac: adminAcInstance, roles: adminRolesMap }");
  });

  it("supports dual Global User Roles + Organization Roles enforcement in auth_verify and verifyAuthToken", async () => {
    const dualRoleStepAll: PipelineStep = {
      id: "step-dual-all",
      type: "auth_verify",
      name: "Verify Global + Org Role",
      outputVariable: "verifiedDual",
      authVerifyAuthNodeId: authNode.id,
      authVerifyMode: "jwks",
      authVerifyExpirationPolicy: "strict",
      authVerifyRequiredRoles: ["admin", "user"],
      authVerifyRequiredOrgRoles: ["billing_manager"],
      authVerifyRoleMatchMode: "all",
      inputBindings: [
        { argName: "token", source: { kind: "event_headers", field: "authorization" } },
      ],
    };

    const dualRoleStepAny: PipelineStep = {
      ...dualRoleStepAll,
      id: "step-dual-any",
      authVerifyRoleMatchMode: "any",
    };

    const allLines = renderPipeline([dualRoleStepAll], "payload");
    expect(allLines.join("\n")).toContain(
      'const verifiedDual = await verifyAuthToken(String(headers["authorization"] ?? ""), { roles: ["admin","user"], orgRoles: ["billing_manager"], roleMatchMode: "all" });',
    );

    const anyLines = renderPipeline([dualRoleStepAny], "payload");
    expect(anyLines.join("\n")).toContain(
      'const verifiedDual = await verifyAuthToken(String(headers["authorization"] ?? ""), { roles: ["admin","user"], orgRoles: ["billing_manager"], roleMatchMode: "any" });',
    );

    const { generateVerifyTokenHelper } = await import(
      "../generators/auth-providers/better-auth/v1.6/generateRequireAuthMiddleware"
    );

    const jwksHelper = generateVerifyTokenHelper("jwks", { authServerUrl: "http://localhost:3000" });
    expect(jwksHelper).toContain("orgRoles?: string[];");
    expect(jwksHelper).toContain('roleMatchMode?: "all" | "any";');
    expect(jwksHelper).toContain("userRoleMatches && orgRoleMatches");
    expect(jwksHelper).toContain("userRoleMatches || orgRoleMatches");
    expect(jwksHelper).toContain("orgRole: payloadOrgRole");

    const dbHelper = generateVerifyTokenHelper("db");
    expect(dbHelper).toContain("findAuthOrgMemberRole");
    expect(dbHelper).toContain("await findAuthOrgMemberRole(resolvedUserId, resolvedActiveOrgId)");

    const httpHelper = generateVerifyTokenHelper("http", { authServerUrl: "http://localhost:3000" });
    expect(httpHelper).toContain("/api/auth/organization/get-active-member");
  });
});
