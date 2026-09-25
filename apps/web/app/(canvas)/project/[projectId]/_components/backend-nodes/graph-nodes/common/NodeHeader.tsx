import React, { useState, useMemo } from "react";
import { Trash, AlertTriangle } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  BackendNode,
  BackendEdge,
  SERVICE_TECH_OPTIONS,
  WEB_CLIENT_TECH_OPTIONS,
} from "@/types/canvas";
import {
  parsePageRoute,
  getUniqueNodeLabel,
  DEFAULT_DATABASE_NODE_LABEL,
  arePageRoutesEqual,
} from "@workspace/canvas";
import { LocalInput } from "./LocalInput";
import { toast } from "sonner";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  conflictType?: string;
  conflictNodeId?: string;
}

export function checkNodeNameDuplicate(
  id: string,
  rawLabel: string | undefined,
  nodeType: string | undefined,
  nodes: BackendNode[],
  edges: BackendEdge[],
): DuplicateCheckResult {
  const trimmed = (rawLabel || "").trim();
  if (!trimmed) return { isDuplicate: false };
  const lower = trimmed.toLowerCase();

  // 1. WebPage nodes: only collide with sibling pages connected to the same WebApp
  if (nodeType === "webPage") {
    if (lower === "layout") return { isDuplicate: false };
    const webAppEdge = edges.find(
      (e) =>
        (e.source === id || e.target === id) &&
        nodes.find((n) => n.id === (e.source === id ? e.target : e.source))?.type === "webApp",
    );
    if (webAppEdge) {
      const webAppId = webAppEdge.source === id ? webAppEdge.target : webAppEdge.source;
      const siblingPageEdges = edges.filter((e) => e.source === webAppId || e.target === webAppId);
      const conflict = siblingPageEdges
        .map((e) => nodes.find((n) => n.id === (e.source === webAppId ? e.target : e.source)))
        .find((other) => {
          if (!other || other.id === id || other.type !== "webPage") return false;
          if (other.data?.isLayout || other.data?.label?.trim().toLowerCase() === "layout") return false;
          return arePageRoutesEqual(other.data?.label || other.data?.path || "", trimmed);
        });
      if (conflict) {
        return { isDuplicate: true, conflictType: "Web Page", conflictNodeId: conflict.id };
      }
    }
    return { isDuplicate: false };
  }

  // 2. Apps scope: Service, WebApp, LangGraph all deploy into apps/<folder> in the monorepo root.
  // They collide with each other!
  if (nodeType === "service" || nodeType === "webApp" || nodeType === "langgraph") {
    const conflict = nodes.find(
      (n) =>
        n.id !== id &&
        (n.type === "service" || n.type === "webApp" || n.type === "langgraph") &&
        (n.data?.label || "").trim().toLowerCase() === lower,
    );
    if (conflict) {
      const conflictType =
        conflict.type === "webApp"
          ? "Web App"
          : conflict.type === "service"
            ? "Service"
            : "LangGraph App";
      return { isDuplicate: true, conflictType, conflictNodeId: conflict.id };
    }
    return { isDuplicate: false };
  }

  // 3. Database Entity (Table): collides with other entities
  if (nodeType === "entity") {
    const conflict = nodes.find(
      (n) =>
        n.id !== id &&
        n.type === "entity" &&
        (n.data?.label || "").trim().toLowerCase() === lower,
    );
    if (conflict) {
      return { isDuplicate: true, conflictType: "Table", conflictNodeId: conflict.id };
    }
    return { isDuplicate: false };
  }

  // 4. Storage Buckets: collides with other storage nodes
  if (nodeType === "storage") {
    const conflict = nodes.find(
      (n) =>
        n.id !== id &&
        n.type === "storage" &&
        (n.data?.label || "").trim().toLowerCase() === lower,
    );
    if (conflict) {
      return { isDuplicate: true, conflictType: "Storage Bucket", conflictNodeId: conflict.id };
    }
    return { isDuplicate: false };
  }

  // 5. General resource: collides with other nodes of the same type
  if (nodeType) {
    const conflict = nodes.find(
      (n) =>
        n.id !== id &&
        n.type === nodeType &&
        (n.data?.label || "").trim().toLowerCase() === lower,
    );
    if (conflict) {
      return { isDuplicate: true, conflictType: conflict.type || "Node", conflictNodeId: conflict.id };
    }
  }

  return { isDuplicate: false };
}

