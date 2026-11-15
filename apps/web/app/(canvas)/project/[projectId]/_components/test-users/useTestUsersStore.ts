import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TableSeedRecord, TestUserPersona, generatePersonaId, isUuid, generateUuid, toValidUuid } from "./types";
import {
  generateRealBearerJwtSync,
  isRealJwt,
  decodeJwtPayload,
  DEFAULT_AUTH_SECRET,
} from "./tokenGenerator";

// ── Default Real JWT Personas ───────────────────────────────────────────────

export const DEFAULT_ADMIN_USER_ID = "a0000000-0000-4000-8000-000000000001";
export const DEFAULT_ADMIN_SESSION_ID = "b0000000-0000-4000-8000-000000000001";

const adminJwt = generateRealBearerJwtSync({
  userId: DEFAULT_ADMIN_USER_ID,
  name: "Admin User",
  email: "admin@example.com",
  role: "admin",
  sessionId: DEFAULT_ADMIN_SESSION_ID,
  secret: DEFAULT_AUTH_SECRET,
});

export const DEFAULT_TEST_PERSONAS: TestUserPersona[] = [
  {
    id: "persona_admin",
    name: "Admin User",
    description: "Default administrator with admin role and active session",
    activeAuthToken: adminJwt,
    createdAt: "2026-01-01T00:00:00.000Z",
    records: [
      {
        id: DEFAULT_ADMIN_USER_ID,
        databaseName: "Primary Database",
        tableName: "user",
        fields: {
          id: DEFAULT_ADMIN_USER_ID,
          name: "Admin User",
          email: "admin@example.com",
          role: "admin",
        },
      },
    ],
  },
];

interface TestUsersState {
  personas: TestUserPersona[];
  addPersona: (persona: TestUserPersona) => void;
  updatePersona: (id: string, updates: Partial<TestUserPersona>) => void;
  deletePersona: (id: string) => void;
  regeneratePersonaToken: (id: string, secret?: string) => string | null;
  upgradeAllToRealTokens: (secret?: string) => void;
  resetToDefaults: () => void;
}

