export interface BetterAuthClientOptions {
  baseUrl?: string;
  baseURL?: string;
  plugins?: string[];
  /** Pass true when AuthNode defines custom admin user roles/defaults in auth-permissions.ts */
  customAdminRbac?: boolean;
  /** Pass true when AuthNode defines custom organization roles in auth-permissions.ts */
  customOrgRbac?: boolean;
}

export function generateAuthClient(options: BetterAuthClientOptions = {}): string {
  const baseUrl = options.baseURL || options.baseUrl || "http://localhost:3000";
  const plugins =
    options.plugins && options.plugins.length > 0
      ? options.plugins
      : ["adminClient", "organizationClient"];

  const hasPasskey = plugins.some((p) => p === "passkey" || p === "passkeyClient");
  const standardPlugins = plugins.filter(
    (p) => p !== "passkey" && p !== "passkeyClient"
  );

  const standardPluginImports =
    standardPlugins.length > 0
      ? `\nimport { ${standardPlugins.join(", ")} } from "better-auth/client/plugins";`
      : "";
  const passkeyImport = hasPasskey
    ? `\nimport { passkeyClient } from "@better-auth/passkey/client";`
    : "";

  const permissionImports: string[] = [];
  const allPluginCalls = [
    ...standardPlugins.map((p) => {
      if (p === "adminClient" && options.customAdminRbac) {
        permissionImports.push("adminAcInstance", "adminRolesMap");
        return `    adminClient({ ac: adminAcInstance, roles: adminRolesMap }),`;
      }
      if (p === "organizationClient" && options.customOrgRbac) {
        permissionImports.push("orgAcInstance", "orgRolesMap");
        return `    organizationClient({ ac: orgAcInstance, roles: orgRolesMap }),`;
      }
      return `    ${p}(),`;
    }),
    ...(hasPasskey ? ["    passkeyClient(),"] : []),
  ];

  const permissionsImport =
    permissionImports.length > 0
      ? `\nimport { ${permissionImports.join(", ")} } from "./auth-permissions";`
      : "";

  const pluginEntries =
    allPluginCalls.length > 0
      ? `\n  plugins: [\n${allPluginCalls.join("\n")}\n  ],`
      : "";

  return `import { createAuthClient } from "better-auth/react";${standardPluginImports}${passkeyImport}${permissionsImport}

const appUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_BETTER_AUTH_URL || process.env.NEXT_PUBLIC_AUTH_BASE_URL || "${baseUrl}";

// Better Auth Browser Client instance initialized with server baseURL and plugins
export const authClient = createAuthClient({
  baseURL: appUrl,${pluginEntries}
});
`;
}

