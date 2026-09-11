import React, { useState } from "react";
import { Position, Handle } from "@xyflow/react";
import { Play, Settings, Trash } from "lucide-react";
import { BackendNode, Endpoint, UIEventItem, PageSection } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { WEB_PAGE_EVENTS } from "@workspace/canvas";
import { NodeDeletionDialog } from "../../../../../node-deletion-dialog";

const EVENT_OPTIONS = [...WEB_PAGE_EVENTS];

export interface SectionActionRowProps {
  nodeId: string;
  sectionId: string;
  action: UIEventItem;
  sections: PageSection[];
  updateSections: (sections: PageSection[]) => void;
  getLinkedEndpoint: (actionId: string) => { targetNode: BackendNode; endpoint: Endpoint } | null;
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
  const [customEvent, setCustomEvent] = useState("");
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditing) {
      setEditName(action.name || "");
      const evt = action.event || "click";
      const isStandard = (EVENT_OPTIONS as readonly string[]).includes(evt);
      setEditEvent(isStandard ? evt : evt ? "other" : "click");
      setCustomEvent(isStandard ? "" : evt);

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

  const evtStr = (action.event as string) || "";
  const isPageLoad = evtStr === "pageLoad";

  const link = getLinkedEndpoint(action.id);

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
    const existingEdge = store.edges.find(
      (e) => e.source === nodeId && e.sourceHandle === `events-${action.id}`,
    );
    if (existingEdge) {
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

    const finalEvent = editEvent === "other" ? customEvent.trim() : editEvent.trim();
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
    return (
      <span className="text-[8px] text-muted-foreground font-mono truncate">
        {action.event || action.name || "click"}
      </span>
    );
  };

  return (
    <div className="flex flex-col px-3 py-1.5 border-b border-border/40 text-xs relative group/row hover:bg-secondary/20 nodrag">
      {/* Right outgoing event handle */}
      <Handle
        type="source"
        position={Position.Right}
        id={`events-${action.id}`}
        className="w-2 h-2 -right-1"
        style={{ top: "50%" }}
      />

      {/* Inbound PageLoad handle */}
      {isPageLoad && (
        <Handle
          type="target"
          position={Position.Left}
          id={`pageload-in-${action.id}`}
          className="w-2 h-2 -left-1 !bg-emerald-500"
          style={{ top: "50%" }}
        />
      )}

      {isEditing ? (
        <div
          className="flex flex-col gap-1.5 w-full"
          onBlur={(e) => {
            if (isSelectOpen) return;
            const related = e.relatedTarget as HTMLElement | null;
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
              <SelectContent>
                {EVENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {editEvent === "other" && (
              <Input
                value={customEvent}
                onChange={(e) => setCustomEvent(e.target.value)}
                placeholder="Custom event"
                className="h-6 text-xs w-full"
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
            )}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-between w-full cursor-pointer gap-2"
          onClick={() => {
            setIsEditing(true);
            setEditName(action.name || "");
            const evt = action.event || "click";
            const isStandard = (EVENT_OPTIONS as readonly string[]).includes(evt);
            setEditEvent(isStandard ? evt : evt ? "other" : "click");
            setCustomEvent(isStandard ? "" : evt);
          }}
        >
          <div className="flex flex-col gap-0.5 overflow-hidden">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-xs truncate">{action.name}</span>
              {getEventBadge()}
            </div>
          </div>
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {link && (
              <button
                type="button"
                className="flex items-center justify-center p-1 rounded hover:bg-green-500/10 text-green-500 transition-all cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerEvent({
                    event: action,
                    targetNode: link.targetNode,
                    endpoint: link.endpoint,
                  });
                }}
                title={`Trigger simulated request: ${link.endpoint.type || "GET"} ${link.endpoint.name}`}
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
