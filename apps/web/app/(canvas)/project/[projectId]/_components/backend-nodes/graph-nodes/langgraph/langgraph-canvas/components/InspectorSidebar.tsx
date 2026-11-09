import React, { useState, useCallback, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import {
  useSidebarStore,
  getEffectiveLangGraphInspectorWidth,
} from "@/lib/stores/sidebarStore";
import type {
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphMemoryConfig,
  LangGraphCustomReducer,
  LangGraphStepConfig,
  StepNodeData,
  LangGraphLLMNodeData,
  ToolNodeData,
  MiddlewareNodeData,
  AgentNodeData,
  MemoryNodeData,
  OutputNodeData,
  LangGraphLLMNode,
  LangGraphLLMRefNode,
  ToolNode,
  LangGraphToolRefNode,
  MiddlewareNode,
  LangGraphMiddlewareRefNode,
  MemoryNode,
  LangGraphMemoryRefNode,
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  TransformerCanvasNodeData,
  LangGraphTypesNodeData,
  LangGraphTypesRefNodeData,
} from "@workspace/canvas";
import { InspectorTabContent } from "./inspector/InspectorTabContent";
import { LangGraphTestCasesInspector } from "./inspector/LangGraphTestCasesInspector";
import { StateTabContent } from "./inspector/StateTabContent";
import { InputsTabContent } from "./inspector/InputsTabContent";
import { MemoryTabContent } from "./inspector/MemoryTabContent";
import { StartNodeInspector } from "./inspector/StartNodeInspector";

import type { ConnectedRouteInfo } from "../../LangGraphNode";
import type { SimulationTestCase } from "@workspace/canvas";

export interface InspectorSidebarProps {
  selectedNodeId?: string | null;
  onClose?: () => void;
  activeSideTab?: "inspector" | "inputs" | "state" | "memory" | "testing";
  setActiveSideTab?: (tab: "inspector" | "inputs" | "state" | "memory" | "testing") => void;
  nodes?: LangGraphCanvasNode[];
  edges?: LangGraphCanvasEdge[];
  graphLabel?: string;
  selectedStepData: StepNodeData | null;
  selectedLLMData?: LangGraphLLMNodeData | null;
  selectedToolData?: ToolNodeData | null;
  selectedMiddlewareData?: MiddlewareNodeData | null;
  selectedAgentData?: AgentNodeData | null;
  selectedMemoryData?: MemoryNodeData | null;
  selectedOutputData?: OutputNodeData | null;
  selectedTransformerData?: TransformerCanvasNodeData | null;
  selectedTransformerRefData?: TransformerCanvasNodeData | null;
  selectedTypesData?: LangGraphTypesNodeData | null;
  selectedTypesRefData?: LangGraphTypesRefNodeData | null;
  selectedStartData?: { inputChannels?: LangGraphInputChannel[] } | null;
  /** Params from connected endpoint used as default suggestions */
  suggestedParams?: Array<{ key: string; type: LangGraphInputChannel["type"]; description?: string; required?: boolean }>;
  graphNodeId?: string;
  graphSteps?: LangGraphStepConfig[];
  graphEdges?: Array<{
    source: string;
    sourceHandle?: string | null;
    target: string;
  }>;
  graphNodeLabels?: Record<string, string>;
  onRunTestCase?: (testCase: SimulationTestCase) => void;
  availableLLMNodes?: (LangGraphLLMNode | LangGraphLLMRefNode)[];
  availableToolNodes?: (ToolNode | LangGraphToolRefNode)[];
  availableMiddlewareNodes?: (MiddlewareNode | LangGraphMiddlewareRefNode)[];
  availableMemoryNodes?: (MemoryNode | LangGraphMemoryRefNode)[];
  connectedRoutes?: ConnectedRouteInfo[];
  masterToolNodes?: ToolNode[];
  masterMiddlewareNodes?: MiddlewareNode[];
  onAddToolRef?: (masterToolId: string) => void;
  onRemoveToolRef?: (toolRefId: string) => void;
  onAddMiddlewareRef?: (masterMwId: string) => void;
  onRemoveMiddlewareRef?: (mwRefId: string) => void;
  onSelectLLM?: (llmId: string | null) => void;
  onToggleTool?: (toolId: string, connect: boolean) => void;
  onToggleMiddleware?: (mwId: string, connect: boolean) => void;
  onToggleMemory?: (memId: string, connect: boolean) => void;
  onDeleteStep: () => void;
  onUpdateStep: (changes: Partial<StepNodeData>) => void;
  onUpdateLLM?: (changes: Partial<LangGraphLLMNodeData>) => void;
  onUpdateTool?: (changes: Partial<ToolNodeData>) => void;
  onUpdateMiddleware?: (changes: Partial<MiddlewareNodeData>) => void;
  onUpdateAgent?: (changes: Partial<AgentNodeData>) => void;
  onUpdateMemory?: (changes: Partial<MemoryNodeData>) => void;
  onUpdateOutput?: (changes: Partial<OutputNodeData>) => void;
  onUpdateTransformer?: (changes: Partial<TransformerCanvasNodeData>) => void;
  onUpdateTypes?: (changes: Partial<LangGraphTypesNodeData>) => void;
  onUpdateTypesRef?: (changes: Partial<LangGraphTypesRefNodeData>) => void;
  onSelectNode?: (nodeId: string) => void;
  inputChannels?: LangGraphInputChannel[];
  setInputChannels?: React.Dispatch<
    React.SetStateAction<LangGraphInputChannel[]>
  >;
  stateChannels: LangGraphStateChannel[];
  setStateChannels?: React.Dispatch<
    React.SetStateAction<LangGraphStateChannel[]>
  >;
  customReducers?: LangGraphCustomReducer[];
  onAddCustomReducer?: (reducer: LangGraphCustomReducer) => void;
  onUpdateCustomReducer?: (
    idOrName: string,
    changes: Partial<LangGraphCustomReducer>,
  ) => void;
  onDeleteCustomReducer?: (idOrName: string) => void;
  memoryConfig?: LangGraphMemoryConfig;
  setMemoryConfig?: React.Dispatch<React.SetStateAction<LangGraphMemoryConfig>>;
  onRefreshInputs?: () => void;
}

export function InspectorSidebar({
  selectedNodeId,
  onClose,
  onRefreshInputs,
  activeSideTab,
  setActiveSideTab,
  selectedStepData,
  selectedLLMData,
  selectedToolData,
  selectedMiddlewareData,
  selectedAgentData,
  selectedMemoryData,
  selectedOutputData,
  selectedTransformerData,
  selectedTransformerRefData,
  selectedTypesData,
  selectedTypesRefData,
  selectedStartData,
  graphNodeId,
  graphSteps = [],
  graphEdges = [],
  graphNodeLabels = {},
  onRunTestCase,
  availableLLMNodes,
  availableToolNodes,
  availableMiddlewareNodes,
  availableMemoryNodes,
  connectedRoutes = [],
  masterToolNodes,
  masterMiddlewareNodes,
  onAddToolRef,
  onRemoveToolRef,
  onAddMiddlewareRef,
  onRemoveMiddlewareRef,
  onSelectLLM,
  onToggleTool,
  onToggleMiddleware,
  onToggleMemory,
  onDeleteStep,
  onUpdateStep,
  onUpdateLLM,
  onUpdateTool,
  onUpdateMiddleware,
  onUpdateAgent,
  onUpdateMemory,
  onUpdateOutput,
  onUpdateTransformer,
  onUpdateTypes,
  onUpdateTypesRef,
  onSelectNode,
  stateChannels,
  setStateChannels,
  customReducers,
  onAddCustomReducer,
  onUpdateCustomReducer,
  onDeleteCustomReducer,
  inputChannels = [],
  setInputChannels,
  memoryConfig,
  setMemoryConfig,
  suggestedParams,
  nodes = [],
  edges = [],
  graphLabel,
}: InspectorSidebarProps) {
  const width = useSidebarStore((s) => s.langGraphInspectorWidth);
  const setWidth = useSidebarStore((s) => s.setLangGraphInspectorWidth);
  const effectiveWidth = useMemo(
    () => getEffectiveLangGraphInspectorWidth(width),
    [width],
  );
  const setLangGraphInspectorOpen = useSidebarStore(
    (s) => s.setLangGraphInspectorOpen,
  );
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback(
    (mouseDownEvent: React.MouseEvent) => {
      mouseDownEvent.preventDefault();
      mouseDownEvent.stopPropagation();
      setIsResizing(true);
      document.body.style.userSelect = "none";

      const startX = mouseDownEvent.clientX;
      const startWidth = effectiveWidth;

      const onMouseMove = (mouseMoveEvent: MouseEvent) => {
        const deltaX = startX - mouseMoveEvent.clientX;
        const minW = Math.max(340, Math.round(window.innerWidth * 0.18));
        const maxW = Math.round(window.innerWidth * 0.70);
        const nextWidth = Math.max(minW, Math.min(maxW, startWidth + deltaX));
        setWidth(nextWidth);
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [effectiveWidth, setWidth],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const isStateSelected =
    selectedNodeId === "STATE_GLOBAL" || (Boolean(selectedNodeId) && activeSideTab === "state");
  const isInputsSelected =
    Boolean(selectedNodeId) && activeSideTab === "inputs";
  const isTestingSelected =
    Boolean(selectedNodeId) && activeSideTab === "testing";
  const isMemorySelected =
    selectedNodeId === "CHECKPOINTER" ||
    selectedNodeId === "MEMORY" ||
    (Boolean(selectedNodeId) && activeSideTab === "memory");
  const isStartSelected =
    selectedNodeId === "START" ||
    Boolean(selectedStartData) ||
    ((isInputsSelected || isTestingSelected) && Boolean(selectedNodeId));

  const hasSelectedNode = Boolean(
    selectedNodeId &&
      (selectedStepData ||
        selectedLLMData ||
        selectedToolData ||
        selectedMiddlewareData ||
        selectedAgentData ||
        selectedMemoryData ||
        selectedOutputData ||
        selectedTransformerData ||
        selectedTransformerRefData ||
        selectedTypesData ||
        selectedTypesRefData ||
        selectedStartData ||
        isStateSelected ||
        isStartSelected ||
        isMemorySelected),
  );

  useEffect(() => {
    setLangGraphInspectorOpen(hasSelectedNode);
    return () => {
      setLangGraphInspectorOpen(false);
    };
  }, [hasSelectedNode, setLangGraphInspectorOpen]);

  if (!hasSelectedNode) return null;

  return (
    <div
      data-inspector="true"
      style={{ width: `${effectiveWidth}px`, maxWidth: "70vw" }}
      className={`inspector-sidebar relative shrink-0 h-full flex flex-col nokey ${
        isResizing ? "select-none" : ""
      }`}
      onKeyDown={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }
      }}
      onKeyDownCapture={(e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.stopPropagation();
          e.nativeEvent?.stopImmediatePropagation?.();
        }
      }}
    >
      {/* Resize handle — sits on the very left edge of the outer shell */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/40 transition-colors z-30 ${
          isResizing ? "bg-primary" : "bg-transparent"
        }`}
        onMouseDown={startResizing}
        title="Drag left/right to resize inspector"
      />

      {/* Close button — anchored to the left of the resize handle, bleeds outside overflow-hidden */}
      {onClose && (
        <button
          type="button"
          className="absolute top-3.5 -left-3.5 w-7 h-7 rounded-full bg-card hover:bg-destructive/15 text-muted-foreground hover:text-destructive border border-border shadow-md flex items-center justify-center transition-all cursor-pointer z-50 hover:scale-110 active:scale-95"
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          title="Close sidebar (Esc)"
          aria-label="Close inspector sidebar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Inner content — overflow-hidden for scroll containment */}
      <div
        className="border-l border-border bg-card flex flex-col h-full min-h-0 overflow-hidden w-full"
        onWheel={(e) => e.stopPropagation()}
      >

      {isStateSelected && setStateChannels ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <StateTabContent
            stateChannels={stateChannels}
            setStateChannels={setStateChannels}
            customReducers={customReducers}
            onAddCustomReducer={onAddCustomReducer}
            onUpdateCustomReducer={onUpdateCustomReducer}
            onDeleteCustomReducer={onDeleteCustomReducer}
            onClose={onClose}
          />
        </div>
      ) : isStartSelected && setInputChannels ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <StartNodeInspector
            inputChannels={inputChannels}
            setInputChannels={setInputChannels}
            stateChannels={stateChannels}
            suggestedParams={suggestedParams}
            nodes={nodes}
            edges={edges}
            memoryConfig={memoryConfig}
            graphLabel={graphLabel}
            graphNodeId={graphNodeId}
            graphSteps={graphSteps}
            graphEdges={graphEdges}
            graphNodeLabels={graphNodeLabels}
            connectedRoutes={connectedRoutes}
            onRunTestCase={onRunTestCase}
            defaultTab={isTestingSelected ? "testing" : "inputs"}
            onClose={onClose}
            onRefreshInputs={onRefreshInputs}
          />
        </div>
      ) : isMemorySelected && setMemoryConfig && memoryConfig ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MemoryTabContent
            memoryConfig={memoryConfig}
            setMemoryConfig={setMemoryConfig}
            onClose={onClose}
          />
        </div>
      ) : (
        <InspectorTabContent
          selectedStepData={selectedStepData}
          selectedLLMData={selectedLLMData}
          selectedToolData={selectedToolData}
          selectedMiddlewareData={selectedMiddlewareData}
          selectedAgentData={selectedAgentData}
          selectedMemoryData={selectedMemoryData}
          selectedOutputData={selectedOutputData}
          availableLLMNodes={availableLLMNodes}
          availableToolNodes={availableToolNodes}
          availableMiddlewareNodes={availableMiddlewareNodes}
          availableMemoryNodes={availableMemoryNodes}
          masterToolNodes={masterToolNodes}
          masterMiddlewareNodes={masterMiddlewareNodes}
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          connectedRoutes={connectedRoutes}
          onSelectLLM={onSelectLLM}
          onToggleTool={onToggleTool}
          onAddToolRef={onAddToolRef}
          onRemoveToolRef={onRemoveToolRef}
          onToggleMiddleware={onToggleMiddleware}
          onAddMiddlewareRef={onAddMiddlewareRef}
          onRemoveMiddlewareRef={onRemoveMiddlewareRef}
          onToggleMemory={onToggleMemory}
          onDeleteStep={onDeleteStep}
          onUpdateStep={onUpdateStep}
          onUpdateLLM={onUpdateLLM}
          onUpdateTool={onUpdateTool}
          onUpdateMiddleware={onUpdateMiddleware}
          onUpdateAgent={onUpdateAgent}
          onUpdateMemory={onUpdateMemory}
          onUpdateOutput={onUpdateOutput}
          selectedTransformerData={selectedTransformerData}
          selectedTransformerRefData={selectedTransformerRefData}
          selectedTypesData={selectedTypesData}
          selectedTypesRefData={selectedTypesRefData}
          onUpdateTransformer={onUpdateTransformer}
          onUpdateTypes={onUpdateTypes}
          onUpdateTypesRef={onUpdateTypesRef}
          onSelectNode={onSelectNode}
          stateChannels={stateChannels}
          customReducers={customReducers}
          onClose={onClose}
        />
      )}
      </div>
    </div>
  );
}
