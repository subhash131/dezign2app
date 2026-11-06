"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { NodeProps, Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import type { CustomTypeItem } from "@workspace/canvas/types";
import {
  createExtendedTypeNode,
  refreshPackageTypesFromNodeModules,
} from "@/lib/stores/backendCanvas/packageTypesSync";
import { getProjectWorkspaceDir } from "../../../../terminal/hooks/projectWorkspaceUtils";
import { getActiveProjectOutputDir } from "@/lib/utils/localEnvSync";
import {
  TypesNodeHeader,
  TypesNodeInstallBanner,
  TypesNodeEntityWarningBanner,
  TypesNodeList,
} from "./types-node";

export const TypesNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const edges = useBackendCanvasStore((s) => s.edges);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const updateNodeInternals = useUpdateNodeInternals();

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [isEditing, setIsEditing] = useState(!data.label || data.label.trim() === "");
  const [name, setName] = useState(data.label || "");
  const inputRef = useRef<HTMLInputElement>(null);

  const rawTypesList: CustomTypeItem[] = data.types || [];
  const [isRefreshing, setIsRefreshing] = useState(false);

  const COLLAPSED_THRESHOLD = 6;
  const [isListCollapsed, setIsListCollapsed] = useState(true);

  // Extended/connected = has an active outgoing edge OR extends another type.
  // Pinned above scroll so xyflow can reliably position handles.
  const { connectedTypes, restTypes, totalCount } = useMemo(() => {
    const connected: CustomTypeItem[] = [];
    const rest: CustomTypeItem[] = [];
    for (const t of rawTypesList) {
      const hasOutgoing = edges.some(
        (e) => e.source === id && e.sourceHandle === `type-out-${t.id}`,
      );
      if (t.extendedFrom || hasOutgoing) {
        connected.push(t);
      } else {
        rest.push(t);
      }
    }
    return { connectedTypes: connected, restTypes: rest, totalCount: rawTypesList.length };
  }, [rawTypesList, edges, id]);

  const shouldCollapse = restTypes.length > COLLAPSED_THRESHOLD;

  const routeParams = useParams();
  const routeProjectId = (routeParams?.projectId as string) || "";

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const pkg = data.packageName || data.label;
    if (!pkg) return;
    setIsRefreshing(true);
    try {
      const outputDir =
        (routeProjectId ? getProjectWorkspaceDir(routeProjectId) : "") ||
        getActiveProjectOutputDir(routeProjectId);
      await refreshPackageTypesFromNodeModules(id, pkg, outputDir, routeProjectId);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Re-calculate XYFlow handle bounds whenever the types list changes
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rawTypesList, updateNodeInternals]);

  useEffect(() => {
    setName(data.label || "");
    if (!data.label || !data.label.trim()) {
      setIsEditing(true);
    }
  }, [data.label]);

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
      if (!data.label || !data.label.trim()) {
        deleteNode(id);
        return;
      }
      setName(data.label || "");
      setIsEditing(false);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
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
      type: "types",
      selectedTypeId: (connectedTypes[0] ?? restTypes[0])?.id,
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const handleAddType = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newTypeId = `type-${Date.now()}`;
    const newType: CustomTypeItem = {
      id: newTypeId,
      name: `Type${rawTypesList.length + 1}`,
      kind: "interface",
      description: "",
      fields: [
        { id: `f-${Date.now()}-1`, name: "id", type: "string", required: true, isArray: false },
        { id: `f-${Date.now()}-2`, name: "name", type: "string", required: true, isArray: false },
      ],
    };
    const updated = [newType, ...rawTypesList];
    updateNode(id, {
      data: {
        ...data,
        types: updated,
      },
    });
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "types",
      selectedTypeId: newTypeId,
    });
  };

  const handleOpenConfigForType = (typeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "types",
      selectedTypeId: typeId,
    });
  };

  const handleDeleteType = (typeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = rawTypesList.filter((t) => t.id !== typeId);
    if (updated.length === 0 && Boolean(data.isExtended)) {
      deleteNode(id);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        types: updated,
      },
    });
    const connectedEdges = edges.filter(
      (edge) =>
        (edge.source === id && edge.sourceHandle === `type-out-${typeId}`) ||
        (edge.target === id && edge.targetHandle === `type-in-${typeId}`),
    );
    connectedEdges.forEach((edge) => deleteEdge(edge.id));
  };

  const hasIncomingEdge = (typeId: string) =>
    edges.some((e) => e.target === id && e.targetHandle === `type-in-${typeId}`);
  const hasOutgoingEdge = (typeId: string) =>
    edges.some((e) => e.source === id && e.sourceHandle === `type-out-${typeId}`);

  const isPackageNode = Boolean(
    data.isPackageNode ||
      (data.packageSources && data.packageSources.length > 0 && !data.isExtended),
  );
  const isInstalled = data.isInstalled !== false;
  const hasInstallError = isPackageNode && (!isInstalled || Boolean(data.installError));

  const allNodes = useBackendCanvasStore((s) => s.nodes);

  // Check if this TypesNode is derived from EntityNode(s)
  const isConsolidated =
    data.isEntitySchemas ||
    id === "types-entity-schemas" ||
    data.label === "Entity Types";

  const isEntityDerived = Boolean(
    isConsolidated ||
      data.sourceEntityId ||
      data.types?.some((t) => t.id.startsWith("type-entity-")),
  );

  const isServiceDerived = Boolean(
    data.isServiceEndpointSchemas ||
      Boolean(data.sourceServiceId) ||
      id.startsWith("types-service-"),
  );

  const sourceServiceId =
    data.sourceServiceId ||
    (id.startsWith("types-service-") ? id.replace("types-service-", "") : undefined);

  const sourceServiceNode = useMemo(() => {
    if (!sourceServiceId) return undefined;
    return allNodes.find((n) => n.id === sourceServiceId && n.type === "service");
  }, [allNodes, sourceServiceId]);

  const sourceServiceName =
    data.sourceServiceName ||
    sourceServiceNode?.data?.label ||
    (data.label && data.label.toLowerCase().endsWith(" types")
      ? data.label.replace(/\s+types$/i, "").trim()
      : undefined) ||
    "Service";

  const sourceEntityId = isConsolidated
    ? undefined
    : data.sourceEntityId ||
      data.types?.find((t) => t.id.startsWith("type-entity-"))?.id.replace("type-entity-", "");

  const sourceEntityNode = useMemo(() => {
    if (!sourceEntityId) return undefined;
    return allNodes.find((n) => n.id === sourceEntityId && n.type === "entity");
  }, [allNodes, sourceEntityId]);

  const sourceEntityName = isConsolidated
    ? `All Entities (${rawTypesList.length})`
    : data.sourceEntityName ||
      sourceEntityNode?.data?.tableName ||
      sourceEntityNode?.data?.label ||
      "Entity";

  // Calculate downstream affected nodes (direct outgoing edges from this node)
  const downstreamAffectedNodes = useMemo(() => {
    if (!isEntityDerived) return [];
    const directOutgoingEdges = edges.filter(
      (e) => e.source === id && e.target !== id,
    );
    const targetIds = new Set(directOutgoingEdges.map((e) => e.target));
    return allNodes
      .filter((n) => targetIds.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.data?.label || n.id,
        type: n.type,
      }));
  }, [edges, id, allNodes, isEntityDerived]);

  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  const handleViewEntity = () => {
    if (sourceEntityId) {
      setActiveConfigItem({
        id: sourceEntityId,
        nodeId: sourceEntityId,
        type: "entityFunctions",
      });
    }
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[260px] max-w-[350px] shadow-md transition-all duration-150 cursor-pointer select-none",
        hasInstallError
          ? "border-red-500 shadow-red-500/20 ring-1 ring-red-500/50"
          : selected
            ? "border-indigo-500 shadow-indigo-500/20 ring-1 ring-indigo-500/30"
            : isPackageNode
              ? "border-emerald-500/50 hover:border-emerald-400 hover:shadow-lg"
              : isServiceDerived
                ? "border-sky-500/50 hover:border-sky-400 hover:shadow-lg"
                : "border-border/80 hover:border-indigo-500/50 hover:shadow-lg",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Handles for connections and extensions */}
      <Handle
        type="target"
        position={Position.Left}
        id="types-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!border-2 !border-background hover:scale-125 transition-all",
          hasInstallError
            ? "!bg-red-500"
            : isPackageNode
              ? "!bg-emerald-400"
              : isServiceDerived
                ? "!bg-sky-400"
                : "!bg-indigo-400",
        )}
        style={{ top: "24px", transform: "translateY(-50%)" }}
        title="Incoming Type Reference"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="types-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!border-2 !border-background hover:scale-125 transition-all",
          hasInstallError
            ? "!bg-red-500"
            : isPackageNode
              ? "!bg-emerald-400"
              : isServiceDerived
                ? "!bg-sky-400"
                : "!bg-indigo-400",
        )}
        style={{ top: "24px", transform: "translateY(-50%)" }}
        title="Outgoing Type Reference"
      />

      {/* Header: Icon, Tags, Label input/view, Node actions */}
      <TypesNodeHeader
        id={id}
        data={data}
        name={name}
        setName={setName}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        isPackageNode={isPackageNode}
        isServiceDerived={isServiceDerived}
        sourceServiceName={sourceServiceName}
        hasInstallError={hasInstallError}
        isRefreshing={isRefreshing}
        totalCount={totalCount}
        inputRef={inputRef}
        onSave={handleSave}
        onDeleteNode={() => deleteNode(id)}
        onRefresh={handleRefresh}
        onAddType={handleAddType}
        onOpenConfig={handleOpenConfig}
        onDelete={handleDelete}
      />

      {/* Missing node_modules Alert Banner */}
      {hasInstallError && (
        <TypesNodeInstallBanner
          packageName={data.packageName}
          installError={data.installError}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
        />
      )}

      {/* Entity-derived Schema Warning Banner */}
      {isEntityDerived && !isBannerDismissed && (
        <TypesNodeEntityWarningBanner
          sourceEntityName={sourceEntityName}
          sourceEntityId={sourceEntityId}
          affectedNodes={downstreamAffectedNodes}
          updatedAt={data.entityUpdatedAt}
          onViewEntity={sourceEntityId ? handleViewEntity : undefined}
          onDismiss={() => setIsBannerDismissed(true)}
        />
      )}

      {/* Types list (Pinned extended types + Collapsible rest) */}
      <TypesNodeList
        nodeId={id}
        isPackageNode={isPackageNode}
        serviceName={isServiceDerived ? sourceServiceName : undefined}
        connectedTypes={connectedTypes}
        restTypes={restTypes}
        totalCount={totalCount}
        shouldCollapse={shouldCollapse}
        isListCollapsed={isListCollapsed}
        setIsListCollapsed={setIsListCollapsed}
        hasIncomingEdge={hasIncomingEdge}
        hasOutgoingEdge={hasOutgoingEdge}
        onOpenConfigForType={handleOpenConfigForType}
        onExtendType={(typeId) => createExtendedTypeNode(id, typeId)}
        onDeleteType={handleDeleteType}
        onAddType={handleAddType}
      />
    </div>
  );
};


