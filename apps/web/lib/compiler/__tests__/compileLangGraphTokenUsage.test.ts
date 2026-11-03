import { describe, it, expect } from "vitest";
import { compileLangGraphNode } from "../compileLangGraphNode";
import type { BackendNode, BackendEdge, Endpoint } from "@/types/canvas";

describe("compileLangGraphNode Token Usage tracking", () => {
  const baseNode = {
    id: "lg-1",
    type: "langgraph",
    position: { x: 0, y: 0 },
    data: {
      label: "Customer Support Agent",
      nodes: [
        {
          id: "agent-1",
          type: "langgraph_agent",
          position: { x: 100, y: 100 },
          data: {
            name: "supportAgent",
            systemPrompt: "You are a helpful assistant",
          },
        },
      ],
      edges: [],
    },
  } as unknown as BackendNode;

  const streamEdges = [
    {
      id: "e-1",
      type: "canvas-edge",
      source: "ep-node-1",
      sourceHandle: "endpoint-out-ep-1",
      target: "lg-1",
      data: {
        responseExecutionMode: "stream",
      },
    },
  ] as unknown as BackendEdge[];

  const syncEdges = [
    {
      id: "e-1",
      type: "canvas-edge",
      source: "ep-node-1",
      sourceHandle: "endpoint-out-ep-1",
      target: "lg-1",
      data: {
        responseExecutionMode: "sync",
      },
    },
  ] as unknown as BackendEdge[];

  const endpoints: Endpoint[] = [
    {
      id: "ep-1",
      name: "/chat",
      type: "POST",
    },
  ];

  it("compiles streaming server route with token usage tracking and callback handler by default", () => {
    const result = compileLangGraphNode(baseNode, {
      edges: streamEdges,
      endpoints,
      outputMode: "app",
    });

    const serverFile = result.files.find((f) => f.filename === "src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile!.content).toContain("class TokenUsageHandler extends BaseCallbackHandler");
    expect(serverFile!.content).toContain("extractTokenUsage");
    expect(serverFile!.content).toContain("tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }");
    expect(serverFile!.content).toContain("tokenUsage.completion_tokens += 1");
    expect(serverFile!.content).toContain('{ type: "usage", usage: tokenUsage }');
  });

  it("compiles synchronous server route with TokenUsageHandler callback and message usage_metadata extractor", () => {
    const result = compileLangGraphNode(baseNode, {
      edges: syncEdges,
      endpoints,
      outputMode: "app",
    });

    const serverFile = result.files.find((f) => f.filename === "src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile!.content).toContain("const tokenHandler = new TokenUsageHandler();");
    expect(serverFile!.content).toContain("callbacks: [tokenHandler]");
    expect(serverFile!.content).toContain("const usage = extractTokenUsage(result, tokenHandler);");
    expect(serverFile!.content).toContain("res.json({ ok: true, result: result, usage });");
  });

  it("suppresses token usage tracking when trackTokenUsage is explicitly false in context", () => {
    const result = compileLangGraphNode(baseNode, {
      edges: streamEdges,
      endpoints,
      outputMode: "app",
      trackTokenUsage: false,
    });

    const serverFile = result.files.find((f) => f.filename === "src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile!.content).not.toContain("class TokenUsageHandler");
    expect(serverFile!.content).not.toContain("tokenUsage = { prompt_tokens: 0");
    expect(serverFile!.content).not.toContain("tokenUsage.completion_tokens += 1");
    expect(serverFile!.content).not.toContain('{ type: "usage", usage: tokenUsage }');
  });

  it("suppresses token usage tracking when agent explicitly disabled token usage in inspector data", () => {
    const disabledAgentNode = {
      ...baseNode,
      data: {
        ...baseNode.data,
        nodes: [
          {
            id: "agent-1",
            type: "langgraph_agent",
            position: { x: 100, y: 100 },
            data: {
              name: "supportAgent",
              trackTokenUsage: false,
            },
          },
        ],
      },
    } as unknown as BackendNode;

    const result = compileLangGraphNode(disabledAgentNode, {
      edges: streamEdges,
      endpoints,
      outputMode: "app",
    });

    const serverFile = result.files.find((f) => f.filename === "src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile!.content).not.toContain("class TokenUsageHandler");
    expect(serverFile!.content).not.toContain("tokenUsage = { prompt_tokens: 0");
  });
});
