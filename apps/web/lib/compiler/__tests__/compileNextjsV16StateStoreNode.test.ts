import { describe, it, expect } from "vitest";
import { BackendNode } from "@/types/canvas";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("compileNextjsV16StateStoreNode", () => {
  it("compiles a global StateStoreNode with memory storage into lib/stores/use[Store]Store.ts", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-main",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "PortalApp",
        appSlug: "portal-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-dashboard",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/dashboard",
        appSlug: "portal-app",
        sections: [],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-auth-user",
      type: "state_store",
      position: { x: 200, y: -100 },
      fractionalIndex: "a2",
      data: {
        label: "UserSessionStore",
        storeName: "UserSession",
        scope: "global",
        storage: "memory",
        targetWebAppId: "node-webapp-main",
        fields: [
          { id: "f1", name: "userId", type: "string", defaultValue: "" },
          { id: "f2", name: "isAuthenticated", type: "boolean", defaultValue: false },
          { id: "f3", name: "roles", type: "array", defaultValue: [] },
        ],
        actions: [
          { id: "act1", name: "logout", targetFieldId: "f2", actionType: "set" },
        ],
      },
    };

    const allNodes = [webAppNode, webPageNode, stateStoreNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      allNodes,
      [],
      "PortalApp",
      [],
      "portal-app",
      webAppNode
    );

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useUserSessionStore.ts");
    expect(storeFile).toBeDefined();
    const code = storeFile!.content;

    expect(code).toContain('"use client";');
    expect(code).toContain('import { create } from "zustand";');
    expect(code).not.toContain("zustand/middleware");
    expect(code).toContain("export interface UserSessionStoreState {");
    expect(code).toContain("userId: string;");
    expect(code).toContain("isAuthenticated: boolean;");
    expect(code).toContain("roles: unknown[];");
    expect(code).toContain("setUserId: (value: string) => void;");
    expect(code).toContain("setIsAuthenticated: (value: boolean) => void;");
    expect(code).toContain("setRoles: (value: unknown[]) => void;");
    expect(code).toContain("logout: (value: boolean) => void;");
    expect(code).toContain("reset: () => void;");
    expect(code).toContain("export const useUserSessionStore = create<UserSessionStoreState>");

    // Re-exported in lib/stores/index.ts
    const indexFile = result.files.find((f) => f.filename === "lib/stores/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('export * from "./useUserSessionStore";');

    // Dependencies include zustand
    const pkgJson = result.files.find((f) => f.filename === "package.json");
    expect(pkgJson).toBeDefined();
    expect(pkgJson!.content).toContain('"zustand":');
  });

  it("compiles a StateStoreNode with localStorage into a persisted Zustand store with persist middleware", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-shop",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ShopApp",
        appSlug: "shop-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-catalog",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/catalog",
        appSlug: "shop-app",
        sections: [],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-cart",
      type: "state_store",
      position: { x: 200, y: -100 },
      fractionalIndex: "a2",
      data: {
        label: "CartStore",
        storeName: "Cart",
        scope: "global",
        storage: "localStorage",
        targetWebAppId: "node-webapp-shop",
        fields: [
          { id: "f-items", name: "items", type: "array", defaultValue: [] },
          { id: "f-total", name: "total", type: "number", defaultValue: 0 },
        ],
        actions: [
          { id: "act-add", name: "addItem", targetFieldId: "f-items", actionType: "append" },
        ],
      },
    };

    const allNodes = [webAppNode, webPageNode, stateStoreNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      allNodes,
      [],
      "ShopApp",
      [],
      "shop-app",
      webAppNode
    );

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useCartStore.ts");
    expect(storeFile).toBeDefined();
    const code = storeFile!.content;

    expect(code).toContain('"use client";');
    expect(code).toContain('import { create } from "zustand";');
    expect(code).toContain('import { persist, createJSONStorage } from "zustand/middleware";');
    expect(code).toContain("export const useCartStore = create<CartStoreState>()(");
    expect(code).toContain("persist(");
    expect(code).toContain('name: "cart-storage"');
    expect(code).toContain("storage: createJSONStorage(() => localStorage)");
  });

  it("compiles a local StateStoreNode scoped to a specific page into that page's _stores folder", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-admin",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "AdminApp",
        appSlug: "admin-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-settings",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/settings",
        path: "/settings",
        appSlug: "admin-app",
        sections: [],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-settings-form",
      type: "state_store",
      position: { x: 200, y: 100 },
      fractionalIndex: "a2",
      data: {
        label: "SettingsFormStore",
        storeName: "SettingsForm",
        scope: "local",
        storage: "memory",
        targetWebAppId: "node-webapp-admin",
        targetPageId: "node-page-settings",
        fields: [
          { id: "f-dirty", name: "isDirty", type: "boolean", defaultValue: false },
          { id: "f-step", name: "activeStep", type: "number", defaultValue: 1 },
        ],
      },
    };

    const allNodes = [webAppNode, webPageNode, stateStoreNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      allNodes,
      [],
      "AdminApp",
      [],
      "admin-app",
      webAppNode
    );

    // Local store should be in app/settings/_stores/useSettingsFormStore.ts
    const localStoreFile = result.files.find((f) => f.filename === "app/settings/_stores/useSettingsFormStore.ts");
    expect(localStoreFile).toBeDefined();
    expect(localStoreFile!.content).toContain("export interface SettingsFormStoreState");
    expect(localStoreFile!.content).toContain("isDirty: boolean;");
    expect(localStoreFile!.content).toContain("activeStep: number;");
  });

  it("strictly isolates stores so a StateStoreNode belonging to WebApp A is not compiled into WebApp B", () => {
    const webAppA: BackendNode = {
      id: "node-webapp-a",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "AppA",
        appSlug: "app-a",
      },
    };

    const webAppB: BackendNode = {
      id: "node-webapp-b",
      type: "webApp",
      position: { x: 800, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "AppB",
        appSlug: "app-b",
      },
    };

    const pageB: BackendNode = {
      id: "node-page-b",
      type: "webPage",
      position: { x: 800, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "/home",
        appSlug: "app-b",
        sections: [],
      },
    };

    // Store explicitly belongs to App A
    const storeA: BackendNode = {
      id: "node-store-a",
      type: "state_store",
      position: { x: 100, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "StoreA",
        storeName: "StoreA",
        targetWebAppId: "node-webapp-a",
        fields: [{ id: "f1", name: "secretA", type: "string", defaultValue: "123" }],
      },
    };

    const allNodes = [webAppA, webAppB, pageB, storeA];

    // Compiling App B must NOT include StoreA
    const resultB = compileNextjsV16WebClient(
      [pageB],
      [],
      [],
      allNodes,
      [],
      "AppB",
      [],
      "app-b",
      webAppB
    );

    const leakedStoreFile = resultB.files.find((f) => f.filename.includes("StoreA"));
    expect(leakedStoreFile).toBeUndefined();
  });
});
