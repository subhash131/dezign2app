import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";
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

  it("compiles lifecycle pageLoad population, mutation triggers, and unmount reset cleanup", () => {
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

    const stateStoreNode: BackendNode = {
      id: "node-store-cart",
      type: "state_store",
      position: { x: 200, y: -100 },
      fractionalIndex: "a1",
      data: {
        label: "CartStore",
        storeName: "Cart",
        scope: "global",
        storage: "memory",
        targetWebAppId: "node-webapp-shop",
        fields: [
          { id: "f1", name: "items", type: "array", defaultValue: [] },
          { id: "f2", name: "total", type: "number", defaultValue: 0 },
        ],
        actions: [
          { id: "act1", name: "addItem", targetFieldId: "f1", actionType: "append" },
          { id: "act2", name: "reset", actionType: "reset" },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-checkout",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "/checkout",
        appSlug: "shop-app",
        sections: [
          {
            id: "sec-cart",
            name: "Cart Section",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
                storeActionBinding: {
                  storeNodeId: "node-store-cart",
                  storeName: "Cart",
                  actionName: "populate",
                  actionType: "populate",
                },
              },
              {
                id: "act-add",
                name: "AddItem",
                event: "click",
                storeActionBinding: {
                  storeNodeId: "node-store-cart",
                  storeName: "Cart",
                  actionName: "addItem",
                  actionType: "append",
                },
              },
              {
                id: "act-exit",
                name: "onExit",
                event: "unmount",
                storeActionBinding: {
                  storeNodeId: "node-store-cart",
                  storeName: "Cart",
                  actionName: "reset",
                  actionType: "reset",
                },
              },
            ],
          },
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

    // 1. Store file has populate and reset
    const storeFile = result.files.find((f) => f.filename === "lib/stores/useCartStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile!.content).toContain("populate: (data?: Partial<CartStoreState>");
    expect(storeFile!.content).toContain("reset: () => void;");

    // 2. Page file imports the store and wires load & unmount reset
    const pageFile = result.files.find((f) => f.filename === "app/(public)/checkout/page.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain('import { useCartStore } from "@/lib/stores";');
    expect(pageFile!.content).toContain("useCartStore.getState().populate(");
    expect(pageFile!.content).toContain("useCartStore.getState().reset();");

    // 3. Action button calls store action
    const buttonFile = result.files.find((f) => f.filename.toLowerCase().includes("additem"));
    expect(buttonFile).toBeDefined();
    expect(buttonFile!.content).toContain('import { useCartStore } from "@/lib/stores";');
    expect(buttonFile!.content).toContain("useCartStore.getState().addItem();");
  });

  it("compiles a StateStoreNode using custom types from TypesNode and imports them from @workspace/types", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-types",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "TypedApp",
        appSlug: "typed-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-home",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/home",
        appSlug: "typed-app",
        sections: [],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-user-profile",
      type: "state_store",
      position: { x: 200, y: -100 },
      fractionalIndex: "a2",
      data: {
        label: "UserProfileStore",
        storeName: "UserProfile",
        scope: "global",
        storage: "memory",
        targetWebAppId: "node-webapp-types",
        fields: [
          { id: "f1", name: "currentUser", type: "UserProfile", defaultValue: null },
          { id: "f2", name: "cartItems", type: "CartItem[]", defaultValue: [] },
          { id: "f3", name: "theme", type: "string", defaultValue: "dark" },
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
      "TypedApp",
      [],
      "typed-app",
      webAppNode
    );

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useUserProfileStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile!.content).toContain('import type { CartItem, UserProfile } from "@workspace/types";');
    expect(storeFile!.content).toContain("currentUser: UserProfile | null;");
    expect(storeFile!.content).toContain("cartItems: CartItem[];");
    expect(storeFile!.content).toContain("theme: string;");
    expect(storeFile!.content).toContain("setCurrentUser: (value: UserProfile | null) => void;");
    expect(storeFile!.content).toContain("setCartItems: (value: CartItem[]) => void;");
  });

  it("automatically infers storeActionBinding from canvas edges between StateStoreNode handles and WebPageNode action handles without manual sidebar metadata", () => {
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

    const stateStoreNode: BackendNode = {
      id: "node-store-cart",
      type: "state_store",
      position: { x: 200, y: -100 },
      fractionalIndex: "a2",
      data: {
        label: "CartStore",
        storeName: "Cart",
        scope: "global",
        storage: "memory",
        targetWebAppId: "node-webapp-shop",
        fields: [
          { id: "f-items", name: "items", type: "array", defaultValue: [] },
          { id: "f-total", name: "total", type: "number", defaultValue: 0 },
        ],
        actions: [
          { id: "act-add-item", name: "addItem", targetFieldId: "f-items", actionType: "append" },
        ],
      },
    };

    // Notice: webPageNode actions have NO storeActionBinding defined in data!
    const webPageNode: BackendNode = {
      id: "node-page-checkout",
      type: "webPage",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/checkout",
        appSlug: "shop-app",
        sections: [
          {
            id: "sec-cart",
            name: "Cart Section",
            renderMode: "client",
            actions: [
              {
                id: "act-load",
                name: "onLoad",
                event: "pageLoad",
              },
              {
                id: "act-btn-add",
                name: "AddProduct",
                event: "click",
              },
              {
                id: "act-leave",
                name: "onLeave",
                event: "unmount",
              },
            ],
          },
        ],
      },
    };

    // Edges directly connecting StateStore handles and WebPage handles:
    const edges: BackendEdge[] = [
      // 1. populate-out -> pageload-in-act-load
      {
        id: "edge-load",
        type: "connection",
        fractionalIndex: "a0",
        source: "node-store-cart",
        sourceHandle: "populate-out",
        target: "node-page-checkout",
        targetHandle: "pageload-in-act-load",
      },
      // 2. events-act-btn-add -> store-action-in-act-add-item
      {
        id: "edge-add",
        type: "connection",
        fractionalIndex: "a1",
        source: "node-page-checkout",
        sourceHandle: "events-act-btn-add",
        target: "node-store-cart",
        targetHandle: "store-action-in-act-add-item",
      },
      // 3. reset-out -> event-in-act-leave
      {
        id: "edge-leave",
        type: "connection",
        fractionalIndex: "a2",
        source: "node-store-cart",
        sourceHandle: "reset-out",
        target: "node-page-checkout",
        targetHandle: "event-in-act-leave",
      },
    ];

    const allNodes = [webAppNode, webPageNode, stateStoreNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      allNodes,
      edges,
      "ShopApp",
      [],
      "shop-app",
      webAppNode,
    );

    // 1. Page file should import useCartStore and wire populate and reset
    const pageFile = result.files.find((f) => f.filename === "app/(public)/checkout/page.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).toContain('import { useCartStore } from "@/lib/stores";');
    expect(pageFile?.content).toContain("useCartStore.getState().populate(");
    expect(pageFile?.content).toContain("useCartStore.getState().reset();");

    // 2. Button component should call addItem
    const buttonFile = result.files.find((f) => f.filename.toLowerCase().includes("addproduct"));
    expect(buttonFile).toBeDefined();
    expect(buttonFile?.content).toContain('import { useCartStore } from "@/lib/stores";');
    expect(buttonFile?.content).toContain("useCartStore.getState().addItem();");
  });

  it("compiles response property mapping and field setter in action component when bound to state store", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-user",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "User Portal", appSlug: "user-portal" },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-user",
      type: "state_store",
      fractionalIndex: "a1",
      position: { x: 0, y: 0 },
      data: {
        label: "UserStore",
        storeName: "UserStore",
        scope: "global",
        storage: "memory",
        fields: [{ id: "f-user-id", name: "currentUserId", type: "string" }],
        actions: [{ id: "a-set-user-id", name: "setCurrentUserId", actionType: "set", targetFieldId: "f-user-id" }],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-login",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 0, y: 0 },
      data: {
        label: "Login",
        path: "/login",
        targetWebAppId: "node-webapp-user",
        sections: [
          {
            id: "sec-auth",
            name: "Auth Section",
            renderMode: "client",
            actions: [
              {
                id: "act-submit",
                name: "SubmitLogin",
                event: "click",
                storeActionBinding: {
                  storeNodeId: "node-store-user",
                  storeName: "UserStore",
                  actionName: "setCurrentUserId",
                  targetFieldName: "currentUserId",
                  updateSource: "response_property",
                  valuePath: "data.user.id",
                },
              },
            ],
          },
        ],
      },
    };

    const endpointLink: Endpoint & { nodeId: string } = {
      id: "ep-login",
      nodeId: "node-svc",
      name: "login",
      type: "POST",
    };

    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 0, y: 0 },
      data: { label: "AuthService" },
    };

    const edgeToEndpoint: BackendEdge = {
      id: "edge-ep",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-page-login",
      sourceHandle: "events-act-submit",
      target: "node-svc",
      targetHandle: "endpoint-in-ep-login",
    };

    const allNodes = [webAppNode, stateStoreNode, webPageNode, serviceNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [endpointLink],
      [],
      allNodes,
      [edgeToEndpoint],
      "UserApp",
      [],
      "user-app",
      webAppNode,
    );

    const actionFile = result.files.find((f) => f.filename.toLowerCase().includes("submitlogin"));
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain('import { useUserStore } from "@/lib/stores";');
    expect(actionFile?.content).toContain('resData?.["data"]?.["user"]?.["id"]');
    expect(actionFile?.content).toContain("useUserStore.getState().setCurrentUserId(extracted);");
  });

  it("compiles realtime connection storeActionBinding to update store on incoming message", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-dash",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "Dashboard", appSlug: "dash" },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-metrics",
      type: "state_store",
      fractionalIndex: "a1",
      position: { x: 0, y: 0 },
      data: {
        label: "MetricsStore",
        storeName: "MetricsStore",
        scope: "global",
        storage: "memory",
        fields: [{ id: "f-speed", name: "currentSpeed", type: "number" }],
        actions: [{ id: "a-rec", name: "recordMetric", actionType: "custom" }],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-monitor",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 0, y: 0 },
      data: {
        label: "Monitor",
        path: "/monitor",
        targetWebAppId: "node-webapp-dash",
        realtimeConnections: [
          {
            id: "rtc-sse-speed",
            protocol: "SSE",
            eventName: "speed.update",
            streamUrl: "/api/stream/speed",
            storeActionBinding: {
              storeNodeId: "node-store-metrics",
              storeName: "MetricsStore",
              actionName: "recordMetric",
              updateSource: "full_message",
            },
          },
        ],
        sections: [
          {
            id: "sec-mon",
            name: "Monitor View",
            renderMode: "client",
            actions: [],
          },
        ],
      },
    };

    const allNodes = [webAppNode, stateStoreNode, webPageNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      allNodes,
      [],
      "DashApp",
      [],
      "dash-app",
      webAppNode,
    );

    const pageFile = result.files.find((f) => f.filename === "app/(public)/monitor/page.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).toContain('import { useMetricsStore } from "@/lib/stores";');
    expect(pageFile?.content).toContain('es.addEventListener("speed.update"');
    expect(pageFile?.content).toContain("useMetricsStore.getState().recordMetric(parsed);");
  });

  it("generates clean single try-catch loadPageData, throws on !res.ok, guards with isMounted, and unwraps response data in store", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-chat",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "ChatApp", appSlug: "chat-app" },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-conv",
      type: "state_store",
      fractionalIndex: "a1",
      position: { x: 200, y: 0 },
      data: {
        label: "ConversationStore",
        storeName: "Conversation",
        scope: "global",
        storage: "memory",
        fields: [
          { id: "f-convs", name: "conversations", type: "array", defaultValue: [] },
          { id: "f-msgs", name: "messages", type: "array", defaultValue: [] },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-conv",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 400, y: 0 },
      data: {
        label: "/conversations",
        appSlug: "chat-app",
        sections: [
          {
            id: "sec-main",
            name: "Main Section",
            renderMode: "client",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
                storeActionBinding: {
                  storeNodeId: "node-store-conv",
                  storeName: "Conversation",
                  actionName: "populate",
                  actionType: "populate",
                  updateSource: "response",
                },
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "service-chat",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 600, y: 0 },
      data: { label: "ChatService", port: "8080" },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-convs",
      name: "conversations",
      type: "GET",
      nodeId: "service-chat",
    };

    const edge: BackendEdge = {
      id: "edge-ep",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-page-conv",
      sourceHandle: "pageload-in-act-load",
      target: "service-chat",
      targetHandle: "ep-in-ep-convs",
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [endpoint],
      [],
      [webAppNode, stateStoreNode, webPageNode, serviceNode],
      [edge],
      "ChatApp",
      [],
      "chat-app",
      webAppNode,
    );

    // 1. Check generated page.tsx
    const pageFile = result.files.find((f) => f.filename === "app/(public)/conversations/page.tsx");
    expect(pageFile).toBeDefined();
    const content = pageFile!.content;

    // Verify NO duplicate setPageLoadLoading or nested try
    const loadingTrueMatches = content.match(/setPageLoadLoading\(true\)/g);
    expect(loadingTrueMatches?.length).toBe(1);

    // Verify throw on !res.ok
    expect(content).toContain("if (!res.ok) {");
    expect(content).toContain('throw new Error("HTTP " + res.status');

    // Verify isMounted guards and typed data variable
    expect(content).toContain("const data: ChatServiceGetConversationsResponse = await res.json();");
    expect(content).toContain("if (isMounted) {");
    expect(content).toContain("setPageLoadData(data);");
    expect(content).toContain("useConversationStore.getState().populate(data);");

    // 2. Check generated Zustand store unwraps payload.data into conversations and cleans up payload.data
    const storeFile = result.files.find((f) => f.filename === "lib/stores/useConversationStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile!.content).toContain("payload.conversations = payload.data");
    expect(storeFile!.content).toContain("delete payload.data;");
  });

  it("compiles explicit response field mapping to state store field in pageLoad and action buttons", () => {
    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "ChatApp", appSlug: "chat-app" },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-conv",
      type: "state_store",
      fractionalIndex: "a1",
      position: { x: 200, y: 0 },
      data: {
        label: "Conversation",
        storeName: "Conversation",
        scope: "global",
        storage: "memory",
        fields: [
          { id: "f1", name: "conversations", type: "array" },
          { id: "f2", name: "messages", type: "array" },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-conv",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 400, y: 0 },
      data: {
        label: "conversations",
        appSlug: "chat-app",
        sections: [
          {
            id: "sec-main",
            name: "Main",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
                storeActionBinding: {
                  storeNodeId: "node-store-conv",
                  storeName: "Conversation",
                  actionName: "populate",
                  actionType: "populate",
                  targetFieldName: "conversations",
                  updateSource: "response_property",
                  valuePath: "data",
                },
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "service-chat",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 600, y: 0 },
      data: { label: "ChatService", port: "8080" },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-convs",
      name: "conversations",
      type: "GET",
      nodeId: "service-chat",
    };

    const edge: BackendEdge = {
      id: "edge-ep",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-page-conv",
      sourceHandle: "pageload-in-act-load",
      target: "service-chat",
      targetHandle: "ep-in-ep-convs",
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [endpoint],
      [],
      [webAppNode, stateStoreNode, webPageNode, serviceNode],
      [edge],
      "ChatApp",
      [],
      "chat-app",
      webAppNode,
    );

    const pageFile = result.files.find((f) => f.filename === "app/(public)/conversations/page.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("useConversationStore.getState().populate({ conversations: data?.data }");
  });

  it("compiles multi-field parameterMappings for populate without ambiguous merging", () => {
    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "ChatApp", appSlug: "chat-app" },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-conv",
      type: "state_store",
      fractionalIndex: "a1",
      position: { x: 200, y: 0 },
      data: {
        label: "Conversation",
        storeName: "Conversation",
        scope: "global",
        storage: "memory",
        fields: [
          { id: "f1", name: "conversations", type: "array" },
          { id: "f2", name: "messages", type: "array" },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-conv",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 400, y: 0 },
      data: {
        label: "conversations",
        appSlug: "chat-app",
        sections: [
          {
            id: "sec-main",
            name: "Main",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
                storeActionBinding: {
                  storeNodeId: "node-store-conv",
                  storeName: "Conversation",
                  actionName: "populate",
                  actionType: "populate",
                  parameterMappings: {
                    conversations: "data.items",
                    messages: "data.recentMessages",
                  },
                },
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "service-chat",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 600, y: 0 },
      data: { label: "ChatService", port: "8080" },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-convs",
      name: "conversations",
      type: "GET",
      nodeId: "service-chat",
    };

    const edge: BackendEdge = {
      id: "edge-ep",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-page-conv",
      sourceHandle: "pageload-in-act-load",
      target: "service-chat",
      targetHandle: "ep-in-ep-convs",
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [endpoint],
      [],
      [webAppNode, stateStoreNode, webPageNode, serviceNode],
      [edge],
      "ChatApp",
      [],
      "chat-app",
      webAppNode,
    );

    const pageFile = result.files.find((f) => f.filename === "app/(public)/conversations/page.tsx");
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("useConversationStore.getState().populate({ conversations: data?.data?.items, messages: data?.data?.recentMessages });");
  });

  it("compiles schema-aware store methods for custom types without type assertions or invalid field shapes", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-chat",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ChatApp",
        appSlug: "web",
      },
    };

    const typesNode: BackendNode = {
      id: "node-types-1",
      type: "types",
      position: { x: 0, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "Types",
        customTypes: [
          {
            id: "type-msg",
            name: "Message",
            rawCode: `export interface Message {
  id: string;
  sender: "AI" | "USER" | "SYSTEM";
  content: string;
}`,
            fields: [
              { id: "f-id", name: "id", type: "string", required: true },
              { id: "f-sender", name: "sender", type: '"AI" | "USER" | "SYSTEM"', required: true, enumValues: ["AI", "USER", "SYSTEM"] },
              { id: "f-content", name: "content", type: "string", required: true },
            ],
          },
        ],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-app",
      type: "state_store",
      position: { x: 200, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "AppStore",
        storeName: "App",
        scope: "global",
        storage: "memory",
        targetWebAppId: "node-webapp-chat",
        fields: [
          { id: "f-msg", name: "message", type: "Message", defaultValue: null },
          { id: "f-status", name: "statusText", type: "string", defaultValue: "" },
          { id: "f-content", name: "content", type: "string", defaultValue: "" },
          { id: "f-msgs", name: "messages", type: "Message[]", defaultValue: [], isArray: true, actions: ["update"] },
          { id: "f-input", name: "chatInput", type: "string", defaultValue: "" },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [],
      [],
      [],
      [webAppNode, typesNode, stateStoreNode],
      [],
      "ChatApp",
      [],
      "web",
      webAppNode,
    );

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();
    const content = storeFile!.content;

    // 1. streamMessage should NOT exist for single non-string Message
    expect(content).not.toContain("streamMessage:");

    // 2. streamMessages should exist for Message[]
    expect(content).toContain("streamMessages:");

    // 3. streamMessages must use sender conforming to Message schema
    expect(content).toContain("sender:");
    expect(content).toContain('"AI"');

    // 4. No 'as unknown as' type assertions
    expect(content).not.toContain("as unknown as");

    // 5. updateMessages must safely map items without casting to an object
    expect(content).toContain("updateMessages:");
    expect(content).toContain("Array.isArray(s.messages)");
  });
});


