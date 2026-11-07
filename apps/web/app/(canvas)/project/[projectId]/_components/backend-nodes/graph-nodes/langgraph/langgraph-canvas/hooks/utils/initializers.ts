import type {
  BackendNode,
  LangGraphStepConfig,
  LangGraphEdgeConfig,
  LangGraphAgentDefinition,
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  StepNode,
  ToolNode,
  MiddlewareNode,
  MemoryNode,
  AgentNode,
  OutputNode,
  LangGraphLLMNode,
  LangGraphLLMRefNode,
  LangGraphToolRefNode,
  LangGraphMiddlewareRefNode,
  LangGraphMemoryRefNode,
  LangGraphAgentRefNode,
  TransformerCanvasNode,
  TransformerRefCanvasNode,
  LangGraphTypesNode,
  LangGraphTypesRefNode,
  CustomTypeItem,
  Parameter,
} from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_END,
  LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_TOOL_REF,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT_REF,
  LANGGRAPH_CANVAS_NODE_NODE_REF,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  LANGGRAPH_CANVAS_NODE_MEMORY_REF,
  LANGGRAPH_CANVAS_NODE_OUTPUT,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
  LANGGRAPH_CANVAS_NODE_TYPES,
  LANGGRAPH_CANVAS_NODE_TYPES_REF,
  HANDLE_LLM_IN,
  HANDLE_LLM_OUT,
  HANDLE_TOOL_IN,
  HANDLE_TOOL_OUT,
  HANDLE_MIDDLEWARE_IN,
  HANDLE_MIDDLEWARE_OUT,
  HANDLE_MEMORY_IN,
  HANDLE_MEMORY_OUT,
  HANDLE_TRANSFORMER_IN,
  HANDLE_TRANSFORMER_OUT,
  HANDLE_TYPES_IN,
  HANDLE_TYPES_OUT,
  NODE_ID_START,
  NODE_ID_END,
  NODE_ID_STATE_GLOBAL,
  NODE_ID_CHECKPOINTER,
  makePortNodeId,
  TARGET_KIND_PORT,
  TARGET_KIND_END,
  DEFAULT_LANGGRAPH_AGENT_NODE_ID,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_AGENT_DEFINITION,
  DEFAULT_LANGGRAPH_GRAPH_EDGES,
  DEFAULT_LANGGRAPH_MEMORY_CONFIG,
  DEFAULT_LANGGRAPH_NODE_POSITIONS,
  DEFAULT_LANGGRAPH_AGENT_NODE_POSITION,
} from "../../constants";