export interface NodeHeaderProps {
  id: string;
  data: BackendNode["data"];
  nodeType?: string;
  icon?: React.ElementType;
  title?: string;
  colorClass?: string;
  style?: React.CSSProperties;
  iconColor?: string;
  selected?: boolean;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  badges?: React.ReactNode;
  placeholder?: string;
  onSave?: (newLabel: string) => void;
  onDelete?: () => void;
}

export const NodeHeader = ({
  id,
  data,
  nodeType,
  icon: Icon,
  title,
  colorClass,
  style,
  iconColor,
  selected,
  leftElement,
  rightElement,
  badges,
  placeholder,
  onSave,
  onDelete,
}: NodeHeaderProps) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const deleteNodes = useBackendCanvasStore((s) => s.deleteNodes);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);

  const [isEditing, setIsEditing] = useState(!data.label || data.label.trim() === "");
  const [name, setName] = useState(data.label || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { isDuplicate, conflictType } = useMemo(() => {
    return checkNodeNameDuplicate(id, data.label, nodeType, allNodes, edges);
  }, [id, data.label, nodeType, allNodes, edges]);

  const { isDuplicate: isInputDuplicate, conflictType: inputConflictType } = useMemo(() => {
    if (!isEditing || !name.trim()) return { isDuplicate: false };
    return checkNodeNameDuplicate(id, name.trim(), nodeType, allNodes, edges);
  }, [id, name, isEditing, nodeType, allNodes, edges]);

  React.useEffect(() => {
    setName(data.label || "");
    if (!data.label || data.label.trim() === "") {
      setIsEditing(true);
    }
  }, [data.label]);

  React.useEffect(() => {
    if (isEditing) {
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

  const removeNode = () => {
    if (onDelete) {
      onDelete();
      return;
    }

    const store = useBackendCanvasStore.getState();
    if (nodeType === "webApp") {
      const currentEdges = store.edges;
      const connectedPageIds = currentEdges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => (e.source === id ? e.target : e.source))
        .filter((otherId) => {
          const otherNode = store.nodes.find((n) => n.id === otherId);
          return otherNode?.type === "webPage";
        });
      if (connectedPageIds.length > 0) {
        store.deleteNodes([id, ...connectedPageIds]);
        return;
      }
    }

    store.deleteNode(id);
  };

  const handleSave = () => {
    let trimmed = name.trim();
    if (!trimmed) {
      if (data.label && data.label.trim() !== "") {
        setName(data.label);
        setIsEditing(false);
        return;
      }
      // If there was no existing label, assign a safe unique default label instead of deleting the node
      const defaultBase =
        nodeType === "database"
          ? DEFAULT_DATABASE_NODE_LABEL
          : nodeType === "entity"
            ? (title || "table")
            : nodeType === "webApp"
              ? "Web App"
              : nodeType === "service"
                ? "Service"
                : nodeType === "webPage"
                  ? "/page"
                  : title || "Node";
      trimmed = getUniqueNodeLabel(allNodes, defaultBase, nodeType || "node");
    }
    let finalLabel = trimmed;
    if (nodeType === "webPage") {
      finalLabel = parsePageRoute(finalLabel) || finalLabel;
    }

    const dupCheck = checkNodeNameDuplicate(id, finalLabel, nodeType, allNodes, edges);
    if (dupCheck.isDuplicate) {
      toast.warning(
        `"${finalLabel}" is already used by a ${dupCheck.conflictType || "node"}. Please change it to avoid conflicts.`,
      );
    }

    if (onSave) {
      onSave(finalLabel);
    } else {
      updateNode(id, { data: { ...data, label: finalLabel } });
    }
    setName(finalLabel);
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (!data.label || data.label.trim() === "") {
      removeNode();
      return;
    }
    setName(data.label);
    setIsEditing(false);
  };

  const techOptions =
    nodeType === "service"
      ? SERVICE_TECH_OPTIONS
      : nodeType === "webApp"
        ? WEB_CLIENT_TECH_OPTIONS
        : null;

  const currentTech =
    data.techStack ||
    (nodeType === "service"
      ? "express"
      : nodeType === "webApp"
        ? "nextjs"
        : undefined);
  const currentTechObj =
    techOptions?.find((t) => t.value === currentTech) || techOptions?.[0];
  const versionOptions = currentTechObj?.versions || [];
  const currentVersion =
    data.techVersion ||
    currentTechObj?.defaultVersion ||
    versionOptions[0]?.value;

  return (
    <div
      className={cn(
        "px-3 py-2 border-b flex flex-col gap-1.5 group rounded-t-xl transition-colors duration-200",
        isDuplicate
          ? "bg-red-500/15 border-b-red-500/40 text-red-600 dark:text-red-400 ring-1 ring-red-500/30"
          : colorClass,
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center flex-1 min-w-0">
          {Icon ? (
            <Icon
              size={14}
              className={cn("mr-2 shrink-0", isDuplicate && "text-red-500")}
              style={!isDuplicate && iconColor ? { color: iconColor } : undefined}
            />
          ) : null}
          {leftElement}
          {isEditing ? (
            <div
              className="nodrag nowheel nopan flex-1 min-w-0 flex flex-col"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <LocalInput
                ref={inputRef}
                value={name}
                placeholder={
                  placeholder || `Enter ${title ? title.toLowerCase() : "node"} name...`
                }
                onChange={(e) => {
                  let val = e.target.value;
                  if (nodeType === "webPage") {
                    // In real-time, replace spaces with hyphen for Next.js route format
                    val = val.replace(/\s+/g, "-");
                  }
                  setName(val);
                }}
                className={cn(
                  "h-6 text-xs px-1 bg-background/50 font-mono nodrag",
                  isInputDuplicate &&
                    "border-red-500 ring-1 ring-red-500/50 text-red-600 dark:text-red-400 focus-visible:ring-red-500",
                )}
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancel();
                  }
                }}
                onBlur={handleSave}
              />
              {isInputDuplicate && (
                <span className="text-[10px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1 mt-0.5 animate-pulse">
                  <AlertTriangle size={10} className="shrink-0" />
                  Name in use by a {inputConflictType || "node"}. Please choose a different name.
                </span>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col cursor-pointer flex-1 min-w-0"
              onClick={() => setIsEditing(true)}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                {title && (
                  <span
                    className={cn(
                      "text-[9px] uppercase font-bold tracking-wider truncate",
                      isDuplicate && "text-red-600 dark:text-red-400",
                    )}
                  >
                    {title}
                  </span>
                )}
                {isDuplicate && (
                  <span
                    className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/40 uppercase tracking-wider animate-pulse shrink-0"
                    title={`Duplicate name "${data.label}"! Another ${conflictType || "node"} already uses this name. Click to rename.`}
                  >
                    <AlertTriangle size={9} className="shrink-0" />
                    <span>Duplicate Name</span>
                  </span>
                )}
                {badges}
              </div>
              <span
                className={cn(
                  "font-semibold text-sm truncate",
                  isDuplicate && "text-red-600 dark:text-red-400 font-bold",
                )}
              >
                {data.label || "Untitled"}
              </span>
              {isDuplicate && (
                <span className="text-[9px] text-red-500 dark:text-red-400 font-medium flex items-center gap-1 mt-0.5">
                  <AlertTriangle size={9} className="shrink-0" />
                  Name used by {conflictType || "another node"}. Click to change.
                </span>
              )}
            </div>
          )}
        </div>
        {rightElement}
        <div
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-black/10 transition-all cursor-pointer ml-1 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (onDelete) {
              onDelete();
            } else {
              requestDeleteNode(id);
            }
          }}
          title="Delete Node"
        >
          <Trash size={14} />
        </div>
      </div>

      {techOptions && (
        <div className="flex items-center gap-1.5 nodrag pt-0.5 border-t border-black/5 dark:border-white/5">
          <Select
            value={currentTech}
            onValueChange={(val) => {
              const selectedTech = techOptions.find((t) => t.value === val);
              if (!selectedTech) return;
              updateNode(id, {
                data: {
                  ...data,
                  techStack: selectedTech.value,
                  techVersion: selectedTech.defaultVersion,
                },
              });
            }}
          >
            <SelectTrigger className="h-5 text-[10px] font-semibold bg-background hover:bg-background border-black/10 dark:border-white/10 px-1.5 py-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {techOptions.map((t) => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {versionOptions.length > 0 && (
            <Select
              value={currentVersion}
              onValueChange={(val) => {
                const selectedVersion = versionOptions.find((v) => v.value === val);
                if (!selectedVersion) return;
                updateNode(id, {
                  data: {
                    ...data,
                    techVersion: selectedVersion.value,
                  },
                });
              }}
            >
              <SelectTrigger className="h-5 text-[10px] font-mono font-medium bg-background hover:bg-background border-black/10 dark:border-white/10 px-1.5 py-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versionOptions.map((v) => (
                  <SelectItem
                    key={v.value}
                    value={v.value}
                    className="text-xs font-mono"
                  >
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
};
