import React, { useState } from "react";
import { Position, Handle } from "@xyflow/react";
import { Play, Settings, Trash } from "lucide-react";
import { BackendNode, Endpoint, UIEventItem, PageSection } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  WEB_PAGE_EVENTS,
  PAGE_LIFECYCLE_EVENTS,
  PAGE_EFFECT_EVENTS,
  UI_INTERACTION_EVENTS,
  CANVAS_ROW_HANDLE_CLASS,
  CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
  CANVAS_HANDLE_CONNECTED_CLASS,
} from "@workspace/canvas";
import { NodeDeletionDialog } from "../../../../../node-deletion-dialog";

const EVENT_OPTIONS = [...WEB_PAGE_EVENTS];

const isStandardWebPageEvent = (event: string): boolean => {
  return EVENT_OPTIONS.some((opt) => opt === event);
};

import { StepLink } from "./SectionList";

export interface SectionActionRowProps {
  nodeId: string;
  sectionId: string;
  action: UIEventItem;
  sections: PageSection[];
  updateSections: (sections: PageSection[]) => void;
  getLinkedEndpoint?: (actionId: string) => { targetNode: BackendNode; endpoint: Endpoint } | null;
  getLinkedEndpoints?: (actionId: string) => StepLink[];
  onTriggerEvent: (triggerInfo: { event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onFinishEdit?: () => void;
}

export const SectionActionRow = ({
  nodeId,
  sectionId,
  action,
  sections,
  updateSections,
  getLinkedEndpoint,
  getLinkedEndpoints,
  onTriggerEvent,
  isEditing: isEditingProp,
  onStartEdit,
  onFinishEdit,
}: SectionActionRowProps) => {
  const [internalIsEditing, setInternalIsEditing] = useState(
    !action.name || action.name.trim() === "" || Boolean(isEditingProp),
  );
  const isEditing = isEditingProp !== undefined ? isEditingProp : internalIsEditing;

  const setIsEditing = (val: boolean) => {
    setInternalIsEditing(val);
    if (val) {
      onStartEdit?.();
    } else {
      onFinishEdit?.();
    }
  };

  const [editName, setEditName] = useState(action.name || "");
  const [editEvent, setEditEvent] = useState(action.event || "click");
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      setEditName(action.name || "");
      const evt = action.event || "click";
      const normalizedEvt = evt === "mount" || evt === "pageLoad" ? "onMount" : evt;
      const isStandard = isStandardWebPageEvent(normalizedEvt);
      setEditEvent(isStandard ? normalizedEvt : "click");

      const focus = () => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      };
      focus();
      const raf = requestAnimationFrame(focus);
      const timer = setTimeout(focus, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isEditing]);

  React.useEffect(() => {
    if (!isEditing) {
      setEditName(action.name || "");
    }
  }, [action.name, isEditing]);

  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const edges = useBackendCanvasStore((s) => s.edges);

  const evtStr = action.event || "";
  const evtLower = evtStr.toLowerCase();
  const isMount = evtStr === "mount" || evtStr === "pageLoad" || evtStr === "onMount";
  const isPageLoad = isMount;
  const isUnmount = evtStr === "unmount";
  const isInterval = evtStr === "interval";
  const isParamChange = evtStr === "paramChange";
  const isEffect = evtStr === "effect";
  const isVisibilityChange = evtStr === "visibilityChange";
  const isBeforeUnload = evtStr === "beforeUnload";
  const isReactiveEffect = isParamChange || isEffect || isVisibilityChange || isBeforeUnload;
  const isSse = evtStr === "sse" || evtStr === "sseMessage" || evtLower === "sse";
  const isWebsocket =
    evtStr === "websocket" ||
    evtStr === "ws" ||
    evtStr === "websocketMessage" ||
    evtLower === "websocket" ||
    evtLower === "ws";
  const isWebrtc = evtStr === "webrtc" || evtLower === "webrtc";

