"use client";

import React, { useState, useMemo } from "react";
import { TabsContent } from "@workspace/ui/components/tabs";
import { Database, Plus } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";
import { StateStoreConfig } from "../../StateStoreConfig";
import { StateStoreCombobox } from "../../StateStoreCombobox";

interface WebPageStateTabProps {
  nodeId: string;
  data: any;
  initialSelectedStoreId?: string;
}

export function WebPageStateTab({
  nodeId,
  data,
  initialSelectedStoreId,
}: WebPageStateTabProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addNode = useBackendCanvasStore((s) => s.addNode);

  const allStateStores = useMemo(
    () => nodes.filter((n) => n.type === "state_store"),
    [nodes],
  );

  // Identify stores connected or referenced in this page
  const pageConnectedStoreIds = useMemo(() => {
    const ids = new Set<string>();

    // 1. Edges between this page and a state_store
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

    // 2. Target page ID explicitly referencing this page
    nodes.forEach((n) => {
      if (n.type === "state_store" && n.data?.targetPageId === nodeId) {
        ids.add(n.id);
      }
    });

    // 3. Section state objects
    (data?.sections || []).forEach((sec: any) => {
      (sec.stateObjects || []).forEach((st: any) => {
        if (st.storeId) ids.add(st.storeId);
      });
      (sec.actions || []).forEach((act: any) => {
        if (act.storeActionBinding?.storeNodeId) {
          ids.add(act.storeActionBinding.storeNodeId);
        }
        if (Array.isArray(act.storeActionBindings)) {
          act.storeActionBindings.forEach((b: any) => {
            if (b?.storeNodeId) ids.add(b.storeNodeId);
          });
        }
      });
    });

    // 4. Page-level state objects
    (data?.stateObjects || []).forEach((st: any) => {
      if (st.storeId) ids.add(st.storeId);
    });

    return ids;
  }, [edges, nodes, nodeId, data]);

  // Sort stores: stores associated with this page first, then others
  const sortedStores = useMemo(() => {
    return [...allStateStores].sort((a, b) => {
      const aInPage = pageConnectedStoreIds.has(a.id);
      const bInPage = pageConnectedStoreIds.has(b.id);
      if (aInPage && !bInPage) return -1;
      if (!aInPage && bInPage) return 1;
      const aName = a.data?.label || a.data?.storeName || "";
      const bName = b.data?.label || b.data?.storeName || "";
      return aName.localeCompare(bName);
    });
  }, [allStateStores, pageConnectedStoreIds]);

  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    initialSelectedStoreId || sortedStores[0]?.id || "",
  );

  // Sync selectedStoreId if store list changes or initial id is provided
  React.useEffect(() => {
    if (initialSelectedStoreId && sortedStores.some((s) => s.id === initialSelectedStoreId)) {
      setSelectedStoreId(initialSelectedStoreId);
    } else if (!sortedStores.some((s) => s.id === selectedStoreId) && sortedStores.length > 0) {
      setSelectedStoreId(sortedStores[0]!.id);
    }
  }, [initialSelectedStoreId, sortedStores, selectedStoreId]);

  const activeStore = sortedStores.find((s) => s.id === selectedStoreId) || sortedStores[0];

  const handleCreateStore = () => {
    const rawName = (data?.label || "App").replace(/[^a-zA-Z0-9]/g, "");
    const base = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1) : "App";
    let storeName = `${base}Store`;
    let count = 1;
    while (nodes.some((n) => (n.data?.storeName || n.data?.label || "").toLowerCase() === storeName.toLowerCase())) {
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
        description: `Zustand state store for ${data?.label || "Page"}`,
        scope: "global",
        storage: "memory",
        targetPageId: nodeId,
        fields: [
          { id: `f-${Date.now()}-1`, name: "isLoading", type: "boolean", defaultValue: false },
          { id: `f-${Date.now()}-2`, name: "data", type: "object", defaultValue: {} },
        ],
        actions: [
          { id: `act-${Date.now()}-1`, name: "load", actionType: "populate" },
          { id: `act-${Date.now()}-2`, name: "reset", actionType: "reset" },
        ],
      },
    };

    addNode(newStoreNode);
    setSelectedStoreId(newStoreId);
  };

  return (
    <TabsContent
      value="state"
      className="flex-1 py-4 space-y-4 overflow-y-auto m-0 outline-none select-none"
    >
      {/* Top Store Switcher & Creation Bar */}
      {sortedStores.length > 0 ? (
        <div className="flex flex-col gap-2.5 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Database size={13} className="text-cyan-500" />
              <span className="text-xs font-semibold text-foreground">
                Zustand State Stores
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                ({sortedStores.length})
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCreateStore}
              className="h-7 text-xs px-2.5 gap-1 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10 cursor-pointer"
            >
              <Plus size={12} />
              <span>New Store</span>
            </Button>
          </div>

          <StateStoreCombobox
            stores={sortedStores}
            selectedStoreId={selectedStoreId}
            onSelectStore={(storeId) => setSelectedStoreId(storeId)}
            onCreateStore={handleCreateStore}
            pageConnectedStoreIds={pageConnectedStoreIds}
          />
        </div>
      ) : null}

      {/* Selected Store Content or Empty State */}
      {activeStore ? (
        <div className="w-full">
          <StateStoreConfig
            id={activeStore.id}
            nodeId={activeStore.id}
            className="p-0 border-0 overflow-visible"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-dashed border-border/70 text-center gap-3 bg-muted/10">
          <div className="p-3 rounded-full bg-cyan-500/15 text-cyan-500 border border-cyan-500/25">
            <Database size={24} />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <h4 className="text-sm font-semibold text-foreground">
              No State Stores Defined
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a Zustand state store to hold reactive state variables and manipulators (populate, mutate, reset) for this page.
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
    </TabsContent>
  );
}
