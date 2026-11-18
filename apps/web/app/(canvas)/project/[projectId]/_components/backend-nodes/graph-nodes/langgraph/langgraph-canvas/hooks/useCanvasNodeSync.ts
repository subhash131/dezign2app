import { useEffect } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  type LangGraphStateChannel,
  type LangGraphInputChannel,
  type LangGraphCanvasNode,
  type LangGraphCanvasEdge,
  type StateGlobalNode,
  type MemoryNode,
  type LangGraphMemoryConfig,
  type LangGraphCustomReducer,
} from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_STEP,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  LANGGRAPH_CANVAS_NODE_MEMORY_REF,
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_TOOL,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT,
  LANGGRAPH_CANVAS_NODE_AGENT_REF,
  LANGGRAPH_CANVAS_NODE_NODE_REF,
  NODE_ID_START,
  NODE_ID_STATE_GLOBAL,
  NODE_ID_CHECKPOINTER,
  HANDLE_MEMORY_IN,
  HANDLE_MEMORY_OUT,
} from "../constants";

interface UseCanvasNodeSyncProps {
  nodes: LangGraphCanvasNode[];
  setNodes: React.Dispatch<React.SetStateAction<LangGraphCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<LangGraphCanvasEdge[]>>;
  inputChannels: LangGraphInputChannel[];
  stateChannels: LangGraphStateChannel[];
  memoryConfig?: LangGraphMemoryConfig;
  setMemoryConfig?: React.Dispatch<React.SetStateAction<LangGraphMemoryConfig>>;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSideTab: React.Dispatch<
    React.SetStateAction<"inspector" | "inputs" | "state" | "memory" | "testing">
  >;
  handleAddChannel: () => void;
  handleUpdateChannel?: (
    index: number,
    channel: Partial<LangGraphStateChannel>,
  ) => void;
  handleDeleteChannel?: (index: number) => void;
  handleDuplicateChannel?: (index: number) => void;
  customReducers?: LangGraphCustomReducer[];
  handleAddCustomReducer?: (reducer: LangGraphCustomReducer) => void;
  handleUpdateCustomReducer?: (
    idOrName: string,
    changes: Partial<LangGraphCustomReducer>,
  ) => void;
  handleDeleteCustomReducer?: (idOrName: string) => void;
  // Input channel callbacks (for StartNode inline editing)
  handleRefreshInputs?: () => void;
  handleAddInputChannel?: () => void;
  handleAddSuggestedChannel?: (channel: LangGraphInputChannel) => void;
  handleUpdateInputChannel?: (index: number, changes: Partial<LangGraphInputChannel>) => void;
  handleDeleteInputChannel?: (index: number) => void;
  handleAutoMapStateChannels?: () => void;
  handleMapStateToInput?: (stateKey: string, inputChannelIdOrKey?: string) => void;
  suggestedParams?: Array<{ key: string; type: LangGraphInputChannel["type"]; description?: string; required?: boolean }>;
}

function extractTransformerInfo(
  nodeId: string,
  nodeData: { functionName?: string; label?: string } | null | undefined,
): {
  id: string;
  name: string;
  functionName?: string;
  label?: string;
} {
  const functionName =
    nodeData && typeof nodeData.functionName === "string"
      ? nodeData.functionName
      : undefined;
  const label =
    nodeData && typeof nodeData.label === "string" ? nodeData.label : undefined;
  return {
    id: nodeId,
    name: functionName || label || nodeId,
    functionName,
    label,
  };
}

