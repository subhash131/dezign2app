import { BackendNode, BackendEdge, CustomTypeItem } from "@/types/canvas";
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_ZONES,
  getDefaultNodeEnvVars,
  createDefaultLangGraphNodeData,
} from "@workspace/canvas/constants";
import { getUniqueNodeLabel } from "@workspace/canvas";
import type { PageSection } from "@workspace/canvas/types";
import { generateKeyBetween } from "fractional-indexing";
import { BackendCanvasState, EndpointWithNode } from "../types";
import { getLastIndex } from "../utils";
import { PreparedNodeResult, NodeCreationCanvasState } from "./types";
import {
  toPascalCase,
  mapColumnsToTypeFields,
  buildCompanionTypesNodeAndEdge,
} from "./nodeEntitySync";
import { buildServiceTypesNodeAndEdge } from "./serviceEndpointTypesSync";
import { buildLangGraphTypesNodeAndEdge } from "./langGraphTypesSync";
import { createDefaultHealthEndpoint } from "@/lib/utils/healthCheckEndpoint";

/**
 * Prepares and allocates ports, default endpoints, child web pages, and fractional indices
 * for a newly added node.
 */
export function prepareNodeForAddition(
  nodeWithoutIndex: Omit<BackendNode, "fractionalIndex">,
  currentState: NodeCreationCanvasState,
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

  // 3.5 Payments node default configuration
  if (nodeWithoutIndex.type === "payments") {
    const existingData = nodeWithoutIndex.data;
    finalNode = {
      ...finalNode,
      data: {
        provider: "creem",
        apiKeyEnv: "CREEM_API_KEY",
        webhookSecretEnv: "CREEM_WEBHOOK_SECRET",
        plans: [
          { id: "plan-free", name: "Free Tier", price: "$0", interval: "monthly" },
          { id: "plan-pro", name: "Pro Plan", price: "$29", interval: "monthly" },
          { id: "plan-enterprise", name: "Enterprise", price: "$199", interval: "monthly" },
        ],
        ...existingData,
        label: existingData?.label || "Creem Payments",
      },
    };
  }

  // 3.55 LangGraph node default graph configuration (start -> agentNode -> end)
  if (nodeWithoutIndex.type === "langgraph") {
    const existingData = nodeWithoutIndex.data || {};
    const defaultData = createDefaultLangGraphNodeData(
      existingData.label || "LangGraph Agent",
    );
    const existingMemoryConfig =
      typeof existingData.memoryConfig === "object" &&
      existingData.memoryConfig !== null
        ? existingData.memoryConfig
        : {};

    finalNode = {
      ...finalNode,
      data: {
        ...defaultData,
        ...existingData,
        inputChannels:
          Array.isArray(existingData.inputChannels) &&
          existingData.inputChannels.length > 0
            ? existingData.inputChannels
            : defaultData.inputChannels,
        stateChannels:
          Array.isArray(existingData.stateChannels) &&
          existingData.stateChannels.length > 0
            ? existingData.stateChannels
            : defaultData.stateChannels,
        agentDefinitions:
          (Array.isArray(existingData.agentDefinitions) &&
            existingData.agentDefinitions.length > 0) ||
          (Array.isArray(existingData.graphSteps) &&
            existingData.graphSteps.length > 0)
            ? existingData.agentDefinitions || []
            : defaultData.agentDefinitions,
        graphEdges:
          Array.isArray(existingData.graphEdges) &&
          existingData.graphEdges.length > 0
            ? existingData.graphEdges
            : defaultData.graphEdges,
        memoryConfig: {
          ...defaultData.memoryConfig,
          ...existingMemoryConfig,
        },
      },
    };
  }

  // 3.6 Default environment variables assignment
  if (!finalNode.data?.envVars || finalNode.data.envVars.length === 0) {
    const defaultEnvs = getDefaultNodeEnvVars(finalNode.type, finalNode.data);
    if (defaultEnvs.length > 0) {
      finalNode = {
        ...finalNode,
        data: {
          ...finalNode.data,
          envVars: defaultEnvs,
        },
      };
    }
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
      const serviceName = finalNode.data?.label || "service";
      const servicePort = String(finalNode.data?.port || "8080");
      const defaultEp: EndpointWithNode = isExt
        ? {
            id: crypto.randomUUID(),
            nodeId: node.id,
            name: "/v1/resource",
            type: "POST",
            summary: "External API action",
            businessLogic: "External API call",
            responseFields: [],
          }
        : createDefaultHealthEndpoint(node.id, serviceName, servicePort);
      nextEndpoints = [...nextEndpoints, defaultEp];
      pendingEndpoints = [...pendingEndpoints, defaultEp];
    }
  }

  // 7. Auto-generate companion TypesNode for entity or redis_schema node if not skipped
  if (
    (node.type === "entity" || node.type === "redis_schema") &&
    !node.data?.skipTypesNode
  ) {
    const companionRes = buildCompanionTypesNodeAndEdge(
      node,
      nextNodes,
      nextEdges,
    );
    if (companionRes.isExistingNode) {
      nextNodes = nextNodes.map((n) =>
        n.id === companionRes.typesNode.id ? companionRes.typesNode : n,
      );
      nextPendingNodes = [
        ...nextPendingNodes.filter((n) => n.id !== companionRes.typesNode.id),
        companionRes.typesNode,
      ];
    } else {
      nextNodes = [...nextNodes, companionRes.typesNode];
      nextPendingNodes = [...nextPendingNodes, companionRes.typesNode];
    }
    if (!nextEdges.some((e) => e.id === companionRes.typesEdge.id)) {
      nextEdges = [...nextEdges, companionRes.typesEdge];
      nextPendingEdges = [...nextPendingEdges, companionRes.typesEdge];
    }
  }

  // 8. Auto-generate companion TypesNode for service endpoints if not skipped
  if (node.type === "service" && !node.data?.skipTypesNode) {
    const serviceEndpoints = nextEndpoints.filter((e) => e.nodeId === node.id);
    const serviceCompanionRes = buildServiceTypesNodeAndEdge(
      node,
      serviceEndpoints,
      nextNodes,
      nextEdges,
    );
    if (serviceCompanionRes.isExistingNode) {
      nextNodes = nextNodes.map((n) =>
        n.id === serviceCompanionRes.typesNode.id ? serviceCompanionRes.typesNode : n,
      );
      nextPendingNodes = [
        ...nextPendingNodes.filter((n) => n.id !== serviceCompanionRes.typesNode.id),
        serviceCompanionRes.typesNode,
      ];
    } else {
      nextNodes = [...nextNodes, serviceCompanionRes.typesNode];
      nextPendingNodes = [...nextPendingNodes, serviceCompanionRes.typesNode];
    }
    if (!nextEdges.some((e) => e.id === serviceCompanionRes.typesEdge.id)) {
      nextEdges = [...nextEdges, serviceCompanionRes.typesEdge];
      nextPendingEdges = [...nextPendingEdges, serviceCompanionRes.typesEdge];
    }
  }

  // 8.5 Auto-generate companion TypesNode for LangGraph if not skipped
  if (node.type === "langgraph" && !node.data?.skipTypesNode) {
    const lgCompanionRes = buildLangGraphTypesNodeAndEdge(
      node,
      nextNodes,
      nextEdges,
    );
    if (lgCompanionRes.isExistingNode) {
      nextNodes = nextNodes.map((n) =>
        n.id === lgCompanionRes.typesNode.id ? lgCompanionRes.typesNode : n,
      );
      nextPendingNodes = [
        ...nextPendingNodes.filter((n) => n.id !== lgCompanionRes.typesNode.id),
        lgCompanionRes.typesNode,
      ];
    } else {
      nextNodes = [...nextNodes, lgCompanionRes.typesNode];
      nextPendingNodes = [...nextPendingNodes, lgCompanionRes.typesNode];
    }
    if (!nextEdges.some((e) => e.id === lgCompanionRes.typesEdge.id)) {
      nextEdges = [...nextEdges, lgCompanionRes.typesEdge];
      nextPendingEdges = [...nextPendingEdges, lgCompanionRes.typesEdge];
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
  const nodeWithoutIndex: Omit<BackendNode, "fractionalIndex"> = {
    id: crypto.randomUUID(),
    type: "entity",
    position: position || { x: 100, y: 100 },
    parentId,
    data: {
      label: "",
      columns: [
        { name: "id", type: "UUID", isPrimaryKey: true },
        { name: "created_at", type: "TIMESTAMPTZ" },
        { name: "updated_at", type: "TIMESTAMPTZ" },
      ],
    },
    selected: true,
  };
  const prepared = prepareNodeForAddition(nodeWithoutIndex, currentState);
  const node = prepared.nodes.find((n) => n.id === nodeWithoutIndex.id)!;
  return { node, nextNodes: prepared.nodes, nextPendingNodes: prepared.pendingNodes };
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
