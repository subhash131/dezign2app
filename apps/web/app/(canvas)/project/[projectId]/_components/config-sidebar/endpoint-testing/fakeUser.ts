"use client";

import {
  useTestUsersStore,
  DEFAULT_TEST_PERSONAS,
  ensureRealPersonaToken,
} from "../../test-users/useTestUsersStore";
import { TestUserPersona } from "../../test-users/types";

export interface FakeUserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  token: string;
  description: string;
  badge: string;
  isAnonymous?: boolean;
}

/**
 * Returns all active fake user profiles merging store personas with the Anonymous profile.
 */
export function useActiveFakeUsers(): FakeUserProfile[] {
  const personas = useTestUsersStore((s) => s.personas);
  const effectivePersonas = personas.length > 0 ? personas : DEFAULT_TEST_PERSONAS;

  const userProfiles: FakeUserProfile[] = effectivePersonas.map((rawP) => {
    const p = ensureRealPersonaToken(rawP);
    const userRecord = p.records.find((r) => r.tableName.toLowerCase() === "user") || p.records[0];
    const rawEmail = userRecord?.fields?.email;
    const email: string =
      typeof rawEmail === "string"
        ? rawEmail
        : `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;

    const rawRole = userRecord?.fields?.role;
    const role: string =
      typeof rawRole === "string"
        ? rawRole
        : p.name.toLowerCase().includes("admin")
        ? "admin"
        : "user";

    return {
      id: p.id,
      name: p.name,
      email,
      role,
      token: p.activeAuthToken || "",
      description: p.description || `${p.name} (Role: ${role})`,
      badge: role.toUpperCase(),
    };
  });

  return [
    ...userProfiles,
    {
      id: "anonymous",
      name: "Anonymous / Public (No Token)",
      email: "",
      role: "guest",
      token: "",
      description: "Unauthenticated request without Authorization header (tests 401)",
      badge: "NO AUTH",
      isAnonymous: true,
    },
  ];
}

/**
 * Helper to get the Authorization header string from a token or profile.
 */
export function getAuthHeaderValue(token?: string): string {
  if (!token || !token.trim()) return "";
  const clean = token.replace(/^Bearer\s+/i, "").trim();
  if (!clean) return "";
  return `Bearer ${clean}`;
}