/**
 * Standard Navigation item type definition used for sidebar and navigation components.
 */
export const NAV_ITEM_CUSTOM_TYPE: CustomTypeItem = {
  id: "type-nav-item",
  name: "NavItem",
  kind: "interface",
  description: "Navigation item definition for sidebar and menus",
  fields: [
    { id: "f-nav-id", name: "id", type: "string", required: true, isArray: false, description: "Unique item key" },
    { id: "f-nav-name", name: "name", type: "string", required: true, isArray: false, description: "Menu label" },
    { id: "f-nav-link", name: "link", type: "string", required: true, isArray: false, description: "Route URL path" },
    { id: "f-nav-icon", name: "icon", type: "string", required: false, isArray: false, description: "Lucide icon name" },
  ],
};

/**
 * Standard ChatMessage item type definition used for AI chat threads and messages.
 */
export const CHAT_MESSAGE_CUSTOM_TYPE: CustomTypeItem = {
  id: "type-chat-message",
  name: "ChatMessage",
  kind: "interface",
  description: "Chat message item definition for AI conversation threads",
  fields: [
    { id: "f-chat-id", name: "id", type: "string", required: true, isArray: false, description: "Unique message identifier" },
    {
      id: "f-chat-role",
      name: "role",
      type: "enum",
      enumValues: ["user", "assistant", "system"],
      required: true,
      isArray: false,
      description: "Role: 'user' | 'assistant' | 'system'",
    },
    { id: "f-chat-content", name: "content", type: "string", required: true, isArray: false, description: "Message textual or markdown content" },
    { id: "f-chat-created-at", name: "createdAt", type: "string", required: false, isArray: false, description: "Timestamp when message was created" },
  ],
};


