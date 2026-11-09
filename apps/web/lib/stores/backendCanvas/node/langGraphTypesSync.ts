import {
  BackendNode,
  BackendEdge,
  CustomTypeItem,
  CustomTypeField,
} from "@/types/canvas";
import { generateKeyBetween } from "fractional-indexing";
import { toPascalCase } from "@/lib/compiler/utils";
import { toCamelCase } from "@/lib/utils";
import { getLastIndex } from "../utils";

export interface BuildLangGraphTypesResult {
  typesNode: BackendNode;
  typesEdge: BackendEdge;
  isExistingNode: boolean;
}

export const LANGGRAPH_MESSAGE_FIELDS: CustomTypeField[] = [
  {
    id: "f-msg-content",
    name: "content",
    type: "string",
    required: true,
    description: "Message text or content blocks",
  },
  {
    id: "f-msg-id",
    name: "id",
    type: "string",
    required: false,
    description: "Unique message identifier",
  },
  {
    id: "f-msg-name",
    name: "name",
    type: "string",
    required: false,
    description: "Optional author name / role",
  },
  {
    id: "f-msg-kwargs",
    name: "additional_kwargs",
    type: "Record<string, string | number | boolean>",
    required: false,
    description: "Model-specific metadata and function/tool calls",
  },
  {
    id: "f-msg-metadata",
    name: "response_metadata",
    type: "Record<string, string | number | boolean>",
    required: false,
    description: "Response metadata (token counts, finish reasons, headers)",
  },
];

/**
 * Checks if a TypesNode was derived from a specific LangGraph node.
 */
export function isNodeDerivedFromLangGraph(
  node: BackendNode,
  langGraphId: string,
): boolean {
  if (node.type !== "types") return false;
  if (node.data?.sourceLangGraphId === langGraphId) return true;
  if (node.data?.targetLangGraphId === langGraphId) return true;
  if (node.id === `types-langgraph-${langGraphId}`) return true;
  return false;
}

/**
 * Normalizes state channel type strings to strict TypeScript types.
 */
function normalizeChannelType(rawType?: string): { type: string; isArray: boolean } {
  if (!rawType) return { type: "string", isArray: false };
  const trimmed = rawType.trim();

  if (trimmed === "messages") {
    return { type: "BaseMessage[]", isArray: true };
  }
  if (trimmed.endsWith("[]")) {
    return { type: trimmed, isArray: true };
  }
  if (trimmed === "array") {
    return { type: "string[]", isArray: true };
  }
  if (trimmed === "json" || trimmed === "object") {
    return { type: "Record<string, string | number | boolean>", isArray: false };
  }
  if (trimmed === "number" || trimmed === "int" || trimmed === "float") {
    return { type: "number", isArray: false };
  }
  if (trimmed === "boolean" || trimmed === "bool") {
    return { type: "boolean", isArray: false };
  }
  return { type: trimmed, isArray: false };
}

/**
 * Derives a clean workspace package name matching compiler conventions:
 * e.g. "@workspace/langgraph-support-agent"
 */
export function deriveLangGraphPackageName(
  label: string,
  existingNodes: BackendNode[] = [],
  currentNodeId?: string,
): string {
  const trimmed = (label || "agent").trim();
  const base =
    trimmed.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "-") || "agent";

  // Check if any other LangGraph node already uses this base to avoid collision
  const otherLgNodes = existingNodes.filter(
    (n) => n.type === "langgraph" && n.id !== currentNodeId,
  );
  let folderName = base;
  const seenFolders = new Set(
    otherLgNodes.map((n) => {
      const lbl = (n.data?.label || "agent").trim();
      return (
        lbl.replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, "-") || "agent"
      ).toLowerCase();
    }),
  );

  let counter = 1;
  while (seenFolders.has(folderName.toLowerCase())) {
    counter++;
    folderName = `${base}-${counter}`;
  }

  const pkgSlug =
    folderName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/^-+|-+$/g, "") || "agent";
  return `@workspace/langgraph-${pkgSlug.replace(/^langgraph-/, "")}`;
}

/**
 * Converts a LangGraph node's stateChannels and inputChannels to CustomTypeItems.
 */
