"use client";

import React, { useState } from "react";
import { Sliders, Play, Sparkles, X } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { InputsTabContent } from "./InputsTabContent";
import { StartNodeTestingTab } from "./StartNodeTestingTab";
import { LangGraphTestCasesInspector } from "./LangGraphTestCasesInspector";
import type {
  LangGraphInputChannel,
  LangGraphStateChannel,
  LangGraphMemoryConfig,
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  LangGraphStepConfig,
  SimulationTestCase,
} from "@workspace/canvas";
import type { ConnectedRouteInfo } from "../../../LangGraphNode";
import type { SimulationTestCaseResult } from "@/lib/simulation/runtime";

export interface StartNodeInspectorProps {
  inputChannels: LangGraphInputChannel[];
  setInputChannels: React.Dispatch<React.SetStateAction<LangGraphInputChannel[]>>;
  stateChannels: LangGraphStateChannel[];
  suggestedParams?: Array<{
    key: string;
    type: LangGraphInputChannel["type"];
    description?: string;
    required?: boolean;
  }>;
  nodes?: LangGraphCanvasNode[];
  edges?: LangGraphCanvasEdge[];
  memoryConfig?: LangGraphMemoryConfig;
  graphLabel?: string;
  graphNodeId?: string;
  graphSteps?: LangGraphStepConfig[];
  graphEdges?: Array<{
    source: string;
    sourceHandle?: string | null;
    target: string;
  }>;
  graphNodeLabels?: Record<string, string>;
  connectedRoutes?: ConnectedRouteInfo[];
  onRunTestCase?: (
    testCase: SimulationTestCase,
  ) => Promise<SimulationTestCaseResult | void> | SimulationTestCaseResult | void;
  defaultTab?: "inputs" | "testing" | "test-cases";
  onClose?: () => void;
  onRefreshInputs?: () => void;
}

export function StartNodeInspector({
  inputChannels,
  setInputChannels,
  stateChannels,
  suggestedParams,
  nodes = [],
  edges = [],
  memoryConfig,
  graphLabel,
  graphNodeId,
  graphSteps = [],
  graphEdges = [],
  graphNodeLabels = {},
  connectedRoutes = [],
  onRunTestCase,
  defaultTab = "inputs",
  onClose,
  onRefreshInputs,
}: StartNodeInspectorProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const availableTransformers = React.useMemo(() => {
    return (nodes || [])
      .filter(
        (n) =>
          n.type === "transformer_ref" ||
          n.type === "transformer",
      )
      .map((n) => {
        const d = n.data;
        const functionName =
          d && typeof d.functionName === "string" ? d.functionName : undefined;
        const label = d && typeof d.label === "string" ? d.label : undefined;
        return {
          id: n.id,
          name: functionName || label || n.id,
        };
      });
  }, [nodes]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top Tabs Navigation ── */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col h-full min-h-0"
      >
        <div className="px-3 pt-3 pb-2 border-b border-border/60 bg-muted/20 shrink-0 flex items-center gap-2">
          <TabsList className="flex-1 grid grid-cols-3 h-8 p-1 bg-muted/60">
            <TabsTrigger
              value="inputs"
              className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground font-semibold"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Inputs</span>
            </TabsTrigger>
            <TabsTrigger
              value="testing"
              className="text-xs flex items-center gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-semibold transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Testing</span>
            </TabsTrigger>
            <TabsTrigger
              value="test-cases"
              className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Test Cases</span>
            </TabsTrigger>
          </TabsList>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 rounded-md"
              onClick={onClose}
              onMouseDown={(e) => e.stopPropagation()}
              title="Close inspector (Esc)"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* ── Tab 1: Inputs ── */}
        <TabsContent value="inputs" className="flex-1 min-h-0 overflow-y-auto hide-scrollbar m-0 p-0">
          <InputsTabContent
            inputChannels={inputChannels}
            setInputChannels={setInputChannels}
            suggestedParams={suggestedParams}
            stateChannels={stateChannels}
            availableTransformers={availableTransformers}
            onRefreshInputs={onRefreshInputs}
          />
        </TabsContent>

        {/* ── Tab 2: Testing (In-Browser Execution) ── */}
        <TabsContent value="testing" className="flex-1 min-h-0 overflow-hidden m-0 p-0">
          <StartNodeTestingTab
            nodes={nodes}
            edges={edges}
            stateChannels={stateChannels}
            inputChannels={inputChannels}
            memoryConfig={memoryConfig}
            graphLabel={graphLabel}
          />
        </TabsContent>

        {/* ── Tab 3: Test Cases (Simulation & Mocks) ── */}
        <TabsContent value="test-cases" className="flex-1 min-h-0 overflow-y-auto hide-scrollbar m-0 p-0">
          {graphNodeId && (
            <LangGraphTestCasesInspector
              graphNodeId={graphNodeId}
              inputChannels={inputChannels}
              stateChannels={stateChannels}
              graphSteps={graphSteps}
              graphEdges={graphEdges}
              graphNodeLabels={graphNodeLabels}
              connectedRoutes={connectedRoutes}
              onRunTestCase={onRunTestCase}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
