"use client";

import React from "react";
import { Resizable } from "re-resizable";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Globe,
  Compass,
  Server,
  Waves,
  Database,
  HardDrive,
  Network,
  ShieldCheck,
  Shuffle,
  PlusSquare,
  DatabaseZap,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
  Anchor,
  Layout,
  LayoutTemplate,
  Braces,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import {
  getUniqueNodeLabel,
  DEFAULT_DATABASE_NODE_LABEL,
  DEFAULT_DATABASE_ENGINE,
  DEFAULT_DATABASE_ENV_VARS,
} from "@workspace/canvas";
import { getOffsetPosition } from "./hooks/useCanvasHandlers";
import { useSchemaAutoLayout } from "./hooks/useAutoLayout";
import { useCanvasCenterPosition } from "./hooks/useCanvasCenterPosition";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { createGraphNodeData } from "./GraphView/utils";
import type { GraphNodeType, BackendCanvasView } from "@workspace/canvas";

interface NodePaletteSidebarProps {
  view?: BackendCanvasView;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function NodePaletteSidebar({
  view = "graph",
  isOpen: propIsOpen,
  onToggle: propOnToggle,
}: NodePaletteSidebarProps) {
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const addTableNode = useBackendCanvasStore((s) => s.addTableNode);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const storePaletteOpen = useSidebarStore((s) => s.paletteOpen);
  const storeTogglePalette = useSidebarStore((s) => s.togglePalette);
  const paletteWidth = useSidebarStore((s) => s.paletteWidth);
  const setPaletteWidth = useSidebarStore((s) => s.setPaletteWidth);

  const isOpen = propIsOpen !== undefined ? propIsOpen : storePaletteOpen;
  const onToggle = propOnToggle || storeTogglePalette;

  const { getCenterPosition } = useCanvasCenterPosition(isOpen);

  const handleAddGraphNode = (type: GraphNodeType, label: string) => {
    const isContainer = type === "webAppGroup";
    const width = isContainer ? 560 : 220;
    const height = isContainer ? 380 : 100;
    const { x, y } = getCenterPosition(width, height);
    const data = createGraphNodeData(type, label, nodes);

    addNode({
      id: crypto.randomUUID(),
      type,
      position: { x, y },
      style: isContainer ? { width: 560, height: 380 } : undefined,
      width: isContainer ? 560 : undefined,
      height: isContainer ? 380 : undefined,
      data,
    });
  };

  const [isResizing, setIsResizing] = React.useState(false);

  return (
    <>
      {/* Sleek Floating Trigger (CSS-only smooth fade & slide) */}
      <button
        type="button"
        onClick={onToggle}
        className={`pointer-events-auto absolute top-3 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sidebar/95 backdrop-blur-md border border-sidebar-border shadow-lg text-xs font-semibold text-sidebar-foreground hover:bg-sidebar-accent select-none group transition-all duration-300 ease-in-out ${
          isOpen
            ? "opacity-0 -translate-x-4 pointer-events-none scale-95"
            : "opacity-100 translate-x-0 pointer-events-auto scale-100"
        }`}
        title="Open Tools Palette"
      >
        <PanelLeft className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
        <span className="font-semibold text-[11px]">Palette</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* Direct Resizable Sidebar Container */}
      <Resizable
        size={{ width: isOpen ? paletteWidth : 0, height: "100%" }}
        minWidth={isOpen ? 170 : 0}
        maxWidth={380}
        enable={{ right: isOpen }}
        onResizeStart={() => setIsResizing(true)}
        onResizeStop={(e, direction, ref, d) => {
          setIsResizing(false);
          setPaletteWidth(paletteWidth + d.width);
        }}
        handleClasses={{
          right:
            "w-1.5 bg-sidebar-border hover:bg-primary cursor-col-resize transition-colors z-30 hover:w-2",
        }}
        className={`h-full pointer-events-auto shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border shadow-xl z-20 select-none font-sans overflow-hidden ${
          isResizing
            ? ""
            : "transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        } ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none border-r-0"
        }`}
      >
          {/* Header */}
          <div className="h-10 px-3 border-b border-sidebar-border flex items-center justify-between shrink-0 bg-sidebar-accent/20">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tracking-wide uppercase text-sidebar-foreground">
                {view === "schema" ? "Schema Tools" : "Node Palette"}
              </span>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                BETA
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded"
              onClick={onToggle}
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>

          {/* Body */}
          {view === "schema" ? (
            <SchemaViewBody
              nodes={nodes}
              addNode={addNode}
              getCenterPosition={getCenterPosition}
            />
          ) : (
            <div className="flex-1 p-2.5 space-y-1.5 overflow-y-auto hide-scrollbar">
              {/* COMPUTING */}
              <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-1">
                Computing
              </div>
              {/* WEB APP / CLIENT GROUP */}
              <div className="flex flex-col gap-1.5 p-1.5 rounded-lg bg-sidebar-accent/20 border border-sidebar-border/60">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-muted-foreground" />
                  Web App
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() => handleAddGraphNode("webApp", "")}
                >
                  <Globe className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Web App
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() => handleAddGraphNode("webPage", "")}
                >
                  <Globe className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Web Page
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() => handleAddGraphNode("page_ref", "")}
                >
                  <Compass className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Page Ref
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() => handleAddGraphNode("auth", "")}
                >
                  <ShieldCheck className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Auth Node
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("hook", "")
                  }
                >
                  <Anchor className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  React Hook
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("hook_ref", "")
                  }
                >
                  <Anchor className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Hook Ref
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("state_store", "")
                  }
                >
                  <Database className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  State Store
                </Button>
              </div>

              {/* SERVICE & BACKEND GROUP */}
              <div className="flex flex-col gap-1.5 p-1.5 rounded-lg bg-sidebar-accent/20 border border-sidebar-border/60">
                <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-muted-foreground" />
                  Service & Backend
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() => handleAddGraphNode("service", "")}
                >
                  <Server className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Service
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("transformer", "")
                  }
                >
                  <Shuffle className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Transformer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("transformer_ref", "")
                  }
                >
                  <Shuffle className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Global Ref
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                  onClick={() =>
                    handleAddGraphNode("types", "")
                  }
                >
                  <Braces className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                  Custom Types
                </Button>
              </div>

              {/* MESSAGING */}
              <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-2 pb-0.5 border-t border-sidebar-border mt-1">
                Messaging
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() => handleAddGraphNode("kafka", "")}
              >
                <Waves className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Kafka
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() =>
                  handleAddGraphNode("redis-streams", "")
                }
              >
                <Waves className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Redis Streams
              </Button>

              {/* STORAGE */}
              <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-2 pb-0.5 border-t border-sidebar-border mt-1">
                Storage
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() => handleAddGraphNode("db_ref", "")}
              >
                <Database className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Database
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() => handleAddGraphNode("redis-cache", "")}
              >
                <Database className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Redis Cache
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() =>
                  handleAddGraphNode("storage", "")
                }
              >
                <HardDrive className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Storage Bucket
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() =>
                  handleAddGraphNode("vector_db_ref", "")
                }
              >
                <Database className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                Vector DB
              </Button>

              {/* EXTERNAL */}
              <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-2 pb-0.5 border-t border-sidebar-border mt-1">
                External
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() => handleAddGraphNode("external", "")}
              >
                <Globe className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                External API
              </Button>

              {/* AI */}
              <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-2 pb-0.5 border-t border-sidebar-border mt-1">
                AI
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
                onClick={() =>
                  handleAddGraphNode("langgraph", "")
                }
              >
                <Network className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                LangGraph Agent
              </Button>
            </div>
          )}
        </Resizable>
    </>
  );
}

