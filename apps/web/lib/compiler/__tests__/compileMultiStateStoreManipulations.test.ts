import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { resolveStoreActionBindings } from "../webClients/nextjs/v16/storeActionResolver";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("compileMultiStateStoreManipulations", () => {
  it("resolves multiple canvas edges into storeActionBindings for a single action", () => {
    const webPageNode: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "CheckoutPage",
        sections: [
          {
            id: "sec-1",
            name: "CartSection",
            actions: [
              {
                id: "act-submit",
                name: "checkout",
                event: "click",
              },
            ],
          },
        ],
      },
    };

    const cartStoreNode: BackendNode = {
      id: "node-store-cart",
      type: "state_store",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "CartStore",
        storeName: "Cart",
        fields: [{ id: "f-items", name: "items", type: "array" }],
        actions: [],
      },
    };

    const uiStoreNode: BackendNode = {
      id: "node-store-ui",
      type: "state_store",
      position: { x: 300, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "UIStore",
        storeName: "UI",
        fields: [{ id: "f-open", name: "isDrawerOpen", type: "boolean" }],
        actions: [],
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "e1",
        source: "node-store-cart",
        target: "node-page",
        sourceHandle: "append-out-f-items",
        targetHandle: "event-in-act-submit",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "e2",
        source: "node-store-ui",
        target: "node-page",
        sourceHandle: "setter-out-f-open",
        targetHandle: "event-in-act-submit",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const resolved = resolveStoreActionBindings(
      [webPageNode],
      [webPageNode, cartStoreNode, uiStoreNode],
      edges,
    );

    const action = resolved[0]?.data?.sections?.[0]?.actions?.[0];
    expect(action).toBeDefined();
    expect(action?.storeActionBindings).toHaveLength(2);

    expect(action?.storeActionBindings?.[0]).toMatchObject({
      storeNodeId: "node-store-cart",
      storeName: "Cart",
      actionName: "appendItems",
      actionType: "append",
      targetFieldId: "f-items",
    });

    expect(action?.storeActionBindings?.[1]).toMatchObject({
      storeNodeId: "node-store-ui",
      storeName: "UI",
      actionName: "setIsDrawerOpen",
      actionType: "set",
      targetFieldId: "f-open",
    });

    // Backwards-compatible singular binding
    expect(action?.storeActionBinding?.actionName).toBe("appendItems");
  });

  it("compiles button event component with multiple store manipulations sequentially", () => {
    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: { label: "ShopApp", appSlug: "shop-app" },
    };

    const webPageNode: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 100, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/shop",
        appSlug: "shop-app",
        sections: [
          {
            id: "sec-cart",
            name: "CartSection",
            actions: [
              {
                id: "act-add-item",
                name: "addToCart",
                event: "click",
                storeActionBindings: [
                  {
                    id: "bnd-1",
                    storeNodeId: "store-cart",
                    storeName: "Cart",
                    actionName: "appendItems",
                    actionType: "append",
                    updateSource: "direct",
                  },
                  {
                    id: "bnd-2",
                    storeNodeId: "store-ui",
                    storeName: "UI",
                    actionName: "setIsCartOpen",
                    actionType: "set",
                    updateSource: "static",
                    customValue: "true",
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const cartStore: BackendNode = {
      id: "store-cart",
      type: "state_store",
      position: { x: 300, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "CartStore",
        storeName: "Cart",
        fields: [{ id: "f1", name: "items", type: "array" }],
      },
    };

    const uiStore: BackendNode = {
      id: "store-ui",
      type: "state_store",
      position: { x: 300, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "UIStore",
        storeName: "UI",
        fields: [{ id: "f2", name: "isCartOpen", type: "boolean" }],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webAppNode, webPageNode, cartStore, uiStore],
      [],
      "ShopApp",
      [],
      "shop-app",
      webAppNode,
    );

    // Check generated event component
    const actionFile = result.files.find((f) =>
      f.filename.includes("_components") && f.filename.endsWith(".tsx") && !f.filename.includes("Section"),
    );
    expect(actionFile).toBeDefined();

    const content = actionFile!.content;
    // Both stores should be imported
    expect(content).toContain("useCartStore");
    expect(content).toContain("useUIStore");

    // Both actions should be invoked
    expect(content).toContain("useCartStore.getState().appendItems()");
    expect(content).toContain("useUIStore.getState().setIsCartOpen(");
  });

  it("compiles pageLoad with multiple store populates and unmount resets", () => {
    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: { label: "App", appSlug: "app" },
    };

    const webPageNode: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 100, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/dashboard",
        appSlug: "app",
        sections: [
          {
            id: "sec-main",
            name: "MainSection",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
                storeActionBindings: [
                  {
                    id: "bnd-1",
                    storeNodeId: "store-user",
                    storeName: "User",
                    actionName: "populate",
                    actionType: "populate",
                    targetFieldName: "profile",
                  },
                  {
                    id: "bnd-2",
                    storeNodeId: "store-stats",
                    storeName: "Stats",
                    actionName: "setCount",
                    actionType: "set",
                    updateSource: "static",
                    customValue: "42",
                  },
                ],
              },
              {
                id: "act-leave",
                name: "unmount",
                event: "unmount",
                storeActionBindings: [
                  {
                    id: "bnd-3",
                    storeNodeId: "store-user",
                    storeName: "User",
                    actionName: "reset",
                    actionType: "reset",
                  },
                  {
                    id: "bnd-4",
                    storeNodeId: "store-stats",
                    storeName: "Stats",
                    actionName: "reset",
                    actionType: "reset",
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const userStore: BackendNode = {
      id: "store-user",
      type: "state_store",
      position: { x: 300, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "UserStore",
        storeName: "User",
        fields: [{ id: "f1", name: "profile", type: "object" }],
      },
    };

    const statsStore: BackendNode = {
      id: "store-stats",
      type: "state_store",
      position: { x: 300, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "StatsStore",
        storeName: "Stats",
        fields: [{ id: "f2", name: "count", type: "number" }],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webAppNode, webPageNode, userStore, statsStore],
      [],
      "App",
      [],
      "app",
      webAppNode,
    );

    const pageFile = result.files.find((f) => f.filename.endsWith("page.tsx") && f.filename.includes("dashboard"));
    expect(pageFile).toBeDefined();

    const content = pageFile!.content;
    expect(content).toContain("useUserStore");
    expect(content).toContain("useStatsStore");

    // Both populates/setters on pageLoad
    expect(content).toContain("useUserStore.getState().populate");
    expect(content).toContain("useStatsStore.getState().setCount(42)");

    // Both cleanups on unmount
    expect(content).toContain("useUserStore.getState().reset()");
    expect(content).toContain("useStatsStore.getState().reset()");
  });
});
