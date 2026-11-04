import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { DEFAULT_BETTER_AUTH_VERSION, arePageRoutesEqual } from "@workspace/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile } from "@workspace/canvas/types";
import { PageInfo } from "./types";
import { compileAuth } from "../../../compileAuth";
import { generateAuthClient } from "../../../generators/auth-providers/better-auth/v1.6/generateAuthClient";

export interface GenerateAuthFilesParams {
  files: CompiledFile[];
  webClientNodes: BackendNode[];
  pagesInfo: PageInfo[];
  authNode?: BackendNode;
  endpoints?: (Endpoint & { nodeId: string })[];
  events?: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[];
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  testCases?: SimulationTestCase[];
}

/**
 * Resolves the specific AuthNode connected to a given WebAppNode (or its child WebClient pages).
 * Returns undefined if no AuthNode is connected to this WebApp.
 */
export function resolveConnectedAuthNode(
  webAppNode?: BackendNode,
  webClientNodes: BackendNode[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): BackendNode | undefined {
  const authNodes = allNodes.filter((n) => n.type === "auth");
  if (authNodes.length === 0) return undefined;

  // 1. Check direct connection to webAppNode
  if (webAppNode) {
    if (webAppNode.data?.authNodeId) {
      const match = authNodes.find((a) => a.id === webAppNode.data.authNodeId);
      if (match) return match;
    }

    const connectedEdge = allEdges.find((e) => {
      const connectsWebApp = e.source === webAppNode.id || e.target === webAppNode.id;
      if (!connectsWebApp) return false;
      const otherId = e.source === webAppNode.id ? e.target : e.source;
      return authNodes.some((a) => a.id === otherId);
    });

    if (connectedEdge) {
      const authId = connectedEdge.source === webAppNode.id ? connectedEdge.target : connectedEdge.source;
      const match = authNodes.find((a) => a.id === authId);
      if (match) return match;
    }
  }

  // 2. Check connection via any of the webClient page nodes
  const pageIds = new Set(webClientNodes.map((w) => w.id));
  for (const page of webClientNodes) {
    if (page.data?.authNodeId) {
      const match = authNodes.find((a) => a.id === page.data.authNodeId);
      if (match) return match;
    }
  }

  const pageEdge = allEdges.find((e) => {
    const connectsPage = pageIds.has(e.source) || pageIds.has(e.target);
    if (!connectsPage) return false;
    const otherId = pageIds.has(e.source) ? e.target : e.source;
    return authNodes.some((a) => a.id === otherId);
  });

  if (pageEdge) {
    const authId = pageIds.has(pageEdge.source) ? pageEdge.target : pageEdge.source;
    const match = authNodes.find((a) => a.id === authId);
    if (match) return match;
  }

  // 3. Fallback only if there are NO explicit WebApp nodes on the canvas
  // and there is a single auth node on the canvas
  // Fallback: If only 1 auth node exists on the canvas, use it for the web app
  if (authNodes.length === 1) {
    return authNodes[0];
  }

  return undefined;
}

/**
 * Generates Auth server endpoints, client SDKs, authorization middleware helpers, and package dependencies
 * ONLY if an AuthNode is explicitly connected to this WebApp.
 */
export function generateAuthFilesAndDependencies({
  files,
  webClientNodes,
  pagesInfo,
  authNode,
  endpoints = [],
  events = [],
  allNodes = [],
  allEdges = [],
  testCases = [],
}: GenerateAuthFilesParams): void {
  // Generate Better Auth server files and SDK ONLY when an AuthNode is connected
  if (authNode) {
    const authPort = String(authNode.data?.port || "3000");
    const authBaseUrl = authNode.data?.baseUrl || `http://localhost:${authPort}`;
    const compiledAuth = compileAuth(authNode, endpoints, events, allNodes, allEdges, testCases);

    const authFile = compiledAuth.files.find((f) => f.filename.endsWith("auth.ts"));
    if (authFile) {
      files.push({
        filename: "lib/auth.ts",
        language: "typescript",
        content: authFile.content,
      });
    }

    files.push({
      filename: "app/api/auth/[...all]/route.ts",
      language: "typescript",
      content: `import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const dynamic = "force-dynamic";

export const { POST, GET } = toNextJsHandler(auth);
`,
    });

    const envFile = compiledAuth.files.find((f) => f.filename.endsWith(".env"));
    if (envFile) {
      const mergeEnvContent = (existingContent: string, newContent: string) => {
        const existingKeys = new Set(
          existingContent
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#") && l.includes("="))
            .map((l) => l.split("=")[0]!.trim()),
        );

        const linesToAdd: string[] = [];
        for (const line of newContent.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const key = trimmed.split("=")[0]?.trim();
          if (!key) continue;

          // Never overwrite an existing DATABASE_URL or DATABASE_PATH
          if ((key === "DATABASE_URL" || key === "DATABASE_PATH") && existingKeys.has(key)) {
            continue;
          }

          if (!existingKeys.has(key)) {
            linesToAdd.push(trimmed);
            existingKeys.add(key);
          }
        }

        if (linesToAdd.length === 0) return existingContent;
        return (
          existingContent.trimEnd() +
          "\n\n# Better Auth Configuration\n" +
          linesToAdd.join("\n") +
          "\n"
        );
      };

      const existingEnvIdx = files.findIndex((f) => f.filename === ".env");
      if (existingEnvIdx !== -1) {
        files[existingEnvIdx]!.content = mergeEnvContent(
          files[existingEnvIdx]!.content,
          envFile.content,
        );
      } else {
        files.push({
          filename: ".env",
          language: "dotenv",
          content: envFile.content,
        });
      }

      const existingEnvExIdx = files.findIndex((f) => f.filename === ".env.example");
      if (existingEnvExIdx !== -1) {
        files[existingEnvExIdx]!.content = mergeEnvContent(
          files[existingEnvExIdx]!.content,
          envFile.content,
        );
      } else {
        files.push({
          filename: ".env.example",
          language: "dotenv",
          content: envFile.content,
        });
      }
    }

    const enabledPlugins = authNode.data?.plugins || ["admin", "organization"];
    const clientPlugins: string[] = [];
    if (enabledPlugins.includes("admin")) clientPlugins.push("adminClient");
    if (enabledPlugins.includes("organization")) clientPlugins.push("organizationClient");
    if (clientPlugins.length === 0) {
      clientPlugins.push("adminClient", "organizationClient");
    }

    files.push({
      filename: "lib/auth-client.ts",
      language: "typescript",
      content: generateAuthClient({
        baseURL: authBaseUrl,
        plugins: clientPlugins,
      }),
    });

    const redirects = authNode.data?.redirects || {};
    const resolveRedirect = (nodeId?: string, fallbackUrl?: string, defaultFallback: string = "/") => {
      if (fallbackUrl) {
        const cleanFallback = fallbackUrl.startsWith("/") ? fallbackUrl : `/${fallbackUrl}`;
        if (nodeId && pagesInfo) {
          const matched = pagesInfo.find((p) => p.nodeId === nodeId);
          if (
            matched &&
            (arePageRoutesEqual(matched.routePath, cleanFallback) ||
              arePageRoutesEqual(matched.label, cleanFallback))
          ) {
            return matched.routePath;
          }
        }
        return cleanFallback;
      }
      if (nodeId && pagesInfo) {
        const matched = pagesInfo.find((p) => p.nodeId === nodeId);
        if (matched) return matched.routePath;
      }
      return defaultFallback;
    };

    const defaultSignIn = resolveRedirect(redirects.signInPageNodeId, redirects.signInPageUrl, "/login");
    const defaultUnauthorized = resolveRedirect(redirects.unauthorizedNodeId, redirects.unauthorizedUrl, "/unauthorized");
    const defaultPricing = resolveRedirect(redirects.pricingNodeId, redirects.pricingUrl, "/pricing");

    // Reusable Server Authorization Helpers under lib/auth/
    files.push({
      filename: "lib/auth/require-session.ts",
      language: "typescript",
      content: `import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function requireSession(redirectTo: string = "${defaultSignIn}") {
  let session = null;
  try {
    session = await auth.api.getSession({
      headers: await headers(),
    });
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && String(Reflect.get(err, "digest")).startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    session = null;
  }

  if (!session || !session.user || !session.user.id) {
    redirect(redirectTo);
  }

  return session;
}
`,
    });

    files.push({
      filename: "lib/auth/require-role.ts",
      language: "typescript",
      content: `import { requireSession } from "./require-session";
import { redirect } from "next/navigation";

export async function requireRole(allowedRoles: string[], redirectTo: string = "${defaultUnauthorized}") {
  const session = await requireSession();
  const role = ("role" in session.user && typeof session.user.role === "string")
    ? session.user.role
    : "user";

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    redirect(redirectTo);
  }

  return session;
}
`,
    });

    files.push({
      filename: "lib/auth/require-org-role.ts",
      language: "typescript",
      content: `import { requireSession } from "./require-session";
import { redirect } from "next/navigation";

export async function requireOrgRole(allowedOrgRoles: string[], redirectTo: string = "${defaultUnauthorized}") {
  const session = await requireSession();
  const sessionRole = "activeOrgRole" in session.session && typeof session.session.activeOrgRole === "string"
    ? session.session.activeOrgRole
    : undefined;
  const userRole = "orgRole" in session.user && typeof session.user.orgRole === "string"
    ? session.user.orgRole
    : undefined;
  const activeOrgRole = sessionRole || userRole;

  if (allowedOrgRoles.length > 0 && (!activeOrgRole || !allowedOrgRoles.includes(activeOrgRole))) {
    redirect(redirectTo);
  }

  return session;
}
`,
    });

    files.push({
      filename: "lib/auth/require-plan.ts",
      language: "typescript",
      content: `import { requireSession } from "./require-session";
import { redirect } from "next/navigation";

export async function requirePlan(requiredPlans: string[], redirectTo: string = "${defaultPricing}") {
  const session = await requireSession();
  const sessionPlan = "plan" in session.session && typeof session.session.plan === "string"
    ? session.session.plan
    : undefined;
  const userPlan = "plan" in session.user && typeof session.user.plan === "string"
    ? session.user.plan
    : undefined;
  const plan = sessionPlan || userPlan || "free";

  if (requiredPlans.length > 0 && !requiredPlans.includes(plan)) {
    redirect(redirectTo);
  }

  return session;
}
`,
    });

    // Add better-auth and database adapter dependencies to package.json
    const pkgFileIdx = files.findIndex((f) => f.filename === "package.json");
    if (pkgFileIdx !== -1) {
      try {
        const pkgObj = JSON.parse(files[pkgFileIdx]!.content);
        pkgObj.dependencies = pkgObj.dependencies || {};
        pkgObj.devDependencies = pkgObj.devDependencies || {};
        pkgObj.scripts = pkgObj.scripts || {};

        const rawVersion = authNode.data?.version || DEFAULT_BETTER_AUTH_VERSION;
        const cleanVersion = rawVersion.replace(/^v/, "");
        const semverVersion = cleanVersion.split(".").length === 2 ? `${cleanVersion}.0` : cleanVersion;
        pkgObj.dependencies["@workspace/db"] = "workspace:*";
        pkgObj.dependencies["@workspace/types"] = "workspace:*";
        pkgObj.dependencies["better-auth"] = `^${semverVersion}`;
        if (authNode.data?.plugins?.includes("passkey")) {
          pkgObj.dependencies["@better-auth/passkey"] = `^${semverVersion}`;
        }
        pkgObj.devDependencies["@better-auth/cli"] = `^${semverVersion}`;
        pkgObj.dependencies["dotenv"] = "^16.4.5";
        pkgObj.dependencies["zod"] = "^3.24.2";
        pkgObj.scripts["db:migrate"] = "npx @better-auth/cli migrate -y";
        delete pkgObj.scripts["predev"];
        delete pkgObj.scripts["prestart"];

        const dbAdapterKey = String(authNode.data?.dbAdapter || "sqlite-raw");
        if (
          dbAdapterKey === "sqlite-raw" ||
          dbAdapterKey === "sqlite" ||
          dbAdapterKey === "default"
        ) {
          pkgObj.dependencies["better-sqlite3"] = "^12.0.0";
          pkgObj.dependencies["@libsql/client"] = "^0.14.0";
          pkgObj.devDependencies["@types/better-sqlite3"] = "^7.6.12";
          pkgObj.devDependencies["prebuild-install"] = "^7.1.3";
          pkgObj.scripts["postinstall"] = "prebuild-install || node -e \"try { const p = require('path').dirname(require.resolve('better-sqlite3/package.json')); require('child_process').execSync('npx prebuild-install', {cwd: p, stdio: 'inherit'}); } catch (e) {}\"";
        } else if (dbAdapterKey === "drizzle") {
          pkgObj.dependencies["drizzle-orm"] = "^0.30.0";
        } else if (dbAdapterKey === "prisma") {
          pkgObj.dependencies["@prisma/client"] = "^5.10.0";
          pkgObj.devDependencies["prisma"] = "^5.10.0";
        }

        files[pkgFileIdx]!.content = JSON.stringify(pkgObj, null, 2);
      } catch (err) {
        // preserve existing content on parse failure
      }
    }

    // Generate client auth token helper for API calls when auth is connected
    files.push({
      filename: "lib/auth-token.ts",
      language: "typescript",
      content: `/**
 * Helper to retrieve the Bearer authorization token for client API requests.
 * Checks active Better Auth session, cookies, localStorage, and sessionStorage.
 */
export async function getAuthBearerToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 1. Check active Better Auth client session
  try {
    const { authClient } = await import("@/lib/auth-client");
    if (authClient && typeof authClient.getSession === "function") {
      const sessionRes = await authClient.getSession();
      const rawData = sessionRes?.data;
      const directToken = rawData && typeof rawData === "object" && "token" in rawData && typeof rawData.token === "string"
        ? rawData.token
        : undefined;
      const token = sessionRes?.data?.session?.token || directToken;
      if (token) {
        return token.startsWith("Bearer ") ? token : \`Bearer \${token}\`;
      }
    }
  } catch (_e) {}

  // 2. Check cookies for Better Auth session token (better-auth.session_token)
  try {
    const cookies = document.cookie.split(";");
    for (const c of cookies) {
      const trimmed = c.trim();
      if (
        trimmed.startsWith("better-auth.session_token=") ||
        trimmed.startsWith("__Secure-better-auth.session_token=")
      ) {
        const val = trimmed.split("=")[1];
        if (val) {
          const decoded = decodeURIComponent(val);
          return decoded.startsWith("Bearer ") ? decoded : \`Bearer \${decoded}\`;
        }
      }
    }
  } catch (_cErr) {}

  // 3. Check browser localStorage & sessionStorage
  const tokenKeys = [
    "better-auth.session_token",
    "auth_token",
    "access_token",
    "token",
    "bearer_token",
  ];

  for (const k of tokenKeys) {
    const stored = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (stored) {
      return stored.startsWith("Bearer ") ? stored : \`Bearer \${stored}\`;
    }
  }

  return null;
}
`,
    });
  }

  // Also ensure lib/auth-token.ts is generated when any WebPage is on a protected route or has auth step bindings
  const hasStepAuthAnywhere = webClientNodes.some((node) => {
    const rawSections = Array.isArray(node.data?.sections) ? node.data.sections : [];
    return rawSections.some((sec) => {
      if (!sec || typeof sec !== "object" || !("actions" in sec) || !Array.isArray(sec.actions)) {
        return false;
      }
      return sec.actions.some((act) => {
        if (!act || typeof act !== "object" || !("actionSteps" in act) || !Array.isArray(act.actionSteps)) {
          return false;
        }
        return act.actionSteps.some((s) => {
          if (!s || typeof s !== "object" || !("type" in s) || s.type !== "api_call") {
            return false;
          }
          const bindings = Array.isArray(s.requestBindings) ? s.requestBindings : [];
          return bindings.some((b) => {
            if (!b || typeof b !== "object") return false;
            const targetField = typeof b.targetField === "string" ? b.targetField.toLowerCase() : "";
            const slot = typeof b.slot === "string" ? b.slot : "";
            const sourceKind = b.source && typeof b.source === "object" && "kind" in b.source ? b.source.kind : "";
            return (
              (slot === "header" || !slot) &&
              (sourceKind === "auth_token" ||
                targetField === "authorization" ||
                targetField === "auth-bearer-header")
            );
          });
        });
      });
    });
  });

  const hasProtectedPage =
    hasStepAuthAnywhere ||
    pagesInfo.some((p) => p.accessType !== "public") ||
    webClientNodes.some(
      (n) =>
        n.data?.requireAuth === true ||
        (n.data?.useZoneDefault === false &&
          n.data?.protectionOverride?.accessType === "protected"),
    );

  if (hasProtectedPage && !files.some((f) => f.filename === "lib/auth-token.ts")) {
    files.push({
      filename: "lib/auth-token.ts",
      language: "typescript",
      content: `/**
 * Helper to retrieve the Bearer authorization token for client API requests.
 * Checks active Better Auth session, cookies, localStorage, and sessionStorage.
 */
export async function getAuthBearerToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 1. Check active Better Auth client session
  try {
    const { authClient } = await import("@/lib/auth-client");
    if (authClient && typeof authClient.getSession === "function") {
      const sessionRes = await authClient.getSession();
      const rawData = sessionRes?.data;
      const directToken = rawData && typeof rawData === "object" && "token" in rawData && typeof rawData.token === "string"
        ? rawData.token
        : undefined;
      const token = sessionRes?.data?.session?.token || directToken;
      if (token) {
        return token.startsWith("Bearer ") ? token : \`Bearer \${token}\`;
      }
    }
  } catch (_e) {}

  // 2. Check cookies for Better Auth session token (better-auth.session_token)
  try {
    const cookies = document.cookie.split(";");
    for (const c of cookies) {
      const trimmed = c.trim();
      if (
        trimmed.startsWith("better-auth.session_token=") ||
        trimmed.startsWith("__Secure-better-auth.session_token=")
      ) {
        const val = trimmed.split("=")[1];
        if (val) {
          const decoded = decodeURIComponent(val);
          return decoded.startsWith("Bearer ") ? decoded : \`Bearer \${decoded}\`;
        }
      }
    }
  } catch (_cErr) {}

  // 3. Check browser localStorage & sessionStorage
  const tokenKeys = [
    "better-auth.session_token",
    "auth_token",
    "access_token",
    "token",
    "bearer_token",
  ];

  for (const k of tokenKeys) {
    const stored = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (stored) {
      return stored.startsWith("Bearer ") ? stored : \`Bearer \${stored}\`;
    }
  }

  return null;
}
`,
    });
  }
}

/**
 * Ensures workspace DB dependencies are included only if entity, database, or db_ref nodes exist
 */
export function ensureDatabaseDependencies(
  files: CompiledFile[],
  allNodes: BackendNode[] = [],
): void {
  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
  const entityNodes = allNodes.filter(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      n.data?.dbType !== "redis",
  );
  const authNodes = allNodes.filter((n) => n.type === "auth");
  const paymentsNodes = allNodes.filter((n) => n.type === "payments");

  const hasDatabaseNodes =
    dbNodes.length > 0 || entityNodes.length > 0 || authNodes.length > 0 || paymentsNodes.length > 0;

  if (hasDatabaseNodes) {
    const pkgFileIdx = files.findIndex((f) => f.filename === "package.json");
    if (pkgFileIdx !== -1) {
      try {
        const pkgObj = JSON.parse(files[pkgFileIdx]!.content);
        pkgObj.dependencies = pkgObj.dependencies || {};
        pkgObj.devDependencies = pkgObj.devDependencies || {};
        const isSingleDb = dbNodes.length <= 1;
        const dbPkgName = isSingleDb
          ? "@workspace/db"
          : `@workspace/db-${(dbNodes[0]?.data?.label || "db").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        pkgObj.dependencies[dbPkgName] = "workspace:*";
        pkgObj.dependencies["@workspace/types"] = "workspace:*";

        const primaryEngine = (
          dbNodes[0]?.data?.dbEngine ||
          dbNodes[0]?.data?.provider ||
          "sqlite"
        ).toLowerCase();

        if (primaryEngine.includes("sqlite") || dbNodes.length === 0) {
          pkgObj.dependencies["better-sqlite3"] = "^12.0.0";
          pkgObj.devDependencies["@types/better-sqlite3"] = "^7.6.12";
        }
        files[pkgFileIdx]!.content = JSON.stringify(pkgObj, null, 2);
      } catch (err) {
        // preserve
      }
    }
  }
}
