import React, { useState, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Connection,
  useReactFlow,
  Node,
} from "@xyflow/react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useSidebarStore, getEffectiveConfigSidebarWidth } from "@/lib/stores/sidebarStore";
import { nodeTypes } from "../backend-nodes/Nodes";
import { canvasEdgeTypes } from "../backend-nodes/CustomEdges";
import { isValidConnection, WebAppZone, PageSection, type BackendEdge } from "@workspace/canvas";
import { useCanvasHandlers } from "../hooks/useCanvasHandlers";
import { useGraphAutoLayout, getGraphFlowNodes } from "../hooks/useAutoLayout";
import { useAutoLayoutShortcut } from "../hooks/useAutoLayoutShortcut";
import { TopToolbarPanel } from "./TopToolbarPanel";
import { TestCaseDialogs } from "./TestCaseDialogs";
import { GraphControls } from "./GraphControls";
import { useSmoothWheelZoom } from "./useSmoothWheelZoom";
import { useSmoothPan } from "./useSmoothPan";
import { sortZonePages } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/nodes/gateway/web-page";
import { buildServiceStepHandMap } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/common";
import { healDirectTransformerEdges, resolveWebPageActionInboundHandle } from "@/lib/stores/backendCanvas/edge/handlers/transformerConnect";
import { healOrphanedWebPageEdges } from "@/lib/stores/backendCanvas/edge/handlers/healOrphanedWebPageEdges";

// canvasEdgeTypes is imported from CustomEdges

export interface GraphViewProps {
  projectId: string;
  projectName?: string;
}

