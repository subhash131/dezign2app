import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { CustomTypeItem, BackendNode } from "@/types/canvas";
import { toast } from "sonner";
import {
  toPascalCase,
  mapColumnsToTypeFields,
  findDownstreamAffectedNodes,
  syncEntityDerivedTypes,
} from "./node";

export interface FetchPackageTypesResponse {
  installed: boolean;
  pkg: string;
  version?: string;
  types: CustomTypeItem[];
  error?: string;
}

/**
 * Dynamically extracts types for a package from node_modules.
 * Calls the server-side TypeScript extractor API.
 */
export async function fetchPackageTypesFromNodeModules(
  pkg: string,
): Promise<FetchPackageTypesResponse> {
  const trimmedPkg = pkg.trim();
  if (!trimmedPkg) {
    return {
      installed: false,
      pkg: "",
      types: [],
      error: "Package name cannot be empty",
    };
  }

  try {
    const res = await fetch(
      `/api/packages/extract-types?pkg=${encodeURIComponent(trimmedPkg)}`,
    );
    if (!res.ok) {
      return {
        installed: false,
        pkg: trimmedPkg,
        types: [],
        error: `Package "${trimmedPkg}" is missing from node_modules. Run 'pnpm i' to install.`,
      };
    }

    const data = await res.json();
    const installed = typeof data.installed === "boolean" ? data.installed : false;
    const version = typeof data.version === "string" ? data.version : undefined;
    const error = typeof data.error === "string" ? data.error : undefined;
    const types: CustomTypeItem[] = Array.isArray(data.types) ? data.types : [];

    return {
      installed,
      pkg: trimmedPkg,
      version,
      types,
      error,
    };
  } catch {
    return {
      installed: false,
      pkg: trimmedPkg,
      types: [],
      error: `Failed to inspect node_modules for "${trimmedPkg}".`,
    };
  }
}

/**
 * Re-scans node_modules and synchronizes fresh types to an existing TypesNode on the canvas.
 * Useful when a user has just run 'pnpm add <pkg>'.
 */
export async function refreshPackageTypesFromNodeModules(
  typesNodeId: string,
  pkg: string,
): Promise<boolean> {
  const store = useBackendCanvasStore.getState();
  const node = store.nodes.find((n) => n.id === typesNodeId);
  if (!node) return false;

  const result = await fetchPackageTypesFromNodeModules(pkg);
  const currentNode = useBackendCanvasStore.getState().nodes.find((n) => n.id === typesNodeId);
  if (!currentNode) return false;

  if (result.installed && result.types.length > 0) {
    useBackendCanvasStore.getState().updateNode(typesNodeId, {
      data: {
        ...currentNode.data,
        label: currentNode.data.label || pkg,
        isInstalled: true,
        installError: undefined,
        types: result.types,
        packageVersion: result.version,
      },
    });
    toast.success(`Inferred ${result.types.length} types from ${pkg} in node_modules`);
    return true;
  }

  useBackendCanvasStore.getState().updateNode(typesNodeId, {
    data: {
      ...currentNode.data,
      label: currentNode.data.label || pkg,
      isInstalled: false,
      installError:
        result.error ||
        `Package "${pkg}" is not installed in node_modules. Run 'pnpm i' to install.`,
      types: [],
    },
  });
  toast.error(`Package "${pkg}" not found in node_modules. Run 'pnpm i' first.`);
  return false;
}

/**
 * Persists a package addition/update/removal directly to the project's package.json on disk.
 * Allows the user to simply run 'pnpm i' in terminal to install all dependencies.
 */