export function useCanvasNodeSync({
  setNodes,
  setEdges,
  inputChannels,
  stateChannels,
  customReducers,
  memoryConfig,
  setMemoryConfig,
  setSelectedNodeId,
  setActiveSideTab,
  handleAddChannel,
  handleUpdateChannel,
  handleDeleteChannel,
  handleDuplicateChannel,
  handleAddCustomReducer,
  handleUpdateCustomReducer,
  handleDeleteCustomReducer,
  handleRefreshInputs,
  handleAddInputChannel,
  handleAddSuggestedChannel,
  handleUpdateInputChannel,
  handleDeleteInputChannel,
  handleAutoMapStateChannels,
  handleMapStateToInput,
  suggestedParams,
}: UseCanvasNodeSyncProps) {
  useEffect(() => {
    setNodes((nds) => {
      const hasStateGlobal = nds.some((n) => n.id === NODE_ID_STATE_GLOBAL);

      const localTransformers = nds
        .filter(
          (n) =>
            n.type === "transformer_ref" ||
            n.type === "transformer",
        )
        .map((n) => extractTransformerInfo(n.id, n.data));

      const rootTransformers = (useBackendCanvasStore.getState().nodes || [])
        .filter((n) => n.type === "transformer")
        .map((n) => extractTransformerInfo(n.id, n.data));

      const availableTransformers = [
        ...localTransformers,
        ...rootTransformers.filter(
          (rt) =>
            !localTransformers.some(
              (lt) => lt.id === rt.id || lt.name === rt.name,
            ),
        ),
      ];

      let updated = nds.map((n): LangGraphCanvasNode => {
        if (n.id === NODE_ID_START && n.type === LANGGRAPH_CANVAS_NODE_START) {
          return {
            ...n,
            data: {
              ...n.data,
              inputChannels,
              stateChannels,
              suggestedParams,
              availableTransformers,
              onRefreshInputs: handleRefreshInputs,
              onAddInputChannel: handleAddInputChannel,
              onAddSuggestedChannel: handleAddSuggestedChannel,
              onUpdateInputChannel: handleUpdateInputChannel,
              onDeleteInputChannel: handleDeleteInputChannel,
              onAutoMapStateChannels: handleAutoMapStateChannels,
              onMapStateToInput: handleMapStateToInput,
              onOpenInputsTab: () => {
                setSelectedNodeId(NODE_ID_START);
                setActiveSideTab("inputs");
              },
              onOpenStateTab: () => {
                setSelectedNodeId(NODE_ID_STATE_GLOBAL);
                setActiveSideTab("state");
              },
              onOpenTestingTab: () => {
                setSelectedNodeId(NODE_ID_START);
                setActiveSideTab("testing");
              },
            },
          };
        }
        if (
          n.id === NODE_ID_STATE_GLOBAL &&
          n.type === LANGGRAPH_CANVAS_NODE_STATE_GLOBAL
        ) {
          return {
            ...n,
            data: {
              ...n.data,
              stateChannels,
              customReducers,
              onOpenStateTab: () => {
                setSelectedNodeId(NODE_ID_STATE_GLOBAL);
                setActiveSideTab("state");
              },
              onAddChannel: handleAddChannel,
              onUpdateChannel: handleUpdateChannel,
              onDeleteChannel: handleDeleteChannel,
              onDuplicateChannel: handleDuplicateChannel,
              onAddCustomReducer: handleAddCustomReducer,
              onUpdateCustomReducer: handleUpdateCustomReducer,
              onDeleteCustomReducer: handleDeleteCustomReducer,
            },
          };
        }
        if (n.type === LANGGRAPH_CANVAS_NODE_LLM) {
          return {
            ...n,
            data: {
              ...n.data,
              onDeleteLLM: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== n.id));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== n.id && edge.target !== n.id,
                  ),
                );
                setSelectedNodeId((curr) => (curr === n.id ? null : curr));
              },
            },
          };
        }
        if (n.type === LANGGRAPH_CANVAS_NODE_TOOL) {
          return {
            ...n,
            data: {
              ...n.data,
              onDeleteTool: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== n.id));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== n.id && edge.target !== n.id,
                  ),
                );
                setSelectedNodeId((curr) => (curr === n.id ? null : curr));
              },
              onOpenInspector: () => {
                setSelectedNodeId(n.id);
                setActiveSideTab("inspector");
              },
              onSelectNode: () => {
                setSelectedNodeId(n.id);
              },
            },
          };
        }
        if (
          n.type === LANGGRAPH_CANVAS_NODE_NODE ||
          n.type === LANGGRAPH_CANVAS_NODE_AGENT
        ) {
          return {
            ...n,
            data: {
              ...n.data,
              availableStateChannels: stateChannels,
              onOpenInspector: () => {
                setSelectedNodeId(n.id);
                setActiveSideTab("inspector");
              },
              onSelectNode: () => {
                setSelectedNodeId(n.id);
              },
            },
          };
        }
        if (n.type === LANGGRAPH_CANVAS_NODE_STEP) {
          return {
            ...n,
            data: {
              ...n.data,
              availableStateChannels: stateChannels,
              onOpenInspector: () => {
                setSelectedNodeId(n.id);
                setActiveSideTab("inspector");
              },
              onOpenInspectorRoute: (branchId: string) => {
                setSelectedNodeId(n.id);
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === n.id && node.type === LANGGRAPH_CANVAS_NODE_STEP
                      ? {
                          ...node,
                          data: { ...node.data, activeBranchId: branchId },
                        }
                      : node,
                  ),
                );
                setActiveSideTab("inspector");
              },
              onSelectNode: () => {
                setSelectedNodeId(n.id);
              },
              onDeleteStep: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== n.id));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== n.id && edge.target !== n.id,
                  ),
                );
                setSelectedNodeId((curr) => (curr === n.id ? null : curr));
              },
            },
          };
        }
        if (
          n.type === LANGGRAPH_CANVAS_NODE_AGENT_REF ||
          n.type === LANGGRAPH_CANVAS_NODE_NODE_REF
        ) {
          return {
            ...n,
            data: {
              ...n.data,
              onDeleteAgentRef: () => {
                setNodes((nodes) => nodes.filter((node) => node.id !== n.id));
                setEdges((edges) =>
                  edges.filter(
                    (edge) => edge.source !== n.id && edge.target !== n.id,
                  ),
                );
                setSelectedNodeId((curr) => (curr === n.id ? null : curr));
              },
            },
          };
        }
        if (
          n.id === NODE_ID_CHECKPOINTER ||
          n.type === LANGGRAPH_CANVAS_NODE_MEMORY
        ) {
          return {
            ...n,
            type: LANGGRAPH_CANVAS_NODE_MEMORY,
            data: {
              ...n.data,
              label: "Graph Checkpointer",
              name: "Graph Checkpointer",
              enabled: memoryConfig?.enabled !== false,
              checkpointer: memoryConfig?.checkpointer || "postgres",
              checkpointerConnectionId: memoryConfig?.checkpointerNodeId,
              threadIdKey: "thread_id",
              threadScope: memoryConfig?.threadScope || "session",
              autoSummarize: memoryConfig?.autoSummarize ?? true,
              onOpenMemoryTab: () => {
                setSelectedNodeId(n.id);
                setActiveSideTab("memory");
              },
              onToggleEnabled: (checked: boolean) => {
                setMemoryConfig?.((prev) => ({ ...prev, enabled: checked }));
              },
              onUpdateMemoryConfig: (changes: Partial<LangGraphMemoryConfig>) => {
                setMemoryConfig?.((prev) => ({ ...prev, ...changes }));
              },
            },
            deletable: false,
          };
        }
        return n;
      });

      // Filter out any legacy memory ref nodes
      updated = updated.filter((n) => n.type !== LANGGRAPH_CANVAS_NODE_MEMORY_REF);

      if (!hasStateGlobal) {
        const stateNode: StateGlobalNode = {
          id: NODE_ID_STATE_GLOBAL,
          type: LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
          position: { x: 100, y: 60 },
          data: {
            label: "Global Graph State",
            stateChannels,
            customReducers,
            onOpenStateTab: () => {
              setSelectedNodeId(NODE_ID_STATE_GLOBAL);
              setActiveSideTab("state");
            },
            onAddChannel: handleAddChannel,
            onUpdateChannel: handleUpdateChannel,
            onDeleteChannel: handleDeleteChannel,
            onDuplicateChannel: handleDuplicateChannel,
            onAddCustomReducer: handleAddCustomReducer,
            onUpdateCustomReducer: handleUpdateCustomReducer,
            onDeleteCustomReducer: handleDeleteCustomReducer,
          },
          deletable: false,
        };
        updated = [stateNode, ...updated];
      }

      const hasCheckpointer = updated.some(
        (n) => n.id === NODE_ID_CHECKPOINTER || n.type === LANGGRAPH_CANVAS_NODE_MEMORY,
      );

      if (!hasCheckpointer) {
        const stateNode = updated.find((n) => n.id === NODE_ID_STATE_GLOBAL);
        const checkpointerPos = {
          x: stateNode?.position?.x ?? 100,
          y: (stateNode?.position?.y ?? 60) + 240,
        };
        const checkpointerNode: MemoryNode = {
          id: NODE_ID_CHECKPOINTER,
          type: LANGGRAPH_CANVAS_NODE_MEMORY,
          position: checkpointerPos,
          data: {
            label: "Graph Checkpointer",
            name: "Graph Checkpointer",
            enabled: memoryConfig?.enabled !== false,
            checkpointer: memoryConfig?.checkpointer || "postgres",
            checkpointerConnectionId: memoryConfig?.checkpointerNodeId,
            threadIdKey: "thread_id",
            threadScope: memoryConfig?.threadScope || "session",
            autoSummarize: memoryConfig?.autoSummarize ?? true,
            onOpenMemoryTab: () => {
              setSelectedNodeId(NODE_ID_CHECKPOINTER);
              setActiveSideTab("memory");
            },
            onToggleEnabled: (checked: boolean) => {
              setMemoryConfig?.((prev) => ({ ...prev, enabled: checked }));
            },
            onUpdateMemoryConfig: (changes: Partial<LangGraphMemoryConfig>) => {
              setMemoryConfig?.((prev) => ({ ...prev, ...changes }));
            },
          },
          deletable: false,
        };
        updated = [...updated, checkpointerNode];
      }

      // Clean up legacy memory edges without valid handles
      setEdges((edges) =>
        edges.filter(
          (edge) =>
            edge.targetHandle !== HANDLE_MEMORY_IN &&
            edge.sourceHandle !== HANDLE_MEMORY_OUT &&
            !edge.source.startsWith("mem_") &&
            edge.source !== NODE_ID_CHECKPOINTER,
        ),
      );

      return updated;
    });
  }, [
    inputChannels,
    stateChannels,
    customReducers,
    memoryConfig,
    setMemoryConfig,
    suggestedParams,
    handleAddChannel,
    handleUpdateChannel,
    handleDeleteChannel,
    handleDuplicateChannel,
    handleAddCustomReducer,
    handleUpdateCustomReducer,
    handleDeleteCustomReducer,
    handleAddInputChannel,
    handleAddSuggestedChannel,
    handleUpdateInputChannel,
    handleDeleteInputChannel,
    handleAutoMapStateChannels,
    handleMapStateToInput,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setActiveSideTab,
  ]);
}