  const stepLinks: StepLink[] = getLinkedEndpoints
    ? getLinkedEndpoints(action.id)
    : getLinkedEndpoint
    ? (() => {
        const link = getLinkedEndpoint(action.id);
        return link
          ? [
              {
                step: 1,
                label: "1",
                edgeId: "",
                targetNode: link.targetNode,
                endpoint: link.endpoint,
              },
            ]
          : [];
      })()
    : [];
  const primaryStep = stepLinks[0];
  const triggerTarget = primaryStep?.endpoint
    ? { targetNode: primaryStep.targetNode, endpoint: primaryStep.endpoint }
    : null;

  const handleUpdate = (name: string, event: string) => {
    const defaultNavType: "link" | "router" = "link";
    const updatedSections = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        actions: sec.actions.map((act) =>
          act.id === action.id
            ? {
                ...act,
                name,
                event,
                ...(event === "navigateToPage" ? { navigationType: defaultNavType } : {}),
              }
            : act,
        ),
      };
    });
    updateSections(updatedSections);
  };

  const handleDelete = () => {
    const store = useBackendCanvasStore.getState();
    const matchingEdges = store.edges.filter(
      (e) =>
        (e.source === nodeId && e.sourceHandle === `events-${action.id}`) ||
        (e.target === nodeId &&
          (e.targetHandle === `event-in-${action.id}` ||
            e.targetHandle === `pageload-in-${action.id}` ||
            e.targetHandle === `mount-in-${action.id}` ||
            e.targetHandle === `onmount-in-${action.id}` ||
            e.targetHandle === `unmount-in-${action.id}` ||
            e.targetHandle === `interval-in-${action.id}` ||
            e.targetHandle === `effect-in-${action.id}` ||
            e.targetHandle === `sse-in-${action.id}` ||
            e.targetHandle === `websocket-in-${action.id}` ||
            e.targetHandle === `webrtc-in-${action.id}` ||
            e.targetHandle?.endsWith(`-${action.id}`))),
    );
    matchingEdges.forEach((edge) => {
      const targetNode = store.nodes.find((n) => n.id === edge.target);
      store.deleteEdge(edge.id);
      if (targetNode && targetNode.type === "page_ref") {
        const remainingEdges = store.edges.filter(
          (e) => e.target === targetNode.id && e.id !== edge.id,
        );
        if (remainingEdges.length === 0) {
          store.deleteNode(targetNode.id);
        }
      }
    });

    const updatedSections = sections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        actions: sec.actions.filter((act) => act.id !== action.id),
      };
    });
    updateSections(updatedSections);
  };

  const handleDiscard = () => {
    setIsEditing(false);
    handleDelete();
  };

  const handleCancel = () => {
    if (!action.name || action.name.trim() === "") {
      handleDiscard();
    } else {
      setEditName(action.name);
      setIsEditing(false);
    }
  };

  const handleSaveOrDiscard = () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      if (!action.name || action.name.trim() === "") {
        handleDiscard();
      } else {
        setEditName(action.name);
        setIsEditing(false);
      }
      return;
    }

    const finalEvent = editEvent.trim() || "click";
    handleUpdate(trimmedName, finalEvent);
    setIsEditing(false);

    const store = useBackendCanvasStore.getState();
    const existingEdge = store.edges.find(
      (e) => e.source === nodeId && e.sourceHandle === `events-${action.id}`,
    );

    if (finalEvent === "navigateToPage") {
      if (!existingEdge) {
        const currentNode = store.nodes.find((n) => n.id === nodeId);
        const pos = currentNode?.position || { x: 100, y: 100 };
        const newRefId = crypto.randomUUID();

        store.addNode({
          id: newRefId,
          type: "page_ref",
          position: { x: pos.x + 320, y: pos.y + 50 },
          data: {
            label: "Page Ref",
            description: "Target page reference for navigation",
          },
        });

        store.addEdge({
          id: `edge-${Date.now()}`,
          source: nodeId,
          target: newRefId,
          sourceHandle: `events-${action.id}`,
          targetHandle: "page-ref-in",
          type: "connection",
        });
      }
    } else if (existingEdge) {
      const targetNode = store.nodes.find((n) => n.id === existingEdge.target);
      store.deleteEdge(existingEdge.id);
      if (targetNode && targetNode.type === "page_ref") {
        const remainingEdges = store.edges.filter(
          (e) => e.target === targetNode.id && e.id !== existingEdge.id,
        );
        if (remainingEdges.length === 0) {
          store.deleteNode(targetNode.id);
        }
      }
    }
  };

  const getEventBadge = () => {
    const evt = action.event || action.name || "click";
    const isMountEvt = evt === "mount" || evt === "pageLoad" || evt === "onMount";
    const isUnmountEvt = evt === "unmount";
    const isIntervalEvt = evt === "interval";
    const isParamChangeEvt = evt === "paramChange";
    const isEffectEvt = evt === "effect";
    const isVisibilityEvt = evt === "visibilityChange";
    const isBeforeUnloadEvt = evt === "beforeUnload";

    let badgeClass = "text-muted-foreground";
    let badgeText = evt;

    if (isMountEvt) {
      badgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold";
      badgeText = "onMount";
    } else if (isUnmountEvt) {
      badgeClass = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold";
    } else if (isIntervalEvt) {
      badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-semibold";
      badgeText = action.intervalConfig?.intervalMs ? `interval (${action.intervalConfig.intervalMs}ms)` : "interval";
    } else if (isParamChangeEvt) {
      badgeClass = "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-semibold";
    } else if (isEffectEvt) {
      badgeClass = "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 font-semibold";
    } else if (isVisibilityEvt) {
      badgeClass = "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-semibold";
      badgeText = "visibility";
    } else if (isBeforeUnloadEvt) {
      badgeClass = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 font-semibold";
    }

    return (
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-[8px] font-mono truncate px-1 rounded",
            badgeClass,
          )}
        >
          {badgeText}
        </span>
        {(() => {
          const rawBindings =
            Array.isArray(action.storeActionBindings) && action.storeActionBindings.length > 0
              ? action.storeActionBindings
              : action.storeActionBinding
              ? [action.storeActionBinding]
              : [];
          const bindings = rawBindings.filter(
            (b) => Boolean(b.storeNodeId && (b.actionName || b.actionId || b.actionType)),
          );
          if (bindings.length === 0) return null;

          const titleText = bindings
            .map(
              (b, idx) =>
                `${idx + 1}. ${b.storeName || "Store"}.${b.actionName || b.actionType || "action"}() (${b.updateSource || "response"}${b.valuePath ? `: ${b.valuePath}` : ""})`,
            )
            .join("\n");

          const displayText =
            bindings.length === 1
              ? `⚡${bindings[0]!.actionName || bindings[0]!.actionType || "store"}()`
              : `⚡${bindings.length} mutations`;

          return (
            <span
              className="text-[7px] font-mono px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500/25 border border-indigo-500/30 font-semibold cursor-pointer max-w-[120px] truncate transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setActiveConfigItem({
                  type: "pageEvent",
                  id: action.id,
                  nodeId,
                  sectionId,
                });
              }}
              title={`Store operations:\n${titleText}`}
            >
              {displayText}
            </span>
          );
        })()}
        {action.storageOperationBinding?.operationName && (
          <span
            className="text-[7px] font-mono px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 font-semibold cursor-pointer max-w-[120px] truncate transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setActiveConfigItem({
                type: "pageEvent",
                id: action.id,
                nodeId,
                sectionId,
              });
            }}
            title={`Bucket operation:\n${action.storageOperationBinding.operationName} (${action.storageOperationBinding.bucketId || "bucket"})${action.storageOperationBinding.endpointId ? `\nLinked Endpoint: ${action.storageOperationBinding.endpointId}` : ""}`}
          >
            🪣 {action.storageOperationBinding.operationName}()
          </span>
        )}
      </div>
    );
  };

  const isActionConnected = edges.some(
    (e) =>
      (e.target === nodeId &&
        (e.targetHandle === `event-in-${action.id}` ||
          e.targetHandle === `pageload-in-${action.id}` ||
          e.targetHandle === `sse-in-${action.id}` ||
          e.targetHandle === `websocket-in-${action.id}` ||
          e.targetHandle === `webrtc-in-${action.id}` ||
          e.targetHandle?.endsWith(`-${action.id}`))) ||
      (e.source === nodeId && e.sourceHandle === `events-${action.id}`),
  );

  const parentSection = sections.find((s) => s.id === sectionId);
  const sourceState = action.itemSourceStateId
    ? parentSection?.stateObjects?.find((st) => st.id === action.itemSourceStateId)
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col px-3 py-1.5 border-b border-border/40 text-xs relative group/row hover:bg-secondary/20 nodrag",
        action.scope === "item" && "border-l-2 border-l-violet-500 bg-violet-500/[0.03]",
      )}
    >
      {/* Right outgoing event handle */}
      <Handle
        type="source"
        position={Position.Right}
        id={`events-${action.id}`}
        className={cn(
          CANVAS_ROW_HANDLE_CLASS,
          CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
          "!border-2 !border-background transition-all",
          action.storageOperationBinding
            ? "!bg-amber-500 !border-amber-500 ring-2 ring-amber-500/40"
            : "!bg-muted-foreground/40 hover:!bg-primary",
        )}
        style={{ top: "50%" }}
        title="Outbound: Connect to Storage Bucket Ref operation or Endpoint"
      />

      {/* Inbound Left handles for ALL actions */}
      {isPageLoad ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`pageload-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-emerald-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="onMount (in): Wire from State Store or API endpoint"
        />
      ) : isUnmount ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`unmount-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-rose-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="unmount (in): Teardown reset from State Store or API endpoint"
        />
      ) : isInterval ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`interval-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-amber-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="interval (in): Periodic timer trigger from State Store or API"
        />
      ) : isReactiveEffect ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`effect-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-violet-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title={`${action.event || "effect"} (in): Reactive effect trigger`}
        />
      ) : isSse ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`sse-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-amber-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="sse (in): Wire from Realtime SSE connection"
        />
      ) : isWebsocket ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`websocket-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-cyan-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="websocket (in): Wire from WebSocket connection"
        />
      ) : isWebrtc ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`webrtc-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-purple-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title="webrtc (in): Wire from WebRTC connection"
        />
      ) : action.scope === "item" ? (
        <Handle
          type="target"
          position={Position.Left}
          id={`event-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-violet-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title={`${action.name || "item action"} (in): Item-scoped click event${sourceState ? ` for ${sourceState.name}[]` : ""}`}
        />
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          id={`event-in-${action.id}`}
          className={cn(
            CANVAS_ROW_HANDLE_CLASS,
            CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
            "!border-2 !border-background !bg-indigo-500 transition-all",
            isActionConnected && CANVAS_HANDLE_CONNECTED_CLASS,
          )}
          style={{ top: "50%" }}
          title={`${action.name || action.event || "action"} (in): Wire from State Store action or API trigger`}
        />
      )}

      {isEditing ? (
        <div
          className="flex flex-col gap-1.5 w-full"
          onBlur={(e) => {
            if (isSelectOpen) return;
            const related =
              e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;
            if (related?.closest('[role="combobox"]')) return;
            if (related?.closest('[role="listbox"]')) return;
            if (related?.closest('[role="option"]')) return;
            if (related?.closest("[data-radix-popper-content-wrapper]")) return;

            if (!e.currentTarget.contains(related)) {
              handleSaveOrDiscard();
            }
          }}
        >
          <Input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Action name (e.g. submitForm)"
            className="h-6 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSaveOrDiscard();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                handleCancel();
              }
            }}
          />
          <div className="flex items-center gap-1">
            <Select
              open={isSelectOpen}
              onOpenChange={setIsSelectOpen}
              value={editEvent}
              onValueChange={(v) => setEditEvent(v)}
            >
              <SelectTrigger className="h-6 text-xs w-full bg-background focus:ring-1 focus:ring-ring focus:ring-offset-0">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    ⚡ Page Lifecycle
                  </SelectLabel>
                  <SelectItem value="onMount" className="text-xs">
                    onMount
                  </SelectItem>
                  {editEvent === "mount" && (
                    <SelectItem value="mount" className="text-xs">
                      onMount (mount)
                    </SelectItem>
                  )}
                  {editEvent === "pageLoad" && (
                    <SelectItem value="pageLoad" className="text-xs">
                      onMount (pageLoad)
                    </SelectItem>
                  )}
                  <SelectItem value="unmount" className="text-xs">
                    unmount
                  </SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    🔄 Reactive Effects
                  </SelectLabel>
                  {PAGE_EFFECT_EVENTS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    👆 User Interactions
                  </SelectLabel>
                  {UI_INTERACTION_EVENTS.filter((e) => e !== "navigateToPage").map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    🧭 Navigation
                  </SelectLabel>
                  <SelectItem value="navigateToPage" className="text-xs">
                    navigateToPage
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
            <input
              type="checkbox"
              id={`item-scope-${action.id}`}
              checked={action.scope === "item"}
              onChange={(e) => {
                const isItem = e.target.checked;
                const nextScope: UIEventItem["scope"] = isItem ? "item" : "section";
                const defaultStateId = parentSection?.stateObjects?.[0]?.id;
                const updated = sections.map((s) =>
                  s.id === sectionId
                    ? {
                        ...s,
                        actions: (s.actions || []).map((a) =>
                          a.id === action.id
                            ? {
                                ...a,
                                scope: nextScope,
                                itemSourceStateId: isItem
                                  ? a.itemSourceStateId || defaultStateId
                                  : undefined,
                                itemContextFields: isItem
                                  ? a.itemContextFields || ["id"]
                                  : undefined,
                              }
                            : a,
                        ),
                      }
                    : s,
                );
                updateSections(updated);
              }}
              className="h-3 w-3 rounded cursor-pointer accent-violet-500"
            />
            <label
              htmlFor={`item-scope-${action.id}`}
              className="text-[9px] text-muted-foreground cursor-pointer select-none flex items-center gap-1"
            >
              <span>Array item action</span>
              {action.scope === "item" && sourceState && (
                <span className="text-violet-400 font-mono">({sourceState.name}[])</span>
              )}
            </label>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-between w-full cursor-pointer gap-2"
          onClick={() => {
            setIsEditing(true);
            setEditName(action.name || "");
            const evt = action.event || "click";
            const isStandard = isStandardWebPageEvent(evt);
            setEditEvent(isStandard ? evt : "click");
          }}
        >
          <div className="flex flex-col gap-1 overflow-hidden">
            <div className="flex items-center gap-1.5 truncate">
              {action.scope === "item" && (
                <span className="text-[7.5px] px-1 py-0.2 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30 font-semibold shrink-0">
                  {sourceState ? `${sourceState.name}[]` : "item"}
                </span>
              )}
              <span className="font-medium text-xs truncate">{action.name}</span>
              {getEventBadge()}
            </div>
          </div>
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {(triggerTarget || Boolean(action.actionSteps?.length)) && (
              <button
                type="button"
                className="flex items-center justify-center p-1 rounded hover:bg-green-500/10 text-green-500 transition-all cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (triggerTarget) {
                    onTriggerEvent({
                      event: action,
                      targetNode: triggerTarget.targetNode,
                      endpoint: triggerTarget.endpoint,
                    });
                  } else {
                    setActiveConfigItem({
                      type: "pageEvent",
                      id: action.id,
                      nodeId,
                      sectionId,
                    });
                  }
                }}
                title={
                  triggerTarget
                    ? `Trigger simulated request: ${triggerTarget.endpoint.type || "GET"} ${triggerTarget.endpoint.name}`
                    : `Simulate action pipeline (${action.actionSteps?.length} steps)`
                }
              >
                <Play size={10} className="fill-green-600 text-green-600" />
              </button>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all">
              <button
                type="button"
                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveConfigItem({
                    type: "pageEvent",
                    id: action.id,
                    nodeId,
                    sectionId,
                  });
                }}
                title="Action configuration"
              >
                <Settings size={11} />
              </button>
              <button
                type="button"
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteDialogOpen(true);
                }}
                title="Delete action"
              >
                <Trash size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Action Deletion Dialog */}
      <NodeDeletionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        deletionTarget={{
          type: "action",
          nodeId,
          sectionId,
          action,
          onConfirm: handleDelete,
        }}
      />
    </div>
  );
};
