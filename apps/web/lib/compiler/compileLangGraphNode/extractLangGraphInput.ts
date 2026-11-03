import {
  BackendNode,
  CanvasLangGraphNodeData,
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphMemoryConfig,
} from "@/types/canvas";
import { CompileLangGraphInput } from "../langgraph/typescript/v1";
import type {
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
} from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/types";
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

  const rawData = data as {
    trackTokenUsage?: boolean;
    langGraphTrackTokenUsage?: boolean;
    nodes?: LangGraphCanvasNode[];
  };

  let trackTokenUsage: boolean | undefined =
    rawData.trackTokenUsage ?? rawData.langGraphTrackTokenUsage;

  if (trackTokenUsage === undefined && Array.isArray(rawData.nodes)) {
    const agentNodes = rawData.nodes.filter(
      (n) => (n as any).type === "langgraph_agent" || (n as any).type === "agent",
    );
    for (const an of agentNodes) {
      const ad = an.data as {
        trackTokenUsage?: boolean;
        streamConfig?: { envelope?: { includeUsage?: boolean } };
      };
      if (
        ad?.trackTokenUsage === false ||
        ad?.streamConfig?.envelope?.includeUsage === false
      ) {
        trackTokenUsage = false;
        break;
      }
    }
  }
  if (trackTokenUsage === undefined) {
    trackTokenUsage = true;
  }

  // 1. If full canvas nodes & edges are stored directly on node.data
  const canvasNodes = (data as { nodes?: LangGraphCanvasNode[] }).nodes;
  const canvasEdges = (data as { edges?: LangGraphCanvasEdge[] }).edges;

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
