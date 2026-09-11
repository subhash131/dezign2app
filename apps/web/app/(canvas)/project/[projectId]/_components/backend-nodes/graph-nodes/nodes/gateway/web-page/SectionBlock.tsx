import React, { useState, useEffect } from "react";
import { Position, Handle, useUpdateNodeInternals } from "@xyflow/react";
import { ChevronDown, ChevronRight, Settings, Trash, Plus } from "lucide-react";
import { BackendNode, Endpoint, UIEventItem, PageSection } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId } from "../../../common";
import { Input } from "@workspace/ui/components/input";
import { SectionActionRow } from "./SectionActionRow";

import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { NodeDeletionDialog } from "../../../../../node-deletion-dialog";

export interface SectionBlockProps {
  nodeId: string;
  section: PageSection;
  sections: PageSection[];
  isLastSection?: boolean;
  updateSections: (sections: PageSection[]) => void;
  getLinkedEndpoint: (actionId: string) => { targetNode: BackendNode; endpoint: Endpoint } | null;
  onTriggerEvent: (triggerInfo: { event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
}

export const SectionBlock = ({
  nodeId,
  section,
  sections,
  isLastSection,
  updateSections,
  getLinkedEndpoint,
  onTriggerEvent,
}: SectionBlockProps) => {
  const isCollapsed = useSectionCollapseStore((s) =>
    s.isSectionCollapsed(nodeId, section.id),
  );
  const setSectionCollapsed = useSectionCollapseStore((s) => s.setSectionCollapsed);
  const toggleSectionCollapsed = useSectionCollapseStore(
    (s) => s.toggleSectionCollapsed,
  );
  const deleteSectionCollapseState = useSectionCollapseStore(
    (s) => s.deleteSectionCollapseState,
  );

  const isOpen = !isCollapsed;
  const [isEditingName, setIsEditingName] = useState(false);
  const [sectionName, setSectionName] = useState(section.name);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);

  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (typeof updateNodeInternals === "function") {
      updateNodeInternals(nodeId);
    }
  }, [isOpen, section.actions, nodeId, updateNodeInternals]);

  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const handleSaveName = () => {
    const trimmed = sectionName.trim() || "Section";
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, name: trimmed } : s,
    );
    updateSections(updated);
    setIsEditingName(false);
  };

  const handleToggleRenderMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentMode = section.renderMode || "server";
    const nextMode = currentMode === "server" ? "client" : "server";
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, renderMode: nextMode as "server" | "client" } : s,
    );
    updateSections(updated);
  };

  const handleCycleLoadStrategy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = section.loadStrategy || "eager";
    const cycleMap: Record<string, "eager" | "dynamic" | "dynamic-no-ssr"> = {
      eager: "dynamic",
      dynamic: "dynamic-no-ssr",
      "dynamic-no-ssr": "eager",
    };
    const nextStrategy = cycleMap[current] || "eager";
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, loadStrategy: nextStrategy } : s,
    );
    updateSections(updated);
  };

  const handleDeleteSection = () => {
    deleteSectionCollapseState(nodeId, section.id);
    const store = useBackendCanvasStore.getState();
    section.actions.forEach((act) => {
      const edge = store.edges.find(
        (ed) => ed.source === nodeId && ed.sourceHandle === `events-${act.id}`,
      );
      if (edge) {
        store.deleteEdge(edge.id);
        const targetNode = store.nodes.find((n) => n.id === edge.target);
        if (targetNode && targetNode.type === "page_ref") {
          const remaining = store.edges.filter(
            (ed) => ed.target === targetNode.id && ed.id !== edge.id,
          );
          if (remaining.length === 0) store.deleteNode(targetNode.id);
        }
      }
    });

    const updated = sections.filter((s) => s.id !== section.id);
    updateSections(updated);
  };

  const handleAddAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = generateId();
    const newAction: UIEventItem = {
      id: newId,
      name: "",
      event: "click",
    };
    const updated = sections.map((s) =>
      s.id === section.id ? { ...s, actions: [...s.actions, newAction] } : s,
    );
    updateSections(updated);
    setSectionCollapsed(nodeId, section.id, false);
    setEditingActionId(newId);
  };

  const renderMode = section.renderMode || "server";
  const loadStrategy = section.loadStrategy || "eager";

  return (
    <div
      className={cn(
        "flex flex-col border-b last:border-b-0 bg-card/60",
        isLastSection && "rounded-b-[10px]",
      )}
    >
      {/* Section Header */}
      <div
        className={cn(
          "px-2.5 py-1.5 bg-secondary/30 hover:bg-secondary/50 flex items-center justify-between gap-1.5 cursor-pointer nodrag select-none transition-colors group/sec relative",
          isLastSection && !isOpen && "rounded-b-[10px]",
        )}
        onClick={() => toggleSectionCollapsed(nodeId, section.id)}
      >
        {/* Collapsed Handles: keep edges anchored to the section header when collapsed */}
        {!isOpen && (
          <>
            {section.actions.map((act) => {
              const evtStr = (act.event as string) || "";
              const evtLower = evtStr.toLowerCase();
              const isPageLoad = evtStr === "pageLoad";
              const isSse =
                evtStr === "sse" || evtStr === "sseMessage" || evtLower === "sse";
              const isWebsocket =
                evtStr === "websocket" ||
                evtStr === "ws" ||
                evtStr === "websocketMessage" ||
                evtLower === "websocket" ||
                evtLower === "ws";
              const isWebrtc = evtStr === "webrtc" || evtLower === "webrtc";

              return (
                <React.Fragment key={act.id}>
                  {/* Right outgoing event handle */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`events-${act.id}`}
                    className="w-2 h-2 -right-1"
                    style={{ top: "50%" }}
                  />

                  {/* Protocol / Inbound Left handles */}
                  {isPageLoad && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`pageload-in-${act.id}`}
                      className="w-2 h-2 -left-1 !bg-emerald-500"
                      style={{ top: "50%" }}
                    />
                  )}
                  {isSse && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`sse-in-${act.id}`}
                      className="w-2 h-2 -left-1 !bg-amber-500"
                      style={{ top: "50%" }}
                    />
                  )}
                  {isWebsocket && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`websocket-in-${act.id}`}
                      className="w-2 h-2 -left-1 !bg-cyan-500"
                      style={{ top: "50%" }}
                    />
                  )}
                  {isWebrtc && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`webrtc-in-${act.id}`}
                      className="w-2 h-2 -left-1 !bg-purple-500"
                      style={{ top: "50%" }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}

        <div className="flex items-center gap-1 min-w-0 flex-1">
          <button
            type="button"
            className="p-0.5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              toggleSectionCollapsed(nodeId, section.id);
            }}
          >
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>

          {isEditingName ? (
            <Input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              className="h-5 text-xs px-1 py-0 bg-background"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") setIsEditingName(false);
              }}
              onBlur={handleSaveName}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-[11px] font-semibold text-foreground truncate hover:text-indigo-400 cursor-pointer"
              title="Click to expand/collapse, double-click to rename"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
            >
              {section.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Render Mode Badge: Server / Client */}
          <button
            type="button"
            onClick={handleToggleRenderMode}
            className={cn(
              "text-[8px] font-mono px-1 py-0.2 rounded border transition-colors cursor-pointer",
              renderMode === "server"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
            )}
            title={`Render Mode: ${renderMode} (Click to toggle)`}
          >
            {renderMode}
          </button>

          {/* Load Strategy Badge: eager / dynamic / no-ssr */}
          <button
            type="button"
            onClick={handleCycleLoadStrategy}
            className={cn(
              "text-[8px] font-mono px-1 py-0.2 rounded border transition-colors cursor-pointer",
              loadStrategy === "eager"
                ? "bg-secondary text-muted-foreground border-border/50"
                : loadStrategy === "dynamic"
                  ? "bg-blue-500/10 text-blue-500 border-blue-500/30"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/30",
            )}
            title={`Load Strategy: ${loadStrategy} (Click to cycle eager/dynamic/no-ssr)`}
          >
            {loadStrategy === "dynamic-no-ssr" ? "no-ssr" : loadStrategy}
          </button>

          {/* Add Action to section */}
          <button
            type="button"
            onClick={handleAddAction}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            title="Add action"
          >
            <Plus size={11} />
          </button>

          {/* Section Settings Gear */}
          <button
            type="button"
            onClick={() =>
              setActiveConfigItem({
                type: "pageSection",
                id: section.id,
                nodeId,
              })
            }
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            title="Configure section"
          >
            <Settings size={11} />
          </button>

          {/* Delete Section */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            className="p-1 rounded text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            title="Delete section"
          >
            <Trash size={11} />
          </button>
        </div>
      </div>

      {/* Section Actions Body */}
      {isOpen && (
        <div
          className={cn(
            "flex flex-col bg-background/40",
            isLastSection && "rounded-b-[10px]",
          )}
        >
          {section.actions.map((act) => (
            <SectionActionRow
              key={act.id}
              nodeId={nodeId}
              sectionId={section.id}
              action={act}
              sections={sections}
              updateSections={updateSections}
              getLinkedEndpoint={getLinkedEndpoint}
              onTriggerEvent={onTriggerEvent}
              isEditing={editingActionId === act.id}
              onStartEdit={() => setEditingActionId(act.id)}
              onFinishEdit={() => {
                if (editingActionId === act.id) {
                  setEditingActionId(null);
                }
              }}
            />
          ))}

          {/* Add Action inside section */}
          <button
            type="button"
            onClick={handleAddAction}
            className={cn(
              "flex items-center justify-center gap-1 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors cursor-pointer nodrag",
              section.actions.length === 0
                ? "border-t border-dashed border-border/40"
                : "border-t-0",
              isLastSection && "rounded-b-[10px]",
            )}
          >
            <Plus size={10} /> Add action
          </button>
        </div>
      )}

      {/* Detailed Section Deletion Dialog */}
      <NodeDeletionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        deletionTarget={{
          type: "section",
          nodeId,
          section,
          onConfirm: handleDeleteSection,
        }}
      />
    </div>
  );
};
