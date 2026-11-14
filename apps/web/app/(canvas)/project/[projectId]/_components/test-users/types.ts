import { v4 as uuidv4, v5 as uuidv5, validate as uuidValidate } from "uuid";

export const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export interface TableSeedRecord {
  id: string; // The generated record _id (e.g. "user_a1b2c3")
  databaseNodeId?: string;
  databaseName: string;
  tableNodeId?: string;
  tableName: string;
  fields: Record<string, string | number | boolean | null | undefined>;
}

export interface TestUserPersona {
  id: string;
  name: string; // e.g. "Admin - Acme Tenant"
  description?: string;
  activeAuthToken?: string; // Token used for Authorization: Bearer <token>
  records: TableSeedRecord[];
  createdAt: string;
  updatedAt?: string;
}

export function isUuid(id?: string | null): boolean {
  if (!id) return false;
  return uuidValidate(id);
}

export function generateUuid(): string {
  return uuidv4();
}

/**
 * Deterministically converts any string into a valid RFC4122 v5 UUID using uuid package.
 * Preserves existing valid UUIDs.
 */
export function toValidUuid(str?: string | null): string {
  if (!str) return uuidv4();
  if (uuidValidate(str)) return str;
  return uuidv5(str, UUID_NAMESPACE);
}

export const BETTER_AUTH_TABLES = new Set([
  "user", "users",
  "session", "sessions",
  "account", "accounts",
  "verification", "verifications",
  "organization", "organizations",
  "member", "members",
  "team", "teams",
  "teammember", "teammembers",
  "invitation", "invitations",
  "subscription", "subscriptions",
  "twofactor", "twofactors",
  "passkey", "passkeys",
  "jwks",
]);

export function generateRecordId(
  tableName: string,
  dbEngine?: string,
  isUuidPk?: boolean,
): string {
  const lower = (tableName || "").toLowerCase().trim();
  const engine = (dbEngine || "").toLowerCase().trim();
  if (
    engine === "postgres" ||
    engine === "postgresql" ||
    isUuidPk === true ||
    BETTER_AUTH_TABLES.has(lower)
  ) {
    return generateUuid();
  }
  const prefix = (tableName || "rec").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 8);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${randomStr}`;
}

export function generatePersonaId(): string {
  return `persona_${Math.random().toString(36).substring(2, 9)}`;
}
