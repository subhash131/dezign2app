import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { compileWebPageNode } from "../compileWebPageNode";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("compileStateMutationPipelineStep", () => {
  it("compiles state_mutation step into Zustand store update code block and imports useAppStore", () => {
    const webPageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Chat",
        path: "/chat",
        sections: [
          {
            id: "sec-chat",
            name: "Chat Section",
            actions: [
              {
                id: "act-fetch-conversations",
                name: "fetch conversations",
                event: "click",
                url: "http://localhost:8080/conversations",
                method: "GET",
                queryParams: [
                  { id: "qp-limit", name: "limit", type: "number", defaultValue: "20", required: false },
                  { id: "qp-offset", name: "offset", type: "number", defaultValue: "0", required: false },
                ],
                actionSteps: [
                  {
                    id: "step-1",
                    order: 1,
                    type: "api_call",
                    name: "GET conversations",
                    endpointId: "ep-convs",
                  },
                  {
                    id: "step-2",
                    order: 2,
                    type: "state_mutation",
                    name: "AppStore.dispatch",
                    stateTargetKind: "store",
                    stateStoreNodeId: "node-app-store",
                    stateKey: "conversations",
                    stateTargetFieldId: "f-conversations",
                    stateActionName: "set",
                    stateUpdateType: "set",
                    stateReducerName: "conversations_reducer",
                    stateValueSource: {
                      kind: "prev_response",
                      stepId: "step-1",
                      fieldPath: "data",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const appStoreNode: BackendNode = {
      id: "node-app-store",
      type: "state_store",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "AppStore",
        storeName: "AppStore",
        fields: [
          {
            id: "f-conversations",
            name: "conversations",
            type: "array",
            isArray: true,
            reducer: "conversations_reducer",
          },
        ],
        actions: [],
      },
    };

    const result = compileWebPageNode(
      webPageNode,
      [],
      [],
      [webPageNode, appStoreNode],
      [],
      "Test Project",
    );

    // 1. AppStore zustand store file is generated
    const storeFile = result.files.find(
      (f) => f.filename.includes("useAppStore.ts") || f.filename.includes("lib/stores"),
    );
    expect(storeFile).toBeDefined();

    // 2. Action component file is generated
    const actionFile = result.files.find((f) =>
      f.filename.includes("FetchConversationsAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const actionContent = actionFile?.content || "";

    // 3. Zustand store import is present
    expect(actionContent).toContain('import { useAppStore } from "@/lib/stores";');

    // 4. State mutation code block is present in handleFetchConversationsAction
    expect(actionContent).toContain("useAppStore.getState().setConversations");
    expect(actionContent).toContain(
      "useAppStore.getState().setConversations(Array.isArray(resData) ? resData : (resData !== null && resData !== undefined ? [resData] : []));",
    );
    expect(actionContent).not.toContain('resData?.["data"]');
  });

  it("compiles state_mutation in layout onMount action into LayoutEventsDrawer and action file", () => {
    const layoutNode: BackendNode = {
      id: "node-layout-private",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Layout",
        isLayout: true,
        routeGroup: "private",
        sections: [
          {
            id: "sec-layout",
            name: "Sidebar Section",
            actions: [
              {
                id: "act-fetch-conversations",
                name: "fetch conversations",
                event: "click",
                url: "http://localhost:8080/conversations",
                method: "GET",
                queryParams: [
                  { id: "qp-limit", name: "limit", type: "number", defaultValue: "20", required: false },
                  { id: "qp-offset", name: "offset", type: "number", defaultValue: "0", required: false },
                ],
                actionSteps: [
                  {
                    id: "step-1",
                    order: 1,
                    type: "api_call",
                    name: "GET conversations",
                  },
                  {
                    id: "step-2",
                    order: 2,
                    type: "state_mutation",
                    name: "AppStore.dispatch",
                    stateTargetKind: "store",
                    stateStoreNodeId: "node-app-store",
                    stateKey: "conversations",
                    stateTargetFieldId: "f-conversations",
                    stateActionName: "set",
                    stateUpdateType: "set",
                    stateReducerName: "conversations_reducer",
                    stateValueSource: {
                      kind: "prev_response",
                      stepId: "step-1",
                      fieldPath: "data",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const chatPageNode: BackendNode = {
      id: "node-chat-page",
      type: "webPage",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Chat",
        path: "/chat/[id]",
        routeGroup: "private",
      },
    };

    const appStoreNode: BackendNode = {
      id: "node-app-store",
      type: "state_store",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "AppStore",
        storeName: "AppStore",
        fields: [
          {
            id: "f-conversations",
            name: "conversations",
            type: "array",
            isArray: true,
          },
        ],
        actions: [],
      },
    };

    const webAppNode: BackendNode = {
      id: "node-web-app",
      type: "webApp",
      position: { x: -200, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "WebApp",
        appSlug: "web-app",
        zones: [
          { id: "zone-private", handleId: "h-zone-private", name: "private", accessType: "protected", hasLayout: true },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [chatPageNode],
      [],
      [],
      [webAppNode, layoutNode, chatPageNode, appStoreNode],
      [],
      "Test Monorepo",
      [],
      "web-app",
      webAppNode,
    );

    const actionFile = result.files.find((f) =>
      f.filename.includes("FetchConversationsAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const actionContent = actionFile?.content || "";

    expect(actionContent).toContain('import { useAppStore } from "@/lib/stores";');
    expect(actionContent).toContain("useAppStore.getState().setConversations");
    expect(actionContent).toContain(
      "useAppStore.getState().setConversations(Array.isArray(resData) ? resData : (resData !== null && resData !== undefined ? [resData] : []));",
    );
    expect(actionContent).not.toContain('resData?.["data"]');

    // Verify lib/stores/index.ts and useAppStore.ts are generated
    const storeIndex = result.files.find((f) => f.filename === "lib/stores/index.ts");
    expect(storeIndex).toBeDefined();
    expect(storeIndex?.content).toContain("useAppStore");

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile?.content).toContain("conversations");
    expect(storeFile?.content).toContain("setConversations");
  });

  it("compiles Pageload action in layout and guarantees lib/stores/index.ts exists even if no store node exists on canvas", () => {
    const layoutNode: BackendNode = {
      id: "node-private-layout",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Layout",
        isLayout: true,
        routeGroup: "private",
        events: [
          {
            id: "act-pageload",
            name: "Pageload",
            event: "onMount",
            url: "http://localhost:8080/conversations",
            method: "GET",
            actionSteps: [
              {
                id: "step-1",
                order: 1,
                type: "api_call",
                name: "GET conversations",
              },
              {
                id: "step-2",
                order: 2,
                type: "state_mutation",
                name: "AppStore.dispatch",
                stateTargetKind: "store",
                stateStoreNodeId: "AppStore",
                stateKey: "conversations",
                stateActionName: "set",
                stateValueSource: {
                  kind: "prev_response",
                  stepId: "step-1",
                  fieldPath: "data",
                },
              },
            ],
          },
        ],
      },
    };

    const chatPageNode: BackendNode = {
      id: "node-chat-page",
      type: "webPage",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Chat",
        path: "/chat",
        routeGroup: "private",
      },
    };

    const webAppNode: BackendNode = {
      id: "node-web-app",
      type: "webApp",
      position: { x: -200, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "WebApp",
        appSlug: "web",
        zones: [
          { id: "zone-private", handleId: "h-zone-private", name: "private", accessType: "protected", hasLayout: true },
        ],
      },
    };

    // Notice: NO stateStoreNode in allNodes!
    const result = compileNextjsV16WebClient(
      [chatPageNode],
      [],
      [],
      [webAppNode, layoutNode, chatPageNode],
      [],
      "Test Monorepo",
      [],
      "web",
      webAppNode,
    );

    // 1. PageloadAction.tsx is generated under app/(private)/_components/
    const pageloadFile = result.files.find((f) =>
      f.filename.includes("PageloadAction.tsx"),
    );
    expect(pageloadFile).toBeDefined();
    expect(pageloadFile?.content).toContain('import { useAppStore } from "@/lib/stores";');
    expect(pageloadFile?.content).toContain("useAppStore.getState().setConversations");

    // 2. lib/stores/index.ts MUST be generated so Turbopack doesn't fail with Can't resolve '@/lib/stores'
    const storeIndexFile = result.files.find((f) => f.filename === "lib/stores/index.ts");
    expect(storeIndexFile).toBeDefined();
    expect(storeIndexFile?.content).toContain("useAppStore");

    // 3. lib/stores/useAppStore.ts MUST be generated with conversations and setConversations
    const storeFile = result.files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile?.content).toContain("conversations");
    expect(storeFile?.content).toContain("setConversations");

    // 4. package.json MUST include zustand dependency
    const pkgJson = result.files.find((f) => f.filename === "package.json");
    expect(pkgJson).toBeDefined();
    expect(pkgJson?.content).toContain('"zustand": "^5.0.0"');
  });

  it("associates state store node even if targetWebAppId does not strictly match webAppNode.id", () => {
    const layoutNode: BackendNode = {
      id: "node-layout",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Layout",
        isLayout: true,
        routeGroup: "private",
        events: [
          {
            id: "act-pageload",
            name: "Pageload",
            event: "onMount",
            url: "http://localhost:8080/conversations",
            method: "GET",
            actionSteps: [
              {
                id: "step-1",
                order: 1,
                type: "api_call",
                name: "GET conversations",
              },
              {
                id: "step-2",
                order: 2,
                type: "state_mutation",
                name: "AppStore.dispatch",
                stateTargetKind: "store",
                stateStoreNodeId: "node-store-app",
                stateKey: "conversations",
                stateActionName: "set",
                stateValueSource: {
                  kind: "prev_response",
                  stepId: "step-1",
                  fieldPath: "data",
                },
              },
            ],
          },
        ],
      },
    };

    const chatPage: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Dashboard",
        path: "/dashboard",
        routeGroup: "private",
      },
    };

    // Store node with a stale or mismatched targetWebAppId
    const storeNode: BackendNode = {
      id: "node-store-app",
      type: "state_store",
      position: { x: 200, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "AppStore",
        storeName: "AppStore",
        targetWebAppId: "different-webapp-id",
        fields: [
          { id: "f-conv", name: "conversations", type: "array" },
        ],
        actions: [],
      },
    };

    const webAppNode: BackendNode = {
      id: "node-web-app",
      type: "webApp",
      position: { x: -200, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "WebApp",
        appSlug: "web",
        zones: [
          { id: "zone-private", handleId: "h-zone-private", name: "private", accessType: "protected", hasLayout: true },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [chatPage],
      [],
      [],
      [webAppNode, layoutNode, chatPage, storeNode],
      [],
      "Test Monorepo",
      [],
      "web",
      webAppNode,
    );

    const storeIndexFile = result.files.find((f) => f.filename === "lib/stores/index.ts");
    expect(storeIndexFile).toBeDefined();
    expect(storeIndexFile?.content).toContain("useAppStore");

    const storeFile = result.files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();
  });

  it("compiles string/scalar state_mutation step with safe string narrowing avoiding TS2345 null assignability error", () => {
    const layoutNode: BackendNode = {
      id: "node-private-layout",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Layout",
        isLayout: true,
        routeGroup: "private",
        events: [
          {
            id: "act-pageload",
            name: "Pageload",
            event: "onMount",
            url: "http://localhost:8080/status",
            method: "GET",
            actionSteps: [
              {
                id: "step-1",
                order: 1,
                type: "api_call",
                name: "GET status",
              },
              {
                id: "step-2",
                order: 2,
                type: "state_mutation",
                name: "AppStore.dispatch",
                stateTargetKind: "store",
                stateStoreNodeId: "AppStore",
                stateKey: "status",
                stateActionName: "setStatus",
                stateValueSource: {
                  kind: "prev_response",
                  stepId: "step-1",
                  fieldPath: "data",
                },
              },
            ],
          },
        ],
      },
    };

    const chatPageNode: BackendNode = {
      id: "node-chat-page",
      type: "webPage",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Chat",
        path: "/chat",
        routeGroup: "private",
      },
    };

    const webAppNode: BackendNode = {
      id: "node-web-app",
      type: "webApp",
      position: { x: -200, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "WebApp",
        appSlug: "web",
        zones: [
          { id: "zone-private", handleId: "h-zone-private", name: "private", accessType: "protected", hasLayout: true },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [chatPageNode],
      [],
      [],
      [webAppNode, layoutNode, chatPageNode],
      [],
      "Test Monorepo",
      [],
      "web",
      webAppNode,
    );

    const pageloadFile = result.files.find((f) =>
      f.filename.includes("PageloadAction.tsx"),
    );
    expect(pageloadFile).toBeDefined();
    const content = pageloadFile?.content || "";

    // Must safely narrow to string so that 'null' is not passed into (value: string) => void (preventing TS2345)
    expect(content).toContain(
      'useAppStore.getState().setStatus(typeof resData === "string" ? resData : (resData !== null && resData !== undefined ? String(resData) : ""));',
    );
    expect(content).not.toContain("useAppStore.getState().setStatus(resData);");
  });
});