/**
 * Identifies if a TypesNode is reserved for specialized auto-synced schemas:
 * - Entity Types (generated from Database tables)
 * - Service Endpoint Types (generated from Backend endpoints)
 * - Package Types (generated from npm node_modules)
 *
 * General / UI / Application types (like NavItem) must NEVER be added to specialized nodes.
 */
export function isSpecializedTypesNode(node: BackendNode): boolean {
  if (node.type !== "types") return true;
  const d = node.data;
  if (!d) return false;

  // 1. Entity Types
  if (
    node.id === "types-entity-schemas" ||
    node.id.startsWith("types-entity-") ||
    Boolean(d.isEntitySchemas) ||
    d.label === "Entity Types" ||
    Boolean(d.sourceEntityId) ||
    Boolean(d.sourceEntityName) ||
    (Array.isArray(d.types) && d.types.some((t: CustomTypeItem) => t.id?.startsWith("type-entity-")))
  ) {
    return true;
  }

  // 2. Service Endpoint Types
  if (
    node.id.startsWith("types-service-") ||
    Boolean(d.isServiceEndpointSchemas) ||
    Boolean(d.sourceServiceId) ||
    Boolean(d.sourceServiceName) ||
    (Array.isArray(d.types) && d.types.some((t: CustomTypeItem) => t.id?.startsWith("type-endpoint-")))
  ) {
    return true;
  }

  // 3. Package Types
  if (
    Boolean(d.isPackageNode) ||
    Boolean(d.packageName) ||
    (Array.isArray(d.packageSources) && d.packageSources.length > 0 && !d.isExtended)
  ) {
    return true;
  }

  return false;
}

