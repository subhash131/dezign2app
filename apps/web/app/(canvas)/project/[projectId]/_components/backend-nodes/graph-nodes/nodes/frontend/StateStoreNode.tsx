"use client";

import React, { useState, useMemo } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Settings, Trash, Layers, AlertTriangle, Edit3 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { CustomTypeItem } from "@workspace/canvas/types";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";

export const StateStoreNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [isEditing, setIsEditing] = useState(!data.label && !data.storeName);
  const [name, setName] = useState(data.label || data.storeName || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const currentStoreName = (data.storeName || data.label || "").trim();
  const isDuplicateStoreName = useMemo(() => {
    if (!currentStoreName) return false;
    const key = currentStoreName.toLowerCase();
    return allNodes.some(
      (n) =>
        n.id !== id &&
        n.type === "state_store" &&
        (n.data?.storeName || n.data?.label || "").trim().toLowerCase() === key,
    );
  }, [allNodes, id, currentStoreName]);

  const duplicateFieldIds = useMemo(() => {
    const counts = new Map<string, number>();
    (data.fields || []).forEach((f) => {
      const key = f.name?.trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    const dupes = new Set<string>();
    (data.fields || []).forEach((f) => {
      const key = f.name?.trim().toLowerCase();
      if (key && (counts.get(key) || 0) > 1) {
        dupes.add(f.id);
      }
    });
    return dupes;
  }, [data.fields]);

  const hasErrors = isDuplicateStoreName || duplicateFieldIds.size > 0;

  React.useEffect(() => {
    setName(data.label || data.storeName || "");
    if (!data.label && !data.storeName) {
      setIsEditing(true);
    }
  }, [data.label, data.storeName]);

  React.useEffect(() => {
    if (isEditing) {
      const focus = () => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      };
      const raf = requestAnimationFrame(focus);
      const timer = setTimeout(focus, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      if (!data.label && !data.storeName) {
        deleteNode(id);
        return;
      }
      setName(data.label || data.storeName || "");
      setIsEditing(false);
      return;
    }
    const isColliding = allNodes.some(
      (n) =>
        n.id !== id &&
        n.type === "state_store" &&
        (n.data?.storeName || n.data?.label || "").trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (isColliding) {
      toast.error(`An App Store named "${trimmed}" already exists. Store names must be unique.`);
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
        storeName: trimmed,
      },
    });
    setName(trimmed);
    setIsEditing(false);
  };

  const handleOpenConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "state_store",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const scope = data.scope || "global";
  const storage = data.storage || "memory";

  const handleToggleScope = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextScope = scope === "global" ? "local" : "global";
    updateNode(id, {
      data: {
        ...data,
        scope: nextScope,
      },
    });
  };

  const fieldCount = data.fields?.length || 0;
  const actionCount = data.actions?.length || 0;

  // Auto-sync type reference edges between TypesNode and store fields
  React.useEffect(() => {
    if (!data.fields || data.fields.length === 0) return;
    data.fields.forEach((f) => {
      if (!f.type) return;
      const baseTypeName = f.type.replace(/\[\]$/, "").trim();
      if (!baseTypeName || ["string", "number", "boolean", "array", "object", "any"].includes(baseTypeName.toLowerCase())) {
        return;
      }
      const typesNode = allNodes.find(
        (n) => n.type === "types" && (n.data?.types || []).some((t: CustomTypeItem) => t.name === baseTypeName),
      );
      if (!typesNode) return;
      const typeItem = (typesNode.data?.types || []).find((t: CustomTypeItem) => t.name === baseTypeName);
      if (!typeItem) return;

      const expectedSourceHandle = `type-out-${typeItem.id}`;
      const expectedTargetHandle = `store-field-in-${f.id}`;

      const edgeExists = edges.some(
        (e) =>
          e.source === typesNode.id &&
          e.target === id &&
          e.sourceHandle === expectedSourceHandle &&
          e.targetHandle === expectedTargetHandle,
      );

      if (!edgeExists) {
        addEdge({
          id: `edge-type-${typesNode.id}-${typeItem.id}-${id}-${f.id}`,
          source: typesNode.id,
          target: id,
          sourceHandle: expectedSourceHandle,
          targetHandle: expectedTargetHandle,
          type: "type-reference",
          data: {
            label: typeItem.name,
            isTypeReference: true,
            baseTypeName: typeItem.name,
          },
        });
      }
    });
  }, [data.fields, id, allNodes, edges, addEdge]);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl bg-card/95 backdrop-blur border-2 min-w-[220px] max-w-[280px] shadow-md transition-all duration-150 cursor-pointer select-none",
        selected
          ? hasErrors
            ? "border-destructive shadow-destructive/20 ring-1 ring-destructive/40"
            : "border-indigo-500 shadow-indigo-500/15 ring-1 ring-indigo-500/20"
          : hasErrors
            ? "border-destructive/80 hover:border-destructive shadow-md shadow-destructive/10"
            : "border-border/80 hover:border-indigo-500/50 hover:shadow-lg",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Node-level target handle for TypesNode / Action connections */}
      <Handle
        type="target"
        position={Position.Left}
        id="store-in"
        className="w-2.5 h-2.5 !bg-indigo-500 border-2 border-background -left-1.5"
        style={{ top: "28px" }}
        title="Connect from TypesNode, Page, or Action"
      />

      {/* Header Container */}
      <div className="flex flex-col gap-1.5 px-3 pt-2.5 pb-2">
        <div className="flex items-center justify-between gap-3 w-full">
          {/* Icon + Label */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shrink-0">
              <Database size={14} />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[8px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                  State Store
                </span>
                {isDuplicateStoreName && (
                  <span
                    className="flex items-center gap-0.5 text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide"
                    title={`Duplicate App Store name "${currentStoreName}"! Each App Store must have a unique name.`}
                  >
                    <AlertTriangle size={8} />
                    <span>DUP STORE</span>
                  </span>
                )}
                {duplicateFieldIds.size > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide"
                    title="Duplicate field names detected in this store!"
                  >
                    <AlertTriangle size={8} />
                    <span>DUP FIELDS</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleToggleScope}
                  className={cn(
                    "text-[7px] font-mono px-1 py-0.2 rounded font-medium border transition-colors cursor-pointer",
                    scope === "global"
                      ? "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25"
                      : "bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25",
                  )}
                  title="Click to toggle Global / Local scope"
                >
                  {scope === "global" ? "GLOBAL" : "LOCAL"}
                </button>
                {storage !== "memory" && (
                  <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {storage === "localStorage" ? "LOCAL" : "SESSION"}
                  </span>
                )}
              </div>

              {isEditing ? (
                <div
                  className="nodrag nowheel nopan relative flex-1 min-w-0"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => e.stopPropagation()}
                >
                  <LocalInput
                    ref={inputRef}
                    value={name}
                    placeholder="Enter store name..."
                    onChange={(e) => setName(e.target.value)}
                    className="h-5 text-xs font-semibold px-1 py-0 bg-background/80 border-border/80 w-full"
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSave();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        if (!data.label && !data.storeName) {
                          deleteNode(id);
                        } else {
                          setName(data.storeName || data.label || "");
                          setIsEditing(false);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (!data.label && !data.storeName && !name.trim()) {
                        deleteNode(id);
                      } else {
                        handleSave();
                      }
                    }}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 cursor-pointer min-w-0 group/name"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  title="Click to rename"
                >
                  <span className="text-xs font-semibold text-foreground truncate hover:text-indigo-400 transition-colors">
                    {currentStoreName}
                  </span>
                  <Edit3
                    size={9}
                    className="opacity-0 group-hover/name:opacity-70 text-muted-foreground transition-opacity shrink-0"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              onClick={handleOpenConfig}
              title="Configure State Store"
            >
              <Settings size={13} />
            </button>
            <button
              className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={handleDelete}
              title="Delete Node"
            >
              <Trash size={13} />
            </button>
          </div>
        </div>

        {/* Info footer: fields and actions count */}
        <div className="flex items-center justify-between pt-0.5 text-[10px] text-muted-foreground font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Layers size={10} className="text-indigo-400/80" />
              {fieldCount} {fieldCount === 1 ? "field" : "fields"}
            </span>
            <span>•</span>
            <span>{actionCount} {actionCount === 1 ? "action" : "actions"}</span>
          </div>
          <span className="text-[8px] text-indigo-500/80 font-bold uppercase tracking-wide">Zustand</span>
        </div>
      </div>

      {/* Dynamic State Objects (Fields) list */}
      <div className="flex flex-col border-t border-border/40 text-[9px] font-mono">
        <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 px-3 py-1 bg-muted/10">
          <div className="flex items-center gap-1">
            <span className={cn("font-bold", duplicateFieldIds.size > 0 ? "text-destructive" : "text-cyan-500")}>•</span>
            <span>State Objects</span>
          </div>
          {duplicateFieldIds.size > 0 ? (
            <span className="text-[7px] text-destructive font-bold bg-destructive/15 px-1 rounded border border-destructive/30 flex items-center gap-0.5">
              <AlertTriangle size={8} />
              <span>Duplicate Fields</span>
            </span>
          ) : (
            <span className="text-[7px] text-cyan-600 dark:text-cyan-400 font-semibold">{fieldCount} {fieldCount === 1 ? "field" : "fields"}</span>
          )}
        </div>
        {data.fields && data.fields.length > 0 ? (
          data.fields.map((f) => {
            const isDupe = duplicateFieldIds.has(f.id);
            const isOutputConnected = edges.some(
              (e) => e.source === id && e.sourceHandle === `store-field-out-${f.id}`,
            );
            const isInputConnected = edges.some(
              (e) => e.target === id && e.targetHandle === `store-field-in-${f.id}`,
            );

            return (
              <div
                key={f.id}
                className={cn(
                  "relative flex items-center justify-between px-3 py-1 border-b border-border/20 transition-colors group/field",
                  isDupe
                    ? "bg-destructive/15 text-destructive border-destructive/40"
                    : "bg-muted/5 hover:bg-muted/20",
                )}
              >
                {/* Left target handle for custom type contract from TypesNode */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`store-field-in-${f.id}`}
                  className={cn(
                    "w-2 h-2 border border-background -left-1 z-10 transition-all",
                    isInputConnected
                      ? "!bg-purple-400 ring-2 ring-purple-500/40 opacity-100"
                      : "!bg-indigo-400 opacity-0 group-hover/field:opacity-100 hover:scale-125",
                  )}
                  style={{ top: "50%" }}
                  title={`${f.name}: Connect custom type contract from TypesNode`}
                />

                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isDupe ? (
                    <span title={`Duplicate field name "${f.name}". Field names must be unique.`}>
                      <AlertTriangle size={8} className="text-destructive shrink-0" />
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                  )}
                  <span className={cn("font-semibold truncate", isDupe ? "text-destructive font-bold" : "text-foreground/90")}>{f.name}</span>
                  <span className={cn(
                    "text-[7px] px-1 py-0.2 rounded border shrink-0",
                    isDupe ? "bg-destructive/20 border-destructive/40 text-destructive" : "bg-secondary text-muted-foreground border-border/40"
                  )}>
                    {f.type}
                  </span>
                  {f.defaultValue !== undefined && f.defaultValue !== "" && (
                    <span className="text-[7px] text-muted-foreground/60 truncate font-mono">
                      = {typeof f.defaultValue === "object" ? JSON.stringify(f.defaultValue) : String(f.defaultValue)}
                    </span>
                  )}
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`store-field-out-${f.id}`}
                  className={cn(
                    "w-2 h-2 border border-background cursor-pointer hover:scale-125 transition-all -right-1 z-10",
                    isOutputConnected
                      ? "!bg-cyan-400 ring-2 ring-cyan-500/40 scale-110"
                      : "!bg-cyan-500 hover:!bg-cyan-400",
                  )}
                  style={{ top: "50%" }}
                  title={`${f.name}: Drag to WebPage to render state${isOutputConnected ? " (connected)" : ""}`}
                />
              </div>
            );
          })
        ) : (
          <div className="px-3 py-1 text-[8px] text-muted-foreground/50 italic">
            No fields defined yet
          </div>
        )}
      </div>

      {/* Actions list with handles aligned on the right edge */}
      {(() => {
        const disabledOrDeleted = new Set([
          ...(data.disabledDefaultManipulators || []),
          ...(data.deletedDefaultManipulators || []),
        ]);
        const populateOverride = (data.actions || []).find(
          (a) =>
            a.defaultManipulatorType === "populate" ||
            a.actionType === "populate" ||
            a.name.toLowerCase() === "populate" ||
            a.name.toLowerCase() === "load",
        );
        const resetOverride = (data.actions || []).find(
          (a) =>
            a.defaultManipulatorType === "reset" ||
            a.actionType === "reset" ||
            a.name.toLowerCase() === "reset",
        );
        const customActions = (data.actions || []).filter((act) => {
          if (act.defaultManipulatorType) return false;
          if (act === populateOverride || act === resetOverride) return false;
          const isSetter = (data.fields || []).some(
            (f) =>
              act.targetFieldId === f.id &&
              act.name.toLowerCase() === `set${f.name.toLowerCase()}`,
          );
          return !isSetter;
        });

        const isPopulateDisabled = disabledOrDeleted.has("populate") || disabledOrDeleted.has("load");
        const isResetDisabled = disabledOrDeleted.has("reset");

        // Compute individual field setters (e.g. setMessages, setConversations)
        const fieldSetters = (data.fields || []).map((f) => {
          const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
          const defaultSetterName = `set${cap}`;
          const setterOverride = (data.actions || []).find((a) => {
            if (a.defaultManipulatorType === "setter" && a.targetFieldId === f.id) return true;
            return (
              a.name.toLowerCase() === defaultSetterName.toLowerCase() &&
              (!a.targetFieldId || a.targetFieldId === f.id)
            );
          });
          const isDisabled =
            disabledOrDeleted.has("mutate") ||
            disabledOrDeleted.has(`setter-${f.id}`) ||
            disabledOrDeleted.has(defaultSetterName) ||
            Boolean(setterOverride && disabledOrDeleted.has(setterOverride.name));

          const displayName = setterOverride?.name || defaultSetterName;
          const isCustom = Boolean(setterOverride);

          return {
            field: f,
            name: displayName,
            defaultName: defaultSetterName,
            isCustom,
            isDisabled,
            override: setterOverride,
          };
        }).filter((s) => !s.isDisabled);

        const visibleManipulatorCount =
          (isPopulateDisabled ? 0 : 1) +
          fieldSetters.length +
          (isResetDisabled ? 0 : 1) +
          customActions.length;

        const hasPopulate = !isPopulateDisabled;
        const settersCount = fieldSetters.length;
        const hasReset = !isResetDisabled;
        const customCount = customActions.length;

        return (
          <div className="flex flex-col border-t border-border/40 text-[9px] font-mono">
            <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 px-3 py-1 bg-muted/10">
              <div className="flex items-center gap-1">
                <span className="text-indigo-500 font-bold">•</span>
                <span>Manipulators</span>
              </div>
              <span className="text-[7px] text-indigo-500 font-semibold">
                {visibleManipulatorCount} {visibleManipulatorCount === 1 ? "manipulator" : "manipulators"}
              </span>
            </div>

            {/* Empty state if all manipulators disabled */}
            {visibleManipulatorCount === 0 && (
              <div className="px-3 py-1.5 text-[8px] text-muted-foreground/50 italic rounded-b-[10px]">
                No manipulators defined
              </div>
            )}

            {/* 1. Populate Action (only if not disabled) */}
            {!isPopulateDisabled && (
              <div
                className={cn(
                  "relative flex items-center justify-between px-3 py-1 bg-muted/5 hover:bg-muted/20 transition-colors group/row",
                  (settersCount > 0 || hasReset || customCount > 0) && "border-b border-border/20",
                  settersCount === 0 && !hasReset && customCount === 0 && "rounded-b-[10px]",
                )}
              >
                {/* Left-side inbound target handle for direct wiring from WebPage actions */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id="populate-in-left"
                  className="w-2.5 h-2.5 !bg-emerald-500 border-2 border-background cursor-pointer hover:scale-125 transition-transform -left-1.5 z-10"
                  style={{ top: "50%" }}
                  title={`${populateOverride?.name || "populate"}: Wire from WebPage action or realtime connection`}
                />
                <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-foreground/90 truncate">
                    {populateOverride?.name || "populate"}
                  </span>
                  <span className="text-[8px] text-muted-foreground/60 shrink-0">
                    {populateOverride ? "(custom)" : "(default)"}
                  </span>
                </div>
                {/* Outbound source handle for wiring to WebPage actions */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id="populate-out"
                  className={cn(
                    "w-2.5 h-2.5 !bg-emerald-500 border-2 border-background cursor-pointer hover:scale-125 transition-all -right-1.5 z-10",
                    edges.some((e) => (e.source === id && (e.sourceHandle === "populate-out" || e.sourceHandle === "populate-in")) || (e.target === id && (e.targetHandle === "populate-in" || e.targetHandle === "populate-in-left"))) && "ring-2 ring-emerald-500/50 scale-110",
                  )}
                  style={{ top: "50%" }}
                  title={`${populateOverride?.name || "populate"}: Drag to WebPage action (e.g. pageLoad)`}
                />
              </div>
            )}

            {/* 2. Field Setters (e.g. setMessages, setConversations) */}
            {fieldSetters.map((s, sIdx) => {
              const f = s.field;
              const hasBelow = sIdx < settersCount - 1 || hasReset || customCount > 0;
              const isSetterConnected = edges.some(
                (e) =>
                  (e.source === id &&
                    (e.sourceHandle === `setter-out-${f.id}` ||
                      e.sourceHandle === `mutate-out-${f.id}` ||
                      (e.sourceHandle === "mutate-out" &&
                        (e.data?.actionName === s.name ||
                          (e.data as Record<string, unknown> | undefined)?.targetFieldId === f.id ||
                          settersCount === 1)) ||
                      (s.override && e.sourceHandle === `store-action-out-${s.override.id}`))) ||
                  (e.target === id &&
                    (e.targetHandle === `setter-in-left-${f.id}` ||
                      e.targetHandle === `setter-in-${f.id}` ||
                      e.targetHandle === `mutate-in-left-${f.id}` ||
                      e.targetHandle === `mutate-in-${f.id}` ||
                      ((e.targetHandle === "mutate-in" || e.targetHandle === "mutate-in-left") &&
                        (e.data?.actionName === s.name ||
                          (e.data as Record<string, unknown> | undefined)?.targetFieldId === f.id ||
                          settersCount === 1)) ||
                      (s.override &&
                        (e.targetHandle === `store-action-in-${s.override.id}` ||
                          e.targetHandle === `store-action-in-left-${s.override.id}`)))),
              );

              return (
                <div
                  key={`setter-${f.id}`}
                  className={cn(
                    "relative flex items-center justify-between px-3 py-1 bg-muted/5 hover:bg-muted/20 transition-colors group/row",
                    hasBelow && "border-b border-border/20",
                    !hasBelow && "rounded-b-[10px]",
                  )}
                >
                  {/* Left-side inbound target handle */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`setter-in-left-${f.id}`}
                    className="w-2.5 h-2.5 !bg-indigo-500 border-2 border-background cursor-pointer hover:scale-125 transition-transform -left-1.5 z-10"
                    style={{ top: "50%" }}
                    title={`${s.name}: Wire from WebPage action or realtime connection`}
                  />
                  <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                    <span className="font-semibold text-foreground/90 truncate">
                      {s.name}
                    </span>
                    <span className="text-[8px] text-muted-foreground/60 shrink-0">
                      {s.isCustom ? "(custom)" : "(setter)"}
                    </span>
                  </div>
                  {/* Outbound source handle */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`setter-out-${f.id}`}
                    className={cn(
                      "w-2.5 h-2.5 !bg-indigo-500 border-2 border-background cursor-pointer hover:scale-125 transition-all -right-1.5 z-10",
                      isSetterConnected && "ring-2 ring-indigo-500/50 scale-110",
                    )}
                    style={{ top: "50%" }}
                    title={`${s.name}: Drag to WebPage action to update state on trigger`}
                  />
                </div>
              );
            })}

            {/* 3. Reset Action (only if not disabled) */}
            {!isResetDisabled && (
              <div
                className={cn(
                  "relative flex items-center justify-between px-3 py-1 bg-muted/5 hover:bg-muted/20 transition-colors group/row",
                  customCount > 0 && "border-b border-border/20",
                  customCount === 0 && "rounded-b-[10px]",
                )}
              >
                {/* Left-side inbound target handle for direct wiring from WebPage actions */}
                <Handle
                  type="target"
                  position={Position.Left}
                  id="reset-in-left"
                  className="w-2.5 h-2.5 !bg-rose-500 border-2 border-background cursor-pointer hover:scale-125 transition-transform -left-1.5 z-10"
                  style={{ top: "50%" }}
                  title={`${resetOverride?.name || "reset"}: Wire from WebPage action or realtime connection`}
                />
                <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="font-semibold text-foreground/90 truncate">
                    {resetOverride?.name || "reset"}
                  </span>
                  <span className="text-[8px] text-muted-foreground/60 shrink-0">
                    {resetOverride ? "(custom)" : "(unmount)"}
                  </span>
                </div>
                {/* Outbound source handle for wiring to WebPage actions */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id="reset-out"
                  className={cn(
                    "w-2.5 h-2.5 !bg-rose-500 border-2 border-background cursor-pointer hover:scale-125 transition-all -right-1.5 z-10",
                    edges.some((e) => (e.source === id && (e.sourceHandle === "reset-out" || e.sourceHandle === "reset-in")) || (e.target === id && (e.targetHandle === "reset-in" || e.targetHandle === "reset-in-left"))) && "ring-2 ring-rose-500/50 scale-110",
                  )}
                  style={{ top: "50%" }}
                  title={`${resetOverride?.name || "reset"}: Drag to WebPage action to reset state`}
                />
              </div>
            )}

            {/* Custom Actions if defined */}
            {customActions.length > 0 && (
              <div className="flex flex-col">
                {customActions.map((act, idx) => {
                  const isLast = idx === customActions.length - 1;
                  return (
                    <div
                      key={act.id}
                      className={cn(
                        "relative flex items-center justify-between px-3 py-1 bg-muted/5 hover:bg-muted/20 transition-colors group/row text-[8px]",
                        !isLast && "border-b border-border/20",
                        isLast && "rounded-b-[10px]",
                      )}
                    >
                      {/* Left-side inbound target handle */}
                      <Handle
                        type="target"
                        position={Position.Left}
                        id={`store-action-in-left-${act.id}`}
                        className="w-2 h-2 !bg-indigo-400 border border-background cursor-pointer hover:scale-125 transition-transform -left-1 z-10"
                        style={{ top: "50%" }}
                        title={`${act.name}: Wire from WebPage action or realtime connection`}
                      />
                      <div className="flex items-center gap-1 truncate max-w-[170px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        <span className="font-medium text-foreground truncate">{act.name}</span>
                        <span className="text-[7px] text-muted-foreground/60 uppercase shrink-0">
                          ({act.actionType})
                        </span>
                      </div>
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`store-action-out-${act.id}`}
                        className={cn(
                          "w-2 h-2 !bg-indigo-400 border border-background cursor-pointer hover:scale-125 transition-all -right-1 z-10",
                          edges.some((e) => (e.source === id && (e.sourceHandle === `store-action-out-${act.id}` || e.sourceHandle === `store-action-in-${act.id}`)) || (e.target === id && (e.targetHandle === `store-action-in-${act.id}` || e.targetHandle === `store-action-in-left-${act.id}`))) && "ring-2 ring-indigo-400/50 scale-110",
                        )}
                        style={{ top: "50%" }}
                        title={`${act.name}: Drag to WebPage action`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Fallback generic handle for legacy edges */}
      <Handle
        type="source"
        position={Position.Right}
        id="store-out"
        style={{ top: "28px", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="mutate-out"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="mutate-in-left"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="mutate-in"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
};
