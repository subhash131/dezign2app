"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Check,
  Database,
  CheckSquare,
  Search,
  Settings,
  X,
} from "lucide-react";
import {
  PageSection,
  PageStateObject,
  GlobalStoreField,
  BackendNode,
} from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { StateStoreConfig } from "../StateStoreConfig";
import { StateStoreCombobox } from "../StateStoreCombobox";
import { cn } from "@workspace/ui/lib/utils";

export interface SectionStateTabProps {
  nodeId?: string;
  section?: PageSection;
  sections?: PageSection[];
  onUpdateSection?: (changes: Partial<PageSection>) => void;
}

export const SectionStateTab: React.FC<SectionStateTabProps> = ({
  nodeId,
  section,
  sections = [],
  onUpdateSection,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addNode = useBackendCanvasStore((s) => s.addNode);

  const configuredStoreStates: PageStateObject[] = useMemo(
    () => section?.stateObjects || [],
    [section?.stateObjects],
  );

  // --------------------------------------------------------------------------
  // Zustand Store Integration
  // --------------------------------------------------------------------------
  const allStateStores = useMemo(
    () => nodes.filter((n) => n.type === "state_store"),
    [nodes],
  );

  // Identify stores connected or referenced in this section / page
  const pageConnectedStoreIds = useMemo(() => {
    const ids = new Set<string>();

    if (nodeId) {
      edges.forEach((e) => {
        if (e.source === nodeId) {
          const target = nodes.find((n) => n.id === e.target);
          if (target?.type === "state_store") ids.add(target.id);
        }
        if (e.target === nodeId) {
          const source = nodes.find((n) => n.id === e.source);
          if (source?.type === "state_store") ids.add(source.id);
        }
      });

      nodes.forEach((n) => {
        if (n.type === "state_store" && n.data?.targetPageId === nodeId) {
          ids.add(n.id);
        }
      });
    }

    configuredStoreStates.forEach((st) => {
      if (st.storeId) ids.add(st.storeId);
      if (st.storeNodeId) ids.add(st.storeNodeId);
    });

    (section?.actions || []).forEach((act) => {
      if (act.storeActionBinding?.storeNodeId) {
        ids.add(act.storeActionBinding.storeNodeId);
      }
      if (Array.isArray(act.storeActionBindings)) {
        act.storeActionBindings.forEach((b: any) => {
          if (b?.storeNodeId) ids.add(b.storeNodeId);
        });
      }
    });

    return ids;
  }, [edges, nodes, nodeId, configuredStoreStates, section?.actions]);

  // Sort stores: stores associated with this section/page first, then alphabetical
  const sortedStores = useMemo(() => {
    return [...allStateStores].sort((a, b) => {
      const aCount = configuredStoreStates.filter(
        (s) => s.storeId === a.id || s.storeNodeId === a.id,
      ).length;
      const bCount = configuredStoreStates.filter(
        (s) => s.storeId === b.id || s.storeNodeId === b.id,
      ).length;
      if (aCount !== bCount) return bCount - aCount;

      const aInPage = pageConnectedStoreIds.has(a.id);
      const bInPage = pageConnectedStoreIds.has(b.id);
      if (aInPage && !bInPage) return -1;
      if (!aInPage && bInPage) return 1;

      const aName = a.data?.label || a.data?.storeName || "";
      const bName = b.data?.label || b.data?.storeName || "";
      return aName.localeCompare(bName);
    });
  }, [allStateStores, configuredStoreStates, pageConnectedStoreIds]);

  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    sortedStores[0]?.id || "",
  );

  React.useEffect(() => {
    if (!sortedStores.some((s) => s.id === selectedStoreId) && sortedStores.length > 0) {
      setSelectedStoreId(sortedStores[0]!.id);
    }
  }, [sortedStores, selectedStoreId]);

  const activeStore =
    sortedStores.find((s) => s.id === selectedStoreId) || sortedStores[0];

  // Sub-view inside active store: "fields" (checklist) or "schema" (StateStoreConfig)
  const [storeSubView, setStoreSubView] = useState<"fields" | "schema">("fields");
  const [fieldSearch, setFieldSearch] = useState<string>("");

  const handleCreateStore = () => {
    const rawName = (section?.name || "App").replace(/[^a-zA-Z0-9]/g, "");
    const base = rawName
      ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
      : "App";
    let storeName = `${base}Store`;
    let count = 1;
    while (
      nodes.some(
        (n) =>
          (n.data?.storeName || n.data?.label || "").toLowerCase() ===
          storeName.toLowerCase(),
      )
    ) {
      count++;
      storeName = `${base}${count}Store`;
    }

    const newStoreId = `store-node-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const pageNode = nodes.find((n) => n.id === nodeId);
    const pagePos = pageNode?.position || { x: 300, y: 300 };

    const newStoreNode: BackendNode = {
      id: newStoreId,
      type: "state_store",
      position: { x: pagePos.x + 360, y: pagePos.y },
      fractionalIndex: "a0",
      data: {
        label: storeName,
        storeName,
        description: `Zustand state store for ${section?.name || "Section"}`,
        scope: "global",
        storage: "memory",
        targetPageId: nodeId,
        fields: [
          {
            id: `f-${Date.now()}-1`,
            name: "isLoading",
            type: "boolean",
            defaultValue: false,
          },
          {
            id: `f-${Date.now()}-2`,
            name: "data",
            type: "object",
            defaultValue: {},
          },
        ],
        actions: [
          { id: `act-${Date.now()}-1`, name: "load", actionType: "populate" },
          { id: `act-${Date.now()}-2`, name: "reset", actionType: "reset" },
        ],
      },
    };

    addNode(newStoreNode);
    setSelectedStoreId(newStoreId);
    setStoreSubView("fields");
  };

  const handleToggleStoreField = (store: BackendNode, field: GlobalStoreField) => {
    const storeName = store.data?.label || store.data?.storeName || "Store";
    const isAlreadySelected = configuredStoreStates.some(
      (s) =>
        s.fieldId === field.id ||
        ((s.storeId === store.id || s.storeNodeId === store.id) &&
          s.name === field.name),
    );

    let nextStates: PageStateObject[];
    if (isAlreadySelected) {
      nextStates = configuredStoreStates.filter(
        (s) =>
          !(
            s.fieldId === field.id ||
            ((s.storeId === store.id || s.storeNodeId === store.id) &&
              s.name === field.name)
          ),
      );
    } else {
      const newObj: PageStateObject = {
        id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: field.name,
        type: field.type,
        defaultValue: field.defaultValue,
        storeId: store.id,
        storeNodeId: store.id,
        storeName,
        fieldId: field.id,
      };
      nextStates = [...configuredStoreStates, newObj];
    }

    if (onUpdateSection) {
      onUpdateSection({ stateObjects: nextStates });
    }
  };

  const handleSelectAllVisible = (store: BackendNode, fields: GlobalStoreField[]) => {
    const storeName = store.data?.label || store.data?.storeName || "Store";
    const existingFieldIds = new Set(configuredStoreStates.map((s) => s.fieldId));

    const toAdd: PageStateObject[] = fields
      .filter((f) => !existingFieldIds.has(f.id))
      .map((f) => ({
        id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 4)}-${f.id}`,
        name: f.name,
        type: f.type,
        defaultValue: f.defaultValue,
        storeId: store.id,
        storeNodeId: store.id,
        storeName,
        fieldId: f.id,
      }));

    if (onUpdateSection) {
      onUpdateSection({ stateObjects: [...configuredStoreStates, ...toAdd] });
    }
  };

  const handleDeselectAllCurrentStore = (store: BackendNode) => {
    const nextStates = configuredStoreStates.filter(
      (s) => s.storeId !== store.id && s.storeNodeId !== store.id,
    );
    if (onUpdateSection) {
      onUpdateSection({ stateObjects: nextStates });
    }
  };

  const handleRemoveStoreState = (stateId: string) => {
    const nextStates = configuredStoreStates.filter((s) => s.id !== stateId);
    if (onUpdateSection) {
      onUpdateSection({ stateObjects: nextStates });
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Store Switcher via Combobox & Actions */}
      {sortedStores.length > 0 ? (
        <div className="flex flex-col gap-2.5 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Database size={13} className="text-cyan-500 shrink-0" />
              <span className="text-xs font-semibold text-foreground">
                Zustand Store
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                ({sortedStores.length})
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Fields vs Schema View Toggle */}
              <div className="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() => setStoreSubView("fields")}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer",
                    storeSubView === "fields"
                      ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold shadow-2xs border border-cyan-500/30"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CheckSquare size={11} />
                  <span>Fields</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStoreSubView("schema")}
                  className={cn(
                    "px-2 py-0.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer",
                    storeSubView === "schema"
                      ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold shadow-2xs border border-cyan-500/30"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Settings size={11} />
                  <span>Schema</span>
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCreateStore}
                className="h-7 text-xs px-2 gap-1 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 cursor-pointer"
              >
                <Plus size={12} />
                <span>New Store</span>
              </Button>
            </div>
          </div>

          {/* Searchable Store Combobox */}
          <StateStoreCombobox
            stores={sortedStores}
            selectedStoreId={selectedStoreId}
            onSelectStore={(storeId) => setSelectedStoreId(storeId)}
            onCreateStore={handleCreateStore}
            configuredStoreStates={configuredStoreStates}
            pageConnectedStoreIds={pageConnectedStoreIds}
          />
        </div>
      ) : null}

      {/* Active Store Content */}
      {activeStore ? (
        <div className="flex flex-col gap-3">
          {/* Sub-view A: Subscribed Fields Checklist */}
          {storeSubView === "fields" && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Check fields to subscribe to and render in this section. Compiles directly into type-safe Zustand selector hooks.
              </p>

              {/* Active Section Subscriptions Summary (if any) */}
              {configuredStoreStates.length > 0 && (
                <div className="p-2.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                    <span>Subscribed in this Section ({configuredStoreStates.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {configuredStoreStates.map((st) => (
                      <span
                        key={st.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                      >
                        <span className="text-muted-foreground font-sans">
                          {st.storeName ? `${st.storeName}.` : ""}
                        </span>
                        <span className="font-semibold">{st.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStoreState(st.id)}
                          className="hover:text-destructive transition-colors ml-0.5 cursor-pointer"
                          title="Unsubscribe field"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Search & Batch Actions Bar */}
              {activeStore.data?.fields && activeStore.data.fields.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={12}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={fieldSearch}
                      onChange={(e) => setFieldSearch(e.target.value)}
                      placeholder={`Search ${activeStore.data?.label || "store"} fields...`}
                      className="h-7 pl-7 text-xs bg-background"
                    />
                  </div>

                  {(() => {
                    const visibleFields: GlobalStoreField[] = (
                      activeStore.data?.fields || []
                    ).filter((f: GlobalStoreField) =>
                      f.name.toLowerCase().includes(fieldSearch.toLowerCase()),
                    );
                    return (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleSelectAllVisible(activeStore, visibleFields)
                          }
                          className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDeselectAllCurrentStore(activeStore)
                          }
                          className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Deselect All
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Fields Checklist */}
              {(() => {
                const fields: GlobalStoreField[] = (
                  activeStore.data?.fields || []
                ).filter((f: GlobalStoreField) =>
                  f.name.toLowerCase().includes(fieldSearch.toLowerCase()),
                );

                if (fields.length === 0) {
                  return (
                    <div className="py-6 text-center border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 bg-muted/10">
                      <Database size={18} className="text-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground font-medium">
                        {fieldSearch
                          ? "No fields match your search"
                          : "No fields defined in this store"}
                      </span>
                      {!fieldSearch && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setStoreSubView("schema")}
                          className="h-7 text-xs gap-1 border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 cursor-pointer"
                        >
                          <Settings size={12} />
                          <span>Configure Store Schema</span>
                        </Button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col gap-1.5">
                    {fields.map((field: GlobalStoreField) => {
                      const isSubscribed = configuredStoreStates.some(
                        (s) =>
                          s.fieldId === field.id ||
                          ((s.storeId === activeStore.id ||
                            s.storeNodeId === activeStore.id) &&
                            s.name === field.name),
                      );

                      return (
                        <div
                          key={field.id}
                          onClick={() =>
                            handleToggleStoreField(activeStore, field)
                          }
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                            isSubscribed
                              ? "bg-cyan-500/10 border-cyan-500/40 text-foreground shadow-2xs"
                              : "bg-card border-border/60 hover:border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                "w-4 h-4 rounded flex items-center justify-center border transition-colors",
                                isSubscribed
                                  ? "bg-cyan-500 border-cyan-500 text-white"
                                  : "border-muted-foreground/40 bg-background",
                              )}
                            >
                              {isSubscribed && <Check size={11} strokeWidth={3} />}
                            </div>

                            <span className="text-xs font-mono font-medium truncate text-foreground">
                              {field.name}
                            </span>

                            <span
                              className={cn(
                                "px-1.5 py-0.2 rounded text-[9px] font-mono",
                                field.type === "string" && "bg-blue-500/10 text-blue-500",
                                field.type === "number" && "bg-emerald-500/10 text-emerald-500",
                                field.type === "boolean" && "bg-amber-500/10 text-amber-500",
                                field.type === "array" && "bg-purple-500/10 text-purple-500",
                                field.type === "object" && "bg-indigo-500/10 text-indigo-500",
                              )}
                            >
                              {field.type}
                            </span>
                          </div>

                          {field.defaultValue !== undefined && (
                            <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[100px]">
                              {typeof field.defaultValue === "object"
                                ? JSON.stringify(field.defaultValue)
                                : String(field.defaultValue)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sub-view B: Store Schema Editor (Embedded StateStoreConfig) */}
          {storeSubView === "schema" && (
            <div className="pt-1">
              <StateStoreConfig
                id={activeStore.id}
                nodeId={activeStore.id}
                className="p-0 border-0 overflow-visible"
              />
            </div>
          )}
        </div>
      ) : (
        /* Empty State: No Stores in workspace */
        <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-border/70 text-center gap-3 bg-muted/10">
          <div className="p-3 rounded-full bg-cyan-500/15 text-cyan-500 border border-cyan-500/25">
            <Database size={24} />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <h4 className="text-sm font-semibold text-foreground">
              No Zustand State Stores Defined
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a Zustand store to hold reactive state and actions that can be shared across sections, components, and pages.
            </p>
          </div>
          <Button
            type="button"
            onClick={handleCreateStore}
            className="mt-2 h-8 text-xs gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer"
          >
            <Plus size={13} />
            <span>Create State Store</span>
          </Button>
        </div>
      )}
    </div>
  );
};
