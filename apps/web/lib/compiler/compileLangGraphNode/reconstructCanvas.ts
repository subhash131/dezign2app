import {
  CanvasLangGraphNodeData,
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphToolDefinition,
  LangGraphMiddlewareDefinition,
  LangGraphMemoryDefinition,
  LangGraphAgentDefinition,
  LangGraphStepConfig,
  OutputChannelConfig,
  LangGraphEdgeConfig,
} from "@/types/canvas";
import type {
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  LangGraphLLMNode,
  LangGraphLLMRefNode,
  ToolNode,
  LangGraphToolRefNode,
  MiddlewareNode,
  LangGraphMiddlewareRefNode,
  MemoryNode,
  LangGraphMemoryRefNode,
  LangGraphAgentRefNode,
  AgentNode,
  StepNode,
  OutputNode,
  TransformerCanvasNode,
  TransformerRefCanvasNode,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/types";
import {
  NODE_ID_STATE_GLOBAL,
  LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
  NODE_ID_START,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_TOOL_REF,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
  LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  LANGGRAPH_CANVAS_NODE_MEMORY_REF,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT_REF,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER,
  LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_END,
  LANGGRAPH_CANVAS_NODE_OUTPUT,
  NODE_ID_END,
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
  TARGET_KIND_END,
  TARGET_KIND_PORT,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/constants";

export function reconstructNodes(
  data: CanvasLangGraphNodeData,
  stateChannels: LangGraphStateChannel[],
  inputChannels: LangGraphInputChannel[],
): LangGraphCanvasNode[] {
  const transformerDefs =
    data.customTransformerNodes || data.transformerDefinitions || [];
  const transformerRefs = data.customTransformerRefNodes || [];

  const availableTransformers = [
    ...transformerDefs.map((t) => ({
      id: t.id,
      name: t.functionName || t.label || t.id,
      functionName: t.functionName,
      label: t.label,
    })),
    ...transformerRefs.map((r) => ({
      id: r.id,
      name: r.label || r.transformerRef || r.id,
      label: r.label,
    })),
  ];

  const reconstructedNodes: LangGraphCanvasNode[] = [
    {
      id: NODE_ID_STATE_GLOBAL,
      type: LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
      position: data.stateNodePosition || { x: 100, y: 60 },
      data: {
        label: "Global Graph State",
        stateChannels,
      },
      deletable: false,
    },
    {
      id: NODE_ID_START,
      type: LANGGRAPH_CANVAS_NODE_START,
      position: data.startNodePosition || { x: 100, y: 320 },
      data: {
        label: "INPUT State",
        inputChannels,
        stateChannels,
        availableTransformers,
      },
      deletable: false,
    },
  ];

  const customLLMs = data.customLlmNodes || [];
  customLLMs.forEach((cLLM) => {
    const customNode: LangGraphLLMNode = {
      id: cLLM.id,
      type: LANGGRAPH_CANVAS_NODE_LLM,
      position: cLLM.position || { x: 340, y: 80 },
      data: {
        label: cLLM.label || "Custom LLM",
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
    reconstructedNodes.push(customNode);
  });

  const customLLMRefs = data.customLlmRefNodes || [];
  customLLMRefs.forEach((cRef) => {
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
    reconstructedNodes.push(customRefNode);
  });

  const customToolRefs = data.customToolRefNodes || [];
  customToolRefs.forEach((tRef) => {
    const customRefNode: LangGraphToolRefNode = {
      id: tRef.id,
      type: LANGGRAPH_CANVAS_NODE_TOOL_REF,
      position: tRef.position || { x: 340, y: 160 },
      data: {
        label: tRef.label || "Tool Ref",
        refId: tRef.id,
        toolRef: tRef.toolRef,
      },
    };
    reconstructedNodes.push(customRefNode);
  });

  const customMiddlewareRefs = data.customMiddlewareRefNodes || [];
  customMiddlewareRefs.forEach((mRef) => {
    const customRefNode: LangGraphMiddlewareRefNode = {
      id: mRef.id,
      type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
      position: mRef.position || { x: 340, y: 220 },
      data: {
        label: mRef.label || "Middleware Ref",
        refId: mRef.id,
        middlewareRef: mRef.middlewareRef,
      },
    };
    reconstructedNodes.push(customRefNode);
  });

  const customMemoryRefs = data.customMemoryRefNodes || [];
  customMemoryRefs.forEach((memRef) => {
    const customRefNode: LangGraphMemoryRefNode = {
      id: memRef.id,
      type: LANGGRAPH_CANVAS_NODE_MEMORY_REF,
      position: memRef.position || { x: 340, y: 280 },
      data: {
        label: memRef.label || "Memory Ref",
        refId: memRef.id,
        memoryRef: memRef.memoryRef,
      },
    };
    reconstructedNodes.push(customRefNode);
  });

  const customAgentRefs = data.customAgentRefNodes || [];
  customAgentRefs.forEach((aRef) => {
    const customRefNode: LangGraphAgentRefNode = {
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
    reconstructedNodes.push(customRefNode);
  });

  transformerDefs.forEach((tDef) => {
    const tId = tDef.id || `transformer_${Date.now()}`;
    const tNode: TransformerCanvasNode = {
      id: tId,
      type: LANGGRAPH_CANVAS_NODE_TRANSFORMER,
      position: tDef.position || { x: 340, y: 160 },
      data: {
        label: tDef.label || tDef.functionName || "Transformer",
        functionName: tDef.functionName || tDef.label,
        code: tDef.code,
        scope: tDef.scope,
        inputSchema: tDef.inputSchema?.map((p, idx) => ({
          id: `param_${idx}`,
          name: p.name,
          type: p.type,
          required: p.required ?? false,
          description: p.description,
        })),
        returnSchema: tDef.returnSchema,
      },
    };
    reconstructedNodes.push(tNode);
  });

  transformerRefs.forEach((tRef) => {
    const refNode: TransformerRefCanvasNode = {
      id: tRef.id,
      type: LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF,
      position: tRef.position || { x: 340, y: 160 },
      data: {
        label: tRef.label || "Transformer Ref",
        transformerRef: tRef.transformerRef,
      },
    };
    reconstructedNodes.push(refNode);
  });

  const toolDefs: LangGraphToolDefinition[] = data.toolDefinitions || [];
  toolDefs.forEach((toolDef) => {
    const toolId = toolDef.id || toolDef.toolId || `tool_${Date.now()}`;
    const toolNode: ToolNode = {
      id: toolId,
      type: LANGGRAPH_CANVAS_NODE_TOOL,
      position: toolDef.position || { x: 340, y: 160 },
      data: {
        label: toolDef.name || toolDef.label || "Tool",
        toolId: toolId,
        name: toolDef.name || toolDef.label || "my_tool",
        description: toolDef.description || "",
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
    reconstructedNodes.push(toolNode);
  });

  const middlewareDefs: LangGraphMiddlewareDefinition[] =
    data.middlewareDefinitions || [];
  middlewareDefs.forEach((mwDef) => {
    const mwId = mwDef.id || mwDef.middlewareId || `mw_${Date.now()}`;
    const mwNode: MiddlewareNode = {
      id: mwId,
      type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
      position: mwDef.position || { x: 340, y: 240 },
      data: {
        label: mwDef.name || "Middleware",
        middlewareId: mwId,
        name: mwDef.name || "Middleware",
        type: mwDef.type,
        humanInTheLoopConfig: mwDef.humanInTheLoopConfig,
        rateLimitConfig: mwDef.rateLimitConfig,
        loggingConfig: mwDef.loggingConfig,
        customBody: mwDef.customBody,
      },
    };
    reconstructedNodes.push(mwNode);
  });

  const memoryDefs: LangGraphMemoryDefinition[] = data.memoryDefinitions || [];
  memoryDefs.forEach((memDef) => {
    const memId = memDef.id || memDef.memoryId || `mem_${Date.now()}`;
    const memNode: MemoryNode = {
      id: memId,
      type: LANGGRAPH_CANVAS_NODE_MEMORY,
      position: memDef.position || { x: 340, y: 320 },
      data: {
        label: memDef.name || "Memory Saver",
        memoryId: memId,
        name: memDef.name || "Memory Saver",
        checkpointer: memDef.checkpointer || "memory",
        threadIdKey: memDef.threadIdKey || "thread_id",
        threadScope: memDef.threadScope || "session",
        autoSummarize: memDef.autoSummarize ?? true,
        saveMessages: memDef.saveMessages ?? true,
      },
    };
    reconstructedNodes.push(memNode);
  });

  const agentDefs: LangGraphAgentDefinition[] = data.agentDefinitions || [];
  agentDefs.forEach((agDef) => {
    const agId = agDef.id || agDef.agentId || `node_${Date.now()}`;
    const agNode: AgentNode = {
      id: agId,
      type: LANGGRAPH_CANVAS_NODE_NODE,
      position: agDef.position || { x: 420, y: 160 },
      data: {
        label: agDef.name || "Node",
        agentId: agId,
        name: agDef.name || "Node",
        systemPrompt: agDef.systemPrompt,
        modelConfig:
          agDef.llmConfig?.enabled === false ? undefined : agDef.modelConfig,
        llmConfig: agDef.llmConfig || { enabled: false },
        middlewareConfig: agDef.middlewareConfig,
        stateUpdatesConfig: agDef.stateUpdatesConfig,
        streamConfig: agDef.streamConfig,
        responseFormat: agDef.responseFormat,
        memoryConfig: agDef.memoryConfig,
        stateUpdates: agDef.stateUpdates || [],
        pipelineSteps: agDef.pipelineSteps,
        nodeSteps: agDef.nodeSteps,
        customCode: agDef.customCode,
        availableStateChannels: stateChannels,
        tools: agDef.tools || [],
        middleware: agDef.middleware || [],
        transformers: agDef.transformers || [],
        memory: agDef.memory || [],
      },
    };
    reconstructedNodes.push(agNode);
  });

  const steps: LangGraphStepConfig[] = data.graphSteps || [];
  steps.forEach((step, idx) => {
    const stepNode: StepNode = {
      id: step.id,
      type: LANGGRAPH_CANVAS_NODE_STEP,
      position: step.position || {
        x: 420 + idx * 280,
        y: 190 + (idx % 2 === 0 ? 0 : 60),
      },
      data: {
        label: step.name || "Step",
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
        availableStateChannels: stateChannels,
      },
    };
    reconstructedNodes.push(stepNode);
  });

  const savedEndNodes = data.endNodes || [];
  savedEndNodes.forEach((endNode) => {
    if (!reconstructedNodes.some((n) => n.id === endNode.id)) {
      reconstructedNodes.push({
        id: endNode.id,
        type: LANGGRAPH_CANVAS_NODE_END,
        position: endNode.position ||
          data.endNodePosition || { x: 750, y: 320 },
        data: { label: endNode.label || "END State" },
      });
    }
  });

  const outputChannels: OutputChannelConfig[] = data.outputChannels || [];
  outputChannels.forEach((ch, idx) => {
    const outNodeId = `out_${ch.id}`;
    if (!reconstructedNodes.some((n) => n.id === outNodeId)) {
      const outputNode: OutputNode = {
        id: outNodeId,
        type: LANGGRAPH_CANVAS_NODE_OUTPUT,
        position: { x: 500, y: 240 + idx * 80 },
        data: {
          id: ch.id,
          label: ch.name || "Output Channel",
          name: ch.name || "Output Channel",
          type: ch.type || "sse",
          topicOrEventName: ch.topicOrEventName,
          targetStateChannel: ch.targetStateChannel,
          description: ch.description,
        },
      };
      reconstructedNodes.push(outputNode);
    }
  });

  if (!reconstructedNodes.some((n) => n.type === LANGGRAPH_CANVAS_NODE_END)) {
    reconstructedNodes.push({
      id: NODE_ID_END,
      type: LANGGRAPH_CANVAS_NODE_END,
      position: data.endNodePosition || { x: 750, y: 320 },
      data: { label: "END State" },
      deletable: false,
    });
  }

  return reconstructedNodes;
}

export function reconstructEdges(
  data: CanvasLangGraphNodeData,
  reconstructedNodes: LangGraphCanvasNode[],
): LangGraphCanvasEdge[] {
  const customLLMs = data.customLlmNodes || [];
  const toolDefs: LangGraphToolDefinition[] = data.toolDefinitions || [];
  const middlewareDefs: LangGraphMiddlewareDefinition[] =
    data.middlewareDefinitions || [];
  const memoryDefs: LangGraphMemoryDefinition[] = data.memoryDefinitions || [];
  const transformerDefs =
    data.customTransformerNodes || data.transformerDefinitions || [];
  const graphEdges: LangGraphEdgeConfig[] = data.graphEdges || [];

  const reconstructedNodeIds = new Set(reconstructedNodes.map((n) => n.id));

  const mainEdges = graphEdges
    .filter((e) => !e.id.startsWith("auto_edge_"))
    .filter((e) => !e.targets?.some((t) => t.kind === TARGET_KIND_PORT))
    .flatMap((e) =>
      (e.targets || []).map((t) => {
        const isLLMSource =
          e.sourceHandle === HANDLE_LLM_OUT ||
          e.source.startsWith("llm_") ||
          e.source.startsWith("llm_ref_") ||
          customLLMs.some((c) => c.id === e.source) ||
          (data.customLlmRefNodes || []).some((r) => r.id === e.source);
        const isToolSource =
          e.sourceHandle === HANDLE_TOOL_OUT ||
          e.source.startsWith("tool_") ||
          e.source.startsWith("tool_ref_") ||
          toolDefs.some((td) => (td.id || td.toolId) === e.source) ||
          (data.customToolRefNodes || []).some((r) => r.id === e.source);
        const isMiddlewareSource =
          e.sourceHandle === HANDLE_MIDDLEWARE_OUT ||
          e.source.startsWith("mw_") ||
          e.source.startsWith("mw_ref_") ||
          middlewareDefs.some((m) => (m.id || m.middlewareId) === e.source) ||
          (data.customMiddlewareRefNodes || []).some((r) => r.id === e.source);
        const isMemorySource =
          e.sourceHandle === HANDLE_MEMORY_OUT ||
          e.source.startsWith("mem_") ||
          e.source.startsWith("mem_ref_") ||
          e.source.startsWith("db_") ||
          memoryDefs.some((m) => (m.id || m.memoryId) === e.source) ||
          (data.customMemoryRefNodes || []).some((r) => r.id === e.source);
        const isTransformerSource =
          e.sourceHandle === HANDLE_TRANSFORMER_OUT ||
          e.source.startsWith("transformer_") ||
          e.source.startsWith("transformer_ref_") ||
          transformerDefs.some((t) => t.id === e.source) ||
          (data.customTransformerRefNodes || []).some((r) => r.id === e.source);

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
                  : isTransformerSource
                    ? HANDLE_TRANSFORMER_OUT
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
                  : isTransformerSource
                    ? HANDLE_TRANSFORMER_IN
                    : "in");

        let resolvedTargetId = t.id;
        if (t.kind === TARGET_KIND_END || t.id === "END") {
          const endNode = reconstructedNodes.find(
            (n) => n.type === LANGGRAPH_CANVAS_NODE_END,
          );
          resolvedTargetId = endNode ? endNode.id : NODE_ID_END;
        }

        return {
          id: `${e.id}_${t.id}`,
          source: e.source,
          target: resolvedTargetId,
          ...(sourceHandle ? { sourceHandle } : {}),
          targetHandle: targetHandle || "in",
          animated: true,
        };
      }),
    );

  const resourceEdges: LangGraphCanvasEdge[] = [];
  const agentDefs: LangGraphAgentDefinition[] = data.agentDefinitions || [];
  agentDefs.forEach((ag) => {
    const agId = ag.id || ag.agentId;
    if (!agId) return;

    (ag.tools || []).forEach((toolId) => {
      if (!reconstructedNodeIds.has(toolId)) return;
      resourceEdges.push({
        id: `edge_${toolId}_${agId}`,
        source: toolId,
        target: agId,
        sourceHandle: HANDLE_TOOL_OUT,
        targetHandle: HANDLE_TOOL_IN,
        animated: true,
      });
    });

    (ag.middleware || []).forEach((mwId) => {
      if (!reconstructedNodeIds.has(mwId)) return;
      resourceEdges.push({
        id: `edge_${mwId}_${agId}`,
        source: mwId,
        target: agId,
        sourceHandle: HANDLE_MIDDLEWARE_OUT,
        targetHandle: HANDLE_MIDDLEWARE_IN,
        animated: true,
      });
    });

    (ag.transformers || []).forEach((tId) => {
      if (!reconstructedNodeIds.has(tId)) return;
      resourceEdges.push({
        id: `edge_${tId}_${agId}`,
        source: tId,
        target: agId,
        sourceHandle: HANDLE_TRANSFORMER_OUT,
        targetHandle: HANDLE_TRANSFORMER_IN,
        animated: true,
      });
    });

    (ag.memory || []).forEach((memId) => {
      if (!reconstructedNodeIds.has(memId)) return;
      resourceEdges.push({
        id: `edge_${memId}_${agId}`,
        source: memId,
        target: agId,
        sourceHandle: HANDLE_MEMORY_OUT,
        targetHandle: HANDLE_MEMORY_IN,
        animated: true,
      });
    });

    if (ag.llmNodeId && reconstructedNodeIds.has(ag.llmNodeId)) {
      resourceEdges.push({
        id: `edge_${ag.llmNodeId}_${agId}`,
        source: ag.llmNodeId,
        target: agId,
        sourceHandle: HANDLE_LLM_OUT,
        targetHandle: HANDLE_LLM_IN,
        animated: true,
      });
    }
  });

  const steps: LangGraphStepConfig[] = data.graphSteps || [];
  steps.forEach((step) => {
    (step.tools || []).forEach((toolId) => {
      if (!reconstructedNodeIds.has(toolId)) return;
      resourceEdges.push({
        id: `edge_${toolId}_${step.id}`,
        source: toolId,
        target: step.id,
        sourceHandle: HANDLE_TOOL_OUT,
        targetHandle: HANDLE_TOOL_IN,
        animated: true,
      });
    });
  });

  const isResourceHandle = (handle?: string) =>
    handle === HANDLE_LLM_IN ||
    handle === HANDLE_TOOL_IN ||
    handle === HANDLE_MIDDLEWARE_IN ||
    handle === HANDLE_MEMORY_IN;

  const cleanMainEdges = mainEdges.filter((edge) => !isResourceHandle(edge.targetHandle));

  const uniqueEdges = new Map<string, LangGraphCanvasEdge>();
  [...resourceEdges, ...cleanMainEdges].forEach((edge) => {
    const key = `${edge.source}:${edge.sourceHandle || ""}->${edge.target}:${edge.targetHandle || ""}`;
    if (!uniqueEdges.has(key)) {
      uniqueEdges.set(key, edge);
    }
  });

  return Array.from(uniqueEdges.values());
}