/**
 * Ensures a dedicated general TypesNode (e.g. "App Types") exists on the canvas containing the NavItem interface.
 * Strictly avoids entity schemas, service endpoint types, or package types.
 * Automatically purges NavItem from Entity Types or any specialized nodes if it was erroneously placed there.
 * Returns the TypesNode ID and the CustomTypeItem.
 */
export function ensureNavItemTypeOnCanvas(
  referencePosition?: { x: number; y: number },
): { typesNodeId: string; typeItem: CustomTypeItem } {
  const store = useBackendCanvasStore.getState();
  const currentNodes = store.nodes;

  // 1. Purge NavItem from any specialized types nodes (e.g. Entity Types) if present
  currentNodes.forEach((n) => {
    if (n.type === "types" && isSpecializedTypesNode(n)) {
      const typesList = n.data?.types || [];
      const hasBogusNavItem = typesList.some(
        (t: CustomTypeItem) => t.name === "NavItem" || t.id === "type-nav-item",
      );
      if (hasBogusNavItem) {
        const cleanedTypes = typesList.filter(
          (t: CustomTypeItem) => t.name !== "NavItem" && t.id !== "type-nav-item",
        );
        store.updateNode(n.id, {
          data: {
            ...n.data,
            types: cleanedTypes,
          },
        });
        // Disconnect any edge between this specialized types node and stores for NavItem
        const edgesToRemove = store.edges.filter(
          (e) =>
            e.source === n.id &&
            (e.sourceHandle === "type-out-type-nav-item" ||
              e.data?.label === "NavItem" ||
              e.data?.baseTypeName === "NavItem"),
        );
        edgesToRemove.forEach((e) => store.deleteEdge(e.id));
      }
    }
  });

  // 2. Find an existing general (non-specialized) TypesNode (such as "App Types")
  const existingGeneralTypesNode = currentNodes.find(
    (n) => n.type === "types" && !isSpecializedTypesNode(n),
  );

  if (existingGeneralTypesNode) {
    const currentTypes: CustomTypeItem[] = existingGeneralTypesNode.data?.types || [];
    const existingNavItem = currentTypes.find((t) => t.name === "NavItem");
    if (existingNavItem) {
      return { typesNodeId: existingGeneralTypesNode.id, typeItem: existingNavItem };
    }
    const updatedTypes = [...currentTypes, NAV_ITEM_CUSTOM_TYPE];
    store.updateNode(existingGeneralTypesNode.id, {
      data: {
        ...existingGeneralTypesNode.data,
        types: updatedTypes,
      },
    });
    return { typesNodeId: existingGeneralTypesNode.id, typeItem: NAV_ITEM_CUSTOM_TYPE };
  }

  // 3. Otherwise, create a brand-new dedicated "App Types" node (completely separate from Entity Types)
  const newTypesNodeId = `types-app-${Date.now()}`;
  const pos = referencePosition || { x: 480, y: 100 };
  const newTypesNode: Omit<BackendNode, "fractionalIndex"> = {
    id: newTypesNodeId,
    type: "types",
    position: { x: pos.x, y: pos.y },
    selected: false,
    data: {
      label: "App Types",
      scope: "global",
      types: [NAV_ITEM_CUSTOM_TYPE],
    },
  };
  store.addNode(newTypesNode);
  return { typesNodeId: newTypesNodeId, typeItem: NAV_ITEM_CUSTOM_TYPE };
}


