import type {
  LangGraphLLMNodeData,
  ToolNodeData,
  CanvasNodeData,
  StepNodeData,
  MemoryNodeData,
  MiddlewareNodeData,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/types";
import {
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
  LANGGRAPH_CANVAS_NODE_TOOL_REF,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
  LANGGRAPH_CANVAS_NODE_MEMORY_REF,
  HANDLE_LLM_IN,
  HANDLE_TOOL_IN,
  HANDLE_MIDDLEWARE_IN,
  HANDLE_MEMORY_IN,
  MIDDLEWARE_TYPE_HUMAN_IN_THE_LOOP,
  LANGGRAPH_CANVAS_NODE_OUTPUT,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/constants";
import type {
  CompileLangGraphInput,
  CompileContext,
  LLMMeta,
  NodeMeta,
  ToolMeta,
} from "./types";
import type {
  LangGraphCanvasNode,
  LangGraphLLMNode,
  ToolNode,
  CanvasNode,
  StepNode,
  MemoryNode,
  MiddlewareNode,
} from "@workspace/canvas";
import { toIdentifier, getProviderPackage } from "./utils";

function isLLMNode(n: LangGraphCanvasNode): n is LangGraphLLMNode {
  return n.type === LANGGRAPH_CANVAS_NODE_LLM;
}

function isToolNode(n: LangGraphCanvasNode): n is ToolNode {
  return n.type === LANGGRAPH_CANVAS_NODE_TOOL;
}

function isAgentNode(n: LangGraphCanvasNode): n is CanvasNode {
  return (
    n.type === LANGGRAPH_CANVAS_NODE_NODE ||
    n.type === LANGGRAPH_CANVAS_NODE_AGENT
  );
}

function isStepNode(n: LangGraphCanvasNode): n is StepNode {
  return n.type === LANGGRAPH_CANVAS_NODE_STEP;
}

function isMemoryNode(n: LangGraphCanvasNode): n is MemoryNode {
  return n.type === LANGGRAPH_CANVAS_NODE_MEMORY;
}

function isMiddlewareNode(n: LangGraphCanvasNode): n is MiddlewareNode {
  return n.type === LANGGRAPH_CANVAS_NODE_MIDDLEWARE;
}

export function buildContext(input: CompileLangGraphInput): CompileContext {
  const { nodes, edges } = input;

  const llmNodes = nodes.filter(isLLMNode);
  const seenToolIds = new Set<string>();
  const toolNodes = nodes.filter(isToolNode).filter((n) => {
    if (seenToolIds.has(n.id)) return false;
    seenToolIds.add(n.id);
    return true;
  });
  const agentNodes = nodes.filter(isAgentNode);
  const stepNodes = nodes.filter(isStepNode);
  const memoryNodes = nodes.filter(isMemoryNode);
  const middlewareNodes = nodes.filter(isMiddlewareNode);

  const agentLLMMap = new Map<string, string>();
  const agentToolsMap = new Map<string, string[]>();
  const agentMiddlewareMap = new Map<string, string[]>();
  const agentMemoryMap = new Map<string, string[]>();

  const resolveSourceId = (srcId: string): string => {
    const srcNode = nodes.find((n) => n.id === srcId);
    if (!srcNode) return srcId;
    if (srcNode.type === LANGGRAPH_CANVAS_NODE_LLM_REF) {
      return srcNode.data.llmRef || srcId;
    }
    if (srcNode.type === LANGGRAPH_CANVAS_NODE_TOOL_REF) {
      return srcNode.data.toolRef || srcId;
    }
    if (srcNode.type === LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF) {
      return srcNode.data.middlewareRef || srcId;
    }
    if (srcNode.type === LANGGRAPH_CANVAS_NODE_MEMORY_REF) {
      return srcNode.data.memoryRef || srcId;
    }
    return srcId;
  };

  for (const edge of edges) {
    const resolvedSource = resolveSourceId(edge.source);
    if (edge.targetHandle === HANDLE_LLM_IN) {
      agentLLMMap.set(edge.target, resolvedSource);
    } else if (edge.targetHandle === HANDLE_TOOL_IN) {
      const existing = agentToolsMap.get(edge.target) || [];
      agentToolsMap.set(edge.target, [...existing, resolvedSource]);
    } else if (edge.targetHandle === HANDLE_MIDDLEWARE_IN) {
      const existing = agentMiddlewareMap.get(edge.target) || [];
      agentMiddlewareMap.set(edge.target, [...existing, resolvedSource]);
    } else if (edge.targetHandle === HANDLE_MEMORY_IN) {
      const existing = agentMemoryMap.get(edge.target) || [];
      agentMemoryMap.set(edge.target, [...existing, resolvedSource]);
    }
  }

  const routerStepIds = new Set(
    stepNodes.filter((n) => n.data.stepType === "router").map((n) => n.id),
  );

  const hasHumanInLoop =
    middlewareNodes.some(
      (m) => m.data.type === MIDDLEWARE_TYPE_HUMAN_IN_THE_LOOP,
    ) ||
    stepNodes.some(
      (s) =>
        s.data.stepType === "human_gate" || s.data.stepType === "interrupt",
    );

  const usesMessages = input.stateChannels.some(
    (c) => c.key === "messages" || c.reducer === "add_messages",
  );

  return {
    input,
    llmNodes,
    toolNodes,
    agentNodes,
    stepNodes,
    memoryNodes,
    middlewareNodes,
    hasMemory:
      input.memoryConfig?.enabled !== false &&
      (memoryNodes.length > 0 ||
        (!!input.memoryConfig?.checkpointer &&
          input.memoryConfig.checkpointer !== "none")),
    hasTools: toolNodes.length > 0,
    hasHumanInLoop,
    usesMessages,
    agentLLMMap,
    agentToolsMap,
    agentMiddlewareMap,
    agentMemoryMap,
    routerStepIds,
    graphId: input.graphLabel || "agent",
    usesKafka:
      agentNodes.some((a) => a.data?.pipelineSteps?.some((s) => s.type === "kafka_publish")) ||
      stepNodes.some((s) => s.data?.pipelineSteps?.some((p) => p.type === "kafka_publish")),
    usesRedis:
      agentNodes.some((a) => a.data?.pipelineSteps?.some((s) => s.type === "redis_operation")) ||
      stepNodes.some((s) => s.data?.pipelineSteps?.some((p) => p.type === "redis_operation")),
    usesDb:
      agentNodes.some((a) => a.data?.pipelineSteps?.some((s) => s.type === "db_operation")) ||
      stepNodes.some((s) => s.data?.pipelineSteps?.some((p) => p.type === "db_operation")),
    usesStorage:
      agentNodes.some((a) => a.data?.pipelineSteps?.some((s) => s.type === "storage_operation")) ||
      stepNodes.some((s) => s.data?.pipelineSteps?.some((p) => p.type === "storage_operation")),
    trackTokenUsage: input.trackTokenUsage !== false,
  };
}

export function buildLLMMetaMap(ctx: CompileContext): Map<string, LLMMeta> {
  const map = new Map<string, LLMMeta>();
  const used = new Set<string>();

  for (const llmNode of ctx.llmNodes) {
    const d = llmNode.data;
    const raw = d.label || d.model || d.provider || `llm_${llmNode.id}`;
    let base = toIdentifier(raw);
    if (!base) base = `llm_${llmNode.id}`;

    let name = base;
    let counter = 2;
    while (used.has(name)) {
      name = `${base}${counter}`;
      counter++;
    }
    used.add(name);
    map.set(llmNode.id, { fileName: name, varName: name });
  }

  return map;
}

export function buildNodeMetaMap(ctx: CompileContext): Map<string, NodeMeta> {
  const map = new Map<string, NodeMeta>();
  const used = new Set<string>();

  for (const agentNode of ctx.agentNodes) {
    const d = agentNode.data;
    const raw = d.name || d.label || `node_${agentNode.id}`;
    let base = toIdentifier(raw);
    if (!base) base = `node_${agentNode.id}`;

    let fileName = base;
    let counter = 2;
    while (used.has(fileName)) {
      fileName = `${base}${counter}`;
      counter++;
    }
    used.add(fileName);
    map.set(agentNode.id, { fileName, exportName: fileName });
  }

  for (const stepNode of ctx.stepNodes) {
    const d = stepNode.data;
    let raw = d.label || `step_${stepNode.id}`;
    if (d.stepType === "router") {
      raw = d.label || `router_${stepNode.id}`;
    }
    let base = toIdentifier(raw);
    if (!base) base = `step_${stepNode.id}`;

    let fileName = base;
    let counter = 2;
    while (used.has(fileName)) {
      fileName = `${base}${counter}`;
      counter++;
    }
    used.add(fileName);

    const exportName =
      d.stepType === "router"
        ? base.endsWith("Router")
          ? base
          : `${base}Router`
        : base;

    map.set(stepNode.id, { fileName, exportName });
  }

  return map;
}

export function buildToolMetaMap(ctx: CompileContext): Map<string, ToolMeta> {
  const map = new Map<string, ToolMeta>();
  const used = new Set<string>();

  for (const toolNode of ctx.toolNodes) {
    if (map.has(toolNode.id)) continue;
    const d = toolNode.data;
    const raw = d.name || `tool_${toolNode.id}`;
    let base = toIdentifier(raw);
    if (!base) base = `tool_${toolNode.id}`;

    let name = base;
    let counter = 2;
    while (used.has(name)) {
      name = `${base}${counter}`;
      counter++;
    }
    used.add(name);
    map.set(toolNode.id, { varName: name });
  }

  return map;
}

export function ctxMemoryNeedsStore(ctx: CompileContext): boolean {
  return ctx.memoryNodes.some(
    (m) =>
      m.data.checkpointer === "redis" || m.data.checkpointer === "postgres",
  );
}

export function buildDependencies(ctx: CompileContext): Record<string, string> {
  const deps: Record<string, string> = {
    "@langchain/langgraph": "^1.1.2",
    "@langchain/core": "^1.1.17",
    zod: "^3.24.1",
    dotenv: "^17.3.1",
  };

  for (const llmNode of ctx.llmNodes) {
    const pkg = getProviderPackage(llmNode.data.provider);
    if (pkg) deps[pkg] = "latest";
  }

  const hasWebSocket = ctx.input.nodes.some(
    (n) =>
      n.type === LANGGRAPH_CANVAS_NODE_OUTPUT && n.data.type === "websocket",
  );
  if (hasWebSocket) {
    deps["socket.io"] = "^4.7.5";
  }

  // Add express when routes are connected (app mode only)
  if (
    ctx.input.outputMode !== "package" &&
    ctx.input.routeEndpoints &&
    ctx.input.routeEndpoints.length > 0
  ) {
    deps["express"] = "^4.21.2";
  }

  // Checkpointer persistence dependencies
  if (ctx.input.memoryConfig?.checkpointer === "postgres") {
    deps["@langchain/langgraph-checkpoint-postgres"] = "^1.0.5";
    deps["pg"] = "^8.13.1";
    if (
      ctx.input.dbPackageName &&
      ctx.input.dbEngine !== "sqlite" &&
      ctx.input.outputMode === "package"
    ) {
      deps[ctx.input.dbPackageName] = "workspace:*";
    }
  } else if (ctx.input.memoryConfig?.checkpointer === "redis") {
    deps["@langchain/langgraph-checkpoint-redis"] = "^1.0.11";
    deps["redis"] = "^4.7.0";
    if (ctx.input.redisPackageName && ctx.input.outputMode === "package") {
      deps[ctx.input.redisPackageName] = "workspace:*";
    }
  }

  // Pipeline step dependencies
  if (ctx.usesKafka) {
    deps["kafkajs"] = "^2.2.4";
  }

  if (ctx.usesRedis && !deps["redis"]) {
    deps["redis"] = "^4.7.0";
    if (ctx.input.redisPackageName && ctx.input.outputMode === "package") {
      deps[ctx.input.redisPackageName] = "workspace:*";
    }
  }

  if (ctx.usesDb) {
    if (ctx.input.dbPackageName && ctx.input.outputMode === "package") {
      deps[ctx.input.dbPackageName] = "workspace:*";
    } else if (!deps["pg"] && ctx.input.dbEngine !== "sqlite") {
      deps["pg"] = "^8.13.1";
    }
  }

  if (ctx.usesStorage) {
    deps["@aws-sdk/client-s3"] = "^3.670.0";
  }

  return deps;
}
