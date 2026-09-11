import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TestUserPersona, generatePersonaId } from "./types";

export const DEFAULT_TEST_PERSONAS: TestUserPersona[] = [
  {
    id: "persona_admin",
    name: "Admin User",
    description: "Default administrator with admin role and active session",
    activeAuthToken: "fake_admin_token",
    createdAt: "2026-01-01T00:00:00.000Z",
    records: [
      {
        id: "fake_admin_1",
        databaseName: "Primary Database",
        tableName: "user",
        fields: {
          id: "fake_admin_1",
          name: "Admin User",
          email: "admin@example.com",
          role: "admin",
        },
      },
      {
        id: "fake_session_admin",
        databaseName: "Primary Database",
        tableName: "session",
        fields: {
          id: "fake_session_admin",
          userId: "fake_admin_1",
          token: "fake_admin_token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    ],
  },
  {
    id: "persona_user",
    name: "Standard User",
    description: "Standard authenticated user with user role",
    activeAuthToken: "fake_user_token",
    createdAt: "2026-01-01T00:00:00.000Z",
    records: [
      {
        id: "fake_user_1",
        databaseName: "Primary Database",
        tableName: "user",
        fields: {
          id: "fake_user_1",
          name: "Standard User",
          email: "user@example.com",
          role: "user",
        },
      },
      {
        id: "fake_session_user",
        databaseName: "Primary Database",
        tableName: "session",
        fields: {
          id: "fake_session_user",
          userId: "fake_user_1",
          token: "fake_user_token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      },
    ],
  },
  {
    id: "persona_superadmin",
    name: "Superadmin",
    description: "Root superadmin with all role capabilities",
    activeAuthToken: "fake_superadmin_token",
    createdAt: "2026-01-01T00:00:00.000Z",
    records: [
      {
        id: "fake_superadmin_1",
        databaseName: "Primary Database",
        tableName: "user",
        fields: {
          id: "fake_superadmin_1",
          name: "Super Admin",
          email: "superadmin@example.com",
          role: "superadmin",
        },
      },
      {
        id: "fake_session_superadmin",
        databaseName: "Primary Database",
        tableName: "session",
        fields: {
          id: "fake_session_superadmin",
          userId: "fake_superadmin_1",
          token: "fake_superadmin_token",
          expiresAt: "2099-01-01T00:00:00.000Z",
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
  resetToDefaults: () => void;
}

export const useTestUsersStore = create<TestUsersState>()(
  persist(
    (set) => ({
      personas: DEFAULT_TEST_PERSONAS,
      addPersona: (persona) =>
        set((state) => ({ personas: [...state.personas, persona] })),
      updatePersona: (id, updates) =>
        set((state) => ({
          personas: state.personas.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      deletePersona: (id) =>
        set((state) => ({
          personas: state.personas.filter((p) => p.id !== id),
        })),
      resetToDefaults: () => set({ personas: DEFAULT_TEST_PERSONAS }),
    }),
    {
      name: "dezign2app_test_user_personas_v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
