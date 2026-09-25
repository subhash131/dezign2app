"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";
import {
  PackageNodeTopBanner,
  EntityDerivedTypeBanner,
  TypeNavigatorBar,
  TypeEditorForm,
} from "./types-config";
import type { TypesConfigProps } from "./types-config";
import type { CustomTypeItem } from "@workspace/canvas/types";

export type { TypesConfigProps };

export const TypesConfig: React.FC<TypesConfigProps> = ({
  id,
  nodeId,
  selectedTypeId,
}) => {
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === (nodeId || id)),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const [activeTypeId, setActiveTypeId] = useState<string | undefined>(
    selectedTypeId,
  );

  const data = node?.data;
  const isPackageNode = Boolean(data?.isPackageNode);
  const packageName = data?.packageName || "";
  const packageVersion = data?.packageVersion;
  const isInstalled = data?.isInstalled !== false;
  const installError = data?.installError;

  const edges = useBackendCanvasStore((s) => s.edges);
  const isEntityDerived = Boolean(
    data?.sourceEntityId ||
      data?.types?.some((t) => t.id.startsWith("type-entity-")),
  );
  const sourceEntityId =
    data?.sourceEntityId ||
    data?.types?.find((t) => t.id.startsWith("type-entity-"))?.id.replace("type-entity-", "");

  const affectedDownstreamCount = useMemo(() => {
    const targetId = nodeId || id;
    if (!targetId) return 0;
    return edges.filter((e) => e.source === targetId && e.target !== targetId).length;
  }, [edges, nodeId, id]);

  const sourceEntityName =
    data?.sourceEntityName ||
    allNodes.find((n) => n.id === sourceEntityId)?.data?.label ||
    "Entity";

  const types: CustomTypeItem[] = useMemo(
    () => (data && Array.isArray(data.types) ? data.types : []),
    [data],
  );

  // Sync active type with selectedTypeId prop, or default to first type
  useEffect(() => {
    if (selectedTypeId) {
      setActiveTypeId(selectedTypeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTypeId]);

  // Seed to first type on initial mount or when all types are replaced
  useEffect(() => {
    setActiveTypeId((prev) => {
      if (prev && types.some((t) => t.id === prev)) return prev;
      return types[0]?.id;
    });
  }, [types]);

  const currentType = useMemo(() => {
    return types.find((t) => t.id === activeTypeId) || types[0];
  }, [types, activeTypeId]);

  // Exclude only the currently edited type itself (so Type 2 sees Type 3, and Type 3 sees Type 2!)
  const otherCustomTypes = useMemo(() => {
    const list: string[] = [];
    allNodes.forEach((tn) => {
      if (tn.type === "types") {
        const typeList = tn.data?.types || [];
        typeList.forEach((item) => {
          if (
            item.name &&
            item.name.trim().length > 0 &&
            item.id !== currentType?.id &&
            item.name.trim() !== currentType?.name?.trim()
          ) {
            list.push(item.name.trim());
          }
        });
      }
    });
    return Array.from(new Set(list));
  }, [allNodes, currentType?.id, currentType?.name]);

  // For extended types: find the base type's enum values so we can distinguish inherited vs user-added badges
  const inheritedEnumValues = useMemo(() => {
    if (!currentType?.extendedFromTypeId && !currentType?.extendedFrom) return [];
    for (const n of allNodes) {
      if (n.type !== "types") continue;
      const baseType = (n.data?.types || []).find(
        (t: CustomTypeItem) =>
          t.id === currentType.extendedFromTypeId || t.name === currentType.extendedFrom,
      );
      if (baseType?.enumValues) return baseType.enumValues as string[];
    }
    return [];
  }, [allNodes, currentType?.extendedFromTypeId, currentType?.extendedFrom]);

  const updateTypesList = useCallback(
    (updated: CustomTypeItem[]) => {
      if (!node || !data) return;
      updateNode(node.id, {
        data: {
          ...data,
          types: updated,
        },
      });
    },
    [node, data, updateNode],
  );

  const handleUpdateCurrentType = useCallback(
    (updates: Partial<CustomTypeItem>) => {
      if (!currentType) return;
      const updated = types.map((t) =>
        t.id === currentType.id ? { ...t, ...updates } : t,
      );
      updateTypesList(updated);
    },
    [currentType, types, updateTypesList],
  );

  const handleAddType = useCallback(() => {
    const newId = `type-${Date.now()}`;
    const newType: CustomTypeItem = {
      id: newId,
      name: `Type${types.length + 1}`,
      kind: "interface",
      description: "",
      fields: [
        { id: `f-${Date.now()}-1`, name: "id", type: "string", required: true, isArray: false },
        { id: `f-${Date.now()}-2`, name: "name", type: "string", required: true, isArray: false },
      ],
    };
    updateTypesList([...types, newType]);
    setActiveTypeId(newId);
  }, [types, updateTypesList]);

  const handleDeleteCurrentType = useCallback(() => {
    if (!currentType) return;
    const remaining = types.filter((t) => t.id !== currentType.id);
    updateTypesList(remaining);
    setActiveTypeId(remaining[0]?.id);
  }, [currentType, types, updateTypesList]);

  if (!node || !data) return null;

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      {/* Package Header Banner if this is a Package Types Node */}
      {isPackageNode && (
        <PackageNodeTopBanner
          nodeId={nodeId || id}
          packageName={packageName}
          packageVersion={packageVersion}
          isInstalled={isInstalled}
          installError={installError}
        />
      )}

      {/* Entity Derived Banner if this is an Entity-derived Types Node */}
      {isEntityDerived && sourceEntityId && (
        <EntityDerivedTypeBanner
          nodeId={nodeId || id}
          sourceEntityId={sourceEntityId}
          sourceEntityName={sourceEntityName}
          affectedNodesCount={affectedDownstreamCount}
        />
      )}

      {/* Type Navigator Bar if multiple types exist */}
      <TypeNavigatorBar
        types={types}
        currentTypeId={currentType?.id}
        isPackageNode={isPackageNode}
        onSelectType={(val) => setActiveTypeId(val)}
        onAddType={handleAddType}
      />

      {currentType ? (
        <TypeEditorForm
          key={currentType.id}
          nodeId={nodeId || id}
          currentType={currentType}
          otherCustomTypes={otherCustomTypes}
          inheritedEnumValues={inheritedEnumValues}
          onUpdateCurrentType={handleUpdateCurrentType}
          onDeleteCurrentType={handleDeleteCurrentType}
        />
      ) : (
        <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed text-center gap-3">
          <p className="text-sm text-muted-foreground">
            {isPackageNode
              ? "No type definitions cataloged for this package yet."
              : "No types defined on this node yet."}
          </p>
          {!isPackageNode && (
            <Button size="sm" onClick={handleAddType} className="text-xs cursor-pointer">
              <Plus size={14} className="mr-1" /> Add Type
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
