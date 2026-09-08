import { describe, it, expect } from "vitest";
import { renderPipelineStep, renderPipeline } from "../generators/routeGenerator/pipelineRenderer";
import { generateEndpointRouteHandler } from "../generators/routeGenerator/endpointHandlerGenerator";
import { PipelineStep, Endpoint } from "@workspace/canvas/types";

describe("LangGraph Invoke Pipeline Step Compiler", () => {
  describe("Streaming Mode (SSE)", () => {
    it("renders streaming SSE route handler when langGraphStreamingEnabled is true", () => {
      const step: PipelineStep = {
        id: "step-agent-1",
        name: "SupportAgent",
        type: "langgraph_invoke",
        outputVariable: "agentResult",
        langGraphTargetNodeId: "agent1",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphStateMapping: {
          messages: "body.message",
          userId: "headers.x-user-id",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('res.setHeader("Content-Type", "text/event-stream")');
      expect(code).toContain('res.setHeader("Cache-Control", "no-cache")');
      expect(code).toContain('res.setHeader("Connection", "keep-alive")');
      expect(code).toContain('await agent1Graph.stream(agentState, { streamMode: "messages" })');
      expect(code).toContain('res.write(`data: ${JSON.stringify({ token, node: nodeName })}\\n\\n`)');
      expect(code).toContain('res.write("data: [DONE]\\n\\n")');
      expect(code).toContain("res.end()");
      expect(code).toContain('"messages": body.message');
      expect(code).toContain('"userId": req.headers["x-user-id"]');
    });

    it("filters streamed tokens by state channel when langGraphStreamingFields is provided", () => {
      const step: PipelineStep = {
        id: "step-agent-2",
        name: "FilteredAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "agent2",
        langGraphStreamingEnabled: true,
        langGraphStreamingFields: ["agentNode", "finalAnswer"],
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('["agentNode","finalAnswer"].includes(nodeName || "")');
    });
  });

  describe("Synchronous Mode (Non-streaming)", () => {
    it("renders await graph.invoke() with full_state output by default", () => {
      const step: PipelineStep = {
        id: "step-agent-3",
        name: "SyncAgent",
        type: "langgraph_invoke",
        outputVariable: "syncResult",
        langGraphTargetNodeId: "agentSync",
        langGraphStreamingEnabled: false,
        langGraphOutputMode: "full_state",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const syncResultRaw = await agentSyncGraph.invoke(agentState);");
      expect(code).toContain("const syncResult = syncResultRaw;");
    });

    it("extracts last message content when langGraphOutputMode is last_message", () => {
      const step: PipelineStep = {
        id: "step-agent-4",
        name: "MessageAgent",
        type: "langgraph_invoke",
        outputVariable: "lastMessage",
        langGraphTargetNodeId: "agentMsg",
        langGraphStreamingEnabled: false,
        langGraphOutputMode: "last_message",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const lastMessageRaw = await agentMsgGraph.invoke(agentState);");
      expect(code).toContain("lastMessageRaw.messages[lastMessageRaw.messages.length - 1]?.content");
    });

    it("extracts specific fields when langGraphOutputMode is specific_fields", () => {
      const step: PipelineStep = {
        id: "step-agent-5",
        name: "FieldsAgent",
        type: "langgraph_invoke",
        outputVariable: "agentOutput",
        langGraphTargetNodeId: "agentFields",
        langGraphStreamingEnabled: false,
        langGraphOutputMode: "specific_fields",
        langGraphOutputFields: ["answer", "confidence"],
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('"answer": agentOutputRaw?.answer');
      expect(code).toContain('"confidence": agentOutputRaw?.confidence');
    });
  });

  describe("Endpoint Route Handler Integration", () => {
    it("does not emit fallback res.status(200).json() when streaming langgraph_invoke step is present", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-chat",
        nodeId: "service-1",
        name: "/api/chat",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-agent-stream",
            name: "ChatAgent",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatAgent",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "ChatService",
        pascalServiceName: "ChatService",
        serviceFolderName: "chatservice",
        allNodes: [],
        allEdges: [],
        allEndpoints: [ep],
        dbFunctions: [],
        kafkaFunctions: [],
        redisFunctions: [],
        nodePublishedEvents: [],
        usedFileNames: new Set(),
      });

      const content = result.file.content;

      // Should have SSE streaming logic
      expect(content).toContain('res.setHeader("Content-Type", "text/event-stream")');
      expect(content).toContain("await chatAgentGraph.stream(");
      // Should NOT have the trailing fallback json response
      expect(content).not.toContain("return res.status(201).json({ data:");
      expect(content).not.toContain("return res.status(200).json({ data:");
      // Should have safe error handling for streaming
      expect(content).toContain("if (res.headersSent) {");
      expect(content).toContain("res.write(`data: ${JSON.stringify({ error: message })}\\n\\n`);");
    });
  });
});
