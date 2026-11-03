import { describe, it, expect } from "vitest";
import { compileLangGraph } from "../langgraph/typescript/v1";
import type { CompileLangGraphInput } from "../langgraph/typescript/v1/types";
import {
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_END,
  LANGGRAPH_CANVAS_NODE_AGENT_REF,
  HANDLE_LLM_IN,
  HANDLE_TOOL_IN,
  NODE_ID_START,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/constants";

describe("compileLangGraph Compiler Fixes", () => {
  it("compiles graph canvas state into valid TypeScript npm project without any, unknown, or as assertions", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "chat",
      stateChannels: [
        {
          key: "messages",
          type: "messages",
          reducer: "add_messages",
          defaultValue: [],
        },
        {
          key: "currentMessage",
          type: "string",
          reducer: "replace",
          defaultValue: "",
        },
      ],
      inputChannels: [],
      nodes: [
        {
          id: "tool_1",
          type: LANGGRAPH_CANVAS_NODE_TOOL,
          position: { x: 100, y: 100 },
          data: {
            label: "my_tool",
            toolId: "tool_1",
            name: "my_tool",
            description: "Description of the tool",
            inputSchema: "{}",
            source: "inline",
          },
        },
        // Duplicate tool node with same name to test deduplication
        {
          id: "tool_2",
          type: LANGGRAPH_CANVAS_NODE_TOOL,
          position: { x: 100, y: 200 },
          data: {
            label: "my_tool",
            toolId: "tool_2",
            name: "my_tool",
            description: "Description of the tool",
            inputSchema: "{}",
            source: "inline",
          },
        },
        {
          id: "llm_1",
          type: LANGGRAPH_CANVAS_NODE_LLM,
          position: { x: 300, y: 100 },
          data: {
            label: "llmConfig",
            llmId: "llm_1",
            provider: "groq",
            model: "openai/gpt-oss-120b",
            temperature: 0.2,
          },
        },
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 500, y: 100 },
          data: {
            name: "node",
            label: "node",
          },
        },
      ],
      edges: [
        {
          id: "e1",
          source: "llm_1",
          target: "node_1",
          targetHandle: HANDLE_LLM_IN,
        },
        {
          id: "e2",
          source: "tool_1",
          target: "node_1",
          targetHandle: HANDLE_TOOL_IN,
        },
        {
          id: "e3",
          source: "tool_2",
          target: "node_1",
          targetHandle: HANDLE_TOOL_IN,
        },
        {
          id: "e4",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
      routeEndpoints: [
        {
          kind: "endpoint",
          path: "/simple-chat",
          method: "POST",
          sourceNodeLabel: "profile",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    // 1. Verify state.ts uses Annotation.Root and no Zod StateSchema errors
    const stateFile = fileMap.get("src/state.ts");
    expect(stateFile).toBeDefined();
    expect(stateFile).toContain("Annotation.Root({");
    expect(stateFile).toContain("...MessagesAnnotation.spec,");
    expect(stateFile).toContain("currentMessage: Annotation<string>({");
    expect(stateFile).toContain("reducer: currentMessageReducer,");
    expect(stateFile).toContain('default: () => "",');
    expect(fileMap.get("src/reducers/currentMessageReducer.ts")).toBeDefined();
    const msgRed = fileMap.get("src/reducers/messagesReducer.ts");
    expect(msgRed).toBeDefined();
    expect(msgRed).toContain('import { addMessages } from "@langchain/langgraph";');
    expect(msgRed).toContain("export const messagesReducer = addMessages;");
    expect(stateFile).toContain("ChatStateType");
    expect(stateFile).toContain("ChatStateUpdateType");
    expect(stateFile).not.toContain("StateSchema");
    expect(stateFile).not.toContain("as any");
    expect(stateFile).not.toContain("as unknown");

    // 2. Verify tools.ts deduplicates tool declarations
    const toolsFile = fileMap.get("src/tools.ts");
    expect(toolsFile).toBeDefined();
    const myToolMatches = toolsFile!.match(/export const myTool\b/g);
    expect(myToolMatches?.length).toBe(1);
    expect(toolsFile).toContain("export const myTool2 = tool(");
    expect(toolsFile).not.toContain("z.any()");
    expect(toolsFile).not.toContain("as any");

    // 3. Verify graph.ts uses standard TS imports
    const graphFile = fileMap.get("src/graph.ts");
    expect(graphFile).toBeDefined();
    expect(graphFile).toContain('import { ChatState } from "./state";');
    expect(graphFile).toContain('import { node } from "./nodes";');

    // 4. Verify llm/llmConfig.ts uses standard TS imports
    const llmFile = fileMap.get("src/llm/llmConfig.ts");
    expect(llmFile).toBeDefined();
    expect(llmFile).toContain('from "../tools";');

    // 5. Verify llm/index.ts uses standard TS imports
    const llmIndexFile = fileMap.get("src/llm/index.ts");
    expect(llmIndexFile).toBeDefined();
    expect(llmIndexFile).toContain('export * from "./llmConfig";');

    // 6. Verify nodes/node.ts uses standard TS imports
    const nodeFile = fileMap.get("src/nodes/node.ts");
    expect(nodeFile).toBeDefined();
    expect(nodeFile).toContain('from "../state";');
    expect(nodeFile).toContain('from "../llm/llmConfig";');

    // 7. Verify nodes/index.ts uses standard TS imports
    const nodesIndexFile = fileMap.get("src/nodes/index.ts");
    expect(nodesIndexFile).toBeDefined();
    expect(nodesIndexFile).toContain('export * from "./node";');

    // 8. Verify index.ts uses standard TS imports
    const indexFile = fileMap.get("src/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile).toContain('from "./graph";');

    // 9. Verify server.ts uses standard TS imports and strongly typed express handlers
    const serverFile = fileMap.get("src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile).toContain('import express, { type Request, type Response } from "express";');
    expect(serverFile).toContain('import { chatGraph } from "./graph";');
    expect(serverFile).toContain('import type { ChatStateUpdateType } from "./state";');
    expect(serverFile).toContain("(_req: Request, res: Response)");
    expect(serverFile).toContain("(req: Request, res: Response)");
    expect(serverFile).not.toContain("(_req, res)");
    expect(serverFile).not.toContain("(req, res)");
    expect(serverFile).not.toContain("as any");
    expect(serverFile).not.toContain("as unknown");

    // 10. Verify express.d.ts is generated
    const expressDts = fileMap.get("src/express.d.ts");
    expect(expressDts).toBeDefined();
    expect(expressDts).toContain('declare module "express"');
    expect(expressDts).not.toContain("any");
    expect(expressDts).not.toContain("unknown");

    // 11. Verify package.json contains @types/express in devDependencies
    const pkgJson = JSON.parse(fileMap.get("package.json") || "{}");
    expect(pkgJson.devDependencies["@types/express"]).toBeDefined();

    // 12. Verify tsconfig.json includes DOM and node types
    const tsconfig = JSON.parse(fileMap.get("tsconfig.json") || "{}");
    expect(tsconfig.compilerOptions.lib).toContain("DOM");
    expect(tsconfig.compilerOptions.types).toContain("node");
  });

  it("outputMode: package emits a reusable @workspace package structure", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "chat",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
      ],
      inputChannels: [],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "chatNode", label: "chatNode" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
      outputMode: "package",
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    // package.json should use @workspace/ scope and have "exports" field
    const pkgJson = JSON.parse(fileMap.get("package.json") || "{}");
    expect(pkgJson.name).toBe("@workspace/chat");
    expect(pkgJson.exports).toBeDefined();
    expect(pkgJson.exports["."]).toBeDefined();
    // langgraph should be in peerDependencies, not dependencies
    expect(pkgJson.peerDependencies?.["@langchain/langgraph"]).toBeDefined();
    expect(pkgJson.dependencies?.["@langchain/langgraph"]).toBeUndefined();

    // tsconfig should emit declaration files
    const tsconfig = JSON.parse(fileMap.get("tsconfig.json") || "{}");
    expect(tsconfig.compilerOptions.declaration).toBe(true);
    // package mode doesn't need DOM lib
    expect(tsconfig.compilerOptions.lib).not.toContain("DOM");

    // src/index.ts should be a lib entry (re-exports), not a runnable script
    const indexFile = fileMap.get("src/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile).toContain("export {");
    expect(indexFile).toContain("export type {");
    expect(indexFile).not.toContain("async function main");
    expect(indexFile).not.toContain("main().catch");

    // server.ts should NOT be generated in package mode (no HTTP layer)
    expect(fileMap.has("src/server.ts")).toBe(false);
    expect(fileMap.has("src/express.d.ts")).toBe(false);
  });

  it("compiles graph with PostgresSaver checkpointer", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "postgres-agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
      ],
      inputChannels: [],
      memoryConfig: {
        checkpointer: "postgres",
        checkpointerNodeId: "db_node_1",
        checkpointerEnvVar: "CUSTOM_POSTGRES_URL",
      },
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "responder", label: "responder" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    // graph.ts should import and configure PostgresSaver with void checkpointer.setup()
    const graphFile = fileMap.get("src/graph.ts");
    expect(graphFile).toBeDefined();
    expect(graphFile).toContain(`import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";`);
    expect(graphFile).toContain(`process.env.CUSTOM_POSTGRES_URL`);
    expect(graphFile).toContain(`void checkpointer.setup();`);
    expect(graphFile).toContain(`.compile({ checkpointer })`);

    // package.json should include postgres checkpointer and pg dependencies
    const pkgJson = JSON.parse(fileMap.get("package.json") || "{}");
    expect(pkgJson.dependencies["@langchain/langgraph-checkpoint-postgres"]).toBeDefined();
    expect(pkgJson.dependencies["pg"]).toBeDefined();

    // .env.example should contain the connection string var
    const envFile = fileMap.get(".env.example");
    expect(envFile).toContain("CUSTOM_POSTGRES_URL=postgresql://");
  });

  it("compiles graph with RedisSaver checkpointer", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "redis-agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
      ],
      inputChannels: [],
      memoryConfig: {
        checkpointer: "redis",
        checkpointerNodeId: "redis_node_1",
        checkpointerEnvVar: "CUSTOM_REDIS_URL",
      },
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "responder", label: "responder" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    const graphFile = fileMap.get("src/graph.ts");
    expect(graphFile).toBeDefined();
    expect(graphFile).toContain(`import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";`);
    expect(graphFile).toContain(`process.env.CUSTOM_REDIS_URL`);
    expect(graphFile).toContain(`.compile({ checkpointer })`);

    const pkgJson = JSON.parse(fileMap.get("package.json") || "{}");
    expect(pkgJson.dependencies["@langchain/langgraph-checkpoint-redis"]).toBeDefined();
    expect(pkgJson.dependencies["redis"]).toBeDefined();

    const envFile = fileMap.get(".env.example");
    expect(envFile).toContain("CUSTOM_REDIS_URL=redis://");
  });

  it("compiles server.ts with auto thread_id resolution, response thread_id, and history endpoint when memory is configured", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "memory-chat-agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
      ],
      inputChannels: [],
      memoryConfig: {
        checkpointer: "memory",
      },
      routeEndpoints: [
        {
          path: "/chat",
          method: "POST",
          kind: "endpoint",
          responseExecutionMode: "sync",
        },
      ],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "bot", label: "bot" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    const serverFile = fileMap.get("src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile).toContain(`import crypto from "node:crypto";`);
    expect(serverFile).toContain(`crypto.randomUUID()`);
    expect(serverFile).toContain(`thread_id: threadId`);
    expect(serverFile).toContain(`/api/threads/:threadId/history`);
  });

  it("compiles developer-defined custom reducer code into dedicated reducer file and imports it in state.ts", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "custom-reducer-agent",
      stateChannels: [
        {
          key: "highScore",
          type: "number",
          reducer: "custom",
          customReducerCode: "(prev, next) => Math.max(prev ?? 0, next ?? 0)",
          defaultValue: 0,
        },
      ],
      inputChannels: [],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "scorer", label: "scorer" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    const stateFile = fileMap.get("src/state.ts");
    expect(stateFile).toBeDefined();
    expect(stateFile).toContain(`highScore: Annotation<number>({`);
    expect(stateFile).toContain(`reducer: highScoreReducer,`);
    expect(stateFile).toContain(`from "./reducers";`);

    const reducerFile = fileMap.get("src/reducers/highScoreReducer.ts");
    expect(reducerFile).toBeDefined();
    expect(reducerFile).toContain("export const highScoreReducer = (prev: number, next: number): number =>");
    expect(reducerFile).toContain("Math.max(prev ?? 0, next ?? 0)");
  });

  it("compiles custom reducers for messages, string, and number with strongly typed prev and next without implicit any", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "demo",
      stateChannels: [
        {
          key: "messages",
          type: "messages",
          reducer: "custom",
          customReducerCode: `(prev, next) => {
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;
  const prevArr = Array.isArray(prev) ? prev : [];
  return prevArr;
}`,
        },
        {
          key: "count",
          type: "number",
          reducer: "custom",
          customReducerCode: `(prev, next) => {
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;
  return typeof prev === "number" ? prev : 0;
}`,
        },
        {
          key: "message",
          type: "string",
          reducer: "custom",
          customReducerCode: `(prev, next) => {
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;
  return typeof prev === "string" ? prev : "";
}`,
        },
      ],
      inputChannels: [],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "demoNode", label: "demoNode" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
      outputMode: "package",
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    // 1. Verify state.ts imports BaseMessage and exports update types
    const stateFile = fileMap.get("src/state.ts") || "";
    expect(stateFile).toContain('import type { BaseMessage } from "@langchain/core/messages";');
    expect(stateFile).toContain("export type StringChannelUpdate");
    expect(stateFile).toContain("export type NumberChannelUpdate");
    expect(stateFile).toContain("export type MessagesChannelUpdate");
    expect(stateFile).toContain("messages: Annotation<BaseMessage[], MessagesChannelUpdate>({");

    // 2. Verify messagesReducer strongly types prev and return type without implicit any
    const messagesReducer = fileMap.get("src/reducers/messagesReducer.ts") || "";
    expect(messagesReducer).toContain('import type { BaseMessage } from "@langchain/core/messages";');
    expect(messagesReducer).toContain('import type { MessagesChannelUpdate } from "../state";');
    expect(messagesReducer).toContain(
      "export const messagesReducer = (prev: BaseMessage[], next: MessagesChannelUpdate): BaseMessage[] =>",
    );
    expect(messagesReducer).not.toContain("(prev,");

    // 3. Verify countReducer strongly types prev and return type without implicit any
    const countReducer = fileMap.get("src/reducers/countReducer.ts") || "";
    expect(countReducer).toContain('import type { NumberChannelUpdate } from "../state";');
    expect(countReducer).toContain(
      "export const countReducer = (prev: number, next: NumberChannelUpdate): number =>",
    );
    expect(countReducer).not.toContain("(prev,");

    // 4. Verify messageReducer strongly types prev and return type without implicit any
    const messageReducer = fileMap.get("src/reducers/messageReducer.ts") || "";
    expect(messageReducer).toContain('import type { StringChannelUpdate } from "../state";');
    expect(messageReducer).toContain(
      "export const messageReducer = (prev: string, next: StringChannelUpdate): string =>",
    );
    expect(messageReducer).not.toContain("(prev,");
  });

  it("compiles conditional router step node with exact node names and END constant instead of raw labels", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "Loop Agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages", defaultValue: [] },
        { key: "count", type: "number", reducer: "replace", defaultValue: 0 },
      ],
      inputChannels: [],
      nodes: [
        {
          id: NODE_ID_START,
          type: LANGGRAPH_CANVAS_NODE_START,
          position: { x: 0, y: 0 },
          data: { label: "START" },
        },
        {
          id: "agent_node",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 200, y: 0 },
          data: {
            name: "Agent Node",
            label: "Agent Node",
          },
        },
        {
          id: "router_node",
          type: LANGGRAPH_CANVAS_NODE_STEP,
          position: { x: 400, y: 0 },
          data: {
            stepId: "router_node",
            label: "Conditional Router",
            stepType: "router",
            routerConfig: {
              branches: [
                {
                  id: "b_loop",
                  label: "agent route",
                  field: "count",
                  operator: "lte",
                  value: "5",
                },
                {
                  id: "b_end",
                  label: "end",
                  field: "count",
                  operator: "gt",
                  value: "5",
                },
              ],
            },
          },
        },
        {
          id: "end_abc123",
          type: LANGGRAPH_CANVAS_NODE_END,
          position: { x: 600, y: 0 },
          data: { label: "END State" },
        },
        {
          id: "agent_node_ref",
          type: LANGGRAPH_CANVAS_NODE_AGENT_REF,
          position: { x: 600, y: 200 },
          data: {
            label: "Agent Node Ref",
            refId: "agent_node_ref",
            agentRef: "agent_node",
          },
        },
      ],
      edges: [
        { id: "e1", source: NODE_ID_START, target: "agent_node" },
        { id: "e2", source: "agent_node", target: "router_node" },
        { id: "e3", source: "router_node", target: "agent_node_ref", sourceHandle: "b_loop" },
        { id: "e4", source: "router_node", target: "end_abc123", sourceHandle: "b_end" },
        { id: "e_ref", source: "agent_node", target: "agent_node_ref", type: "langgraph-reference" },
      ],
      outputMode: "package",
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    // 1. Verify router node file was generated with correct destinations (dereferenced from agent_node_ref)
    const routerFile = fileMap.get("src/nodes/conditionalRouter.ts") || "";
    expect(routerFile).toBeDefined();
    expect(routerFile).toContain('import { END } from "@langchain/langgraph";');
    expect(routerFile).toContain('return "agentNode";');
    expect(routerFile).toContain("return END;");
    // Ensure agent ref node label/id is never returned instead of the master agent node
    expect(routerFile).not.toContain('"agentNodeRef"');
    expect(routerFile).not.toContain('"agent_node_ref"');
    expect(routerFile).not.toContain('"Agent Node Ref"');
    // Ensure raw human labels or end node IDs are not returned as strings
    expect(routerFile).not.toContain('"agent route"');
    expect(routerFile).not.toContain('"end"');
    expect(routerFile).not.toContain('"end_abc123"');
    expect(routerFile).not.toContain('"endAbc123"');
    // Ensure condition uses safe numeric handling
    expect(routerFile).toContain("Number(state.count ?? 0) <= 5");
    expect(routerFile).toContain("Number(state.count ?? 0) > 5");

    // 2. Verify graph.ts sets up conditional edge from agentNode to the router targeting agentNode (dereferenced)
    const graphFile = fileMap.get("src/graph.ts") || "";
    expect(graphFile).toBeDefined();
    expect(graphFile).toContain(".addConditionalEdges(");
    expect(graphFile).toContain('"agentNode"');
    expect(graphFile).toContain("conditionalRouter");
    expect(graphFile).not.toContain("agentNodeRef");
    // Allowed destinations must include the agentNode and END
    expect(graphFile).toMatch(/addConditionalEdges\("agentNode",\s*conditionalRouter,\s*\[.*"agentNode".*END.*\]\)/s);
  });

  it("compiles standard messages channel with add_messages reducer into ...MessagesAnnotation.spec even if customReducerCode is present", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "Agent",
      stateChannels: [
        {
          key: "messages",
          type: "messages",
          reducer: "add_messages",
          defaultValue: [],
          customReducerCode: `(prev, next) => { return prev; }`,
        },
      ],
      inputChannels: [],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "agent", label: "agent" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
      outputMode: "package",
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    const stateFile = fileMap.get("src/state.ts") || "";
    expect(stateFile).toContain("...MessagesAnnotation.spec,");
    expect(stateFile).not.toContain("messages: Annotation<");
    expect(stateFile).not.toContain("messagesReducer");
    expect(stateFile).not.toContain("MessagesChannelUpdate");

    const reducerFile = fileMap.get("src/reducers/messagesReducer.ts") || "";
    expect(reducerFile).toContain('import { addMessages } from "@langchain/langgraph";');
    expect(reducerFile).toContain("export const messagesReducer = addMessages;");
  });

  it("compiles standard messages history endpoint in server.ts", () => {
    const input: CompileLangGraphInput = {
      graphLabel: "history-agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
      ],
      inputChannels: [],
      memoryConfig: {
        checkpointer: "memory",
      },
      routeEndpoints: [
        {
          path: "/api/chat/history",
          method: "GET",
          kind: "endpoint",
          action: "history",
          historyFormat: "chat_messages",
          historyPaginationEnabled: true,
          threadIdSource: "query.thread_id",
        },
      ],
      nodes: [
        {
          id: "node_1",
          type: LANGGRAPH_CANVAS_NODE_NODE,
          position: { x: 0, y: 0 },
          data: { name: "bot", label: "bot" },
        },
      ],
      edges: [
        {
          id: "e1",
          source: NODE_ID_START,
          target: "node_1",
        },
      ],
    };

    const files = compileLangGraph(input);
    const fileMap = new Map(files.map((f) => [f.filename, f.content]));

    const serverFile = fileMap.get("src/server.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile).toContain('app.get("/api/chat/history"');
    expect(serverFile).toContain('req.query?.["thread_id"]');
    expect(serverFile).toContain('getStateHistory(');
    expect(serverFile).toContain('toolCalls');
    expect(serverFile).toContain('...(toolCalls ? { tool_calls: toolCalls } : {})');
    expect(serverFile).toContain('...(toolCallId ? { tool_call_id: toolCallId } : {})');
  });
});
