import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  type LayoutNode,
  type LayoutEdge,
  type PositionNodeChange,
  type UseAutoLayoutOptions,
  type UseGraphAutoLayoutOptions,
  type UseSchemaAutoLayoutOptions,
  type UseLangGraphAutoLayoutOptions,
  type LayoutNodeLike,
  type LayoutEdgeLike,
} from "./auto-layout/types";

import { performSchemaLayout } from "./auto-layout/schemaLayout";
import { performGraphLayout, getGraphFlowNodes } from "./auto-layout/graphLayout";
import { performLangGraphLayout, getLangGraphFlowNodes } from "./auto-layout/langGraphLayout";

export { getLangGraphFlowNodes, getGraphFlowNodes };

export type {
  LayoutNode,
  LayoutEdge,
  PositionNodeChange,
  UseAutoLayoutOptions,
  UseGraphAutoLayoutOptions,
  UseSchemaAutoLayoutOptions,
  UseLangGraphAutoLayoutOptions,
  LayoutNodeLike,
  LayoutEdgeLike,
};

/**
 * Dedicated Auto Layout Hook for Schema View (Database & Entity Tables)
 */
export function useSchemaAutoLayout(options?: UseSchemaAutoLayoutOptions) {
  const { fitView } = useReactFlow();

  const handleLayout = useCallback(
    (direction: string = "LR") => {
      const currentStore = useBackendCanvasStore.getState();
      const nodes: LayoutNode[] =
        options?.nodes ??
        currentStore.nodes.filter(
          (n) =>
            n.type === "entity" ||
            n.type === "database" ||
            n.type === "redis_instance" ||
            n.type === "redis_schema" ||
            n.type === "group",
        );
      const edges: LayoutEdge[] =
        options?.edges && options.edges.length > 0
          ? options.edges
          : currentStore.edges.filter(
              (e) =>
                e.type === "foreign-key" ||
                e.type === "database-connection" ||
                e.type === "connection",
            );
      const onNodesChange = options?.onNodesChange ?? currentStore.onNodesChange;

      performSchemaLayout({
        nodes,
        edges,
        onNodesChange,
        fitView,
        direction,
      });
    },
    [options?.nodes, options?.edges, options?.onNodesChange, fitView],
  );

  return { handleLayout };
}

/**
 * Dedicated Auto Layout Hook for Canvas Graph View (Services, Microservices, Gateways, Queues, etc.)
 */
export function useGraphAutoLayout(options?: UseGraphAutoLayoutOptions) {
  const { fitView } = useReactFlow();

  const handleLayout = useCallback(
    (direction: string = "LR") => {
      const currentStore = useBackendCanvasStore.getState();
      const nodes: LayoutNode[] =
        options?.nodes ??
        currentStore.nodes.filter(
          (n) =>
            n.type !== "group" &&
            n.type !== "entity" &&
            n.type !== "database" &&
            n.type !== "redis_instance" &&
            n.type !== "redis_schema",
        );
      const edges: LayoutEdge[] =
        options?.edges ??
        currentStore.edges.filter(
          (e) =>
            e.type !== "database-connection" &&
            e.type !== "foreign-key" &&
            e.type !== "transformer-reference" &&
            e.type !== "storage-reference" &&
            e.type !== "reference",
        );
      const onNodesChange = options?.onNodesChange ?? currentStore.onNodesChange;

      const storeEndpoints = currentStore.endpoints;
      const storeEvents = [...currentStore.events];
      currentStore.endpoints.forEach((ep) => {
        ep.publishedEvents?.forEach((pev) => {
          storeEvents.push({ ...pev, nodeId: ep.nodeId, variant: "publish" as const });
        });
      });

      performGraphLayout({
        nodes,
        edges,
        onNodesChange,
        fitView,
        direction,
        storeEndpoints,
        storeEvents,
      });
    },
    [options?.nodes, options?.edges, options?.onNodesChange, fitView],
  );

  const panToFlow = useCallback(
    (fitOptions?: { duration?: number; padding?: number; maxZoom?: number }) => {
      const currentStore = useBackendCanvasStore.getState();
      const nodes: LayoutNode[] =
        options?.nodes ??
        currentStore.nodes.filter(
          (n) =>
            n.type !== "group" &&
            n.type !== "entity" &&
            n.type !== "database" &&
            n.type !== "redis_instance" &&
            n.type !== "redis_schema",
        );
      const edges: LayoutEdge[] =
        options?.edges ??
        currentStore.edges.filter(
          (e) =>
            e.type !== "database-connection" &&
            e.type !== "foreign-key" &&
            e.type !== "transformer-reference" &&
            e.type !== "storage-reference" &&
            e.type !== "reference",
        );
      const flowNodes = getGraphFlowNodes(nodes, edges);
      const targetNodes = flowNodes.length > 0 ? flowNodes : nodes;
      fitView({
        nodes: targetNodes.map((n) => ({ id: n.id })),
        duration: fitOptions?.duration ?? 300,
        padding: fitOptions?.padding ?? 0.2,
        maxZoom: fitOptions?.maxZoom ?? 0.85,
      });
    },
    [options?.nodes, options?.edges, fitView],
  );

  return { handleLayout, panToFlow };
}

