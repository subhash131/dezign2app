import {
  DEFAULT_ORG_ROLES,
  DEFAULT_USER_ROLES,
  resolveAuthRoles,
} from "@workspace/canvas";
import { BetterAuthV16NodeData } from "../types";

export interface GeneratedBetterAuthPermissions {
  hasCustomAdminAccess: boolean;
  hasCustomOrgAccess: boolean;
  defaultRole?: string;
  adminRoles?: string[];
  permissionsCode: string | null;
}

/**
 * Generates shared `auth-permissions.ts` source containing Better Auth `createAccessControl`
 * instances and role maps whenever the AuthNode defines custom user or organization roles
 * beyond Better Auth's built-in defaults.
 */
export function generateBetterAuthPermissions(
  data: BetterAuthV16NodeData
): GeneratedBetterAuthPermissions {
  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
  const { userRoles, orgRoles } = resolveAuthRoles(data);

  const rawDefaultRole = data.rbac?.defaultRole?.trim() || undefined;
  const rawAdminRoles = data.rbac?.adminRoles
    ?.map((r) => r.trim())
    .filter(Boolean);

  // Merge any referenced defaultRole / adminRoles into the role map so Better Auth never
  // encounters an undeclared role key at runtime or type-check time.
  const effectiveUserRoles = Array.from(
    new Set([
      ...userRoles,
      ...(rawDefaultRole ? [rawDefaultRole] : []),
      ...(rawAdminRoles ?? []),
    ])
  );

  const defaultUserRoleSet = new Set<string>(DEFAULT_USER_ROLES);
  const customUserRoles = effectiveUserRoles.filter(
    (r) => !defaultUserRoleSet.has(r)
  );
  const hasCustomDefaultRole = Boolean(
    rawDefaultRole && rawDefaultRole !== "user"
  );
  const hasCustomAdminRolesList = Boolean(
    rawAdminRoles &&
      rawAdminRoles.length > 0 &&
      (rawAdminRoles.length !== 1 || rawAdminRoles[0] !== "admin")
  );
  const hasCustomAdminAccess =
    enabledPlugins.includes("admin") &&
    (customUserRoles.length > 0 ||
      hasCustomDefaultRole ||
      hasCustomAdminRolesList);

  const org = data.organization;
  const effectiveOrgRoles = Array.from(new Set(orgRoles));
  const defaultOrgRoleSet = new Set<string>(DEFAULT_ORG_ROLES);
  const customOrgRoles = effectiveOrgRoles.filter(
    (r) => !defaultOrgRoleSet.has(r)
  );
  const hasCustomOrgAccess =
    org?.enabled !== false &&
    (enabledPlugins.includes("organization") || Boolean(org?.enabled)) &&
    customOrgRoles.length > 0;

  if (!hasCustomAdminAccess && !hasCustomOrgAccess) {
    return {
      hasCustomAdminAccess: false,
      hasCustomOrgAccess: false,
      defaultRole: rawDefaultRole,
      adminRoles: rawAdminRoles,
      permissionsCode: null,
    };
  }

  const imports: string[] = [
    `import { createAccessControl } from "better-auth/plugins/access";`,
  ];
  const blocks: string[] = [];

  if (hasCustomAdminAccess) {
    imports.push(
      `import {\n  defaultStatements as adminDefaultStatements,\n  adminAc,\n  userAc,\n} from "better-auth/plugins/admin/access";`
    );

    const adminRoleSet = new Set(
      rawAdminRoles && rawAdminRoles.length > 0 ? rawAdminRoles : ["admin"]
    );
    const adminRoleEntries = effectiveUserRoles.map((role) => {
      const baseStmt = adminRoleSet.has(role)
        ? "adminAc.statements"
        : "userAc.statements";
      return `  ${JSON.stringify(role)}: adminAcInstance.newRole({ ...${baseStmt} }),`;
    });

    blocks.push(
      `/**\n * Global user role access control instance for Better Auth admin() plugin.\n */\nexport const adminAcInstance = createAccessControl(adminDefaultStatements);\n\nexport const adminRolesMap = {\n${adminRoleEntries.join("\n")}\n};`
    );
  }

  if (hasCustomOrgAccess) {
    imports.push(
      `import {\n  defaultStatements as orgDefaultStatements,\n  ownerAc,\n  adminAc as orgAdminAc,\n  memberAc,\n} from "better-auth/plugins/organization/access";`
    );

    const orgRoleEntries = effectiveOrgRoles.map((role) => {
      // Built-in owner/admin inherit their higher statement sets; custom org roles default to member statements.
      const baseStmt =
        role === "owner"
          ? "ownerAc.statements"
          : role === "admin"
          ? "orgAdminAc.statements"
          : "memberAc.statements";
      return `  ${JSON.stringify(role)}: orgAcInstance.newRole({ ...${baseStmt} }),`;
    });

    blocks.push(
      `/**\n * Organization role access control instance for Better Auth organization() plugin.\n */\nexport const orgAcInstance = createAccessControl(orgDefaultStatements);\n\nexport const orgRolesMap = {\n${orgRoleEntries.join("\n")}\n};`
    );
  }

  return {
    hasCustomAdminAccess,
    hasCustomOrgAccess,
    defaultRole: rawDefaultRole,
    adminRoles: rawAdminRoles,
    permissionsCode: `${imports.join("\n")}\n\n${blocks.join("\n\n")}\n`,
  };
}