// ---------------------------------------------------------------------------
// Schema sidebar body – all add-node actions (previously floating right Panel)
// ---------------------------------------------------------------------------
interface SchemaViewBodyProps {
  nodes: ReturnType<typeof useBackendCanvasStore.getState>["nodes"];
  addNode: ReturnType<typeof useBackendCanvasStore.getState>["addNode"];
  getCenterPosition: (width?: number, height?: number) => { x: number; y: number };
}

function SchemaViewBody({ nodes, addNode, getCenterPosition }: SchemaViewBodyProps) {
  const schemaNodes = React.useMemo(
    () =>
      nodes.filter(
        (n) =>
          n.type === "entity" ||
          n.type === "database" ||
          n.type === "redis_instance" ||
          n.type === "redis_schema",
      ),
    [nodes],
  );
  const { handleLayout } = useSchemaAutoLayout({ nodes: schemaNodes, edges: [] });

  const handleAddDatabase = () => {
    const { x, y } = getCenterPosition(200, 80);
    addNode({
      id: crypto.randomUUID(),
      type: "database",
      position: { x, y },
      data: {
        label: "",
        dbEngine: DEFAULT_DATABASE_ENGINE,
        dbType: "relational",
        dbCategory: "sql",
        dbConnectionType: "env_var",
        connectionStringEnv: DEFAULT_DATABASE_ENV_VARS.connectionStringEnv,
        dbFilePathEnv: DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv,
        color: "#f59e0b",
        isDefault: true,
      },
    });
  };

  const handleAddTable = () => {
    const { x, y } = getCenterPosition(200, 80);

    let dbNode = nodes.find((n) => n.type === "database" && n.data?.dbEngine !== "redis");
    let dbId = dbNode?.id;

    if (!dbId) {
      dbId = crypto.randomUUID();
      addNode({
        id: dbId,
        type: "database",
        position: { x: x - 250, y: y - 100 },
        data: {
          label: "",
          dbEngine: DEFAULT_DATABASE_ENGINE,
          dbType: "relational",
          dbCategory: "sql",
          dbConnectionType: "env_var",
          connectionStringEnv: DEFAULT_DATABASE_ENV_VARS.connectionStringEnv,
          dbFilePathEnv: DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv,
          color: "#f59e0b",
          isDefault: true,
        },
      });
    }

    const tableId = crypto.randomUUID();
    addNode({
      id: tableId,
      type: "entity",
      position: { x, y },
      data: {
        label: "",
        columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
        indexes: [],
        databaseId: dbId,
      },
    });

    if (dbId) {
      useBackendCanvasStore.getState().addEdge({
        id: `edge-${dbId}-${tableId}`,
        source: dbId,
        target: tableId,
        sourceHandle: "database-source",
        targetHandle: "database-entity-target",
        type: "database-connection",
      });
    }
  };

  const handleAddVectorDb = () => {
    const { x, y } = getCenterPosition(200, 80);

    let dbNode = nodes.find((n) => n.type === "database" && n.data?.dbEngine !== "redis");
    let dbId = dbNode?.id;

    if (!dbId) {
      dbId = crypto.randomUUID();
      addNode({
        id: dbId,
        type: "database",
        position: { x: x - 250, y: y - 100 },
        data: {
          label: "",
          dbEngine: DEFAULT_DATABASE_ENGINE,
          dbType: "relational",
          dbCategory: "sql",
          dbConnectionType: "env_var",
          connectionStringEnv: DEFAULT_DATABASE_ENV_VARS.connectionStringEnv,
          dbFilePathEnv: DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv,
          color: "#f59e0b",
          isDefault: true,
        },
      });
    }

    const tableId = crypto.randomUUID();
    addNode({
      id: tableId,
      type: "entity",
      position: { x, y },
      data: {
        label: "",
        dbType: "vector",
        columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
        databaseId: dbId,
      },
    });

    if (dbId) {
      useBackendCanvasStore.getState().addEdge({
        id: `edge-${dbId}-${tableId}`,
        source: dbId,
        target: tableId,
        sourceHandle: "database-source",
        targetHandle: "database-entity-target",
        type: "database-connection",
      });
    }
  };

  const handleAddRedisInstance = () => {
    const { x, y } = getCenterPosition(200, 80);
    const redisInstances = nodes.filter(
      (n) => n.type === "redis_instance" || (n.type === "database" && n.data?.dbEngine === "redis"),
    );
    const assignedPort = String(6379 + redisInstances.length);
    const connEnv = redisInstances.length === 0 ? "REDIS_URL" : `REDIS_${redisInstances.length + 1}_URL`;

    addNode({
      id: crypto.randomUUID(),
      type: "redis_instance",
      position: { x, y },
      data: {
        label: "",
        dbEngine: "redis",
        dbType: "key-value",
        dbCategory: "nosql",
        dbConnectionType: "env_var",
        connectionStringEnv: connEnv,
        host: "localhost",
        port: assignedPort,
        maxmemoryPolicy: "volatile-lru",
        maxmemory: "2gb",
        persistenceMode: "RDB+AOF",
        color: "#ef4444",
        isDefault: false,
      },
    });
  };

  const handleAddRedisSchema = () => {
    const { x, y } = getCenterPosition(200, 80);

    let redisDbNode = nodes.find(
      (n) => n.type === "redis_instance" || (n.type === "database" && n.data?.dbEngine === "redis"),
    );
    let dbId = redisDbNode?.id;

    if (!dbId) {
      dbId = crypto.randomUUID();
      addNode({
        id: dbId,
        type: "redis_instance",
        position: { x: x - 250, y: y - 100 },
        data: {
          label: "",
          dbEngine: "redis",
          dbType: "key-value",
          dbCategory: "nosql",
          dbConnectionType: "env_var",
          connectionStringEnv: "REDIS_URL",
          host: "localhost",
          port: "6379",
          color: "#ef4444",
          isDefault: false,
        },
      });
    }

    const schemaId = crypto.randomUUID();
    addNode({
      id: schemaId,
      type: "redis_schema",
      position: { x, y },
      data: {
        label: "",
        dbType: "redis",
        redisDataStructure: "hash",
        keyTemplate: "",
        columns: [],
        hashConfig: { fields: [] },
        databaseId: dbId,
      },
    });

    if (dbId) {
      useBackendCanvasStore.getState().addEdge({
        id: `edge-${dbId}-${schemaId}`,
        source: dbId,
        target: schemaId,
        sourceHandle: "database-source",
        targetHandle: "database-entity-target",
        type: "database-connection",
      });
    }
  };

  return (
    <div className="flex-1 p-2.5 space-y-1.5 overflow-y-auto hide-scrollbar">
      <div className="text-[9px] uppercase font-bold text-muted-foreground px-1 pt-1">
        Tables & DBs
      </div>

      {/* SQL / Relational */}
      <Button
        variant="outline"
        size="sm"
        className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
        onClick={handleAddDatabase}
      >
        <Server className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
        Database
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
        onClick={handleAddTable}
      >
        <PlusSquare className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
        Table
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
        onClick={handleAddVectorDb}
      >
        <Database className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
        Vector Collection
      </Button>

      <div className="h-px bg-sidebar-border mx-1" />

      {/* Redis */}
      <div className="flex flex-col gap-1.5 p-1.5 rounded-lg bg-sidebar-accent/20 border border-sidebar-border/60">
        <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <DatabaseZap className="w-3 h-3 text-muted-foreground" />
          Redis
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
          onClick={handleAddRedisInstance}
        >
          <Server className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
          Redis Instance
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
          onClick={handleAddRedisSchema}
        >
          <DatabaseZap className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
          Redis Schema
        </Button>
      </div>

      <div className="h-px bg-sidebar-border mx-1" />

      {/* Auto-layout */}
      <Button
        variant="outline"
        size="sm"
        className="bg-sidebar-accent/50 hover:bg-sidebar-accent border-sidebar-border/60 text-sidebar-foreground text-xs justify-start h-8 shrink-0 w-full"
        onClick={() => handleLayout("LR")}
      >
        <LayoutTemplate className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
        Auto-layout
      </Button>
    </div>
  );
}