export function buildInitialNodes(
  data: BackendNode["data"],
): LangGraphCanvasNode[] {
  const steps: LangGraphStepConfig[] = data.graphSteps || [];

  const statePos =
    data.stateNodePosition || DEFAULT_LANGGRAPH_NODE_POSITIONS.stateNodePosition;
  const checkpointerPos =
    data.memoryDefinitions?.[0]?.position ||
    data.checkpointerNodePosition ||
    DEFAULT_LANGGRAPH_NODE_POSITIONS.checkpointerNodePosition;
  const startPos =
    data.startNodePosition || DEFAULT_LANGGRAPH_NODE_POSITIONS.startNodePosition;

  const result: LangGraphCanvasNode[] = [
    {
      id: NODE_ID_STATE_GLOBAL,
      type: LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
      position: statePos,
      data: {
        label: "Global Graph State",
        stateChannels:
          data.stateChannels && data.stateChannels.length > 0
            ? data.stateChannels
            : [...DEFAULT_LANGGRAPH_STATE_CHANNELS],
        customReducers: data.customReducers || [],
      },
      deletable: false,
    },
    {
      id: NODE_ID_CHECKPOINTER,
      type: LANGGRAPH_CANVAS_NODE_MEMORY,
      position: checkpointerPos,
      data: {
        label: "Checkpointer",
        name: "Checkpointer",
        enabled: data.memoryConfig?.enabled ?? false,
        checkpointer: data.memoryConfig?.checkpointer || "postgres",
        checkpointerConnectionId: data.memoryConfig?.checkpointerNodeId,
        threadIdKey: "thread_id",
        threadScope: data.memoryConfig?.threadScope || "session",
        autoSummarize: data.memoryConfig?.autoSummarize ?? true,
      },
      deletable: false,
    },
    {
      id: NODE_ID_START,
      type: LANGGRAPH_CANVAS_NODE_START,
      position: startPos,
      data: {
        label: "INPUT State",
        inputChannels:
          data.inputChannels && data.inputChannels.length > 0
            ? data.inputChannels
            : [...DEFAULT_LANGGRAPH_INPUT_CHANNELS],
        stateChannels:
          data.stateChannels && data.stateChannels.length > 0
            ? data.stateChannels
            : [...DEFAULT_LANGGRAPH_STATE_CHANNELS],
      },
      deletable: false,
    },
  ];

  const savedCustomLLMs = data.customLlmNodes || [];
  savedCustomLLMs.forEach((cLLM) => {
    const customNode: LangGraphLLMNode = {
      id: cLLM.id,
      type: LANGGRAPH_CANVAS_NODE_LLM,
      position: cLLM.position || { x: 340, y: 80 },
      data: {
        label: cLLM.label,
        llmId: cLLM.id,
        provider: cLLM.provider || "custom",
        url:
          cLLM.url ||
          cLLM.baseUrl ||
          "http://localhost:11434/v1/chat/completions",
        baseUrl: cLLM.baseUrl || cLLM.url || "http://localhost:11434/v1",
        method: cLLM.method || "POST",
        headersJson: cLLM.headersJson,
        bodyJson: cLLM.bodyJson,
        model: cLLM.model,
        apiKeyHeader: cLLM.apiKeyHeader,
        temperature: cLLM.temperature,
        maxTokens: cLLM.maxTokens,
      },
    };
    result.push(customNode);
  });

  const savedCustomLLMRefs = data.customLlmRefNodes || [];
  savedCustomLLMRefs.forEach((cRef) => {
    const customRefNode: LangGraphLLMRefNode = {
      id: cRef.id,
      type: LANGGRAPH_CANVAS_NODE_LLM_REF,
      position: cRef.position || { x: 340, y: 120 },
      data: {
        label: cRef.label || "LLM Ref",
        refId: cRef.id,
        llmRef: cRef.llmRef,
      },
    };
    result.push(customRefNode);
  });

  const savedCustomToolRefs = data.customToolRefNodes || [];
  savedCustomToolRefs.forEach((tRef) => {
    const customToolRefNode: LangGraphToolRefNode = {
      id: tRef.id,
      type: LANGGRAPH_CANVAS_NODE_TOOL_REF,
      position: tRef.position || { x: 340, y: 160 },
      data: {
        label: tRef.label || "Tool Ref",
        refId: tRef.id,
        toolRef: tRef.toolRef,
      },
    };
    result.push(customToolRefNode);
  });

  const savedCustomMiddlewareRefs = data.customMiddlewareRefNodes || [];
  savedCustomMiddlewareRefs.forEach((mRef) => {
    const customMiddlewareRefNode: LangGraphMiddlewareRefNode = {
      id: mRef.id,
      type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
      position: mRef.position || { x: 340, y: 220 },
      data: {
        label: mRef.label || "Middleware Ref",
        refId: mRef.id,
        middlewareRef: mRef.middlewareRef,
      },
    };
    result.push(customMiddlewareRefNode);
  });

  const savedCustomAgentRefs = data.customAgentRefNodes || [];
  savedCustomAgentRefs.forEach((aRef) => {
    const customAgentRefNode: LangGraphAgentRefNode = {
      id: aRef.id,
      type: LANGGRAPH_CANVAS_NODE_AGENT_REF,
      position: aRef.position || { x: 500, y: 220 },
      data: {
        label: aRef.label || "Agent Ref",
        refId: aRef.id,
        agentRef: aRef.agentRef || aRef.nodeRef,
        nodeRef: aRef.agentRef || aRef.nodeRef,
      },
    };
    result.push(customAgentRefNode);
  });

  const savedTools = data.toolDefinitions || [];
  savedTools.forEach((toolDef) => {
    const toolId = toolDef.id || toolDef.toolId || `tool_${Date.now()}`;
    const toolNode: ToolNode = {
      id: toolId,
      type: LANGGRAPH_CANVAS_NODE_TOOL,
      position: toolDef.position || { x: 340, y: 160 },
      data: {
        label: toolDef.name,
        toolId: toolId,
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        source: toolDef.source,
        endpointUrl: toolDef.endpointUrl,
        mcpConnectionId: toolDef.mcpConnectionId,
        remoteToolName: toolDef.remoteToolName,
        returnDirect: toolDef.returnDirect,
        returnType: toolDef.returnType,
        outputSchema: toolDef.outputSchema,
        commandConfig: toolDef.commandConfig,
        functionBody: toolDef.functionBody,
        executionMode: toolDef.executionMode,
        headless: toolDef.headless,
        contextAccess: toolDef.contextAccess,
        storeAccess: toolDef.storeAccess,
        streamWriter: toolDef.streamWriter,
        errorHandling: toolDef.errorHandling,
      },
    };
    result.push(toolNode);
  });

  const savedMiddlewares = data.middlewareDefinitions || [];
  savedMiddlewares.forEach((mwDef) => {
    const mwNode: MiddlewareNode = {
      id: mwDef.id || mwDef.middlewareId || `mw_${Date.now()}`,
      type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
      position: mwDef.position || { x: 340, y: 240 },
      data: {
        label: mwDef.name,
        middlewareId: mwDef.id || mwDef.middlewareId || `mw_${Date.now()}`,
        name: mwDef.name,
        type: mwDef.type,
        humanInTheLoopConfig: mwDef.humanInTheLoopConfig,
        rateLimitConfig: mwDef.rateLimitConfig,
        loggingConfig: mwDef.loggingConfig,
        customBody: mwDef.customBody,
      },
    };
    result.push(mwNode);
  });

  const savedAgents =
    data.agentDefinitions && data.agentDefinitions.length > 0
      ? data.agentDefinitions
      : steps.length === 0
        ? [DEFAULT_LANGGRAPH_AGENT_DEFINITION]
        : [];
  savedAgents.forEach((agDef) => {
    const agId = agDef.id || agDef.agentId || `node_${Date.now()}`;
    const agNode: AgentNode = {
      id: agId,
      type: LANGGRAPH_CANVAS_NODE_NODE,
      position:
        agDef.position ||
        data.agentNodePosition ||
        DEFAULT_LANGGRAPH_AGENT_NODE_POSITION || {
          x: 880,
          y: 240,
        },
      data: {
        label: agDef.name,
        agentId: agId,
        name: agDef.name,
        systemPrompt: agDef.systemPrompt,
        modelConfig: agDef.modelConfig,
        llmConfig: agDef.llmConfig,
        stateUpdatesConfig: agDef.stateUpdatesConfig,
        streamConfig: agDef.streamConfig,
        responseFormat: agDef.responseFormat,
        memoryConfig: agDef.memoryConfig,
        stateUpdates: agDef.stateUpdates || [],
        pipelineSteps: agDef.pipelineSteps,
        nodeSteps: agDef.nodeSteps,
        customCode: agDef.customCode,
        availableStateChannels:
          data.stateChannels && data.stateChannels.length > 0
            ? data.stateChannels
            : [...DEFAULT_LANGGRAPH_STATE_CHANNELS],
        tools: agDef.tools || [],
        middleware: agDef.middleware || [],
        transformers: agDef.transformers || [],
        memory: agDef.memory || [],
      },
    };
    result.push(agNode);
  });

  steps.forEach((step, idx) => {
    const stepNode: StepNode = {
      id: step.id,
      type: LANGGRAPH_CANVAS_NODE_STEP,
      position: step.position || {
        x: 420 + idx * 280,
        y: 190 + (idx % 2 === 0 ? 0 : 60),
      },
      data: {
        label: step.name,
        stepId: step.id,
        stepType: step.type,
        modelConfig: step.modelConfig,
        humanGateConfig: step.humanGateConfig,
        customCode: step.customCode,
        routerConfig: step.routerConfig,
        pipelineSteps: step.pipelineSteps,
        inputBindings: step.inputBindings,
        outputVariable: step.outputVariable,
        transformerNodeId: step.transformerNodeId,
        transformerRef: step.transformerRef,
        functionRef: step.functionRef,
        stateUpdates: step.stateUpdates || [],
        availableStateChannels: data.stateChannels || [
          {
            key: "messages",
            type: "messages",
            reducer: "add_messages",
            defaultValue: [],
          },
        ],
      },
    };
    result.push(stepNode);
  });

  interface InitializerTransformerDef {
    id?: string;
    label?: string;
    name?: string;
    functionName?: string;
    code?: string;
    scope?: "global" | "local";
    isGlobal?: boolean;
    position?: { x: number; y: number };
    inputSchema?: Array<{ id?: string; name?: string; type?: string; required?: boolean; description?: string }>;
    returnSchema?: Array<{ id?: string; name?: string; type?: string; required?: boolean; description?: string }>;
  }

  function isInitializerTransformerDef(val: unknown): val is InitializerTransformerDef {
    return typeof val === "object" && val !== null;
  }

  interface InitializerTransformerRefDef {
    id?: string;
    label?: string;
    transformerRef?: string;
    position?: { x: number; y: number };
  }

  function isInitializerTransformerRefDef(val: unknown): val is InitializerTransformerRefDef {
    return typeof val === "object" && val !== null;
  }

  const rawTransformers: unknown[] = Array.isArray(data.transformerDefinitions)
    ? data.transformerDefinitions
    : Array.isArray(data.customTransformerNodes)
      ? data.customTransformerNodes
      : [];

  rawTransformers.forEach((item: unknown, trIdx: number) => {
    if (!isInitializerTransformerDef(item)) return;
    const trId = item.id || `transformer_${Date.now()}_${trIdx}`;
    const mappedInputSchema: Parameter[] | undefined = item.inputSchema?.map((p, pIdx) => ({
      id: p.id || `param_in_${pIdx}`,
      name: p.name || "",
      type: p.type || "string",
      required: Boolean(p.required),
      description: p.description,
    }));
    const mappedReturnSchema: Parameter[] | undefined = item.returnSchema?.map((p, pIdx) => ({
      id: p.id || `param_${pIdx}`,
      name: p.name || "",
      type: p.type || "string",
      required: Boolean(p.required),
      description: p.description,
    }));

    const trNode: TransformerCanvasNode = {
      id: trId,
      type: LANGGRAPH_CANVAS_NODE_TRANSFORMER,
      position: item.position || { x: 340, y: 280 + trIdx * 60 },
      data: {
        label: item.label || item.functionName || item.name || "Transformer",
        functionName: item.functionName || item.name || "transformData",
        scope: item.scope || "global",
        isGlobal: item.isGlobal ?? true,
        code: item.code,
        inputSchema: mappedInputSchema,
        returnSchema: mappedReturnSchema,
      },
    };
    result.push(trNode);
  });

  const rawTransformerRefs: unknown[] = Array.isArray(data.customTransformerRefNodes)
    ? data.customTransformerRefNodes
    : [];

  rawTransformerRefs.forEach((item: unknown, rIdx: number) => {
    if (!isInitializerTransformerRefDef(item)) return;
    const refId = item.id || `transformer_ref_${Date.now()}_${rIdx}`;
    const trRefNode: TransformerRefCanvasNode = {
      id: refId,
      type: LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
      position: item.position || { x: 340, y: 340 + rIdx * 60 },
      data: {
        label: item.label || "Transformer Ref",
        transformerRef: item.transformerRef,
        refId,
      },
    };
    result.push(trRefNode);
  });

  interface InitializerTypesDef {
    id?: string;
    label?: string;
    typesId?: string;
    types?: CustomTypeItem[];
    rawTypeScript?: string;
    definitionMode?: "visual" | "raw";
    position?: { x: number; y: number };
  }

  function isInitializerTypesDef(val: unknown): val is InitializerTypesDef {
    return typeof val === "object" && val !== null;
  }

  interface InitializerTypesRefDef {
    id?: string;
    label?: string;
    typesRef?: string;
    position?: { x: number; y: number };
  }

  function isInitializerTypesRefDef(val: unknown): val is InitializerTypesRefDef {
    return typeof val === "object" && val !== null;
  }

  const rawTypes: unknown[] = Array.isArray(data.typesDefinitions)
    ? data.typesDefinitions
    : Array.isArray(data.customTypesNodes)
      ? data.customTypesNodes
      : [];

  rawTypes.forEach((item: unknown, tIdx: number) => {
    if (!isInitializerTypesDef(item)) return;
    const typesNodeId = item.id || item.typesId || `types_${Date.now()}_${tIdx}`;
    const typesNode: LangGraphTypesNode = {
      id: typesNodeId,
      type: LANGGRAPH_CANVAS_NODE_TYPES,
      position: item.position || { x: 340, y: 380 + tIdx * 60 },
      data: {
        label: item.label || "Custom Types",
        typesId: typesNodeId,
        types: Array.isArray(item.types) ? item.types : [],
        rawTypeScript: item.rawTypeScript || "",
        definitionMode: item.definitionMode || "visual",
      },
    };
    result.push(typesNode);
  });

  const rawTypesRefs: unknown[] = Array.isArray(data.customTypesRefNodes)
    ? data.customTypesRefNodes
    : [];

  rawTypesRefs.forEach((item: unknown, rIdx: number) => {
    if (!isInitializerTypesRefDef(item)) return;
    const refId = item.id || `types_ref_${Date.now()}_${rIdx}`;
    const typesRefNode: LangGraphTypesRefNode = {
      id: refId,
      type: LANGGRAPH_CANVAS_NODE_TYPES_REF,
      position: item.position || { x: 340, y: 440 + rIdx * 60 },
      data: {
        label: item.label || "Types Ref",
        typesRef: item.typesRef,
        refId,
      },
    };
    result.push(typesRefNode);
  });

  const savedEndNodes = data.endNodes || [];
  savedEndNodes.forEach((endNode) => {
    if (!result.some((n) => n.id === endNode.id)) {
      result.push({
        id: endNode.id,
        type: LANGGRAPH_CANVAS_NODE_END,
        position:
          endNode.position ||
          data.endNodePosition ||
          DEFAULT_LANGGRAPH_NODE_POSITIONS.endNodePosition,
        data: { label: endNode.label || "END State" },
      });
    }
  });

  if (!result.some((n) => n.type === LANGGRAPH_CANVAS_NODE_END)) {
    result.push({
      id: NODE_ID_END,
      type: LANGGRAPH_CANVAS_NODE_END,
      position:
        data.endNodePosition || DEFAULT_LANGGRAPH_NODE_POSITIONS.endNodePosition,
      data: { label: "END State" },
      deletable: false,
    });
  }

  const savedOutputs = data.outputChannels || [];
  savedOutputs.forEach((outDef, idx) => {
    const outNodeId = outDef.id
      ? outDef.id.startsWith("output_") || outDef.id.startsWith("out_")
        ? outDef.id
        : `output_${outDef.id}`
      : `output_${Date.now()}_${idx}`;
    if (
      !result.some(
        (n) =>
          n.id === outNodeId ||
          (n.type === LANGGRAPH_CANVAS_NODE_OUTPUT && n.data.id === outDef.id),
      )
    ) {
      const outputNode: OutputNode = {
        id: outNodeId,
        type: LANGGRAPH_CANVAS_NODE_OUTPUT,
        position: outDef.position || { x: 100, y: 480 + idx * 90 },
        data: {
          id: outDef.id,
          label: outDef.name || "Output Channel",
          name: outDef.name || "Output Channel",
          type: outDef.type || "sse",
          topicOrEventName: outDef.topicOrEventName,
          targetStateChannel: outDef.targetStateChannel,
          description: outDef.description,
          streamContentMode: outDef.streamContentMode,
          sourceStepId: outDef.sourceStepId,
          boundRouteIds: outDef.boundRouteIds,
          schemaJson: outDef.schemaJson,
          position: outDef.position,
        },
      };
      result.push(outputNode);
    }
  });

  return result;
}

