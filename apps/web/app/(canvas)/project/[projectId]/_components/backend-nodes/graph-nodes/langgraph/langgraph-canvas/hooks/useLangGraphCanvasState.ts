import { useState, useMemo, useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  type BackendNode,
  type LangGraphStateChannel,
  type LangGraphInputChannel,
  type LangGraphMemoryConfig,
  type LangGraphCanvasNode,
  type LangGraphCanvasEdge,
} from "@workspace/canvas";
import { isReservedNodeId } from "../constants";

import { buildInitialNodes, buildInitialEdges } from "./utils/initializers";
import { useAgentResourceConnections } from "./useAgentResourceConnections";
import { useSelectedNodeState } from "./useSelectedNodeState";
import { useNodeFactory } from "./useNodeFactory";
import { useCanvasNodeSync } from "./useCanvasNodeSync";
import { useCanvasConnections } from "./useCanvasConnections";
import { useCanvasPersistence } from "./useCanvasPersistence";

export interface UseLangGraphCanvasStateProps {
  node: BackendNode;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  onClose: () => void;
}

export function useLangGraphCanvasState({
  node,
  updateNode,
  onClose,
}: UseLangGraphCanvasStateProps) {
  const data = node.data;

  const [inputChannels, setInputChannels] = useState<LangGraphInputChannel[]>(
    data.inputChannels || [],
  );
  const [stateChannels, setStateChannels] = useState<LangGraphStateChannel[]>(
    data.stateChannels || [
      {
        key: "messages",
        type: "messages",
        reducer: "add_messages",
        defaultValue: [],
      },
    ],
  );
  const [memoryConfig, setMemoryConfig] = useState<LangGraphMemoryConfig>(
    data.memoryConfig || {
      checkpointer: "memory",
      threadScope: "session",
      autoSummarize: true,
      maxWindowMessages: 10,
    },
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<
    "inspector" | "inputs" | "state" | "memory"
  >("inspector");
  const [showCompileModal, setShowCompileModal] = useState(false);

  const { fitView: triggerFitView } = useReactFlow();

  // ── Build initial nodes & edges ──
  const initialNodes = useMemo(() => buildInitialNodes(data), []);
  const initialEdges = useMemo(() => buildInitialEdges(data, initialNodes), []);

  const [nodes, setNodes] = useState<LangGraphCanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<LangGraphCanvasEdge[]>(initialEdges);

  useEffect(() => {
    const timer = setTimeout(() => {
      triggerFitView({ padding: 0.35, duration: 200, maxZoom: 0.85 });
    }, 50);
    return () => clearTimeout(timer);
  }, [triggerFitView]);

  const handleAddChannel = useCallback(() => {
    const newChannel: LangGraphStateChannel = {
      key: "",
      type: "string",
      reducer: "replace",
      defaultValue: "",
    };
    setStateChannels((prev) => [...prev, newChannel]);
    setActiveSideTab("state");
  }, []);

  // ── Sync node callbacks and internal attributes ──
  useCanvasNodeSync({
    nodes,
    setNodes,
    setEdges,
    inputChannels,
    stateChannels,
    setSelectedNodeId,
    setActiveSideTab,
    handleAddChannel,
  });

  // ── Connection handling hook ──
  const { onNodesChange, onEdgesChange, isValidConnection, onConnect } =
    useCanvasConnections({
      nodes,
      setNodes,
      setEdges,
    });

  // ── Sub-hooks for focused responsibility areas ──
  const {
    selectedStepData,
    selectedLLMData,
    selectedToolData,
    selectedMiddlewareData,
    selectedAgentData,
    selectedMemoryData,
    selectedOutputData,
    selectedStartData,
    updateSelectedStep,
    updateSelectedLLM,
    updateSelectedTool,
    updateSelectedMiddleware,
    updateSelectedAgent,
    updateSelectedMemory,
    updateSelectedOutput,
  } = useSelectedNodeState({ nodes, selectedNodeId, setNodes });

  const { handleAddStep } = useNodeFactory({
    setNodes,
    setEdges,
    setSelectedNodeId,
    setActiveSideTab,
    stateChannels,
  });

  const {
    availableLLMNodes,
    availableToolNodes,
    availableMiddlewareNodes,
    availableMemoryNodes,
    handleSelectLLMForAgent,
    handleToggleToolForAgent,
    handleToggleMiddlewareForAgent,
    handleToggleMemoryForAgent,
  } = useAgentResourceConnections({ nodes, setEdges });

  // ── Persistence & Auto-Save ──
  const { saveStatus, handleSave } = useCanvasPersistence({
    node,
    updateNode,
    onClose,
    nodes,
    edges,
    inputChannels,
    stateChannels,
    memoryConfig,
  });

  // ── Delete selected step ──
  const handleDeleteStep = () => {
    if (!selectedNodeId || isReservedNodeId(selectedNodeId)) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    setSelectedNodeId(null);
  };

  const handleDeleteSelected = useCallback(() => {
    if (selectedNodeId && !isReservedNodeId(selectedNodeId)) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) =>
        eds.filter(
          (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
        ),
      );
      setSelectedNodeId(null);
    }
    setEdges((eds) => eds.filter((e) => !e.selected));
  }, [selectedNodeId]);

  return {
    nodes,
    edges,
    setEdges,
    inputChannels,
    setInputChannels,
    stateChannels,
    setStateChannels,
    memoryConfig,
    setMemoryConfig,
    selectedNodeId,
    setSelectedNodeId,
    activeSideTab,
    setActiveSideTab,
    selectedStepData,
    selectedLLMData,
    selectedToolData,
    selectedMiddlewareData,
    selectedAgentData,
    selectedMemoryData,
    selectedOutputData,
    selectedStartData,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    handleAddStep,
    updateSelectedStep,
    updateSelectedLLM,
    updateSelectedTool,
    updateSelectedMiddleware,
    updateSelectedAgent,
    updateSelectedMemory,
    updateSelectedOutput,
    handleDeleteStep,
    handleDeleteSelected,
    handleSave,
    saveStatus,
    availableLLMNodes,
    availableToolNodes,
    availableMiddlewareNodes,
    availableMemoryNodes,
    handleSelectLLMForAgent,
    handleToggleToolForAgent,
    handleToggleMiddlewareForAgent,
    handleToggleMemoryForAgent,
    showCompileModal,
    setShowCompileModal,
  };
}
