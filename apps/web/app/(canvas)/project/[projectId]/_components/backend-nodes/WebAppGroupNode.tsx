import React, { useState, useRef, useEffect } from "react";
import { NodeProps, NodeResizer, Handle, Position } from "@xyflow/react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { Globe, ShieldCheck, Trash, Layers } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const WebAppGroupNode = React.memo(({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const setNodesPendingDeletion = useBackendCanvasStore(
    (s) => s.setNodesPendingDeletion,
  );

  const [isEditing, setIsEditing] = useState(!data.label);
  const [editValue, setEditValue] = useState(data.label || "");
  const [editPort, setEditPort] = useState(data.port ? String(data.port) : "3000");

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const appSlug =
    data.appSlug ||
    (data.label || "web-app").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Narrow boolean selector: does not re-render when nodes are dragged
  const isAuthConnected = useBackendCanvasStore((s) => {
    if (data.authNodeId) return true;
    return s.edges.some((e) => {
      if (e.target === id) {
        if (e.targetHandle === "auth-in" || e.sourceHandle === "auth-out") return true;
        const srcNode = s.nodes.find((n) => n.id === e.source);
        return srcNode?.type === "auth";
      }
      if (e.source === id) {
        if (e.sourceHandle === "auth-in" || e.targetHandle === "auth-out") return true;
        const tgtNode = s.nodes.find((n) => n.id === e.target);
        return tgtNode?.type === "auth";
      }
      return false;
    });
  });

  useEffect(() => {
    setEditValue(data.label || "");
    if (!data.label) {
      setIsEditing(true);
    }
  }, [data.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      if (!data.label || data.label.trim() === "") {
        deleteNode(id);
        return;
      }
      setEditValue(data.label);
      setIsEditing(false);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
        appSlug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        port: String(editPort || "").trim() || "3000",
      },
    });
    setEditValue(trimmed);
    setIsEditing(false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = useBackendCanvasStore.getState().nodes.find((n) => n.id === id);
    if (node) setNodesPendingDeletion([node]);
  };

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border-2 backdrop-blur-md relative pointer-events-auto group transition-all duration-300 shadow-xl overflow-hidden",
          "bg-gradient-to-br from-indigo-950/20 via-background/40 to-slate-950/30",
          selected
            ? "border-indigo-500 shadow-indigo-500/20 ring-2 ring-indigo-500/30"
            : "border-indigo-500/30 hover:border-indigo-500/50",
        )}
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        {/* Background Decorative Mesh Pattern */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(99, 102, 241, 0.4) 1px, transparent 0)`,
            backgroundSize: "24px 24px",
          }}
        />

        {/* Incoming Auth Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="auth-in"
          className={cn(
            CANVAS_HANDLE_CLASS,
            CANVAS_HANDLE_LEFT_OFFSET_CLASS,
            "!bg-indigo-500 border-2 border-background rounded-full",
          )}
          style={{ top: "32px" }}
          title="Connect AuthNode to bind authentication to this App"
        />

        {/* App Container Header Bar */}
        <div
          ref={containerRef}
          className="bg-indigo-950/60 backdrop-blur-md px-4 py-2.5 border-b border-indigo-500/30 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setEditValue(data.label || "");
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0 border border-indigo-500/30">
              <Globe className="w-4 h-4" />
            </div>

            {isEditing ? (
              <div className="flex items-center gap-2 nodrag">
                <input
                  ref={inputRef}
                  value={editValue}
                  placeholder="Enter web app name..."
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") {
                      if (!data.label || data.label.trim() === "") {
                        deleteNode(id);
                        return;
                      }
                      setEditValue(data.label);
                      setIsEditing(false);
                    }
                  }}
                  className="bg-background/80 border border-indigo-500/40 rounded px-2 py-0.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            ) : (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-foreground tracking-wide truncate">
                    {data.label || "Web App"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30 shrink-0">
                    :{data.port || "3000"}
                  </span>
                </div>
                <span className="text-[9px] text-muted-foreground font-mono truncate">
                  apps/{appSlug}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Auth binding badge */}
            <div
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors",
                isAuthConnected
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : "bg-muted/40 text-muted-foreground border-border/40",
              )}
            >
              <ShieldCheck className="w-3 h-3" />
              <span>{isAuthConnected ? "Auth Connected" : "No Auth"}</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 nodrag"
              onClick={handleDelete}
              title="Delete App Container"
            >
              <Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Inner Canvas Helper Text */}
        <div className="p-4 pointer-events-none opacity-40 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Drag & Place WebClient Pages Here</span>
          </div>
          <span>Next.js App Router (v16)</span>
        </div>
      </div>

      <NodeResizer
        color="#6366f1"
        isVisible={selected}
        minWidth={480}
        minHeight={320}
      />
    </>
  );
});
