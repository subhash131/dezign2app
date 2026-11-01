"use client";

import React from "react";
import {
  Zap,
  Plus,
  Play,
  ArrowRight,
  Download,
  Send,
  Radio,
  Sparkles,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import { UIEventItem, RealtimeConnection } from "@workspace/canvas";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

export interface ComponentEventActionCardProps {
  elementLabel?: string;
  elementType?: string;
  triggerEvent?: string;
  actionId?: string;
  actionName?: string;
  availableActions: UIEventItem[];
  onUpdate: (changes: { triggerEvent?: string; actionId?: string; actionName?: string }) => void;
  onCreateAction: (name?: string, eventType?: string) => void;
  onOpenActionFlow?: (actionId: string) => void;

  // Dedicated action slots for compound components (e.g. Chat)
  chatOnFetchActionId?: string;
  chatOnFetchActionName?: string;
  chatOnSendActionId?: string;
  chatOnSendActionName?: string;
  onUpdateChatAction?: (slot: "fetch" | "send", actionId?: string, actionName?: string) => void;
  onQuickWireChatActions?: () => void;

  // Realtime Streaming Slot for Chat (SSE / WebSocket)
  realtimeConnections?: RealtimeConnection[];
  chatStreamConnectionId?: string;
  onUpdateChatStreamConnection?: (connectionId?: string) => void;
  onQuickWireChatStreamConnection?: () => void;
  onOpenRealtimeConnectionConfig?: (connectionId: string) => void;
}

export const ComponentEventActionCard: React.FC<ComponentEventActionCardProps> = ({
  elementLabel,
  elementType,
  triggerEvent = "click",
  actionId,
  actionName,
  availableActions,
  onUpdate,
  onCreateAction,
  onOpenActionFlow,
  chatOnFetchActionId,
  chatOnFetchActionName,
  chatOnSendActionId,
  chatOnSendActionName,
  onUpdateChatAction,
  onQuickWireChatActions,
  realtimeConnections = [],
  chatStreamConnectionId,
  onUpdateChatStreamConnection,
  onQuickWireChatStreamConnection,
  onOpenRealtimeConnectionConfig,
}) => {
  const cleanLabel = elementLabel || "Selected Component";
  const cleanType = elementType || "element";
  const isChat = cleanType === "chat";

  // Effective action IDs for Chat
  const effectiveSendId = chatOnSendActionId || actionId;
  const effectiveSendName = chatOnSendActionName || actionName;
  const effectiveFetchId = chatOnFetchActionId;
  const effectiveFetchName = chatOnFetchActionName;

  const isFetchWired = Boolean(effectiveFetchId);
  const isSendWired = Boolean(effectiveSendId);

  // Find active realtime stream connection
  const activeStreamConn = realtimeConnections.find(
    (c) => c.id === chatStreamConnectionId,
  ) || realtimeConnections.find(
    (c) =>
      c.storeActionBinding?.targetFieldName === "messages" ||
      c.eventName === "chat_stream" ||
      c.eventName === "agent_stream",
  );
  const isStreamWired = Boolean(activeStreamConn);

  const isFullyWired = isFetchWired && isSendWired;
  const isPartiallyWired = (isFetchWired || isSendWired) && !isFullyWired;

  // Render Chat Multi-Trigger Action Slots
  if (isChat) {
    return (
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-4 pb-2.5">
          <CardTitle className="text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Zap size={13} className="text-cyan-500" />
              <span>Interactive Events &amp; Action Workflows</span>
            </span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 capitalize text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
                &lt;Chat /&gt;
              </Badge>
              {isFullyWired ? (
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-medium flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  <span>{isStreamWired ? "All Wired (3/3)" : "Core Wired (2/2)"}</span>
                </Badge>
              ) : isPartiallyWired ? (
                <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-medium">
                  Partially Wired (1/2)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 font-normal">
                  Not Wired (0/2)
                </Badge>
              )}
            </div>
          </CardTitle>
          <CardDescription className="text-[11px] leading-relaxed">
            Configure lifecycle hydration, prompt submission, and live streaming workflows for the{" "}
            <strong className="text-foreground font-medium font-mono">
              &ldquo;{cleanLabel}&rdquo;
            </strong>{" "}
            Chat thread.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-4 pt-1 space-y-3.5 text-xs">
          {/* Quick-Wire Action Pipeline Shortcut Banner */}
          {onQuickWireChatActions && (!isFullyWired || !isStreamWired) && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-500/[0.08] border border-cyan-500/25">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Sparkles size={13} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-foreground">
                    ⚡ Quick-Wire Complete Chat Pipeline
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Auto-creates and binds fetchConversationHistory (onMount), sendMessage (onSend), &amp; SSE Stream
                  </div>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={onQuickWireChatActions}
                className="h-6 text-[11px] font-medium bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shrink-0 ml-2 shadow-xs"
              >
                <Zap size={10} className="mr-1" />
                Auto-Wire Pipeline
              </Button>
            </div>
          )}

          {/* Action Slot 1: Conversation History Hydration (onMount / pageLoad) */}
          <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Download size={12} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-[11px]">
                      1. Conversation History Hydration
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                      onMount (pageLoad)
                    </Badge>
                  </div>
                </div>
              </div>
              {isFetchWired ? (
                <Badge variant="outline" className="text-[9px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-medium">
                  Wired
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50 font-normal">
                  Not Wired
                </Badge>
              )}
            </div>

            <p className="text-[10.5px] text-muted-foreground">
              Executed on initial mount to fetch conversation history from backend and populate the messages store.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10.5px] font-medium text-foreground/80">
                  Execute Action Workflow:
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCreateAction("fetchConversationHistory", "pageLoad")}
                  className="h-5 text-[10.5px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 p-0 hover:bg-transparent flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={10} />
                  <span>New Action</span>
                </Button>
              </div>

              <Select
                value={effectiveFetchId || "__none__"}
                onValueChange={(val) => {
                  if (val === "__none__") {
                    onUpdateChatAction?.("fetch", undefined, undefined);
                  } else {
                    const act = availableActions.find((a) => a.id === val);
                    onUpdateChatAction?.("fetch", val, act?.name || "fetchConversationHistory");
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue placeholder="No Hydration Action Bound" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (No Action)</SelectItem>
                  {availableActions.map((act) => {
                    const isPageLoad = act.event === "pageLoad" || act.name === "pageLoad";
                    return (
                      <SelectItem key={act.id} value={act.id || ""}>
                        <div className="flex items-center gap-1.5">
                          <Zap size={11} className={isPageLoad ? "text-emerald-500" : "text-amber-500"} />
                          <span className="font-medium">{act.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({act.event || "click"} • {act.actionSteps?.length || 0} steps)
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {effectiveFetchId && onOpenActionFlow && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenActionFlow(effectiveFetchId)}
                className="w-full h-7 text-[11px] flex items-center justify-between border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Play size={11} className="text-emerald-500" />
                  <span>Open History Hydration Flow</span>
                </span>
                <ArrowRight size={11} />
              </Button>
            )}
          </div>

          {/* Action Slot 2: Prompt Submission (onSend / onSubmit) */}
          <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Send size={12} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-[11px]">
                      2. Prompt Submission
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                      onSend (onSubmit)
                    </Badge>
                  </div>
                </div>
              </div>
              {isSendWired ? (
                <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-medium">
                  Wired
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50 font-normal">
                  Not Wired
                </Badge>
              )}
            </div>

            <p className="text-[10.5px] text-muted-foreground">
              Executed when user hits Enter or clicks Send to append user prompt and invoke chat agent API.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10.5px] font-medium text-foreground/80">
                  Execute Action Workflow:
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCreateAction("sendMessage", "submit")}
                  className="h-5 text-[10.5px] text-purple-600 dark:text-purple-400 hover:text-purple-700 p-0 hover:bg-transparent flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={10} />
                  <span>New Action</span>
                </Button>
              </div>

              <Select
                value={effectiveSendId || "__none__"}
                onValueChange={(val) => {
                  if (val === "__none__") {
                    onUpdateChatAction?.("send", undefined, undefined);
                  } else {
                    const act = availableActions.find((a) => a.id === val);
                    onUpdateChatAction?.("send", val, act?.name || "sendMessage");
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue placeholder="No Send Action Bound" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (No Action)</SelectItem>
                  {availableActions.map((act) => (
                    <SelectItem key={act.id} value={act.id || ""}>
                      <div className="flex items-center gap-1.5">
                        <Zap size={11} className="text-amber-500" />
                        <span className="font-medium">{act.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({act.event || "click"} • {act.actionSteps?.length || 0} steps)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveSendId && onOpenActionFlow && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenActionFlow(effectiveSendId)}
                className="w-full h-7 text-[11px] flex items-center justify-between border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Play size={11} className="text-purple-500" />
                  <span>Open Send Message Flow</span>
                </span>
                <ArrowRight size={11} />
              </Button>
            )}
          </div>

          {/* Action Slot 3: AI Assistant Response Streaming (SSE / WebSocket) */}
          <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/[0.04] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="p-1 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  <Radio size={12} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground text-[11px]">
                      3. AI Assistant Response Streaming
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10">
                      SSE / WebSocket
                    </Badge>
                  </div>
                </div>
              </div>
              {isStreamWired ? (
                <Badge variant="outline" className="text-[9px] text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 font-medium">
                  {activeStreamConn?.protocol || "SSE"} Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50 font-normal">
                  Optional / Direct POST
                </Badge>
              )}
            </div>

            <p className="text-[10.5px] text-muted-foreground">
              Streams real-time assistant response tokens or LangGraph agent state deltas directly into your conversation thread.
            </p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[10.5px] font-medium text-foreground/80">
                  Realtime Stream Connection:
                </Label>
                {onQuickWireChatStreamConnection && !isStreamWired && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onQuickWireChatStreamConnection}
                    className="h-5 text-[10.5px] text-purple-600 dark:text-purple-400 hover:text-purple-700 p-0 hover:bg-transparent flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={10} />
                    <span>Quick-Wire SSE</span>
                  </Button>
                )}
              </div>

              <Select
                value={activeStreamConn?.id || "__none__"}
                onValueChange={(val) => {
                  if (val === "__none__") {
                    onUpdateChatStreamConnection?.(undefined);
                  } else {
                    onUpdateChatStreamConnection?.(val);
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background">
                  <SelectValue placeholder="No Stream Connection (Direct HTTP Mode)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (Direct HTTP Response Mode)</SelectItem>
                  {realtimeConnections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      <div className="flex items-center gap-1.5">
                        <Radio size={11} className="text-purple-500" />
                        <span className="font-medium font-mono text-[11px]">{conn.protocol}</span>
                        <span>{conn.eventName || conn.description || "Stream"}</span>
                        {conn.storeActionBinding?.targetFieldName && (
                          <span className="text-[10px] text-muted-foreground">
                            &rarr; {conn.storeActionBinding.storeName || "Store"}.{conn.storeActionBinding.targetFieldName}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeStreamConn && (
              <div className="p-2 rounded bg-background/50 border border-purple-500/20 text-[10px] font-mono space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Stream URL / Event:</span>
                  <span className="text-foreground font-semibold">{activeStreamConn.streamUrl || "/events"} ({activeStreamConn.eventName || "message"})</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Target Store Reducer:</span>
                  <span className="text-purple-600 dark:text-purple-400 font-semibold">
                    {activeStreamConn.storeActionBinding?.storeName || "ChatStore"}.{activeStreamConn.storeActionBinding?.targetFieldName || "messages"} ({activeStreamConn.storeActionBinding?.actionType || "append"})
                  </span>
                </div>
              </div>
            )}

            {activeStreamConn && onOpenRealtimeConnectionConfig && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenRealtimeConnectionConfig(activeStreamConn.id)}
                className="w-full h-7 text-[11px] flex items-center justify-between border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Settings2 size={11} className="text-purple-500" />
                  <span>Configure Realtime Connection &amp; Payload Reducers</span>
                </span>
                <ArrowRight size={11} />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default Standard Single-Event Card for atomic elements (button, input, switch, etc.)
  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="p-4 pb-2.5">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Zap size={13} className="text-amber-500" />
            <span>Interactive Event &amp; Action Trigger</span>
          </span>
          <div className="flex items-center gap-1.5">
            {elementType && (
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 capitalize text-muted-foreground border-border/60">
                &lt;{cleanType} /&gt;
              </Badge>
            )}
            {actionId ? (
              <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 font-medium">
                Wired
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 font-normal">
                Not Wired
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription className="text-[11px] leading-relaxed">
          Configure what happens when a user interacts with the{" "}
          <strong className="text-foreground font-medium font-mono">
            &ldquo;{cleanLabel}&rdquo;
          </strong>{" "}
          ({cleanType}) element.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-3.5 text-xs">
        {/* Target Element Callout */}
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/50 text-[11px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground shrink-0">Attached to Element:</span>
            <span className="font-semibold text-foreground font-mono truncate">
              {cleanLabel}
            </span>
          </div>
          <Badge variant="secondary" className="text-[9px] font-mono capitalize px-1.5 py-0 shrink-0">
            {cleanType}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="font-medium text-foreground/90">
              When user interacts with &ldquo;{cleanLabel}&rdquo; via:
            </span>
            <span className="text-[10px] text-muted-foreground/70 font-normal">
              DOM Event
            </span>
          </Label>
          <Select
            value={triggerEvent || (cleanType === "button" ? "click" : "change")}
            onValueChange={(val) => onUpdate({ triggerEvent: val })}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="click">
                onClick {cleanType === "button" ? "(Button click / tap)" : "(Element click / tap)"}
              </SelectItem>
              <SelectItem value="change">
                onChange {cleanType === "input" ? "(Input text change)" : "(Value change / toggle)"}
              </SelectItem>
              <SelectItem value="submit">onSubmit (Form submission)</SelectItem>
              <SelectItem value="select">onSelect (Dropdown option chosen)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-foreground/90">
              Execute Action Workflow:
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCreateAction()}
              className="h-6 text-[11px] text-purple-600 dark:text-purple-400 hover:text-purple-700 p-0 hover:bg-transparent flex items-center gap-1 cursor-pointer"
            >
              <Plus size={11} />
              <span>New Action</span>
            </Button>
          </div>
          <Select
            value={actionId || "__none__"}
            onValueChange={(val) => {
              if (val === "__none__") {
                onUpdate({ actionId: undefined, actionName: undefined });
              } else {
                const act = availableActions.find((a) => a.id === val);
                onUpdate({
                  actionId: val,
                  actionName: act?.name || "Action",
                });
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="No Action Bound" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (No Action)</SelectItem>
              {availableActions.map((act) => (
                <SelectItem key={act.id} value={act.id || ""}>
                  <div className="flex items-center gap-1.5">
                    <Zap size={11} className="text-amber-500" />
                    <span>{act.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ({act.actionSteps?.length || 0} steps)
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {actionId && onOpenActionFlow && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (actionId) {
                onOpenActionFlow(actionId);
              }
            }}
            className="w-full h-8 text-xs flex items-center justify-between border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Play size={12} className="text-purple-500" />
              <span>Open Action Flow Editor</span>
            </span>
            <ArrowRight size={12} />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