/**
 * Ensures a dedicated general TypesNode (e.g. "App Types") exists on the canvas containing the ChatMessage interface.
 * Strictly avoids entity schemas, service endpoint types, or package types.
 * Automatically purges ChatMessage from Entity Types or any specialized nodes if it was erroneously placed there.
 * Returns the TypesNode ID and the CustomTypeItem.
 */
export function ensureChatMessageTypeOnCanvas(
  referencePosition?: { x: number; y: number },
): { typesNodeId: string; typeItem: CustomTypeItem } {
  const store = useBackendCanvasStore.getState();
  const currentNodes = store.nodes;

  // 1. Purge ChatMessage from any specialized types nodes (e.g. Entity Types) if present
  currentNodes.forEach((n) => {
    if (n.type === "types" && isSpecializedTypesNode(n)) {
      const typesList = n.data?.types || [];
      const hasBogusChatMessage = typesList.some(
        (t: CustomTypeItem) => t.name === "ChatMessage" || t.id === "type-chat-message",
      );
      if (hasBogusChatMessage) {
        const cleanedTypes = typesList.filter(
          (t: CustomTypeItem) => t.name !== "ChatMessage" && t.id !== "type-chat-message",
        );
        store.updateNode(n.id, {
          data: {
            ...n.data,
            types: cleanedTypes,
          },
        });
        const edgesToRemove = store.edges.filter(
          (e) =>
            e.source === n.id &&
            (e.sourceHandle === "type-out-type-chat-message" ||
              e.data?.label === "ChatMessage" ||
              e.data?.baseTypeName === "ChatMessage"),
        );
        edgesToRemove.forEach((e) => store.deleteEdge(e.id));
      }
    }
  });

  // 2. Find an existing general (non-specialized) TypesNode (such as "App Types")
  const existingGeneralTypesNode = currentNodes.find(
    (n) => n.type === "types" && !isSpecializedTypesNode(n),
  );

  if (existingGeneralTypesNode) {
    const currentTypes: CustomTypeItem[] = existingGeneralTypesNode.data?.types || [];
    const existingChatMessage = currentTypes.find((t) => t.name === "ChatMessage");
    if (existingChatMessage) {
      const roleField = existingChatMessage.fields?.find((f) => f.name === "role");
      if (roleField) {
        let changed = false;
        if (roleField.type !== "enum") {
          roleField.type = "enum";
          changed = true;
        }
        if (!roleField.enumValues || roleField.enumValues.length === 0) {
          roleField.enumValues = ["user", "assistant", "system"];
          changed = true;
        } else if (!roleField.enumValues.includes("system")) {
          roleField.enumValues = [...roleField.enumValues, "system"];
          changed = true;
        }
        if (changed) {
          store.updateNode(existingGeneralTypesNode.id, {
            data: {
              ...existingGeneralTypesNode.data,
              types: [...currentTypes],
            },
          });
        }
      }
      return { typesNodeId: existingGeneralTypesNode.id, typeItem: existingChatMessage };
    }
    const updatedTypes = [...currentTypes, CHAT_MESSAGE_CUSTOM_TYPE];
    store.updateNode(existingGeneralTypesNode.id, {
      data: {
        ...existingGeneralTypesNode.data,
        types: updatedTypes,
      },
    });
    return { typesNodeId: existingGeneralTypesNode.id, typeItem: CHAT_MESSAGE_CUSTOM_TYPE };
  }

  // 3. Otherwise, create a brand-new dedicated "App Types" node (completely separate from Entity Types)
  const newTypesNodeId = `types-app-${Date.now()}`;
  const pos = referencePosition || { x: 480, y: 100 };
  const newTypesNode: Omit<BackendNode, "fractionalIndex"> = {
    id: newTypesNodeId,
    type: "types",
    position: { x: pos.x, y: pos.y },
    selected: false,
    data: {
      label: "App Types",
      scope: "global",
      types: [CHAT_MESSAGE_CUSTOM_TYPE],
    },
  };
  store.addNode(newTypesNode);
  return { typesNodeId: newTypesNodeId, typeItem: CHAT_MESSAGE_CUSTOM_TYPE };
}

