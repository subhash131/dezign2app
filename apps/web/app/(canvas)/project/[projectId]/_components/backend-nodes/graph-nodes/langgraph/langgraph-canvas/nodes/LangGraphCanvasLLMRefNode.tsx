import React, { useState, useEffect, useMemo } from "react";
import {
  NodeProps,
  Handle,
  Position,
  useReactFlow,
  Connection,
} from "@xyflow/react";
import {
  Trash,
  Link2,
  AlertCircle,
  Cpu,
  Plus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { LangGraphLLMRefNode, LangGraphCanvasNode, LangGraphLLMNode } from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_AGENT,
  LANGGRAPH_CANVAS_NODE_STEP,
  HANDLE_LLM_IN,
  HANDLE_LLM_OUT,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY_ENV,
  DEFAULT_LLM_TEMPERATURE,
  LLM_PROVIDERS,
  LLM_PROVIDER_PRESETS,
} from "../constants";
import { LocalInput } from "../../../common";
import { toast } from "sonner";

export const LangGraphCanvasLLMRefNode = ({
  id,
  data,
  selected,
}: NodeProps<LangGraphLLMRefNode>) => {
  const { setNodes, getNodes, getEdges, setEdges } =
    useReactFlow<LangGraphCanvasNode>();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(data.label || "LLM Ref");

  useEffect(() => {
    setNameValue(data.label || "LLM Ref");
  }, [data.label]);

  const allNodes = getNodes();
  const availableMasterLLMs = useMemo(() => {
    return allNodes.filter(
      (n): n is LangGraphLLMNode => n.type === LANGGRAPH_CANVAS_NODE_LLM,
    );
  }, [allNodes]);

  const selectedMaster = useMemo(() => {
    if (!data.llmRef) return undefined;
    return availableMasterLLMs.find((m) => m.id === data.llmRef);
  }, [availableMasterLLMs, data.llmRef]);

  const updateLLMRefData = (changes: Partial<typeof data>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id && n.type === LANGGRAPH_CANVAS_NODE_LLM_REF
          ? { ...n, data: { ...n.data, ...changes } }
          : n,
      ),
    );
  };

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = nameValue.trim() || "LLM Ref";
    setNameValue(trimmed);
    if (trimmed !== data.label) {
      updateLLMRefData({ label: trimmed });
    }
  };

  // Ensure invisible reference edge from the master LLMNode to this ref node
  useEffect(() => {
    if (!selectedMaster?.id) {
      setEdges((eds) => {
        const hasRef = eds.some(
          (e) => e.type === "langgraph-reference" && e.target === id,
        );
        if (!hasRef) return eds;
        return eds.filter(
          (e) => !(e.type === "langgraph-reference" && e.target === id),
        );
      });
      return;
    }

    const refEdgeId = `edge-llm-ref-link-${selectedMaster.id}-${id}`;
    setEdges((eds) => {
      const existingRefEdges = eds.filter(
        (e) => e.type === "langgraph-reference" && e.target === id,
      );

      // If exactly one reference edge already exists matching this master, no-op
      if (
        existingRefEdges.length === 1 &&
        existingRefEdges[0]?.id === refEdgeId &&
        existingRefEdges[0]?.source === selectedMaster.id
      ) {
        return eds;
      }

      // Filter out any reference edges targeting this ref node (cleans up stale edges and duplicates)
      const cleanEdges = eds.filter(
        (e) => !(e.type === "langgraph-reference" && e.target === id),
      );

      return [
        ...cleanEdges,
        {
          id: refEdgeId,
          source: selectedMaster.id,
          sourceHandle: HANDLE_LLM_OUT,
          target: id,
          targetHandle: HANDLE_LLM_IN,
          type: "langgraph-reference",
          hidden: true,
          data: {},
        },
      ];
    });
  }, [selectedMaster?.id, id, setEdges]);

  const handleSelectMaster = (masterId: string) => {
    const master = availableMasterLLMs.find((m) => m.id === masterId);
    const masterLabel = master?.data?.label || "LLM";
    const masterProvider = master?.data?.provider;
    const masterModel = master?.data?.model;
    const masterTemp = master?.data?.temperature;

    updateLLMRefData({
      llmRef: masterId,
      label: `${masterLabel} (Ref)`,
    });
    setNameValue(`${masterLabel} (Ref)`);

    // Clean up stale reference edges when switching master
    setEdges((eds) =>
      eds.filter(
        (e) => !(e.type === "langgraph-reference" && e.target === id),
      ),
    );

    const edges = getEdges();
    const connectedTargetIds = new Set(
      edges
        .filter((e) => e.source === id && e.targetHandle === HANDLE_LLM_IN)
        .map((e) => e.target),
    );

    if (connectedTargetIds.size > 0 && master) {
      setNodes((nds) =>
        nds.map((n) => {
          if (!connectedTargetIds.has(n.id)) return n;

          if (
            n.type === LANGGRAPH_CANVAS_NODE_NODE ||
            n.type === LANGGRAPH_CANVAS_NODE_AGENT
          ) {
            return {
              ...n,
              data: {
                ...n.data,
                llmConfig: {
                  ...n.data.llmConfig,
                  enabled: true,
                  provider:
                    masterProvider ||
                    n.data.llmConfig?.provider ||
                    DEFAULT_LLM_PROVIDER,
                  model:
                    masterModel ||
                    n.data.llmConfig?.model ||
                    DEFAULT_LLM_MODEL,
                  temperature:
                    masterTemp ?? n.data.llmConfig?.temperature,
                },
                modelConfig: {
                  provider: masterProvider || DEFAULT_LLM_PROVIDER,
                  model: masterModel || DEFAULT_LLM_MODEL,
                  temperature: masterTemp,
                },
              },
            };
          }

          if (n.type === LANGGRAPH_CANVAS_NODE_STEP) {
            return {
              ...n,
              data: {
                ...n.data,
                modelConfig: {
                  provider: masterProvider || DEFAULT_LLM_PROVIDER,
                  model: masterModel || DEFAULT_LLM_MODEL,
                  temperature: masterTemp,
                },
              },
            };
          }

          return n;
        }),
      );
    }
  };

  const handleDelete = () => {
    if (data.onDeleteLLMRef) {
      data.onDeleteLLMRef();
    } else {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    }
  };

  const handleAddMasterLLM = () => {
    const llmId = `llm_${Date.now().toString(36).slice(-4)}`;
    const defaultPreset =
      LLM_PROVIDER_PRESETS[DEFAULT_LLM_PROVIDER] ??
      LLM_PROVIDER_PRESETS[LLM_PROVIDERS.CUSTOM];

    const currentRefNode = getNodes().find((n) => n.id === id);
    const refX = currentRefNode?.position?.x ?? 200;
    const refY = currentRefNode?.position?.y ?? 100;

    const newX = Math.max(40, refX - 340);
    const newY = Math.max(40, refY - 40);

    const newLLMNode: LangGraphLLMNode = {
      id: llmId,
      type: LANGGRAPH_CANVAS_NODE_LLM,
      position: { x: newX, y: newY },
      data: {
        label: "LLM",
        llmId,
        provider: DEFAULT_LLM_PROVIDER,
        baseUrl: defaultPreset?.defaultUrl ?? DEFAULT_LLM_BASE_URL,
        model: defaultPreset?.defaultModel ?? DEFAULT_LLM_MODEL,
        apiKeyHeader:
          defaultPreset?.defaultApiKeyEnv ?? DEFAULT_LLM_API_KEY_ENV,
        temperature: DEFAULT_LLM_TEMPERATURE,
        onDeleteLLM: () => {
          setNodes((nodes) => nodes.filter((node) => node.id !== llmId));
          setEdges((edges) =>
            edges.filter(
              (edge) => edge.source !== llmId && edge.target !== llmId,
            ),
          );
        },
      },
    };

    setNodes((nds) => [...nds, newLLMNode]);

    updateLLMRefData({
      llmRef: llmId,
      label: "LLM (Ref)",
    });
    setNameValue("LLM (Ref)");

    toast.success("Added LLM config node and linked reference");
  };

  const activeProvider = selectedMaster?.data?.provider || "unconfigured";

  return (
    <div
      className={`rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] p-3 flex flex-col gap-2.5 transition-all duration-200 shadow-md relative group ${
        selected
          ? "border-sky-500 ring-2 ring-sky-500/20 shadow-sky-500/10"
          : "border-border hover:border-sky-500/40 hover:shadow-sky-500/5"
      }`}
    >
      {/* Inbound Handle on header (left) for reference from master LLM */}
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_LLM_IN}
        style={{ top: "24px" }}
        isValidConnection={(connection: Connection) =>
          connection.sourceHandle === HANDLE_LLM_OUT ||
          Boolean(connection.source?.startsWith("llm_"))
        }
        className={`!w-3.5 !h-3.5 !border-2 transition-all hover:!scale-125 !-left-[7px] z-10 ${
          selectedMaster?.id
            ? "!bg-sky-400 !border-background ring-2 ring-sky-400/30"
            : "!bg-background !border-sky-400/60 hover:!bg-sky-400"
        }`}
        title="Inbound LLM Reference: Connect from Master LLM"
      />

      {/* Output Handle to connect to step/agent nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id={HANDLE_LLM_OUT}
        style={{ left: "50%" }}
        isValidConnection={(connection: Connection) =>
          connection.targetHandle === HANDLE_LLM_IN
        }
        className="!bg-sky-400 !w-3.5 !h-3.5 !border-2 !border-background hover:!scale-125 transition-transform !-bottom-[7px]"
        title="Connect to LangGraph Node LLM Config"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 -mx-3 -mt-3 border-b border-border/50 bg-sky-500/10 text-sky-700 dark:text-sky-300 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 rounded-md border border-sky-500/30 bg-sky-500/15 text-sky-500 shrink-0">
            <Link2 className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            {isEditingName ? (
              <div
                className="nodrag"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <LocalInput
                  autoFocus
                  className="h-6 text-xs bg-background p-1 font-bold flex-1 nodrag"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handleNameSave();
                    if (e.key === "Escape") {
                      setNameValue(data.label || "LLM Ref");
                      setIsEditingName(false);
                    }
                  }}
                />
              </div>
            ) : (
              <span
                className="font-bold text-xs text-foreground truncate max-w-[140px] cursor-pointer hover:text-sky-400 transition-colors nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                title="Click to rename LLM Ref"
              >
                {data.label || "LLM Ref"}
              </span>
            )}
            <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
              <span className="px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 text-[8px] uppercase font-bold">
                REF
              </span>
              <span>
                {selectedMaster?.data?.model ||
                  selectedMaster?.data?.label ||
                  "Unbound Reference"}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedMaster && (
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20">
              {activeProvider.toUpperCase()}
            </span>
          )}
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100 nodrag"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete LLM Ref"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Master LLM Picker */}
      <div className="flex flex-col gap-1 nodrag">
        <label className="text-[9px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Referenced LLM Config</span>
          {selectedMaster && (
            <span className="text-sky-400 font-mono text-[9px]">
              {selectedMaster.data?.label || selectedMaster.data?.model || "Configured"}
            </span>
          )}
        </label>

        {availableMasterLLMs.length > 0 ? (
          <Select
            value={data.llmRef || ""}
            onValueChange={handleSelectMaster}
          >
            <SelectTrigger className="h-7 text-[10px] bg-background border border-border/60 rounded px-2 font-medium text-foreground nodrag">
              <SelectValue placeholder="Select Master LLM..." />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {availableMasterLLMs.map((master) => (
                <SelectItem key={master.id} value={master.id}>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="font-semibold text-foreground">
                      {master.data?.label || master.data?.model || "LLM Config"}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      ({master.data?.provider || "custom"} - {master.data?.model || "default"})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-col gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px]">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                No master LLM on canvas. Add an <strong>LLM config</strong> node first.
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddMasterLLM}
              className="nodrag flex items-center justify-center gap-1.5 w-full py-1 px-2 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 text-[10px] font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <Plus className="w-3 h-3" />
              <span>Add LLM Node</span>
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
