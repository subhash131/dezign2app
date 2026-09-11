import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_ZONES,
} from "@workspace/canvas/constants";
import { getUniqueNodeLabel } from "@workspace/canvas";
import type { PageSection } from "@workspace/canvas/types";
import { generateKeyBetween } from "fractional-indexing";
import { BackendCanvasState, EndpointWithNode } from "../types";
import { getLastIndex } from "../utils";
import { PreparedNodeResult } from "./types";

/**
 * Prepares and allocates ports, default endpoints, child web pages, and fractional indices
 * for a newly added node.
 */
export function prepareNodeForAddition(
  nodeWithoutIndex: Omit<BackendNode, "fractionalIndex">,
  currentState: BackendCanvasState,
): PreparedNodeResult {
  let finalNode = nodeWithoutIndex;

  // 1. Ensure unique entity/database labels
  if (
    (nodeWithoutIndex.type === "entity" || nodeWithoutIndex.type === "database") &&
    nodeWithoutIndex.data?.label
  ) {
    const uniqueLabel = getUniqueNodeLabel(
      currentState.nodes,
      nodeWithoutIndex.data.label,
      nodeWithoutIndex.type,
    );
    finalNode = {
      ...finalNode,
      data: {
        ...finalNode.data,
        label: uniqueLabel,
      },
    };
  }

  // 2. Service port allocation (HTTP and gRPC)
  if (nodeWithoutIndex.type === "service") {
    let nextPort = 8080;
    let nextGrpcPort = 50051;

    if (!nodeWithoutIndex.data?.port) {
      const existingPorts = new Set(
        currentState.nodes
          .filter((n) => n.type === "service")
          .map((n) => parseInt(String(n.data?.port || "8080"), 10))
          .filter((p) => !isNaN(p)),
      );
      while (existingPorts.has(nextPort)) {
        nextPort++;
      }
    }

    if (!nodeWithoutIndex.data?.grpcPort) {
      const existingGrpcPorts = new Set(
        currentState.nodes
          .filter((n) => n.type === "service")
          .map((n) => parseInt(String(n.data?.grpcPort || "50051"), 10))
          .filter((p) => !isNaN(p)),
      );
      while (existingGrpcPorts.has(nextGrpcPort)) {
        nextGrpcPort++;
      }
    }

    finalNode = {
      ...finalNode,
      data: {
        ...finalNode.data,
        port: nodeWithoutIndex.data?.port || String(nextPort),
        grpcPort: nodeWithoutIndex.data?.grpcPort || String(nextGrpcPort),
      },
    };
  }

  // 3. WebApp port allocation and slug derivation
  if (nodeWithoutIndex.type === "webApp") {
    let nextPort = 3000;
    if (!nodeWithoutIndex.data?.port) {
      const existingPorts = new Set(
        currentState.nodes
          .filter((n) => n.type === "webApp")
          .map((n) => parseInt(String(n.data?.port || "3000"), 10))
          .filter((p) => !isNaN(p)),
      );
      while (existingPorts.has(nextPort)) {
        nextPort++;
      }
    }

    const existingWebApps = currentState.nodes.filter((n) => n.type === "webApp");
    const count = existingWebApps.length;
    const defaultLabel = count === 0 ? "Web App" : `Web App ${count + 1}`;
    const effectiveLabel =
      nodeWithoutIndex.data?.label !== undefined
        ? nodeWithoutIndex.data.label
        : defaultLabel;
    const effectiveSlug =
      nodeWithoutIndex.data?.appSlug ||
      (effectiveLabel
        ? effectiveLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        : `web-app-${nextPort}`);

    finalNode = {
      ...finalNode,
      data: {
        zones: DEFAULT_ZONES,
        ...finalNode.data,
        label: effectiveLabel,
        appSlug: effectiveSlug,
        port: nodeWithoutIndex.data?.port || String(nextPort),
      },
    };
  }

  // 4. Fractional index assignment
  const lastNodeIndex = getLastIndex(currentState.nodes);
  const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
  const node: BackendNode = { ...finalNode, fractionalIndex, selected: true };

  let nextNodes: BackendNode[] = [
    ...currentState.nodes.map((n) => ({ ...n, selected: false })),
    node,
  ];
  let nextPendingNodes: BackendNode[] = [
    ...currentState.pendingNodeUpserts,
    node,
  ];
  let nextEdges: BackendEdge[] = currentState.edges;
  let nextPendingEdges: BackendEdge[] = currentState.pendingEdgeUpserts;

  // 5. Default web pages and edges for webApp
  if (node.type === "webApp" && !node.data?.skipDefaultPages) {
    const baseX = node.position?.x ?? 300;
    const baseY = node.position?.y ?? 200;
    const appSlug = node.data?.appSlug || "web-app";

    const rootPageId = crypto.randomUUID();
    const notFoundPageId = crypto.randomUUID();

    let lastIdx = fractionalIndex;
    const rootIndex = generateKeyBetween(lastIdx, null);
    lastIdx = rootIndex;
    const notFoundIndex = generateKeyBetween(lastIdx, null);

    const rootPageNode: BackendNode = {
      id: rootPageId,
      type: "webPage",
      position: { x: baseX + 400, y: baseY },
      fractionalIndex: rootIndex,
      selected: false,
      data: {
        label: "/",
        isRoot: true,
        appSlug,
        description: "Default landing page",
        useZoneDefault: true,
        sections: [
          {
            id: `sec-${Date.now()}-1`,
            name: "Main Section",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [
              {
                id: `evt-${Date.now()}-1`,
                name: "pageLoad",
                event: "pageLoad",
              },
            ],
          } satisfies PageSection,
        ],
      },
    };

    const notFoundPageNode: BackendNode = {
      id: notFoundPageId,
      type: "webPage",
      position: { x: baseX + 400, y: baseY + 200 },
      fractionalIndex: notFoundIndex,
      selected: false,
      data: {
        label: "/not-found",
        appSlug,
        description: "Default 404 not found page",
        useZoneDefault: true,
        sections: [
          {
            id: `sec-${Date.now()}-2`,
            name: "Navigation",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: `evt-${Date.now()}-2`,
                name: "Back to Home",
                event: "navigateToPage",
                targetRoute: "/",
                targetPageId: rootPageId,
              },
            ],
          } satisfies PageSection,
        ],
      },
    };

    let lastEdgeIdx = getLastIndex(nextEdges);
    const edge1Idx = generateKeyBetween(lastEdgeIdx, null);
    lastEdgeIdx = edge1Idx;
    const edge2Idx = generateKeyBetween(lastEdgeIdx, null);

    const edge1: BackendEdge = {
      id: `edge-${node.id}-public-in-${rootPageId}-page-in`,
      source: node.id,
      sourceHandle: "public-in",
      target: rootPageId,
      targetHandle: "page-in",
      type: "connection",
      fractionalIndex: edge1Idx,
    };

    const edge2: BackendEdge = {
      id: `edge-${node.id}-public-in-${notFoundPageId}-page-in`,
      source: node.id,
      sourceHandle: "public-in",
      target: notFoundPageId,
      targetHandle: "page-in",
      type: "connection",
      fractionalIndex: edge2Idx,
    };

    nextNodes = [...nextNodes, rootPageNode, notFoundPageNode];
    nextPendingNodes = [...nextPendingNodes, rootPageNode, notFoundPageNode];
    nextEdges = [...nextEdges, edge1, edge2];
    nextPendingEdges = [...nextPendingEdges, edge1, edge2];
  }

  // 6. Default endpoint for service / external
  let nextEndpoints = currentState.endpoints;
  let pendingEndpoints = currentState.pendingEndpointUpserts;
  if (node.type === "service" || node.type === "external") {
    const existingEndpoints = nextEndpoints.filter((e) => e.nodeId === node.id);
    if (existingEndpoints.length === 0) {
      const isExt = node.type === "external";
      const defaultEp: EndpointWithNode = {
        id: crypto.randomUUID(),
        nodeId: node.id,
        name: isExt ? "/v1/resource" : "/health",
        type: isExt ? "POST" : "GET",
        summary: isExt ? "External API action" : "Health check",
        businessLogic: isExt ? "External API call" : "Test the health of the server",
        responseFields: [],
      };
      nextEndpoints = [...nextEndpoints, defaultEp];
      pendingEndpoints = [...pendingEndpoints, defaultEp];
    }
  }

  return {
    nodes: nextNodes,
    edges: nextEdges,
    endpoints: nextEndpoints,
    pendingNodes: nextPendingNodes,
    pendingEdges: nextPendingEdges,
    pendingEndpoints: pendingEndpoints,
  };
}