/**
 * Dedicated Auto Layout Hook for LangGraph Studio View
 */
export function useLangGraphAutoLayout<
  TNode extends LayoutNodeLike = LayoutNodeLike,
  TEdge extends LayoutEdgeLike = LayoutEdgeLike,
>(options?: UseLangGraphAutoLayoutOptions<TNode, TEdge>) {
  const { fitView } = useReactFlow();

  const nodes: TNode[] = options?.nodes ?? [];
  const edges: TEdge[] = options?.edges ?? [];
  const onNodesChange = options?.onNodesChange;

  const panToFlow = useCallback(
    (fitOptions?: { duration?: number; padding?: number; maxZoom?: number }) => {
      const flowNodes = getLangGraphFlowNodes(nodes, edges);
      const targetNodes = flowNodes.length > 0 ? flowNodes : nodes;
      fitView({
        nodes: targetNodes.map((n) => ({ id: n.id })),
        duration: fitOptions?.duration ?? 300,
        padding: fitOptions?.padding ?? 0.2,
        maxZoom: fitOptions?.maxZoom ?? 0.85,
      });
    },
    [nodes, edges, fitView],
  );

  const handleLayout = useCallback(
    (direction: string = "LR") => {
      performLangGraphLayout({
        nodes,
        edges,
        onNodesChange,
        fitView,
        direction,
      });
    },
    [nodes, edges, onNodesChange, fitView],
  );

  return { handleLayout, panToFlow };
}

/**
 * Unified Auto Layout Hook with automatic view strategy dispatching
 */
export function useAutoLayout(options?: UseAutoLayoutOptions) {
  const { fitView } = useReactFlow();

  const handleLayout = useCallback(
    (direction: string = "LR") => {
      const currentStore = useBackendCanvasStore.getState();
      const nodes: LayoutNode[] = options?.nodes ?? currentStore.nodes;
      const edges: LayoutEdge[] = options?.edges ?? currentStore.edges;
      const onNodesChange = options?.onNodesChange ?? currentStore.onNodesChange;

      const nonHeadNodes = nodes.filter(
        (n) =>
          n.type !== "api_endpoint" &&
          n.type !== "event_item" &&
          n.type !== "types",
      );

      const isSchemaView =
        options?.layoutType === "schema" ||
        currentStore.canvasView === "schema" ||
        (nonHeadNodes.length > 0 &&
          nonHeadNodes.every(
            (n) =>
              n.type === "entity" ||
              n.type === "database" ||
              n.type === "redis_instance" ||
              n.type === "redis_schema" ||
              n.type === "group",
          ));

      const isLangGraphView =
        options?.layoutType === "langgraph" ||
        nonHeadNodes.some(
          (n) =>
            n.type === "step" ||
            n.type === "langgraph_agent" ||
            n.type === "langgraph_node" ||
            n.type === "start" ||
            n.id === "START" ||
            n.id === "STATE_GLOBAL" ||
            n.id === "CHECKPOINTER" ||
            n.type === "state_global" ||
            n.type === "langgraph_memory",
        );

      if (isSchemaView) {
        performSchemaLayout({
          nodes,
          edges,
          onNodesChange,
          fitView,
          direction,
        });
      } else if (isLangGraphView) {
        performLangGraphLayout({
          nodes,
          edges,
          onNodesChange,
          fitView,
          direction,
        });
      } else {
        const storeEndpoints = currentStore.endpoints;
        const storeEvents = [...currentStore.events];
        currentStore.endpoints.forEach((ep) => {
          ep.publishedEvents?.forEach((pev) => {
            storeEvents.push({ ...pev, nodeId: ep.nodeId, variant: "publish" as const });
          });
        });

        performGraphLayout({
          nodes,
          edges,
          onNodesChange,
          fitView,
          direction,
          storeEndpoints,
          storeEvents,
        });
      }
    },
    [options?.nodes, options?.edges, options?.onNodesChange, options?.layoutType, fitView],
  );

  return { handleLayout };
}
