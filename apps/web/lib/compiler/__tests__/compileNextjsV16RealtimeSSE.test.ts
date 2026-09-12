import { describe, it, expect } from "vitest";
import { compileWebPageNodes } from "../compileWebPageNode";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";

describe("compileWebPageNodes Realtime SSE generation", () => {
  it("generates EventSource listener and Output Log for manual realtimeConnections", () => {
    const webPageNode: BackendNode = {
      id: "node-page-orders",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/orders",
        appSlug: "storefront",
        realtimeConnections: [
          {
            id: "rtc-order-notif",
            protocol: "SSE",
            eventName: "order.created",
            sourceServiceNodeId: "node-service-order",
            sourceServiceLabel: "OrderService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-order",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "OrderService",
        port: "8085",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Test App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify EventSource connection to the service's SSE endpoint
    expect(code).toContain('new EventSource("http://localhost:8085/events", { withCredentials: true })');
    expect(code).toContain('es.addEventListener("order.created"');
    expect(code).toContain('eventType: "SSE"');
    expect(code).toContain("es.close()");

    // Verify UI contains the Output Log card and live stream indicator
    expect(code).toContain("Output Log");
    expect(code).toContain("Live Stream Active");
    expect(code).toContain("Listening for real-time events...");
  });

  it("discovers pipeline-derived push_to_client SSE steps and generates EventSource hook", () => {
    const webPageNode: BackendNode = {
      id: "node-page-feed",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/",
        isRoot: true,
        appSlug: "live-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-notif",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "NotificationService",
        port: "8090",
      },
    };

    const events: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-message-sent",
        name: "messageSent",
        nodeId: "node-service-notif",
        variant: "consume",
        pipelineSteps: [
          {
            id: "step-push-feed",
            name: "pushNotification",
            type: "push_to_client",
            enabled: true,
            clientDeliveryProtocol: "SSE",
            clientDeliveryEventName: "message.notification",
            clientDeliveryTargetPageId: "node-page-feed",
          },
        ],
      },
    ];

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      events,
      [webPageNode, serviceNode],
      [],
      "Test App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    expect(code).toContain('new EventSource("http://localhost:8090/events", { withCredentials: true })');
    expect(code).toContain('es.addEventListener("message.notification"');
    expect(code).toContain('eventType: "SSE"');
    expect(code).toContain("es.close()");
    expect(code).toContain("Live Stream Active");
  });
});
