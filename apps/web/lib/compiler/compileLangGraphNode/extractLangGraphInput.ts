import {
  BackendNode,
  CanvasLangGraphNodeData,
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphMemoryConfig,
} from "@/types/canvas";
import { CompileLangGraphInput } from "../langgraph/typescript/v1";
import { reconstructNodes, reconstructEdges } from "./reconstructCanvas";
import {
  NODE_ID_START,
  NODE_ID_STATE_GLOBAL,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/constants";

function isInputChannelArray(val: unknown): val is LangGraphInputChannel[] {
  return Array.isArray(val);
}

function isStateChannelArray(val: unknown): val is LangGraphStateChannel[] {
  return Array.isArray(val);
}

export function extractLangGraphInput(
  node: BackendNode,
): CompileLangGraphInput {
  const data: CanvasLangGraphNodeData = node.data || {};
  const graphLabel = data.label || "LangGraph Agent";

  const canvasNodes = data.nodes;
  const canvasEdges = data.edges;

  // Resolve inputChannels: prefer data.inputChannels, then START node on canvasNodes
  let inputChannels: LangGraphInputChannel[] = data.inputChannels || [];
  if (inputChannels.length === 0 && Array.isArray(canvasNodes)) {
    const startNode = canvasNodes.find(
      (n) => n.id === NODE_ID_START || n.type === LANGGRAPH_CANVAS_NODE_START,
    );
    if (
      startNode &&
      "data" in startNode &&
      startNode.data &&
      typeof startNode.data === "object" &&
      "inputChannels" in startNode.data &&
      isInputChannelArray(startNode.data.inputChannels)
    ) {
      inputChannels = startNode.data.inputChannels;
    }
  }

  // Resolve stateChannels: prefer data.stateChannels, then state_global on canvasNodes
  let stateChannels: LangGraphStateChannel[] = data.stateChannels || [];
  if (stateChannels.length === 0 && Array.isArray(canvasNodes)) {
    const stateNode = canvasNodes.find(
      (n) =>
        n.id === NODE_ID_STATE_GLOBAL ||
        n.type === LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
    );
    if (
      stateNode &&
      "data" in stateNode &&
      stateNode.data &&
      typeof stateNode.data === "object" &&
      "stateChannels" in stateNode.data &&
      isStateChannelArray(stateNode.data.stateChannels)
    ) {
      stateChannels = stateNode.data.stateChannels;
    }
  }
  if (stateChannels.length === 0) {
    stateChannels = [
      {
        key: "messages",
        type: "messages",
        reducer: "add_messages",
        defaultValue: [],
      },
    ];
  }

  const memoryConfig: LangGraphMemoryConfig | undefined = data.memoryConfig;

  let trackTokenUsage: boolean | undefined =
    data.trackTokenUsage ?? data.langGraphTrackTokenUsage;

  if (trackTokenUsage === undefined && Array.isArray(canvasNodes)) {
    for (const an of canvasNodes) {
      if (an && "data" in an && an.data && typeof an.data === "object") {
        const ad = an.data;
        if ("trackTokenUsage" in ad && ad.trackTokenUsage === false) {
          trackTokenUsage = false;
          break;
        }
        if (
          "streamConfig" in ad &&
          typeof ad.streamConfig === "object" &&
          ad.streamConfig !== null
        ) {
          const sc = ad.streamConfig;
          if (
            "envelope" in sc &&
            typeof sc.envelope === "object" &&
            sc.envelope !== null &&
            "includeUsage" in sc.envelope &&
            sc.envelope.includeUsage === false
          ) {
            trackTokenUsage = false;
            break;
          }
        }
      }
    }
  }
  if (trackTokenUsage === undefined) {
    trackTokenUsage = true;
  }

  // 1. If full canvas nodes & edges are stored directly on node.data
  if (
    Array.isArray(canvasNodes) &&
    Array.isArray(canvasEdges) &&
    canvasNodes.length > 0
  ) {
    return {
      graphLabel,
      stateChannels,
      inputChannels,
      nodes: canvasNodes,
      edges: canvasEdges,
      memoryConfig,
      trackTokenUsage,
    };
  }

  // 2. Reconstruct nodes & edges from node.data properties
  const reconstructedNodes = reconstructNodes(
    data,
    stateChannels,
    inputChannels,
  );
  const reconstructedEdges = reconstructEdges(data, reconstructedNodes);

  return {
    graphLabel,
    stateChannels,
    inputChannels,
    nodes: reconstructedNodes,
    edges: reconstructedEdges,
    memoryConfig,
    trackTokenUsage,
  };
}
