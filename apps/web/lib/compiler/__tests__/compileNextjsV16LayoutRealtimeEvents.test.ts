import { describe, it, expect } from "vitest";
import { compileWebPageNodes } from "../compileWebPageNode";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";

describe("compileNextjsV16 Layout Realtime Events and Output Log Drawer", () => {
  it("compiles LayoutEventsDrawer and mounts it in layout.tsx when layout has manual realtimeConnections", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "StoreApp",
        appSlug: "store-app",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const layoutNode: BackendNode = {
      id: "node-layout-priv",
      type: "webPage",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "layout",
        isLayout: true,
        zoneId: "zone-private",
        realtimeConnections: [
          {
            id: "rtc-stream-layout",
            protocol: "SSE",
            eventName: "agent.token",
            sourceServiceNodeId: "node-service-ai",
            sourceServiceLabel: "AiService",
            storeActionBinding: {
              storeName: "chatStore",
              actionName: "appendMessage",
              updateSource: "full_message",
            },
          },
        ],
      },
    };

    const pageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 500, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "/chat",
        appSlug: "store-app",
      },
    };

    const edgeWebAppToLayout: BackendEdge = {
      id: "edge-webapp-layout",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp",
      sourceHandle: "private-in",
      target: "node-layout-priv",
      targetHandle: "page-in",
    };

    const edgeLayoutToPage: BackendEdge = {
      id: "edge-layout-page",
      type: "connection",
      fractionalIndex: "a1",
      source: "node-webapp",
      sourceHandle: "private-in",
      target: "node-page-chat",
      targetHandle: "page-in",
    };

    const serviceNode: BackendNode = {
      id: "node-service-ai",
      type: "service",
      position: { x: 700, y: 0 },
      fractionalIndex: "a3",
      data: {
        label: "AiService",
        port: "8095",
      },
    };

    const result = compileWebPageNodes(
      [webAppNode, layoutNode, pageNode],
      [],
      [],
      [webAppNode, layoutNode, pageNode, serviceNode],
      [edgeWebAppToLayout, edgeLayoutToPage],
      "StoreApp",
    );

    // 1. Verify Private Layout file imports and mounts LayoutEventsDrawer
    const layoutFile = result.files.find((f) => f.filename === "app/(private)/layout.tsx");
    expect(layoutFile).toBeDefined();
    expect(layoutFile!.content).toContain('import { LayoutEventsDrawer } from "./_components/LayoutEventsDrawer";');
    expect(layoutFile!.content).toContain("<LayoutEventsDrawer />");

    // 2. Verify LayoutEventsDrawer.tsx file is generated under app/(private)/_components/
    const drawerFile = result.files.find((f) => f.filename === "app/(private)/_components/LayoutEventsDrawer.tsx");
    expect(drawerFile).toBeDefined();
    const drawerCode = drawerFile!.content;

    // Check client component directive
    expect(drawerCode).toContain('"use client";');

    // Check persistent EventSource listener
    expect(drawerCode).toContain("new EventSource(");
    expect(drawerCode).toContain('es.addEventListener("agent.token"');

    // Check response mapping to Zustand store
    expect(drawerCode).toContain('import { useChatStore } from "@/lib/stores";');
    expect(drawerCode).toContain("useChatStore.getState().appendMessage(parsed);");

    // Check Output Log UI
    expect(drawerCode).toContain("Layout Output Log");
    expect(drawerCode).toContain("Persistent Stream Active");
    expect(drawerCode).toContain("NEXT_PUBLIC_ENABLE_DEBUG_LOGS");

    // Check custom layout event listener
    expect(drawerCode).toContain('window.addEventListener("dezign:layout-log"');
  });

  it("discovers pipeline push_to_client steps targeting the layout and generates the drawer", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-2",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "PipelineApp",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const layoutNode: BackendNode = {
      id: "node-layout-stream",
      type: "webPage",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "layout",
        isLayout: true,
        zoneId: "zone-private",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-order",
      type: "service",
      position: { x: 700, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "OrderService",
        port: "8088",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-stream-pipeline",
        name: "OrderStream",
        type: "GET",
        nodeId: "node-service-order",
        route: "/orders/stream",
        pipelineSteps: [
          {
            id: "step-push-layout",
            name: "Push to Layout",
            type: "push_to_client",
            clientDeliveryProtocol: "SSE",
            clientDeliveryEventName: "order_update",
            clientDeliveryTargetPageId: "node-layout-stream",
          },
        ],
      },
    ];

    const edge: BackendEdge = {
      id: "edge-webapp-layout",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp-2",
      sourceHandle: "private-in",
      target: "node-layout-stream",
      targetHandle: "page-in",
    };

    const result = compileWebPageNodes(
      [webAppNode, layoutNode],
      endpoints,
      [],
      [webAppNode, layoutNode, serviceNode],
      [edge],
      "PipelineApp",
    );

    // Verify LayoutEventsDrawer was automatically generated from pipeline step
    const drawerFile = result.files.find((f) => f.filename.includes("LayoutEventsDrawer.tsx"));
    expect(drawerFile).toBeDefined();
    expect(drawerFile!.content).toContain('es.addEventListener("order_update"');
    expect(drawerFile!.content).toContain("Layout Output Log");

    const layoutFile = result.files.find((f) => f.filename === "app/(private)/layout.tsx");
    expect(layoutFile?.content).toContain("<LayoutEventsDrawer />");
  });

  it("does not generate LayoutEventsDrawer when layout has no real-time stream connections", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-plain",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "PlainApp",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const layoutNode: BackendNode = {
      id: "node-layout-plain",
      type: "webPage",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "layout",
        isLayout: true,
        zoneId: "zone-private",
      },
    };

    const edge: BackendEdge = {
      id: "edge-plain",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp-plain",
      sourceHandle: "private-in",
      target: "node-layout-plain",
      targetHandle: "page-in",
    };

    const result = compileWebPageNodes(
      [webAppNode, layoutNode],
      [],
      [],
      [webAppNode, layoutNode],
      [edge],
      "PlainApp",
    );

    const drawerFile = result.files.find((f) => f.filename.includes("LayoutEventsDrawer.tsx"));
    expect(drawerFile).toBeUndefined();

    const layoutFile = result.files.find((f) => f.filename.includes("layout.tsx") && !f.filename.includes("app/layout.tsx"));
    expect(layoutFile).toBeDefined();
    expect(layoutFile!.content).not.toContain("LayoutEventsDrawer");
  });

  it("generates LayoutEventsDrawer and mounts it in layout.tsx when layout has UI events (e.g. click actions) without realtime connections", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-actions",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ActionsApp",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const layoutNode: BackendNode = {
      id: "node-layout-actions",
      type: "webPage",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "layout",
        isLayout: true,
        zoneId: "zone-private",
        sections: [
          {
            id: "sec-sidebar",
            name: "Sidebar Section",
            actions: [
              {
                id: "act-click",
                name: "Quick Action",
                event: "click",
                url: "/api/quick-action",
                method: "POST",
              },
            ],
            componentBindings: [
              {
                id: "bind-sidebar",
                name: "Sidebar",
                componentType: "sidebar",
                propMappings: {
                  sidebarStaticItems: [
                    { id: "item-1", name: "Run Quick Action", itemType: "action", actionId: "act-click" },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    const edge: BackendEdge = {
      id: "edge-actions",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp-actions",
      sourceHandle: "private-in",
      target: "node-layout-actions",
      targetHandle: "page-in",
    };

    const result = compileWebPageNodes(
      [webAppNode, layoutNode],
      [],
      [],
      [webAppNode, layoutNode],
      [edge],
      "ActionsApp",
    );

    // Verify LayoutEventsDrawer.tsx is generated even without realtime connections
    const drawerFile = result.files.find((f) => f.filename.includes("LayoutEventsDrawer.tsx"));
    expect(drawerFile).toBeDefined();
    expect(drawerFile!.content).toContain("Layout Output Log");

    // Verify layout.tsx mounts LayoutEventsDrawer
    const layoutFile = result.files.find((f) => f.filename === "app/(private)/layout.tsx");
    expect(layoutFile).toBeDefined();
    expect(layoutFile!.content).toContain('import { LayoutEventsDrawer } from "./_components/LayoutEventsDrawer";');
    expect(layoutFile!.content).toContain("<LayoutEventsDrawer />");

    // Verify SidebarActionButton is generated and dispatches dezign:layout-log
    const sidebarActionFile = result.files.find((f) => f.filename.includes("SidebarActionButton.tsx"));
    expect(sidebarActionFile).toBeDefined();
    expect(sidebarActionFile!.content).toContain("dezign:layout-log");
    expect(sidebarActionFile!.content).toContain("executeApiAction");
  });

  it("generates LayoutEventsDrawer and executes onMount actions when layout node has onMount lifecycle events", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-mount",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "MountApp",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const layoutNode: BackendNode = {
      id: "node-layout-mount",
      type: "webPage",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "layout",
        isLayout: true,
        zoneId: "zone-private",
        sections: [
          {
            id: "sec-init",
            name: "Init",
            actions: [
              {
                id: "act-init",
                name: "InitLayoutData",
                event: "onMount",
                url: "/api/layout-init",
                method: "POST",
              },
            ],
          },
        ],
      },
    };

    const edge: BackendEdge = {
      id: "edge-mount",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp-mount",
      sourceHandle: "private-in",
      target: "node-layout-mount",
      targetHandle: "page-in",
    };

    const result = compileWebPageNodes(
      [webAppNode, layoutNode],
      [],
      [],
      [webAppNode, layoutNode],
      [edge],
      "MountApp",
    );

    // 1. Verify layout.tsx mounts LayoutEventsDrawer
    const layoutFile = result.files.find((f) => f.filename === "app/(private)/layout.tsx");
    expect(layoutFile).toBeDefined();
    expect(layoutFile!.content).toContain("<LayoutEventsDrawer />");

    // 2. Verify LayoutEventsDrawer.tsx executes layout onMount
    const drawerFile = result.files.find((f) => f.filename.includes("LayoutEventsDrawer.tsx"));
    expect(drawerFile).toBeDefined();
    expect(drawerFile!.content).toContain("handleInitlayoutdataAction");
    expect(drawerFile!.content).toContain("runOnMount");
    expect(drawerFile!.content).toContain("dezign:layout-log");

    // 3. Verify action component file was created
    const actionFile = result.files.find((f) => f.filename.includes("InitlayoutdataAction.tsx"));
    expect(actionFile).toBeDefined();
  });

  it("compiles child page with pageLoad / onMount event that dispatches dezign:layout-log to layout logs", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-pageload",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "PageLoadApp",
        zones: [
          { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
        ],
      },
    };

    const pageNode: BackendNode = {
      id: "node-page-items",
      type: "webPage",
      position: { x: 500, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "/items",
        zoneId: "zone-private",
        sections: [
          {
            id: "sec-list",
            name: "List",
            actions: [
              {
                id: "act-load",
                name: "onMount",
                event: "onMount",
                url: "/api/items",
                method: "GET",
              },
            ],
          },
        ],
      },
    };

    const edge: BackendEdge = {
      id: "edge-pageload",
      type: "connection",
      fractionalIndex: "a0",
      source: "node-webapp-pageload",
      sourceHandle: "private-in",
      target: "node-page-items",
      targetHandle: "page-in",
    };

    const result = compileWebPageNodes(
      [webAppNode, pageNode],
      [],
      [],
      [webAppNode, pageNode],
      [edge],
      "PageLoadApp",
    );

    const pageFile = result.files.find((f) => f.filename.includes("items/page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile!.content).toContain("dezign:layout-log");
  });
});