export function ensureRealPersonaToken(p: TestUserPersona, secret = DEFAULT_AUTH_SECRET): TestUserPersona {
  const userRec = p.records.find((r) => {
    const l = (r.tableName || "").toLowerCase();
    return l === "user" || l === "users";
  }) || p.records[0];
  const rawUserId = userRec?.fields?.id ? String(userRec.fields.id) : p.id;
  const userId: string = toValidUuid(rawUserId);

  const sessRec = p.records.find((r) => {
    const l = (r.tableName || "").toLowerCase();
    return l === "session" || l === "sessions";
  });
  const rawSessionId = sessRec?.fields?.id ? String(sessRec.fields.id) : undefined;
  const sessionId: string = toValidUuid(rawSessionId);

  const decoded = p.activeAuthToken ? decodeJwtPayload(p.activeAuthToken) : null;
  const decodedSub = decoded && typeof decoded.sub === "string" ? decoded.sub : undefined;
  const decodedUserId = decoded && typeof decoded.userId === "string" ? decoded.userId : undefined;

  const needNewToken =
    !p.activeAuthToken ||
    !isRealJwt(p.activeAuthToken) ||
    !isUuid(rawUserId) ||
    !isUuid(decodedSub) ||
    !isUuid(decodedUserId);

  if (!needNewToken && isUuid(rawUserId) && isUuid(rawSessionId)) {
    return p;
  }

  const email = userRec?.fields?.email ? String(userRec.fields.email) : `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
  const role = userRec?.fields?.role ? String(userRec.fields.role) : (p.name.toLowerCase().includes("admin") ? "admin" : "user");

  const realJwt = generateRealBearerJwtSync({
    userId,
    name: p.name,
    email,
    role,
    sessionId,
    secret,
  });

  return {
    ...p,
    activeAuthToken: realJwt,
    records: p.records.map((r): TableSeedRecord => {
      const lower = (r.tableName || "").toLowerCase();
      if (lower === "user" || lower === "users") {
        return {
          ...r,
          id: userId,
          fields: {
            ...r.fields,
            id: userId,
          },
        };
      }
      if (lower === "session" || lower === "sessions") {
        return {
          ...r,
          id: sessionId,
          fields: {
            ...r.fields,
            id: sessionId,
            userId,
            token: realJwt,
          },
        };
      }
      const updatedFields = { ...r.fields };
      for (const [k, v] of Object.entries(updatedFields)) {
        if (typeof v === "string" && !isUuid(v)) {
          const kLower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            kLower === "userid" ||
            kLower === "createdby" ||
            kLower === "authorid" ||
            kLower === "creatorid" ||
            v === rawUserId ||
            v.startsWith("user_")
          ) {
            updatedFields[k] = userId;
          }
        }
      }
      const recordId = (!isUuid(r.id) && (lower.includes("user") || r.id.startsWith("user_")))
        ? toValidUuid(r.id)
        : r.id;
      if (updatedFields.id && (!isUuid(String(updatedFields.id)) && (lower.includes("user") || String(updatedFields.id).startsWith("user_")))) {
        updatedFields.id = recordId;
      }
      return {
        ...r,
        id: recordId,
        fields: updatedFields,
      };
    }),
  };
}

export const useTestUsersStore = create<TestUsersState>()(
  persist(
    (set, get) => ({
      personas: DEFAULT_TEST_PERSONAS,
      addPersona: (persona) => {
        const validatedPersona = ensureRealPersonaToken(persona);
        set((state) => ({ personas: [...state.personas, validatedPersona] }));
      },
      updatePersona: (id, updates) =>
        set((state) => ({
          personas: state.personas.map((p) => {
            if (p.id !== id) return p;
            const updated: TestUserPersona = {
              ...p,
              ...updates,
              updatedAt: new Date().toISOString(),
            };
            // Ensure session record token matches activeAuthToken
            const newToken = updates.activeAuthToken;
            if (newToken) {
              updated.records = updated.records.map((r): TableSeedRecord => {
                if (r.tableName.toLowerCase() === "session") {
                  return {
                    ...r,
                    fields: { ...r.fields, token: newToken },
                  };
                }
                return r;
              });
            }
            return ensureRealPersonaToken(updated);
          }),
        })),
      deletePersona: (id) =>
        set((state) => ({
          personas: state.personas.filter((p) => p.id !== id),
        })),
      regeneratePersonaToken: (id, secret = DEFAULT_AUTH_SECRET) => {
        const state = get();
        const persona = state.personas.find((p) => p.id === id);
        if (!persona) return null;

        const userRec = persona.records.find((r) => {
          const l = (r.tableName || "").toLowerCase();
          return l === "user" || l === "users";
        }) || persona.records[0];
        const rawUserId = userRec?.fields?.id ? String(userRec.fields.id) : persona.id;
        const userId: string = toValidUuid(rawUserId);

        const email = userRec?.fields?.email ? String(userRec.fields.email) : `${persona.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
        const role = userRec?.fields?.role ? String(userRec.fields.role) : (persona.name.toLowerCase().includes("admin") ? "admin" : "user");

        const sessRec = persona.records.find((r) => {
          const l = (r.tableName || "").toLowerCase();
          return l === "session" || l === "sessions";
        });
        const rawSessionId = sessRec?.fields?.id ? String(sessRec.fields.id) : undefined;
        const sessionId: string = toValidUuid(rawSessionId);

        const freshJwt = generateRealBearerJwtSync({
          userId,
          name: persona.name,
          email,
          role,
          sessionId,
          secret,
        });

        set({
          personas: state.personas.map((p) =>
            p.id === id
              ? {
                  ...p,
                  activeAuthToken: freshJwt,
                  records: p.records.map((r): TableSeedRecord => {
                    const lower = (r.tableName || "").toLowerCase();
                    if (lower === "user" || lower === "users") {
                      return {
                        ...r,
                        id: userId,
                        fields: { ...r.fields, id: userId },
                      };
                    }
                    if (lower === "session" || lower === "sessions") {
                      return {
                        ...r,
                        id: sessionId,
                        fields: { ...r.fields, id: sessionId, userId, token: freshJwt },
                      };
                    }
                    return r;
                  }),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        });

        return freshJwt;
      },
      upgradeAllToRealTokens: (secret = DEFAULT_AUTH_SECRET) => {
        set((state) => ({
          personas: state.personas.map((p) => ensureRealPersonaToken(p, secret)),
        }));
      },
      resetToDefaults: () => set({ personas: DEFAULT_TEST_PERSONAS }),
    }),
    {
      name: "dezign2app_test_user_personas_v6",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.personas) && state.personas.length > 0) {
          const hasInvalid = state.personas.some((p) => {
            const uRec = p.records.find((r) => ["user", "users"].includes((r.tableName || "").toLowerCase())) || p.records[0];
            const rawId = uRec?.fields?.id ? String(uRec.fields.id) : p.id;
            const decoded = p.activeAuthToken ? decodeJwtPayload(p.activeAuthToken) : null;
            const decodedSub = decoded && typeof decoded.sub === "string" ? decoded.sub : undefined;
            return !isUuid(rawId) || !isUuid(decodedSub);
          });
          if (hasInvalid) {
            state.upgradeAllToRealTokens();
          }
        }
      },
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { personas: DEFAULT_TEST_PERSONAS };
        }
        if ("personas" in persistedState && Array.isArray(persistedState.personas) && persistedState.personas.length > 0) {
          const upgraded = persistedState.personas.map((p) => ensureRealPersonaToken(p));
          return { personas: upgraded };
        }
        return { personas: DEFAULT_TEST_PERSONAS };
      },
    },
  ),
);

