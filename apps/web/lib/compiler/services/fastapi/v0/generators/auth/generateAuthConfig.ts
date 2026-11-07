import {
  CanvasAuthNodeData,
  DEFAULT_BETTER_AUTH_VERSION,
  EndpointHookConfig,
  DbHookConfig,
  AuthHookConfig,
  SessionClaimConfig,
} from "@workspace/canvas";

export interface AdapterConfig {
  importStatement: string;
  adapterCall: string;
}

export const DEFAULT_SQLITE_CONFIG: AdapterConfig = {
  importStatement: `import Database from "better-sqlite3";\n`,
  adapterCall: `new Database(process.env.DATABASE_URL || "sqlite.db")`,
};

export const ADAPTER_REGISTRY: Record<string, Record<string, AdapterConfig>> = {
  default: {
    "sqlite-raw": DEFAULT_SQLITE_CONFIG,
    sqlite: DEFAULT_SQLITE_CONFIG,
    postgres: {
      importStatement: `import { Pool } from "pg";\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n`,
      adapterCall: `pool`,
    },
    postgresql: {
      importStatement: `import { Pool } from "pg";\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n`,
      adapterCall: `pool`,
    },
    pg: {
      importStatement: `import { Pool } from "pg";\nconst pool = new Pool({\n  connectionString: process.env.DATABASE_URL,\n});\n`,
      adapterCall: `pool`,
    },
    drizzle: {
      importStatement: `import { drizzleAdapter } from "better-auth/adapters/drizzle";\nimport { db } from "./db";`,
      adapterCall: `drizzleAdapter(db, {\n    provider: "pg",\n  })`,
    },
    prisma: {
      importStatement: `import { prismaAdapter } from "better-auth/adapters/prisma";\nimport { PrismaClient } from "@prisma/client";\nconst prisma = new PrismaClient();`,
      adapterCall: `prismaAdapter(prisma, {\n    provider: "postgresql",\n  })`,
    },
    custom: {
      importStatement: `// Custom database adapter configuration`,
      adapterCall: `/* custom DB adapter */`,
    },
  },
};

export function getAdapterConfig(version: string, adapterKey: string): AdapterConfig {
  const majorVersion = version.split(".")[0] + ".x";
  const versionRegistry = ADAPTER_REGISTRY[majorVersion] || ADAPTER_REGISTRY.default;
  const config = (versionRegistry && versionRegistry[adapterKey]) || DEFAULT_SQLITE_CONFIG;
  return config;
}

export type AuthNodeData = CanvasAuthNodeData & { label?: string };

/**
 * Generates the core `src/auth.ts` file for Better Auth
 */
