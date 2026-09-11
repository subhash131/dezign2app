import React, { useState } from "react";
import { Trash } from "lucide-react";
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
  SERVICE_TECH_OPTIONS,
  WEB_CLIENT_TECH_OPTIONS,
} from "@/types/canvas";
import { parsePageRoute } from "@workspace/canvas";
import { LocalInput } from "./LocalInput";
import { toast } from "sonner";

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
  const [isEditing, setIsEditing] = useState(!data.label || data.label.trim() === "");
  const [name, setName] = useState(data.label || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

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
      const edges = store.edges;
      const connectedPageIds = edges
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
    const trimmed = name.trim();
    if (!trimmed) {
      if (!data.label || data.label.trim() === "") {
        removeNode();
        return;
      }
      setName(data.label);
      setIsEditing(false);
      return;
    }
    let finalLabel = trimmed;
    if (nodeType === "webPage") {
      finalLabel = parsePageRoute(finalLabel) || finalLabel;
    }

    const allNodes = useBackendCanvasStore.getState().nodes;
    const isDuplicate = allNodes.some(
      (n) =>
        n.id !== id &&
        (n.type === nodeType || (nodeType === "service" && n.type === "service")) &&
        (n.data?.label || "").trim().toLowerCase() === finalLabel.toLowerCase(),
    );

    if (isDuplicate) {
      const typeLabel = nodeType === "service" ? "Service" : title || "Node";
      toast.error(`${typeLabel} name "${finalLabel}" is already used!`);
      if (data.label && data.label.trim()) {
        setName(data.label);
        setIsEditing(false);
      } else {
        setIsEditing(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }
      return;
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
        "px-3 py-2 border-b flex flex-col gap-1.5 group rounded-t-xl",
        colorClass,
      )}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center flex-1 min-w-0">
          {Icon ? (
            <Icon
              size={14}
              className="mr-2 shrink-0"
              style={iconColor ? { color: iconColor } : undefined}
            />
          ) : null}
          {leftElement}
          {isEditing ? (
            <div
              className="nodrag nowheel nopan flex-1 min-w-0"
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
                className="h-6 text-xs px-1 bg-background/50 font-mono nodrag"
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
            </div>
          ) : (
            <div
              className="flex flex-col cursor-pointer flex-1 min-w-0"
              onClick={() => setIsEditing(true)}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                {title && (
                  <span className="text-[9px] uppercase font-bold tracking-wider truncate">
                    {title}
                  </span>
                )}
                {badges}
              </div>
              <span className="font-semibold text-sm truncate">
                {data.label || "Untitled"}
              </span>
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
