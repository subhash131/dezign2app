import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  type BackendNode,
  type LangGraphStateChannel,
  type LangGraphInputChannel,
  type LangGraphMemoryConfig,
  type LangGraphCustomReducer,
  type LangGraphCanvasNode,
  type LangGraphCanvasEdge,
  type Endpoint,
} from "@workspace/canvas";
import {
  isReservedNodeId,
  NODE_ID_STATE_GLOBAL,
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_MEMORY_CONFIG,
} from "../constants";
import { getSuggestedReducerCodeForChannelType } from "../components/inspector/state-inspector/constants";

import { buildInitialNodes, buildInitialEdges } from "./utils/initializers";
import { useAgentResourceConnections } from "./useAgentResourceConnections";
import { useSelectedNodeState } from "./useSelectedNodeState";
import { useNodeFactory } from "./useNodeFactory";
import { useCanvasNodeSync } from "./useCanvasNodeSync";
import { useCanvasConnections } from "./useCanvasConnections";
import { useCanvasPersistence } from "./useCanvasPersistence";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getLangGraphFlowNodes } from "../../../../../hooks/auto-layout/langGraphLayout";
import { toast } from "sonner";

export interface UseLangGraphCanvasStateProps {
  node: BackendNode;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  onClose: () => void;
}

export function extractConfiguredEndpointInputs(
  nodeId: string,
  nodeLabel: string | undefined,
  allEdges: Array<{
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }>,
  allEndpoints: Endpoint[],
): Array<{
  key: string;
  type: LangGraphInputChannel["type"];
  description?: string;
  required?: boolean;
  targetStateChannel?: string;
}> {
  const suggested: Array<{
    key: string;
    type: LangGraphInputChannel["type"];
    description?: string;
    required?: boolean;
    targetStateChannel?: string;
  }> = [];
  const seen = new Set<string>();

  const connectedEpIds = new Set<string>();
  const connectedEndpoints: Endpoint[] = [];

  // 1. Find connected endpoints via canvas edges (in either direction)
  for (const edge of allEdges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue;
    const handles = [edge.sourceHandle, edge.targetHandle].filter(Boolean) as string[];
    for (const h of handles) {
      const match = h.match(/^endpoint-(?:out|in)-(.+)$/);
      const epId = match ? match[1] : allEndpoints.find((e) => h.includes(e.id))?.id;
      if (epId && !connectedEpIds.has(epId)) {
        connectedEpIds.add(epId);
        const ep = allEndpoints.find((e) => e.id === epId);
        if (ep) connectedEndpoints.push(ep);
      }
    }
  }

  // 2. Find connected endpoints via pipeline steps invoking this LangGraph agent
  for (const ep of allEndpoints) {
    if (connectedEpIds.has(ep.id)) continue;
    const steps = ep.pipelineSteps || [];
    const hasLgStep = steps.some((s) => {
      const isLg =
        (s.type as string) === "langgraph_invoke" ||
        (s.type as string) === "langgraph_agent" ||
        (s.type as string) === "langgraph";
      if (!isLg) return false;
      return (
        s.langGraphTargetNodeId === nodeId ||
        (!s.langGraphTargetNodeId &&
          Boolean(nodeLabel) &&
          s.name?.trim().toLowerCase() === nodeLabel?.trim().toLowerCase())
      );
    });
    if (hasLgStep) {
      connectedEpIds.add(ep.id);
      connectedEndpoints.push(ep);
    }
  }

  for (const ep of connectedEndpoints) {
    // Extract mapped fields from pipeline steps calling this agent
    const lgSteps = (ep.pipelineSteps || []).filter((s) => {
      const isLg =
        (s.type as string) === "langgraph_invoke" ||
        (s.type as string) === "langgraph_agent" ||
        (s.type as string) === "langgraph";
      if (!isLg) return false;
      return (
        s.langGraphTargetNodeId === nodeId ||
        (!s.langGraphTargetNodeId &&
          Boolean(nodeLabel) &&
          s.name?.trim().toLowerCase() === nodeLabel?.trim().toLowerCase())
      );
    });

    const resolveType = (name: string): LangGraphInputChannel["type"] => {
      const bf = ep.requestBody?.fields?.find((f) => f.name === name);
      if (bf?.type === "number") return "number";
      if (bf?.type === "boolean") return "boolean";
      if (bf?.type === "object") return "object";
      if (bf?.type === "array") return "array";
      const pf = [
        ...(ep.params || []),
        ...(ep.queryParams || []),
        ...(ep.pathParams || []),
        ...(ep.headers || []),
      ].find((p) => p.name === name);
      if (pf?.type === "number") return "number";
      if (pf?.type === "boolean") return "boolean";
      return "string";
    };

    for (const step of lgSteps) {
      // 1. Collect ONLY mapped fields from step.inputBindings
      for (const b of step.inputBindings || []) {
        if (!b.argName) continue;
        let fieldKey = "";
        if ("field" in b.source && b.source.field) {
          fieldKey = b.source.field;
        } else {
          fieldKey = b.argName;
        }

        if (fieldKey && !seen.has(fieldKey)) {
          seen.add(fieldKey);
          suggested.push({
            key: fieldKey,
            type: resolveType(fieldKey),
            targetStateChannel: b.argName !== "thread_id" ? b.argName : undefined,
            description:
              b.argName === "thread_id" ? "Session thread ID" : `Mapped to ${b.argName}`,
            required: true,
          });
        } else if (fieldKey && seen.has(fieldKey)) {
          const found = suggested.find((s) => s.key === fieldKey);
          if (found && !found.targetStateChannel && b.argName !== "thread_id") {
            found.targetStateChannel = b.argName;
          }
        }
      }

      // 2. Collect ONLY mapped fields from step.langGraphStateMapping
      if (step.langGraphStateMapping) {
        for (const [stKey, accessor] of Object.entries(step.langGraphStateMapping)) {
          if (!accessor) continue;
          let fieldKey = "";
          if (accessor.startsWith("body.")) fieldKey = accessor.slice(5);
          else if (accessor.startsWith("params.")) fieldKey = accessor.slice(7);
          else if (accessor.startsWith("query.")) fieldKey = accessor.slice(6);
          else if (accessor.startsWith("headers.")) fieldKey = accessor.slice(8);
          else fieldKey = accessor;

          if (fieldKey && !seen.has(fieldKey)) {
            seen.add(fieldKey);
            suggested.push({
              key: fieldKey,
              type: resolveType(fieldKey),
              targetStateChannel: stKey !== "thread_id" ? stKey : undefined,
              description: `Mapped to ${stKey}`,
              required: true,
            });
          } else if (fieldKey && seen.has(fieldKey)) {
            const found = suggested.find((s) => s.key === fieldKey);
            if (found && !found.targetStateChannel && stKey !== "thread_id") {
              found.targetStateChannel = stKey;
            }
          }
        }
      }
    }
  }

  return suggested;
}

