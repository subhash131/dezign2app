import React, { useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Connection,
  useReactFlow,
} from "@xyflow/react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { nodeTypes } from "./backend-nodes/Nodes";
import { ForeignKeyEdge } from "./backend-nodes/ForeignKeyEdge";
import {
  HTTPConnectionEdge,
  MessagingEdge,
  DatabaseRefEdge,
} from "./backend-nodes/CustomEdges";
import {
  isValidConnection,
} from "@workspace/canvas";
import { useCanvasHandlers } from "./hooks/useCanvasHandlers";
import { useSchemaAutoLayout } from "./hooks/useAutoLayout";
import { useAutoLayoutShortcut } from "./hooks/useAutoLayoutShortcut";
import { LayoutTemplate, AlertTriangle } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useSidebarStore, getEffectiveConfigSidebarWidth } from "@/lib/stores/sidebarStore";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
  connection: HTTPConnectionEdge,
  message: MessagingEdge,
  "database-connection": DatabaseRefEdge,
};

interface SchemaViewProps {
  projectId: string;
}

export function SchemaView({ projectId }: SchemaViewProps) {
  const { nodes, edges, onEdgesChange, onConnect, setView } =
    useBackendCanvasStore();

  useEffect(() => {
    setView("schema");
  }, [setView]);

  const {
    handleNodesChange,
    handleNodeDragStart,
    handleSelectionDragStart,
    handleMoveEnd,
  } = useCanvasHandlers(projectId, "schema");
  const { fitView, setViewport } = useReactFlow();
  const { handleLayout } = useSchemaAutoLayout();
  useAutoLayoutShortcut(React.useCallback(() => handleLayout("LR"), [handleLayout]));
  const aiPanelOpen = useSidebarStore((s) => s.aiPanelOpen);
  const aiPanelWidth = useSidebarStore((s) => s.aiPanelWidth);
  const terminalOpen = useSidebarStore((s) => s.terminalOpen);
  const terminalHeight = useSidebarStore((s) => s.terminalHeight);
  const paletteOpen = useSidebarStore((s) => s.paletteOpen);
  const paletteWidth = useSidebarStore((s) => s.paletteWidth);
  const configSidebarWidth = useSidebarStore((s) => s.configSidebarWidth);
  const configSidebarOpen = useSidebarStore((s) => s.configSidebarOpen);
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);
  const isConfigOpen = Boolean(activeConfigItem) || configSidebarOpen;
  const effectiveConfigWidth = getEffectiveConfigSidebarWidth(configSidebarWidth);
  const schemaNodes = React.useMemo(() => {
    const filtered = nodes.filter(
      (n) =>
        n.type === "entity" ||
        n.type === "database" ||
        n.type === "redis_instance" ||
        n.type === "redis_schema" ||
        n.type === "group",
    );
    // Sort group nodes to the beginning so they render behind entity nodes,
    // and ensure their dimensions are explicitly preserved on the node style
    return filtered
      .map((n) => {
        if (n.type === "group") {
          const styleW = typeof n.style?.width === "number" ? n.style.width : undefined;
          const styleH = typeof n.style?.height === "number" ? n.style.height : undefined;
          const w = typeof n.width === "number" && n.width > 0 ? n.width : (styleW ?? 450);
          const h = typeof n.height === "number" && n.height > 0 ? n.height : (styleH ?? 280);

          return {
            ...n,
            parentId: undefined,
            zIndex: -1,
            width: w,
            height: h,
            style: {
              ...n.style,
              width: w,
              height: h,
              zIndex: -1,
            },
          };
        }
        return {
          ...n,
          parentId: undefined,
          zIndex: 1,
          style: {
            ...n.style,
            zIndex: 1,
          },
        };
      })
      .sort((a, b) => {
        if (a.type === "group" && b.type !== "group") return -1;
        if (a.type !== "group" && b.type === "group") return 1;
        return 0;
      });
  }, [nodes]);
  const schemaNodeIds = React.useMemo(
    () => new Set(schemaNodes.map((n) => n.id)),
    [schemaNodes],
  );
  const schemaEdges = React.useMemo(
    () =>
      edges.filter(
        (e) =>
          (e.type === "foreign-key" ||
            e.type === "database-connection" ||
            e.type === "connection") &&
          schemaNodeIds.has(e.source) &&
          schemaNodeIds.has(e.target),
      ),
    [edges, schemaNodeIds],
  );

  const duplicateDbNames = React.useMemo(() => {
    const counts = new Map<string, number>();
    const storageNodes = schemaNodes.filter(
      (n) => n.type === "database" || n.type === "redis_instance",
    );
    storageNodes.forEach((n) => {
      const name = (n.data?.label || "").trim().toLowerCase();
      if (name) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
  }, [schemaNodes]);

  const hasFitted = useRef(false);
  useEffect(() => {
    if (schemaNodes.length > 0 && !hasFitted.current) {
      hasFitted.current = true;
      const savedViewport = localStorage.getItem(`canvas_viewport_${projectId}_schema`);
      if (savedViewport) {
        try {
          const parsed = JSON.parse(savedViewport);
          setViewport(parsed);
          return;
        } catch {
          // fallback to fitView
        }
      }
      fitView({ padding: 0.35, maxZoom: 0.65, duration: 0 });
    }
  }, [schemaNodes.length, fitView, setViewport, projectId]);


  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={schemaNodes}
        edges={schemaEdges}
        fitView
        fitViewOptions={{ padding: 0.35, maxZoom: 0.65 }}
        elevateEdgesOnSelect={true}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={handleNodeDragStart}
        onSelectionDragStart={handleSelectionDragStart}
        deleteKeyCode={["Delete"]}
        onBeforeDelete={async () => {
          const activeEl = typeof document !== "undefined" ? document.activeElement : null;
          if (
            activeEl instanceof HTMLElement &&
            (activeEl.tagName === "INPUT" ||
              activeEl.tagName === "TEXTAREA" ||
              activeEl.tagName === "SELECT" ||
              activeEl.isContentEditable ||
              Boolean(
                activeEl.closest(
                  "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [data-inspector], .inspector-sidebar, .nodrag"
                )
              ))
          ) {
            return false;
          }
          return true;
        }}
        onConnect={onConnect}
        isValidConnection={(connection: Connection) => {
          const src = nodes.find((n) => n.id === connection.source);
          const tgt = nodes.find((n) => n.id === connection.target);
          if (!src || !tgt) return false;

          if (src.type === "redis_instance" && tgt.type !== "redis_schema" && tgt.data?.dbType !== "redis") {
            return false;
          }
          if (src.type === "database" && (tgt.type === "redis_schema" || tgt.data?.dbType === "redis")) {
            return false;
          }
          if (tgt.type === "redis_schema" && src.type !== "redis_instance" && src.data?.dbEngine !== "redis") {
            return false;
          }

          return isValidConnection(
            src.type,
            connection.sourceHandle,
            tgt.type,
            connection.targetHandle,
          ).valid;
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onMoveEnd={handleMoveEnd}
        attributionPosition="bottom-right"
        minZoom={0.01}
        maxZoom={3}
      >
        <Background gap={12} size={1} />
        <Controls
          position="bottom-left"
          fitViewOptions={{ padding: 0.35, maxZoom: 0.65 }}
          style={{
            bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
            left: paletteOpen ? `${paletteWidth + 14}px` : "16px",
            transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        />
        <MiniMap
          position="bottom-right"
          style={{
            bottom: terminalOpen ? `${terminalHeight + 14}px` : "16px",
            right: isConfigOpen
              ? `${effectiveConfigWidth + 16}px`
              : aiPanelOpen
                ? `${aiPanelWidth + 16}px`
                : "16px",
            transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)",
          }}
        />

        {/* Floating Top-Left Auto Layout Panel */}
        <Panel
          position="top-left"
          className="pointer-events-auto select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-10"
          style={{
            top: "68px",
            left: paletteOpen ? `${paletteWidth + 16}px` : "124px",
          }}
        >
          <div className="flex items-center gap-1 p-1 rounded-xl bg-sidebar/95 backdrop-blur-md border border-sidebar-border shadow-lg">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
              onClick={() => handleLayout("LR")}
              title="Auto-arrange schema tables in left-to-right flow (Shift + A)"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-primary" />
              <span>Auto layout</span>
              <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium text-muted-foreground/80 bg-sidebar-accent/80 border border-sidebar-border px-1 py-0.5 rounded leading-none ml-0.5">
                ⇧A
              </kbd>
            </Button>
          </div>
        </Panel>

        {/* Floating Duplicate Database Name Warning Banner */}
        {duplicateDbNames.length > 0 && (
          <Panel
            position="top-center"
            className="pointer-events-auto select-none transition-all duration-300 z-20"
            style={{ top: "68px" }}
          >
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 backdrop-blur-md shadow-lg text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
              <span>
                Duplicate database name{duplicateDbNames.length > 1 ? "s" : ""} detected:{" "}
                <strong>{duplicateDbNames.map((n) => `"${n}"`).join(", ")}</strong>. Each database and Redis instance must have a unique name.
              </span>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
