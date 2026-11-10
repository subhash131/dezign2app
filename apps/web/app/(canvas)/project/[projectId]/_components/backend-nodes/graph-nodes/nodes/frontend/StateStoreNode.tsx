"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  Database,
  Settings,
  Trash,
  AlertTriangle,
  Edit3,
  Plus,
  Pencil,
  Check,
  Trash2,
  Braces,
  Brackets,
  GitMerge,
  Copy,
  MoreVertical,
  Settings2,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { CustomTypeItem, GlobalStoreField } from "@workspace/canvas/types";
import {
  CANVAS_ROW_HANDLE_CLASS,
  CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { TwoStepTypeSelector } from "../../../../shared/TwoStepTypeSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  getSuggestedReducerCodeForChannelType,
  isReducerCodeCompatibleWithType,
  getAvailableCustomTypes,
  resolveCustomType,
  extractFieldsFromCustomType,
} from "../../langgraph/langgraph-canvas/components/inspector/state-inspector/constants";

/**
 * Returns supported action types handled by the single reducer of a state variable.
 * Matches the reducer patterns used in LangGraph and modern reactive state stores.
 */
export function getSupportedActionsForType(type?: string, isArray?: boolean, name?: string): string[] {
  const clean = (type || "string").toLowerCase().trim();
  const isMessage =
    clean.includes("message") ||
    clean.includes("chat") ||
    clean === "messages" ||
    clean === "chatmessage" ||
    Boolean(name && (name.toLowerCase().includes("message") || name.toLowerCase().includes("chat")));

  if (isArray || clean.endsWith("[]") || clean === "array") {
    const base = ["set", "append", "prepend", "pop", "remove", "update", "reset"];
    if (isMessage) return [...base, "stream"];
    return base;
  }
  switch (clean) {
    case "number":
      return ["set", "increment", "decrement", "reset"];
    case "boolean":
      return ["set", "toggle", "reset"];
    case "string":
      return ["set", "append", "prepend", "reset"];
    case "object":
    default:
      return ["set", "update", "reset"];
  }
}