export function convertLangGraphToCustomTypes(
  langGraphNode: BackendNode,
): CustomTypeItem[] {
  const rawLabel = langGraphNode.data?.label || "LangGraph Agent";
  const pascalName = toPascalCase(rawLabel.replace(/[^a-zA-Z0-9]/g, " ") || "Agent");
  const stateChannels = Array.isArray(langGraphNode.data?.stateChannels)
    ? langGraphNode.data.stateChannels
    : [];
  const inputChannels = Array.isArray(langGraphNode.data?.inputChannels)
    ? langGraphNode.data.inputChannels
    : [];

  const types: CustomTypeItem[] = [];

  // 1. State Type (<Agent>State)
  const stateFields: CustomTypeField[] = stateChannels.map((ch, idx) => {
    const { type, isArray } = normalizeChannelType(ch.type);
    return {
      id: `f-state-${ch.key || idx}`,
      name: ch.key || `field_${idx + 1}`,
      type,
      required: true,
      isArray,
      description: ch.description || `State channel: ${ch.key}`,
    };
  });

  // Always ensure at least default messages channel if empty
  if (stateFields.length === 0) {
    stateFields.push({
      id: `f-state-messages`,
      name: "messages",
      type: "BaseMessage[]",
      required: true,
      isArray: true,
      description: "Conversation history messages",
    });
  }

  types.push({
    id: `type-lg-state-${langGraphNode.id}`,
    name: `${pascalName}State`,
    kind: "interface",
    description: `Complete state schema for ${rawLabel}`,
    fields: stateFields,
  });

  types.push({
    id: `type-lg-state-type-${langGraphNode.id}`,
    name: `${pascalName}StateType`,
    kind: "type",
    description: `Type alias for ${pascalName}State`,
    fields: stateFields,
  });

  // 2. State Update Type (<Agent>StateUpdate and <Agent>StateUpdateType)
  const stateUpdateFields: CustomTypeField[] = stateFields.map((f) => ({
    ...f,
    id: `f-update-${f.name}`,
    required: false,
    description: `Partial update for ${f.name}`,
  }));

  types.push({
    id: `type-lg-update-${langGraphNode.id}`,
    name: `${pascalName}StateUpdate`,
    kind: "type",
    description: `Partial state update payload for ${rawLabel}`,
    fields: stateUpdateFields,
  });

  types.push({
    id: `type-lg-update-type-${langGraphNode.id}`,
    name: `${pascalName}StateUpdateType`,
    kind: "type",
    description: `Type alias for ${pascalName}StateUpdate`,
    fields: stateUpdateFields,
  });

  // 3. LangChain chat message contracts (exported by package from @langchain/core/messages)
  types.push({
    id: `type-lg-msg-human-${langGraphNode.id}`,
    name: "HumanMessage",
    kind: "interface",
    description: "LangChain message from a human user",
    fields: LANGGRAPH_MESSAGE_FIELDS,
    isReadOnly: true,
    isExtendable: true,
  });

  types.push({
    id: `type-lg-msg-ai-${langGraphNode.id}`,
    name: "AIMessage",
    kind: "interface",
    description: "LangChain message from an AI model",
    fields: LANGGRAPH_MESSAGE_FIELDS,
    isReadOnly: true,
    isExtendable: true,
  });

  types.push({
    id: `type-lg-msg-system-${langGraphNode.id}`,
    name: "SystemMessage",
    kind: "interface",
    description: "LangChain system prompt message",
    fields: LANGGRAPH_MESSAGE_FIELDS,
    isReadOnly: true,
    isExtendable: true,
  });

  types.push({
    id: `type-lg-msg-base-${langGraphNode.id}`,
    name: "BaseMessage",
    kind: "interface",
    description: "Base interface for all LangChain chat messages",
    fields: LANGGRAPH_MESSAGE_FIELDS,
    isReadOnly: true,
    isExtendable: true,
  });

  // 4. Graph instance runnable
  const camelName = toCamelCase(rawLabel.replace(/[^a-zA-Z0-9]/g, " ") || "agent");
  types.push({
    id: `type-lg-graph-${langGraphNode.id}`,
    name: `${camelName}Graph`,
    kind: "function",
    description: `Compiled LangGraph runnable workflow instance for ${rawLabel}`,
    returnType: "CompiledStateGraph",
    isReadOnly: true,
  });

  // 3. Input Type (<Agent>Input) if inputChannels exist
  if (inputChannels.length > 0) {
    const inputFields: CustomTypeField[] = inputChannels.map((ch, idx) => {
      const { type, isArray } = normalizeChannelType(ch.type);
      return {
        id: `f-input-${ch.key || idx}`,
        name: ch.key || `input_${idx + 1}`,
        type,
        required: ch.required !== false,
        isArray,
        description: `Input channel: ${ch.key}`,
      };
    });

    types.push({
      id: `type-lg-input-${langGraphNode.id}`,
      name: `${pascalName}Input`,
      kind: "interface",
      description: `Invocation input contract for ${rawLabel}`,
      fields: inputFields,
    });
  }

  return types;
}

/**
 * Builds or updates the companion TypesNode and edge for a given LangGraphNode.
 */
