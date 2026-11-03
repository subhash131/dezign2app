import { BackendEdge, BackendNode, Endpoint } from "@/types/canvas";
import type { OutputChannelConfig } from "@workspace/canvas";
import { RouteEndpoint } from "../langgraph/typescript/v1";

/** Resolve which canvas edges connect to this LangGraph node and what they represent. */
export function resolveRouteEndpoints(
  nodeId: string,
  edges: BackendEdge[],
  allNodes: BackendNode[],
  endpoints: Endpoint[],
  events: Array<{ id: string; name?: string; variant?: string }>,
  outputChannels?: OutputChannelConfig[],
): RouteEndpoint[] {
  const incoming = edges.filter((e) => e.target === nodeId);

  return incoming.map((edge): RouteEndpoint => {
    const sourceNode = allNodes.find((n) => n.id === edge.source);
    const sourceNodeLabel = sourceNode?.data?.label || edge.source;
    const payloadMapping = edge.data?.payloadMapping;

    // Resolve the output channel bound to this edge (if any)
    const boundChannel = (outputChannels || []).find(
      (ch) => ch.boundRouteIds?.includes(edge.id),
    );
    const channelType = boundChannel?.type; // sse | websocket | event | webhook | rest
    const preInvokeLogicMode = edge.data?.preInvokeLogicMode;
    const preInvokePrompt = edge.data?.preInvokePrompt;
    const preInvokeCode = edge.data?.preInvokeCode;
    // Edge-level user settings take precedence; output channel inference is a fallback
    const resolvedExecutionMode: RouteEndpoint["responseExecutionMode"] =
      edge.data?.responseExecutionMode ||
      (channelType === "sse" || channelType === "websocket"
        ? "stream"
        : channelType === "rest"
          ? "sync"
          : channelType === "event" || channelType === "webhook"
            ? "async_ack"
            : undefined);

    // For REST channels with a specific state channel, expose only that field
    const resolvedResponseOutputMode: RouteEndpoint["responseOutputMode"] =
      edge.data?.responseOutputMode ||
      (channelType === "rest" && boundChannel?.targetStateChannel
        ? "selected"
        : undefined);
    const resolvedResponseFields: string[] | undefined =
      edge.data?.responseFields ||
      (channelType === "rest" && boundChannel?.targetStateChannel
        ? [boundChannel.targetStateChannel]
        : undefined);

    // For event/webhook channels, generate a post-invoke emit snippet
    const channelPostInvokeCode: string | undefined = (() => {
      if (!boundChannel) return undefined;
      const topic = boundChannel.topicOrEventName || boundChannel.name;
      const stateKey = boundChannel.targetStateChannel || "messages";
      if (channelType === "event") {
        return `// Emit output channel: ${boundChannel.name}\n// eventBus.emit(${JSON.stringify(topic)}, result?.[${JSON.stringify(stateKey)}] ?? result);`;
      }
      if (channelType === "webhook") {
        return `// Deliver output channel: ${boundChannel.name}\n// await fetch(${JSON.stringify(topic)}, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: result?.[${JSON.stringify(stateKey)}] ?? result }) });`;
      }
      return undefined;
    })();

    const responseExecutionMode = resolvedExecutionMode;
    const responseOutputMode = resolvedResponseOutputMode;
    const responseFields = resolvedResponseFields;
    const postInvokeLogicMode = edge.data?.postInvokeLogicMode;
    const postInvokePrompt = edge.data?.postInvokePrompt;
    const postInvokeCode = edge.data?.postInvokeCode ?? channelPostInvokeCode;

    if (edge.sourceHandle?.startsWith("endpoint-out-")) {
      const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
      const ep =
        endpoints.find((e) => e.id === endpointId) ||
        (sourceNode?.data?.endpoints as Endpoint[] | undefined)?.find(
          (e) => e.id === endpointId,
        );
      if (ep) {
        let epMethod: RouteEndpoint["method"] = "POST";
        const rawType = ep.type;
        if (
          rawType === "GET" ||
          rawType === "POST" ||
          rawType === "PUT" ||
          rawType === "PATCH" ||
          rawType === "DELETE"
        ) {
          epMethod = rawType;
        }

        const lgStep = ep.pipelineSteps?.find(
          (s) =>
            s.type === "langgraph_invoke" &&
            (!s.langGraphTargetNodeId || s.langGraphTargetNodeId === nodeId),
        );

        const action: RouteEndpoint["action"] =
          lgStep?.langGraphAction === "history"
            ? "history"
            : epMethod === "GET" && !lgStep
              ? "history"
              : "invoke";

        const historyFormat =
          lgStep?.langGraphHistoryFormat ||
          (action === "history" ? "chat_messages" : undefined);
        const historyPaginationEnabled =
          lgStep?.langGraphHistoryPaginationEnabled;
        const threadIdSource = lgStep?.langGraphThreadIdSource;

        const epRoute: RouteEndpoint = {
          kind: "endpoint",
          path: ep.name || (action === "history" ? "/history" : "/invoke"),
          method: epMethod,
          sourceNodeLabel,
          payloadMapping,
          preInvokeLogicMode,
          preInvokePrompt,
          preInvokeCode,
          responseExecutionMode,
          responseOutputMode,
          responseFields,
          postInvokeLogicMode,
          postInvokePrompt,
          postInvokeCode,
          action,
          historyFormat,
          historyPaginationEnabled,
          threadIdSource,
        };
        return epRoute;
      }
    }

    if (edge.sourceHandle?.startsWith("consumedEvents-out-")) {
      const eventId = edge.sourceHandle.replace("consumedEvents-out-", "");
      const ev = events.find((e) => e.id === eventId);
      return {
        kind: "event",
        path: `/${(ev?.name || eventId).toLowerCase().replace(/\s+/g, "-")}`,
        method: "POST",
        eventName: ev?.name || eventId,
        sourceNodeLabel,
        payloadMapping,
        preInvokeLogicMode,
        preInvokePrompt,
        preInvokeCode,
        responseExecutionMode,
        responseOutputMode,
        responseFields,
        postInvokeLogicMode,
        postInvokePrompt,
        postInvokeCode,
      };
    }

    // Fallback — task or plain connection
    return {
      kind: "task",
      path: "/invoke",
      method: "POST",
      sourceNodeLabel,
      payloadMapping,
      preInvokeLogicMode,
      preInvokePrompt,
      preInvokeCode,
      responseExecutionMode,
      responseOutputMode,
      responseFields,
      postInvokeLogicMode,
      postInvokePrompt,
      postInvokeCode,
    };
  });
}
