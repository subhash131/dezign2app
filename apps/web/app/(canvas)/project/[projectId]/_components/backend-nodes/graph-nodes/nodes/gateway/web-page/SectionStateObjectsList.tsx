import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Database,
  Settings,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Search,
  Zap,
} from "lucide-react";
import {
  BackendNode,
  PageStateObject,
  GlobalStoreField,
  PageSection,
  UIEventItem,
} from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { LocalInput } from "../../../common";

interface SectionStateObjectsListProps {
  nodeId: string;
  section: PageSection;
  sections: PageSection[];
  updateSections: (sections: PageSection[]) => void;
}

const FIELD_TYPES = ["string", "number", "boolean", "array", "object"];

export const SectionStateObjectsList: React.FC<SectionStateObjectsListProps> = ({
  nodeId,
  section,
  sections,
  updateSections,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [fieldSearch, setFieldSearch] = useState<string>("");

  // Local state for picker dialog to guarantee 0ms instant UI checkbox toggle
  const [localPickerStates, setLocalPickerStates] = useState<PageStateObject[] | null>(null);
  const commitTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const latestLocalStatesRef = React.useRef<PageStateObject[] | null>(null);
  latestLocalStatesRef.current = localPickerStates;

  // Inline edit state
  const [editingStateId, setEditingStateId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("string");
  const [editDefault, setEditDefault] = useState("");

  const configuredStates: PageStateObject[] = localPickerStates ?? (section.stateObjects || []);

  // Auto-sync edges for configured state objects (ensures edges are drawn between state store fields and rendered section state)
  React.useEffect(() => {
    if (!configuredStates || configuredStates.length === 0) return;

    configuredStates.forEach((st) => {
      let storeNode = nodes.find((n) => n.id === st.storeId && n.type === "state_store");
      if (!storeNode && st.storeName) {
        storeNode = nodes.find(
          (n) => n.type === "state_store" && (n.data?.label === st.storeName || n.data?.storeName === st.storeName),
        );
      }
      if (!storeNode) return;

      const fields: GlobalStoreField[] = storeNode.data?.fields || [];
      const field = fields.find((f) => f.id === st.fieldId || f.name === st.name);
      if (!field) return;

      const expectedSourceHandle = `store-field-out-${field.id}`;
      const expectedTargetHandle = `section-state-in-${section.id}-${st.id}`;

      const edgeExists = edges.some(
        (e) =>
          e.source === storeNode!.id &&
          e.target === nodeId &&
          e.sourceHandle === expectedSourceHandle &&
          e.targetHandle === expectedTargetHandle,
      );

      if (!edgeExists) {
        addEdge({
          id: `edge-state-${storeNode.id}-${field.id}-${nodeId}-${section.id}-${st.id}`,
          source: storeNode.id,
          target: nodeId,
          sourceHandle: expectedSourceHandle,
          targetHandle: expectedTargetHandle,
          type: "connection",
          data: {
            isStateSubscription: true,
            storeName: storeNode.data?.label || storeNode.data?.storeName || st.storeName,
            fieldName: st.name,
          },
        });
      }
    });
  }, [configuredStates, section.id, nodeId, nodes, edges, addEdge]);

  // Auto-sync type reference edges between TypesNode and section state objects
  React.useEffect(() => {
    if (!configuredStates || configuredStates.length === 0) return;

    configuredStates.forEach((st) => {
      if (!st.type) return;
      const baseTypeName = st.type.replace(/\[\]$/, "").trim();
      if (!baseTypeName || ["string", "number", "boolean", "array", "object", "any"].includes(baseTypeName.toLowerCase())) {
        return;
      }

      const typesNode = nodes.find(
        (n) => n.type === "types" && (n.data?.types || []).some((t: any) => t.name === baseTypeName),
      );
      if (!typesNode) return;

      const typeItem = (typesNode.data?.types || []).find((t: any) => t.name === baseTypeName);
      if (!typeItem) return;

      const expectedSourceHandle = `type-out-${typeItem.id}`;
      const expectedTargetHandle = `section-state-in-${section.id}-${st.id}`;

      const edgeExists = edges.some(
        (e) =>
          e.source === typesNode.id &&
          e.target === nodeId &&
          e.sourceHandle === expectedSourceHandle &&
          e.targetHandle === expectedTargetHandle,
      );

      if (!edgeExists) {
        addEdge({
          id: `edge-type-${typesNode.id}-${typeItem.id}-${nodeId}-${section.id}-${st.id}`,
          source: typesNode.id,
          target: nodeId,
          sourceHandle: expectedSourceHandle,
          targetHandle: expectedTargetHandle,
          type: "type-reference",
          data: {
            isTypeReference: true,
            baseTypeName: typeItem.name,
          },
        });
      }
    });
  }, [configuredStates, section.id, nodeId, nodes, edges, addEdge]);

  // 1. Discover all StateStore nodes for this WebPage
  const connectedStoreIds = new Set<string>();

  // Direct edges between this page and a state_store node
  edges.forEach((e) => {
    const isSource = e.source === nodeId;
    const isTarget = e.target === nodeId;
    if (!isSource && !isTarget) return;

    const otherId = isSource ? e.target : e.source;
    const otherNode = nodes.find((n) => n.id === otherId);
    if (otherNode?.type === "state_store") {
      connectedStoreIds.add(otherNode.id);
    }
  });

  // Stores with targetPageId pointing directly to this page
  nodes.forEach((n) => {
    if (n.type === "state_store" && n.data?.targetPageId === nodeId) {
      connectedStoreIds.add(n.id);
    }
  });

  // Action store bindings defined in page sections
  sections.forEach((s) => {
    (s.actions || []).forEach((a) => {
      if (a.storeActionBinding?.storeNodeId) {
        connectedStoreIds.add(a.storeActionBinding.storeNodeId);
      }
    });
  });

  const allStateStoreNodes = nodes.filter((n) => n.type === "state_store");

  const associatedStores = [...allStateStoreNodes].sort((a, b) => {
    const aCount = configuredStates.filter(
      (s) => s.storeId === a.id || s.storeName === (a.data?.label || a.data?.storeName),
    ).length;
    const bCount = configuredStates.filter(
      (s) => s.storeId === b.id || s.storeName === (b.data?.label || b.data?.storeName),
    ).length;
    if (aCount !== bCount) return bCount - aCount;
    const aConn = connectedStoreIds.has(a.id) ? 1 : 0;
    const bConn = connectedStoreIds.has(b.id) ? 1 : 0;
    if (aConn !== bConn) return bConn - aConn;
    const aName = a.data?.label || a.data?.storeName || "";
    const bName = b.data?.label || b.data?.storeName || "";
    return aName.localeCompare(bName);
  });

  const activeStoreId = selectedStoreId || associatedStores[0]?.id || "";
  const currentStore = associatedStores.find((s) => s.id === activeStoreId) || associatedStores[0];

  const commitStates = React.useCallback(
    (nextStates: PageStateObject[]) => {
      // 1. Synchronize edges for removed state objects
      const currentConfigured = section.stateObjects || [];
      const nextIds = new Set(nextStates.map((s) => s.id));
      const removedStates = currentConfigured.filter((s) => !nextIds.has(s.id));

      removedStates.forEach((st) => {
        const targetHandle = `section-state-in-${section.id}-${st.id}`;
        edges
          .filter((e) => e.target === nodeId && e.targetHandle === targetHandle)
          .forEach((e) => deleteEdge(e.id));
      });

      // 2. Add edges for newly added state objects
      const currentIds = new Set(currentConfigured.map((s) => s.id));
      const addedStates = nextStates.filter((s) => !currentIds.has(s.id));
      addedStates.forEach((newObj) => {
        if (newObj.storeId && newObj.fieldId) {
          addEdge({
            id: `edge-state-${newObj.storeId}-${newObj.fieldId}-${nodeId}-${section.id}-${newObj.id}`,
            source: newObj.storeId,
            target: nodeId,
            sourceHandle: `store-field-out-${newObj.fieldId}`,
            targetHandle: `section-state-in-${section.id}-${newObj.id}`,
            type: "connection",
            data: {
              isStateSubscription: true,
              storeName: newObj.storeName || "Store",
              fieldName: newObj.name,
            },
          });
        }
      });

      // 3. Update section states in canvas
      const updated = sections.map((s) =>
        s.id === section.id ? { ...s, stateObjects: nextStates } : s,
      );
      updateSections(updated);
    },
    [section.id, section.stateObjects, sections, updateSections, edges, nodeId, deleteEdge, addEdge],
  );

  const scheduleCommit = (nextStates: PageStateObject[]) => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
    }
    commitTimeoutRef.current = setTimeout(() => {
      commitStates(nextStates);
      commitTimeoutRef.current = null;
    }, 250);
  };

  const flushCommit = React.useCallback(() => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }
    if (latestLocalStatesRef.current !== null) {
      commitStates(latestLocalStatesRef.current);
    }
  }, [commitStates]);

  React.useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  const handleOpenPicker = () => {
    setLocalPickerStates(section.stateObjects || []);
    setIsPickerOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      flushCommit();
      setLocalPickerStates(null);
    } else {
      setLocalPickerStates(section.stateObjects || []);
    }
    setIsPickerOpen(open);
  };

  const updateSectionStates = (nextStates: PageStateObject[]) => {
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, stateObjects: nextStates } : s,
    );
    updateSections(updated);
  };

  // Toggle a field from the selected store - instantaneous 0ms UI update
  const handleToggleStoreField = (store: BackendNode, field: GlobalStoreField) => {
    const storeName = store.data?.label || store.data?.storeName || "Store";
    const current = configuredStates;
    const isAlreadySelected = current.some(
      (s) => s.fieldId === field.id || (s.storeId === store.id && s.name === field.name),
    );

    let nextStates: PageStateObject[];
    if (isAlreadySelected) {
      nextStates = current.filter(
        (s) => !(s.fieldId === field.id || (s.storeId === store.id && s.name === field.name)),
      );
    } else {
      const comp = field.suggestedComponent || (field.type === "boolean" ? "switch" : (field.type === "string" || field.type === "number") ? "input" : "badge");
      const newObj: PageStateObject = {
        id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: field.name,
        type: field.type,
        defaultValue: field.defaultValue,
        storeId: store.id,
        storeName,
        fieldId: field.id,
        renderConfig: {
          enabled: true,
          component: comp,
          propMappings: comp === "input" ? {
            inputType: field.type === "number" ? "number" : "text",
            placeholder: `Enter ${field.name}...`,
            readOnly: false,
            onChangeMode: "two_way",
            debounceUpdate: true,
            debounceMs: 300,
            commitOnEnter: true,
            commitOnBlur: true,
          } : undefined,
        },
      };
      nextStates = [...current, newObj];
    }

    setLocalPickerStates(nextStates);
    scheduleCommit(nextStates);
  };

  // Select all visible fields of current store - instantaneous 0ms UI update
  const handleSelectAllVisible = (store: BackendNode, fields: GlobalStoreField[]) => {
    const storeName = store.data?.label || store.data?.storeName || "Store";
    const current = configuredStates;
    const existingFieldIds = new Set(current.map((s) => s.fieldId));

    const toAdd: PageStateObject[] = fields
      .filter((f) => !existingFieldIds.has(f.id))
      .map((f) => {
        const comp = f.suggestedComponent || (f.type === "boolean" ? "switch" : (f.type === "string" || f.type === "number") ? "input" : "badge");
        return {
          id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 4)}-${f.id}`,
          name: f.name,
          type: f.type,
          defaultValue: f.defaultValue,
          storeId: store.id,
          storeName,
          fieldId: f.id,
          renderConfig: {
            enabled: true,
            component: comp,
            propMappings: comp === "input" ? {
              inputType: f.type === "number" ? "number" : "text",
              placeholder: `Enter ${f.name}...`,
              readOnly: false,
              onChangeMode: "two_way",
              debounceUpdate: true,
              debounceMs: 300,
              commitOnEnter: true,
              commitOnBlur: true,
            } : undefined,
          },
        };
      });

    if (toAdd.length === 0) return;
    const nextStates = [...current, ...toAdd];
    setLocalPickerStates(nextStates);
    scheduleCommit(nextStates);
  };

  // Deselect all fields of current store - instantaneous 0ms UI update
  const handleDeselectAllCurrentStore = (store: BackendNode) => {
    const current = configuredStates;
    const nextStates = current.filter((s) => s.storeId !== store.id);
    setLocalPickerStates(nextStates);
    scheduleCommit(nextStates);
  };

  // Delete a state object
  const handleDeleteState = (stateId: string) => {
    const nextStates = configuredStates.filter((s) => s.id !== stateId);
    const nextActions = (section.actions || []).filter(
      (a) => !(a.scope === "item" && a.itemSourceStateId === stateId),
    );
    const updated = sections.map((s) =>
      s.id === section.id
        ? { ...s, stateObjects: nextStates, actions: nextActions }
        : s,
    );
    updateSections(updated);
    const targetHandle = `section-state-in-${section.id}-${stateId}`;
    edges
      .filter((e) => e.target === nodeId && e.targetHandle === targetHandle)
      .forEach((e) => deleteEdge(e.id));
  };

  // Handle adding an item-level event action for array states
  const handleAddItemEvent = (stateId: string, stateName: string) => {
    const newEventId = `item-evt-${Date.now()}`;
    const newEvent: UIEventItem = {
      id: newEventId,
      name: `${stateName}ItemClick`,
      event: "click",
      scope: "item",
      itemSourceStateId: stateId,
      itemContextFields: ["id"],
    };
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, actions: [...(s.actions || []), newEvent] } : s,
    );
    updateSections(updated);
    setActiveConfigItem({
      type: "pageEvent",
      id: newEventId,
      nodeId,
      sectionId: section.id,
    });
  };

  const handleDeleteItemEvent = (eventId: string) => {
    const updated = sections.map((s) =>
      s.id === section.id
        ? {
            ...s,
            actions: (s.actions || []).filter((a) => a.id !== eventId),
          }
        : s,
    );
    updateSections(updated);
    const targetHandle = `event-in-${eventId}`;
    const sourceHandle = `events-${eventId}`;
    edges
      .filter(
        (e) =>
          (e.target === nodeId && e.targetHandle === targetHandle) ||
          (e.source === nodeId && e.sourceHandle === sourceHandle),
      )
      .forEach((e) => deleteEdge(e.id));
  };

  // Start inline edit
  const handleStartEdit = (st: PageStateObject) => {
    setEditingStateId(st.id);
    setEditName(st.name);
    setEditType(st.type);
    setEditDefault(
      typeof st.defaultValue === "object"
        ? JSON.stringify(st.defaultValue)
        : String(st.defaultValue ?? ""),
    );
  };

  // Save inline edit
  const handleSaveEdit = (stateId: string) => {
    const trimmed = editName.trim().replace(/[^a-zA-Z0-9_$]/g, "");
    if (!trimmed) {
      setEditingStateId(null);
      return;
    }

    let defVal: any = editDefault;
    if (editType === "number") defVal = Number(editDefault) || 0;
    if (editType === "boolean") defVal = editDefault === "true";
    if (editType === "array") {
      try {
        defVal = editDefault ? JSON.parse(editDefault) : [];
      } catch {
        defVal = [];
      }
    }
    if (editType === "object") {
      try {
        defVal = editDefault ? JSON.parse(editDefault) : {};
      } catch {
        defVal = {};
      }
    }

    const nextStates = configuredStates.map((s) =>
      s.id === stateId
        ? {
            ...s,
            name: trimmed,
            type: editType,
            defaultValue: defVal,
          }
        : s,
    );

    updateSectionStates(nextStates);
    setEditingStateId(null);
  };

  const currentStoreFields: GlobalStoreField[] = currentStore?.data?.fields || [];
  const filteredFields = currentStoreFields.filter((f) =>
    f.name.toLowerCase().includes(fieldSearch.toLowerCase().trim()),
  );

  return (
    <div className="flex flex-col border-b border-border/40 nodrag">
      {/* Subsection Header */}
      <div className="px-2.5 py-1 bg-cyan-500/[0.04] border-b border-border/30 flex items-center justify-between text-[9px] select-none">
        <div className="flex items-center gap-1.5 font-semibold text-foreground/80">
          <Database size={11} className="text-cyan-500 shrink-0" />
          <span className="uppercase tracking-wider text-[8px] font-bold">
            Rendered Store State
          </span>
          <span className="text-[7px] font-mono px-1 py-0.2 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
            Zustand
          </span>
          {Boolean(configuredStates.length) && (
            <span className="text-[8px] font-mono text-muted-foreground">
              ({configuredStates.length})
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleOpenPicker}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[8px] font-semibold transition-colors cursor-pointer"
          title="Select Zustand store fields to render in this section"
        >
          <Plus size={9} />
        </button>
      </div>

      {/* State Items List */}
      <div className="flex flex-col gap-1 px-2.5 py-1.5 bg-background/20">
        {configuredStates.length === 0 ? (
          <div className="py-1.5 px-2 flex items-center justify-between rounded bg-muted/10 border border-dashed border-border/50 text-[9px] text-muted-foreground/70">
            <span>No Zustand state bound to this section.</span>
            <button
              type="button"
              onClick={handleOpenPicker}
              className="text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer font-medium"
            >
              + Select fields
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {configuredStates.map((st) => {
              const isConnected = edges.some(
                (e) =>
                  e.target === nodeId &&
                  e.targetHandle === `section-state-in-${section.id}-${st.id}`,
              );
              const isEditing = editingStateId === st.id;

              if (isEditing) {
                return (
                  <div
                    key={st.id}
                    className="flex flex-col gap-1 p-1.5 rounded-md bg-background border border-cyan-500/50 shadow-sm relative"
                  >
                    {/* Left incoming handle preserved during editing so edges don't break */}
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`section-state-in-${section.id}-${st.id}`}
                      className={cn(
                        CANVAS_HANDLE_CLASS,
                        CANVAS_HANDLE_LEFT_OFFSET_CLASS,
                        "border-2 border-background cursor-pointer hover:scale-125 transition-all z-10",
                        isConnected
                          ? "!bg-purple-400 ring-2 ring-purple-500/40"
                          : "!bg-purple-500 hover:!bg-purple-400",
                      )}
                      style={{ top: "50%" }}
                      title={`State subscription: ${st.name} from store ${st.storeName || ""}`}
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Field name"
                        className="h-5 text-[9px] font-mono px-1 py-0 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(st.id);
                          if (e.key === "Escape") setEditingStateId(null);
                        }}
                      />
                      <Select value={editType} onValueChange={setEditType}>
                        <SelectTrigger className="h-5 text-[9px] font-mono w-[65px] px-1 py-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-1">
                      <Input
                        value={editDefault}
                        onChange={(e) => setEditDefault(e.target.value)}
                        placeholder="Default value"
                        className="h-5 text-[9px] font-mono px-1 py-0 flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(st.id);
                          if (e.key === "Escape") setEditingStateId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(st.id)}
                        className="p-1 rounded bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 transition-colors"
                        title="Save"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingStateId(null)}
                        className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                        title="Cancel"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              }

              const isArrayState =
                st.type === "array" ||
                st.type?.endsWith("[]") ||
                st.type?.includes("[]");
              const itemActions = (section.actions || []).filter(
                (act) => act.scope === "item" && act.itemSourceStateId === st.id,
              );

              return (
                <div key={st.id} className="flex flex-col gap-1">
                  <div className="group/row relative flex items-center justify-between px-2 py-1 rounded bg-background/60 border border-border/50 text-[9px] hover:bg-muted/30 transition-colors font-mono">
                    {/* Left incoming handle for this state subscription */}
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`section-state-in-${section.id}-${st.id}`}
                      className={cn(
                        CANVAS_HANDLE_CLASS,
                        CANVAS_HANDLE_LEFT_OFFSET_CLASS,
                        "border-2 border-background cursor-pointer hover:scale-125 transition-all z-10",
                        isConnected
                          ? "!bg-purple-400 ring-2 ring-purple-500/40"
                          : "!bg-purple-500 hover:!bg-purple-400",
                      )}
                      style={{ top: "50%" }}
                      title={`State subscription: ${st.name} from store ${st.storeName || ""}${isConnected ? " (connected)" : ""}`}
                    />

                    <div className="flex items-center gap-1.5 min-w-0 flex-1 pl-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                      <span
                        className="font-medium text-foreground/90 truncate cursor-pointer hover:text-cyan-400 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveConfigItem({
                            type: "pageState",
                            id: st.id,
                            nodeId,
                            sectionId: section.id,
                          });
                        }}
                        title="Click to configure state variable"
                      >
                        {st.name}
                      </span>
                      <span className="text-[7px] px-1 py-0.2 rounded bg-secondary text-muted-foreground/80 border border-border/40 shrink-0">
                        {st.type}
                      </span>
                      {st.renderConfig?.component && st.renderConfig.component !== "text" && (
                        <span className="text-[7px] px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                          {st.renderConfig.component}
                        </span>
                      )}
                      {st.renderConfig?.enabled === false && (
                        <span className="text-[7px] px-1 py-0.2 rounded bg-muted/60 text-muted-foreground/60 border border-border/30 shrink-0" title="Hidden from UI">
                          hidden
                        </span>
                      )}
                      {st.storeName && (
                        <span className="text-[7px] px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0 truncate max-w-[65px]">
                          {st.storeName}
                        </span>
                      )}
                      {st.defaultValue !== undefined && st.defaultValue !== "" && (
                        <span
                          className="text-[7px] text-muted-foreground/60 truncate max-w-[50px]"
                          title={String(st.defaultValue)}
                        >
                          = {typeof st.defaultValue === "object" ? JSON.stringify(st.defaultValue) : String(st.defaultValue)}
                        </span>
                      )}
                    </div>

                    {/* Hover action buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 ml-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveConfigItem({
                            type: "pageState",
                            id: st.id,
                            nodeId,
                            sectionId: section.id,
                          });
                        }}
                        className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Configure state variable rendering"
                      >
                        <Settings size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteState(st.id)}
                        className="p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                        title="Remove state object"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>

                  {/* Item-level Event Actions for Arrays */}
                  {isArrayState && (
                    <div className="ml-3 pl-2 border-l-2 border-violet-500/30 flex flex-col gap-1 py-0.5">
                      <div className="flex items-center justify-between text-[8px]">
                        <div className="flex items-center gap-1 text-violet-400 font-medium">
                          <Zap size={9} className="text-violet-400" />
                          <span>Item Events ({itemActions.length})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddItemEvent(st.id, st.name)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-400 border border-violet-500/30 text-[7.5px] font-semibold transition-colors cursor-pointer"
                          title={`Add item click action for each item in ${st.name}`}
                        >
                          <Plus size={8} />
                          <span>Add Item Event</span>
                        </button>
                      </div>

                      {itemActions.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {itemActions.map((act) => (
                            <div
                              key={act.id}
                              className="flex items-center justify-between px-1.5 py-0.5 rounded bg-violet-500/5 border border-violet-500/20 text-[8px] hover:bg-violet-500/10 transition-colors"
                            >
                              <div
                                className="flex items-center gap-1 truncate cursor-pointer flex-1"
                                onClick={() =>
                                  setActiveConfigItem({
                                    type: "pageEvent",
                                    id: act.id,
                                    nodeId,
                                    sectionId: section.id,
                                  })
                                }
                              >
                                <span className="font-semibold text-foreground/90 truncate">
                                  {act.name || "Item Click"}
                                </span>
                                <span className="text-[7px] px-1 py-0 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
                                  {act.event || "click"}
                                </span>
                                {act.itemContextFields?.[0] && (
                                  <span className="text-[7px] text-muted-foreground/70 font-mono">
                                    [{act.itemContextFields[0]}]
                                  </span>
                                )}
                                {act.url && (
                                  <span className="text-[7px] text-emerald-500 truncate max-w-[80px]">
                                    → {act.url}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveConfigItem({
                                      type: "pageEvent",
                                      id: act.id,
                                      nodeId,
                                      sectionId: section.id,
                                    })
                                  }
                                  className="p-0.5 rounded hover:bg-violet-500/20 text-muted-foreground hover:text-foreground cursor-pointer"
                                  title="Configure item action"
                                >
                                  <Settings size={9} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItemEvent(act.id)}
                                  className="p-0.5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive cursor-pointer"
                                  title="Remove item action"
                                >
                                  <Trash2 size={9} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Field Picker / Configuration Dialog */}
      <Dialog open={isPickerOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="sm:max-w-[480px] p-5 font-sans">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-foreground">
              <Database size={16} className="text-cyan-500" />
              <span>Select Store State for &ldquo;{section.name || "Section"}&rdquo;</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              A section can render state fields from multiple stores. Switch between stores below to select fields from each.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-3 max-h-[60vh] overflow-y-auto">
            {/* Step 1: Store Selector */}
            {associatedStores.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground">
                      1. Select App Store to Browse
                    </Label>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {associatedStores.length} {associatedStores.length === 1 ? "store" : "stores"} available
                    </span>
                  </div>

                  {/* Store Pills for quick 1-click switching */}
                  {associatedStores.length > 1 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {associatedStores.map((store) => {
                        const name = store.data?.label || store.data?.storeName || "Store";
                        const selCount = configuredStates.filter(
                          (s) => s.storeId === store.id || s.storeName === name,
                        ).length;
                        const isCurrent = store.id === activeStoreId;

                        return (
                          <button
                            key={store.id}
                            type="button"
                            onClick={() => {
                              setSelectedStoreId(store.id);
                              setFieldSearch("");
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all shrink-0 cursor-pointer",
                              isCurrent
                                ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-600 dark:text-cyan-300 font-semibold shadow-sm"
                                : "bg-muted/30 border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <Database size={11} className={isCurrent ? "text-cyan-500" : "text-muted-foreground"} />
                            <span className="truncate max-w-[130px]">{name}</span>
                            {selCount > 0 && (
                              <span className="px-1.5 py-0.2 text-[9px] rounded-full bg-cyan-500 text-white font-bold leading-none">
                                {selCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <Select
                    value={activeStoreId}
                    onValueChange={(val) => {
                      setSelectedStoreId(val);
                      setFieldSearch("");
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs bg-background">
                      <SelectValue placeholder="Select a store..." />
                    </SelectTrigger>
                    <SelectContent>
                      {associatedStores.map((store) => {
                        const name = store.data?.label || store.data?.storeName || "Store";
                        const fCount = store.data?.fields?.length || 0;
                        const scope = store.data?.scope || "global";
                        const selCount = configuredStates.filter(
                          (s) => s.storeId === store.id || s.storeName === name,
                        ).length;

                        return (
                          <SelectItem key={store.id} value={store.id} className="text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <span>{name}</span>
                              <span className="text-[10px] text-muted-foreground uppercase font-mono">
                                ({scope})
                              </span>
                              <span className="text-[10px] font-mono text-cyan-500">
                                • {fCount} {fCount === 1 ? "field" : "fields"}
                              </span>
                              {selCount > 0 && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/25">
                                  {selCount} selected
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 2: Store Fields Checklist */}
                {currentStore && (
                  <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        2. Select Fields to Render
                      </Label>

                      <div className="flex items-center gap-2">
                        {currentStoreFields.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectAllVisible(currentStore, filteredFields)}
                              className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-muted-foreground/40">•</span>
                            <button
                              type="button"
                              onClick={() => handleDeselectAllCurrentStore(currentStore)}
                              className="text-[10px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                            >
                              Deselect All
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            flushCommit();
                            setLocalPickerStates(null);
                            setIsPickerOpen(false);
                            setActiveConfigItem({
                              id: nodeId,
                              nodeId: nodeId,
                              type: "webPage",
                              initialTab: "state",
                              selectedStoreId: currentStore.id,
                            });
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ml-1 cursor-pointer"
                          title="Configure this store in WebPage State tab"
                        >
                          <Settings size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Search input */}
                    {currentStoreFields.length > 4 && (
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                        <LocalInput
                          value={fieldSearch}
                          onChange={(e) => setFieldSearch(e.target.value)}
                          placeholder={`Search ${currentStoreFields.length} fields in ${currentStore.data?.label || "store"}...`}
                          className="h-8 pl-7 text-xs font-mono bg-background"
                        />
                      </div>
                    )}

                    {/* Field checklist */}
                    {currentStoreFields.length === 0 ? (
                      <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-border text-center text-xs text-muted-foreground">
                        No fields defined in this store yet.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            flushCommit();
                            setLocalPickerStates(null);
                            setIsPickerOpen(false);
                            setActiveConfigItem({
                              id: currentStore.id,
                              nodeId: currentStore.id,
                              type: "state_store",
                            });
                          }}
                          className="text-cyan-500 hover:underline font-medium inline"
                        >
                          Add fields in store settings
                        </button>
                      </div>
                    ) : filteredFields.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground italic">
                        No fields match &ldquo;{fieldSearch}&rdquo;
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-[35vh] overflow-y-auto pr-1">
                        {filteredFields.map((f) => {
                          const isSelected = configuredStates.some(
                            (s) =>
                              s.fieldId === f.id ||
                              (s.storeId === currentStore.id && s.name === f.name),
                          );

                          return (
                            <div
                              key={f.id}
                              onClick={() => handleToggleStoreField(currentStore, f)}
                              className={cn(
                                "flex items-center justify-between px-2.5 py-1.5 rounded-md border text-xs cursor-pointer transition-all select-none",
                                isSelected
                                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 font-medium"
                                  : "bg-background/80 border-border/60 hover:bg-muted/40 text-foreground",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0",
                                    isSelected
                                      ? "bg-cyan-500 border-cyan-500 text-white"
                                      : "border-muted-foreground/40 bg-background",
                                  )}
                                >
                                  {isSelected && <Check size={10} strokeWidth={3} />}
                                </div>
                                <span className="font-mono text-xs">{f.name}</span>
                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-secondary text-muted-foreground border border-border/40 shrink-0">
                                  {f.type}
                                </span>
                              </div>

                              {f.defaultValue !== undefined && f.defaultValue !== "" && (
                                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                                  = {typeof f.defaultValue === "object" ? JSON.stringify(f.defaultValue) : String(f.defaultValue)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-border text-center text-xs text-muted-foreground">
                No State Store nodes exist yet. Add a StateStoreNode from the palette to define dynamic state.
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 w-full border-t border-border/40 pt-3">
            <div className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-foreground font-mono">
                {configuredStates.length} {configuredStates.length === 1 ? "field" : "fields"} selected for this section
              </span>
              {configuredStates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground font-mono">
                  <span>Stores:</span>
                  {Array.from(
                    new Set(configuredStates.map((s) => s.storeName || "Store")),
                  ).map((sName) => {
                    const count = configuredStates.filter(
                      (s) => (s.storeName || "Store") === sName,
                    ).length;
                    return (
                      <span
                        key={sName}
                        className="px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 font-medium"
                      >
                        {sName}: {count}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={() => {
                flushCommit();
                setLocalPickerStates(null);
                setIsPickerOpen(false);
              }}
              className="h-8 text-xs px-4"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