export function GraphView({ projectId, projectName }: GraphViewProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const onEdgesChange = useBackendCanvasStore((s) => s.onEdgesChange);
  const onConnect = useBackendCanvasStore((s) => s.onConnect);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  // Run legacy edge self-healing once on initial load (not on every drag or node movement)
  const hasRunInitialHealRef = useRef(false);
  useEffect(() => {
    if (hasRunInitialHealRef.current || nodes.length === 0) return;
    hasRunInitialHealRef.current = true;
    const hasDirectEdge = edges.some((e) => {
      if (e.type === "transformer-reference" || e.type === "reference") return false;
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      if (!src || !tgt) return false;
      return (
        (src.type === "transformer" && src.data?.scope !== "local" && (tgt.type === "webPage" || tgt.type === "service")) ||
        (tgt.type === "transformer" && tgt.data?.scope !== "local" && (src.type === "webPage" || src.type === "service")) ||
        (src.type === "webPage" && tgt.type === "transformer_ref") ||
        (src.type === "transformer_ref" && tgt.type === "webPage" && e.sourceHandle === "transformer-in")
      );
    });

    const hasInvalidLocalTransformerRef = nodes.some((n) => {
      if (n.type !== "transformer_ref") return false;
      const master = nodes.find(
        (m) =>
          m.id === n.data?.transformerRef ||
          (m.type === "transformer" &&
            (m.data?.functionName === n.data?.transformerRef || m.data?.label === n.data?.transformerRef)),
      );
      return master?.type === "transformer" && master.data?.scope === "local";
    });

    const hasUnconnectedTransformerRef = nodes.some((n) => {
      if (n.type !== "transformer_ref") return false;
      const hasOutgoing = edges.some(
        (e) =>
          e.source === n.id &&
          e.sourceHandle === "transformer-out" &&
          (e.type === "connection" || !e.type),
      );
      const hasIncomingRef = edges.some(
        (e) =>
          e.target === n.id &&
          (e.type === "transformer-reference" || e.type === "reference"),
      );
      return !hasOutgoing || !hasIncomingRef;
    });

    if (hasDirectEdge || hasUnconnectedTransformerRef || hasInvalidLocalTransformerRef) {
      const store = useBackendCanvasStore.getState();
      const healed = healDirectTransformerEdges({
        nodes: store.nodes,
        edges: store.edges,
        pendingEdgeRemovals: store.pendingEdgeRemovals,
        pendingEdgeUpserts: store.pendingEdgeUpserts,
        pendingNodeUpserts: store.pendingNodeUpserts,
        pendingNodeRemovals: store.pendingNodeRemovals,
      });
      if (healed.changed) {
        useBackendCanvasStore.setState({
          nodes: healed.nodes,
          edges: healed.edges,
          pendingEdgeRemovals: healed.pendingEdgeRemovals,
          pendingEdgeUpserts: healed.pendingEdgeUpserts,
          pendingNodeUpserts: healed.pendingNodeUpserts,
          pendingNodeRemovals: healed.pendingNodeRemovals,
        });
      }
    }
  }, [nodes.length, edges.length]);

  const simulationStatus = useSimulationStore((s) => s.status);
  const activeNodeIds = useSimulationStore((s) => s.activeNodeIds);
  const activeEdgeIds = useSimulationStore((s) => s.activeEdgeIds);
  const currentNodeId = useSimulationStore((s) => s.currentNodeId);
  const simulationTrace = useSimulationStore((s) => s.trace);
  const simulationActiveIndex = useSimulationStore((s) => s.activeIndex);
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

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    handleNodesChange,
    handleNodeDragStart,
    handleSelectionDragStart,
    handleMoveEnd,
  } = useCanvasHandlers(projectId, "graph");
  const { fitView, setViewport, zoomIn, zoomOut } = useReactFlow();

  useSmoothWheelZoom({
    containerRef,
    minZoom: 0.01,
    maxZoom: 3,
    onMoveEnd: handleMoveEnd,
  });

  useSmoothPan({
    containerRef,
    onMoveEnd: handleMoveEnd,
  });

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

  const webPageNodeIdsSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.type === "webPage") set.add(n.id);
    }
    return set;
  }, [nodes]);

  const validWebPageActionKeys = React.useMemo(() => {
    const keys = new Set<string>();
    nodes.forEach((n) => {
      if (n.type === "webPage") {
        const sections: PageSection[] = Array.isArray(n.data?.sections) ? n.data.sections : [];
        sections.forEach((s) => {
          (s.actions || []).forEach((act) => {
            if (act?.id) keys.add(`${n.id}::${act.id}`);
          });
        });
        (n.data?.events || []).forEach((act: { id?: string }) => {
          if (act?.id) keys.add(`${n.id}::${act.id}`);
        });
      }
    });
    return keys;
  }, [nodes]);

  const validWebPageRealtimeKeys = React.useMemo(() => {
    const keys = new Set<string>();
    nodes.forEach((n) => {
      if (n.type === "webPage") {
        const conns = Array.isArray(n.data?.realtimeConnections) ? n.data.realtimeConnections : [];
        conns.forEach((c: { id?: string }) => {
          if (c?.id) keys.add(`${n.id}::${c.id}`);
        });
      }
    });
    return keys;
  }, [nodes]);

  // Auto-heal orphaned edges connected to WebPage nodes whose handles were removed
  useEffect(() => {
    if (nodes.length === 0) return;
    const store = useBackendCanvasStore.getState();
    const orphanedWp = healOrphanedWebPageEdges({
      nodes: store.nodes,
      edges: store.edges,
      pendingEdgeRemovals: store.pendingEdgeRemovals,
      pendingEdgeUpserts: store.pendingEdgeUpserts,
      pendingNodeUpserts: store.pendingNodeUpserts,
    });
    if (orphanedWp.changed) {
      useBackendCanvasStore.setState({
        nodes: orphanedWp.nodes,
        edges: orphanedWp.edges,
        pendingEdgeRemovals: orphanedWp.pendingEdgeRemovals,
        pendingEdgeUpserts: orphanedWp.pendingEdgeUpserts,
        pendingNodeUpserts: orphanedWp.pendingNodeUpserts,
      });
    }
  }, [edges, validWebPageActionKeys, validWebPageRealtimeKeys]);

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

      if (
        e.targetHandle &&
        /^(?:event-in-|pageload-in-|mount-in-|onmount-in-|unmount-in-|interval-in-|effect-in-|sse-in-|websocket-in-|webrtc-in-)/.test(
          e.targetHandle,
        )
      ) {
        const actId = e.targetHandle.replace(
          /^(?:event-in-|pageload-in-|mount-in-|onmount-in-|unmount-in-|interval-in-|effect-in-|sse-in-|websocket-in-|webrtc-in-)/,
          "",
        );
        if (webPageNodeIdsSet.has(e.target) && !validWebPageActionKeys.has(`${e.target}::${actId}`)) {
          return false;
        }
      }

      if (e.sourceHandle?.startsWith("events-")) {
        const actId = e.sourceHandle.replace(/^events-/, "");
        if (webPageNodeIdsSet.has(e.source) && !validWebPageActionKeys.has(`${e.source}::${actId}`)) {
          return false;
        }
      }

      if (
        e.targetHandle &&
        (e.targetHandle.startsWith("rtc-in-") || e.targetHandle.startsWith("rtc-right-in-"))
      ) {
        const rtcId = e.targetHandle.replace(/^(?:rtc-in-|rtc-right-in-)/, "");
        if (webPageNodeIdsSet.has(e.target) && !validWebPageRealtimeKeys.has(`${e.target}::${rtcId}`)) {
          return false;
        }
      }

      if (e.sourceHandle?.startsWith("rtc-out-")) {
        const rtcId = e.sourceHandle.replace(/^rtc-out-/, "");
        if (webPageNodeIdsSet.has(e.source) && !validWebPageRealtimeKeys.has(`${e.source}::${rtcId}`)) {
          return false;
        }
      }

      return true;
    });
  }, [edges, graphNodeIds, validEndpointKeys, validEventKeys, validWebPageActionKeys, validWebPageRealtimeKeys, webPageNodeIdsSet]);

  const selectedNodeIdSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.selected) set.add(n.id);
    }
    const actId = activeConfigItem?.nodeId || activeConfigItem?.id;
    if (actId) set.add(actId);
    return set;
  }, [nodes, activeConfigItem]);

  const activeUpstreamSourceIds = React.useMemo(() => {
    const actId = activeConfigItem?.nodeId || activeConfigItem?.id;
    if (!actId) return new Set<string>();
    const sources = new Set<string>();
    for (const e of edges) {
      if (e.source === actId) {
        sources.add(e.target);
      }
    }
    return sources;
  }, [edges, activeConfigItem]);

  const visualGraphEdges = React.useMemo(() => {
    const hasRun = simulationStatus !== "idle";
    const visitedTrace = hasRun ? simulationTrace.slice(0, simulationActiveIndex + 1) : [];
    const visitedEdgeSet = hasRun
      ? new Set([
          ...activeEdgeIds,
          ...visitedTrace.filter((t) => t.edgeId).map((t) => t.edgeId!),
        ])
      : null;

    return graphEdges.map((e) => {
      const edge = e as BackendEdge & {
        selected?: boolean;
        className?: string;
        style?: React.CSSProperties;
      };

      const isRefEdge =
        edge.type === "transformer-reference" ||
        edge.type === "reference" ||
        edge.type === "storage-reference" ||
        edge.type === "page-reference" ||
        edge.type === "type-reference";

      const isExtension = edge.type === "type-reference" && Boolean(edge.data?.isExtensionEdge);

      let isVisible = true;
      if (isRefEdge && !isExtension) {
        const isConnectedSelected =
          selectedNodeIdSet.has(edge.source) ||
          selectedNodeIdSet.has(edge.target) ||
          activeUpstreamSourceIds.has(edge.source) ||
          Boolean(edge.selected);
        isVisible = isConnectedSelected;
      }

      const isSimulationInactive = Boolean(
        hasRun && visitedEdgeSet && !visitedEdgeSet.has(edge.id),
      );

      const isInactiveOrInvisible = !isVisible || isSimulationInactive;

      const zIndex =
        webPageNodeIdsSet.has(edge.source) || webPageNodeIdsSet.has(edge.target)
          ? 50
          : edge.zIndex;

      if (isInactiveOrInvisible) {
        return {
          ...edge,
          zIndex,
          hidden: !isVisible,
          selectable: false,
          focusable: false,
          interactionWidth: 0,
          className: `${edge.className || ""} pointer-events-none`.trim(),
          style: {
            ...edge.style,
            pointerEvents: "none" as const,
            opacity: !isVisible ? 0 : 0.08,
          },
        };
      }

      if (isRefEdge && !isExtension) {
        return {
          ...edge,
          zIndex,
          hidden: false,
          selectable: false,
          interactionWidth: 0,
          className: `${edge.className || ""} pointer-events-none`.trim(),
          style: {
            ...edge.style,
            pointerEvents: "none" as const,
          },
        };
      }

      if (zIndex !== edge.zIndex) {
        return {
          ...edge,
          zIndex,
        };
      }

      return edge;
    });
  }, [
    graphEdges,
    webPageNodeIdsSet,
    selectedNodeIdSet,
    activeUpstreamSourceIds,
    simulationStatus,
    simulationTrace,
    simulationActiveIndex,
    activeEdgeIds,
  ]);

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
  const lastProjectIdRef = useRef(projectId);
  if (lastProjectIdRef.current !== projectId) {
    lastProjectIdRef.current = projectId;
    hasFitted.current = false;
  }
  useEffect(() => {
    if (graphNodes.length > 0 && !hasFitted.current) {
      hasFitted.current = true;
      const savedViewport = localStorage.getItem(`canvas_viewport_${projectId}_graph`);
      if (savedViewport) {
        try {
          const parsed = JSON.parse(savedViewport);
          setViewport(parsed);
          return;
        } catch {
          // fallback to fitView
        }
      }
      // Immediate attempt
      fitView({
        nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
        duration: 0,
        padding: 0.35,
        maxZoom: 0.65,
      });
      // Second attempt after custom node DOM components have finished layout and measurement
      const timer = setTimeout(() => {
        fitView({
          nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
          duration: 200,
          padding: 0.35,
          maxZoom: 0.65,
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [graphNodes.length, flowNodesToFit, fitView, setViewport, projectId]);



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

    // 2. Build map of stacked hand info for all Service Step nodes per Service node endpoint
    const stepHandMap = buildServiceStepHandMap(graphNodes, graphEdges);

    const nodesWithZ = graphNodes.map((node) => {
      const isSelected = Boolean(node.selected);
      const isDragging = Boolean(node.dragging);
      const isActiveConfig = Boolean(
        activeConfigItem &&
          (activeConfigItem.nodeId === node.id || activeConfigItem.id === node.id),
      );
      const isLastActive = node.id === lastActiveNodeId;
      const isActive = isSelected || isDragging || isLastActive;

      const hand = pageHandMap.get(node.id) || stepHandMap.get(node.id);
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

      // Tie-breaker for stacked cards within the same zone hand or service step hand:
      const aHand = pageHandMap.get(a.id) || stepHandMap.get(a.id);
      const bHand = pageHandMap.get(b.id) || stepHandMap.get(b.id);
      if (aHand?.isStacked && bHand?.isStacked) {
        return aHand.cardIndex - bHand.cardIndex;
      }

      return 0;
    });
  }, [graphNodes, graphEdges, activeConfigItem, lastActiveNodeId]);

  const visualGraphNodes = React.useMemo(() => {
    const hasRun = simulationStatus !== "idle";
    if (!hasRun) {
      return sortedGraphNodes;
    }

    const activeNodeSet = new Set(activeNodeIds);
    const activeEndpointIds = new Set(
      simulationTrace
        .slice(0, simulationActiveIndex + 1)
        .filter((t) => t.kind === "endpoint")
        .map((t) => t.id),
    );
    const currentEndpointId =
      simulationTrace[simulationActiveIndex]?.kind === "endpoint"
        ? simulationTrace[simulationActiveIndex]?.id
        : null;

    return sortedGraphNodes.map((node) => {
      let isVisited = activeNodeSet.has(node.id);
      let isCurrent = currentNodeId === node.id;

      if (
        node.type === "db_ref" ||
        node.type === "vector_db_ref" ||
        node.type === "redis-cache"
      ) {
        const connectedToActive = edges.some((edge) => {
          if (
            edge.target === node.id &&
            activeNodeSet.has(edge.source)
          ) {
            if (edge.sourceHandle?.startsWith("endpoint-out-")) {
              const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
              return activeEndpointIds.has(endpointId);
            }
            return true;
          }
          if (
            edge.source === node.id &&
            activeNodeSet.has(edge.target)
          ) {
            return true;
          }
          return false;
        });
        if (connectedToActive) isVisited = true;

        const connectedToCurrent = edges.some((edge) => {
          if (
            edge.target === node.id &&
            currentNodeId === edge.source
          ) {
            if (edge.sourceHandle?.startsWith("endpoint-out-")) {
              const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
              return currentEndpointId === endpointId;
            }
            return true;
          }
          if (
            edge.source === node.id &&
            currentNodeId === edge.target
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
  }, [
    sortedGraphNodes,
    simulationStatus,
    activeNodeIds,
    currentNodeId,
    simulationTrace,
    simulationActiveIndex,
    edges,
  ]);

  const selectedCaseEntry = testCases.find(
    (testCase) => testCase.id === selectedCaseId,
  );

  React.useEffect(() => {
    if (!selectedCaseEntry && testCases[0]) {
      selectTestCase(testCases[0].id);
    }
  }, [testCases.length, selectedCaseId, selectedCaseEntry, selectTestCase]);

  const fitViewOptions = React.useMemo(
    () => ({
      padding: 0.35,
      maxZoom: 0.65,
      nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
    }),
    [flowNodesToFit],
  );

  const handleIsValidConnection = React.useCallback(
    (connection: Connection) => {
      const currentNodes = useBackendCanvasStore.getState().nodes;
      const src = currentNodes.find((n) => n.id === connection.source);
      const tgt = currentNodes.find((n) => n.id === connection.target);
      if (!src || !tgt) return false;
      return isValidConnection(
        src.type,
        connection.sourceHandle,
        tgt.type,
        connection.targetHandle,
      ).valid;
    },
    [],
  );

  // Keyboard shortcuts for smooth zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn({ duration: 250 });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        zoomOut({ duration: 250 });
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        fitView({
          nodes: flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
          duration: 350,
          padding: 0.35,
          maxZoom: 0.65,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, fitView, flowNodesToFit]);

  return (
    <div ref={containerRef} className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={visualGraphNodes}
        edges={visualGraphEdges}
        fitView
        fitViewOptions={fitViewOptions}
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
        isValidConnection={handleIsValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={canvasEdgeTypes}
        onMoveEnd={handleMoveEnd}
        attributionPosition="bottom-right"
        minZoom={0.01}
        maxZoom={3}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        onDoubleClick={(event: React.MouseEvent) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.classList.contains("react-flow__pane")
          ) {
            zoomIn({ duration: 300 });
          }
        }}
      >
        <Background gap={12} size={1} />
        <GraphControls
          minZoom={0.01}
          maxZoom={3}
          flowNodesToFit={flowNodesToFit}
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
