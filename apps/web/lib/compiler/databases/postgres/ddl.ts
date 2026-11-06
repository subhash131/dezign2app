import { toSqlIdentifier } from "../../utils";
import type { PgColumnMeta } from "./types";
import { toPostgresType } from "./utils";
import type { PersonaSeed } from "../../types/testPersona";
import { generatePersonaSeedSql } from "../shared/generatePersonaSeedSql";

/**
 * Builds PostgreSQL DDL statements (CREATE TABLE, indexes) for a canvas entity.
 */
export function buildTableDDL(
  tableName: string,
  cols: PgColumnMeta[],
  indexes: { name?: string; columns?: string; isUnique?: boolean }[] = [],
  tableSchemas: Record<string, Array<{ name: string; pgType: string }>> = {},
): string[] {
  const stmts: string[] = [];
  const pkCols = cols.filter((c) => c.isPrimaryKey);
  const isCompositePk = pkCols.length > 1;

  const colDefs = cols.map((c) => {
    const pgType = toPostgresType(c.type, c.isPrimaryKey);
    let colDef = `  "${c.name}" ${pgType}`;
    if (c.isPrimaryKey) {
      if (isCompositePk) {
        if (pgType === "UUID") {
          colDef += " DEFAULT gen_random_uuid() NOT NULL";
        } else {
          colDef += " NOT NULL";
        }
      } else {
        if (pgType === "BIGSERIAL") {
          colDef += " PRIMARY KEY";
        } else if (pgType === "UUID") {
          colDef += " PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL";
        } else {
          colDef += " PRIMARY KEY NOT NULL";
        }
      }
    } else {
      if (c.isNotNull) colDef += " NOT NULL";
      if (c.isUnique) colDef += " UNIQUE";
    }
    return colDef;
  });

  if (isCompositePk) {
    const pkList = pkCols.map((c) => `"${c.name}"`).join(", ");
    colDefs.push(`  PRIMARY KEY (${pkList})`);
  }

  stmts.push(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(",\n")}\n);`,
  );

  // Register column schema for auto-migration
  tableSchemas[tableName] = cols.map((c) => ({
    name: c.name,
    pgType: toPostgresType(c.type, c.isPrimaryKey),
  }));

  // Named indexes
  indexes.forEach((idx) => {
    const colList = (idx.columns || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (colList.length === 0) return;
    const idxName = idx.name || `idx_${tableName}_${colList.join("_")}`;
    const unique = idx.isUnique ? "UNIQUE " : "";
    const colSpecs = colList.map((c) => `"${toSqlIdentifier(c, "col")}"`).join(", ");
    stmts.push(
      `CREATE ${unique}INDEX IF NOT EXISTS "${toSqlIdentifier(idxName, "idx")}" ON "${tableName}" (${colSpecs});`,
    );
  });

  return stmts;
}

// ---------------------------------------------------------------------------
// BetterAuth DDL for PostgreSQL
// ---------------------------------------------------------------------------

export const BETTERAUTH_PG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "user" (
  "id" UUID PRIMARY KEY NOT NULL,
  "name" TEXT,
  "email" TEXT UNIQUE,
  "emailVerified" BOOLEAN,
  "image" TEXT,
  "role" TEXT,
  "banned" BOOLEAN,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ,
  "twoFactorEnabled" BOOLEAN DEFAULT FALSE,
  "plan" TEXT,
  "creemCustomerId" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email" ON "user" ("email");`,

  `CREATE TABLE IF NOT EXISTS "session" (
  "id" UUID PRIMARY KEY NOT NULL,
  "userId" UUID,
  "token" TEXT UNIQUE,
  "expiresAt" TIMESTAMPTZ,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "impersonatedBy" TEXT,
  "activeOrganizationId" UUID,
  "activeTeamId" UUID,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session" ("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_session_token" ON "session" ("token");`,

  `CREATE TABLE IF NOT EXISTS "account" (
  "id" UUID PRIMARY KEY NOT NULL,
  "userId" UUID,
  "accountId" TEXT,
  "providerId" TEXT,
  "password" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope" TEXT,
  "idToken" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account" ("userId");`,
  `CREATE INDEX IF NOT EXISTS "idx_account_provider_account" ON "account" ("providerId", "accountId");`,

  `CREATE TABLE IF NOT EXISTS "verification" (
  "id" UUID PRIMARY KEY NOT NULL,
  "identifier" TEXT,
  "value" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "verification" ("identifier");`,

  `CREATE TABLE IF NOT EXISTS "organization" (
  "id" UUID PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT UNIQUE NOT NULL,
  "logo" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_organization_slug" ON "organization" ("slug");`,

  `CREATE TABLE IF NOT EXISTS "member" (
  "id" UUID PRIMARY KEY NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_member_organizationId" ON "member" ("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "idx_member_userId" ON "member" ("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_member_org_user" ON "member" ("organizationId", "userId");`,

  `CREATE TABLE IF NOT EXISTS "invitation" (
  "id" UUID PRIMARY KEY NOT NULL,
  "organizationId" UUID,
  "email" TEXT,
  "role" TEXT,
  "teamId" UUID,
  "status" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "inviterId" UUID,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_invitation_organizationId" ON "invitation" ("organizationId");`,
  `CREATE INDEX IF NOT EXISTS "idx_invitation_email" ON "invitation" ("email");`,

  `CREATE TABLE IF NOT EXISTS "team" (
  "id" UUID PRIMARY KEY NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS "idx_team_organizationId" ON "team" ("organizationId");`,

  `CREATE TABLE IF NOT EXISTS "teamMember" (
  "id" UUID PRIMARY KEY NOT NULL,
  "teamId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT NOT NULL
);`,
  `CREATE INDEX IF NOT EXISTS "idx_teamMember_teamId" ON "teamMember" ("teamId");`,
  `CREATE INDEX IF NOT EXISTS "idx_teamMember_userId" ON "teamMember" ("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_teamMember_team_user" ON "teamMember" ("teamId", "userId");`,

  `CREATE TABLE IF NOT EXISTS "jwks" (
  "id" UUID PRIMARY KEY NOT NULL,
  "publicKey" TEXT,
  "privateKey" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "alg" TEXT,
  "crv" TEXT
);`,
  `CREATE INDEX IF NOT EXISTS "idx_jwks_expiresAt" ON "jwks" ("expiresAt");`,

  `CREATE TABLE IF NOT EXISTS "passkey" (
  "id" UUID PRIMARY KEY NOT NULL,
  "name" TEXT,
  "publicKey" TEXT,
  "userId" UUID,
  "credentialID" TEXT UNIQUE,
  "counter" INTEGER,
  "deviceType" TEXT,
  "backedUp" BOOLEAN DEFAULT FALSE,
  "transports" TEXT,
  "aaguid" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);`,
  `CREATE INDEX IF NOT EXISTS "idx_passkey_userId" ON "passkey" ("userId");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "idx_passkey_credentialID" ON "passkey" ("credentialID");`,

  `CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id" UUID PRIMARY KEY NOT NULL,
  "userId" UUID,
  "secret" TEXT,
  "backupCodes" TEXT,
  "verified" BOOLEAN DEFAULT FALSE,
  "failedVerificationCount" INTEGER DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ
);`,
  `CREATE INDEX IF NOT EXISTS "idx_twoFactor_userId" ON "twoFactor" ("userId");`,

  `CREATE TABLE IF NOT EXISTS "rateLimit" (
  "key" TEXT PRIMARY KEY NOT NULL,
  "count" INTEGER DEFAULT 0,
  "lastRequest" BIGINT
);`,
  `CREATE INDEX IF NOT EXISTS "idx_rateLimit_lastRequest" ON "rateLimit" ("lastRequest");`,
];