export function generateAuthConfig(data: AuthNodeData): string {
  const version = data.version || DEFAULT_BETTER_AUTH_VERSION;
  const dbAdapterKey = data.dbAdapter || "sqlite-raw";
  const adapterConfig = getAdapterConfig(version, dbAdapterKey);

  const pluginImports = new Set<string>();
  const pluginCalls: string[] = [];

  // Always enable bearer plugin for API verification
  pluginImports.add("bearer");
  pluginCalls.push("bearer()");

  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];

  if (enabledPlugins.includes("admin")) {
    pluginImports.add("admin");
    pluginCalls.push("admin()");
  }

  if (enabledPlugins.includes("twoFactor")) {
    pluginImports.add("twoFactor");
    pluginCalls.push("twoFactor()");
  }

  let passkeyImportStr = "";
  if (enabledPlugins.includes("passkey")) {
    passkeyImportStr = `import { passkey } from "@better-auth/passkey";\n`;
    pluginCalls.push("passkey()");
  }

  if (enabledPlugins.includes("magicLink")) {
    pluginImports.add("magicLink");
    pluginCalls.push("magicLink()");
  }

  if (enabledPlugins.includes("emailOtp")) {
    pluginImports.add("emailOtp");
    pluginCalls.push("emailOtp()");
  }

  if (enabledPlugins.includes("username")) {
    pluginImports.add("username");
    pluginCalls.push("username()");
  }

  if (enabledPlugins.includes("phoneNumber")) {
    pluginImports.add("phoneNumber");
    pluginCalls.push("phoneNumber()");
  }

  if (enabledPlugins.includes("apiKey")) {
    pluginImports.add("apiKey");
    pluginCalls.push("apiKey()");
  }

  if (enabledPlugins.includes("jwt")) {
    pluginImports.add("jwt");
    pluginCalls.push("jwt()");
  }

  if (enabledPlugins.includes("multiSession")) {
    pluginImports.add("multiSession");
    pluginCalls.push("multiSession()");
  }

  if (enabledPlugins.includes("sso")) {
    pluginImports.add("oidcProvider");
    pluginCalls.push("oidcProvider()");
  }

  // Organization plugin configuration
  const org = data.organization;
  if (org?.enabled !== false && (enabledPlugins.includes("organization") || org?.enabled)) {
    pluginImports.add("organization");
    const teamsEnabled = Boolean(org?.teams);
    pluginCalls.push(
      `organization({\n    teams: {\n      enabled: ${teamsEnabled},\n    },\n    allowUserToCreateOrganization: ${Boolean(org?.multiOrg ?? true)},\n  })`
    );
  }

  // customSession plugin configuration for session claims
  const sessionConfig = data.session;
  const sessionClaims: SessionClaimConfig[] = sessionConfig?.claims || [];
  const customSessionClaims = sessionClaims.filter(
    (c: SessionClaimConfig) => c.deliveryMode === "session" || c.destination === "session"
  );

  if (customSessionClaims.length > 0) {
    pluginImports.add("customSession");
    const claimFields = customSessionClaims
      .map((claim: SessionClaimConfig) => {
        const key = claim.key || "claim";
        if (claim.source === "orgRole") {
          return `        ${key}: session.activeOrganizationId ? "member" : undefined,`;
        }
        return `        ${key}: "${claim.targetValue || "default_value"}", // Resolved from ${claim.source}`;
      })
      .join("\n");

    pluginCalls.push(
      `customSession(async ({ user, session }) => {\n    return {\n      user,\n      session: {\n        ...session,\n${claimFields}\n      },\n    };\n  })`
    );
  }

  // Process Endpoint Hooks (hooks.before & hooks.after)
  const hooks: AuthHookConfig[] = data.hooks || [];
  const endpointHooks = hooks.filter(
    (h: AuthHookConfig): h is EndpointHookConfig => h.hookType === "endpoint" || ("event" in h && !("model" in h))
  );

  const beforeHooks = endpointHooks.filter((h: EndpointHookConfig) => h.phase === "before");
  const afterHooks = endpointHooks.filter((h: EndpointHookConfig) => (h.phase || "after") === "after");

  const buildPhaseMiddleware = (phaseHooks: EndpointHookConfig[], phaseName: "before" | "after") => {
    if (phaseHooks.length === 0) return null;

    const branches = phaseHooks.map((h, i) => {
      const path = h.event || "/sign-up";
      const condition = i === 0 ? `if (ctx.path === "${path}")` : `else if (ctx.path === "${path}")`;
      let body = "";
      if (h.mode === "code" && h.code) {
        body = h.code;
      } else {
        const promptComment = h.prompt ? `// ${h.prompt}\n        ` : "";
        body = phaseName === "before"
          ? `${promptComment}if (!ctx.body) {\n          throw new Error("Invalid request payload");\n        }`
          : `${promptComment}// Executed after ${path}\n        console.log("${phaseName} hook for ${path}");`;
      }
      return `      ${condition} {\n        ${body}\n      }`;
    }).join(" ");

    return `createAuthMiddleware(async (ctx) => {\n${branches}\n    })`;
  };

  const beforeMiddleware = buildPhaseMiddleware(beforeHooks, "before");
  const afterMiddleware = buildPhaseMiddleware(afterHooks, "after");

  let hooksBlock = "";
  if (beforeMiddleware || afterMiddleware) {
    const parts: string[] = [];
    if (beforeMiddleware) parts.push(`    before: ${beforeMiddleware}`);
    if (afterMiddleware) parts.push(`    after: ${afterMiddleware}`);
    hooksBlock = `\n  hooks: {\n${parts.join(",\n")}\n  },`;
  }

  // Process Database Hooks (databaseHooks.model.op.phase)
  const dbHooks = hooks.filter((h: AuthHookConfig): h is DbHookConfig => h.hookType === "db" || "model" in h);
  let databaseHooksBlock = "";
  if (dbHooks.length > 0) {
    const modelTree: Record<string, Record<string, Record<string, string>>> = {};
    for (const h of dbHooks) {
      const model = h.model || "user";
      const op = h.operation || "create";
      const phase = h.phase || "after";
      let code = "";
      if (h.mode === "code" && h.code) {
        code = h.code;
      } else {
        const comment = h.prompt ? `// ${h.prompt}\n            ` : "";
        code = `async (${model}, ctx) => {\n            ${comment}// Post-${op} side effect for ${model}\n          }`;
      }

      if (!modelTree[model]) modelTree[model] = {};
      if (!modelTree[model][op]) modelTree[model][op] = {};
      modelTree[model][op][phase] = code;
    }

    const modelEntries = Object.entries(modelTree).map(([model, ops]) => {
      const opEntries = Object.entries(ops).map(([op, phases]) => {
        const phaseEntries = Object.entries(phases).map(([phase, code]) => `${phase}: ${code}`).join(",\n        ");
        return `      ${op}: {\n        ${phaseEntries}\n      }`;
      }).join(",\n");
      return `    ${model}: {\n${opEntries}\n    }`;
    }).join(",\n");

    databaseHooksBlock = `\n  databaseHooks: {\n${modelEntries}\n  },`;
  }

  // Providers Configuration
  const emailPassword = data.providers?.emailPassword;
  let emailPasswordBlock = "";
  if (emailPassword?.enabled !== false) {
    emailPasswordBlock = `\n  emailAndPassword: {\n    enabled: true,\n    requireEmailVerification: ${Boolean(emailPassword?.requireVerification)},\n    minPasswordLength: ${emailPassword?.minLength || 8},\n  },`;
  }

  // OAuth Social Providers
  const oauthProviders = data.providers?.oauth || [];
  let socialProvidersBlock = "";
  if (oauthProviders.length > 0) {
    const providersList = oauthProviders.map((p) => {
      const providerName = p.provider || "google";
      const clientIdEnv = p.clientIdEnv || `${providerName.toUpperCase()}_CLIENT_ID`;
      const clientSecretEnv = p.clientSecretEnv || `${providerName.toUpperCase()}_CLIENT_SECRET`;
      return `    ${providerName}: {\n      clientId: process.env.${clientIdEnv} || "",\n      clientSecret: process.env.${clientSecretEnv} || "",\n    }`;
    }).join(",\n");
    socialProvidersBlock = `\n  socialProviders: {\n${providersList}\n  },`;
  }

  // Account Linking
  const accountLinking = data.providers?.accountLinking;
  let accountLinkingBlock = "";
  if (accountLinking) {
    const policy = accountLinking.policy || "merge";
    if (policy === "prompt") {
      accountLinkingBlock = `\n  account: {\n    accountLinking: {\n      enabled: true,\n      disableImplicitLinking: true,\n    },\n  },`;
    } else if (policy === "block") {
      accountLinkingBlock = `\n  account: {\n    accountLinking: {\n      enabled: false,\n    },\n  },`;
    } else {
      accountLinkingBlock = `\n  account: {\n    accountLinking: {\n      enabled: true,\n    },\n  },`;
    }
  }

  // Session Config
  let sessionBlock = "";
  if (sessionConfig) {
    const cookieCache = sessionConfig.cookieCache;
    const cookieCachePart = cookieCache?.enabled === true
      ? `\n    cookieCache: {\n      enabled: true,\n      maxAge: ${cookieCache?.maxAgeSeconds ?? 300},\n    },`
      : `\n    cookieCache: {\n      enabled: false,\n    },`;

    sessionBlock = `\n  session: {\n    expiresIn: ${sessionConfig.expiresInSeconds ?? 604800},\n    updateAge: ${sessionConfig.updateAgeSeconds ?? 86400},${cookieCachePart}\n  },`;
  } else {
    sessionBlock = `\n  session: {\n    expiresIn: 604800,\n    updateAge: 86400,\n    cookieCache: {\n      enabled: false,\n    },\n  },`;
  }

  // Trusted Origins
  const trustedOrigins = data.trustedOrigins || ["http://localhost:3000", "http://localhost:5173"];
  const trustedOriginsBlock = `\n  trustedOrigins: ${JSON.stringify(trustedOrigins)},`;

  // Secret Key
  const secretBlock = `\n  secret: process.env.BETTER_AUTH_SECRET || "default_super_secret_key_change_in_production",`;
  const baseUrlBlock = `\n  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3001",`;
  const basePathBlock = `\n  basePath: "/api/auth",`;

  // Build Plugin Import Statements
  const pluginImportArr = Array.from(pluginImports);
  const pluginImportStr = pluginImportArr.length > 0
    ? `import { ${pluginImportArr.join(", ")} } from "better-auth/plugins";\n`
    : "";

  const createMiddlewareImport = (beforeMiddleware || afterMiddleware)
    ? `import { createAuthMiddleware } from "better-auth/api";\n`
    : "";

  // Advanced Database Configuration (UUID generation for PostgreSQL)
  const isPostgres =
    (data.dbEngine || "").toLowerCase().includes("postgres") ||
    (data.dbEngine || "").toLowerCase().includes("pg") ||
    dbAdapterKey.toLowerCase().includes("postgres") ||
    dbAdapterKey.toLowerCase().includes("pg") ||
    dbAdapterKey === "drizzle" ||
    dbAdapterKey === "prisma";

  const generateId =
    data.generateId ||
    (isPostgres ? "uuid" : undefined);

  const dbConfigLines: string[] = [];
  if (generateId === "uuid") {
    dbConfigLines.push("generateId: () => crypto.randomUUID(),");
  } else if (generateId) {
    dbConfigLines.push(`generateId: ${JSON.stringify(generateId)},`);
  }

  // Disable strict schema mismatch checks so pre-existing or auto-migrated tables
  // do not crash on startup with BetterAuthError Database schema mismatch (SCHEMA_MISMATCH)
  const validateSchema = data.validateSchema ?? false;
  if (!validateSchema) {
    dbConfigLines.push("validateSchema: false,");
  }

  let advancedBlock = "";
  if (dbConfigLines.length > 0) {
    advancedBlock = `\n  advanced: {\n    database: {\n      ${dbConfigLines.join("\n      ")}\n    },\n  },`;
  }

  return `import { betterAuth } from "better-auth";
${adapterConfig.importStatement}
${createMiddlewareImport}${pluginImportStr}${passkeyImportStr}export const auth = betterAuth({
  database: ${adapterConfig.adapterCall},${secretBlock}${baseUrlBlock}${basePathBlock}${emailPasswordBlock}${socialProvidersBlock}${accountLinkingBlock}${sessionBlock}${trustedOriginsBlock}${hooksBlock}${databaseHooksBlock}${advancedBlock}
  plugins: [
    ${pluginCalls.join(",\n    ")}
  ],
});

export type Auth = typeof auth;
`;
}