export const StateStoreNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const updateEdge = useBackendCanvasStore((s) => s.updateEdge);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
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
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const availableCustomTypes = useMemo(() => {
    return getAvailableCustomTypes(allNodes);
  }, [allNodes]);

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

  useEffect(() => {
    setName(data.label || data.storeName || "");
    if (!data.label && !data.storeName) {
      setIsEditing(true);
    }
  }, [data.label, data.storeName]);

  useEffect(() => {
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

  const handleOpenConfig = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  const fieldCount = data.fields?.length || 0;

  const handleAddField = (e: React.MouseEvent) => {
    e.stopPropagation();
    const existingNames = new Set((data.fields || []).map((f) => f.name.trim().toLowerCase()));
    let nextNum = (data.fields || []).length + 1;
    while (existingNames.has(`field${nextNum}`.toLowerCase())) {
      nextNum++;
    }
    const newFieldId = `f-${Date.now()}`;
    const newFieldName = `field${nextNum}`;
    const defaultActions = getSupportedActionsForType("string", false);
    const initialReducerCode = getSuggestedReducerCodeForChannelType("string", null, false);
    const newField: GlobalStoreField = {
      id: newFieldId,
      name: newFieldName,
      type: "string",
      defaultValue: "",
      reducer: `${newFieldName}_reducer`,
      actions: defaultActions,
      customReducerCode: initialReducerCode,
    };
    updateNode(id, {
      data: {
        ...data,
        fields: [...(data.fields || []), newField],
      },
    });
    setEditingFieldId(newFieldId);
  };

  const handleUpdateField = (
    fieldId: string,
    patch: Partial<GlobalStoreField>,
  ) => {
    const updatedFields = (data.fields || []).map((f) => {
      if (f.id !== fieldId) return f;
      const updated = { ...f, ...patch };
      const isArray = Boolean(
        updated.isArray || updated.type?.endsWith("[]") || updated.type === "array",
      );
      const cleanBase = (updated.type || "string").replace(/\[\]$/, "").trim();
      const matchedCustom = resolveCustomType({
        availableTypes: availableCustomTypes,
        typeName: cleanBase,
        typeId: updated.customTypeId,
      });

      if ((patch.type !== undefined || patch.isArray !== undefined) && !patch.actions) {
        updated.actions = getSupportedActionsForType(updated.type, isArray, updated.name);
      }
      if (
        (patch.type !== undefined || patch.isArray !== undefined) &&
        patch.customReducerCode === undefined
      ) {
        updated.customReducerCode = getSuggestedReducerCodeForChannelType(
          updated.type,
          matchedCustom,
          isArray,
        );
      }
      if (patch.name && (!f.reducer || f.reducer === `${f.name}_reducer` || f.reducer.endsWith("_reducer"))) {
        updated.reducer = `${patch.name.trim() || "state"}_reducer`;
      }
      return updated;
    });
    updateNode(id, {
      data: {
        ...data,
        fields: updatedFields,
      },
    });
  };

  const handleToggleArrayField = (fieldId: string) => {
    const field = (data.fields || []).find((f) => f.id === fieldId);
    if (!field) return;

    const currentIsArray = Boolean(
      field.isArray || field.type?.endsWith("[]") || field.type === "array",
    );
    const rawType = (field.type || "string").trim();
    const cleanBase = rawType.replace(/\[\]$/, "").trim() || "string";
    const matchedCustom = resolveCustomType({
      availableTypes: availableCustomTypes,
      typeName: cleanBase,
      typeId: field.customTypeId,
    });

    if (currentIsArray) {
      const nextType = cleanBase === "array" ? "string" : cleanBase;
      const isNextCustom = Boolean(matchedCustom && cleanBase !== "array");
      const nextActions = getSupportedActionsForType(isNextCustom ? "object" : nextType, false, field.name);
      const nextReducerCode = getSuggestedReducerCodeForChannelType(
        nextType,
        isNextCustom ? matchedCustom : null,
        false,
      );
      handleUpdateField(fieldId, {
        type: nextType,
        isArray: false,
        defaultValue: isNextCustom ? null : "",
        actions: nextActions,
        customReducerCode: nextReducerCode,
        customTypeId: matchedCustom?.id || field.customTypeId,
      });
    } else {
      const nextType = cleanBase === "array" ? "array" : `${cleanBase}[]`;
      const nextActions = getSupportedActionsForType(nextType, true, field.name);
      const nextReducerCode = getSuggestedReducerCodeForChannelType(
        nextType,
        matchedCustom,
        true,
      );
      handleUpdateField(fieldId, {
        type: nextType,
        isArray: true,
        defaultValue: [],
        actions: nextActions,
        customReducerCode: nextReducerCode,
        customTypeId: matchedCustom?.id || field.customTypeId,
      });
    }
  };

  const handleDeleteField = (fieldId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedFields = (data.fields || []).filter((f) => f.id !== fieldId);

    const fieldHandles = [
      `store-field-in-${fieldId}`,
      `store-field-out-${fieldId}`,
      `setter-in-left-${fieldId}`,
      `setter-in-${fieldId}`,
      `setter-out-${fieldId}`,
      `append-in-left-${fieldId}`,
      `append-in-${fieldId}`,
      `append-out-${fieldId}`,
      `pop-in-left-${fieldId}`,
      `pop-in-${fieldId}`,
      `pop-out-${fieldId}`,
      `mutate-in-left-${fieldId}`,
      `mutate-out-${fieldId}`,
    ];
    edges
      .filter(
        (ed) =>
          (ed.source === id && fieldHandles.includes(ed.sourceHandle || "")) ||
          (ed.target === id && fieldHandles.includes(ed.targetHandle || "")),
      )
      .forEach((ed) => deleteEdge(ed.id));

    updateNode(id, {
      data: {
        ...data,
        fields: updatedFields,
      },
    });
    if (editingFieldId === fieldId) {
      setEditingFieldId(null);
    }
  };

  const handleDuplicateField = (field: GlobalStoreField) => {
    const newId = `f-${Date.now()}`;
    const newName = `${field.name}_copy`;
    const newField: GlobalStoreField = {
      ...field,
      id: newId,
      name: newName,
      reducer: `${newName}_reducer`,
    };
    updateNode(id, {
      data: {
        ...data,
        fields: [...(data.fields || []), newField],
      },
    });
  };

  // Auto-sync type reference edges between TypesNode and store fields
  useEffect(() => {
    if (!data.fields || data.fields.length === 0) return;
    data.fields.forEach((f) => {
      if (!f.type) return;
      const baseTypeName = f.type.replace(/\[\]$/, "").trim();
      const expectedTargetHandle = `store-field-in-${f.id}`;

      // Clean up any edge if the field has transitioned to a primitive type
      if (!baseTypeName || ["string", "number", "boolean", "array", "object", "any"].includes(baseTypeName.toLowerCase())) {
        const stalePrimitiveEdges = edges.filter(
          (e) => e.target === id && e.targetHandle === expectedTargetHandle,
        );
        stalePrimitiveEdges.forEach((e) => deleteEdge(e.id));
        return;
      }

      const matchingNodes = allNodes.filter(
        (n) => n.type === "types" && (n.data?.types || []).some((t: CustomTypeItem) => t.name === baseTypeName),
      );
      if (matchingNodes.length === 0) return;

      // Prefer standalone user custom types nodes over package, entity, or service schemas
      const typesNode =
        matchingNodes.find((n) => {
          const d = n.data;
          const isEntityOrServiceOrPackage =
            n.id === "types-entity-schemas" ||
            d?.isEntitySchemas ||
            d?.label === "Entity Types" ||
            Boolean(d?.sourceEntityId) ||
            Boolean(d?.isServiceEndpointSchemas) ||
            Boolean(d?.isPackageNode || d?.packageName || (d?.packageSources && d.packageSources.length > 0 && !d?.isExtended));
          return !isEntityOrServiceOrPackage;
        }) || matchingNodes[0];
      if (!typesNode) return;

      const typeItem = (typesNode.data?.types || []).find((t: CustomTypeItem) => t.name === baseTypeName);
      if (!typeItem) return;

      const expectedSourceHandle = `type-out-${typeItem.id}`;

      const existingEdgesForField = edges.filter(
        (e) => e.target === id && e.targetHandle === expectedTargetHandle,
      );

      if (existingEdgesForField.length > 0) {
        const primary = existingEdgesForField[0]!;
        // Update the edge in-place if source node or source handle changed
        if (primary.source !== typesNode.id || primary.sourceHandle !== expectedSourceHandle) {
          updateEdge(primary.id, {
            source: typesNode.id,
            sourceHandle: expectedSourceHandle,
            data: {
              label: typeItem.name,
              isTypeReference: true,
              baseTypeName: typeItem.name,
            },
          });
        }
        // Prune any duplicate edges targeting this same field
        for (let i = 1; i < existingEdgesForField.length; i++) {
          const dup = existingEdgesForField[i];
          if (dup) deleteEdge(dup.id);
        }
      } else {
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
  }, [data.fields, id, allNodes, edges, addEdge, updateEdge, deleteEdge]);

  // Auto-heal / generate reducer function for any field missing customReducerCode or incompatible with its type
  useEffect(() => {
    if (!data.fields || data.fields.length === 0) return;
    let needsUpdate = false;
    const healed = data.fields.map((f) => {
      const isArray = Boolean(f.isArray || f.type?.endsWith("[]") || f.type === "array");
      const cleanBase = (f.type || "string").replace(/\[\]$/, "").trim();
      const matchedCustom = resolveCustomType({
        availableTypes: availableCustomTypes,
        typeName: cleanBase,
        typeId: f.customTypeId,
      });
      const isMissingCode = !f.customReducerCode || !f.customReducerCode.trim();
      const isMismatched = Boolean(
        f.customReducerCode && !isReducerCodeCompatibleWithType(f.customReducerCode, f.type, isArray),
      );
      const isSchemaMismatch = Boolean(
        matchedCustom &&
          !isArray &&
          f.customReducerCode &&
          f.customReducerCode.includes("Initial shape guaranteed by type schema") &&
          extractFieldsFromCustomType(matchedCustom).some((field) => !f.customReducerCode?.includes(`${field.name}:`)),
      );
      const isArrayWithObjectReducer = Boolean(
        isArray &&
          f.customReducerCode &&
          f.customReducerCode.includes("Initial shape guaranteed by type schema"),
      );
      if (isMissingCode || isMismatched || isSchemaMismatch || isArrayWithObjectReducer) {
        needsUpdate = true;
        const generated = getSuggestedReducerCodeForChannelType(f.type, matchedCustom, isArray);
        return {
          ...f,
          customReducerCode: generated,
          actions: getSupportedActionsForType(f.type, isArray, f.name),
          defaultValue: isArray && (f.defaultValue === "" || f.defaultValue === null || f.defaultValue === undefined) ? [] : f.defaultValue,
          customTypeId: matchedCustom?.id || f.customTypeId,
        };
      }
      return f;
    });
    if (needsUpdate) {
      updateNode(id, {
        data: {
          ...data,
          fields: healed,
        },
      });
    }
  }, [data.fields, id, availableCustomTypes, updateNode]);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl bg-card/95 backdrop-blur-md border-2 w-[390px] shadow-lg transition-all duration-200 cursor-pointer select-none",
        selected
          ? hasErrors
            ? "border-destructive shadow-destructive/20 ring-4 ring-destructive/20 scale-[1.02]"
            : "border-indigo-500 shadow-indigo-500/20 ring-4 ring-indigo-500/20 scale-[1.02]"
          : hasErrors
            ? "border-destructive/80 hover:border-destructive shadow-md shadow-destructive/10"
            : "border-border/80 hover:border-indigo-500/70 hover:shadow-xl",
        borderClass,
      )}
      onDoubleClick={() => handleOpenConfig()}
    >
      {/* Node-level target handle for TypesNode / Action connections */}
      {/* <Handle
        type="target"
        position={Position.Left}
        id="store-in"
        className={cn(
          CANVAS_NODE_HANDLE_CLASS,
          CANVAS_NODE_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-indigo-500 !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "28px" }}
        title="Connect from TypesNode, Page, or Action"
      /> */}

      {/* Header Container */}
      <div className="flex flex-col gap-1.5 p-3 pb-2.5 border-b border-border/50">
        <div className="flex items-center justify-between gap-2.5 w-full">
          {/* Icon + Label */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 shrink-0">
              <Database size={15} />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
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
                    className="h-6 text-xs font-bold px-1.5 py-0 bg-background/90 border-border/80 w-full"
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
                  <span className="text-xs font-bold text-foreground tracking-wide truncate hover:text-indigo-400 transition-colors">
                    {currentStoreName || "App Store"}
                  </span>
                  <Edit3
                    size={10}
                    className="opacity-0 group-hover/name:opacity-70 text-muted-foreground transition-opacity shrink-0"
                  />
                </div>
              )}
              <span className="text-[9px] font-mono text-muted-foreground">
                {fieldCount} {fieldCount === 1 ? "state variable" : "state variables"}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-[9px] uppercase font-mono font-extrabold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 cursor-pointer"
              onClick={handleOpenConfig}
              title="Open State Store Configuration"
            >
              State Schema
            </Button>
            <button
              className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
              onClick={handleOpenConfig}
              title="Configure State Store"
            >
              <Settings size={13} />
            </button>
            <button
              className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              onClick={handleDelete}
              title="Delete Node"
            >
              <Trash size={13} />
            </button>
          </div>
        </div>

        {/* Badges row: Duplicate Warnings, Engine */}
        <div className="flex items-center justify-between gap-1 pt-0.5 text-[8px] font-mono flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {isDuplicateStoreName && (
              <span
                className="flex items-center gap-0.5 text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide"
                title={`Duplicate App Store name "${currentStoreName}"! Store names must be unique.`}
              >
                <AlertTriangle size={8} />
                <span>DUP STORE</span>
              </span>
            )}
            {duplicateFieldIds.size > 0 && (
              <span
                className="flex items-center gap-0.5 text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-destructive/15 text-destructive border border-destructive/30 uppercase tracking-wide"
                title="Duplicate variable names detected in this store!"
              >
                <AlertTriangle size={8} />
                <span>DUP FIELDS</span>
              </span>
            )}
          </div>
          <span className="text-[8px] text-indigo-400/90 font-bold uppercase tracking-wider">Zustand</span>
        </div>
      </div>

      {/* State Variables List (1 Reducer per Variable with Multiple Actions) */}
      <div className="flex flex-col gap-1.5 p-2.5 pt-2 nodrag">
        <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1.5 py-0.5 bg-secondary/30 rounded border border-border/30 group">
          <div className="flex items-center gap-1.5">
            <span>State Variables</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            onClick={handleAddField}
            title="Add State Variable"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          {(!data.fields || data.fields.length === 0) ? (
            <div className="text-[10px] text-muted-foreground italic text-center py-3">
              No state variables. Click + to add.
            </div>
          ) : (
            data.fields.map((f) => {
              const isDupe = duplicateFieldIds.has(f.id);
              const isEditingField = editingFieldId === f.id;
              const cleanFieldBaseType = (f.type || "").replace(/\[\]$/, "").trim();
              const isFieldArray = Boolean(
                f.isArray || f.type?.endsWith("[]") || f.type === "array",
              );
              const displayType = isFieldArray && !cleanFieldBaseType.endsWith("[]") && cleanFieldBaseType !== "array"
                ? `${cleanFieldBaseType}[]`
                : f.type || "string";
              const isCustomType = availableCustomTypes.some(
                (t) => t.name === f.type || t.name === cleanFieldBaseType,
              );
              const supportedActions =
                f.actions && f.actions.length > 0 && !(isFieldArray && !f.actions.includes("append"))
                  ? f.actions
                  : getSupportedActionsForType(f.type, isFieldArray, f.name);
              const reducerName = f.reducer || `${f.name || "state"}_reducer`;

              const isOutputConnected = edges.some(
                (e) =>
                  e.source === id &&
                  (e.sourceHandle === `store-field-out-${f.id}` ||
                    e.sourceHandle === `setter-out-${f.id}` ||
                    e.sourceHandle === `append-out-${f.id}` ||
                    e.sourceHandle === `pop-out-${f.id}`),
              );
              const isInputConnected = edges.some(
                (e) =>
                  e.target === id &&
                  (e.targetHandle === `store-field-in-${f.id}` ||
                    e.targetHandle === `setter-in-left-${f.id}` ||
                    e.targetHandle === `setter-in-${f.id}` ||
                    e.targetHandle === `append-in-left-${f.id}` ||
                    e.targetHandle === `pop-in-left-${f.id}`),
              );

              if (isEditingField) {
                return (
                  <div
                    key={f.id}
                    className="flex flex-col gap-2 p-2.5 rounded-lg bg-secondary/80 border border-indigo-500/50 shadow-md nodrag relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Left target handle preserved during editing so edges don't break */}
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`store-field-in-${f.id}`}
                      className={cn(
                        CANVAS_ROW_HANDLE_CLASS,
                        CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
                        "!border-2 !border-background cursor-pointer hover:scale-125 transition-all z-10",
                        isInputConnected
                          ? "!bg-indigo-400 ring-2 ring-indigo-500/50 scale-110"
                          : "!bg-indigo-500 hover:!bg-indigo-400",
                      )}
                      style={{ top: "50%" }}
                      title={`${f.name}: Wire from WebPage action or connect from TypesNode`}
                    />
                    {/* Right source handle preserved during editing so edges don't break */}
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`store-field-out-${f.id}`}
                      className={cn(
                        CANVAS_ROW_HANDLE_CLASS,
                        CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
                        "!border-2 !border-background cursor-pointer hover:scale-125 transition-all z-10",
                        isOutputConnected
                          ? "!bg-cyan-400 ring-2 ring-cyan-500/50 scale-110"
                          : "!bg-cyan-500 hover:!bg-cyan-400",
                      )}
                      style={{ top: "50%" }}
                      title={`${f.name}: Drag to WebPage to read / render state`}
                    />
                    <div className="flex items-center gap-1.5">
                      <LocalInput
                        className="h-7 text-xs font-mono font-semibold bg-background flex-1"
                        value={f.name}
                        placeholder="field_name"
                        autoFocus
                        onChange={(e) => handleUpdateField(f.id, { name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setEditingFieldId(null);
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        variant="default"
                        className="h-7 w-7 bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 cursor-pointer"
                        onClick={() => setEditingFieldId(null)}
                        title="Done editing"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                        onClick={(e) => handleDeleteField(f.id, e)}
                        title="Delete state variable"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                          Type
                        </span>
                        <button
                          type="button"
                          className={cn(
                            "h-5 px-2 text-[10px] font-mono rounded transition-all flex items-center gap-1.5 cursor-pointer border select-none",
                            isFieldArray
                              ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/25 shadow-2xs"
                              : "bg-background/60 text-muted-foreground/80 hover:text-foreground border-border/50 hover:bg-secondary/70",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleArrayField(f.id);
                          }}
                          title={
                            isFieldArray
                              ? "Array type active (click to make single)"
                              : "Single value (click to make array [])"
                          }
                        >
                          <span
                            className={cn(
                              "font-bold text-[11px]",
                              isFieldArray ? "text-cyan-400" : "text-muted-foreground/60",
                            )}
                          >
                            []
                          </span>
                          <span className="text-[9.5px] font-medium tracking-wide">Array</span>
                          {isFieldArray && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]" />
                          )}
                        </button>
                      </div>
                      <TwoStepTypeSelector
                        value={cleanFieldBaseType}
                        selectedTypeId={f.customTypeId}
                        selectedGroupId={f.customTypeGroupId}
                        onValueChange={(newType, typeItem, groupId) => {
                          const cleanNewType = newType.replace(/\[\]$/, "").trim();
                          const matchedCustom =
                            typeItem ||
                            resolveCustomType({
                              availableTypes: availableCustomTypes,
                              typeName: cleanNewType,
                              typeId: f.customTypeId,
                            });
                          const isCustom = Boolean(matchedCustom);
                          const isTargetArray = isFieldArray || cleanNewType === "array";
                          const targetType = isTargetArray
                            ? cleanNewType === "array" ? "array" : `${cleanNewType}[]`
                            : cleanNewType;
                          const targetActions = getSupportedActionsForType(
                            isCustom && !isTargetArray ? "object" : targetType,
                            isTargetArray,
                            f.name,
                          );
                          const generatedReducerCode = getSuggestedReducerCodeForChannelType(
                            targetType,
                            matchedCustom,
                            isTargetArray,
                          );
                          const patch: Partial<GlobalStoreField> = {
                            type: targetType,
                            isArray: isTargetArray,
                            actions: targetActions,
                            customReducerCode: generatedReducerCode,
                            customTypeId: matchedCustom?.id,
                            customTypeGroupId: groupId,
                          };
                          if (isCustom && !isTargetArray && (f.defaultValue === "" || f.defaultValue === undefined)) {
                            patch.defaultValue = null;
                          } else if (isTargetArray && (f.defaultValue === "" || f.defaultValue === undefined || f.defaultValue === null)) {
                            patch.defaultValue = [];
                          }
                          handleUpdateField(f.id, patch);
                        }}
                        allNodes={allNodes}
                        compact
                      />
                    </div>

                    {/* Reducer & Actions breakdown */}
                    <div className="p-1.5 rounded bg-background/60 border border-border/30 text-[8px] font-mono text-muted-foreground flex flex-col gap-0.5">
                      <div className="flex items-center gap-1 text-foreground/80 font-semibold">
                        <GitMerge size={9} className="text-indigo-400 shrink-0" />
                        <span>Reducer: <code className="text-indigo-400">{reducerName}</code></span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <span className="text-muted-foreground/60">Actions:</span>
                        {supportedActions.map((act) => (
                          <span key={act} className="px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-semibold">
                            {act}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={f.id}
                  className={cn(
                    "relative flex items-center justify-between bg-secondary/40 hover:bg-secondary/70 pr-2 pl-3  py-1.5 rounded-lg text-[10px] font-mono border border-border/40 group transition-all nodrag",
                    isDupe && "border-destructive/40 bg-destructive/10 text-destructive",
                  )}
                >
                  {/* Left target handle: connects Type from TypesNode, or action/trigger that mutates this state variable via its reducer */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`store-field-in-${f.id}`}
                    className={cn(
                      CANVAS_ROW_HANDLE_CLASS,
                      CANVAS_ROW_HANDLE_LEFT_OFFSET_CLASS,
                      "!border-2 !border-background cursor-pointer hover:scale-125 transition-all z-10",
                      isInputConnected
                        ? "!bg-indigo-400 ring-2 ring-indigo-500/50 scale-110"
                        : "!bg-indigo-500 hover:!bg-indigo-400",
                    )}
                    style={{ top: "50%" }}
                    title={`${f.name}: Wire from WebPage action to update state via reducer, or connect from TypesNode${isInputConnected ? " (connected)" : ""}`}
                  />

                  <div
                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFieldId(f.id);
                    }}
                    title="Click to edit field name & reducer configuration"
                  >
                    <span
                      className={cn(
                        "font-bold truncate max-w-[150px]",
                        isDupe
                          ? "text-destructive font-bold"
                          : !f.name
                            ? "text-amber-500 italic"
                            : "text-foreground",
                      )}
                    >
                      {f.name || "(unnamed)"}
                    </span>

                    {isCustomType ? (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-4 border-cyan-500/40 bg-cyan-500/10 text-cyan-400 font-mono font-normal shrink-0 flex items-center gap-1"
                      >
                        <Braces className="w-2.5 h-2.5" />
                        {displayType}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-4 border-border/60 text-muted-foreground font-mono font-normal shrink-0"
                      >
                        {displayType}
                      </Badge>
                    )}

                    {/* Reducer indicator: 1 reducer with multiple actions */}
                    <Badge
                      variant="outline"
                      className="text-[7.5px] px-1 py-0 h-3.5 border-indigo-500/30 bg-indigo-500/10 text-indigo-400 font-mono font-medium shrink-0 flex items-center gap-0.5"
                      title={`Reducer: ${reducerName}\nHandles ${supportedActions.length} actions: ${supportedActions.join(", ")}`}
                    >
                      <GitMerge className="w-2.5 h-2.5" />
                      <span>{supportedActions.length} actions</span>
                    </Badge>


                  </div>

                  <div className="flex items-center gap-0.5 ml-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-secondary cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFieldId(f.id);
                      }}
                      title="Edit state variable"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      onClick={(e) => handleDeleteField(f.id, e)}
                      title="Delete state variable"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                          title="More options"
                        >
                          <MoreVertical className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 text-xs font-sans">
                        <DropdownMenuItem
                          onClick={() => setEditingFieldId(f.id)}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit inline
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleArrayField(f.id);
                          }}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Brackets className="w-3.5 h-3.5 text-cyan-400" />
                          {isFieldArray ? "Convert to single" : "Convert to array []"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenConfig()}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Settings2 className="w-3.5 h-3.5" /> Open in Inspector
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicateField(f)}
                          className="gap-2 text-xs cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" /> Duplicate variable
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteField(f.id, e)}
                          className="gap-2 text-xs text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete variable
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Right source handle: connects to WebPage to read / render state variable */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`store-field-out-${f.id}`}
                    className={cn(
                      CANVAS_ROW_HANDLE_CLASS,
                      CANVAS_ROW_HANDLE_RIGHT_OFFSET_CLASS,
                      "!border-2 !border-background cursor-pointer hover:scale-125 transition-all z-10",
                      isOutputConnected
                        ? "!bg-cyan-400 ring-2 ring-cyan-500/50 scale-110"
                        : "!bg-cyan-500 hover:!bg-cyan-400",
                    )}
                    style={{ top: "50%" }}
                    title={`${f.name}: Drag to WebPage to read / render state${isOutputConnected ? " (connected)" : ""}`}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Hidden / Fallback handles for backward compatibility with existing saved edges */}
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
      <Handle
        type="source"
        position={Position.Right}
        id="populate-out"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="populate-in-left"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="populate-in"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="reset-out"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="reset-in-left"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="reset-in"
        style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
      />
      {data.fields?.map((f) => (
        <React.Fragment key={`legacy-handles-${f.id}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`setter-in-left-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id={`setter-in-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`setter-out-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id={`append-in-left-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`append-out-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id={`pop-in-left-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`pop-out-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id={`mutate-in-left-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`mutate-out-${f.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
        </React.Fragment>
      ))}
      {data.actions?.map((act) => (
        <React.Fragment key={`legacy-action-handles-${act.id}`}>
          <Handle
            type="target"
            position={Position.Left}
            id={`store-action-in-left-${act.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id={`store-action-in-${act.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`store-action-out-${act.id}`}
            style={{ top: "50%", opacity: 0, pointerEvents: "none" }}
          />
        </React.Fragment>
      ))}
    </div>
  );
};
