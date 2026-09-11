import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, Trash, Check, Settings } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { AnyMessagingResource, Schema } from "@/types/canvas";
import { isEndpointPipelineUnconfigured } from "@/lib/utils/pipelineValidation";
import { formatTopicName, sanitizeTopicName } from "@workspace/canvas";
import { generateId } from "./utils";
import { LocalInput } from "./LocalInput";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

export interface MessagingResourceRowProps {
  nodeId: string;
  item: AnyMessagingResource;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  handleUpdate: (id: string, name: string) => void;
  handleDelete: (id: string) => void;
  handleUpdateItem: (
    id: string,
    changes: Partial<AnyMessagingResource>,
  ) => void;
  field?: string;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  editingName: string;
  variant?: "definition" | "publish" | "consume";
  resourceType: string;
}

export const MessagingResourceRow = ({
  nodeId,
  item,
  isEditing,
  setEditingId,
  setEditingName,
  handleUpdate,
  handleDelete,
  handleUpdateItem,
  field,
  handleType,
  handlePosition,
  editingName,
  variant,
  resourceType,
}: MessagingResourceRowProps) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const isPublished = field === "publishedEvents" || variant === "publish";
  const isConsumed = field === "consumedEvents" || variant === "consume";
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const messagingNodes = nodes.filter(
    (n) =>
      n.type === "queue" ||
      n.type === "pubsub" ||
      n.type === "eventstream" ||
      n.type === "kafka" ||
      n.type === "redis-streams" ||
      n.type === "sqs" ||
      n.type === "redis-pubsub",
  );

  const selectedBroker = messagingNodes.find((n) => n.id === item.brokerNodeId);
  const availableResources = selectedBroker
    ? selectedBroker.data.topics ||
      selectedBroker.data.streams ||
      selectedBroker.data.queues ||
      selectedBroker.data.channels ||
      []
    : [];

  const allAvailableBrokerTopics = messagingNodes.flatMap((n) => {
    const brokerLabel = n.data?.label || n.type || "Broker";
    const resources = ((n.data?.topics ||
      n.data?.streams ||
      n.data?.queues ||
      n.data?.channels ||
      []) as AnyMessagingResource[]);
    return resources.map((r) => ({
      brokerNodeId: n.id,
      brokerLabel,
      resourceId: r.id,
      name: r.name || "Untitled Resource",
      payloadSchema: r.payloadSchema,
    }));
  });

  const edges = useBackendCanvasStore((s) => s.edges);
  const publisherCount = edges.filter(
    (e) => e.targetResourceId === item.id,
  ).length;
  const consumerCount = edges.filter(
    (e) => e.sourceResourceId === item.id,
  ).length;

  let pubAbbr = "P";
  let subAbbr = "S";
  if (resourceType === "buckets" || resourceType === "caches") {
    pubAbbr = "W";
    subAbbr = "R";
  } else if (resourceType === "queues" || resourceType === "streams") {
    pubAbbr = "P";
    subAbbr = "C";
  }

  const isConsumerUnconfigured = React.useMemo(() => {
    if (!isConsumed) return false;
    return isEndpointPipelineUnconfigured(item, nodeId, nodes, edges);
  }, [isConsumed, item, nodeId, nodes, edges]);

  const isChannelEmpty = () => {
    const currentName = isEditing ? editingName : item.name || "";
    const hasName = currentName.trim().length > 0;

    const desc =
      (item.description as string | undefined) ||
      (item.publishedWhen as string | undefined) ||
      "";
    const hasDesc = desc.trim().length > 0;

    const schema = item.payloadSchema as Schema | undefined;
    const rawJson = schema?.rawJson;
    const hasSchema = (rawJson?.trim().length || 0) > 0;

    const logic = item.handlerLogic as string | undefined;
    const hasLogic = (logic?.trim().length || 0) > 0;

    const hasTarget = item.brokerNodeId && item.brokerNodeId !== "none";
    const hasResource = Boolean(item.messagingResourceId);

    return !hasName && !hasDesc && !hasSchema && !hasLogic && !hasTarget && !hasResource;
  };

  const resolvedTopicName =
    item.name ||
    allAvailableBrokerTopics.find((t) => t.resourceId === item.messagingResourceId)?.name ||
    (item._legacyName as string | undefined);

  const isTopicOrEvent =
    resourceType === "topics" ||
    resourceType === "channels" ||
    variant === "publish" ||
    variant === "consume" ||
    field === "publishedEvents" ||
    field === "consumedEvents" ||
    !resourceType;

  return (
    <div
      className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag"
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest('[role="combobox"]')) return;
        if (related?.closest('[role="listbox"]')) return;
        if (related?.closest("[data-radix-popper-content-wrapper]")) return;

        if (!e.currentTarget.contains(related)) {
          if (isEditing) {
            if (isChannelEmpty()) {
              handleDelete(item.id);
              setEditingId(null);
            } else {
              const wasEmpty = !item.name;
              const sanitized = isTopicOrEvent
                ? sanitizeTopicName(editingName)
                : editingName.trim();
              if (sanitized) {
                handleUpdate(item.id, sanitized);
              }
              if (wasEmpty && sanitized) {
                setActiveConfigItem({ type: "event", id: item.id, nodeId });
              }
              setEditingId(null);
            }
          }
        }
      }}
    >
      {isPublished && variant !== "definition" && (
        <Handle
          type="source"
          position={Position.Right}
          id={`publishedEvents-out-${item.id}`}
          className="w-2 h-2 -right-1"
          style={{ top: "15px" }}
        />
      )}
      {isConsumed && variant !== "definition" && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={`consumedEvents-in-${item.id}`}
            className="w-2 h-2 -left-1"
            style={{ top: "15px" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`consumedEvents-out-${item.id}`}
            className="w-2 h-2 -right-1"
            style={{ top: "15px" }}
          />
        </>
      )}
      {variant === "definition" && resourceType && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={`${resourceType}:in:${item.id}`}
            className="w-2 h-2 -left-1"
            style={{ top: "15px" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`${resourceType}:out:${item.id}`}
            className="w-2 h-2 -right-1"
            style={{ top: "15px" }}
          />
        </>
      )}
      <div className="flex flex-col px-3 py-1.5 nodrag">
        {isEditing && !isConsumed ? (
          isPublished ? (
            <div className="flex items-center gap-1 w-full nodrag">
              <Select
                value={item.messagingResourceId || ""}
                onValueChange={(val) => {
                  if (val === "__none__") return;
                  const found = allAvailableBrokerTopics.find(
                    (t) => t.resourceId === val,
                  );
                  if (found) {
                    handleUpdateItem(item.id, {
                      brokerNodeId: found.brokerNodeId,
                      messagingResourceId: found.resourceId,
                      name: found.name,
                      ...(found.payloadSchema
                        ? { payloadSchema: found.payloadSchema }
                        : {}),
                    });
                    setEditingId(null);
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-background flex-1 nodrag">
                  <SelectValue placeholder="Select Topic from Broker..." />
                </SelectTrigger>
                <SelectContent>
                  {allAvailableBrokerTopics.length === 0 ? (
                    <SelectItem value="__none__" disabled className="text-xs">
                      No topics defined on Kafka/Broker nodes
                    </SelectItem>
                  ) : (
                    allAvailableBrokerTopics.map((top) => (
                      <SelectItem
                        key={`${top.brokerNodeId}-${top.resourceId}`}
                        value={top.resourceId}
                        className="text-xs"
                      >
                        {top.name} ({top.brokerLabel})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (!item.name && !item.messagingResourceId)
                    handleDelete(item.id);
                  setEditingId(null);
                }}
              >
                <Trash size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 nodrag">
              <LocalInput
                value={editingName}
                onChange={(e) => {
                  const val = isTopicOrEvent
                    ? formatTopicName(e.target.value)
                    : e.target.value;
                  setEditingName(val);
                }}
                className="h-6 text-xs flex-1 nodrag"
                placeholder={isTopicOrEvent ? "e.g. order.created" : "e.g. OrderCreated"}
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    const sanitized = isTopicOrEvent
                      ? sanitizeTopicName(editingName)
                      : editingName.trim();
                    if (!sanitized) handleDelete(item.id);
                    else {
                      const wasEmpty = !item.name;
                      handleUpdate(item.id, sanitized);
                      if (wasEmpty)
                        setActiveConfigItem({
                          type: "event",
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
                  const sanitized = isTopicOrEvent
                    ? sanitizeTopicName(editingName)
                    : (editingName || "").trim();
                  if (!sanitized) handleDelete(item.id);
                  else {
                    const wasEmpty = !item.name;
                    handleUpdate(item.id, sanitized);
                    if (wasEmpty)
                      setActiveConfigItem({ type: "event", id: item.id, nodeId });
                  }
                  setEditingId(null);
                }}
              >
                <Check size={14} />
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-col w-full">
            <div
              className="flex items-center justify-between w-full cursor-pointer"
              onClick={() => {
                if (isConsumed) {
                  setActiveConfigItem({ type: "event", id: item.id, nodeId });
                } else {
                  setEditingId(item.id);
                  setEditingName(
                    isTopicOrEvent
                      ? formatTopicName(item.name || "")
                      : item.name || "",
                  );
                }
              }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span
                  className={cn(
                    "font-medium truncate transition-colors",
                    isConsumed && !resolvedTopicName && "text-muted-foreground/70 italic",
                    isConsumerUnconfigured && "text-destructive font-semibold",
                  )}
                >
                  {(isTopicOrEvent && resolvedTopicName
                    ? formatTopicName(resolvedTopicName)
                    : resolvedTopicName) || (isConsumed ? "Select Topic..." : "Untitled Resource")}
                </span>
                {isConsumerUnconfigured && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse shrink-0"
                    title="Consumer pipeline input variables not configured!"
                  />
                )}
                {variant === "definition" && item.name && (
                  <span className="text-[9px] bg-secondary/80 text-muted-foreground px-1 py-0.5 rounded font-mono shrink-0">
                    {pubAbbr}: {publisherCount} &nbsp; {subAbbr}:{" "}
                    {consumerCount}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 transition-all",
                  isPublished || isConsumed
                    ? "opacity-100"
                    : "opacity-0 group-hover/row:opacity-100",
                )}
              >
                <div
                  className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveConfigItem({ type: "event", id: item.id, nodeId });
                  }}
                >
                  <Settings size={14} />
                </div>
                <div
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                >
                  <Trash size={14} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MessagingResourceList = <
  T extends AnyMessagingResource = AnyMessagingResource,
>({
  nodeId,
  title,
  items = [],
  variant,
  resourceType,
  onChange,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateItem,
  field,
  handleType,
  handlePosition,
  asCard,
}: {
  nodeId: string;
  title: string;
  items?: T[];
  variant?: "definition" | "publish" | "consume";
  resourceType: string;
  onChange?: (items: T[]) => void;
  onAdd?: (item: T) => void;
  onUpdate?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onUpdateItem?: (id: string, changes: Partial<T>) => void;
  field?: string;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  asCard?: boolean;
}) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const getKind = () => {
    switch (resourceType) {
      case "topics":
        return "topic";
      case "streams":
        return "stream";
      case "queues":
        return "queue";
      case "channels":
        return "channel";
      case "caches":
        return "cache";
      default:
        return "topic";
    }
  };

  const handleAdd = () => {
    const newItem = { id: generateId(), name: "", kind: getKind() } as T;
    if (onAdd) {
      onAdd(newItem);
    } else if (onChange) {
      onChange([...items, newItem]);
    }
    if (variant === "consume" || field === "consumedEvents") {
      setActiveConfigItem({ type: "event", id: newItem.id, nodeId });
    } else {
      setEditingId(newItem.id);
      setEditingName("");
    }
  };

  const isTopicOrEvent =
    resourceType === "topics" ||
    resourceType === "channels" ||
    variant === "publish" ||
    variant === "consume" ||
    field === "publishedEvents" ||
    field === "consumedEvents" ||
    !resourceType;

  const handleUpdate = (id: string, name: string) => {
    const sanitizedName = isTopicOrEvent ? sanitizeTopicName(name) : name;
    if (onUpdate) {
      onUpdate(id, sanitizedName);
    } else if (onChange) {
      onChange(
        items.map((item) => (item.id === id ? { ...item, name: sanitizedName } : item)) as T[],
      );
    }
  };

  const handleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
    } else if (onChange) {
      onChange(items.filter((item) => item.id !== id));
    }
  };

  const handleUpdateItem = (
    id: string,
    changes: Partial<AnyMessagingResource>,
  ) => {
    if (onUpdateItem) {
      onUpdateItem(id, changes as Partial<T>);
    } else if (onChange) {
      onChange(
        items.map((item) =>
          item.id === id ? { ...item, ...changes } : item,
        ) as T[],
      );
    }
  };

  if (asCard) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            {title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs bg-secondary/50 hover:bg-secondary border border-border/50"
            onClick={handleAdd}
          >
            <Plus size={14} className="mr-1.5 text-muted-foreground" /> Add
            Event
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <MessagingResourceRow
              key={item.id || `item-${index}`}
              nodeId={nodeId}
              item={item}
              isEditing={editingId === item.id}
              setEditingId={setEditingId}
              editingName={editingName}
              setEditingName={setEditingName}
              handleUpdate={handleUpdate}
              handleDelete={handleDelete}
              handleUpdateItem={handleUpdateItem}
              variant={variant}
              resourceType={resourceType}
              field={field}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={handleAdd}
        >
          <Plus size={12} />
        </div>
      </div>

      <div className="flex flex-col">
        {items.map((item, index) => (
          <MessagingResourceRow
            key={item.id || `item-${index}`}
            nodeId={nodeId}
            item={item}
            isEditing={editingId === item.id}
            setEditingId={setEditingId}
            editingName={editingName}
            setEditingName={setEditingName}
            handleUpdate={handleUpdate}
            handleDelete={handleDelete}
            handleUpdateItem={handleUpdateItem}
            variant={variant}
            resourceType={resourceType}
            field={field}
          />
        ))}
      </div>
    </>
  );
};
