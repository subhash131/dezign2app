import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@workspace/ui/components/popover", () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (val: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    children,
    value,
  }: {
    children?: React.ReactNode;
    value?: string;
  }) => <div data-value={value}>{children}</div>,
}));

vi.mock("../web-page-event-config/action-flow/ActionFlowCombobox", () => ({
  ActionFlowCombobox: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange: (val: string) => void;
    placeholder?: string;
  }) => (
    <input
      data-testid="mock-combobox"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

import { IncomingRealtimePayloadCard } from "../web-page-event-config/action-flow/IncomingRealtimePayloadCard";
import {
  RealtimeSubscriptionMappingSection,
  resolveRealtimePayloadPaths,
} from "../web-page-realtime-config";
import type { BackendNode, BackendEdge, RealtimeConnection } from "@workspace/canvas";

describe("IncomingRealtimePayloadCard", () => {
  it("renders live payload card with detected fields and toggles sample JSON preview", () => {
    const mockPaths = [
      { path: "message", type: "string", description: "Message body" },
      { path: "id", type: "string", description: "Identifier" },
      { path: "sender.name", type: "string", description: "Sender name" },
    ];

    render(
      <IncomingRealtimePayloadCard
        eventName="send-message/:id"
        protocol="SSE"
        sourceServiceLabel="Conversations"
        sourceItemName="send-message/:id"
        incomingPaths={mockPaths}
      />
    );

    // Verify header and stream metadata badges
    expect(screen.getByText("Incoming Real-Time Payload")).toBeDefined();
    expect(screen.getByText("send-message/:id")).toBeDefined();
    expect(screen.getByText("SSE")).toBeDefined();
    expect(screen.getAllByText(/Conversations/i).length).toBeGreaterThanOrEqual(1);

    // Verify detected schema field pills
    expect(screen.getByText("message")).toBeDefined();
    expect(screen.getByText("id")).toBeDefined();
    expect(screen.getByText("sender.name")).toBeDefined();

    // Toggle sample JSON preview
    const sampleJsonBtn = screen.getByText(/Sample JSON Structure/i);
    expect(sampleJsonBtn).toBeDefined();
    fireEvent.click(sampleJsonBtn);

    // Verify JSON preview is visible
    expect(screen.getAllByText(/Hide/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Hello from realtime stream/i)).toBeDefined();
  });

  it("renders sourceStepName and step index badge in IncomingRealtimePayloadCard", () => {
    render(
      <IncomingRealtimePayloadCard
        eventName="send-message"
        protocol="SSE"
        sourceServiceLabel="Ai Service"
        sourceItemName="send-message"
        sourceStepName="LangGraph Agent"
        sourceStepType="langgraph_invoke"
        sourceStepIndex={1}
      />
    );

    expect(screen.getAllByText(/Step 1: LangGraph Agent/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("RealtimeSubscriptionMappingSection", () => {
  it("detects route parameters and allows configuring subscription bindings", () => {
    const mockConn: RealtimeConnection = {
      id: "rtc-test-1",
      protocol: "SSE",
      eventName: "send-message/:id",
      subscriptionBindings: [
        {
          id: "sub-1",
          slot: "path_param",
          targetField: "id",
          source: { kind: "route_param", paramName: "id" },
        },
      ],
    };

    const mockPageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Dashboard",
        pathParams: [{ name: "id", type: "string", id: "234", required: false }],
        queryParams: [{ name: "filter", type: "string", id: "235", required: false   }],
      },
    };

    const onUpdate = vi.fn();

    render(
      <RealtimeSubscriptionMappingSection
        conn={mockConn}
        pageNode={mockPageNode}
        allNodes={[mockPageNode]}
        onUpdate={onUpdate}
      />
    );

    // Verify auto-map button and path parameters section
    expect(screen.getByText(/Auto-map/i)).toBeDefined();
    expect(screen.getByText("Path Parameters")).toBeDefined();
    expect(screen.getByText(":id")).toBeDefined();

    // Verify generated subscription code preview
    expect(screen.getByText("Generated Subscription Code Preview")).toBeDefined();
    expect(screen.getByText(/EventSource/i)).toBeDefined();
  });
});

describe("resolveRealtimePayloadPaths", () => {
  it("resolves concrete Entity and interface types instead of generic object", () => {
    const messageEntityNode: BackendNode = {
      id: "ent-message",
      type: "entity",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Message",
        columns: [
          { name: "id", type: "string" },
          { name: "content", type: "string" },
          { name: "senderId", type: "string" },
          { name: "createdAt", type: "string" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 0, y: 0 },
      data: {
        label: "Conversations",
      },
    };

    const edge: BackendEdge = {
      id: "edge-1",
      source: "srv-conversations",
      target: "ent-message",
      type: "connection",
      fractionalIndex: "a0",
    };

    const conn: RealtimeConnection = {
      id: "conn-1",
      protocol: "SSE",
      eventName: "send-message/:id",
      sourceServiceLabel: "Conversations",
      sourceItemName: "send-message/:id",
    };

    const paths = resolveRealtimePayloadPaths({
      conn,
      derivedInfo: null,
      endpoints: [],
      events: [],
      nodes: [serviceNode, messageEntityNode],
      edges: [edge],
    });

    // Verify concrete types are derived — ZERO "object" types
    expect(paths.some((p) => p.type === "object")).toBe(false);

    // Verify data is typed as Message entity
    const dataField = paths.find((p) => p.path === "data");
    expect(dataField).toBeDefined();
    expect(dataField?.type).toBe("Message");

    // Verify nested entity columns
    expect(paths.some((p) => p.path === "data.content" && p.type === "string")).toBe(true);
    expect(paths.some((p) => p.path === "data.senderId" && p.type === "string")).toBe(true);
    expect(paths.some((p) => p.path === "data.createdAt" && p.type === "string")).toBe(true);
  });

  it("resolves token, node, and reasoning payload paths when linked to a LangGraph streaming step", () => {
    const langGraphNode: BackendNode = {
      id: "node-lg-1",
      type: "langgraph",
      fractionalIndex: "a2",
      position: { x: 400, y: 0 },
      data: {
        label: "ChatAgent",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
          { key: "userPreferences", type: "object", reducer: "replace" },
        ],
      },
    };

    const lgStep: any = {
      id: "step-lg-invoke",
      type: "langgraph_invoke",
      name: "Invoke ChatAgent",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      langGraphStreamModes: ["messages"],
      langGraphStreamIncludeReasoning: true,
      langGraphTargetNodeId: "node-lg-1",
    };

    const conn: RealtimeConnection = {
      id: "conn-lg",
      protocol: "SSE",
      eventName: "message",
      sourceServiceLabel: "Conversations",
      sourceItemName: "/send-message/:id",
      isLangGraph: true,
      langGraphStreamModes: ["messages"],
      langGraphStreamIncludeReasoning: true,
      langGraphTargetNodeId: "node-lg-1",
    };

    const paths = resolveRealtimePayloadPaths({
      conn,
      derivedInfo: {
        step: lgStep,
        sourceNode: undefined,
        sourceEventId: null,
        sourceEndpointId: "ep-1",
      },
      endpoints: [
        {
          id: "ep-1",
          name: "/send-message/:id",
          type: "POST",
          pipelineSteps: [lgStep],
          nodeId: "srv-1",
        },
      ],
      events: [],
      nodes: [langGraphNode],
      edges: [],
    });

    // Check token, node, reasoning, done, content are populated
    expect(paths.some((p) => p.path === "token" && p.type === "string")).toBe(true);
    expect(paths.some((p) => p.path === "node" && p.type === "string")).toBe(true);
    expect(paths.some((p) => p.path === "reasoning" && p.type === "string")).toBe(true);
    expect(paths.some((p) => p.path === "done" && p.type === "boolean")).toBe(true);
    expect(paths.some((p) => p.path === "content" && p.type === "string")).toBe(true);
  });

  it("resolves state channels when LangGraph streaming mode includes 'values'", () => {
    const langGraphNode: BackendNode = {
      id: "node-lg-1",
      type: "langgraph",
      fractionalIndex: "a2",
      position: { x: 400, y: 0 },
      data: {
        label: "ChatAgent",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
          { key: "context", type: "string", reducer: "replace" },
        ],
      },
    };

    const lgStep: any = {
      id: "step-lg-invoke-values",
      type: "langgraph_invoke",
      name: "Invoke ChatAgent Values",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      langGraphStreamModes: ["values"],
      langGraphTargetNodeId: "node-lg-1",
    };

    const conn: RealtimeConnection = {
      id: "conn-lg-values",
      protocol: "SSE",
      eventName: "message",
      isLangGraph: true,
      langGraphStreamModes: ["values"],
      langGraphTargetNodeId: "node-lg-1",
    };

    const paths = resolveRealtimePayloadPaths({
      conn,
      derivedInfo: {
        step: lgStep,
        sourceNode: undefined,
        sourceEventId: null,
        sourceEndpointId: "ep-1",
      },
      endpoints: [],
      events: [],
      nodes: [langGraphNode],
      edges: [],
    });

    expect(paths.some((p) => p.path === "data")).toBe(true);
    expect(paths.some((p) => p.path === "data.messages")).toBe(true);
    expect(paths.some((p) => p.path === "data.context")).toBe(true);
    expect(paths.some((p) => p.path === "mode")).toBe(true);
  });
});

