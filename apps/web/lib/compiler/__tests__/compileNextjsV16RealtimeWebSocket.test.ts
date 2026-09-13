import { describe, it, expect } from "vitest";
import { compileWebPageNodes } from "../compileWebPageNode";
import { BackendNode } from "@/types/canvas";
import { AnyMessagingResource } from "@workspace/canvas/types";

describe("compileWebPageNodes Realtime WebSocket generation", () => {
  it("generates WebSocket listener, room join/leave, and Output Log for manual realtimeConnections", () => {
    const webPageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/chat",
        appSlug: "chat-app",
        realtimeConnections: [
          {
            id: "rtc-chat-room",
            protocol: "WEBSOCKET",
            eventName: "chat.message",
            room: "room:lobby",
            sourceServiceNodeId: "node-service-chat",
            sourceServiceLabel: "ChatService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-chat",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "ChatService",
        port: "8086",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Test Chat App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify WebSocket connection to ws://localhost:8086/ws
    expect(code).toContain('const targetUrl = "ws://localhost:8086/ws";');
    expect(code).toContain('ws = new WebSocket(targetUrl);');

    // 2. Verify room subscription on connection open
    expect(code).toContain('ws?.send(JSON.stringify({ action: "join", room: "room:lobby" }))');

    // 3. Verify room cleanup on unmount
    expect(code).toContain('ws.send(JSON.stringify({ action: "leave", room: "room:lobby" }))');
    expect(code).toContain("ws.close()");

    // 4. Verify message handler logs with WebSocket event type
    expect(code).toContain('eventType: "WebSocket"');
    expect(code).toContain('method: "WS"');

    // 5. Verify UI contains the Output Log card and WebSocket Connected badge
    expect(code).toContain("Output Log");
    expect(code).toContain("WebSocket Connected");
    expect(code).toContain("Listening for real-time events...");
  });

  it("discovers pipeline-derived push_to_client WebSocket steps and generates WebSocket client hook", () => {
    const webPageNode: BackendNode = {
      id: "node-page-orders",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/orders",
        appSlug: "storefront",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-orders",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "OrderService",
        port: "8095",
      },
    };

    const events: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-order-status-changed",
        name: "orderStatusChanged",
        nodeId: "node-service-orders",
        variant: "consume",
        pipelineSteps: [
          {
            id: "step-push-orders",
            name: "pushOrderStatus",
            type: "push_to_client",
            enabled: true,
            clientDeliveryProtocol: "WEBSOCKET",
            clientDeliveryEventName: "order.updated",
            clientDeliveryRoom: "orders:live",
            clientDeliveryTargetPageId: "node-page-orders",
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
      "Test Storefront App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify WebSocket connection to OrderService port
    expect(code).toContain('const targetUrl = "ws://localhost:8095/ws";');
    expect(code).toContain('ws = new WebSocket(targetUrl);');
    expect(code).toContain('ws?.send(JSON.stringify({ action: "join", room: "orders:live" }))');
    expect(code).toContain('eventType: "WebSocket"');
    expect(code).toContain("WebSocket Connected");
  });

  it("attaches auth token when auth node is connected and WebSocket connection is made", () => {
    const authNode: BackendNode = {
      id: "node-auth-main",
      type: "auth",
      position: { x: -300, y: 0 },
      fractionalIndex: "a-1",
      data: {
        label: "Auth",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-private-feed",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/feed",
        appSlug: "secure-app",
        authNodeId: "node-auth-main",
        realtimeConnections: [
          {
            id: "rtc-private-feed",
            protocol: "WEBSOCKET",
            eventName: "feed.item",
            room: "private:user-123",
            sourceServiceNodeId: "node-service-feed",
            sourceServiceLabel: "FeedService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-feed",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "FeedService",
        port: "8099",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [authNode, webPageNode, serviceNode],
      [],
      "Test Secure App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify token retrieval and parameter attachment
    expect(code).toContain('import { getAuthBearerToken } from "@/lib/auth-token";');
    expect(code).toContain("await getAuthBearerToken()");
    expect(code).toContain('?token=${encodeURIComponent(token)}');
    expect(code).toContain('ws?.send(JSON.stringify({ action: "join", room: "private:user-123" }))');
  });

  it("does NOT display 'WebRTC Connected' or establish WebRTC peer connection when switched back to WebSocket", () => {
    // WebPage previously had WebRTC configuration or residual media flags, but is now WEBSOCKET
    const webPageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/chat",
        appSlug: "chat-app",
        realtimeConnections: [
          // A stale manual WebRTC entry that previously pointed to the service
          {
            id: "rtc-stale-webrtc",
            protocol: "WEBRTC",
            eventName: "data-channel",
            room: "room:lobby",
            mediaMode: "audio-video",
            enableMic: true,
            enableCamera: true,
            sourceServiceNodeId: "node-service-chat",
            sourceServiceLabel: "ChatService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-chat",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "ChatService",
        port: "8086",
      },
    };

    // The active pipeline step push was switched back to WEBSOCKET
    const events: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-chat-message",
        name: "chatMessage",
        nodeId: "node-service-chat",
        variant: "consume",
        pipelineSteps: [
          {
            id: "step-push-chat",
            name: "pushChatMessage",
            type: "push_to_client",
            enabled: true,
            clientDeliveryProtocol: "WEBSOCKET",
            clientDeliveryEventName: "chat.message",
            clientDeliveryRoom: "room:lobby",
            clientDeliveryTargetPageId: "node-page-chat",
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
      "Test Chat App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Output Log MUST contain WebSocket Connected
    expect(code).toContain("WebSocket Connected");

    // 2. Output Log MUST NOT contain WebRTC Connected
    expect(code).not.toContain("WebRTC Connected");

    // 3. MUST NOT initiate RTCPeerConnection or media stream components
    expect(code).not.toContain("RTCPeerConnection");
    expect(code).not.toContain("initWebRtc");
    expect(code).not.toContain("localVideoRef");
    expect(code).not.toContain("remoteVideoRef");
    expect(code).not.toContain("webrtc-data");

    // 4. MUST initiate WebSocket
    expect(code).toContain("new WebSocket(targetUrl)");
    expect(code).toContain('eventType: "WebSocket"');
  });

  it("ensures manual connection with protocol WEBSOCKET and residual media flags does not render WebRTC", () => {
    const webPageNode: BackendNode = {
      id: "node-page-dashboard",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/dashboard",
        appSlug: "dash-app",
        realtimeConnections: [
          {
            id: "rtc-dash",
            protocol: "WEBSOCKET",
            eventName: "dash.update",
            // Residual fields from when it was previously WebRTC
            mediaMode: "audio-video" as any,
            enableMic: true,
            enableCamera: true,
            sourceServiceNodeId: "node-service-dash",
            sourceServiceLabel: "DashService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-dash",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "DashService",
        port: "8087",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Test Dash App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    expect(code).toContain("WebSocket Connected");
    expect(code).not.toContain("WebRTC Connected");
    expect(code).not.toContain("RTCPeerConnection");
    expect(code).not.toContain("initWebRtc");
  });
});
