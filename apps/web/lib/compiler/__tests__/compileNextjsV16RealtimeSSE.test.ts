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

  it("discovers pipeline-derived langgraph_invoke streaming SSE steps connected to page_ref node", () => {
    const webPageNode: BackendNode = {
      id: "node-page-dashboard",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/dashboard",
        appSlug: "ai-assistant",
      },
    };

    const pageRefNode: BackendNode = {
      id: "node-page-ref-1",
      type: "page_ref",
      position: { x: 700, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "Dashboard Ref",
        targetPageId: "node-page-dashboard",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-conversations",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Conversations",
        port: "8080",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-send-msg",
        name: "sendMessage",
        type: "POST",
        nodeId: "node-service-conversations",
        pipelineSteps: [
          {
            id: "step-lg-invoke",
            name: "invokeLangGraph",
            type: "langgraph_invoke",
            enabled: true,
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            clientDeliveryPageRefNodeId: "node-page-ref-1",
          },
        ],
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-ep-to-pref",
        source: "node-service-conversations",
        sourceHandle: "ep-send-msg-right",
        target: "node-page-ref-1",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileWebPageNodes(
      [webPageNode],
      endpoints,
      [],
      [webPageNode, serviceNode, pageRefNode],
      edges,
      "AI Assistant",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify EventSource connection to the service's SSE endpoint and agent stream listener
    expect(code).toContain('new EventSource("http://localhost:8080/events", { withCredentials: true })');
    expect(code).toContain('es.addEventListener("sendMessage"');
    expect(code).toContain('eventType: "SSE"');
    expect(code).toContain("es.close()");
    expect(code).toContain("Live Stream Active");
  });

  it("generates dynamic route path and query parameter mappings for client delivery SSE", () => {
    const webPageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/chat/[id]",
        appSlug: "ai-chat",
        pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
        realtimeConnections: [
          {
            id: "rtc-chat-stream",
            protocol: "SSE",
            eventName: "chat_stream",
            sourceServiceNodeId: "node-service-chat",
            sourceServiceLabel: "ChatService",
            pathParamBindings: { id: "params.id" },
            queryParamBindings: { userId: "query.userId" },
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
        port: "8082",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Chat App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify dynamic route imports and hooks
    expect(code).toContain('import { useParams, useSearchParams } from "next/navigation";');
    expect(code).toContain("const routeParams = useParams();");
    expect(code).toContain("const routeSearchParams = useSearchParams();");

    // Verify dynamic URL interpolation with pathParamBindings and queryParamBindings
    expect(code).toContain('let effectiveUrl = "http://localhost:8082/events";');
    expect(code).toContain("const sseParams = new URLSearchParams();");
    expect(code).toContain('routeSearchParams?.get("userId")');
    expect(code).toContain("new EventSource(effectiveUrl, { withCredentials: true })");

    // Verify useEffect re-subscribes when route params or search params change
    expect(code).toContain("}, [routeParams, routeSearchParams]);");
  });

  it("routes two LangGraph streaming steps in the same endpoint to their respective different pages", () => {
    const page1Node: BackendNode = {
      id: "node-page-1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/agent-one",
        appSlug: "ai-app",
      },
    };

    const page2Node: BackendNode = {
      id: "node-page-2",
      type: "webPage",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "/agent-two",
        appSlug: "ai-app",
      },
    };

    const pageRef1: BackendNode = {
      id: "node-page-ref-1",
      type: "page_ref",
      position: { x: 700, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "Ref: /agent-one",
        targetPageId: "node-page-1",
      },
    };

    const pageRef2: BackendNode = {
      id: "node-page-ref-2",
      type: "page_ref",
      position: { x: 700, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "Ref: /agent-two",
        targetPageId: "node-page-2",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-ai",
      type: "service",
      position: { x: 400, y: 100 },
      fractionalIndex: "a4",
      data: {
        label: "AiService",
        port: "8080",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-send-msg",
        name: "sendMessage",
        type: "POST",
        nodeId: "node-service-ai",
        pipelineSteps: [
          {
            id: "step-agent-1",
            name: "First Agent",
            type: "langgraph_invoke",
            enabled: true,
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            clientDeliveryEventName: "agent_one_stream",
            clientDeliveryTargetPageId: "node-page-1",
            clientDeliveryPageRefNodeId: "node-page-ref-1",
          },
          {
            id: "step-agent-2",
            name: "Second Agent",
            type: "langgraph_invoke",
            enabled: true,
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
            clientDeliveryEventName: "agent_two_stream",
            clientDeliveryTargetPageId: "node-page-2",
            clientDeliveryPageRefNodeId: "node-page-ref-2",
          },
        ],
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-ep-to-ref1",
        source: "node-service-ai",
        sourceHandle: "endpoint-out-ep-send-msg",
        target: "node-page-ref-1",
        targetHandle: "page-ref-in",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-ep-to-ref2",
        source: "node-service-ai",
        sourceHandle: "endpoint-out-ep-send-msg",
        target: "node-page-ref-2",
        targetHandle: "page-ref-in",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const result = compileWebPageNodes(
      [page1Node, page2Node],
      endpoints,
      [],
      [page1Node, page2Node, serviceNode, pageRef1, pageRef2],
      edges,
      "AI App",
    );

    const page1File = result.files.find((f) => f.filename.includes("agent-one") && f.filename.includes("page.tsx"));
    const page2File = result.files.find((f) => f.filename.includes("agent-two") && f.filename.includes("page.tsx"));

    expect(page1File).toBeDefined();
    expect(page2File).toBeDefined();

    const page1Code = page1File!.content;
    const page2Code = page2File!.content;

    // Page 1 receives agent_one_stream, but NOT agent_two_stream
    expect(page1Code).toContain('es.addEventListener("agent_one_stream"');
    expect(page1Code).not.toContain('es.addEventListener("agent_two_stream"');

    // Page 2 receives agent_two_stream, but NOT agent_one_stream
    expect(page2Code).toContain('es.addEventListener("agent_two_stream"');
    expect(page2Code).not.toContain('es.addEventListener("agent_one_stream"');
  });
});