export function useLangGraphCanvasState({
  node,
  updateNode,
  onClose,
}: UseLangGraphCanvasStateProps) {
  const data = node.data;

  const [inputChannels, setInputChannels] = useState<LangGraphInputChannel[]>(
    () => {
      const existing = data.inputChannels;
      if (existing && existing.length > 0) {
        return existing.map((ch, idx) => ({
          ...ch,
          id:
            ch.id ||
            `input_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }));
      }
      return [...DEFAULT_LANGGRAPH_INPUT_CHANNELS];
    },
  );
  const [stateChannels, setStateChannels] = useState<LangGraphStateChannel[]>(
    () => {
      if (data.stateChannels && data.stateChannels.length > 0) {
        return data.stateChannels;
      }
      return [...DEFAULT_LANGGRAPH_STATE_CHANNELS];
    },
  );
  const [customReducers, setCustomReducers] = useState<LangGraphCustomReducer[]>(
    data.customReducers || [],
  );
  const [memoryConfig, setMemoryConfig] = useState<LangGraphMemoryConfig>(
    () => ({
      ...DEFAULT_LANGGRAPH_MEMORY_CONFIG,
      ...(data.memoryConfig || {}),
    }),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<
    "inspector" | "inputs" | "state" | "memory" | "testing"
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
      const flowNodes = getLangGraphFlowNodes(initialNodes, initialEdges);
      triggerFitView({
        nodes:
          flowNodes.length > 0
            ? flowNodes.map((n) => ({ id: n.id }))
            : undefined,
        padding: 0.35,
        duration: 200,
        maxZoom: 0.85,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [triggerFitView, initialNodes, initialEdges]);

  const handleAddChannel = useCallback(() => {
    const newChannel: LangGraphStateChannel = {
      key: "",
      type: "string",
      reducer: "replace",
      defaultValue: "",
      customReducerCode: getSuggestedReducerCodeForChannelType("string"),
    };
    setStateChannels((prev) => [...prev, newChannel]);
    setSelectedNodeId(NODE_ID_STATE_GLOBAL);
    setActiveSideTab("state");
  }, [setSelectedNodeId, setActiveSideTab]);

  const handleUpdateChannel = useCallback(
    (index: number, channelChanges: Partial<LangGraphStateChannel>) => {
      setStateChannels((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...channelChanges } : c)),
      );
    },
    [],
  );

  const handleDeleteChannel = useCallback((index: number) => {
    setStateChannels((prev) => {
      if (prev[index]?.key === "messages") return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleDuplicateChannel = useCallback((index: number) => {
    setStateChannels((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const copy: LangGraphStateChannel = {
        ...target,
        key: target.key ? `${target.key}_copy` : "",
      };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }, []);

  const handleAddCustomReducer = useCallback((reducer: LangGraphCustomReducer) => {
    setCustomReducers((prev) => {
      if (prev.some((r) => r.name === reducer.name)) return prev;
      return [...prev, reducer];
    });
    if (reducer.targetField) {
      setStateChannels((prevChannels) =>
        prevChannels.map((c) =>
          c.key === reducer.targetField
            ? {
                ...c,
                reducer: reducer.name,
                customReducerCode: reducer.code,
              }
            : c,
        ),
      );
    }
  }, []);

  const handleUpdateCustomReducer = useCallback(
    (idOrName: string, changes: Partial<LangGraphCustomReducer>) => {
      setCustomReducers((prev) => {
        const target = prev.find(
          (r) => r.id === idOrName || r.name === idOrName,
        );
        if (!target) return prev;
        const oldName = target.name;
        const newName = changes.name ?? oldName;
        const newCode = changes.code ?? target.code;

        // If the reducer name, code, or targetField changed, sync channels
        setStateChannels((prevChannels) =>
          prevChannels.map((c) => {
            if (changes.targetField && c.key === changes.targetField) {
              return {
                ...c,
                reducer: newName,
                customReducerCode: newCode,
              };
            }
            if (c.reducer === oldName) {
              return {
                ...c,
                reducer: newName,
                customReducerCode: newCode,
              };
            }
            return c;
          }),
        );

        return prev.map((r) =>
          r.id === idOrName || r.name === idOrName ? { ...r, ...changes } : r,
        );
      });
    },
    [],
  );

  const handleDeleteCustomReducer = useCallback((idOrName: string) => {
    setCustomReducers((prev) =>
      prev.filter((r) => r.id !== idOrName && r.name !== idOrName),
    );
    setStateChannels((prev) =>
      prev.map((c) =>
        c.reducer === idOrName
          ? { ...c, reducer: "replace", customReducerCode: undefined }
          : c,
      ),
    );
  }, []);

  // ── Input channel CRUD handlers ──
  const handleAddInputChannel = useCallback(() => {
    const newChannel: LangGraphInputChannel = {
      id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      key: `var_${inputChannels.length + 1}`,
      type: "string",
      required: false,
      description: "",
      source: "custom",
    };
    setInputChannels((prev) => [...prev, newChannel]);
  }, [inputChannels.length]);

  const handleUpdateInputChannel = useCallback(
    (index: number, changes: Partial<LangGraphInputChannel>) => {
      setInputChannels((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...changes } : c)),
      );
    },
    [],
  );

  const handleDeleteInputChannel = useCallback((index: number) => {
    setInputChannels((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddSuggestedChannel = useCallback((channel: LangGraphInputChannel) => {
    setInputChannels((prev) => [
      ...prev,
      {
        ...channel,
        id:
          channel.id ||
          `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        source: channel.source || "request",
      },
    ]);
  }, []);

  const handleAutoMapStateChannels = useCallback(() => {
    setInputChannels((prev) => {
      const validStateKeys = new Set(
        stateChannels.map((s) => s.key?.trim()).filter(Boolean),
      );
      return prev.map((ch) => {
        if (ch.stateChannelKey && validStateKeys.has(ch.stateChannelKey)) {
          return ch;
        }
        if (validStateKeys.has(ch.key)) {
          return { ...ch, stateChannelKey: ch.key };
        }
        if (
          ["query", "prompt", "message", "user_message", "input"].includes(
            ch.key.toLowerCase(),
          ) &&
          validStateKeys.has("messages")
        ) {
          return { ...ch, stateChannelKey: "messages" };
        }
        return ch;
      });
    });
  }, [stateChannels]);

  const handleMapStateToInput = useCallback(
    (stateKey: string, inputChannelIdOrKey?: string) => {
      setInputChannels((prev) => {
        return prev.map((ch) => {
          const isTarget =
            Boolean(inputChannelIdOrKey) &&
            (ch.id === inputChannelIdOrKey || ch.key === inputChannelIdOrKey);
          if (isTarget) {
            return { ...ch, stateChannelKey: stateKey };
          }
          if (ch.stateChannelKey === stateKey && !isTarget) {
            return { ...ch, stateChannelKey: undefined };
          }
          return ch;
        });
      });
    },
    [],
  );

  // ── Derive suggested params from connected ServiceNode endpoints ──
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const allEndpoints = useBackendCanvasStore((s) => s.endpoints);

  const suggestedParams = useMemo(
    () =>
      extractConfiguredEndpointInputs(
        node.id,
        node.data?.label,
        allEdges,
        allEndpoints,
      ),
    [allEdges, allEndpoints, node.id, node.data?.label],
  );

  // ── Explicit refresh/check button handler ──
  const handleRefreshInputs = useCallback(() => {
    const liveEndpoints = useBackendCanvasStore.getState().endpoints || [];
    const liveEdges = useBackendCanvasStore.getState().edges || [];
    const foundParams = extractConfiguredEndpointInputs(
      node.id,
      node.data?.label,
      liveEdges,
      liveEndpoints,
    );

    if (foundParams.length === 0) {
      toast.info(
        "No incoming endpoint inputs found. Connect an endpoint or configure pipeline step mappings.",
      );
      return;
    }

    setInputChannels((prevChannels) => {
      const customChannels = prevChannels.filter((c) => c.source === "custom");
      const validStateKeys = new Set(
        stateChannels.map((sc) => sc.key?.trim()).filter(Boolean),
      );

      const nextRequestChannels: LangGraphInputChannel[] = foundParams.map((p) => {
        let targetState = p.targetStateChannel;
        if (!targetState) {
          if (validStateKeys.has(p.key)) {
            targetState = p.key;
          } else if (
            ["query", "prompt", "message", "user_message", "input"].includes(
              p.key.toLowerCase(),
            ) &&
            validStateKeys.has("messages")
          ) {
            targetState = "messages";
          }
        }

        const existing = prevChannels.find((c) => c.key === p.key && c.source === "request");
        return {
          id: existing?.id || `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          key: p.key,
          type: p.type || existing?.type || "string",
          required: p.required ?? true,
          description: p.description || existing?.description || "",
          source: "request",
          ...(targetState || existing?.stateChannelKey
            ? { stateChannelKey: targetState || existing?.stateChannelKey }
            : {}),
        };
      });

      const updated = [...nextRequestChannels, ...customChannels];
      return updated;
    });

    toast.success(
      `Synced ${foundParams.length} configured input field${foundParams.length === 1 ? "" : "s"} from endpoint.`,
    );
  }, [node.id, node.data?.label, stateChannels]);

  // Synchronize inputChannels from suggestedParams (pruning unmapped fields from connected step)
  useEffect(() => {
    if (suggestedParams.length === 0) return;
    const mappedKeySet = new Set(suggestedParams.map((s) => s.key));

    setInputChannels((prev) => {
      const customChannels = prev.filter((c) => c.source === "custom");
      const existingRequestChannels = prev.filter((c) => c.source === "request");

      // Check if there are stale request channels that are not in suggestedParams
      const hasStale = existingRequestChannels.some((c) => !mappedKeySet.has(c.key));
      const hasMissing = suggestedParams.some(
        (p) => !existingRequestChannels.some((c) => c.key === p.key),
      );

      const validStateKeys = new Set(
        stateChannels.map((sc) => sc.key?.trim()).filter(Boolean),
      );

      let mappingChanged = false;
      const nextRequestChannels: LangGraphInputChannel[] = suggestedParams.map((p) => {
        let targetState = p.targetStateChannel;
        if (!targetState) {
          if (validStateKeys.has(p.key)) {
            targetState = p.key;
          } else if (
            ["query", "prompt", "message", "user_message", "input"].includes(
              p.key.toLowerCase(),
            ) &&
            validStateKeys.has("messages")
          ) {
            targetState = "messages";
          }
        }

        const existing = existingRequestChannels.find((c) => c.key === p.key);
        if (existing) {
          if (targetState && existing.stateChannelKey !== targetState) {
            mappingChanged = true;
          }
          return {
            ...existing,
            key: existing.key,
            type: p.type || existing.type,
            required: p.required ?? existing.required,
            description: existing.description || p.description || "",
            source: "request",
            ...(targetState || existing.stateChannelKey
              ? { stateChannelKey: targetState || existing.stateChannelKey }
              : {}),
          };
        }

        return {
          id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          key: p.key,
          type: p.type,
          required: p.required ?? true,
          description: p.description || "",
          source: "request",
          ...(targetState ? { stateChannelKey: targetState } : {}),
        };
      });

      if (
        !hasStale &&
        !hasMissing &&
        !mappingChanged &&
        prev.length === nextRequestChannels.length + customChannels.length
      ) {
        return prev;
      }

      const updated = [...nextRequestChannels, ...customChannels];
      return updated;
    });
  }, [suggestedParams, stateChannels]);

  // ── Sync node callbacks and internal attributes ──
  useCanvasNodeSync({
    nodes,
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
  });

  // ── Connection handling hook ──
  const { onNodesChange, onEdgesChange, isValidConnection, onConnect } =
    useCanvasConnections({
      nodes,
      edges,
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
    selectedTransformerData,
    selectedTransformerRefData,
    selectedTypesData,
    selectedTypesRefData,
    updateSelectedStep,
    updateSelectedLLM,
    updateSelectedTool,
    updateSelectedMiddleware,
    updateSelectedAgent,
    updateSelectedMemory,
    updateSelectedOutput,
    updateSelectedTransformer,
    updateSelectedTypes,
    updateSelectedTypesRef,
  } = useSelectedNodeState({ nodes, selectedNodeId, setNodes, setEdges });

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
    masterToolNodes,
    masterMiddlewareNodes,
    handleSelectLLMForAgent,
    handleToggleToolForAgent,
    handleToggleMiddlewareForAgent,
    handleToggleMemoryForAgent,
    handleAddToolRefForAgent,
    handleRemoveToolRefForAgent,
    handleAddMiddlewareRefForAgent,
    handleRemoveMiddlewareRefForAgent,
  } = useAgentResourceConnections({ nodes, edges, setEdges, setNodes });

  // ── Persistence & Auto-Save ──
  const { saveStatus, handleSave } = useCanvasPersistence({
    node,
    updateNode,
    onClose,
    nodes,
    edges,
    inputChannels,
    stateChannels,
    customReducers,
    memoryConfig,
  });

  // ── Delete selected step ──
  const handleDeleteStep = () => {
    if (!selectedNodeId || isReservedNodeId(selectedNodeId)) return;
    const nodeId = selectedNodeId;
    setNodes((nds) =>
      nds
        .filter((n) => n.id !== nodeId)
        .map((n) => {
          if (
            n.type === "langgraph_llm_ref" &&
            (n.data as any)?.llmRef === nodeId
          ) {
            return {
              ...n,
              data: {
                ...n.data,
                llmRef: undefined,
                label: "LLM Ref",
              },
            };
          }
          return n;
        }),
    );
    const edgesToRemove = edges
      .filter((e) => e.source === nodeId || e.target === nodeId)
      .map((e) => e.id);
    if (edgesToRemove.length > 0) {
      onEdgesChange(edgesToRemove.map((id) => ({ type: "remove", id })));
    } else {
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
    }
    setSelectedNodeId(null);
  };

  const handleDeleteSelected = useCallback(() => {
    // Never delete nodes while user is focused on an input, textarea, select, or inspector field
    const activeEl = typeof document !== "undefined" ? document.activeElement : null;
    const isTyping =
      activeEl instanceof HTMLElement &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        activeEl.isContentEditable ||
        Boolean(
          activeEl.closest(
            "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [data-inspector], .inspector-sidebar, .nodrag, .nowheel, .nopan, .nokey"
          )
        ));
    if (isTyping) {
      return;
    }

    const selectedEdges = edges.filter((e) => e.selected);
    const selectedNodes = nodes.filter((n) => n.selected);

    // If an edge is selected and NO node is selected: only delete the selected edge(s)
    if (selectedEdges.length > 0 && selectedNodes.length === 0) {
      onEdgesChange(selectedEdges.map((e) => ({ type: "remove", id: e.id })));
      return;
    }

    // Determine nodes to delete
    const nodesToDelete = new Set<string>();
    for (const n of selectedNodes) {
      if (!isReservedNodeId(n.id)) {
        nodesToDelete.add(n.id);
      }
    }

    // Fallback to selectedNodeId ONLY IF no edges are selected
    if (
      nodesToDelete.size === 0 &&
      selectedNodeId &&
      !isReservedNodeId(selectedNodeId) &&
      selectedEdges.length === 0
    ) {
      nodesToDelete.add(selectedNodeId);
    }

    if (nodesToDelete.size > 0) {
      setNodes((nds) => nds.filter((n) => !nodesToDelete.has(n.id)));
      const edgeIdsToRemove = new Set(
        edges
          .filter(
            (e) =>
              nodesToDelete.has(e.source) ||
              nodesToDelete.has(e.target) ||
              e.selected,
          )
          .map((e) => e.id),
      );

      if (edgeIdsToRemove.size > 0) {
        onEdgesChange(
          Array.from(edgeIdsToRemove).map((id) => ({ type: "remove", id })),
        );
      }

      if (selectedNodeId && nodesToDelete.has(selectedNodeId)) {
        setSelectedNodeId(null);
      }
    } else if (selectedEdges.length > 0) {
      onEdgesChange(selectedEdges.map((e) => ({ type: "remove", id: e.id })));
    }
  }, [edges, nodes, selectedNodeId, setNodes, onEdgesChange, setSelectedNodeId]);

  return {
    nodes,
    setNodes,
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
    selectedTransformerData,
    selectedTransformerRefData,
    selectedTypesData,
    selectedTypesRefData,
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
    updateSelectedTransformer,
    updateSelectedTypes,
    updateSelectedTypesRef,
    customReducers,
    setCustomReducers,
    handleAddCustomReducer,
    handleUpdateCustomReducer,
    handleDeleteCustomReducer,
    handleAddChannel,
    handleUpdateChannel,
    handleDeleteChannel,
    handleDeleteStep,
    handleDeleteSelected,
    handleSave,
    saveStatus,
    availableLLMNodes,
    availableToolNodes,
    availableMiddlewareNodes,
    availableMemoryNodes,
    masterToolNodes,
    masterMiddlewareNodes,
    handleSelectLLMForAgent,
    handleToggleToolForAgent,
    handleToggleMiddlewareForAgent,
    handleToggleMemoryForAgent,
    handleAddToolRefForAgent,
    handleRemoveToolRefForAgent,
    handleAddMiddlewareRefForAgent,
    handleRemoveMiddlewareRefForAgent,
    showCompileModal,
    setShowCompileModal,
    suggestedParams,
    handleRefreshInputs,
  };
}
