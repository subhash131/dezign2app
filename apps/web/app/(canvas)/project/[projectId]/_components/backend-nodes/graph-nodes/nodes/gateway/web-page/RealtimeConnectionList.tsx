import React, { useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, Settings, Trash, Radio, AlertCircle, Play, Bot } from "lucide-react";
import { BackendNode, RealtimeConnection, ClientDeliveryProtocol, PipelineStep, PipelineStepDraft } from "@workspace/canvas/types";
import {
  CANVAS_ROW_HANDLE_CLASS,
  CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId } from "../../../common";
import { deleteRealtimeConnection } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/web-page-realtime-config";

export interface RealtimeConnectionListProps {
  nodeId: string;
  connections?: RealtimeConnection[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
}

interface MergedConnection extends RealtimeConnection {
  isDerived?: boolean;
}

export const RealtimeConnectionList: React.FC<RealtimeConnectionListProps> = ({
  nodeId,
  connections = [],
  updateNode,
  data,
}) => {
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const events = useBackendCanvasStore((s) => s.events);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);

  // Derive any connections targeted at this page via push_to_client or langgraph_invoke streaming pipeline steps
  const derivedConnections = useMemo(() => {
    const derived: MergedConnection[] = [];

    const isStepTargetingThisPage = (
      step: PipelineStep | PipelineStepDraft,
      sourceItemId: string,
      sourceNodeId: string,
    ): boolean => {
      // 1. Explicit target page ID on step
      if (step.clientDeliveryTargetPageId) {
        return step.clientDeliveryTargetPageId === nodeId;
      }

      // 2. Step targets a page_ref node that references this page
      if (step.clientDeliveryPageRefNodeId) {
        const pr = nodes.find(
          (n) =>
            n.id === step.clientDeliveryPageRefNodeId &&
            n.type === "page_ref",
        );
        if (pr) {
          return pr.data?.targetPageId === nodeId || pr.data?.pageRefId === nodeId;
        }
      }

      // 3. Fallback only if step has neither explicit targetPageId nor pageRefNodeId:
      // Canvas edge connects source endpoint/event to a page_ref referencing this page
      const edgeToPageRef = edges.find((e) => {
        if (e.source !== sourceNodeId) return false;
        const matchesHandle =
          !e.sourceHandle ||
          e.sourceHandle.includes(sourceItemId) ||
          e.sourceHandle === `endpoint-out-${sourceItemId}` ||
          e.sourceHandle === `consumedEvents-out-${sourceItemId}`;
        if (!matchesHandle) return false;
        const targetNode = nodes.find((n) => n.id === e.target && n.type === "page_ref");
        return Boolean(
          targetNode &&
            (targetNode.data?.targetPageId === nodeId ||
              targetNode.data?.pageRefId === nodeId),
        );
      });
      if (edgeToPageRef) return true;

      return false;
    };

    const checkSteps = (
      steps: (PipelineStep | PipelineStepDraft)[] | undefined,
      sourceNodeId: string,
      sourceItemName: string,
      sourceItemId: string,
      sourceItemType: "endpoint" | "event",
    ) => {
      if (!steps) return;
      steps.forEach((step, idx) => {
        const isPushToClient =
          step.type === "push_to_client" &&
          isStepTargetingThisPage(step, sourceItemId, sourceNodeId);

        const isLangGraphStreaming =
          step.type === "langgraph_invoke" &&
          Boolean(step.langGraphStreamingEnabled) &&
          (step.langGraphStreamingProtocol === "sse" ||
            step.langGraphStreamingProtocol === "websocket" ||
            !step.langGraphStreamingProtocol) &&
          isStepTargetingThisPage(step, sourceItemId, sourceNodeId);

        if (isPushToClient || isLangGraphStreaming) {
          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          const proto: ClientDeliveryProtocol = isLangGraphStreaming
            ? (step.langGraphStreamingProtocol === "websocket" ? "WEBSOCKET" : "SSE")
            : (step.clientDeliveryProtocol ?? "SSE");

          const eventName =
            step.clientDeliveryEventName ||
            (isLangGraphStreaming
              ? (proto === "WEBSOCKET" ? "agent_stream" : (sourceItemName || step.name || "message"))
              : (sourceItemName || "message"));

          const room =
            step.clientDeliveryRoom ||
            (isLangGraphStreaming ? step.langGraphStreamingRoom : undefined);

          const stepName =
            step.name ||
            (isLangGraphStreaming
              ? (step.langGraphAgentName ? `LangGraph: ${step.langGraphAgentName}` : "LangGraph Agent")
              : "Push to Client");

          derived.push({
            id: step.id,
            protocol: proto,
            eventName,
            room,
            description: sourceItemName || step.name,
            sourceServiceNodeId: sourceNodeId,
            sourceServiceLabel: sourceNode?.data?.label || sourceNode?.type || "Service",
            sourceEventId: sourceItemId,
            sourceItemName,
            sourceItemType,
            sourceStepName: stepName,
            sourceStepType: step.type,
            sourceStepIndex: idx + 1,
            isDerived: true,
            isLangGraph: isLangGraphStreaming,
          });
        }
        if (step.thenSteps) checkSteps(step.thenSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.elseSteps) checkSteps(step.elseSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.trySteps) checkSteps(step.trySteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.catchSteps) checkSteps(step.catchSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.loopBody) checkSteps(step.loopBody, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.switchCases) {
          step.switchCases.forEach((c) => checkSteps(c.steps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
        if (step.switchDefault) checkSteps(step.switchDefault, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.parallelBranches) {
          step.parallelBranches.forEach((b) => checkSteps(b.steps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
      });
    };

    // 1. Check all consumed / published events
    events.forEach((ev) => {
      if (ev.pipelineSteps && ev.nodeId) {
        checkSteps(ev.pipelineSteps, ev.nodeId, ev.name || "Event", ev.id, "event");
      }
    });

    // 2. Check all endpoints
    endpoints.forEach((ep) => {
      if (ep.pipelineSteps && ep.nodeId) {
        checkSteps(ep.pipelineSteps, ep.nodeId, ep.name || "Endpoint", ep.id, "endpoint");
      }
    });

    // 3. Check embedded endpoints and consumedEvents on service nodes
    nodes.forEach((n) => {
      if (n.type === "service") {
        n.data?.endpoints?.forEach((ep) => {
          if (!endpoints.some((e) => e.id === ep.id) && ep.pipelineSteps) {
            checkSteps(ep.pipelineSteps, n.id, ep.name || "Endpoint", ep.id, "endpoint");
          }
        });
        n.data?.consumedEvents?.forEach((ev) => {
          if (!events.some((e) => e.id === ev.id) && ev.pipelineSteps) {
            checkSteps(ev.pipelineSteps, n.id, ev.name || "Event", ev.id, "event");
          }
        });
      }
    });

    return derived;
  }, [nodeId, nodes, events, endpoints, edges]);

  // Merge manual and derived connections, avoiding duplicates with matching IDs and preserving store action bindings
  const allConnections = useMemo(() => {
    const connectionsMap = new Map((connections || []).map((c) => [c.id, c]));
    const derivedIds = new Set(derivedConnections.map((d) => d.id));

    const derivedWithBindings = derivedConnections.map((d) => {
      const match = connectionsMap.get(d.id);
      return {
        ...d,
        storeActionBinding: match?.storeActionBinding || d.storeActionBinding,
        storeActionBindings: match?.storeActionBindings || d.storeActionBindings,
        actionSteps: match?.actionSteps || d.actionSteps,
        subscriptionBindings: match?.subscriptionBindings || d.subscriptionBindings,
      };
    });

    const manualOnly = connections
      .filter((c) => !derivedIds.has(c.id))
      .map((c) => ({
        ...c,
        isDerived: false,
        sourceServiceNodeId: undefined,
        sourceServiceLabel: undefined,
        sourceItemName: undefined,
        sourceItemType: undefined,
      }));
    return [...derivedWithBindings, ...manualOnly];
  }, [derivedConnections, connections]);

  const handleAdd = () => {
    const newId = `rtc-${generateId()}`;
    const newConn: RealtimeConnection = {
      id: newId,
      protocol: "SSE",
      eventName: "message",
      description: "Real-time stream listener",
    };
    const nextList = [...connections, newConn];
    updateNode(nodeId, {
      data: {
        ...data,
        realtimeConnections: nextList,
      },
    });
    setActiveConfigItem({
      type: "realtimeConnection",
      id: newId,
      nodeId,
    });
  };

  const handleDelete = (connId: string) => {
    deleteRealtimeConnection({
      connId,
      nodeId,
      store: useBackendCanvasStore.getState(),
    });
  };

  const getProtocolBadge = (protocol: string, isConnected = true) => {
    if (!isConnected) {
      return (
        <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 shrink-0">
          {protocol}
        </span>
      );
    }
    switch (protocol) {
      case "SSE":
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
            SSE
          </span>
        );
      case "WEBSOCKET":
      case "WS":
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-500 border border-cyan-500/30 shrink-0">
            WS
          </span>
        );
      case "WEBRTC":
      case "RTC":
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-purple-500/15 text-purple-500 border border-purple-500/30 shrink-0">
            RTC
          </span>
        );
      case "POLLING":
      case "POLL":
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-blue-500/15 text-blue-500 border border-blue-500/30 shrink-0">
            POLL
          </span>
        );
      case "API_PUSH":
      case "PUSH":
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shrink-0">
            PUSH
          </span>
        );
      default:
        return (
          <span className="text-[8px] font-semibold px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border shrink-0">
            {protocol}
          </span>
        );
    }
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        <div className="flex items-center gap-1.5">
          <Radio size={11} className="text-primary/70" />
          <span>Real-Time Connections</span>
          {allConnections.length > 0 && (
            <span className="text-[9px] bg-primary/10 text-primary px-1 rounded-full font-mono">
              {allConnections.length}
            </span>
          )}
        </div>
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all"
          onClick={handleAdd}
          title="Add Real-Time Connection"
        >
          <Plus size={12} />
        </div>
      </div>

      <div className="flex flex-col">
        {allConnections.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-muted-foreground/60 italic">
            No real-time connections. Add listener or target from service pipeline.
          </div>
        ) : (
          allConnections.map((item) => {
            const isConnected = Boolean(item.isDerived);

            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between px-3 py-1.5 border-b text-xs relative group/row transition-colors nodrag",
                  isConnected
                    ? "border-border/40 hover:bg-secondary/20"
                    : "border-destructive/30 bg-destructive/10 hover:bg-destructive/15",
                )}
              >
                {/* Target handle for visualizing real-time push incoming flow */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`rtc-in-${item.id}`}
                  className={cn(
                    CANVAS_ROW_HANDLE_CLASS,
                    CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
                    "!border-2 !border-background transition-colors",
                    isConnected
                      ? "!bg-violet-500"
                      : "!bg-destructive ring-2 ring-destructive/50 shadow-xs",
                  )}
                  style={{ top: "50%" }}
                />

                <div
                  className="flex items-center gap-1.5 overflow-hidden flex-1 cursor-pointer"
                  onClick={() =>
                    setActiveConfigItem({
                      type: "realtimeConnection",
                      id: item.id,
                      nodeId,
                    })
                  }
                >
                  {getProtocolBadge(item.protocol, isConnected)}
                  {isConnected && item.sourceItemType && (
                    <span
                      className={cn(
                        "text-[8px] font-bold px-1 py-0.2 rounded font-mono uppercase shrink-0",
                        item.sourceItemType === "endpoint"
                          ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                          : "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                      )}
                      title={item.sourceItemType === "endpoint" ? "HTTP Endpoint / API Route" : "Consumed Event Listener"}
                    >
                      {item.sourceItemType === "endpoint" ? "API" : "EVENT"}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-xs truncate",
                      isConnected ? "font-medium text-foreground" : "font-semibold text-destructive",
                    )}
                    title={item.sourceItemName || item.eventName || "message"}
                  >
                    {item.sourceItemName || (item.eventName && item.eventName !== "message" ? item.eventName : undefined) || item.eventName || "message"}
                  </span>

                  {item.sourceStepName && (
                    <span
                      className="text-[9.5px] px-1.5 py-0.2 rounded bg-secondary/80 text-foreground/80 border border-border/70 font-medium inline-flex items-center gap-1 shrink-0 truncate max-w-[140px]"
                      title={item.sourceStepIndex ? `Step ${item.sourceStepIndex}: ${item.sourceStepName}` : item.sourceStepName}
                    >
                      {item.sourceStepType === "langgraph_invoke" ? (
                        <Bot size={10} className="text-muted-foreground shrink-0" />
                      ) : (
                        <Radio size={10} className="text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">
                        {item.sourceStepIndex ? `Step ${item.sourceStepIndex}: ` : ""}{item.sourceStepName}
                      </span>
                    </span>
                  )}
                  {isConnected && item.sourceServiceLabel ? (
                    <span
                      className="text-[9px] px-1 py-0.2 rounded bg-secondary/80 text-muted-foreground font-mono truncate max-w-[100px]"
                      title={`Pushed by ${item.sourceItemType === "endpoint" ? "API" : "Event"} ${item.sourceItemName ? `"${item.sourceItemName}" on ` : ""}${item.sourceServiceLabel}`}
                    >
                      ← {item.sourceServiceLabel}
                    </span>
                  ) : !isConnected ? (
                    <span
                      className="text-[8px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-destructive/20 text-destructive border border-destructive/40 flex items-center gap-0.5 shrink-0"
                      title="Disconnected / Misconfigured: No backend service pipeline is currently pushing to this connection."
                    >
                      <AlertCircle size={8} /> DISCONNECTED
                    </span>
                  ) : null}

                  {item.storeActionBinding && (
                    <span
                      className="text-[7px] font-mono px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500/25 border border-indigo-500/30 font-semibold cursor-pointer max-w-[120px] truncate shrink-0 transition-colors"
                      title={`Bound to store: ${item.storeActionBinding.storeName || "Store"}.${item.storeActionBinding.actionName || item.storeActionBinding.actionType || "mutate"}()\nInput: ${item.storeActionBinding.updateSource || "full_message"}${item.storeActionBinding.valuePath ? ` (${item.storeActionBinding.valuePath})` : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConfigItem({
                          type: "realtimeConnection",
                          id: item.id,
                          nodeId,
                        });
                      }}
                    >
                      ⚡{item.storeActionBinding.actionName || item.storeActionBinding.actionType || "store"}()
                    </span>
                  )}

                  {item.subscriptionBindings && item.subscriptionBindings.length > 0 && (
                    <span
                      className="text-[7px] font-mono px-1 py-0.2 rounded bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border border-purple-500/30 font-semibold cursor-pointer max-w-[100px] truncate shrink-0 transition-colors flex items-center gap-0.5"
                      title={`${item.subscriptionBindings.length} subscription parameter binding(s)`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConfigItem({
                          type: "realtimeConnection",
                          id: item.id,
                          nodeId,
                        });
                      }}
                    >
                      🔗 {item.subscriptionBindings.length} sub
                    </span>
                  )}

                  {item.actionSteps && item.actionSteps.length > 0 && (
                    <span
                      className="text-[7px] font-mono px-1 py-0.2 rounded bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 font-semibold cursor-pointer max-w-[100px] truncate shrink-0 transition-colors"
                      title={`${item.actionSteps.length} action step(s):\n${item.actionSteps.map((s, idx) => `${idx + 1}. ${s.name || s.type}`).join("\n")}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConfigItem({
                          type: "realtimeConnection",
                          id: item.id,
                          nodeId,
                        });
                      }}
                    >
                      {item.actionSteps.length} {item.actionSteps.length === 1 ? "step" : "steps"}
                    </span>
                  )}
                </div>

                {/* Source handle for wiring realtime messages to downstream State Store */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`rtc-out-${item.id}`}
                  className={cn(
                    CANVAS_ROW_HANDLE_CLASS,
                    CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
                    "!border-2 !border-background !bg-violet-500",
                  )}
                  style={{ top: "50%" }}
                  title="Wire to State Store manipulator"
                />

              <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all shrink-0">
                {Boolean(item.actionSteps?.length) && (
                  <button
                    type="button"
                    className="flex items-center justify-center p-1 rounded hover:bg-green-500/10 text-green-500 transition-all cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveConfigItem({
                        type: "realtimeConnection",
                        id: item.id,
                        nodeId,
                      });
                    }}
                    title={`Simulate real-time action pipeline (${item.actionSteps?.length ?? 0} steps)`}
                  >
                    <Play size={10} className="fill-green-600 text-green-600" />
                  </button>
                )}
                <button
                  type="button"
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveConfigItem({
                      type: "realtimeConnection",
                      id: item.id,
                      nodeId,
                    });
                  }}
                  title="Connection settings"
                >
                  <Settings size={11} />
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  title="Delete connection"
                >
                  <Trash size={11} />
                </button>
              </div>
            </div>
          );
        })
        )}
      </div>
    </>
  );
};
