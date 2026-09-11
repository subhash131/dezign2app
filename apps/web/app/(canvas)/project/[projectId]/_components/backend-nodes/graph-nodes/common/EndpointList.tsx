import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, Trash, Check, Settings } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Endpoint } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { isEndpointPipelineUnconfigured } from "@/lib/utils/pipelineValidation";
import { formatEndpointRoute, sanitizeEndpointRoute } from "@workspace/canvas";
import { generateId } from "./utils";
import { LocalInput } from "./LocalInput";

export interface EndpointRowProps {
  nodeId: string;
  item: Endpoint;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  setEditingType: (type: string) => void;
  handleUpdate: (id: string, name: string, type: string) => void;
  handleDelete: (id: string) => void;
  handleUpdateItem: (id: string, changes: Partial<Endpoint>) => void;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  editingName: string;
  editingType: string;
}

export const EndpointRow = ({
  nodeId,
  item,
  isEditing,
  setEditingId,
  setEditingName,
  setEditingType,
  handleUpdate,
  handleDelete,
  handleUpdateItem,
  handleType,
  handlePosition,
  editingName,
  editingType,
}: EndpointRowProps) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);

  const isUnconfigured = React.useMemo(
    () => isEndpointPipelineUnconfigured(item, nodeId, allNodes, allEdges),
    [item, nodeId, allNodes, allEdges],
  );

  const isEndpointEmpty = () => {
    const currentName = isEditing ? editingName : item.name || "";
    const hasName = currentName.trim().length > 0;
    const hasHeaders = item.headers?.some(
      (h) => (h.key || "").trim() || (h.value || "").trim(),
    );
    const hasParams = item.params?.some((p) => (p.key || "").trim());
    const hasBody = (item.body?.trim().length || 0) > 0;
    const hasBusinessLogic = (item.businessLogic?.trim().length || 0) > 0;
    const hasOutput = (item.output?.trim().length || 0) > 0;
    return (
      !hasName &&
      !hasHeaders &&
      !hasParams &&
      !hasBody &&
      !hasBusinessLogic &&
      !hasOutput
    );
  };

  return (
    <div
      className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag"
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest('[role="combobox"]')) return;
        if (related?.closest('[role="listbox"]')) return;
        if (related?.closest("[data-radix-popper-content-wrapper]")) return;

        if (!e.currentTarget.contains(related)) {
          if (isEndpointEmpty()) {
            handleDelete(item.id);
            if (isEditing) setEditingId(null);
          } else if (isEditing) {
            const wasEmpty = !item.name;
            const sanitized = sanitizeEndpointRoute(editingName);
            handleUpdate(item.id, sanitized, editingType);
            if (wasEmpty && sanitized) {
              setActiveConfigItem({ type: "endpoint", id: item.id, nodeId });
            }
            setEditingId(null);
          }
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={`endpoint-in-${item.id}`}
        className="w-2 h-2 -left-1"
        style={{ top: "15px" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={`endpoint-out-${item.id}`}
        className="w-2 h-2 -right-1"
        style={{ top: "15px" }}
      />
      <div className="flex flex-col px-3 py-1.5 nodrag">
        {isEditing ? (
          <div className="flex items-center gap-1 nodrag">
            <Select value={editingType} onValueChange={setEditingType}>
              <SelectTrigger className="h-6 w-[70px] text-[10px] px-1.5 py-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET" className="text-xs">
                  GET
                </SelectItem>
                <SelectItem value="POST" className="text-xs">
                  POST
                </SelectItem>
                <SelectItem value="PUT" className="text-xs">
                  PUT
                </SelectItem>
                <SelectItem value="PATCH" className="text-xs">
                  PATCH
                </SelectItem>
                <SelectItem value="DELETE" className="text-xs">
                  DELETE
                </SelectItem>
                <SelectItem value="WS" className="text-xs">
                  WS
                </SelectItem>
                <SelectItem value="SSE" className="text-xs">
                  SSE
                </SelectItem>
                <SelectItem value="RTC" className="text-xs">
                  WebRTC
                </SelectItem>
              </SelectContent>
            </Select>
            <LocalInput
              value={editingName}
              onChange={(e) => setEditingName(formatEndpointRoute(e.target.value))}
              className="h-6 text-xs flex-1 nodrag"
              placeholder="e.g. /users"
              autoFocus
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  const sanitized = sanitizeEndpointRoute(editingName);
                  if (!sanitized) handleDelete(item.id);
                  else {
                    const wasEmpty = !item.name;
                    handleUpdate(item.id, sanitized, editingType);
                    if (wasEmpty)
                      setActiveConfigItem({
                        type: "endpoint",
                        id: item.id,
                        nodeId,
                      });
                  }
                  setEditingId(null);
                }
                if (e.key === "Escape") {
                  if (!item.name) handleDelete(item.id);
                  setEditingId(null);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const sanitized = sanitizeEndpointRoute(editingName || "");
                if (!sanitized) handleDelete(item.id);
                else {
                  const wasEmpty = !item.name;
                  handleUpdate(
                    item.id,
                    sanitized,
                    editingType || "GET",
                  );
                  if (wasEmpty)
                    setActiveConfigItem({
                      type: "endpoint",
                      id: item.id,
                      nodeId,
                    });
                }
                setEditingId(null);
              }}
            >
              <Check size={14} />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col w-full gap-1.5">
            <div
              className="flex items-center justify-between w-full cursor-pointer"
              onClick={() => {
                setEditingId(item.id);
                setEditingName(formatEndpointRoute(item.name || ""));
                setEditingType(item.type || "GET");
              }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 transition-colors",
                    isUnconfigured
                      ? "bg-destructive/20 text-destructive border border-destructive/40 shadow-sm"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {item.type || "GET"}
                </span>
                <span
                  className={cn(
                    "font-medium truncate transition-colors",
                    isUnconfigured && "text-destructive font-semibold",
                  )}
                >
                  {formatEndpointRoute(item.name || "")}
                </span>
                {isUnconfigured && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0"
                    title="Pipeline input variables not configured!"
                  />
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                <div
                  className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveConfigItem({
                      type: "endpoint",
                      id: item.id,
                      nodeId,
                    });
                  }}
                >
                  <Settings size={14} />
                </div>
                <div
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteDialogOpen(true);
                  }}
                  title="Delete Endpoint"
                >
                  <Trash size={14} />
                </div>
              </div>
            </div>

            {item.publishedEvents && item.publishedEvents.length > 0 && (
              <div className="flex flex-col gap-1 w-full pl-6 mt-0.5">
                {item.publishedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="relative flex items-center justify-between w-full group/pub cursor-default"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[9px] font-medium text-muted-foreground truncate opacity-70 group-hover/pub:opacity-100 transition-opacity flex items-center gap-1">
                      <span className="text-[8px] opacity-50">↳</span>
                      <span className="px-1 py-0.5 bg-secondary/50 rounded-sm">
                        pub
                      </span>
                      {ev.name}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover/pub:opacity-100 transition-all mr-2">
                      <div
                        className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveConfigItem({
                            type: "event",
                            id: ev.id,
                            nodeId,
                          });
                        }}
                      >
                        <Settings size={12} />
                      </div>
                      <div
                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updatedPubs = item.publishedEvents?.filter(
                            (p) => p.id !== ev.id,
                          );
                          handleUpdateItem(item.id, {
                            publishedEvents: updatedPubs,
                          });
                        }}
                      >
                        <Trash size={12} />
                      </div>
                    </div>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`publishedEvents-out-${ev.id}`}
                      style={{ top: "50%", right: "-12px" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Endpoint Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-md shadow-2xl ring-1 ring-white/10"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 font-semibold">
              Delete Endpoint "{item.name || `${item.type} Endpoint`}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-xs leading-relaxed">
              Are you sure you want to delete this endpoint? All pipeline logic, response schemas, and canvas connection handles tied to this endpoint will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(false);
              }}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                setDeleteDialogOpen(false);
                handleDelete(item.id);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete Endpoint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const EndpointList = ({
  nodeId,
  title,
}: {
  nodeId: string;
  title: string;
}) => {
  const items = useBackendCanvasStore((s) => s.endpoints).filter(
    (e) => e.nodeId === nodeId,
  );
  const addEndpoint = useBackendCanvasStore((s) => s.addEndpoint);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const deleteEndpoint = useBackendCanvasStore((s) => s.deleteEndpoint);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("GET");

  const handleAdd = () => {
    const newEndpoint = { id: generateId(), name: "", type: "GET" };
    addEndpoint(nodeId, newEndpoint);
    setEditingId(newEndpoint.id);
    setEditingName("");
    setEditingType("GET");
  };

  const handleUpdate = (id: string, name: string, type: string) => {
    updateEndpoint(id, { name: sanitizeEndpointRoute(name), type });
  };

  const handleDelete = (id: string) => {
    deleteEndpoint(id);
  };

  const handleUpdateItem = (id: string, changes: Partial<Endpoint>) => {
    updateEndpoint(id, changes);
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all"
          onClick={handleAdd}
        >
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <EndpointRow
            key={item.id}
            nodeId={nodeId}
            item={item}
            isEditing={editingId === item.id}
            setEditingId={setEditingId}
            editingName={editingName}
            setEditingName={setEditingName}
            editingType={editingType}
            setEditingType={setEditingType}
            handleUpdate={handleUpdate}
            handleDelete={handleDelete}
            handleUpdateItem={handleUpdateItem}
          />
        ))}
      </div>
    </>
  );
};
