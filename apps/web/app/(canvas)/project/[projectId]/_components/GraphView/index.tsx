import React, { useState, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Connection,
  useReactFlow,
  Node,
} from "@xyflow/react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useSidebarStore, getEffectiveConfigSidebarWidth } from "@/lib/stores/sidebarStore";
import { nodeTypes } from "../backend-nodes/Nodes";
import { ForeignKeyEdge } from "../backend-nodes/ForeignKeyEdge";
import {
  HTTPConnectionEdge,
  MessagingEdge,
  IdentityConnectionEdge,
  TransformerReferenceEdge,
  StorageReferenceEdge,
  TypeReferenceEdge,
} from "../backend-nodes/CustomEdges";
import { isValidConnection, WebAppZone } from "@workspace/canvas";
import { useCanvasHandlers } from "../hooks/useCanvasHandlers";
import { useGraphAutoLayout, getGraphFlowNodes } from "../hooks/useAutoLayout";
import { useAutoLayoutShortcut } from "../hooks/useAutoLayoutShortcut";
import { TopToolbarPanel } from "./TopToolbarPanel";
import { TestCaseDialogs } from "./TestCaseDialogs";
import { sortZonePages } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/nodes/gateway/web-page";
import { healDirectTransformerEdges, resolveWebPageActionInboundHandle } from "@/lib/stores/backendCanvas/edge/handlers/transformerConnect";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
  connection: HTTPConnectionEdge,
  message: MessagingEdge,
  "identity-connection": IdentityConnectionEdge,
  "transformer-reference": TransformerReferenceEdge,
  "storage-reference": StorageReferenceEdge,
  "type-reference": TypeReferenceEdge,
  reference: TransformerReferenceEdge,
};

export interface GraphViewProps {
  projectId: string;
  projectName?: string;
}

