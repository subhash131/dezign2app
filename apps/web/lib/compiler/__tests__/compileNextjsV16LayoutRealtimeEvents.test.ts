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
});
