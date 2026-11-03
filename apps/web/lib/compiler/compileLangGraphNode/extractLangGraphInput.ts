import {
  BackendNode,
  CanvasLangGraphNodeData,
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphMemoryConfig,
} from "@/types/canvas";
import { CompileLangGraphInput } from "../langgraph/typescript/v1";
import { reconstructNodes, reconstructEdges } from "./reconstructCanvas";

export function extractLangGraphInput(
  node: BackendNode,
): CompileLangGraphInput {
  const data: CanvasLangGraphNodeData = node.data || {};
  const graphLabel = data.label || "LangGraph Agent";

  const stateChannels: LangGraphStateChannel[] = data.stateChannels || [
    {
      key: "messages",
      type: "messages",
      reducer: "add_messages",
      defaultValue: [],
    },
  ];
  const inputChannels: LangGraphInputChannel[] = data.inputChannels || [];
  const memoryConfig: LangGraphMemoryConfig | undefined = data.memoryConfig;

  let trackTokenUsage: boolean | undefined =
    data.trackTokenUsage ?? data.langGraphTrackTokenUsage;

  const canvasNodes = data.nodes;
  const canvasEdges = data.edges;

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