export function GraphView({ projectId, projectName }: GraphViewProps) {
  const { nodes, edges, onEdgesChange, onConnect, addNode, setView } =
    useBackendCanvasStore();
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  useEffect(() => {
    setView("graph");
  }, [setView]);

  // Self-heal any legacy direct edges between global transformers and WebPages / Services,
  // or unconnected transformer_ref nodes on canvas
  useEffect(() => {
    if (nodes.length === 0) return;
    const hasDirectEdge = edges.some((e) => {
      if (e.type === "transformer-reference" || e.type === "reference") return false;
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      if (!src || !tgt) return false;
      return (
        (src.type === "transformer" && (tgt.type === "webPage" || tgt.type === "service")) ||
        (tgt.type === "transformer" && (src.type === "webPage" || src.type === "service")) ||
        (src.type === "webPage" && tgt.type === "transformer_ref")
      );
    });

    const hasUnconnectedTransformerRef = nodes.some((n) => {
      if (n.type !== "transformer_ref") return false;
      const targetWp = n.data?.targetWebPageId
        ? nodes.find((node) => node.id === n.data.targetWebPageId)
        : nodes.find((node) => node.type === "webPage");
      const targetActionId = n.data?.targetActionId || n.data?.targetActionIds?.[0];
      const { handle: expectedHandle } = resolveWebPageActionInboundHandle(targetWp, targetActionId);

      const hasValidOutgoing = edges.some(
        (e) =>
          e.source === n.id &&
          e.sourceHandle === "transformer-out" && (e.type === "connection" || !e.type) &&
          (!targetWp || (e.target === targetWp.id && (!expectedHandle || e.targetHandle === expectedHandle))),
      );
      return !hasValidOutgoing;
    });

    if (hasDirectEdge || hasUnconnectedTransformerRef) {
      const store = useBackendCanvasStore.getState();
      const healed = healDirectTransformerEdges({
        nodes: store.nodes,
        edges: store.edges,
        pendingEdgeRemovals: store.pendingEdgeRemovals,
        pendingEdgeUpserts: store.pendingEdgeUpserts,
        pendingNodeUpserts: store.pendingNodeUpserts,
      });
      if (healed.changed) {
        useBackendCanvasStore.setState({
          nodes: healed.nodes,
          edges: healed.edges,
          pendingEdgeRemovals: healed.pendingEdgeRemovals,
          pendingEdgeUpserts: healed.pendingEdgeUpserts,
          pendingNodeUpserts: healed.pendingNodeUpserts,
        });
      }
    }
  }, [edges, nodes]);
  const simulation = useSimulationStore();
  const selectedCaseId = useSimulationStore((state) => state.selectedCaseId);
  const testCases = useSimulationStore((state) => state.testCases);
  const selectTestCase = useSimulationStore((state) => state.selectTestCase);

  const aiPanelOpen = useSidebarStore((s) => s.aiPanelOpen);
  const aiPanelWidth = useSidebarStore((s) => s.aiPanelWidth);
  const terminalOpen = useSidebarStore((s) => s.terminalOpen);
  const terminalHeight = useSidebarStore((s) => s.terminalHeight);
  const paletteOpen = useSidebarStore((s) => s.paletteOpen);
  const paletteWidth = useSidebarStore((s) => s.paletteWidth);
  const configSidebarWidth = useSidebarStore((s) => s.configSidebarWidth);
  const configSidebarOpen = useSidebarStore((s) => s.configSidebarOpen);
  const isConfigOpen = Boolean(activeConfigItem) || configSidebarOpen;
  const effectiveConfigWidth = getEffectiveConfigSidebarWidth(configSidebarWidth);

  const [caseNameDialog, setCaseNameDialog] = useState<{
    mode: "create" | "rename";
    value: string;
  } | null>(null);
  const [deleteCaseOpen, setDeleteCaseOpen] = useState(false);

  const {
    handleNodesChange,
    handleNodeDragStart,
    handleSelectionDragStart,
    handleMoveEnd,
  } = useCanvasHandlers(projectId, "graph");
  const { fitView } = useReactFlow();

  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);

  const graphNodes = React.useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.type !== "group" &&
          n.type !== "entity" &&
          n.type !== "database" &&
          n.type !== "redis_instance" &&
          n.type !== "redis_schema",
      ),
    [nodes],
  );

  const graphNodeIds = React.useMemo(
    () => new Set(graphNodes.map((n) => n.id)),
    [graphNodes],
  );
  const validEndpointKeys = React.useMemo(() => {
    const keys = new Set(endpoints.map((ep) => `${ep.nodeId}::${ep.id}`));
    nodes.forEach((n) => {
      const nodeEndpoints = Array.isArray(n.data?.endpoints) ? n.data.endpoints : [];
      nodeEndpoints.forEach((ep) => {
        if (ep && typeof ep === "object" && "id" in ep && typeof ep.id === "string") {
          keys.add(`${n.id}::${ep.id}`);
        }
      });
      const routeGroups = Array.isArray(n.data?.routeGroups) ? n.data.routeGroups : [];
      routeGroups.forEach((rg) => {
        if (rg && typeof rg === "object" && "endpoints" in rg && Array.isArray(rg.endpoints)) {
          rg.endpoints.forEach((ep) => {
            if (ep && typeof ep === "object" && "id" in ep && typeof ep.id === "string") {
              keys.add(`${n.id}::${ep.id}`);
            }
          });
        }
      });
    });
    return keys;
  }, [endpoints, nodes]);

  const validEventKeys = React.useMemo(() => {
    const keys = new Set(events.map((ev) => `${ev.nodeId}::${ev.id}`));
    endpoints.forEach((ep) => {
      ep.publishedEvents?.forEach((pev) => {
        if (pev?.id) keys.add(`${ep.nodeId}::${pev.id}`);
      });
    });
    nodes.forEach((n) => {
      const published = Array.isArray(n.data?.publishedEvents) ? n.data.publishedEvents : [];
      published.forEach((pev) => {
        if (pev && typeof pev === "object" && "id" in pev && typeof pev.id === "string") {
          keys.add(`${n.id}::${pev.id}`);
        }
      });
      const consumed = Array.isArray(n.data?.consumedEvents) ? n.data.consumedEvents : [];
      consumed.forEach((cev) => {
        if (cev && typeof cev === "object" && "id" in cev && typeof cev.id === "string") {
          keys.add(`${n.id}::${cev.id}`);
        }
      });
      const nodeEndpoints = Array.isArray(n.data?.endpoints) ? n.data.endpoints : [];
      nodeEndpoints.forEach((ep) => {
        if (ep && typeof ep === "object" && "publishedEvents" in ep && Array.isArray(ep.publishedEvents)) {
          ep.publishedEvents.forEach((pev) => {
            if (pev && typeof pev === "object" && "id" in pev && typeof pev.id === "string") {
              keys.add(`${n.id}::${pev.id}`);
            }
          });
        }
      });
    });
    return keys;
  }, [events, endpoints, nodes]);

  const graphEdges = React.useMemo(() => {
    const seenIds = new Set<string>();
    return edges.filter((e) => {
      if (!e.id || seenIds.has(e.id)) {
        return false;
      }
      seenIds.add(e.id);
      if (e.type === "database-connection" || e.type === "foreign-key") {
        return false;
      }
      if (!graphNodeIds.has(e.source) || !graphNodeIds.has(e.target)) {
        return false;
      }

      if (e.sourceHandle?.startsWith("endpoint-out-") || e.sourceHandle?.startsWith("endpoint-in-")) {
        const epId = e.sourceHandle.replace(/^endpoint-(out|in)-/, "");
        if (!validEndpointKeys.has(`${e.source}::${epId}`)) return false;
      }
      if (e.targetHandle?.startsWith("endpoint-in-") || e.targetHandle?.startsWith("endpoint-out-")) {
        const epId = e.targetHandle.replace(/^endpoint-(in|out)-/, "");
        if (!validEndpointKeys.has(`${e.target}::${epId}`)) return false;
      }

      if (e.sourceHandle?.startsWith("publishedEvents-out-") || e.sourceHandle?.startsWith("consumedEvents-out-")) {
        const evId = e.sourceHandle.replace(/^(publishedEvents|consumedEvents)-out-/, "");
        if (!validEventKeys.has(`${e.source}::${evId}`)) return false;
      }
      if (e.targetHandle?.startsWith("consumedEvents-in-") || e.targetHandle?.startsWith("publishedEvents-in-")) {
        const evId = e.targetHandle.replace(/^(consumedEvents|publishedEvents)-in-/, "");
        if (!validEventKeys.has(`${e.target}::${evId}`)) return false;
      }

      return true;
    });
  }, [edges, graphNodeIds, validEndpointKeys, validEventKeys]);

  const visualGraphEdges = React.useMemo(() => {
    return graphEdges.map((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      const targetNode = nodes.find((n) => n.id === e.target);
      const isTargetPage = targetNode?.type === "webPage";
      const isSourcePage = sourceNode?.type === "webPage";

      if (isTargetPage || isSourcePage) {
        return {
          ...e,
          zIndex: 50,
        };
      }
      return e;
    });
  }, [graphEdges, nodes]);

  const { handleLayout, panToFlow } = useGraphAutoLayout({
    nodes: graphNodes,
    edges: graphEdges,
  });

  useAutoLayoutShortcut(
    React.useCallback(() => handleLayout("LR"), [handleLayout]),
  );

  const flowNodesToFit = React.useMemo(() => {
    const flowNodes = getGraphFlowNodes(graphNodes, graphEdges);
    const typesNodes = graphNodes.filter((n) => n.type === "types");
    const combined = [...flowNodes, ...typesNodes];
    return combined.map((n) => ({ id: n.id }));
  }, [graphNodes, graphEdges]);

  const hasFitted = useRef(false);
  useEffect(() => {
    if (graphNodes.length > 0 && !hasFitted.current) {
      hasFitted.current = true;
      const timer = setTimeout(() => {
        fitView({
          nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
          duration: 500,
          padding: 0.35,
          maxZoom: 0.65,
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [graphNodes.length, flowNodesToFit, fitView]);



  const [lastActiveNodeId, setLastActiveNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (activeConfigItem) {
      const targetId = activeConfigItem.nodeId || activeConfigItem.id;
      if (targetId) {
        setLastActiveNodeId(targetId);
        return;
      }
    }
    const activeNode = graphNodes.find((n) => n.selected || n.dragging);
    if (activeNode) {
      setLastActiveNodeId(activeNode.id);
    }
  }, [graphNodes, activeConfigItem]);

  const sortedGraphNodes = React.useMemo(() => {
    // 1. Build map of stacked hand info for all WebPage nodes per WebApp zone
    const webAppNodes = graphNodes.filter((n) => n.type === "webApp");
    const pageHandMap = new Map<string, { cardIndex: number; totalCards: number; isStacked: boolean }>();

    webAppNodes.forEach((webApp) => {
      const defaultZones: WebAppZone[] = [
        { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
        { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
      ];
      const zones: WebAppZone[] = Array.isArray(webApp.data?.zones) && webApp.data.zones.length > 0
        ? webApp.data.zones
        : defaultZones;
      const expandedZones = Array.isArray(webApp.data?.expandedZones)
        ? webApp.data.expandedZones
        : [];

      zones.forEach((zone: WebAppZone) => {
        const isFannedOut = expandedZones.includes(zone.id);
        const handleId = zone.handleId;
        const zoneEdges = graphEdges.filter(
          (e) =>
            (e.source === webApp.id && e.sourceHandle === handleId) ||
            (e.target === webApp.id && e.targetHandle === handleId),
        );
        const pageIds = new Set(
          zoneEdges.map((e) => (e.source === webApp.id ? e.target : e.source)),
        );
        const zonePages = graphNodes.filter((n) => n.type === "webPage" && pageIds.has(n.id));

        if (zonePages.length > 1) {
          const sorted = sortZonePages(zonePages);
          sorted.forEach((page, idx) => {
            pageHandMap.set(page.id, {
              cardIndex: idx,
              totalCards: sorted.length,
              isStacked: !isFannedOut,
            });
          });
        }
      });
    });

    const nodesWithZ = graphNodes.map((node) => {
      const isSelected = Boolean(node.selected);
      const isDragging = Boolean(node.dragging);
      const isActiveConfig = Boolean(
        activeConfigItem &&
          (activeConfigItem.nodeId === node.id || activeConfigItem.id === node.id),
      );
      const isLastActive = node.id === lastActiveNodeId;
      const isActive = isSelected || isDragging || isLastActive;

      const hand = pageHandMap.get(node.id);
      let z = node.type === "webAppGroup" ? -1 : 1;

      if (hand?.isStacked) {
        const isFrontCard = hand.cardIndex === hand.totalCards - 1;
        if (isActiveConfig) {
          z = 1001;
        } else if (isActive && isFrontCard) {
          z = 1000;
        } else {
          z = 10 + hand.cardIndex;
        }
      } else {
        if (isActiveConfig) {
          z = 1001;
        } else if (isActive) {
          z = 1000;
        }
      }

      return {
        ...node,
        zIndex: z,
      };
    });

    return nodesWithZ.sort((a, b) => {
      if (a.type === "webAppGroup") return -1;
      if (b.type === "webAppGroup") return 1;
      const zA = a.zIndex ?? 0;
      const zB = b.zIndex ?? 0;
      if (zA !== zB) {
        return zA - zB;
      }
      const aIsActiveConfig = Boolean(
        activeConfigItem && (activeConfigItem.nodeId === a.id || activeConfigItem.id === a.id),
      );
      const bIsActiveConfig = Boolean(
        activeConfigItem && (activeConfigItem.nodeId === b.id || activeConfigItem.id === b.id),
      );
      if (aIsActiveConfig && !bIsActiveConfig) return 1;
      if (!aIsActiveConfig && bIsActiveConfig) return -1;

      // Tie-breaker for stacked cards within the same zone hand:
      const aHand = pageHandMap.get(a.id);
      const bHand = pageHandMap.get(b.id);
      if (aHand?.isStacked && bHand?.isStacked) {
        return aHand.cardIndex - bHand.cardIndex;
      }

      return 0;
    });
  }, [graphNodes, graphEdges, activeConfigItem, lastActiveNodeId]);

  const visualGraphNodes = React.useMemo(() => {
    const hasRun = simulation.status !== "idle";
    if (!hasRun) {
      return sortedGraphNodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          zIndex: node.zIndex,
        },
      }));
    }

    return sortedGraphNodes.map((node) => {
      let isVisited = simulation.activeNodeIds.includes(node.id);
      let isCurrent = simulation.currentNodeId === node.id;

      if (
        node.type === "db_ref" ||
        node.type === "vector_db_ref" ||
        node.type === "redis-cache"
      ) {
        const activeEndpointIds = simulation.trace
          .slice(0, simulation.activeIndex + 1)
          .filter((t) => t.kind === "endpoint")
          .map((t) => t.id);

        const connectedToActive = edges.some((edge) => {
          if (
            edge.target === node.id &&
            simulation.activeNodeIds.includes(edge.source)
          ) {
            if (edge.sourceHandle?.startsWith("endpoint-out-")) {
              const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
              return activeEndpointIds.includes(endpointId);
            }
            return true;
          }
          if (
            edge.source === node.id &&
            simulation.activeNodeIds.includes(edge.target)
          ) {
            return true;
          }
          return false;
        });
        if (connectedToActive) isVisited = true;

        const currentEndpointIds =
          simulation.trace[simulation.activeIndex]?.kind === "endpoint"
            ? [simulation.trace[simulation.activeIndex]?.id]
            : [];

        const connectedToCurrent = edges.some((edge) => {
          if (
            edge.target === node.id &&
            simulation.currentNodeId === edge.source
          ) {
            if (edge.sourceHandle?.startsWith("endpoint-out-")) {
              const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
              return currentEndpointIds.includes(endpointId);
            }
            return true;
          }
          if (
            edge.source === node.id &&
            simulation.currentNodeId === edge.target
          ) {
            return true;
          }
          return false;
        });
        if (connectedToCurrent) isCurrent = true;
      }

      return {
        ...node,
        style: {
          ...node.style,
          zIndex: node.zIndex,
          opacity: !isVisited ? 0.14 : 1,
          transition: "opacity 180ms ease, filter 180ms ease",
          filter: isCurrent
            ? "drop-shadow(0 0 8px hsl(var(--primary)))"
            : undefined,
        },
      };
    });
  }, [sortedGraphNodes, simulation.status, simulation.activeNodeIds, simulation.currentNodeId, simulation.trace, simulation.activeIndex, edges]);


  const selectedCaseEntry = testCases.find(
    (testCase) => testCase.id === selectedCaseId,
  );

  React.useEffect(() => {
    if (!selectedCaseEntry && testCases[0]) {
      selectTestCase(testCases[0].id);
    }
  }, [testCases.length, selectedCaseId, selectedCaseEntry, selectTestCase]);

  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={visualGraphNodes}
        edges={visualGraphEdges}
        fitView
        fitViewOptions={React.useMemo(
          () => ({
            padding: 0.35,
            maxZoom: 0.65,
            nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
          }),
          [flowNodesToFit],
        )}
        elevateEdgesOnSelect={true}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_event: React.MouseEvent, node: Node) => {
          setLastActiveNodeId(node.id);
        }}
        onNodeDragStart={(_event: React.MouseEvent, node: Node) => {
          handleNodeDragStart();
          if (node?.id) {
            setLastActiveNodeId(node.id);
          }
        }}
        onSelectionDragStart={(_event: React.MouseEvent, selectionNodes: Node[]) => {
          handleSelectionDragStart();
          if (selectionNodes && selectionNodes[0]?.id) {
            setLastActiveNodeId(selectionNodes[0].id);
          }
        }}
        deleteKeyCode={["Delete"]}
        onBeforeDelete={async () => {
          const activeEl = typeof document !== "undefined" ? document.activeElement : null;
          if (
            activeEl instanceof HTMLElement &&
            (activeEl.tagName === "INPUT" ||
              activeEl.tagName === "TEXTAREA" ||
              activeEl.tagName === "SELECT" ||
              activeEl.isContentEditable ||
              Boolean(
                activeEl.closest(
                  "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [data-inspector], .inspector-sidebar, .nodrag"
                )
              ))
          ) {
            return false;
          }
          return true;
        }}
        onConnect={onConnect}
        isValidConnection={(connection: Connection) => {
          const src = nodes.find((n) => n.id === connection.source);
          const tgt = nodes.find((n) => n.id === connection.target);
          if (!src || !tgt) return false;
          return isValidConnection(
            src.type,
            connection.sourceHandle,
            tgt.type,
            connection.targetHandle,
          ).valid;
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onMoveEnd={handleMoveEnd}
        attributionPosition="bottom-right"
        minZoom={0.01}
        maxZoom={3}
      >
        <Background gap={12} size={1} />
        <Controls
          position="bottom-left"
          fitViewOptions={React.useMemo(
            () => ({
              padding: 0.35,
              maxZoom: 0.65,
            }),
            [],
          )}
          style={{
            bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
            left: paletteOpen ? `${paletteWidth + 14}px` : "16px",
            transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
        <MiniMap
          position="bottom-right"
          style={{
            bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
            right: isConfigOpen
              ? `${effectiveConfigWidth + 16}px`
              : aiPanelOpen
                ? `${aiPanelWidth + 16}px`
                : "16px",
            transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
        <TopToolbarPanel
          onLayout={handleLayout}
          projectId={projectId}
          projectName={projectName}
        />
      </ReactFlow>

      <TestCaseDialogs
        projectId={projectId}
        caseNameDialog={caseNameDialog}
        setCaseNameDialog={setCaseNameDialog}
        deleteCaseOpen={deleteCaseOpen}
        setDeleteCaseOpen={setDeleteCaseOpen}
      />
    </div>
  );
}
