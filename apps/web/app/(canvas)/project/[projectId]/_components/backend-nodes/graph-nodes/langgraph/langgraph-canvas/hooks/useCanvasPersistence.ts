import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  type BackendNode,
  type LangGraphStateChannel,
  type LangGraphInputChannel,
  type LangGraphMemoryConfig,
  type LangGraphCustomReducer,
  type LangGraphCanvasNode,
  type LangGraphCanvasEdge,
  ensureLangGraphDataReachability,
} from "@workspace/canvas";
import {
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_MEMORY_CONFIG,
} from "@workspace/canvas/constants";
import { buildGraphData as buildGraphDataUtil } from "./utils/serializer";

interface UseCanvasPersistenceProps {
  node: BackendNode;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  onClose: () => void;
  nodes: LangGraphCanvasNode[];
  edges: LangGraphCanvasEdge[];
  inputChannels: LangGraphInputChannel[];
  stateChannels: LangGraphStateChannel[];
  customReducers?: LangGraphCustomReducer[];
  memoryConfig: LangGraphMemoryConfig;
}

export function useCanvasPersistence({
  node,
  updateNode,
  onClose,
  nodes,
  edges,
  inputChannels,
  stateChannels,
  customReducers,
  memoryConfig,
}: UseCanvasPersistenceProps) {
  const data = node.data;

  // ── Build sanitized graph data ──
  const buildGraphData = useCallback(() => {
    return buildGraphDataUtil({
      nodes,
      edges,
      inputChannels,
      stateChannels,
      customReducers,
      memoryConfig,
      data,
    });
  }, [nodes, edges, inputChannels, stateChannels, customReducers, memoryConfig, data]);

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">(
    "idle",
  );
  const isFirstRenderRef = useRef(true);
  const lastSavedJsonRef = useRef<string>(
    JSON.stringify(
      ensureLangGraphDataReachability({
        ...data,
        graphSteps: data.graphSteps || [],
        graphEdges: data.graphEdges || [],
        inputChannels:
          data.inputChannels && data.inputChannels.length > 0
            ? data.inputChannels
            : [...DEFAULT_LANGGRAPH_INPUT_CHANNELS],
        stateChannels:
          data.stateChannels && data.stateChannels.length > 0
            ? data.stateChannels
            : [...DEFAULT_LANGGRAPH_STATE_CHANNELS],
        customReducers: data.customReducers || [],
        memoryConfig: {
          ...DEFAULT_LANGGRAPH_MEMORY_CONFIG,
          ...(data.memoryConfig || {}),
        },
        customLlmNodes: data.customLlmNodes || [],
        customLlmRefNodes: data.customLlmRefNodes || [],
        customToolRefNodes: data.customToolRefNodes || [],
        customMiddlewareRefNodes: data.customMiddlewareRefNodes || [],
        customMemoryRefNodes: data.customMemoryRefNodes || [],
        customAgentRefNodes: data.customAgentRefNodes || [],
        toolDefinitions: data.toolDefinitions || [],
        middlewareDefinitions: data.middlewareDefinitions || [],
        memoryDefinitions: data.memoryDefinitions || [],
        agentDefinitions: data.agentDefinitions || [],
      }),
    ),
  );

  // ── Auto-save with 400ms debounce ──
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    const currentData = buildGraphData();
    const currentJson = JSON.stringify(currentData);

    if (currentJson === lastSavedJsonRef.current) {
      return;
    }

    setSaveStatus("saving");

    const timer = setTimeout(() => {
      updateNode(node.id, { data: currentData });
      lastSavedJsonRef.current = currentJson;
      setSaveStatus("saved");
    }, 400);

    return () => clearTimeout(timer);
  }, [
    nodes,
    edges,
    inputChannels,
    stateChannels,
    customReducers,
    memoryConfig,
    buildGraphData,
    node.id,
    updateNode,
  ]);

  // ── Flush auto-save on unmount if pending changes exist ──
  const buildGraphDataRef = useRef(buildGraphData);
  buildGraphDataRef.current = buildGraphData;

  useEffect(() => {
    return () => {
      const currentData = buildGraphDataRef.current();
      const currentJson = JSON.stringify(currentData);
      if (currentJson !== lastSavedJsonRef.current) {
        updateNode(node.id, { data: currentData });
        lastSavedJsonRef.current = currentJson;
      }
    };
  }, [node.id, updateNode]);

  // ── Manual Save & Close ──
  const handleSave = () => {
    const currentData = buildGraphData();
    updateNode(node.id, {
      data: currentData,
    });
    lastSavedJsonRef.current = JSON.stringify(currentData);
    setSaveStatus("saved");
    toast.success("LangGraph saved!");
    onClose();
  };

  return {
    buildGraphData,
    saveStatus,
    handleSave,
  };
}