export function buildLangGraphTypesNodeAndEdge(
  langGraphNode: BackendNode,
  existingNodes: BackendNode[],
  existingEdges: BackendEdge[],
  customPosition?: { x: number; y: number },
): BuildLangGraphTypesResult {
  const langGraphId = langGraphNode.id;
  const rawLabel = langGraphNode.data?.label || "LangGraph Agent";
  const typesNodeId = `types-langgraph-${langGraphId}`;
  const now = Date.now();

  const packageName = deriveLangGraphPackageName(
    rawLabel,
    existingNodes,
    langGraphId,
  );

  const existingTypesNode = existingNodes.find(
    (n) => n.type === "types" && isNodeDerivedFromLangGraph(n, langGraphId),
  );

  const generatedTypes = convertLangGraphToCustomTypes(langGraphNode);

  if (existingTypesNode) {
    const existingTypes = Array.isArray(existingTypesNode.data?.types)
      ? existingTypesNode.data.types
      : [];
    const mergedTypes: CustomTypeItem[] = [...generatedTypes];
    for (const et of existingTypes) {
      if (!mergedTypes.some((t) => t.name === et.name)) {
        mergedTypes.push(et);
      }
    }

    const updatedNode: BackendNode = {
      ...existingTypesNode,
      data: {
        ...existingTypesNode.data,
        label: `${rawLabel} Types`,
        packageName,
        isPackageNode: true,
        isLangGraphPackage: true,
        sourceLangGraphId: langGraphId,
        sourceLangGraphName: rawLabel,
        packageSources: [packageName],
        langGraphUpdatedAt: now,
        types: mergedTypes,
      },
    };

    const existingEdge = existingEdges.find(
      (e) =>
        (e.source === existingTypesNode.id && e.target === langGraphId) ||
        (e.source === langGraphId && e.target === existingTypesNode.id),
    );

    if (
      existingEdge &&
      existingEdge.source === existingTypesNode.id &&
      existingEdge.target === langGraphId &&
      existingEdge.sourceHandle === "types-out" &&
      existingEdge.targetHandle === "types-in"
    ) {
      return {
        typesNode: updatedNode,
        typesEdge: existingEdge,
        isExistingNode: true,
      };
    }

    const lastEdgeIdx = getLastIndex(existingEdges);
    const typesEdgeIdx = existingEdge
      ? existingEdge.fractionalIndex
      : generateKeyBetween(lastEdgeIdx, null);
    const typesEdgeId = existingEdge
      ? existingEdge.id
      : `edge-types-${existingTypesNode.id}-${langGraphId}`;
    const typesEdge: BackendEdge = {
      id: typesEdgeId,
      source: existingTypesNode.id,
      sourceHandle: "types-out",
      target: langGraphId,
      targetHandle: "types-in",
      type: "type-reference",
      fractionalIndex: typesEdgeIdx,
      data: {
        label: "contracts",
        isTypeReference: true,
        packageName,
      },
    };

    return {
      typesNode: updatedNode,
      typesEdge,
      isExistingNode: true,
    };
  }

  // Position companion TypesNode to the left of the LangGraphNode
  const defaultPos = {
    x: Math.max(40, (langGraphNode.position?.x || 100) - 360),
    y: langGraphNode.position?.y || 100,
  };
  const typesPos = customPosition ?? defaultPos;

  const lastNodeIdx = getLastIndex(existingNodes);
  const typesIndex = generateKeyBetween(lastNodeIdx, null);

  const typesNode: BackendNode = {
    id: typesNodeId,
    type: "types",
    position: typesPos,
    fractionalIndex: typesIndex,
    selected: false,
    data: {
      label: `${rawLabel} Types`,
      scope: "global",
      isPackageNode: true,
      isLangGraphPackage: true,
      packageName,
      targetLangGraphId: langGraphId,
      sourceLangGraphId: langGraphId,
      sourceLangGraphName: rawLabel,
      packageSources: [packageName],
      isReadOnly: true,
      isInstalled: true,
      langGraphUpdatedAt: now,
      types: generatedTypes,
    },
  };

  const lastEdgeIdx = getLastIndex(existingEdges);
  const typesEdgeIdx = generateKeyBetween(lastEdgeIdx, null);
  const typesEdgeId = `edge-types-${typesNodeId}-${langGraphId}`;
  const typesEdge: BackendEdge = {
    id: typesEdgeId,
    source: typesNodeId,
    sourceHandle: "types-out",
    target: langGraphId,
    targetHandle: "types-in",
    type: "type-reference",
    fractionalIndex: typesEdgeIdx,
    data: {
      label: "contracts",
      isTypeReference: true,
      packageName,
    },
  };

  return {
    typesNode,
    typesEdge,
    isExistingNode: false,
  };
}