export const PAYMENTS_PG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "subscription" (
  "id" UUID PRIMARY KEY NOT NULL,
  "userId" UUID,
  "plan" TEXT,
  "status" TEXT,
  "creemCustomerId" TEXT,
  "creemSubscriptionId" TEXT,
  "currentPeriodStart" TIMESTAMPTZ,
  "currentPeriodEnd" TIMESTAMPTZ,
  "cancelAtPeriodEnd" BOOLEAN DEFAULT FALSE
);`,
  `CREATE INDEX IF NOT EXISTS "idx_subscription_userId" ON "subscription" ("userId");`,
  `CREATE INDEX IF NOT EXISTS "idx_subscription_status" ON "subscription" ("status");`,
];

export function buildPgSeedSql(
  personas: PersonaSeed[] = [],
  knownTableNames?: Set<string>,
  knownTableColumns?: Record<string, Array<{ name: string }>>,
): string {
  if (!personas || personas.length === 0) return "";
  return generatePersonaSeedSql(personas, "postgres", {
    knownTableNames,
    knownTableColumns,
  });
}

export const PG_SEED_SQL = "";

// ---------------------------------------------------------------------------
// Auto-migration schema tracking
// ---------------------------------------------------------------------------

export const BETTERAUTH_PG_SCHEMAS: Record<string, Array<{ name: string; pgType: string }>> = {
  user: [
    { name: "name", pgType: "TEXT" },
    { name: "email", pgType: "TEXT" },
    { name: "emailVerified", pgType: "BOOLEAN" },
    { name: "image", pgType: "TEXT" },
    { name: "role", pgType: "TEXT" },
    { name: "banned", pgType: "BOOLEAN" },
    { name: "banReason", pgType: "TEXT" },
    { name: "banExpires", pgType: "TIMESTAMPTZ" },
    { name: "twoFactorEnabled", pgType: "BOOLEAN" },
    { name: "plan", pgType: "TEXT" },
    { name: "creemCustomerId", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
    { name: "updatedAt", pgType: "TIMESTAMPTZ" },
  ],
  session: [
    { name: "userId", pgType: "TEXT" },
    { name: "token", pgType: "TEXT" },
    { name: "expiresAt", pgType: "TIMESTAMPTZ" },
    { name: "ipAddress", pgType: "TEXT" },
    { name: "userAgent", pgType: "TEXT" },
    { name: "impersonatedBy", pgType: "TEXT" },
    { name: "activeOrganizationId", pgType: "TEXT" },
    { name: "activeTeamId", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
    { name: "updatedAt", pgType: "TIMESTAMPTZ" },
  ],
  account: [
    { name: "userId", pgType: "UUID" },
    { name: "accountId", pgType: "TEXT" },
    { name: "providerId", pgType: "TEXT" },
    { name: "password", pgType: "TEXT" },
    { name: "accessToken", pgType: "TEXT" },
    { name: "refreshToken", pgType: "TEXT" },
    { name: "accessTokenExpiresAt", pgType: "TIMESTAMPTZ" },
    { name: "refreshTokenExpiresAt", pgType: "TIMESTAMPTZ" },
    { name: "scope", pgType: "TEXT" },
    { name: "idToken", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
    { name: "updatedAt", pgType: "TIMESTAMPTZ" },
  ],
  verification: [
    { name: "identifier", pgType: "TEXT" },
    { name: "value", pgType: "TEXT" },
    { name: "expiresAt", pgType: "TIMESTAMPTZ" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
    { name: "updatedAt", pgType: "TIMESTAMPTZ" },
  ],
  organization: [
    { name: "name", pgType: "TEXT" },
    { name: "slug", pgType: "TEXT" },
    { name: "logo", pgType: "TEXT" },
    { name: "metadata", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
  ],
  member: [
    { name: "organizationId", pgType: "UUID" },
    { name: "userId", pgType: "UUID" },
    { name: "role", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
  ],
  invitation: [
    { name: "organizationId", pgType: "UUID" },
    { name: "email", pgType: "TEXT" },
    { name: "role", pgType: "TEXT" },
    { name: "teamId", pgType: "UUID" },
    { name: "status", pgType: "TEXT" },
    { name: "expiresAt", pgType: "TIMESTAMPTZ" },
    { name: "inviterId", pgType: "UUID" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
  ],
  team: [
    { name: "organizationId", pgType: "UUID" },
    { name: "name", pgType: "TEXT" },
  ],
  teamMember: [
    { name: "teamId", pgType: "UUID" },
    { name: "userId", pgType: "UUID" },
    { name: "role", pgType: "TEXT" },
  ],
  passkey: [
    { name: "name", pgType: "TEXT" },
    { name: "publicKey", pgType: "TEXT" },
    { name: "userId", pgType: "UUID" },
    { name: "credentialID", pgType: "TEXT" },
    { name: "counter", pgType: "INTEGER" },
    { name: "deviceType", pgType: "TEXT" },
    { name: "backedUp", pgType: "BOOLEAN" },
    { name: "transports", pgType: "TEXT" },
    { name: "aaguid", pgType: "TEXT" },
    { name: "createdAt", pgType: "TIMESTAMPTZ" },
  ],
  twoFactor: [
    { name: "userId", pgType: "UUID" },
    { name: "secret", pgType: "TEXT" },
    { name: "backupCodes", pgType: "TEXT" },
    { name: "verified", pgType: "BOOLEAN" },
    { name: "failedVerificationCount", pgType: "INTEGER" },
    { name: "lockedUntil", pgType: "TIMESTAMPTZ" },
  ],
  jwks: [
    { name: "publicKey", pgType: "TEXT" },
    { name: "privateKey", pgType: "TEXT" },
    { name: "expiresAt", pgType: "TIMESTAMPTZ" },
    { name: "alg", pgType: "TEXT" },
    { name: "crv", pgType: "TEXT" },
  ],
  rateLimit: [
    { name: "count", pgType: "INTEGER" },
    { name: "lastRequest", pgType: "BIGINT" },
  ],
};

/**
 * Combines all DDL statements into a single formatted schema.sql file string.
 */
export function generateSchemaSql(
  userDdlStatements: string[],
  authDdlStatements: string[],
  paymentsDdlStatements: string[],
  seedSql: string = "",
): string {
  const allDdl = [
    ...userDdlStatements,
    ...authDdlStatements,
    ...paymentsDdlStatements,
    seedSql,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    "-- Auto-generated PostgreSQL schema",
    "-- Run this once against your PostgreSQL database to initialize all tables.",
    "-- In production, use a proper migration tool (Flyway, Liquibase, or custom runner).",
    "",
    allDdl,
  ].join("\n");
}
