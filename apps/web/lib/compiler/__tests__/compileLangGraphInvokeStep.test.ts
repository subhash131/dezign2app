import { describe, it, expect } from "vitest";
import { renderPipelineStep, renderPipeline } from "../generators/routeGenerator/pipelineRenderer";
import { generateEndpointRouteHandler } from "../generators/routeGenerator/endpointHandlerGenerator";
import { generateResponseInterface } from "../generators/typesGenerator/responseInference";
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

    it("renders streaming via WebSocket with wsBroadcast", () => {
      const step: PipelineStep = {
        id: "step-agent-ws",
        name: "WsAgent",
        type: "langgraph_invoke",
        outputVariable: "wsResult",
        langGraphTargetNodeId: "agentWs",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "websocket",
        langGraphStreamingRoom: "chat-room-42",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("await agentWsGraph.stream(");
      expect(code).toContain('wsBroadcast("agent_stream", { token, node: nodeName, done: false }, "chat-room-42")');
      expect(code).toContain('wsBroadcast("agent_stream", { done: true }, "chat-room-42")');
      expect(code).toContain('const wsResult = {');
      expect(code).toContain('protocol: "websocket"');
      expect(code).toContain('room: "chat-room-42"');
    });

    it("renders streaming to Kafka topic with publishKafkaEvent", () => {
      const step: PipelineStep = {
        id: "step-agent-kafka",
        name: "KafkaAgent",
        type: "langgraph_invoke",
        outputVariable: "kafkaResult",
        langGraphTargetNodeId: "agentKafka",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "kafka",
        langGraphStreamingKafkaTopic: "ai-tokens-stream",
        langGraphThreadIdSource: "body.thread_id",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("await agentKafkaGraph.stream(");
      expect(code).toContain('await publishKafkaEvent("ai-tokens-stream", { token, node: nodeName, done: false }, body.thread_id)');
      expect(code).toContain('await publishKafkaEvent("ai-tokens-stream", { done: true }, body.thread_id)');
      expect(code).toContain('const kafkaResult = {');
      expect(code).toContain('protocol: "kafka"');
      expect(code).toContain('topic: "ai-tokens-stream"');
    });

    it("renders streaming to Redis Stream with xadd", () => {
      const step: PipelineStep = {
        id: "step-agent-redis",
        name: "RedisAgent",
        type: "langgraph_invoke",
        outputVariable: "redisResult",
        langGraphTargetNodeId: "agentRedis",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "redis_stream",
        langGraphStreamingRedisKey: "stream:chat:123",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const redisClient = await getRedisClient()");
      expect(code).toContain("await agentRedisGraph.stream(");
      expect(code).toContain('await redisClient.xadd("stream:chat:123", "*", "token", String(token), "node", String(nodeName || ""), "done", "false")');
      expect(code).toContain('await redisClient.xadd("stream:chat:123", "*", "token", "", "done", "true")');
      expect(code).toContain('const redisResult = {');
      expect(code).toContain('protocol: "redis_stream"');
      expect(code).toContain('streamKey: "stream:chat:123"');
    });

    it("renders dynamic field-mapped WebSocket room and Redis stream key", () => {
      const wsStep: PipelineStep = {
        id: "step-ws-dyn",
        name: "WsDynAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "agentWs",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "websocket",
        langGraphStreamingRoom: "params.roomId",
      };

      const wsLines = renderPipelineStep(wsStep, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const wsCode = wsLines.join("\n");
      expect(wsCode).toContain('wsBroadcast("agent_stream", { token, node: nodeName, done: false }, req.params.roomId)');

      const redisStep: PipelineStep = {
        id: "step-redis-dyn",
        name: "RedisDynAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "agentRedis",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "redis_stream",
        langGraphStreamingRedisKey: "body.streamKey",
      };

      const redisLines = renderPipelineStep(redisStep, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const redisCode = redisLines.join("\n");
      expect(redisCode).toContain('await redisClient.xadd(body.streamKey, "*", "token", String(token)');
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
      expect(code).toContain("const syncResult = {");
      expect(code).toContain("response: syncResultResponse");
      expect(code).toContain("state: syncResultRaw");
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

    it("passes configurable thread_id when langGraphThreadIdSource is provided (sync invoke)", () => {
      const step: PipelineStep = {
        id: "step-agent-memory",
        name: "MemoryAgent",
        type: "langgraph_invoke",
        outputVariable: "memResult",
        langGraphTargetNodeId: "agentMemory",
        langGraphStreamingEnabled: false,
        langGraphThreadIdSource: "body.thread_id",
        langGraphStateMapping: {
          messages: "body.message",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain(
        "const memResultRaw = await agentMemoryGraph.invoke(agentState, { configurable: { thread_id: body.thread_id } });",
      );
      expect(code).toContain('res.setHeader("X-Thread-Id", String(body.thread_id))');
      // Ensure thread_id is not injected as state channel in agentState
      expect(code).not.toContain('"thread_id"');
      expect(code).toContain('"messages": body.message');
    });

    it("passes configurable thread_id when langGraphThreadIdSource is provided (streaming)", () => {
      const step: PipelineStep = {
        id: "step-agent-stream-mem",
        name: "MemoryStreamAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "agentMemStream",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphThreadIdSource: "headers.x-thread-id",
        langGraphStateMapping: {
          messages: "body.message",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain(
        'await agentMemStreamGraph.stream(agentState, { streamMode: "messages", configurable: { thread_id: req.headers["x-thread-id"] } })',
      );
      expect(code).toContain('res.setHeader("X-Thread-Id", String(req.headers["x-thread-id"]))');
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

    it("omits pinned return_response step and adds res.writableEnded guard when streaming is enabled", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-agent-stream-with-return",
        name: "/send-message/:id",
        type: "POST",
        nodeId: "service-1",
        pipelineSteps: [
          {
            id: "step-agent",
            name: "LangGraph Agent",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "langGraphAgent",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
          },
          {
            id: "return-response-step",
            name: "Return Response",
            type: "return_response",
            statusCode: 201,
            inputBindings: [],
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "Conversations",
        pascalServiceName: "Conversations",
        serviceFolderName: "conversations",
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

      // Must have SSE streaming logic
      expect(content).toContain('res.setHeader("Content-Type", "text/event-stream")');
      expect(content).toContain('res.write("data: [DONE]\\n\\n")');
      expect(content).toContain("res.end()");

      // Must NOT render return_response res.status(201).json
      expect(content).not.toContain("return res.status(201).json");
      expect(content).not.toContain("Pipeline Step: Return Response");

      // Must include writableEnded guard in catch block to avoid write after end
      expect(content).toContain("if (res.writableEnded) {");
      expect(content).toContain("return;");
    });

    it("renders streaming raw plaintext route handler when langGraphStreamingProtocol is raw", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-agent-stream-raw",
        name: "/send-message/:id",
        type: "POST",
        nodeId: "service-1",
        pipelineSteps: [
          {
            id: "step-agent",
            name: "LangGraph Agent",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "langGraphAgent",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "raw",
          },
          {
            id: "return-response-step",
            name: "Return Response",
            type: "return_response",
            statusCode: 201,
            inputBindings: [],
          },
        ],
      };

      const result = generateEndpointRouteHandler({
        ep,
        index: 0,
        serviceName: "Conversations",
        pascalServiceName: "Conversations",
        serviceFolderName: "conversations",
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

      // Must have raw stream headers
      expect(content).toContain('res.setHeader("Content-Type", "text/plain; charset=utf-8")');
      expect(content).toContain('res.setHeader("Transfer-Encoding", "chunked")');
      expect(content).not.toContain('res.setHeader("Content-Type", "text/event-stream")');

      // Must stream raw tokens without SSE data: [DONE] framing
      expect(content).toContain('res.write(typeof token === "string" ? token : JSON.stringify(token));');
      expect(content).not.toContain('res.write("data: [DONE]\\n\\n")');
      expect(content).toContain("res.end()");

      // Must NOT render return_response res.status(201).json
      expect(content).not.toContain("return res.status(201).json");

      // Must include writableEnded guard in catch block
      expect(content).toContain("if (res.writableEnded) {");
      expect(content).toContain("[ERROR:");
    });
  });

  describe("Dedicated Messages Configuration (Single, Dynamic System & Bulk)", () => {
    it("renders single-turn mode wrapping input in HumanMessage", () => {
      const step: PipelineStep = {
        id: "step-agent-single",
        name: "SupportAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "supportAgent",
        langGraphMessagesConfig: {
          mode: "single",
          userMessageSource: "body.prompt",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const supportAgentMessages = [");
      expect(code).toContain('new HumanMessage(String(body.prompt || ""))');
      expect(code).toContain('"messages": supportAgentMessages');
    });

    it("renders single-turn mode with dynamic SystemMessage", () => {
      const step: PipelineStep = {
        id: "step-agent-system",
        name: "ContextAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "contextAgent",
        langGraphMessagesConfig: {
          mode: "single",
          userMessageSource: "body.message",
          systemMessageSource: "body.systemInstruction",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const contextAgentMessages = [");
      expect(code).toContain("(body.systemInstruction ? [new SystemMessage(String(body.systemInstruction))] : [])");
      expect(code).toContain('new HumanMessage(String(body.message || ""))');
      expect(code).toContain('"messages": contextAgentMessages');
    });

    it("renders bulk messages mode mapping array to BaseMessage instances", () => {
      const step: PipelineStep = {
        id: "step-agent-bulk",
        name: "BulkAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "bulkAgent",
        langGraphMessagesConfig: {
          mode: "bulk",
          bulkMessagesSource: "body.chatHistory",
        },
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const bulkAgentMessagesRaw = Array.isArray(body.chatHistory) ? body.chatHistory : [];");
      expect(code).toContain("...bulkAgentMessagesRaw.map((m: any) => {");
      expect(code).toContain('if (typeof m === "string") return new HumanMessage(m);');
      expect(code).toContain('if (m?.role === "system") return new SystemMessage(content);');
      expect(code).toContain('if (m?.role === "assistant" || m?.role === "ai") return new AIMessage(content);');
      expect(code).toContain("return new HumanMessage(content);");
      expect(code).toContain('"messages": bulkAgentMessages');
    });

    it("generates complete route handler importing HumanMessage and SystemMessage from agent package", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-chat-1",
        nodeId: "service-1",
        name: "/chat",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-chat-invoke",
            name: "ChatBot",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatBot",
            langGraphMessagesConfig: {
              mode: "single",
              userMessageSource: "body.message",
              systemMessageSource: "body.systemPrompt",
            },
            langGraphThreadIdSource: "body.threadId",
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

      // Imports should include graph AND message classes
      expect(content).toContain('import { chatBotGraph, HumanMessage, SystemMessage } from "@workspace/langgraph-chatbot"');
      // Body should instantiate messages safely
      expect(content).toContain('new HumanMessage(String(body.message || ""))');
      expect(content).toContain("new SystemMessage(String(body.systemPrompt))");
      // Thread ID should be passed in configurable
      expect(content).toContain("configurable: { thread_id: body.threadId }");
    });

    it("generates route handler importing ONLY HumanMessage when system prompt is omitted", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-chat-2",
        nodeId: "service-1",
        name: "/chat-simple",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-chat-simple",
            name: "ChatBot",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatBot",
            langGraphMessagesConfig: {
              mode: "single",
              userMessageSource: "body.message",
            },
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

      // Imports should include graph and HumanMessage only (no SystemMessage)
      expect(content).toContain('import { chatBotGraph, HumanMessage } from "@workspace/langgraph-chatbot"');
      expect(content).not.toContain("SystemMessage");
      expect(content).toContain('new HumanMessage(String(body.message || ""))');
    });

    it("generates route handler importing AIMessage and SystemMessage when both optional messages are configured", () => {
      const ep: Endpoint & { nodeId: string } = {
        id: "ep-chat-3",
        nodeId: "service-1",
        name: "/chat-context",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-chat-context",
            name: "ChatBot",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatBot",
            langGraphMessagesConfig: {
              mode: "single",
              userMessageSource: "body.message",
              systemMessageSource: "body.systemPrompt",
              aiMessageSource: "body.aiContext",
            },
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

      expect(content).toContain("HumanMessage");
      expect(content).toContain("SystemMessage");
      expect(content).toContain("AIMessage");
      expect(content).toContain("new SystemMessage(String(body.systemPrompt))");
      expect(content).toContain("new AIMessage(String(body.aiContext))");
      expect(content).toContain('new HumanMessage(String(body.message || ""))');
    });

    it("renders multi-mode streaming options with streamMode array and subgraphs", () => {
      const step: PipelineStep = {
        id: "step-multi-stream",
        name: "AgentMultiStream",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "multiAgent",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphStreamModes: ["messages", "updates"],
        langGraphStreamSubgraphs: true,
        langGraphThreadIdSource: "body.threadId",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('streamMode: ["messages","updates"]');
      expect(code).toContain("configurable: { thread_id: body.threadId }");
      expect(code).toContain("subgraphs: true");
      expect(code).toContain('mode = _c[1]');
      expect(code).toContain('payload = _c[2]');
      expect(code).toContain('mode === "messages"');
      expect(code).toContain('mode === "updates"');
      expect(code).toContain('type: "reasoning"');
      expect(code).toContain('type: "update"');
    });

    it("renders single-mode messages streaming with subgraphs unpacking", () => {
      const step: PipelineStep = {
        id: "step-subgraphs-messages",
        name: "AgentSubgraphsMessages",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "subgraphAgent",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphStreamModes: ["messages"],
        langGraphStreamSubgraphs: true,
        langGraphThreadIdSource: "params.id",
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('streamMode: "messages"');
      expect(code).toContain("subgraphs: true");
      expect(code).toContain("Array.isArray(_c) && _c.length === 2 && Array.isArray(_c[0])");
      expect(code).toContain("payload = _c[1]");
      expect(code).toContain('type: "reasoning"');
    });

    it("renders single-mode updates streaming for agent progress", () => {
      const step: PipelineStep = {
        id: "step-progress-stream",
        name: "AgentProgress",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "progressAgent",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphStreamModes: ["updates"],
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('streamMode: "updates"');
      expect(code).toContain('type: "update", mode: "updates"');
    });

    it("renders custom writer stream mode", () => {
      const step: PipelineStep = {
        id: "step-custom-stream",
        name: "CustomAgent",
        type: "langgraph_invoke",
        langGraphTargetNodeId: "customAgent",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "raw",
        langGraphStreamModes: ["custom"],
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain('streamMode: "custom"');
      expect(code).toContain('mode === "custom"');
    });

    it("generates streaming response type interface when langGraphStreamingEnabled is true", () => {
      const ep: Endpoint = {
        id: "ep-chat",
        name: "/simple-chat",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "ChatAgent",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatAgent",
            langGraphStreamingEnabled: true,
            langGraphStreamingProtocol: "sse",
          },
        ],
      };

      const res = generateResponseInterface("ConversationsPostSimpleChatResponse", [], undefined, [], ep);
      expect(res.code).toContain("export interface ConversationsPostSimpleChatResponse {");
      expect(res.code).toContain("content: string;");
      expect(res.code).toContain("tokens: string[];");
      expect(res.code).toContain("streamed: true;");
      expect(res.code).toContain("raw?: string;");
      expect(res.code).toContain("export interface ConversationsPostSimpleChatResponseStreamChunk {");
      expect(res.code).toContain("token?: string;");
      expect(res.code).toContain("node?: string;");
    });

    it("generates standard buffered response type interface when langGraphStreamingEnabled is false", () => {
      const ep: Endpoint = {
        id: "ep-chat-buffered",
        name: "/simple-chat",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-1",
            name: "ChatAgent",
            type: "langgraph_invoke",
            langGraphTargetNodeId: "chatAgent",
            langGraphStreamingEnabled: false,
          },
        ],
      };

      const res = generateResponseInterface("ConversationsPostSimpleChatResponse", [], undefined, [], ep);
      expect(res.code).toContain("export interface ConversationsPostSimpleChatResponse {");
      expect(res.code).not.toContain("streamed: true;");
      expect(res.code).toContain("response: string;");
    });
  });

  describe("Token Usage Tracking (langGraphTrackTokenUsage)", () => {
    it("extracts and tracks token usage in non-streaming invoke mode when langGraphTrackTokenUsage is true", () => {
      const step: PipelineStep = {
        id: "step-token-agent",
        name: "UsageAgent",
        type: "langgraph_invoke",
        outputVariable: "agentResult",
        langGraphTargetNodeId: "agentUsage",
        langGraphStreamingEnabled: false,
        langGraphTrackTokenUsage: true,
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const agentResultUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0");
      expect(code).toContain("usage_metadata || _m?.response_metadata?.token_usage");
      expect(code).toContain('res.setHeader("X-Input-Tokens", String(agentResultUsage.input_tokens))');
      expect(code).toContain('res.setHeader("X-Output-Tokens", String(agentResultUsage.output_tokens))');
      expect(code).toContain('res.setHeader("X-Total-Tokens", String(agentResultUsage.total_tokens))');
      expect(code).toContain("usage: agentResultUsage");
    });

    it("tracks token usage and emits usage SSE event when langGraphStreamingEnabled and langGraphTrackTokenUsage are true", () => {
      const step: PipelineStep = {
        id: "step-token-stream",
        name: "StreamUsageAgent",
        type: "langgraph_invoke",
        outputVariable: "streamResult",
        langGraphTargetNodeId: "agentStreamUsage",
        langGraphStreamingEnabled: true,
        langGraphStreamingProtocol: "sse",
        langGraphTrackTokenUsage: true,
      };

      const lines = renderPipelineStep(step, {
        priorOutputs: new Map(),
        bodyVar: "body",
      });
      const code = lines.join("\n");

      expect(code).toContain("const streamUsageAgentTokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };");
      expect(code).toContain("_chunkUsage");
      expect(code).toContain('data: ${JSON.stringify({ type: "usage", usage: streamUsageAgentTokenUsage })}\\n\\n');
      expect(code).toContain('data: [DONE]\\n\\n');
    });
  });
});