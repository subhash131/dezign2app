"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Handle, Position, NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { Database, Server, Table2, Settings, Trash, Code2, ChevronDown, ChevronRight, ChevronUp, AlertTriangle, Layers, Maximize2, Minimize2 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  useServiceStepHandLayout,
} from "../../common";
import {
  getEntityDbOperations,
  deriveDbFunctionSignature,
  inferDbOperationReturnType,
  computeDbOpBindings,
} from "@/lib/utils/entityOperationsHelper";
import { toTableName, toVarName } from "@/lib/compiler/utils";
import { DbOperationFunction } from "@workspace/canvas/types";
import {
  CANVAS_ROW_HANDLE_CLASS,
  CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";

export const DatabaseTableRefNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const databaseInstances = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "database" &&
          n.data?.dbEngine !== "redis" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const allEntities = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "entity" &&
          n.data?.dbType !== "vector" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const selectedTable = allEntities.find((e) => e.id === data.tableRef);
  const selectedDatabaseId =
    data.databaseId || selectedTable?.data?.databaseId;
  const selectedDatabase = databaseInstances.find(
    (n) => n.id === selectedDatabaseId,
  );
  const parentDatabase = nodes.find(
    (n) => n.id === (selectedTable?.data?.databaseId || selectedDatabaseId),
  );

  const filteredEntities = useMemo(() => {
    if (!selectedDatabaseId || selectedDatabaseId === "__all__")
      return allEntities;
    const directMatches = allEntities.filter(
      (e) =>
        e.data?.databaseId === selectedDatabaseId ||
        edges.some(
          (edge) =>
            (edge.source === selectedDatabaseId && edge.target === e.id) ||
            (edge.target === selectedDatabaseId && edge.source === e.id),
        ),
    );
    return directMatches.length > 0 ? directMatches : allEntities;
  }, [allEntities, selectedDatabaseId, edges]);

  const operations: DbOperationFunction[] = useMemo(() => {
    if (!selectedTable) return [];
    return getEntityDbOperations(selectedTable, nodes);
  }, [selectedTable, nodes]);

  const isOperationsCollapsed = useSectionCollapseStore((s) =>
    s.isSectionCollapsed(id, "operations"),
  );
  const toggleSectionCollapsed = useSectionCollapseStore(
    (s) => s.toggleSectionCollapsed,
  );

  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (typeof updateNodeInternals === "function") {
      updateNodeInternals(id);
    }
  }, [isOperationsCollapsed, id, updateNodeInternals, operations.length]);

  const {
    cardIndex,
    totalCards,
    hasMultipleCards,
    isStacked,
    toggleStack,
    moveCard,
    bringCardToFront,
  } = useServiceStepHandLayout(id, nodes, edges, updateNode);
  const [isHovered, setIsHovered] = useState(false);

  const hasAnyConnectedOperation = useMemo(() => {
    return edges.some(
      (e) =>
        (e.target === id &&
          operations.some(
            (op) =>
              e.targetHandle === `func-${op.name}` ||
              e.targetHandle === `func-${op.id}` ||
              (!e.targetHandle && op === operations[0]),
          )) ||
        (e.source === id &&
          operations.some(
            (op) =>
              e.sourceHandle === `func-${op.name}` ||
              e.sourceHandle === `func-out-${op.name}` ||
              e.sourceHandle === `func-${op.id}` ||
              e.sourceHandle === `func-out-${op.id}` ||
              (!e.sourceHandle && op === operations[0]),
          )),
    );
  }, [edges, id, operations]);

  const engineName =
    selectedDatabase?.data?.dbEngine ||
    parentDatabase?.data?.dbEngine ||
    selectedDatabase?.data?.dbType ||
    parentDatabase?.data?.dbType;

  const findLinkedStep = (
    nodeId: string,
    nodeStepId?: string,
    nodeEndpointId?: string,
    nodeConsumedEventId?: string,
  ) => {
    const store = useBackendCanvasStore.getState();
    // 1. Check endpoints
    for (const ep of store.endpoints) {
      if (nodeEndpointId && ep.id !== nodeEndpointId) continue;
      const steps = ep.pipelineSteps || [];
      const step = steps.find(
        (s) => (nodeStepId && s.id === nodeStepId) || s.dbRefNodeId === nodeId,
      );
      if (step) {
        return { containerType: "endpoint" as const, containerId: ep.id, step, steps };
      }
    }
    if (nodeEndpointId) {
      for (const ep of store.endpoints) {
        const steps = ep.pipelineSteps || [];
        const step = steps.find(
          (s) => (nodeStepId && s.id === nodeStepId) || s.dbRefNodeId === nodeId,
        );
        if (step) {
          return { containerType: "endpoint" as const, containerId: ep.id, step, steps };
        }
      }
    }
    // 2. Check events
    for (const ev of store.events || []) {
      if (nodeConsumedEventId && ev.id !== nodeConsumedEventId) continue;
      const steps = ev.pipelineSteps || [];
      const step = steps.find(
        (s) => (nodeStepId && s.id === nodeStepId) || s.dbRefNodeId === nodeId,
      );
      if (step) {
        return { containerType: "event" as const, containerId: ev.id, step, steps };
      }
    }
    // 3. Fallback: check connected edge
    const edge = store.edges.find((e) => e.source === nodeId || e.target === nodeId);
    if (edge) {
      const targetHandle = edge.source === nodeId ? edge.targetHandle : edge.sourceHandle;
      if (targetHandle) {
        if (targetHandle.startsWith("endpoint-in-")) {
          const epId = targetHandle.replace("endpoint-in-", "");
          const ep = store.endpoints.find((e) => e.id === epId);
          if (ep) {
            const step = (ep.pipelineSteps || []).find((s) => s.type === "db_operation");
            if (step) {
              return { containerType: "endpoint" as const, containerId: ep.id, step, steps: ep.pipelineSteps || [] };
            }
          }
        } else if (targetHandle.startsWith("consumedEvents-in-")) {
          const evId = targetHandle.replace("consumedEvents-in-", "");
          const ev = (store.events || []).find((e) => e.id === evId);
          if (ev) {
            const step = (ev.pipelineSteps || []).find((s) => s.type === "db_operation");
            if (step) {
              return { containerType: "event" as const, containerId: ev.id, step, steps: ev.pipelineSteps || [] };
            }
          }
        }
      }
    }
    return null;
  };

  const handleSelectOperation = (op: DbOperationFunction) => {
    if (!selectedTable) return;
    const linked = findLinkedStep(id, data.stepId, data.endpointId, data.consumedEventId);
    if (!linked) return;

    const tableLabel = selectedTable.data?.label || selectedTable.data?.tableRef || "table";
    const importPath = `@workspace/db/helpers/${toTableName(tableLabel)}`;
    const varName = `${toVarName(op.name)}Result`;
    const liveSig =
      deriveDbFunctionSignature(op.name, op.params, op.returnType) || op.signature;

    const returnTypeStr =
      (op.code && op.code.trim() ? inferDbOperationReturnType(op.code) : null) ||
      op.returnType ||
      "any";
    const isArrayOp = Boolean(
      op.kind === "findAll" ||
        (op.name || "").toLowerCase().includes("findall") ||
        (returnTypeStr && (returnTypeStr.includes("[]") || returnTypeStr.includes("Array<"))),
    );

    const schemaFields = isArrayOp
      ? []
      : op.kind === "delete"
      ? [
          { name: "success", type: "boolean", required: true },
          { name: "message", type: "string", required: true },
        ]
      : (selectedTable.data?.columns || []).map((c: any) => ({
          name: c.name,
          type: c.type || "string",
          required: Boolean(c.isPrimaryKey || c.isNotNull),
        }));

    const nextBindings = computeDbOpBindings(
      op,
      selectedTable,
      [],
      [],
      { name: op.name, signature: liveSig },
    );

    const updatedStep = {
      ...linked.step,
      operationId: op.id,
      functionRef: {
        name: op.name,
        importPath,
        signature: liveSig,
        returnIsArray: isArrayOp,
      },
      outputSchema: schemaFields,
      name: varName,
      outputVariable: varName,
      inputBindings: nextBindings,
    };

    const nextSteps = linked.steps.map((s) => (s.id === linked.step.id ? updatedStep : s));
    if (linked.containerType === "endpoint") {
      useBackendCanvasStore.getState().updateEndpoint(linked.containerId, { pipelineSteps: nextSteps });
    } else {
      useBackendCanvasStore.getState().updateEvent(linked.containerId, { pipelineSteps: nextSteps });
    }

    const store = useBackendCanvasStore.getState();
    const targetEdge = store.edges.find((e) => e.source === id || e.target === id);
    if (targetEdge) {
      if (targetEdge.source === id) {
        store.updateEdge(targetEdge.id, {
          sourceHandle: `func-out-${op.name}`,
        });
      } else {
        store.updateEdge(targetEdge.id, {
          targetHandle: `func-out-${op.name}`,
        });
      }
    }
  };

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "db_ref",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  return (
    <div
      onClick={(e) => {
        if (isStacked) {
          e.stopPropagation();
          bringCardToFront();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: isStacked
          ? cardIndex === totalCards - 1 && selected
            ? 1000
            : 10 + cardIndex
          : selected
            ? 1000
            : undefined,
      }}
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] flex flex-col transition-all duration-200 select-none cursor-pointer relative",
        isStacked && "shadow-lg backdrop-blur-sm",
        isStacked && (selected || isHovered) && "ring-2 ring-orange-500/50 shadow-2xl scale-[1.01] border-orange-500",
        selected
          ? "border-orange-500 shadow-orange-500/15 ring-1 ring-orange-500/20"
          : "border-border/80 hover:border-orange-500/50 hover:shadow-lg",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >

      {/* Top Header: matches NodeHeader structure and padding with orange accents */}
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 rounded-t-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25 shrink-0">
            <Database size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase font-bold tracking-wider text-orange-600 dark:text-orange-400">
                Table Ref
              </span>
              {engineName && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20 uppercase shrink-0">
                  {engineName}
                </span>
              )}
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
                </span>
              )}
            </div>
            <span className="font-semibold text-xs text-foreground truncate">
              {selectedTable?.data?.label || data.label || "Table Ref"}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1 shrink-0 nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {hasMultipleCards && (
            <div className="flex items-center gap-1 shrink-0 mr-0.5">
              {isStacked ? (
                <div className="flex items-center rounded text-[8px] font-mono font-bold bg-orange-500/15 text-orange-400 border border-orange-500/30 overflow-hidden shrink-0">
                  {cardIndex > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCard("up");
                      }}
                      className="px-1 py-0.5 hover:bg-orange-500/30 text-orange-400 hover:text-orange-200 transition-colors cursor-pointer"
                      title="Move step up in stack"
                    >
                      <ChevronUp size={9} />
                    </button>
                  )}
                  <span
                    className="px-1.5 py-0.5 flex items-center gap-0.5"
                    title={`Step ${cardIndex + 1} of ${totalCards} (stacked)`}
                  >
                    <Layers size={8} />
                    <span>{cardIndex + 1}/{totalCards}</span>
                  </span>
                  {cardIndex < totalCards - 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCard("down");
                      }}
                      className="px-1 py-0.5 hover:bg-orange-500/30 text-orange-400 hover:text-orange-200 transition-colors cursor-pointer"
                      title="Move step down in stack"
                    >
                      <ChevronDown size={9} />
                    </button>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStack();
                }}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                title={isStacked ? "Fan out steps" : "Stack steps into deck"}
              >
                {isStacked ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
              </button>
            </div>
          )}
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer nodrag"
            onClick={handleOpenConfig}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title="Configure Database"
          >
            <Settings size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all cursor-pointer nodrag"
            onClick={handleDelete}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>


      {hasPipelineError && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[11px] text-destructive leading-tight">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      {/* Selectors section: matches ServiceNode body bg-secondary/5 and border-b */}
      <div
        className="px-3 py-2.5 bg-secondary/5 border-b flex flex-col gap-2 nodrag"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Database Selector */}
        <Select
          value={selectedDatabaseId || "__all__"}
          onValueChange={(val) => {
            const newDbId = val === "__all__" ? "" : val;
            const currentTable = allEntities.find((e) => e.id === data.tableRef);
            const belongsToNew =
              !newDbId ||
              (currentTable &&
                (currentTable.data?.databaseId === newDbId ||
                  edges.some(
                    (e) =>
                      (e.source === newDbId && e.target === currentTable.id) ||
                      (e.target === newDbId && e.source === currentTable.id),
                  )));

            updateNode(id, {
              data: {
                ...data,
                databaseId: newDbId || undefined,
                tableRef: belongsToNew ? data.tableRef : undefined,
                label: belongsToNew ? data.label : "Table Ref",
              },
            });

            // Synchronize with linked pipeline step
            const linked = findLinkedStep(id, data.stepId, data.endpointId, data.consumedEventId);
            if (linked) {
              const updatedStep = {
                ...linked.step,
                databaseId: newDbId || undefined,
                tableNodeId: belongsToNew ? linked.step.tableNodeId : undefined,
              };
              const nextSteps = linked.steps.map((s) => (s.id === linked.step.id ? updatedStep : s));
              if (linked.containerType === "endpoint") {
                useBackendCanvasStore.getState().updateEndpoint(linked.containerId, { pipelineSteps: nextSteps });
              } else {
                useBackendCanvasStore.getState().updateEvent(linked.containerId, { pipelineSteps: nextSteps });
              }
            }
          }}
        >
          <SelectTrigger
            className="h-7 w-full text-xs font-medium bg-background/80 hover:bg-background border-border/70 hover:border-orange-500/50 px-2.5 py-0 truncate shadow-none nodrag cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate pointer-events-none">
              <Server size={12} className="text-orange-500 shrink-0" />
              <span className="truncate">
                {selectedDatabase?.data?.label || (selectedDatabaseId && selectedDatabaseId !== "__all__" ? "Database" : "All Databases")}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent position="popper" className="nodrag z-[100]">
            <SelectItem value="__all__" className="text-xs">
              All Databases
            </SelectItem>
            {databaseInstances.map((inst) => (
              <SelectItem key={inst.id} value={inst.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="truncate">{inst.data?.label || "Database"}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 2. Table Selector */}
        <Select
          value={data.tableRef || "__none__"}
          onValueChange={(val) => {
            if (val === "__none__") return;
            const entity = allEntities.find((e) => e.id === val);
            const targetDbId =
              entity?.data?.databaseId || selectedDatabaseId || data.databaseId;
            const tableLabel = entity?.data?.label || "Table Ref";

            // Find connected service node from edges or targetServiceId
            const currentEdge = edges.find((edge) => edge.source === id || edge.target === id);
            const serviceNodeId = currentEdge
              ? (currentEdge.source === id ? currentEdge.target : currentEdge.source)
              : data.targetServiceId;

            // Check if there is already an existing table ref for val connected to this service node
            const existingRefForVal = serviceNodeId
              ? nodes.find(
                  (n) =>
                    n.id !== id &&
                    n.type === "db_ref" &&
                    n.data?.tableRef === val &&
                    (n.data?.targetServiceId === serviceNodeId ||
                      edges.some(
                        (e) =>
                          (e.source === serviceNodeId && e.target === n.id) ||
                          (e.target === serviceNodeId && e.source === n.id),
                      )),
                )
              : undefined;

            const targetRefId = existingRefForVal ? existingRefForVal.id : id;

            if (!existingRefForVal) {
              updateNode(id, {
                data: {
                  ...data,
                  tableRef: val,
                  databaseId: targetDbId,
                  label: tableLabel,
                  graphPosition: entity?.position,
                },
              });
            }

            // Synchronize with linked pipeline step
            const linked = findLinkedStep(id, data.stepId, data.endpointId, data.consumedEventId);
            if (linked && entity) {
              const ops = getEntityDbOperations(entity, nodes);
              const defaultOp = ops[0];
              const importPath = `@workspace/db/helpers/${toTableName(tableLabel)}`;
              const varName = defaultOp
                ? `${toVarName(defaultOp.name)}Result`
                : linked.step.outputVariable || linked.step.name || "dbResult";
              const liveSig = defaultOp
                ? deriveDbFunctionSignature(defaultOp.name, defaultOp.params, defaultOp.returnType) ||
                  defaultOp.signature
                : undefined;

              const returnTypeStr = defaultOp
                ? (defaultOp.code && defaultOp.code.trim()
                    ? inferDbOperationReturnType(defaultOp.code)
                    : null) ||
                  defaultOp.returnType ||
                  "any"
                : undefined;

              const isArrayOp = Boolean(
                defaultOp &&
                  (defaultOp.kind === "findAll" ||
                    (defaultOp.name || "").toLowerCase().includes("findall") ||
                    (returnTypeStr && (returnTypeStr.includes("[]") || returnTypeStr.includes("Array<")))),
              );

              const schemaFields = isArrayOp
                ? []
                : defaultOp?.kind === "delete"
                ? [
                    { name: "success", type: "boolean", required: true },
                    { name: "message", type: "string", required: true },
                  ]
                : (entity.data?.columns || []).map((c: any) => ({
                    name: c.name,
                    type: c.type || "string",
                    required: Boolean(c.isPrimaryKey || c.isNotNull),
                  }));

              const nextBindings = computeDbOpBindings(
                defaultOp,
                entity,
                [],
                [],
                defaultOp ? { name: defaultOp.name, signature: liveSig } : undefined,
              );

              const updatedStep = {
                ...linked.step,
                dbRefNodeId: targetRefId,
                databaseId: targetDbId,
                tableNodeId: entity.id,
                operationId: defaultOp?.id,
                functionRef: defaultOp
                  ? {
                      name: defaultOp.name,
                      importPath,
                      signature: liveSig,
                      returnIsArray: isArrayOp,
                    }
                  : linked.step.functionRef,
                outputSchema: schemaFields,
                name: varName,
                outputVariable: varName,
                inputBindings: nextBindings,
              };

              const nextSteps = linked.steps.map((s) => (s.id === linked.step.id ? updatedStep : s));
              if (linked.containerType === "endpoint") {
                useBackendCanvasStore.getState().updateEndpoint(linked.containerId, { pipelineSteps: nextSteps });
              } else {
                useBackendCanvasStore.getState().updateEvent(linked.containerId, { pipelineSteps: nextSteps });
              }

              const store = useBackendCanvasStore.getState();

              if (existingRefForVal && defaultOp && serviceNodeId) {
                // Delete edges from old node `id`
                const oldEdges = store.edges.filter((e) => e.source === id || e.target === id);
                oldEdges.forEach((e) => store.deleteEdge(e.id));

                // Connect to existingRefForVal
                const targetHandle =
                  linked.containerType === "endpoint"
                    ? `endpoint-in-${linked.containerId}`
                    : `consumedEvents-in-${linked.containerId}`;
                const dbSourceHandle = `func-out-${defaultOp.name}`;

                const edgeExists = store.edges.some(
                  (e) =>
                    e.source === existingRefForVal.id &&
                    e.target === serviceNodeId &&
                    e.sourceHandle === dbSourceHandle &&
                    e.targetHandle === targetHandle,
                );
                if (!edgeExists) {
                  store.addEdge({
                    id: `edge-dbref-${existingRefForVal.id}-${serviceNodeId}-${linked.containerId}-${defaultOp.name}-${Date.now()}`,
                    source: existingRefForVal.id,
                    target: serviceNodeId,
                    sourceHandle: dbSourceHandle,
                    targetHandle,
                    type: "connection",
                    
                  });
                }

                // Check for other connections on `id`. If none, delete `id`
                const remainingOnOld = useBackendCanvasStore.getState().edges.filter(
                  (e) => e.source === id || e.target === id,
                );
                if (remainingOnOld.length === 0) {
                  store.deleteNode(id);
                }
              } else if (defaultOp) {
                // Update connecting edge handle to func-out-${defaultOp.name}
                const targetEdge = store.edges.find((e) => e.source === id || e.target === id);
                if (targetEdge) {
                  if (targetEdge.source === id) {
                    store.updateEdge(targetEdge.id, {
                      sourceHandle: `func-out-${defaultOp.name}`,
                    });
                  } else {
                    store.updateEdge(targetEdge.id, {
                      targetHandle: `func-out-${defaultOp.name}`,
                    });
                  }
                }
              }
            }
          }}
        >
          <SelectTrigger
            className="h-7 w-full text-xs font-semibold bg-background/80 hover:bg-background border-border/70 hover:border-orange-500/50 px-2.5 py-0 truncate shadow-none nodrag cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate pointer-events-none">
              <Table2 size={12} className="text-orange-500 shrink-0" />
              <span className="truncate">
                {selectedTable?.data?.label || "Select Table..."}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent position="popper" className="nodrag z-[100]">
            {filteredEntities.length === 0 ? (
              <SelectItem value="__none__" disabled className="text-xs text-muted-foreground italic">
                {selectedDatabaseId && selectedDatabaseId !== "__all__"
                  ? "No tables for this database"
                  : "No tables defined"}
              </SelectItem>
            ) : (
              filteredEntities.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {e.data?.label || "Untitled Table"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Section Header: Collapsible Operations banner */}
      <div
        className={cn(
          "px-3 py-1 bg-secondary/40 border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center cursor-pointer hover:bg-secondary/60 transition-colors nodrag select-none relative group/ops",
          isOperationsCollapsed && "rounded-b-xl border-b-0",
        )}
        onClick={(e) => {
          e.stopPropagation();
          toggleSectionCollapsed(id, "operations");
        }}
        title={isOperationsCollapsed ? "Expand Operations" : "Collapse Operations"}
      >
        {/* Collapsed Handles: all function handles anchor directly to the Operations header row */}
        {isOperationsCollapsed && (
          <>
            {operations.map((op) => (
              <React.Fragment key={op.id || op.name}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`func-${op.name}`}
                  className={cn(
                    CANVAS_ROW_HANDLE_CLASS,
                    CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
                    "border-2 transition-all",
                    hasAnyConnectedOperation
                      ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                      : "!bg-background border-muted-foreground/60 hover:!bg-orange-400 hover:scale-125",
                  )}
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                />
                {op.id && op.id !== op.name && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`func-${op.id}`}
                    className={cn("opacity-0 pointer-events-none", CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS)}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`func-out-${op.name}`}
                  className={cn(
                    CANVAS_ROW_HANDLE_CLASS,
                    CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
                    "border-2 transition-all",
                    hasAnyConnectedOperation
                      ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                      : "!bg-background border-muted-foreground/60 hover:!bg-orange-400 hover:scale-125",
                  )}
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                />
                {op.id && op.id !== op.name && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`func-out-${op.id}`}
                    className={cn("opacity-0 pointer-events-none", CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS)}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                )}
              </React.Fragment>
            ))}
          </>
        )}

        <span className="flex items-center gap-1.5">
          <div className="text-muted-foreground group-hover/ops:text-foreground transition-transform">
            {isOperationsCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </div>
          <Code2 size={11} className="text-orange-500" />
          Operations
        </span>

        <div className="flex items-center gap-1.5">
          {hasAnyConnectedOperation && isOperationsCollapsed && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 animate-pulse"
              title="Connected Operations"
            />
          )}
          <span className="text-[9px] font-mono text-muted-foreground/70">
            {operations.length}
          </span>
        </div>
      </div>

      {/* Functions / Operations List: shown when expanded */}
      {!isOperationsCollapsed && (
        selectedTable && operations.length > 0 ? (
          <div className="flex flex-col">
            {operations.map((op) => {
              const isConnected = edges.some(
                (e) =>
                  (e.target === id &&
                    (e.targetHandle === `func-${op.name}` ||
                      e.targetHandle === `func-${op.id}` ||
                      (!e.targetHandle && op === operations[0]))) ||
                  (e.source === id &&
                    (e.sourceHandle === `func-${op.name}` ||
                      e.sourceHandle === `func-out-${op.name}` ||
                      e.sourceHandle === `func-${op.id}` ||
                      e.sourceHandle === `func-out-${op.id}` ||
                      (!e.sourceHandle && op === operations[0]))),
              );

              const badgeColor =
                op.kind === "findAll" || op.kind === "findById"
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  : op.kind === "create" || op.kind === "upsert"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : op.kind === "update"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : op.kind === "delete"
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : "bg-purple-500/15 text-purple-400 border-purple-500/30";

              const badgeLabel =
                op.kind === "findAll"
                  ? "ALL"
                  : op.kind === "findById"
                  ? "BY ID"
                  : op.kind === "create"
                  ? "NEW"
                  : op.kind === "upsert"
                  ? "UPSERT"
                  : op.kind === "update"
                  ? "SET"
                  : op.kind === "delete"
                  ? "DEL"
                  : "FN";

              return (
                <div
                  key={op.id || op.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectOperation(op);
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs relative group/row transition-colors nodrag cursor-pointer",
                    isConnected
                      ? "text-foreground font-medium bg-orange-500/10"
                      : "hover:bg-secondary/20 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* Target Handle sitting cleanly on the left card border */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`func-${op.name}`}
                    className={cn(
                      CANVAS_ROW_HANDLE_CLASS,
                      CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
                      "border-2 transition-all",
                      isConnected
                        ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                        : "!bg-background border-muted-foreground/60 hover:!bg-orange-400 hover:scale-125",
                    )}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                  {op.id && op.id !== op.name && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`func-${op.id}`}
                      className={cn("opacity-0 pointer-events-none", CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS)}
                      style={{ top: "50%", transform: "translateY(-50%)" }}
                    />
                  )}

                  {/* Source Handle on Right border to connect into ServiceNode on the left */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`func-out-${op.name}`}
                    className={cn(
                      CANVAS_ROW_HANDLE_CLASS,
                      CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
                      "border-2 transition-all",
                      isConnected
                        ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                        : "!bg-background border-muted-foreground/60 hover:!bg-orange-400 hover:scale-125",
                    )}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                  {op.id && op.id !== op.name && (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`func-out-${op.id}`}
                      className={cn("opacity-0 pointer-events-none", CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS)}
                      style={{ top: "50%", transform: "translateY(-50%)" }}
                    />
                  )}

                  <span
                    className="font-mono text-xs truncate select-text"
                    title={op.signature || op.name}
                  >
                    {op.name}
                  </span>

                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 font-mono tracking-wider",
                      badgeColor,
                    )}
                  >
                    {badgeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground/60 italic">
            {selectedTable ? "No operations available" : "Select a table to view operations"}
          </div>
        )
      )}
    </div>
  );
};
