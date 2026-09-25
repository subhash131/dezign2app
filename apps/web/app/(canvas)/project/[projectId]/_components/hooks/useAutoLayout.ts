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
} from "./auto-layout/types";

import { performSchemaLayout } from "./auto-layout/schemaLayout";
import { performGraphLayout } from "./auto-layout/graphLayout";
import { performLangGraphLayout } from "./auto-layout/langGraphLayout";

export type {
  LayoutNode,
  LayoutEdge,
  PositionNodeChange,
  UseAutoLayoutOptions,
  UseGraphAutoLayoutOptions,
  UseSchemaAutoLayoutOptions,
  UseLangGraphAutoLayoutOptions,
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
            n.type === "redis_schema",
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

  return { handleLayout };
}

/**
 * Dedicated Auto Layout Hook for LangGraph Studio View
 */
export function useLangGraphAutoLayout(options?: UseLangGraphAutoLayoutOptions) {
  const { fitView } = useReactFlow();

  const nodes: LayoutNode[] = options?.nodes ?? [];
  const edges: LayoutEdge[] = options?.edges ?? [];
  const onNodesChange = options?.onNodesChange;

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

  return { handleLayout };
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
              n.type === "redis_schema",
          ));

      const isLangGraphView =
        options?.layoutType === "langgraph" ||
        nonHeadNodes.some(
          (n) =>
            n.type === "step" ||
            n.type === "langgraph_agent" ||
            n.type === "langgraph_node" ||
            n.type === "start" ||
            n.id === "START",
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