export async function syncPackageToDiskPackageJson(params: {
  action: "add" | "update" | "remove";
  name: string;
  version?: string;
  isDev?: boolean;
  nodeType?: "service" | "webApp" | "webPage";
}): Promise<boolean> {
  try {
    const res = await fetch("/api/packages/sync-package-json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Synchronizes package data contracts to separate, uneditable canvas TypesNodes.
 * For each package (e.g. "@xyflow/react"), creates its own dedicated TypesNode
 * with the list of types inferred directly from node_modules.
 * If the package is missing from node_modules, displays 0 types and flags an install error.
 */
export function syncPackageTypesToCanvas(
  targetNodeId: string,
  packages: string[],
) {
  if (!packages || packages.length === 0 || !targetNodeId) return;

  const store = useBackendCanvasStore.getState();
  const nodes = store.nodes;
  const edges = store.edges;

  const targetNode = nodes.find((n) => n.id === targetNodeId);
  if (!targetNode) return;

  // Clean up any legacy lumped "Web App Package Types" nodes
  const legacyLumpedNodes = nodes.filter(
    (n) =>
      n.type === "types" &&
      (n.data?.label === "Web App Package Types" ||
        n.data?.label === "App Package Types" ||
        (n.data?.label?.endsWith("Package Types") && !n.data?.isPackageNode)) &&
      (n.data?.targetWebAppId === targetNodeId ||
        n.data?.targetServiceId === targetNodeId),
  );
  legacyLumpedNodes.forEach((leg) => {
    store.deleteNode(leg.id);
  });

  const targetPos = targetNode.position || { x: 100, y: 100 };

  // For EACH package, create its own dedicated, uneditable TypesNode
  packages.forEach((pkg, index) => {
    const trimmedPkg = pkg.trim();
    if (!trimmedPkg) return;

    // Check if a dedicated TypesNode already exists for this specific package on this target
    const existingPkgNode = store.nodes.find(
      (n) =>
        n.type === "types" &&
        n.data?.packageName === trimmedPkg &&
        (n.data?.targetWebAppId === targetNodeId ||
          n.data?.targetServiceId === targetNodeId),
    );

    if (existingPkgNode) {
      // Ensure edge exists
      const hasEdge = edges.some(
        (e) =>
          (e.source === existingPkgNode.id && e.target === targetNodeId) ||
          (e.target === existingPkgNode.id && e.source === targetNodeId),
      );
      if (!hasEdge) {
        store.addEdge({
          id: `edge-types-${existingPkgNode.id}-${targetNodeId}`,
          source: existingPkgNode.id,
          target: targetNodeId,
          sourceHandle: "types-out",
          targetHandle: "types-in",
          type: "type-reference",
          data: { isTypeReference: true, packageName: trimmedPkg },
        });
      }
      return;
    }

    // Ensure the package is also saved to package.json on disk so running 'pnpm i' will install it
    syncPackageToDiskPackageJson({
      action: "add",
      name: trimmedPkg,
      nodeType: targetNode.type === "webApp" ? "webApp" : "service",
    });

    const sanitizedName = trimmedPkg.replace(/[^a-zA-Z0-9_-]/g, "-");
    const typesNodeId = `types-pkg-${sanitizedName}-${Date.now() + index}`;

    // Stagger nodes vertically so each package node has clear canvas space
    const newPos = {
      x: Math.max(40, targetPos.x - 380),
      y: targetPos.y + index * 260,
    };

    // Create uneditable package types node (initial placeholder awaiting inference)
    store.addNode({
      id: typesNodeId,
      type: "types",
      position: newPos,
      data: {
        label: `${trimmedPkg}`,
        scope: "global",
        isPackageNode: true,
        packageName: trimmedPkg,
        packageSources: [trimmedPkg],
        targetWebAppId: targetNode.type === "webApp" ? targetNode.id : undefined,
        targetServiceId: targetNode.type !== "webApp" ? targetNode.id : undefined,
        isReadOnly: true,
        isInstalled: true, // Will be updated by async inspection
        types: [],
      },
    });

    // Create type-reference edge linking package types node to target node
    store.addEdge({
      id: `edge-types-${typesNodeId}-${targetNodeId}`,
      source: typesNodeId,
      target: targetNodeId,
      sourceHandle: "types-out",
      targetHandle: "types-in",
      type: "type-reference",
      data: { isTypeReference: true, packageName: trimmedPkg },
    });

    // Asynchronously infer types directly from node_modules
    fetchPackageTypesFromNodeModules(trimmedPkg).then((result) => {
      const storeState = useBackendCanvasStore.getState();
      const currentNode = storeState.nodes.find((n) => n.id === typesNodeId);
      if (!currentNode) return;

      if (result.installed && result.types.length > 0) {
        storeState.updateNode(typesNodeId, {
          data: {
            ...currentNode.data,
            label: currentNode.data.label || trimmedPkg,
            isInstalled: true,
            installError: undefined,
            packageVersion: result.version,
            types: result.types,
          },
        });
      } else {
        storeState.updateNode(typesNodeId, {
          data: {
            ...currentNode.data,
            label: currentNode.data.label || trimmedPkg,
            isInstalled: false,
            installError:
              result.error ||
              `Package "${trimmedPkg}" is not installed in node_modules. Run 'pnpm i' to install.`,
            types: [],
          },
        });
      }
    });
  });
}

/**
 * Creates or reuses a single TypesNode on the canvas that visually extends an existing type,
 * with visible row-level reference edges labeled "extends" linking specific type rows.
 */
export function createExtendedTypeNode(sourceNodeId: string, sourceTypeId: string) {
  const store = useBackendCanvasStore.getState();
  const nodes = store.nodes;

  const sourceNode = nodes.find((n) => n.id === sourceNodeId);
  if (!sourceNode) return;

  const typesList: CustomTypeItem[] = sourceNode.data?.types || [];
  const baseType = typesList.find((t) => t.id === sourceTypeId);
  if (!baseType) return;

  // Look for an existing extended node dedicated to this source node
  const existingExtendedNode = nodes.find(
    (n) =>
      n.type === "types" &&
      Boolean(n.data?.isExtended) &&
      n.data?.extendedFromNodeId === sourceNodeId,
  );

  // If this type is already extended in the existing extended node, highlight it
  if (existingExtendedNode) {
    const existingExtType = (existingExtendedNode.data?.types || []).find(
      (t) => t.extendedFromTypeId === baseType.id || t.extendedFrom === baseType.name,
    );
    if (existingExtType) {
      store.setActiveConfigItem({
        id: existingExtendedNode.id,
        nodeId: existingExtendedNode.id,
        type: "types",
        selectedTypeId: existingExtType.id,
      });
      toast.info(`"${baseType.name}" is already extended as "${existingExtType.name}".`);
      return;
    }
  }

  const newTypeId = `type-ext-${Date.now()}-${baseType.name.toLowerCase()}`;
  const extendedTypeName = `Custom${baseType.name}`;

  // Clone fields from base type so user has a complete starting model.
  // Mark each cloned field as inherited so the preview can emit proper extends syntax.
  const clonedFields = (baseType.fields || []).map((f) => ({
    id: `f-${Date.now()}-${f.name}`,
    name: f.name,
    type: f.type,
    required: f.required,
    isArray: f.isArray,
    description: f.description || `Inherited from ${baseType.name}`,
    isInherited: true,
  }));

  const extendedType: CustomTypeItem = {
    id: newTypeId,
    name: extendedTypeName,
    kind: baseType.kind || "interface",
    description: `Extended custom model based on ${baseType.name} (${baseType.packageSource || "base type"})`,
    isReadOnly: false, // Fully editable
    isExtendable: true,
    extendedFrom: baseType.name,
    extendedFromTypeId: baseType.id,
    fields: [
      ...clonedFields,
      {
        id: `f-${Date.now()}-custom`,
        name: "customAttribute",
        type: "string",
        required: false,
        description: "Custom extended property",
      },
    ],
    ...(baseType.enumValues ? { enumValues: [...baseType.enumValues] } : {}),
    ...(baseType.typeAliasValue ? { typeAliasValue: baseType.typeAliasValue } : {}),
  };

  let targetNodeId: string;

  if (existingExtendedNode) {
    targetNodeId = existingExtendedNode.id;
    const currentTypes = existingExtendedNode.data?.types || [];
    store.updateNode(existingExtendedNode.id, {
      data: {
        ...existingExtendedNode.data,
        types: [...currentTypes, extendedType],
      },
    });
  } else {
    const sourceName =
      sourceNode.data?.packageName || sourceNode.data?.label || "Types";
    const sourcePos = sourceNode.position || { x: 100, y: 100 };
    const newPos = {
      x: sourcePos.x + 360,
      y: sourcePos.y,
    };

    targetNodeId = `types-ext-${sourceNodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}`;

    store.addNode({
      id: targetNodeId,
      type: "types",
      position: newPos,
      data: {
        label: `${sourceName} (Extended)`,
        scope: "global",
        isExtended: true,
        extendedFromNodeId: sourceNodeId,
        types: [extendedType],
      },
    });
  }

  // Create visible edge labeled "extends" linking specific source type row to specific target type row
  const edgeId = `edge-extends-${sourceNodeId}-${baseType.id}-${newTypeId}`;
  store.addEdge({
    id: edgeId,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: `type-out-${baseType.id}`,
    targetHandle: `type-in-${newTypeId}`,
    type: "type-reference",
    data: {
      label: "extends",
      isExtensionEdge: true,
      baseTypeName: baseType.name,
      extendedTypeName,
    },
  });

  // Focus and open config drawer for the newly created extended type
  store.setActiveConfigItem({
    id: targetNodeId,
    nodeId: targetNodeId,
    type: "types",
    selectedTypeId: newTypeId,
  });

  toast.success(`Extended "${baseType.name}" as "${extendedTypeName}"`);
}

// ─── Entity → TypesNode Auto-Generation ─────────────────────────────────────

/**
 * Auto-generates a `TypesNode` on the backend canvas from an existing `EntityNode`.
 *
 * - Maps each `CanvasEntityColumn` → `CustomTypeItem` field with proper TS types.
 * - Positions the TypesNode to the right of the entity node.
 * - Creates a semantic "generates" edge connecting the two nodes.
 * - Idempotent: if a TypesNode with `sourceEntityId` already exists, refreshes it.
 * - Opens the config drawer for the new/refreshed type automatically.
 */
export function createTypesNodeFromEntity(entityNodeId: string): void {
  const store = useBackendCanvasStore.getState();
  const entityNode = store.nodes.find(
    (n) => n.id === entityNodeId && n.type === "entity",
  );
  if (!entityNode) {
    toast.error("Entity node not found.");
    return;
  }

  // BackendNodeData is a flat intersection of all domain sub-types, so
  // tableName and columns are directly typed optional fields — no casts needed.
  const tableName = entityNode.data.tableName || entityNode.data.label || "Entity";
  const columns = entityNode.data.columns ?? [];
  const now = Date.now();
  const pascalName = toPascalCase(tableName);
  const typeId = `type-entity-${entityNodeId}`;

  // ── Idempotency: refresh if a linked TypesNode already exists ──────────────
  const existing = store.nodes.find(
    (n) => n.type === "types" && n.data.sourceEntityId === entityNodeId,
  );

  const existingType = (existing?.data.types ?? []).find((t) => t.id === typeId);
  const fields = mapColumnsToTypeFields(
    columns,
    existingType?.fields ?? [],
    tableName,
    `f-${typeId}`,
  );

  const typeItem: CustomTypeItem = {
    ...(existingType || {}),
    id: typeId,
    name: pascalName,
    kind: "interface",
    description: `Auto-generated TypeScript interface from entity: ${tableName}`,
    fields,
  };

  if (existing) {
    const { updatedTypesNodes } = syncEntityDerivedTypes(
      store.nodes,
      entityNodeId,
      entityNode,
      store.edges,
    );

    for (const uNode of updatedTypesNodes) {
      store.updateNode(uNode.id, {
        data: uNode.data,
      });
    }

    store.setActiveConfigItem({
      id: existing.id,
      nodeId: existing.id,
      type: "types",
      selectedTypeId: typeId,
    });
    toast.success(`Refreshed "${typeItem.name}" types from entity "${tableName}"`);
    return;
  }

  // ── Create a new TypesNode positioned to the right of the entity ───────────
  const newNodeId = `types-from-entity-${entityNodeId}-${now}`;
  const pos = entityNode.position ?? { x: 100, y: 100 };

  const newNodeData: BackendNode["data"] = {
    label: `${pascalName} Types`,
    scope: "global",
    sourceEntityId: entityNodeId,
    sourceEntityName: tableName,
    entityUpdatedAt: now,
    types: [typeItem],
  };

  store.addNode({
    id: newNodeId,
    type: "types",
    position: { x: pos.x + 380, y: pos.y },
    data: newNodeData,
  });

  // ── Semantic "generates" edge: entity → typesNode ──────────────────────────
  store.addEdge({
    id: `edge-entity-types-${entityNodeId}-${newNodeId}`,
    source: entityNodeId,
    target: newNodeId,
    targetHandle: "types-in",
    type: "type-reference",
    data: { label: "generates" },
  });

  // ── Open the config drawer for the newly created type ──────────────────────
  store.setActiveConfigItem({
    id: newNodeId,
    nodeId: newNodeId,
    type: "types",
    selectedTypeId: typeItem.id,
  });

  toast.success(
    `Generated "${typeItem.name}" TypesNode from entity "${tableName}" (${fields.length} fields)`,
  );
}
