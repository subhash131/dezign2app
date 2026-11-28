import {
  Endpoint,
  BackendNode,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import { parseSchemaJson } from "@/lib/compiler/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { cleanEnvVarName } from "@/lib/utils/localEnvSync";
import { AvailablePath, AvailableSource } from "../types";
import { extractPathsFromObject } from "./pathUtils";

/**
 * Creates an AvailableSource representation for environment variables (.env)
 * strictly displaying the envVars configured on this node.
 */
export function createEnvExtraSource(
  allNodes: BackendNode[] = [],
  serviceNodeId?: string,
): AvailableSource {
  const envPaths: AvailablePath[] = [];
  const seenEnv = new Set<string>();

  const nodesToScan =
    allNodes && allNodes.length > 0
      ? allNodes
      : useBackendCanvasStore.getState().nodes || [];

  const addEnvVar = (name?: string, desc?: string): void => {
    if (!name || typeof name !== "string") return;
    const clean = cleanEnvVarName(name);
    if (!clean || seenEnv.has(clean)) return;
    seenEnv.add(clean);
    envPaths.push({
      path: clean,
      type: "string",
      description: desc || "Environment variable (.env)",
    });
  };

  // Resolve target node (matching EnvVarCombobox logic)
  const targetNode = serviceNodeId
    ? nodesToScan.find((n) => n.id === serviceNodeId) ||
      nodesToScan.find((n) => n.data?.buckets?.some((b: { id?: string }) => b?.id === serviceNodeId))
    : nodesToScan.find((n) => n.type === "service");

  const configuredNodeVars = targetNode?.data?.envVars;

  if (Array.isArray(configuredNodeVars) && configuredNodeVars.length > 0) {
    configuredNodeVars.forEach((v: { id?: string; name?: string; description?: string }) => {
      if (v?.name && v.name.trim()) {
        addEnvVar(v.name, v.description);
      }
    });
  } else if (!serviceNodeId) {
    nodesToScan.forEach((n) => {
      const vars = n.data?.envVars;
      if (Array.isArray(vars)) {
        vars.forEach((v: { name?: string; description?: string }) => {
          if (v?.name && v.name.trim()) {
            addEnvVar(v.name, v.description);
          }
        });
      }
    });
  }

  return {
    id: "env",
    label: "Environment (.env)",
    kind: "env",
    rootVariableName: "process.env",
    paths: envPaths,
  };
}

/**
 * Resolves available properties on the auth session by inspecting:
 * 1. The canvas Auth node (authNode / AuthConfig):
 *    - authNode.data.session.claims (configured custom session claims)
 *    - authNode.data.plugins (e.g. organization -> orgId, orgRole; phoneNumber; payments -> plan, creemCustomerId)
 *    - authNode.data.betterAuthTableMapping.userEntityId (or userEntityId / userSchemaId)
 * 2. The User Entity node on the canvas (linked in AuthConfig or named "user"/"users") with its schema columns
 * 3. Standard built-in session token claims (sessionToken, expiresAt, id, userId, username, email, role, name)
 */
export function resolveAuthSessionPaths(allNodes: BackendNode[] = []): AvailablePath[] {
  const nodesToScan =
    allNodes && allNodes.length > 0
      ? allNodes
      : typeof window !== "undefined"
      ? useBackendCanvasStore.getState().nodes || []
      : [];

  const pathMap = new Map<string, AvailablePath>();

  const addPath = (path: string, type: string, description: string) => {
    if (!path || pathMap.has(path)) return;
    pathMap.set(path, { path, type, description });
  };

  // 1. Core authentication & token envelope claims
  addPath("username", "string", "Authenticated username");
  addPath("id", "string", "Authenticated user ID (sub)");
  addPath("userId", "string", "Authenticated user ID");
  addPath("email", "string", "Authenticated user email");
  addPath("role", "string", "User authorization role");
  addPath("name", "string", "User display name");
  addPath("sessionToken", "string", "Decrypted session token string");
  addPath("expiresAt", "number", "Session expiration timestamp (ms)");

  // Find Auth Node
  const authNode = nodesToScan.find((n) => n.type === "auth" || n.type === "identity_provider");
  const authData = authNode?.data;

  // 2. User Entity columns mapped in AuthConfig (AuthCoreEntitiesSection) or named "user" / "users"
  const userEntityId =
    authData?.tableMappings?.userEntityId ||
    authData?.userEntityId ||
    authData?.userSchemaId;

  const userEntity = userEntityId
    ? nodesToScan.find((n) => n.id === userEntityId && n.type === "entity")
    : nodesToScan.find(
        (n) =>
          n.type === "entity" &&
          (n.data?.label?.toLowerCase() === "user" ||
            n.data?.label?.toLowerCase() === "users" ||
            n.data?.tableName?.toLowerCase() === "user" ||
            n.data?.tableName?.toLowerCase() === "users"),
      );

  if (userEntity?.data?.columns && Array.isArray(userEntity.data.columns)) {
    userEntity.data.columns.forEach((col) => {
      if (col?.name) {
        const colType = (col.type || "string").toLowerCase();
        let tsType = "string";
        if (
          colType === "number" ||
          colType === "int" ||
          colType === "integer" ||
          colType === "float" ||
          colType === "bigint"
        ) {
          tsType = "number";
        } else if (colType === "boolean" || colType === "bool") {
          tsType = "boolean";
        } else if (
          colType === "json" ||
          colType === "jsonb" ||
          colType === "object"
        ) {
          tsType = "Record<string, string | number | boolean | null>";
        } else if (
          colType === "date" ||
          colType === "datetime" ||
          colType === "timestamp"
        ) {
          tsType = "Date | string";
        }
        addPath(
          col.name,
          tsType,
          col.description ||
            `User entity column (${userEntity.data?.label || "user"}.${col.name})`,
        );
      }
    });
  }

  // 3. Configured Session Claims from AuthConfig (AuthSessionSection)
  const configuredClaims = authData?.session?.claims;
  if (Array.isArray(configuredClaims)) {
    configuredClaims.forEach((claim) => {
      const key = claim?.key || claim?.targetValue;
      if (key) {
        addPath(
          key,
          "string",
          `Configured session claim (${claim.source || "authNode.session"})`,
        );
      }
    });
  }

  // 4. Auth Plugins (Organization, Payments, Phone, etc.)
  const plugins = authData?.plugins;
  const pluginList: string[] = Array.isArray(plugins) ? plugins : [];
  const org = authData?.organization;
  if (pluginList.includes("organization") || org?.enabled) {
    addPath("activeOrganizationId", "string", "Active workspace / organization ID");
    addPath("orgId", "string", "Organization ID alias");
    addPath("orgRole", "string", "Organization role (e.g. owner, admin, member)");
  }

  if (pluginList.includes("phoneNumber")) {
    addPath("phoneNumber", "string", "User verified phone number");
    addPath("phoneNumberVerified", "boolean", "Phone number verification status");
  }

  if (pluginList.includes("twoFactor")) {
    addPath("twoFactorEnabled", "boolean", "Two-factor authentication enabled status");
  }

  if (authData?.paymentsPlugin) {
    addPath("plan", "string", "Active payment subscription plan");
    addPath("creemCustomerId", "string", "Payment processor customer ID");
    addPath("subscriptionStatus", "string", "Active subscription status");
  }

  return Array.from(pathMap.values());
}

/**
 * Collects inbound endpoint / event payload sources (body, params, query, headers, event payload).
 */
export function getEndpointSources(
  endpoint?: Endpoint,
  consumedEvent?: AnyMessagingResource,
  allNodes: BackendNode[] = [],
): AvailableSource[] {
  const sources: AvailableSource[] = [];

  if (consumedEvent) {
    // 1. Event Payload
    const eventPayloadPaths: AvailablePath[] = [];
    if (consumedEvent.payloadSchema) {
      if (
        Array.isArray(consumedEvent.payloadSchema.fields) &&
        consumedEvent.payloadSchema.fields.length > 0
      ) {
        consumedEvent.payloadSchema.fields.forEach((f) => {
          if (f.name) {
            eventPayloadPaths.push({
              path: f.name,
              type: f.type,
              description: f.description,
            });
          }
        });
      }
      if (consumedEvent.payloadSchema.rawJson) {
        const parsed = parseSchemaJson(consumedEvent.payloadSchema.rawJson);
        if (parsed && typeof parsed === "object") {
          const jsonPaths = extractPathsFromObject(parsed);
          jsonPaths.forEach((jp) => {
            if (!eventPayloadPaths.some((bp) => bp.path === jp.path)) {
              eventPayloadPaths.push(jp);
            }
          });
        }
      }
    }
    sources.push({
      id: "event_payload",
      label: "Event Payload (payload)",
      kind: "req_body",
      rootVariableName: "payload",
      paths: eventPayloadPaths,
    });

    // 2. Event Transport Headers (decoded UTF-8 strings passed into handle<Event>(payload, headers))
    sources.push({
      id: "event_headers",
      label: "Event Headers (headers)",
      kind: "event_headers",
      rootVariableName: "headers",
      paths: [
        { path: "authorization", type: "string", description: "Forwarded Bearer JWT from Kafka producer" },
        { path: "x-auth-token", type: "string", description: "Custom auth token header" },
        { path: "x-correlation-id", type: "string", description: "Distributed trace / correlation ID" },
      ],
    });
  } else {
    // 1. Request Body
    const bodyPaths: AvailablePath[] = [];
    if (endpoint?.requestBody) {
      if (
        Array.isArray(endpoint.requestBody.fields) &&
        endpoint.requestBody.fields.length > 0
      ) {
        endpoint.requestBody.fields.forEach((f) => {
          if (f.name) {
            bodyPaths.push({
              path: f.name,
              type: f.type,
              description: f.description,
            });
          }
        });
      }
      if (endpoint.requestBody.rawJson) {
        const parsed = parseSchemaJson(endpoint.requestBody.rawJson);
        if (parsed && typeof parsed === "object") {
          const jsonPaths = extractPathsFromObject(parsed);
          jsonPaths.forEach((jp) => {
            if (!bodyPaths.some((bp) => bp.path === jp.path)) {
              bodyPaths.push(jp);
            }
          });
        }
      }
    }
    sources.push({
      id: "req_body",
      label: "Request Body (body)",
      kind: "req_body",
      rootVariableName: "req.body",
      paths: bodyPaths,
    });

    // 2. Route Path Parameters
    const pathParams: AvailablePath[] = [];
    if (Array.isArray(endpoint?.pathParams)) {
      endpoint.pathParams.forEach((p) => {
        if (p.name && !pathParams.some((pp) => pp.path === p.name)) {
          pathParams.push({
            path: p.name,
            type: p.type,
            description: p.description,
          });
        }
      });
    }
    sources.push({
      id: "req_params",
      label: "Path Parameters (req.params)",
      kind: "req_params",
      rootVariableName: "req.params",
      paths: pathParams,
    });

    // 3. Query Params
    const queryParams: AvailablePath[] = [];
    if (Array.isArray(endpoint?.queryParams)) {
      endpoint.queryParams.forEach((p) => {
        if (p.name) {
          queryParams.push({
            path: p.name,
            type: p.type,
            description: p.description,
          });
        }
      });
    }
    sources.push({
      id: "req_query",
      label: "Query Params (req.query)",
      kind: "req_query",
      rootVariableName: "req.query",
      paths: queryParams,
    });

    // 4. Headers
    const headerPaths: AvailablePath[] = [];
    if (Array.isArray(endpoint?.headers)) {
      endpoint.headers.forEach((h) => {
        if (h.name) {
          headerPaths.push({
            path: h.name,
            type: h.type,
            description: h.description,
          });
        }
      });
    }
    sources.push({
      id: "req_headers",
      label: "Request Headers",
      kind: "req_headers",
      rootVariableName: "req.headers",
      paths: headerPaths,
    });

    // 5. Authenticated Session / User (auth)
    const isAuth =
      endpoint?.requireAuth !== false ||
      Boolean(endpoint?.authRuleId) ||
      Boolean(
        endpoint?.headers?.some(
          (h) =>
            h.name?.toLowerCase() === "authorization" ||
            h.id === "auth-bearer-header",
        ),
      );

    if (isAuth) {
      sources.push({
        id: "auth",
        label: "Auth Session (auth)",
        kind: "auth",
        rootVariableName: "auth",
        paths: resolveAuthSessionPaths(allNodes),
      });
    }
  }

  return sources;
}
