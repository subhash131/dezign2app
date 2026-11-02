import React, { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Panel,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layout, AlertTriangle, ExternalLink, Plus } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";
import type { BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import {
  checkCheckpointerTablesStatus,
  provisionDatabaseAndCheckpointerTables,
  provisionCheckpointerTables,
} from "./langgraph-canvas/utils/checkpointerTables";
import {
  useLangGraphAutoLayout,
  getLangGraphFlowNodes,
} from "../../../hooks/useAutoLayout";
import { useAutoLayoutShortcut } from "../../../hooks/useAutoLayoutShortcut";
import { langGraphCanvasNodeTypes } from "./langgraph-canvas/nodes";
import { useLangGraphCanvasState } from "./langgraph-canvas/hooks/useLangGraphCanvasState";
import { LangGraphCanvasHeader } from "./langgraph-canvas/components/LangGraphCanvasHeader";
import { ToolsSidebar } from "./langgraph-canvas/components/ToolsSidebar";
import { InspectorSidebar } from "./langgraph-canvas/components/InspectorSidebar";
import { LangGraphReferenceEdge } from "./langgraph-canvas/components/LangGraphReferenceEdge";
import { CompilerDialog } from "../../../compiler";
import { compileLangGraph } from "@/lib/compiler";
import { simulateLangGraphTestCase } from "@/lib/simulation/runtime";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import {
  executeBrowserLangGraph,
  type BrowserExecutionResult,
} from "@/lib/simulation/browserLangGraphRunner";
import type { SimulationTestCase } from "@workspace/canvas";
import type {
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
} from "./langgraph-canvas/types";
import type { LangGraphStepConfig } from "@/types/canvas";

import { useConnectedRoutes } from "./LangGraphNode";
import { detectInfiniteLoops, type LoopWarning } from "./langgraph-canvas/utils/loopDetection";

const langGraphCanvasEdgeTypes = {
  "langgraph-reference": LangGraphReferenceEdge,
};

interface LangGraphStudioViewProps {
  node: BackendNode;
  onClose: () => void;
  projectId?: string;
}

export function LangGraphStudioView({
  node,
  onClose,
  projectId: propProjectId,
}: LangGraphStudioViewProps) {
  const params = useParams();
  const router = useRouter();
  const routeProjectId = (params?.projectId as string) || "";
  const projectId = propProjectId || routeProjectId;

  const handleOpenSchemaView = useCallback(() => {
    useBackendCanvasStore.getState().setView("schema");
    if (projectId) {
      router.push(`/project/${projectId}?view=schema`);
    }
  }, [projectId, router]);

  const terminalOpen = useSidebarStore((s) => s.terminalOpen);
  const toggleTerminal = useSidebarStore((s) => s.toggleTerminal);
  const terminalHeight = useSidebarStore((s) => s.terminalHeight);

  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const connectedRoutes = useConnectedRoutes(node.id);
  const allTestCases = useSimulationStore((state) => state.testCases);
  const graphTestCases = useMemo(
    () => allTestCases.filter((testCase) => testCase.targetNodeId === node.id),
    [allTestCases, node.id],
  );

  const {
    nodes,
    setNodes,
    edges,
    setEdges,
    inputChannels,
    setInputChannels,
    stateChannels,
    setStateChannels,
    customReducers,
    handleAddCustomReducer,
    handleUpdateCustomReducer,
    handleDeleteCustomReducer,
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
    updateSelectedTransformer,
    updateSelectedTypes,
    updateSelectedTypesRef,
    selectedTransformerData,
    selectedTransformerRefData,
    selectedTypesData,
    selectedTypesRefData,
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
  } = useLangGraphCanvasState({ node, updateNode, onClose });

  const [outputMode, setOutputMode] = useState<"app" | "package">("app");

  const handleCloseInspector = useCallback(() => {
    setSelectedNodeId(null);
    setActiveSideTab("inspector");
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
    );
    setEdges((eds) =>
      eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
    );
  }, [setSelectedNodeId, setActiveSideTab, setNodes, setEdges]);

  const handleSelectionChange = useCallback(
    ({
      nodes: selNodes,
      edges: selEdges,
    }: {
      nodes: LangGraphCanvasNode[];
      edges: LangGraphCanvasEdge[];
    }) => {
      if (selEdges.length > 0 && selNodes.length === 0) {
        setSelectedNodeId(null);
      } else if (selNodes.length > 0) {
        const activeNode = selNodes[0];
        if (activeNode) {
          setSelectedNodeId((prev) =>
            prev === activeNode.id ? prev : activeNode.id,
          );
        }
      }
    },
    [setSelectedNodeId],
  );

  const { handleLayout, panToFlow } = useLangGraphAutoLayout({
    nodes,
    edges,
    onNodesChange,
  });

  useAutoLayoutShortcut(
    useCallback(() => handleLayout("LR"), [handleLayout]),
  );

  const graphSteps = useMemo<LangGraphStepConfig[]>(
    () =>
      nodes
        .filter(
          (canvasNode) =>
            canvasNode.type === "step" ||
            canvasNode.type === "langgraph_node" ||
            canvasNode.type === "langgraph_agent",
        )
        .map((canvasNode) => {
          const data = canvasNode.data as unknown as {
            stepId?: string;
            label?: string;
            name?: string;
            stepType?: LangGraphStepConfig["type"];
            routerConfig?: LangGraphStepConfig["routerConfig"];
            stateUpdates?: LangGraphStepConfig["stateUpdates"];
            modelConfig?: LangGraphStepConfig["modelConfig"];
            customCode?: LangGraphStepConfig["customCode"];
          };
          return {
            id: canvasNode.id,
            name: data.label || data.name || canvasNode.id,
            type: data.stepType || "llm_call",
            routerConfig: data.routerConfig,
            stateUpdates: data.stateUpdates,
            modelConfig: data.modelConfig,
            customCode: data.customCode,
          };
        }),
    [nodes],
  );
  const graphPathEdges = useMemo(
    () =>
      edges.map((edge) => ({
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
      })),
    [edges],
  );
  const graphNodeLabels = useMemo(
    () =>
      Object.fromEntries(
        nodes.map((canvasNode) => [
          canvasNode.id,
          (canvasNode.data as { label?: string }).label || canvasNode.id,
        ]),
      ),
    [nodes],
  );
  const allCanvasNodes = useBackendCanvasStore((s) => s.nodes);
  const allCanvasEdges = useBackendCanvasStore((s) => s.edges);
  const addCanvasNode = useBackendCanvasStore((s) => s.addNode);
  const updateCanvasNode = useBackendCanvasStore((s) => s.updateNode);
  const addCanvasEdge = useBackendCanvasStore((s) => s.addEdge);

  const checkpointerTablesStatus = useMemo(() => {
    return checkCheckpointerTablesStatus(
      allCanvasNodes,
      allCanvasEdges,
      memoryConfig?.enabled !== false,
      memoryConfig?.checkpointer || "memory",
      memoryConfig?.checkpointerNodeId,
    );
  }, [allCanvasNodes, allCanvasEdges, memoryConfig]);

  const hasStorageNodes = useMemo(() => {
    return !checkpointerTablesStatus.isMissingStorage;
  }, [checkpointerTablesStatus]);

  const checkpointerMissingError = useMemo(() => {
    if (!memoryConfig || memoryConfig.enabled === false || memoryConfig.checkpointer === "memory") return null;
    const isPg = memoryConfig.checkpointer === "postgres";
    const isRedis = memoryConfig.checkpointer === "redis";
    if (!isPg && !isRedis) return null;

    if (checkpointerTablesStatus.isMissingStorage) {
      return `No ${isPg ? "PostgreSQL database" : "Redis instance"} found in SchemaView. Please create one in SchemaView.`;
    }

    if (!checkpointerTablesStatus.isConfigured) {
      return `No ${isPg ? "PostgreSQL database" : "Redis instance"} linked from SchemaView. Please link one in the Memory tab.`;
    }

    if (!checkpointerTablesStatus.areTablesCreated) {
      return checkpointerTablesStatus.errorMessage || `Checkpointer tables are missing in SchemaView.`;
    }

    return null;
  }, [memoryConfig, checkpointerTablesStatus]);

  const handleCreateStudioCheckpointerTables = () => {
    const currentEngine = memoryConfig?.checkpointer || "postgres";
    if (checkpointerTablesStatus.isMissingStorage || !checkpointerTablesStatus.configuredNodeId) {
      const result = provisionDatabaseAndCheckpointerTables({
        nodes: allCanvasNodes,
        edges: allCanvasEdges,
        addNode: addCanvasNode,
        updateNode: updateCanvasNode,
        addEdge: addCanvasEdge,
        checkpointerType: currentEngine,
      });

      if (result.configuredNodeId) {
        setMemoryConfig({ ...memoryConfig, checkpointerNodeId: result.configuredNodeId });
        toast.success(
          `Created ${currentEngine === "redis" ? "Redis instance" : "PostgreSQL database"} and ${result.createdCount} checkpointer tables in SchemaView!`,
        );
      }
      return;
    }

    const created = provisionCheckpointerTables({
      linkedNodeId: checkpointerTablesStatus.configuredNodeId,
      checkpointerType: currentEngine,
      nodes: allCanvasNodes,
      edges: allCanvasEdges,
      addNode: addCanvasNode,
      updateNode: updateCanvasNode,
      addEdge: addCanvasEdge,
    });

    if (created > 0) {
      toast.success(
        `Created ${created} LangGraph checkpointer ${currentEngine === "postgres" ? "table" : "schema"}${created > 1 ? "s" : ""} in SchemaView!`,
      );
    } else {
      toast.info("All LangGraph checkpointer tables already exist in SchemaView.");
    }
  };

  const loopWarnings = useMemo(() => {
    return detectInfiniteLoops({ nodes, edges });
  }, [nodes, edges]);

  const activeNodeIds = useSimulationStore((s) => s.activeNodeIds);
  const activeEdgeIds = useSimulationStore((s) => s.activeEdgeIds);
  const currentNodeId = useSimulationStore((s) => s.currentNodeId);
  const currentEdgeId = useSimulationStore((s) => s.currentEdgeId);

  const displayEdges = useMemo(() => {
    return edges.map((edge) => {
      if (edge.type === "langgraph-reference") {
        const isConnectedToSelected = Boolean(
          selectedNodeId &&
            (edge.source === selectedNodeId || edge.target === selectedNodeId),
        );
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        const isNodeSelected = Boolean(
          sourceNode?.selected ||
            targetNode?.selected ||
            isConnectedToSelected ||
            edge.selected,
        );

        return {
          ...edge,
          hidden: !isNodeSelected,
          data: {
            ...edge.data,
            isActive: isNodeSelected,
          },
        };
      }

      const isCurrent = currentEdgeId === edge.id;
      const isActive = activeEdgeIds.includes(edge.id);
      const isSelected = Boolean(edge.selected);
      const strokeColor = isCurrent
        ? "#38bdf8"
        : isActive
          ? "#818cf8"
          : isSelected
            ? "#38bdf8"
            : edge.style?.stroke || "#a1a1aa";

      return {
        ...edge,
        animated: edge.animated !== undefined ? edge.animated : true,
        style: {
          ...edge.style,
          stroke: strokeColor,
          strokeWidth: isCurrent
            ? 3.5
            : isActive
              ? 2.5
              : isSelected
                ? 3
                : edge.style?.strokeWidth || 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: strokeColor,
        },
      };
    });
  }, [edges, nodes, selectedNodeId, activeEdgeIds, currentEdgeId]);

  const displayNodes = useMemo(() => {
    // Build a map of nodeId -> loopWarning
    const loopWarningMap = new Map<string, LoopWarning>();
    for (const warning of loopWarnings) {
      for (const id of warning.cycleNodeIds) {
        if (!loopWarningMap.has(id)) {
          loopWarningMap.set(id, warning);
        }
      }
    }

    // Also associate warning with any AgentRef node that links to a master node in the cycle
    for (const node of nodes) {
      if (
        node.type === "langgraph_agent_ref" ||
        node.type === "langgraph_node_ref"
      ) {
        const refData = node.data as { agentRef?: string; nodeRef?: string } | undefined;
        const targetMasterId = refData?.agentRef || refData?.nodeRef;
        if (targetMasterId && loopWarningMap.has(targetMasterId) && !loopWarningMap.has(node.id)) {
          loopWarningMap.set(node.id, loopWarningMap.get(targetMasterId)!);
        }
      }
    }

    return nodes.map((n) => {
      const isCurrent = currentNodeId === n.id;
      const isActive = activeNodeIds.includes(n.id);
      const loopWarning = loopWarningMap.get(n.id);
      const isLoopNode = Boolean(loopWarning);
      const isPill =
        n.id === "START" || n.type === "end" || n.id.startsWith("end_");
      const baseRounded = isPill ? "rounded-full" : "rounded-2xl";

      // Pass loopWarning directly into node data so AgentRef node can render it
      const nextData = {
        ...n.data,
        loopWarning,
      };

      if (!isCurrent && !isActive) {
        return {
          ...n,
          data: nextData,
          className: `${n.className || ""} ${baseRounded} ${
            isLoopNode && (n.type === "langgraph_agent_ref" || n.type === "langgraph_node_ref")
              ? "ring-2 ring-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
              : ""
          }`,
        };
      }

      const existingClass = n.className || "";
      return {
        ...n,
        data: nextData,
        className: `${existingClass} ${baseRounded} ${
          isCurrent
            ? "ring-4 ring-sky-400 ring-offset-2 ring-offset-background transition-all duration-300"
            : "ring-2 ring-sky-500/60 transition-all duration-300"
        }`,
      };
    });
  }, [nodes, activeNodeIds, currentNodeId, loopWarnings]);

  const runGraphTestCase = async (testCase: SimulationTestCase) => {
    // If the test case has explicit mock overrides configured, simulate with those mocks.
    // Otherwise, execute using the real in-browser execution runner!
    const hasCustomMocks = testCase.mocks && Object.keys(testCase.mocks).length > 0;
    if (!hasCustomMocks) {
      const combinedInputs: Record<string, boolean | number | string | null | undefined> = {};
      if (testCase.initialState) {
        Object.assign(combinedInputs, testCase.initialState);
      }
      if (testCase.request?.body && typeof testCase.request.body === "object") {
        Object.assign(combinedInputs, testCase.request.body);
      }

      let execResult: BrowserExecutionResult | undefined;
      try {
        const response = await fetch("/api/langgraph/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes,
            edges,
            stateChannels,
            inputChannels,
            memoryConfig,
            inputValues: combinedInputs,
            threadId: `test-${testCase.id}`,
            provider: "groq",
            modelName: "openai/gpt-oss-120b",
          }),
        });
        if (response.ok) {
          execResult = await response.json();
        }
      } catch {
        // fallback to in-browser execution
      }

      if (!execResult) {
        execResult = await executeBrowserLangGraph({
          nodes,
          edges,
          stateChannels,
          inputChannels,
          memoryConfig,
          inputValues: combinedInputs,
          threadId: `test-${testCase.id}`,
          provider: "groq",
          modelName: "openai/gpt-oss-120b",
        });
      }

      const assertions = [
        {
          name: "execution error check",
          passed: !execResult.error,
          detail: execResult.error,
        },
        {
          name: "expected status",
          passed:
            testCase.expectedStatus === undefined ||
            testCase.expectedStatus === (execResult.error ? 500 : 200),
          detail:
            testCase.expectedStatus === undefined
              ? undefined
              : `Expected ${testCase.expectedStatus}, received ${execResult.error ? 500 : 200}`,
        },
        {
          name: "expected graph path",
          passed:
            testCase.expectedPath === undefined ||
            JSON.stringify(testCase.expectedPath) ===
              JSON.stringify(execResult.visitedNodes),
          detail:
            testCase.expectedPath === undefined
              ? undefined
              : `Expected ${JSON.stringify(testCase.expectedPath)}, received ${JSON.stringify(execResult.visitedNodes)}`,
        },
      ];

      const passed = assertions.every((a) => a.passed);
      const res = {
        status: execResult.error ? 500 : 200,
        statusText: execResult.error ? "Execution Failed" : "OK",
        headers: { "x-runtime": "browser-real" },
        body: execResult.finalState,
        trace: execResult.trace,
        testCaseId: testCase.id,
        testCaseName: testCase.name,
        assertions,
      };
      useSimulationStore.getState().start(res.trace);
      return res;
    }

    const graphEdges = edges
      .filter(
        (edge) =>
          edge.source !== "STATE_GLOBAL" && edge.target !== "STATE_GLOBAL",
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        targets: [
          {
            id: edge.target,
            kind: edge.target === "END" ? ("end" as const) : ("step" as const),
            targetHandle: edge.targetHandle,
          },
        ],
      }));
    const result = await simulateLangGraphTestCase({
      graph: { ...node, data: { ...node.data, graphSteps, graphEdges } },
      testCase,
    });
    useSimulationStore.getState().start(result.trace);
    return result;
  };

  return (
    <div
      className="flex flex-col h-screen w-screen bg-background text-foreground outline-none overflow-hidden"
      tabIndex={0}
      onKeyDown={(e) => {
        const activeEl =
          typeof document !== "undefined" && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const targetEl = e.target instanceof HTMLElement ? e.target : null;

        const isInputTarget = (el: Element | null) => {
          if (!el) return false;
          const isContentEditable = el instanceof HTMLElement ? el.isContentEditable : false;
          return (
            el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.tagName === "SELECT" ||
            isContentEditable ||
            Boolean(
              el.closest(
                "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [data-inspector], .inspector-sidebar, .nodrag, .nowheel, .nopan, .nokey"
              )
            )
          );
        };

        const isEditingInput = isInputTarget(targetEl) || isInputTarget(activeEl);

        if (e.key === "Escape") {
          e.preventDefault();
          if (targetEl) {
            targetEl.blur();
          }
          if (selectedNodeId) {
            handleCloseInspector();
          }
          return;
        }

        // Never delete nodes with Backspace (which is used for editing text)
        if (e.key === "Backspace") {
          return;
        }

        if (isEditingInput) {
          return;
        }

        // Only delete nodes with dedicated Delete key, never Backspace which is used for editing text
        if (e.key === "Delete") {
          e.preventDefault();
          handleDeleteSelected();
        }
      }}
    >
      {/* Header */}
      <LangGraphCanvasHeader
        label={node.data.label}
        onUpdateLabel={(newLabel) =>
          updateNode(node.id, { data: { ...node.data, label: newLabel } })
        }
        onSave={handleSave}
        onClose={onClose}
        onAutoLayout={(dir) => handleLayout(dir || "LR")}
        onCompile={() => setShowCompileModal(true)}
        saveStatus={saveStatus}
        terminalOpen={terminalOpen}
        onToggleTerminal={toggleTerminal}
      />

      {/* Checkpointer Configuration Warning Banner */}
      {checkpointerMissingError && (
        <div className="bg-destructive/15 border-b border-destructive/30 px-4 py-2 flex items-center justify-between text-xs text-destructive font-medium backdrop-blur-sm z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{checkpointerMissingError}</span>
          </div>
          <div className="flex items-center gap-2">
            {!checkpointerTablesStatus.areTablesCreated && (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[11px] px-2.5 py-0 gap-1 font-bold cursor-pointer"
                onClick={handleCreateStudioCheckpointerTables}
              >
                <Plus className="w-3 h-3" />
                <span>
                  {checkpointerTablesStatus.isMissingStorage
                    ? `Create DB & Tables`
                    : `Create Tables`}
                </span>
              </Button>
            )}
            {hasStorageNodes && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2.5 py-0 border-destructive/40 text-destructive hover:bg-destructive/20"
                onClick={() => {
                  setSelectedNodeId("CHECKPOINTER");
                  setActiveSideTab("memory");
                }}
              >
                Configure Memory
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2.5 py-0 border-destructive/40 text-destructive hover:bg-destructive/20 gap-1.5"
              onClick={handleOpenSchemaView}
            >
              <span>Open Schema View</span>
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Sidebar Tools */}
        <ToolsSidebar onAddStep={handleAddStep} />

        {/* Center Canvas */}
        <div className="flex-1 relative">
          <style>{`
            .react-flow__node {
              border-radius: 1rem !important;
            }
            .react-flow__node.type-start,
            .react-flow__node.type-end {
              border-radius: 9999px !important;
            }
            .react-flow__node.selected {
              border-radius: 1rem !important;
            }
          `}</style>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={langGraphCanvasNodeTypes}
            edgeTypes={langGraphCanvasEdgeTypes}
            deleteKeyCode={null}
            onBeforeDelete={async () => {
              // ReactFlow should not delete any nodes or edges via uncontrolled keypress.
              // Intentional deletion is handled cleanly by handleDeleteSelected on explicit Delete key.
              return false;
            }}
            edgesReconnectable={true}
            edgesFocusable={true}
            elementsSelectable={true}
            minZoom={0.01}
            maxZoom={3}
            onEdgeClick={(_: React.MouseEvent, edge: LangGraphCanvasEdge) => {
              setSelectedNodeId(null);
              setNodes((nds) =>
                nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
              );
              setEdges((eds) =>
                eds.map((e) => ({ ...e, selected: e.id === edge.id })),
              );
            }}
            onNodeClick={(_: React.MouseEvent, n: LangGraphCanvasNode) => {
              setSelectedNodeId(n.id);
              setEdges((eds) =>
                eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
              );
              if (n.id === "START") setActiveSideTab("inputs");
              else if (n.id === "STATE_GLOBAL") setActiveSideTab("state");
              else setActiveSideTab("inspector");
            }}
            onPaneClick={handleCloseInspector}
            onSelectionChange={handleSelectionChange}
            fitView
            fitViewOptions={useMemo(() => {
              const flowNodes = getLangGraphFlowNodes(nodes, edges);
              return {
                padding: 0.2,
                maxZoom: 0.85,
                nodes:
                  flowNodes.length > 0
                    ? flowNodes.map((n) => ({ id: n.id }))
                    : undefined,
              };
            }, [nodes, edges])}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#a1a1aa", strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 14,
                height: 14,
                color: "#a1a1aa",
              },
              interactionWidth: 20,
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              color="#3f3f46"
              size={1.5}
            />
            <Controls
              className="!bg-background !border-border !text-foreground"
              style={{
                bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
                transition: "bottom 0.2s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
            <MiniMap
              className="!bg-background/90 !border-border"
              nodeColor="#71717a"
              style={{
                bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
                transition: "bottom 0.2s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
            <Panel
              position="top-left"
              className="flex items-center gap-1.5 bg-background/95 backdrop-blur border border-border p-1 rounded-xl shadow-md"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 font-semibold hover:bg-accent text-foreground"
                onClick={() => handleLayout("LR")}
                title="Auto Layout Left to Right (Shift + A)"
              >
                <Layout className="w-3.5 h-3.5 text-primary" />
                <span>Auto Layout</span>
                <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium text-muted-foreground/80 bg-accent/80 border border-border px-1 py-0.5 rounded leading-none ml-0.5">
                  ⇧A
                </kbd>
              </Button>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right Inspector Sidebar */}
        <InspectorSidebar
          selectedNodeId={selectedNodeId}
          onClose={handleCloseInspector}
          activeSideTab={activeSideTab}
          setActiveSideTab={setActiveSideTab}
          selectedStepData={selectedStepData}
          selectedLLMData={selectedLLMData}
          selectedToolData={selectedToolData}
          selectedMiddlewareData={selectedMiddlewareData}
          selectedAgentData={selectedAgentData}
          selectedMemoryData={selectedMemoryData}
          selectedOutputData={selectedOutputData}
          selectedStartData={selectedStartData}
          graphNodeId={node.id}
          graphSteps={graphSteps}
          graphEdges={graphPathEdges}
          graphNodeLabels={graphNodeLabels}
          onRunTestCase={runGraphTestCase}
          availableLLMNodes={availableLLMNodes}
          availableToolNodes={availableToolNodes}
          availableMiddlewareNodes={availableMiddlewareNodes}
          availableMemoryNodes={availableMemoryNodes}
          connectedRoutes={connectedRoutes}
          masterToolNodes={masterToolNodes}
          masterMiddlewareNodes={masterMiddlewareNodes}
          onSelectLLM={(llmId) =>
            selectedNodeId && handleSelectLLMForAgent(selectedNodeId, llmId)
          }
          onToggleTool={(toolId, connect) =>
            selectedNodeId &&
            handleToggleToolForAgent(selectedNodeId, toolId, connect)
          }
          onAddToolRef={(masterToolId) =>
            selectedNodeId &&
            handleAddToolRefForAgent(selectedNodeId, masterToolId)
          }
          onRemoveToolRef={(toolRefId) =>
            handleRemoveToolRefForAgent(toolRefId)
          }
          onToggleMiddleware={(mwId, connect) =>
            selectedNodeId &&
            handleToggleMiddlewareForAgent(selectedNodeId, mwId, connect)
          }
          onAddMiddlewareRef={(masterMwId) =>
            selectedNodeId &&
            handleAddMiddlewareRefForAgent(selectedNodeId, masterMwId)
          }
          onRemoveMiddlewareRef={(mwRefId) =>
            handleRemoveMiddlewareRefForAgent(mwRefId)
          }
          onToggleMemory={(memId, connect) =>
            selectedNodeId &&
            handleToggleMemoryForAgent(selectedNodeId, memId, connect)
          }
          onDeleteStep={handleDeleteStep}
          onUpdateStep={updateSelectedStep}
          onUpdateLLM={updateSelectedLLM}
          onUpdateTool={updateSelectedTool}
          onUpdateMiddleware={updateSelectedMiddleware}
          onUpdateAgent={updateSelectedAgent}
          onUpdateMemory={updateSelectedMemory}
          onUpdateOutput={updateSelectedOutput}
          selectedTransformerData={selectedTransformerData}
          selectedTransformerRefData={selectedTransformerRefData}
          selectedTypesData={selectedTypesData}
          selectedTypesRefData={selectedTypesRefData}
          onUpdateTransformer={updateSelectedTransformer}
          onUpdateTypes={updateSelectedTypes}
          onUpdateTypesRef={updateSelectedTypesRef}
          onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
          inputChannels={inputChannels}
          setInputChannels={setInputChannels}
          stateChannels={stateChannels}
          setStateChannels={setStateChannels}
          customReducers={customReducers}
          onAddCustomReducer={handleAddCustomReducer}
          onUpdateCustomReducer={handleUpdateCustomReducer}
          onDeleteCustomReducer={handleDeleteCustomReducer}
          memoryConfig={memoryConfig}
          setMemoryConfig={setMemoryConfig}
          suggestedParams={suggestedParams}
          onRefreshInputs={handleRefreshInputs}
          nodes={nodes}
          edges={edges}
          graphLabel={node.data.label}
        />
      </div>

      {/* Compiled Code Dialog */}
      <CompilerDialog
        open={showCompileModal}
        onOpenChange={setShowCompileModal}
        projectName={node.data.label || "LangGraph Agent Project"}
        overrideTitle={`${node.data.label || "LangGraph Agent"} Compiler Engine`}
        outputMode={outputMode}
        onOutputModeChange={setOutputMode}
        overrideFiles={useMemo(() => {
          if (!showCompileModal) return [];
          return compileLangGraph({
            graphLabel: node.data.label || "LangGraph Agent",
            stateChannels,
            inputChannels,
            nodes,
            edges,
            memoryConfig,
            testCases: graphTestCases,
            outputMode,
          });
        }, [
          showCompileModal,
          node.data.label,
          stateChannels,
          inputChannels,
          nodes,
          edges,
          memoryConfig,
          graphTestCases,
          outputMode,
        ])}
      />
    </div>
  );
}
