import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  STEP_TYPE_LLM_CALL,
  STEP_TYPE_ROUTER,
} from "@workspace/canvas/constants";
import {
  LangGraphStepHeader,
  LangGraphStepTypeSelector,
  LangGraphStepLLMConfig,
  LangGraphConditionalRoutes,
  LangGraphStepToolsBadge,
} from "./langgraph-step";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { Terminal } from "lucide-react";

const DEFAULT_STEP_LABEL = "Graph Step";

export const LangGraphStepNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);

  const isSimulating = useSimulationStore((s) => s.currentNodeId === id);
  const isVisited = useSimulationStore((s) => s.activeNodeIds.includes(id));
  const simTraceEntry = useSimulationStore((s) => s.trace.find((t) => t.nodeId === id));

  const [isEditingName, setIsEditingName] = useState(!data.label);
  const [nameValue, setNameValue] = useState(data.label || "");

  useEffect(() => {
    setNameValue(data.label || "");
    if (!data.label) {
      setIsEditingName(true);
    }
  }, [data.label]);

  const stepType = data.stepType || STEP_TYPE_LLM_CALL;
  const isLLMEnabled = !!data.modelConfig || stepType === STEP_TYPE_LLM_CALL;

  const handleToggleLLMConfig = (enabled: boolean) => {
    if (enabled) {
      updateNode(id, {
        data: {
          ...data,
          modelConfig: data.modelConfig || {
            provider: DEFAULT_LLM_PROVIDER,
            model: DEFAULT_LLM_MODEL,
            temperature: DEFAULT_LLM_TEMPERATURE,
          },
        },
      });
    } else {
      const { modelConfig: _, ...restData } = data;
      updateNode(id, { data: restData });
    }
  };

  const handleUpdateSystemPrompt = (systemPrompt: string) => {
    updateNode(id, {
      data: {
        ...data,
        modelConfig: {
          provider: DEFAULT_LLM_PROVIDER,
          model: DEFAULT_LLM_MODEL,
          temperature: DEFAULT_LLM_TEMPERATURE,
          ...data.modelConfig,
          systemPrompt,
        },
      },
    });
  };

  const handleNameSave = (rawValue?: string) => {
    const trimmed = (rawValue ?? nameValue).trim();
    if (!trimmed) {
      if (!data.label || data.label.trim() === "") {
        deleteNode(id);
        return;
      }
      setNameValue(data.label);
      setIsEditingName(false);
      return;
    }
    setIsEditingName(false);
    setNameValue(trimmed);
    if (trimmed !== data.label) {
      updateNode(id, { data: { ...data, label: trimmed } });
    }
  };

  const handleTypeChange = (newType: string) => {
    updateNode(id, {
      data: {
        ...data,
        stepType: newType as NonNullable<BackendNode["data"]["stepType"]>,
      },
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const handleAddRoute = () => {
    const newBranchId = `b_${Date.now()}`;
    const newBranch = {
      id: newBranchId,
      label: `Route ${(data.routerConfig?.branches?.length || 0) + 1}`,
      field: "messages",
      operator: "eq" as const,
      value: "",
      isDefault: false,
    };
    const currentBranches = data.routerConfig?.branches || [];
    updateNode(id, {
      data: {
        ...data,
        routerConfig: { branches: [...currentBranches, newBranch] },
      },
    });
  };

  const handleDeleteRoute = (routeId: string) => {
    const updated = (data.routerConfig?.branches || []).filter(
      (b, idx) => (b.id || `b_${idx}`) !== routeId,
    );
    updateNode(id, { data: { ...data, routerConfig: { branches: updated } } });
  };

  return (
    <div
      className={cn(
        "rounded-xl bg-card/95 backdrop-blur-md border-2 min-w-[200px] max-w-[260px] p-3 flex flex-col gap-2 transition-all duration-200 shadow-lg relative group",
        selected
          ? "border-emerald-400 ring-2 ring-emerald-400/20 shadow-emerald-500/10"
          : stepType === STEP_TYPE_ROUTER
            ? "border-sky-500/40 shadow-sky-500/10"
            : "border-emerald-500/30 hover:border-emerald-400/70",
      )}
    >
      <LangGraphStepHeader
        id={id}
        data={data}
        stepType={stepType}
        isEditingName={isEditingName}
        setIsEditingName={setIsEditingName}
        nameValue={nameValue}
        setNameValue={setNameValue}
        onSaveName={handleNameSave}
        onDelete={handleDelete}
      />

      <LangGraphStepTypeSelector
        stepType={stepType}
        onTypeChange={handleTypeChange}
      />

      {stepType !== STEP_TYPE_ROUTER && (
        <LangGraphStepLLMConfig
          id={id}
          data={data}
          isLLMEnabled={isLLMEnabled}
          onToggleLLMConfig={handleToggleLLMConfig}
          onUpdateSystemPrompt={handleUpdateSystemPrompt}
        />
      )}

      {stepType === STEP_TYPE_ROUTER && (
        <LangGraphConditionalRoutes
          data={data}
          onAddRoute={handleAddRoute}
          onDeleteRoute={handleDeleteRoute}
        />
      )}

      {stepType !== STEP_TYPE_ROUTER && <LangGraphStepToolsBadge data={data} />}

      {/* Simulation status & logs indicator */}
      {(isSimulating || isVisited || simTraceEntry) && (
        <div className="flex items-center justify-between px-2 py-1 rounded bg-black/40 border border-border/40 text-[9px] font-mono mt-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                isSimulating
                  ? "bg-amber-400 animate-ping"
                  : simTraceEntry?.status === "failed"
                    ? "bg-red-400"
                    : "bg-emerald-400 shadow-xs shadow-emerald-400"
              )}
            />
            <span
              className={cn(
                "font-medium",
                isSimulating
                  ? "text-amber-300"
                  : simTraceEntry?.status === "failed"
                    ? "text-red-300"
                    : "text-emerald-300"
              )}
            >
              {isSimulating ? "Running..." : simTraceEntry?.status === "failed" ? "Failed" : "Simulated"}
            </span>
          </div>

          {simTraceEntry?.logs && simTraceEntry.logs.length > 0 && (
            <span className="text-[8px] text-muted-foreground flex items-center gap-0.5">
              <Terminal className="w-2.5 h-2.5 text-blue-400" />
              {simTraceEntry.logs.length} logs
            </span>
          )}
        </div>
      )}
    </div>
  );
};
