"use client";

import React, { useState, useMemo } from "react";
import {
  Layers,
  Plus,
  Settings,
  Trash2,
  Play,
  ArrowRight,
  MousePointerClick,
  FormInput,
  Layout,
  ToggleLeft,
  Table,
  BadgeAlert,
  ChevronDownSquare,
  Sparkles,
  Search,
  X,
  Pencil,
  PanelLeft,
  PanelTop,
  MessageSquare
} from "lucide-react";
import {
  PageSection,
  SectionComponentBinding,
  ComponentBindingType,
} from "@workspace/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toPascalCase } from "@/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { GenerateFormFromEndpointDialog } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/web-page-component-config";

export interface SectionComponentBindingsListProps {
  nodeId: string;
  section: PageSection;
  sections: PageSection[];
  updateSections: (sections: PageSection[]) => void;
  isLastSubsection?: boolean;
}

const COMPONENT_ICON_MAP: Record<string, React.ElementType> = {
  button: MousePointerClick,
  input: FormInput,
  card: Layout,
  switch: ToggleLeft,
  table: Table,
  badge: BadgeAlert,
  select: ChevronDownSquare,
  sidebar: PanelLeft,
  topbar: PanelTop,
  chat: MessageSquare,
};

export const SectionComponentBindingsList: React.FC<SectionComponentBindingsListProps> = ({
  nodeId,
  section,
  sections,
  updateSections,
  isLastSubsection,
}) => {
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const componentBindings = section.componentBindings || [];

  // Auto-activate (focus & select) name input when adding or editing a component
  React.useEffect(() => {
    if (editingCompId) {
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
  }, [editingCompId]);

  const visibleBindings = useMemo(() => {
    if (!searchQuery.trim()) return componentBindings;
    const q = searchQuery.toLowerCase().trim();
    return componentBindings.filter((c) => {
      return (
        (c.label || "").toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.componentType || "").toLowerCase().includes(q) ||
        (c.valueStateName || "").toLowerCase().includes(q) ||
        (c.actionName || "").toLowerCase().includes(q)
      );
    });
  }, [componentBindings, searchQuery]);

  // When they add a new component, activate the name input field immediately
  const handleAddComponent = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newId = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const realActions = (section.actions || []).filter(
      (a) => a.name !== "pageLoad" && a.name !== "init",
    );
    const chosenAction = realActions[0];

    const firstStateObj = section.stateObjects?.[0];
    const firstVar = section.states?.[0];
    const defaultStateName = firstStateObj?.name || firstVar?.name;
    const defaultStoreName = firstStateObj?.storeName;
    const isStore = typeof defaultStoreName === "string" && defaultStoreName.length > 0;

    const newBinding: SectionComponentBinding = {
      id: newId,
      name: "",
      componentType: "button",
      label: "",
      variant: "default",
      actionId: chosenAction?.id,
      actionName: chosenAction?.name,
      triggerEvent: "click",
      valueStateName: defaultStateName,
      valueSourceType: isStore ? "store" : "local",
      valueStoreName: defaultStoreName,
    };

    const nextBindings = [...componentBindings, newBinding];
    const updatedSections = sections.map((sec) =>
      sec.id === section.id
        ? { ...sec, componentBindings: nextBindings }
        : sec,
    );
    updateSections(updatedSections);

    setEditingCompId(newId);
    setEditingText("");
  };

  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleTextChange = (val: string) => {
    setEditingText(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    // Do not format while user has trailing whitespace (still typing next word)
    if (val.trim() && !/\s$/.test(val)) {
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        const formatted = toPascalCase(val);
        if (formatted) {
          setEditingText(formatted);
        }
      }, 500);
    }
  };

  const handleStartRename = (comp: SectionComponentBinding, e: React.MouseEvent) => {
    e.stopPropagation();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setEditingCompId(comp.id);
    setEditingText(comp.name || comp.label || "");
  };

  const handleSaveRename = (compId: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const comp = componentBindings.find((c) => c.id === compId);
    const trimmed = editingText.trim();
    const olderName = comp?.name || comp?.label || "";

    if (!trimmed) {
      if (olderName) {
        // while renaming if the name field is empty switch back to older name
        setEditingCompId(null);
        return;
      }
      // if they enter the name keep it else remove it
      // olderName was empty (new component) -> remove it!
      const nextBindings = componentBindings.filter((c) => c.id !== compId);
      const updatedSections = sections.map((sec) =>
        sec.id === section.id
          ? { ...sec, componentBindings: nextBindings }
          : sec,
      );
      updateSections(updatedSections);
      setEditingCompId(null);
      return;
    }

    const pascal = toPascalCase(trimmed);
    const updatedBindings = componentBindings.map((c) =>
      c.id === compId
        ? { ...c, label: pascal, name: pascal }
        : c,
    );
    const updatedSections = sections.map((sec) =>
      sec.id === section.id
        ? { ...sec, componentBindings: updatedBindings }
        : sec,
    );
    updateSections(updatedSections);
    setEditingCompId(null);
  };

  const handleCancelRename = (compId: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const comp = componentBindings.find((c) => c.id === compId);
    const olderName = comp?.name || comp?.label || "";
    if (!olderName) {
      // New component cancelled without name -> remove it!
      const nextBindings = componentBindings.filter((c) => c.id !== compId);
      const updatedSections = sections.map((sec) =>
        sec.id === section.id
          ? { ...sec, componentBindings: nextBindings }
          : sec,
      );
      updateSections(updatedSections);
    }
    setEditingCompId(null);
  };

  const handleDeleteComponent = (compId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextBindings = componentBindings.filter((c) => c.id !== compId);
    const updatedSections = sections.map((sec) =>
      sec.id === section.id
        ? { ...sec, componentBindings: nextBindings }
        : sec,
    );
    updateSections(updatedSections);
  };

  const handleOpenConfig = (compId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      type: "sectionComponent",
      id: compId,
      nodeId,
      sectionId: section.id,
    });
  };

  const handleTestTrigger = (actionId?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!actionId) return;
    setActiveConfigItem({
      type: "pageEvent",
      id: actionId,
      nodeId,
      sectionId: section.id,
      initialTab: "simulate",
    });
  };

  return (
    <div className="flex flex-col border-t border-border/30 w-full overflow-hidden">
      {/* Subsection Header */}
      <div className="px-2.5 py-1 bg-purple-500/[0.04] border-b border-border/30 flex items-center justify-between text-[9px] select-none">
        <div className="flex items-center gap-1.5 font-semibold text-foreground/80">
          <Layers size={11} className="text-purple-500 shrink-0" />
          <span className="uppercase tracking-wider text-[8px] font-bold text-purple-600 dark:text-purple-400">
            UI Components &amp; Bindings
          </span>
          {Boolean(componentBindings.length) && (
            <span className="text-[8px] font-mono text-muted-foreground">
              ({visibleBindings.length !== componentBindings.length ? `${visibleBindings.length}/${componentBindings.length}` : componentBindings.length})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {componentBindings.length > 2 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchOpen(!searchOpen);
              }}
              className={cn(
                "p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
                searchOpen && "text-purple-600 dark:text-purple-400 bg-purple-500/10",
              )}
              title="Search components"
            >
              <Search size={10} />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGenerateDialogOpen(true);
            }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 text-[8px] font-semibold transition-colors cursor-pointer"
            title="Auto-generate form & state store from endpoint contract"
          >
            <Sparkles size={9} />
          </button>

          <button
            type="button"
            onClick={handleAddComponent}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-[8px] font-semibold transition-colors cursor-pointer"
            title="Add a UI component"
          >
            <Plus size={9} />
          </button>
        </div>
      </div>

      {/* Inline Search Bar on Canvas Node Card */}
      {searchOpen && (
        <div className="px-2 py-1 bg-purple-500/[0.03] border-b border-border/20 flex items-center gap-1">
          <Search size={9} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter components..."
            className="w-full bg-transparent text-[9px] font-mono outline-none text-foreground placeholder:text-muted-foreground/50"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
            >
              <X size={9} />
            </button>
          )}
        </div>
      )}

      {/* Component List */}
      {componentBindings.length === 0 ? (
        <div className="py-2 px-2.5 flex items-center justify-between rounded bg-muted/10 border border-dashed border-border/40 text-[9px] text-muted-foreground/70 mx-2.5 my-1.5">
          <div className="flex items-center gap-1.5">
            <Sparkles size={11} className="text-purple-400 shrink-0" />
            <span>Map components to state &amp; actions.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGenerateDialogOpen(true)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-medium flex items-center gap-0.5"
            >
              <Sparkles size={9} />
              <span>From Endpoint</span>
            </button>
            <span className="text-muted-foreground/30">•</span>
            <button
              type="button"
              onClick={handleAddComponent}
              className="text-purple-600 dark:text-purple-400 hover:underline cursor-pointer font-medium"
            >
              + Add
            </button>
          </div>
        </div>
      ) : visibleBindings.length === 0 ? (
        <div className="py-2 px-2.5 text-center text-[9px] text-muted-foreground bg-muted/10 mx-2.5 my-1 rounded border border-border/20">
          <span>No components match &quot;{searchQuery}&quot;. </span>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="text-purple-600 dark:text-purple-400 hover:underline font-semibold"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/20">
          {visibleBindings.map((comp) => {
            const Icon = COMPONENT_ICON_MAP[comp.componentType] || Layout;
            const boundAction = section.actions.find((a) => a.id === comp.actionId);

            return (
              <div
                key={comp.id}
                onClick={(e) => handleOpenConfig(comp.id, e)}
                className="group flex flex-col gap-1 px-2.5 py-1.5 hover:bg-muted/30 transition-colors cursor-pointer text-[10px] w-full overflow-hidden"
              >
                {/* Top Row: Component Identity (left) & Actions (right) */}
                <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <div className="p-1 rounded bg-purple-500/10 text-purple-500 shrink-0">
                      <Icon size={10} />
                    </div>
                    {editingCompId === comp.id ? (
                      <div
                        className="flex items-center gap-1 flex-1 min-w-0"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={editingText}
                          placeholder="Component name..."
                          onChange={(e) => handleTextChange(e.target.value)}
                          onBlur={() => handleSaveRename(comp.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSaveRename(comp.id);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelRename(comp.id);
                            }
                          }}
                          autoFocus
                          className="h-4 px-1 text-[10px] font-semibold bg-background border border-purple-500 rounded outline-none w-28 text-foreground font-mono"
                        />
                      </div>
                    ) : (
                      <span
                        onDoubleClick={(e) => handleStartRename(comp, e)}
                        title="Double-click to rename"
                        className="font-semibold text-foreground truncate text-[10px] cursor-text hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                      >
                        {comp.label || comp.name || "Untitled"}
                      </span>
                    )}
                    {comp.elements && comp.elements.length > 1 ? (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-3.5 font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 shrink-0 font-semibold"
                      >
                        {comp.elements.length} elements
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="text-[8px] px-1 py-0 h-3.5 uppercase font-mono font-normal text-muted-foreground shrink-0"
                      >
                        {comp.componentType}
                      </Badge>
                    )}
                  </div>

                  {/* Right: Quick Actions - pinned cleanly inside the card */}
                  <div
                    className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleStartRename(comp, e)}
                      title="Rename component"
                      className="p-1 rounded text-muted-foreground hover:text-purple-600 hover:bg-purple-500/10 transition-colors cursor-pointer"
                    >
                      <Pencil size={10} />
                    </button>
                    {comp.actionId && (
                      <button
                        type="button"
                        onClick={(e) => handleTestTrigger(comp.actionId, e)}
                        title="Simulate action flow"
                        className="p-1 rounded text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      >
                        <Play size={10} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleOpenConfig(comp.id, e)}
                      title="Configure component properties"
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
                    >
                      <Settings size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteComponent(comp.id, e)}
                      title="Delete component mapping"
                      className="p-1 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: State & Action Mapping Badges (wrapping cleanly without overflowing) */}
                {(comp.actionId || comp.propMappings?.chatOnFetchActionId || comp.valueStateName || comp.disabledStateName || comp.propMappings?.sidebarNavBinding || comp.propMappings?.topbarNavBinding || comp.propMappings?.sidebarNavMode || comp.propMappings?.topbarNavMode) && (
                  <div className="flex items-center gap-1 text-[8.5px] font-mono flex-wrap pl-4 w-full">
                    {/* Bound History Hydration Action for Chat */}
                    {comp.componentType === "chat" && comp.propMappings?.chatOnFetchActionId && (
                      <span
                        onClick={(e) => handleTestTrigger(comp.propMappings?.chatOnFetchActionId, e)}
                        title={`Mount action: ${comp.propMappings?.chatOnFetchActionName || "fetchHistory"} (Click to test)`}
                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer max-w-[140px] truncate"
                      >
                        <span className="text-[7.5px] text-muted-foreground">mount:</span>
                        <span className="font-semibold truncate">{comp.propMappings?.chatOnFetchActionName || "fetchHistory"}</span>
                      </span>
                    )}

                    {/* Bound Action */}
                    {comp.actionId ? (
                      <span
                        onClick={(e) => handleTestTrigger(comp.actionId, e)}
                        title={`Triggers action: ${comp.actionName || boundAction?.name || "action"} (Click to test)`}
                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-colors cursor-pointer max-w-[150px] truncate"
                      >
                        <span className="text-[7.5px] text-muted-foreground">{comp.componentType === "chat" ? "send:" : (comp.triggerEvent || "click")}</span>
                        {comp.componentType !== "chat" && <ArrowRight size={7} />}
                        <span className="font-semibold truncate">{comp.actionName || boundAction?.name || "action"}</span>
                      </span>
                    ) : null}

                    {/* Bound Nav State for Sidebar / Topbar */}
                    {(comp.componentType === "sidebar" || comp.componentType === "topbar") && (
                      (() => {
                        const isTopbar = comp.componentType === "topbar";
                        const navMode = isTopbar ? (comp.propMappings?.topbarNavMode || "static") : (comp.propMappings?.sidebarNavMode || "dynamic");
                        const navBinding = isTopbar ? comp.propMappings?.topbarNavBinding : comp.propMappings?.sidebarNavBinding;
                        const linksCount = isTopbar ? (comp.propMappings?.topbarStaticItems?.length ?? 4) : (comp.propMappings?.sidebarStaticItems?.length ?? 2);
                        return (
                          <span
                            title={navMode === "dynamic" ? `Dynamic Nav (${navBinding || comp.valueStateName || "navItems"})` : `Static Nav (${linksCount} links)`}
                            className={`inline-flex items-center gap-0.5 px-1 py-0.2 rounded border max-w-[130px] truncate ${
                              navMode === "dynamic"
                                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            <span className="text-[7.5px] text-muted-foreground">nav:</span>
                            <span className="font-semibold truncate">
                              {navMode === "dynamic" ? (navBinding || comp.valueStateName || "dynamic") : `${linksCount} links`}
                            </span>
                          </span>
                        );
                      })()
                    )}

                    {/* Bound State Variable */}
                    {comp.valueStateName && comp.componentType !== "sidebar" && comp.componentType !== "topbar" ? (
                      <span
                        title={`Bound to state: ${comp.valueStateName}`}
                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 max-w-[130px] truncate"
                      >
                        <span className="text-[7.5px] text-muted-foreground">val:</span>
                        <span className="font-semibold truncate">{comp.valueStateName}</span>
                      </span>
                    ) : null}

                    {/* Bound Disabled State */}
                    {comp.disabledStateName ? (
                      <span
                        title={`Disabled when: ${comp.disabledStateName}`}
                        className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 max-w-[130px] truncate"
                      >
                        <span className="text-[7.5px] text-muted-foreground">dis:</span>
                        <span className="font-semibold truncate">{comp.disabledStateName}</span>
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {generateDialogOpen && (
        <GenerateFormFromEndpointDialog
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          nodeId={nodeId}
          sectionId={section.id}
          onSuccess={(compId) => {
            setActiveConfigItem({
              type: "sectionComponent",
              id: compId,
              nodeId,
              sectionId: section.id,
            });
          }}
        />
      )}
    </div>
  );
};

export default SectionComponentBindingsList;