/**
 * Creates an entity table node with a default primary key column.
 */
export function createTableNode(
  parentId: string | undefined,
  position: { x: number; y: number } | undefined,
  currentState: BackendCanvasState,
): { node: BackendNode; nextNodes: BackendNode[]; nextPendingNodes: BackendNode[] } {
  const lastNodeIndex = getLastIndex(currentState.nodes);
  const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
  const node: BackendNode = {
    id: crypto.randomUUID(),
    type: "entity",
    position: position || { x: 100, y: 100 },
    parentId,
    fractionalIndex,
    data: {
      label: "",
      columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
    },
    selected: true,
  };
  const nextNodes = [...currentState.nodes.map((n) => ({ ...n, selected: false })), node];
  const nextPendingNodes = [...currentState.pendingNodeUpserts, node];
  return { node, nextNodes, nextPendingNodes };
}

/**
 * Creates a LangGraph step node with default model configuration.
 */
export function createLangGraphStepNode(
  parentId: string,
  position: { x: number; y: number } | undefined,
  name: string | undefined,
  stepType: BackendNode["data"]["stepType"] | undefined,
  currentState: BackendCanvasState,
): { node: BackendNode; nextNodes: BackendNode[]; nextPendingNodes: BackendNode[] } {
  const existingCount = currentState.nodes.filter((n) => n.parentId === parentId).length;
  const defaultPos = position || { x: 40 + existingCount * 220, y: 120 };
  const lastNodeIndex = getLastIndex(currentState.nodes);
  const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
  const stepId = `step_${Date.now().toString(36).slice(-4)}`;
  const stepName = name || "";

  const node: BackendNode = {
    id: crypto.randomUUID(),
    type: "langgraph_step",
    position: defaultPos,
    parentId,
    fractionalIndex,
    data: {
      label: stepName,
      stepId,
      stepType: stepType || "llm_call",
      modelConfig: {
        provider: DEFAULT_LLM_PROVIDER,
        model: DEFAULT_LLM_MODEL,
        temperature: DEFAULT_LLM_TEMPERATURE,
      },
    },
    selected: true,
  };

  const nextNodes = [...currentState.nodes.map((n) => ({ ...n, selected: false })), node];
  const nextPendingNodes = [...currentState.pendingNodeUpserts, node];
  return { node, nextNodes, nextPendingNodes };
}