export function buildInitialEdges(
  data: BackendNode["data"],
  initialNodes: LangGraphCanvasNode[],
): LangGraphCanvasEdge[] {
  const steps: LangGraphStepConfig[] = data.graphSteps || [];
  const agentDefs: LangGraphAgentDefinition[] =
    data.agentDefinitions && data.agentDefinitions.length > 0
      ? data.agentDefinitions
      : steps.length === 0
        ? [DEFAULT_LANGGRAPH_AGENT_DEFINITION]
        : [];
  const graphEdges: LangGraphEdgeConfig[] =
    data.graphEdges && data.graphEdges.length > 0
      ? data.graphEdges
      : steps.length === 0 &&
          (!data.agentDefinitions || data.agentDefinitions.length === 0)
        ? [...DEFAULT_LANGGRAPH_GRAPH_EDGES]
        : [];

  const mainEdges = graphEdges
    .filter((e) => !e.id.startsWith("auto_edge_"))
    .filter((e) => !e.targets?.some((t) => t.kind === TARGET_KIND_PORT))
    .flatMap((e) =>
      (e.targets || []).map((t) => {
        const isLLMSource =
          e.sourceHandle === HANDLE_LLM_OUT ||
          e.source.startsWith("llm_") ||
          e.source.startsWith("llm_ref_") ||
          (data.customLlmNodes || []).some((c) => c.id === e.source) ||
          (data.customLlmRefNodes || []).some((c) => c.id === e.source);
        const isToolSource =
          e.sourceHandle === HANDLE_TOOL_OUT ||
          e.source.startsWith("tool_") ||
          e.source.startsWith("tool_ref_") ||
          (data.toolDefinitions || []).some((t) => t.id === e.source) ||
          (data.customToolRefNodes || []).some((c) => c.id === e.source);
        const isMiddlewareSource =
          e.sourceHandle === HANDLE_MIDDLEWARE_OUT ||
          e.source.startsWith("mw_") ||
          e.source.startsWith("mw_ref_") ||
          (data.middlewareDefinitions || []).some((m) => m.id === e.source) ||
          (data.customMiddlewareRefNodes || []).some((c) => c.id === e.source);
        const isMemorySource =
          e.sourceHandle === HANDLE_MEMORY_OUT ||
          e.source.startsWith("mem_") ||
          e.source.startsWith("mem_ref_") ||
          e.source.startsWith("db_") ||
          (data.memoryDefinitions || []).some((m) => m.id === e.source) ||
          (data.customMemoryRefNodes || []).some((c) => c.id === e.source);

        const sourceStep = steps.find((s) => s.id === e.source);
        const routerBranch = sourceStep?.routerConfig?.branches?.find(
          (b) => b.id === e.sourceHandle,
        );

        const sourceHandle =
          e.sourceHandle ||
          (isLLMSource
            ? HANDLE_LLM_OUT
            : isToolSource
              ? HANDLE_TOOL_OUT
              : isMiddlewareSource
                ? HANDLE_MIDDLEWARE_OUT
                : isMemorySource
                  ? HANDLE_MEMORY_OUT
                  : undefined);
        const targetHandle =
          e.targetHandle ||
          t.targetHandle ||
          (isLLMSource
            ? HANDLE_LLM_IN
            : isToolSource
              ? HANDLE_TOOL_IN
              : isMiddlewareSource
                ? HANDLE_MIDDLEWARE_IN
                : isMemorySource
                  ? HANDLE_MEMORY_IN
                  : "in");

        const isLLM =
          isLLMSource ||
          sourceHandle === HANDLE_LLM_OUT ||
          targetHandle === HANDLE_LLM_IN;
        const isTool =
          isToolSource ||
          sourceHandle === HANDLE_TOOL_OUT ||
          targetHandle === HANDLE_TOOL_IN;
        const isMiddleware =
          isMiddlewareSource ||
          sourceHandle === HANDLE_MIDDLEWARE_OUT ||
          targetHandle === HANDLE_MIDDLEWARE_IN;
        const isMemory =
          isMemorySource ||
          sourceHandle === HANDLE_MEMORY_OUT ||
          targetHandle === HANDLE_MEMORY_IN;

        let resolvedTargetId = t.id;
        if (t.kind === TARGET_KIND_END || t.id === "END") {
          const endNode = initialNodes.find(
            (n) => n.type === LANGGRAPH_CANVAS_NODE_END,
          );
          resolvedTargetId = endNode ? endNode.id : NODE_ID_END;
        } else if (t.kind === TARGET_KIND_PORT) {
          resolvedTargetId = makePortNodeId(t.id);
        }

        const fieldStr = routerBranch?.field
          ? routerBranch.field.startsWith("state.")
            ? routerBranch.field
            : `state.${routerBranch.field}`
          : "state";
        const routerLabel = routerBranch
          ? routerBranch.label ||
            (routerBranch.isDefault
              ? "Default"
              : `${fieldStr} ${routerBranch.operator} '${routerBranch.value ?? ""}'`)
          : undefined;

        const edgeLabel = routerBranch
          ? routerLabel
          : e.condition
            ? `${e.condition.field ?? ""} ${e.condition.operator ?? ""}`
            : undefined;

        return {
          id: `${e.id}_${t.id}`,
          source: e.source,
          target: resolvedTargetId,
          ...(sourceHandle ? { sourceHandle } : {}),
          targetHandle: targetHandle || "in",
          animated: true,
          style: isLLM
            ? { stroke: "#38bdf8", strokeWidth: 2, strokeDasharray: "4 4" }
            : isTool
              ? { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "4 4" }
              : isMiddleware
                ? { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: "4 4" }
                : isMemory
                  ? {
                      stroke: "#f59e0b",
                      strokeWidth: 2,
                      strokeDasharray: "4 4",
                    }
                  : routerBranch
                    ? { stroke: "#38bdf8", strokeWidth: 2 }
                    : { stroke: "#a1a1aa", strokeWidth: 2 },
          ...(edgeLabel ? { label: edgeLabel } : {}),
          ...(routerBranch
            ? {
                labelStyle: {
                  fill: "#bae6fd",
                  fontSize: 10,
                  fontWeight: "bold",
                },
                labelBgStyle: { fill: "#0c4a6e", rx: 4, ry: 4 },
              }
            : e.condition
              ? { labelStyle: { fill: "#a1a1aa", fontSize: 10 } }
              : {}),
        };
      }),
    );

  const initialNodeIds = new Set(initialNodes.map((n) => n.id));

  const resourceEdges: LangGraphCanvasEdge[] = [];
  agentDefs.forEach((ag) => {
    const agId = ag.id || ag.agentId;
    if (!agId) return;

    (ag.tools || []).forEach((toolId) => {
      if (!initialNodeIds.has(toolId)) return;
      resourceEdges.push({
        id: `edge_${toolId}_${agId}`,
        source: toolId,
        target: agId,
        sourceHandle: HANDLE_TOOL_OUT,
        targetHandle: HANDLE_TOOL_IN,
        animated: true,
        style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    });

    (ag.middleware || []).forEach((mwId) => {
      if (!initialNodeIds.has(mwId)) return;
      resourceEdges.push({
        id: `edge_${mwId}_${agId}`,
        source: mwId,
        target: agId,
        sourceHandle: HANDLE_MIDDLEWARE_OUT,
        targetHandle: HANDLE_MIDDLEWARE_IN,
        animated: true,
        style: { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    });

    const connectedLlmId = ag.llmNodeId;
    if (
      connectedLlmId &&
      initialNodeIds.has(connectedLlmId)
    ) {
      resourceEdges.push({
        id: `edge_${connectedLlmId}_${agId}`,
        source: connectedLlmId,
        target: agId,
        sourceHandle: HANDLE_LLM_OUT,
        targetHandle: HANDLE_LLM_IN,
        animated: true,
        style: { stroke: "#38bdf8", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    }

    (ag.transformers || []).forEach((trId) => {
      if (!initialNodeIds.has(trId)) return;
      resourceEdges.push({
        id: `edge_${trId}_${agId}`,
        source: trId,
        target: agId,
        sourceHandle: HANDLE_TRANSFORMER_OUT,
        targetHandle: HANDLE_TRANSFORMER_IN,
        animated: true,
        style: { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    });
  });

  steps.forEach((step) => {
    (step.tools || []).forEach((toolId) => {
      if (!initialNodeIds.has(toolId)) return;
      resourceEdges.push({
        id: `edge_${toolId}_${step.id}`,
        source: toolId,
        target: step.id,
        sourceHandle: HANDLE_TOOL_OUT,
        targetHandle: HANDLE_TOOL_IN,
        animated: true,
        style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    });

    (step.transformers || []).forEach((trId) => {
      if (!initialNodeIds.has(trId)) return;
      resourceEdges.push({
        id: `edge_${trId}_${step.id}`,
        source: trId,
        target: step.id,
        sourceHandle: HANDLE_TRANSFORMER_OUT,
        targetHandle: HANDLE_TRANSFORMER_IN,
        animated: true,
        style: { stroke: "#a855f7", strokeWidth: 2, strokeDasharray: "4 4" },
      });
    });
  });

  const outputChannelEdges: LangGraphCanvasEdge[] = (data.outputChannels || [])
    .filter((ch) => Boolean(ch.sourceStepId))
    .map((ch) => {
      const outNodeId = ch.id
        ? ch.id.startsWith("output_") || ch.id.startsWith("out_")
          ? ch.id
          : `output_${ch.id}`
        : `output_${ch.id}`;
      return {
        id: `edge_${ch.sourceStepId}_${outNodeId}`,
        source: ch.sourceStepId!,
        target: outNodeId,
        sourceHandle: "out",
        targetHandle: "in",
        animated: true,
        style: { stroke: "#c084fc", strokeWidth: 2, strokeDasharray: "4 4" },
      };
    });

  // Resource connections (LLM, Tool, Middleware, Memory) are authoritatively
  // managed by agentDefs and steps. Filter out any legacy resource edges that
  // might still exist in graphEdges from older schemas to prevent double-connecting.
  const isResourceHandle = (handle?: string) =>
    handle === HANDLE_LLM_IN ||
    handle === HANDLE_TOOL_IN ||
    handle === HANDLE_MIDDLEWARE_IN ||
    handle === HANDLE_MEMORY_IN;

  const cleanMainEdges = mainEdges.filter((edge) => {
    if (isResourceHandle(edge.targetHandle)) {
      return false;
    }
    return true;
  });

  // Deduplicate edges based on source + sourceHandle + target + targetHandle
  const uniqueEdges = new Map<string, LangGraphCanvasEdge>();
  [...resourceEdges, ...outputChannelEdges, ...cleanMainEdges].forEach((edge) => {
    const key = `${edge.source}:${edge.sourceHandle || ""}->${edge.target}:${edge.targetHandle || ""}`;
    if (!uniqueEdges.has(key)) {
      uniqueEdges.set(key, edge);
    }
  });

  return Array.from(uniqueEdges.values());
}
