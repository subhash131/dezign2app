import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  UIEventItem,
  StoreActionBinding,
  StoreActionType,
  GlobalStoreField,
  GlobalStoreAction,
} from "@workspace/canvas/types";

export type { StoreActionType };

export interface ResolvedStoreActionBinding {
  storeNodeId: string;
  storeName: string;
  actionId: string;
  actionName: string;
  actionType: StoreActionType;
}

const NON_ACTION_HANDLES: readonly string[] = [
  "page-in",
  "page-out",
  "store-in",
  "store-out",
  "store-state-in",
  "store-state-out",
  "section-state-in",
  "populate-in",
  "populate-in-left",
  "populate-out",
  "mutate-in",
  "mutate-in-left",
  "mutate-out",
  "reset-in",
  "reset-in-left",
  "reset-out",
  "public-in",
  "private-in",
  "auth-in",
  "auth-out",
  "types-in",
  "types-out",
];

const VALID_STORE_ACTION_TYPES: ReadonlySet<string> = new Set<StoreActionType>([
  "set",
  "append",
  "prepend",
  "pop",
  "remove",
  "toggle",
  "increment",
  "decrement",
  "update",
  "reset",
  "populate",
  "custom",
  "mutate",
  "stream",
]);

export function isValidStoreActionType(val: string | undefined): val is StoreActionType {
  return typeof val === "string" && VALID_STORE_ACTION_TYPES.has(val);
}

/**
 * Detects if a field name indicates a collection or plural entity,
 * filtering out singular words ending in 'ss', 'us', 'is', 'as', 'ness'.
 */
export function isPluralOrCollectionName(name: string | undefined): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  if (
    lower.endsWith("list") ||
    lower.endsWith("items") ||
    lower.endsWith("collection") ||
    lower.endsWith("array")
  ) {
    return true;
  }
  if (
    lower.endsWith("ss") ||
    lower.endsWith("us") ||
    lower.endsWith("is") ||
    lower.endsWith("as") ||
    lower.endsWith("ness")
  ) {
    return false;
  }
  return lower.endsWith("s");
}

/**
 * Checks whether a target field should be treated as an array type.
 * Explicit field types (e.g. "string", "number", "boolean", "object") always take priority.
 */
export function isArrayTargetField(
  targetFieldType?: string,
  targetFieldName?: string,
  reducerOrAction?: string,
): boolean {
  if (targetFieldType) {
    const ft = targetFieldType.toLowerCase().trim();
    if (ft === "array" || ft.endsWith("[]") || ft.startsWith("array<")) {
      return true;
    }
    if (
      ft === "string" ||
      ft === "number" ||
      ft === "boolean" ||
      ft === "object" ||
      ft === "record"
    ) {
      return false;
    }
  }
  if (reducerOrAction) {
    const r = reducerOrAction.toLowerCase();
    if (
      r.includes("array") ||
      r.includes("list") ||
      r === "push" ||
      r === "append" ||
      r === "prepend" ||
      r === "pop"
    ) {
      return true;
    }
  }
  return isPluralOrCollectionName(targetFieldName);
}

export function isNumberTargetField(targetFieldType?: string, targetFieldName?: string): boolean {
  if (targetFieldType) {
    const ft = targetFieldType.toLowerCase().trim();
    if (ft === "number" || ft === "int" || ft === "float" || ft === "double") return true;
    if (ft !== "") return false;
  }
  if (!targetFieldName) return false;
  const fn = targetFieldName.toLowerCase();
  return (
    fn.includes("count") ||
    fn.includes("total") ||
    fn.includes("amount") ||
    fn.includes("offset") ||
    fn.includes("limit") ||
    fn.includes("page") ||
    fn.includes("index")
  );
}

export function isBooleanTargetField(
  targetFieldType?: string,
  targetFieldName?: string,
  actionName?: string,
): boolean {
  if (targetFieldType) {
    const ft = targetFieldType.toLowerCase().trim();
    if (ft === "boolean" || ft === "bool") return true;
    if (ft !== "") return false;
  }
  if (actionName && actionName.toLowerCase().startsWith("toggle")) return true;
  if (!targetFieldName) return false;
  const fn = targetFieldName.toLowerCase();
  return (
    fn.startsWith("is") ||
    fn.startsWith("has") ||
    fn.includes("enabled") ||
    fn.includes("visible") ||
    fn.includes("open") ||
    fn.includes("loading")
  );
}

export function isObjectTargetField(targetFieldType?: string, targetFieldName?: string): boolean {
  if (targetFieldType) {
    const ft = targetFieldType.toLowerCase().trim();
    if (ft === "object" || ft === "record" || ft.startsWith("record<")) return true;
    if (ft !== "") return false;
  }
  if (!targetFieldName) return false;
  const fn = targetFieldName.toLowerCase();
  return (
    fn.includes("payload") ||
    fn.includes("config") ||
    fn.includes("metadata") ||
    fn.includes("profile") ||
    fn.includes("settings")
  );
}

function toPascalCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "State";
  if (/[\s\-_]/.test(clean)) {
    return clean
      .split(/[\s\-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function extractActionIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) {
    return null;
  }
  if (NON_ACTION_HANDLES.includes(handleId)) {
    return null;
  }
  if (
    handleId.startsWith("section-state-in-") ||
    handleId.startsWith("state-in-") ||
    handleId.startsWith("store-state-") ||
    handleId.startsWith("store-field-") ||
    handleId.startsWith("setter-") ||
    handleId.startsWith("append-") ||
    handleId.startsWith("pop-")
  ) {
    return null;
  }
  if (handleId.startsWith("pageload-in-")) {
    return handleId.slice("pageload-in-".length);
  }
  if (handleId.startsWith("event-in-")) {
    return handleId.slice("event-in-".length);
  }
  if (handleId.startsWith("action-in-")) {
    return handleId.slice("action-in-".length);
  }
  if (handleId.startsWith("sse-in-")) {
    return handleId.slice("sse-in-".length);
  }
  if (handleId.startsWith("websocket-in-")) {
    return handleId.slice("websocket-in-".length);
  }
  if (handleId.startsWith("ws-in-")) {
    return handleId.slice("ws-in-".length);
  }
  if (handleId.startsWith("webrtc-in-")) {
    return handleId.slice("webrtc-in-".length);
  }
  if (handleId.startsWith("rtc-out-")) {
    return handleId.slice("rtc-out-".length);
  }
  if (handleId.startsWith("rtc-in-")) {
    return handleId.slice("rtc-in-".length);
  }
  if (handleId.startsWith("events-")) {
    return handleId.slice("events-".length);
  }
  return handleId;
}

function resolveStoreBindingFromHandle(
  storeNode: BackendNode,
  storeHandleId: string | null | undefined,
  pageAction: UIEventItem,
  edge?: BackendEdge,
): { actionId: string; actionName: string; actionType: StoreActionType; targetFieldId?: string; targetFieldName?: string; targetFieldType?: string } {
  const storeActions = storeNode.data?.actions;
  const storeFields = storeNode.data?.fields;

  // 1. Populate / Load handle
  if (
    storeHandleId === "populate-out" ||
    storeHandleId === "populate-in" ||
    storeHandleId === "populate-in-left" ||
    storeHandleId === "load" ||
    Boolean(storeHandleId?.startsWith("populate-"))
  ) {
    return {
      actionId: "builtin-populate",
      actionName: "populate",
      actionType: "populate",
    };
  }

  // 2. Reset / Unmount handle
  if (
    storeHandleId === "reset-out" ||
    storeHandleId === "reset-in" ||
    storeHandleId === "reset-in-left" ||
    storeHandleId === "reset" ||
    Boolean(storeHandleId?.startsWith("reset-"))
  ) {
    return {
      actionId: "builtin-reset",
      actionName: "reset",
      actionType: "reset",
    };
  }

  // 3. Custom store action: store-action-out-${id} or store-action-in-${id} or store-action-in-left-${id}
  if (
    Boolean(storeHandleId?.startsWith("store-action-out-")) ||
    Boolean(storeHandleId?.startsWith("store-action-in-left-")) ||
    Boolean(storeHandleId?.startsWith("store-action-in-"))
  ) {
    const handlePrefix = storeHandleId?.startsWith("store-action-out-")
      ? "store-action-out-"
      : storeHandleId?.startsWith("store-action-in-left-")
      ? "store-action-in-left-"
      : "store-action-in-";
    const customId = storeHandleId ? storeHandleId.slice(handlePrefix.length) : "";

    if (Array.isArray(storeActions) && customId) {
      const found = storeActions.find((a) => a.id === customId);
      if (found) {
        const actionType: StoreActionType = isValidStoreActionType(found.actionType)
          ? found.actionType
          : "custom";
        const foundField = (storeFields || []).find((f) => f.id === found.targetFieldId || f.name === found.targetFieldName);
        return {
          actionId: found.id,
          actionName: found.name,
          actionType,
          targetFieldId: found.targetFieldId,
          targetFieldName: found.targetFieldName,
          targetFieldType: foundField?.type,
        };
      }
    }
  }

  // 3b. Store field handle: store-field-in-${f.id} or store-field-out-${f.id} or edge.data.targetFieldId
  if (
    storeHandleId?.startsWith("store-field-in-") ||
    storeHandleId?.startsWith("store-field-out-") ||
    Boolean(edge?.data?.targetFieldId)
  ) {
    let targetFieldId = edge?.data?.targetFieldId;
    if (!targetFieldId && storeHandleId?.startsWith("store-field-")) {
      targetFieldId = storeHandleId.replace(/^store-field-(in-|out-)/, "");
    }

    const matchedField = targetFieldId
      ? (storeFields || []).find((f) => f.id === targetFieldId)
      : undefined;

    if (matchedField) {
      const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);

      const actionSteps = pageAction.actionSteps;
      const matchingStep = Array.isArray(actionSteps)
        ? actionSteps.find(
            (s) =>
              s.type === "state_mutation" &&
              (s.stateStoreNodeId === storeNode.id || !s.stateStoreNodeId) &&
              (s.stateTargetFieldId === matchedField.id || s.stateKey === matchedField.name),
          )
        : undefined;

      const requestedAction =
        matchingStep?.stateActionName ||
        matchingStep?.stateUpdateType ||
        edge?.data?.actionName ||
        edge?.data?.actionType ||
        "set";

      const validActionType: StoreActionType = isValidStoreActionType(requestedAction)
        ? requestedAction
        : "set";

      let actionName = `set${cap}`;
      if (validActionType === "append") {
        actionName = `append${cap}`;
      } else if (validActionType === "prepend") {
        actionName = `prepend${cap}`;
      } else if (validActionType === "pop") {
        actionName = `pop${cap}`;
      } else if (validActionType === "remove") {
        actionName = `remove${cap}`;
      } else if (validActionType === "toggle") {
        actionName = `toggle${cap}`;
      } else if (validActionType === "increment") {
        actionName = `increment${cap}`;
      } else if (validActionType === "decrement") {
        actionName = `decrement${cap}`;
      } else if (validActionType === "update") {
        actionName = `update${cap}`;
      } else if (validActionType === "reset") {
        actionName = `reset${cap}`;
      } else if (validActionType === "custom" && matchingStep?.stateActionName) {
        actionName = matchingStep.stateActionName;
      }

      const matchedAction = (storeActions || []).find(
        (a) =>
          (a.targetFieldId === matchedField.id && a.actionType === validActionType) ||
          (a.targetFieldId === matchedField.id && a.name.toLowerCase() === actionName.toLowerCase()),
      );
      if (matchedAction) {
        const actionTargetField = (storeFields || []).find((f) => f.id === matchedAction.targetFieldId);
        return {
          actionId: matchedAction.id,
          actionName: matchedAction.name,
          actionType: isValidStoreActionType(matchedAction.actionType) ? matchedAction.actionType : validActionType,
          targetFieldId: matchedField.id,
          targetFieldName: matchedField.name,
          targetFieldType: actionTargetField?.type || matchedField.type,
        };
      }

      return {
        actionId: `field-${validActionType}-${matchedField.id}`,
        actionName,
        actionType: validActionType,
        targetFieldId: matchedField.id,
        targetFieldName: matchedField.name,
        targetFieldType: matchedField.type,
      };
    }
  }

  // 4. Mutate / Setter handle: mutate-out, mutate-in, setter-out-${f.id}, setter-in-left-${f.id}
  if (
    storeHandleId === "mutate-out" ||
    storeHandleId === "mutate-in" ||
    storeHandleId === "mutate" ||
    Boolean(storeHandleId?.startsWith("mutate-")) ||
    Boolean(storeHandleId?.startsWith("setter-"))
  ) {
    let targetFieldId: string | undefined = undefined;
    if (storeHandleId?.startsWith("setter-")) {
      targetFieldId = storeHandleId.replace(/^setter-(in-left-|in-|out-)/, "");
    } else if (
      storeHandleId?.startsWith("mutate-out-") ||
      storeHandleId?.startsWith("mutate-in-left-") ||
      storeHandleId?.startsWith("mutate-in-")
    ) {
      targetFieldId = storeHandleId.replace(/^mutate-(in-left-|in-|out-)/, "");
    }

    const matchedField = targetFieldId
      ? (storeFields || []).find((f) => f.id === targetFieldId)
      : undefined;

    if (matchedField) {
      const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
      const defaultSetterName = `set${cap}`;
      const matchedAction = (storeActions || []).find(
        (a) =>
          (a.defaultManipulatorType === "setter" && a.targetFieldId === matchedField.id) ||
          (a.targetFieldId === matchedField.id && a.name.toLowerCase() === defaultSetterName.toLowerCase()),
      );
      if (matchedAction) {
        return {
          actionId: matchedAction.id,
          actionName: matchedAction.name,
          actionType: isValidStoreActionType(matchedAction.actionType) ? matchedAction.actionType : "set",
          targetFieldId: matchedField.id,
          targetFieldName: matchedField.name,
        };
      }
      return {
        actionId: `setter-${matchedField.id}`,
        actionName: defaultSetterName,
        actionType: "set",
        targetFieldId: matchedField.id,
        targetFieldName: matchedField.name,
      };
    }

    if (Array.isArray(storeActions) && storeActions.length > 0) {
      const matched =
        storeActions.find(
          (a) => a.name.toLowerCase() === pageAction.name.toLowerCase(),
        ) || storeActions[0];

      if (matched) {
        const actionType: StoreActionType = isValidStoreActionType(matched.actionType)
          ? matched.actionType
          : "set";
        return {
          actionId: matched.id,
          actionName: matched.name,
          actionType,
        };
      }
    }

    const firstField =
      Array.isArray(storeFields) && storeFields.length > 0
        ? storeFields[0]
        : undefined;
    const fieldName = firstField?.name;
    const setterName = fieldName
      ? `set${toPascalCase(fieldName)}`
      : "set";

    return {
      actionId: firstField ? `setter-${firstField.id}` : "builtin-mutate",
      actionName: setterName,
      actionType: "set",
      targetFieldId: firstField?.id,
      targetFieldName: firstField?.name,
    };
  }

  // 4b. Append handle: append-out-${f.id}, append-in-left-${f.id}, append-in-${f.id}
  if (Boolean(storeHandleId?.startsWith("append-"))) {
    const targetFieldId = storeHandleId!.replace(/^append-(in-left-|in-|out-)?/, "");
    const matchedField = targetFieldId
      ? (storeFields || []).find((f) => f.id === targetFieldId)
      : undefined;

    if (matchedField) {
      const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
      const defaultAppendName = `append${cap}`;
      const matchedAction = (storeActions || []).find(
        (a) =>
          (a.defaultManipulatorType === "append" && a.targetFieldId === matchedField.id) ||
          ((a.name.toLowerCase() === defaultAppendName.toLowerCase() || a.actionType === "append") &&
            (!a.targetFieldId || a.targetFieldId === matchedField.id)),
      );
      if (matchedAction) {
        return {
          actionId: matchedAction.id,
          actionName: matchedAction.name,
          actionType: isValidStoreActionType(matchedAction.actionType) ? matchedAction.actionType : "append",
          targetFieldId: matchedField.id,
          targetFieldName: matchedField.name,
        };
      }
      return {
        actionId: `append-${matchedField.id}`,
        actionName: defaultAppendName,
        actionType: "append",
        targetFieldId: matchedField.id,
        targetFieldName: matchedField.name,
      };
    }
  }

  // 4c. Pop handle: pop-out-${f.id}, pop-in-left-${f.id}, pop-in-${f.id}
  if (Boolean(storeHandleId?.startsWith("pop-"))) {
    const targetFieldId = storeHandleId!.replace(/^pop-(in-left-|in-|out-)?/, "");
    const matchedField = targetFieldId
      ? (storeFields || []).find((f) => f.id === targetFieldId)
      : undefined;

    if (matchedField) {
      const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
      const defaultPopName = `pop${cap}`;
      const matchedAction = (storeActions || []).find(
        (a) =>
          (a.defaultManipulatorType === "pop" && a.targetFieldId === matchedField.id) ||
          (a.name.toLowerCase() === defaultPopName.toLowerCase() &&
            (!a.targetFieldId || a.targetFieldId === matchedField.id)),
      );
      if (matchedAction) {
        return {
          actionId: matchedAction.id,
          actionName: matchedAction.name,
          actionType: isValidStoreActionType(matchedAction.actionType) ? matchedAction.actionType : "remove",
          targetFieldId: matchedField.id,
          targetFieldName: matchedField.name,
        };
      }
      return {
        actionId: `pop-${matchedField.id}`,
        actionName: defaultPopName,
        actionType: "remove",
        targetFieldId: matchedField.id,
        targetFieldName: matchedField.name,
      };
    }
  }

  // 5. Generic fallback based on pageAction event
  if (
    pageAction.event === "pageLoad" ||
    pageAction.event === "mount" ||
    pageAction.event === "onMount" ||
    pageAction.name === "pageLoad" ||
    pageAction.name === "mount" ||
    pageAction.name === "onMount"
  ) {
    return {
      actionId: "builtin-populate",
      actionName: "populate",
      actionType: "populate",
    };
  }

  if (pageAction.event === "unmount" || pageAction.name === "unmount") {
    return {
      actionId: "builtin-reset",
      actionName: "reset",
      actionType: "reset",
    };
  }

  if (Array.isArray(storeActions) && storeActions.length > 0) {
    const firstAct = storeActions[0];
    if (firstAct) {
      const actionType: StoreActionType = isValidStoreActionType(firstAct.actionType)
        ? firstAct.actionType
        : "set";
      return {
        actionId: firstAct.id,
        actionName: firstAct.name,
        actionType,
        targetFieldId: firstAct.targetFieldId,
        targetFieldName: firstAct.targetFieldName,
      };
    }
  }

  const fallbackFirstField =
    Array.isArray(storeFields) && storeFields.length > 0
      ? storeFields[0]
      : undefined;
  if (fallbackFirstField) {
    const cap = fallbackFirstField.name.charAt(0).toUpperCase() + fallbackFirstField.name.slice(1);
    return {
      actionId: `setter-${fallbackFirstField.id}`,
      actionName: `set${cap}`,
      actionType: "set",
      targetFieldId: fallbackFirstField.id,
      targetFieldName: fallbackFirstField.name,
    };
  }

  return {
    actionId: "builtin-mutate",
    actionName: "set",
    actionType: "set",
  };
}

function findAllMatchingEdgesForAction(
  pageNodeId: string,
  action: UIEventItem,
  allNodes: readonly BackendNode[],
  allEdges: readonly BackendEdge[],
): Array<{ edge: BackendEdge; storeNode: BackendNode; storeHandle: string | null | undefined }> {
  const matches: Array<{ edge: BackendEdge; storeNode: BackendNode; storeHandle: string | null | undefined }> = [];

  // First pass: look for exact action handle matches (highest priority)
  for (const edge of allEdges) {
    // Direction A: Store -> Page
    if (edge.target === pageNodeId) {
      const targetActionId = extractActionIdFromHandle(edge.targetHandle);
      if (targetActionId === action.id) {
        const storeNode = allNodes.find((n) => n.id === edge.source && n.type === "state_store");
        if (storeNode) {
          matches.push({ edge, storeNode, storeHandle: edge.sourceHandle });
        }
      }
    }

    // Direction B: Page -> Store
    if (edge.source === pageNodeId) {
      const sourceActionId = extractActionIdFromHandle(edge.sourceHandle);
      if (sourceActionId === action.id) {
        const storeNode = allNodes.find((n) => n.id === edge.target && n.type === "state_store");
        if (storeNode) {
          matches.push({ edge, storeNode, storeHandle: edge.targetHandle });
        }
      }
    }
  }

  if (matches.length > 0) {
    return matches;
  }

  // Second pass: page-level lifecycle matching (fallback)
  const isPageLoad =
    action.event === "pageLoad" ||
    action.event === "mount" ||
    action.event === "onMount" ||
    action.name === "pageLoad" ||
    action.name === "mount" ||
    action.name === "onMount";
  const isUnmount = action.event === "unmount" || action.name === "unmount";

  if (isPageLoad || isUnmount) {
    for (const edge of allEdges) {
      // Direction A: Store -> Page
      if (edge.target === pageNodeId) {
        const targetActionId = extractActionIdFromHandle(edge.targetHandle);
        if (!targetActionId) {
          const storeNode = allNodes.find((n) => n.id === edge.source && n.type === "state_store");
          if (storeNode) {
            const sh = edge.sourceHandle || "";
            if (isPageLoad && (sh.startsWith("populate") || sh === "load")) {
              matches.push({ edge, storeNode, storeHandle: edge.sourceHandle });
            }
            if (isUnmount && (sh.startsWith("reset") || sh === "unmount")) {
              matches.push({ edge, storeNode, storeHandle: edge.sourceHandle });
            }
          }
        }
      }

      // Direction B: Page -> Store
      if (edge.source === pageNodeId) {
        const sourceActionId = extractActionIdFromHandle(edge.sourceHandle);
        if (!sourceActionId) {
          const storeNode = allNodes.find((n) => n.id === edge.target && n.type === "state_store");
          if (storeNode) {
            const th = edge.targetHandle || "";
            if (isPageLoad && (th.startsWith("populate") || th === "load")) {
              matches.push({ edge, storeNode, storeHandle: edge.targetHandle });
            }
            if (isUnmount && (th.startsWith("reset") || th === "unmount")) {
              matches.push({ edge, storeNode, storeHandle: edge.targetHandle });
            }
          }
        }
      }
    }
  }

  return matches;
}

function resolveStoreBindingsFromActionSteps(
  act: UIEventItem,
  allNodes: readonly BackendNode[],
): StoreActionBinding[] {
  if (!Array.isArray(act.actionSteps) || act.actionSteps.length === 0) {
    return [];
  }

  const stateMutationSteps = act.actionSteps.filter((s) => s.type === "state_mutation");
  if (stateMutationSteps.length === 0) {
    return [];
  }

  const stateStoreNodes = allNodes.filter((n) => n.type === "state_store");
  const bindings: StoreActionBinding[] = [];

  for (const step of stateMutationSteps) {
    let storeNode: BackendNode | undefined;
    if (step.stateStoreNodeId) {
      storeNode = stateStoreNodes.find((n) => n.id === step.stateStoreNodeId);
    }
    if (!storeNode && step.stateKey) {
      storeNode = stateStoreNodes.find((n) =>
        (Array.isArray(n.data?.fields) ? n.data.fields : []).some(
          (f: GlobalStoreField) => f.name === step.stateKey || f.id === step.stateTargetFieldId,
        ),
      );
    }
    if (!storeNode && stateStoreNodes.length === 1) {
      storeNode = stateStoreNodes[0];
    }
    if (!storeNode && stateStoreNodes.length > 0) {
      storeNode = stateStoreNodes[0];
    }

    const storeName = storeNode?.data?.storeName || storeNode?.data?.label || "App";
    const storeFields: GlobalStoreField[] = Array.isArray(storeNode?.data?.fields) ? storeNode.data.fields : [];
    const storeActions: GlobalStoreAction[] = Array.isArray(storeNode?.data?.actions) ? storeNode.data.actions : [];

    const matchedField = storeFields.find(
      (f: GlobalStoreField) =>
        (step.stateTargetFieldId && f.id === step.stateTargetFieldId) ||
        (step.stateKey && f.name === step.stateKey),
    );

    const targetFieldId = matchedField?.id || step.stateTargetFieldId;
    const targetFieldName = matchedField?.name || step.stateKey;
    const inferredType = isArrayTargetField(undefined, targetFieldName, step.stateReducerName || step.stateActionName)
      ? "array"
      : undefined;
    const targetFieldType = matchedField?.type
      ? matchedField.isArray
        ? (matchedField.type.endsWith("[]") ? matchedField.type : `${matchedField.type}[]`)
        : matchedField.type
      : inferredType;

    const rawAction = step.stateActionName || step.stateUpdateType || "set";
    const actionType: StoreActionType = isValidStoreActionType(rawAction) ? rawAction : "set";

    let actionName: string;
    if (
      step.stateActionName &&
      step.stateActionName !== "set" &&
      step.stateActionName !== "mutate"
    ) {
      actionName = step.stateActionName;
    } else if (targetFieldName) {
      const cap = targetFieldName.charAt(0).toUpperCase() + targetFieldName.slice(1);
      switch (actionType) {
        case "append":
          actionName = `append${cap}`;
          break;
        case "prepend":
          actionName = `prepend${cap}`;
          break;
        case "pop":
          actionName = `pop${cap}`;
          break;
        case "remove":
          actionName = `remove${cap}`;
          break;
        case "toggle":
          actionName = `toggle${cap}`;
          break;
        case "increment":
          actionName = `increment${cap}`;
          break;
        case "decrement":
          actionName = `decrement${cap}`;
          break;
        case "update":
          actionName = `update${cap}`;
          break;
        case "reset":
          actionName = `reset${cap}`;
          break;
        default:
          actionName = `set${cap}`;
          break;
      }
    } else {
      actionName = "set";
    }

    const matchedStoreAction = storeActions.find(
      (a: GlobalStoreAction) =>
        (targetFieldId && a.targetFieldId === targetFieldId && (a.actionType === actionType || a.name?.toLowerCase() === actionName.toLowerCase())) ||
        a.name?.toLowerCase() === actionName.toLowerCase(),
    );

    const actionId = matchedStoreAction?.id || step.id || `field-${actionType}-${targetFieldId || targetFieldName || "var"}`;
    const resolvedActionName = matchedStoreAction?.name || actionName;

    // Resolve updateSource, valuePath, customValue from stateValueSource
    let updateSource: StoreActionBinding["updateSource"] = "response";
    let valuePath: string | undefined = undefined;
    let customValue: string | undefined = undefined;

    if (actionType === "reset") {
      updateSource = "direct";
    } else if (step.stateValueSource) {
      const src = step.stateValueSource;
      if (src.kind === "prev_response") {
        if (src.fieldPath && src.fieldPath.trim()) {
          updateSource = "response_property";
          valuePath = src.fieldPath.trim();
        } else {
          updateSource = "response";
        }
      } else if (src.kind === "literal") {
        updateSource = "static";
        customValue = src.value;
      } else if (src.kind === "user_input") {
        updateSource = "payload";
        valuePath = src.fieldName;
      } else if (src.kind === "route_param" || src.kind === "query_param") {
        updateSource = "payload";
        valuePath = src.paramName;
      } else if (src.kind === "state_var") {
        updateSource = "payload";
        valuePath = src.stateKey || src.fieldPath;
      } else if (src.kind === "realtime_payload") {
        updateSource = src.fieldPath ? "nested_property" : "full_message";
        valuePath = src.fieldPath;
      }
    }

    bindings.push({
      id: `bnd-${act.id}-${step.id}`,
      storeNodeId: storeNode?.id || step.stateStoreNodeId || "App",
      storeName,
      actionId,
      actionName: resolvedActionName,
      actionType,
      targetFieldId,
      targetFieldName,
      targetFieldType,
      updateSource,
      valuePath,
      customValue,
    });
  }

  return bindings;
}

function resolveActionWithBindings(
  pageNodeId: string,
  act: UIEventItem,
  allNodes: readonly BackendNode[],
  allEdges: readonly BackendEdge[],
): { action: UIEventItem; changed: boolean } {
  const matches = findAllMatchingEdgesForAction(pageNodeId, act, allNodes, allEdges);
  const stepBindings = resolveStoreBindingsFromActionSteps(act, allNodes);

  if (matches.length > 0) {
    const consumedStepIndices = new Set<number>();

    const resolvedBindings: StoreActionBinding[] = matches.map((match, mIdx) => {
      const storeNode = match.storeNode;
      const storeName = storeNode.data?.storeName || storeNode.data?.label || "App";
      const inferred = resolveStoreBindingFromHandle(storeNode, match.storeHandle, act, match.edge);

      const matchingStepBindingIdx = stepBindings.findIndex(
        (sb, idx) =>
          !consumedStepIndices.has(idx) &&
          (sb.storeNodeId === storeNode.id || !sb.storeNodeId) &&
          ((inferred.targetFieldId && sb.targetFieldId === inferred.targetFieldId) ||
            (inferred.targetFieldName && sb.targetFieldName === inferred.targetFieldName) ||
            (!inferred.targetFieldId && !inferred.targetFieldName)),
      );

      const matchingStepBinding = matchingStepBindingIdx >= 0
        ? (consumedStepIndices.add(matchingStepBindingIdx), stepBindings[matchingStepBindingIdx])
        : undefined;

      const edgeData = match.edge.data;
      const existing =
        (act.storeActionBindings || []).find(
          (b) =>
            (edgeData?.bindingId && b.id === edgeData.bindingId) ||
            (b.storeNodeId === storeNode.id &&
              (b.actionId === inferred.actionId ||
                b.actionName === inferred.actionName ||
                (b.targetFieldId && b.targetFieldId === inferred.targetFieldId) ||
                (b.targetFieldName && b.targetFieldName === inferred.targetFieldName))),
        ) || (mIdx === 0 ? act.storeActionBinding : undefined);

      const resolvedActionName =
        matchingStepBinding?.actionName ||
        (existing?.actionName && existing.actionName !== "set" && existing.actionName !== "mutate"
          ? existing.actionName
          : inferred.actionName);

      const storeFields = storeNode.data?.fields || [];
      const resolvedFieldType =
        matchingStepBinding?.targetFieldType ||
        existing?.targetFieldType ||
        inferred.targetFieldType ||
        storeFields.find(
          (f) =>
            (inferred.targetFieldId && f.id === inferred.targetFieldId) ||
            (inferred.targetFieldName && f.name === inferred.targetFieldName) ||
            (existing?.targetFieldId && f.id === existing.targetFieldId) ||
            (existing?.targetFieldName && f.name === existing.targetFieldName),
        )?.type;

      return {
        id: existing?.id || edgeData?.bindingId || matchingStepBinding?.id || `bnd-${act.id}-${mIdx}`,
        storeNodeId: storeNode.id,
        storeName: matchingStepBinding?.storeName || storeName,
        actionId: matchingStepBinding?.actionId || existing?.actionId || inferred.actionId,
        actionName: resolvedActionName,
        actionType: matchingStepBinding?.actionType || existing?.actionType || inferred.actionType,
        targetFieldId: matchingStepBinding?.targetFieldId || existing?.targetFieldId || inferred.targetFieldId,
        targetFieldName: matchingStepBinding?.targetFieldName || existing?.targetFieldName || inferred.targetFieldName,
        targetFieldType: resolvedFieldType,
        updateSource:
          matchingStepBinding?.updateSource ||
          existing?.updateSource ||
          (inferred.actionType === "reset" ? "direct" : "response"),
        valuePath:
          matchingStepBinding?.valuePath !== undefined ? matchingStepBinding.valuePath : existing?.valuePath,
        customValue:
          matchingStepBinding?.customValue !== undefined ? matchingStepBinding.customValue : existing?.customValue,
        parameterMappings: existing?.parameterMappings || matchingStepBinding?.parameterMappings,
      };
    });

    stepBindings.forEach((sb, idx) => {
      if (!consumedStepIndices.has(idx)) {
        resolvedBindings.push(sb);
      }
    });

    return {
      action: {
        ...act,
        storeActionBinding: resolvedBindings[0],
        storeActionBindings: resolvedBindings,
      },
      changed: true,
    };
  }

  // If no canvas edges matched, check if stepBindings were found from act.actionSteps
  if (stepBindings.length > 0) {
    return {
      action: {
        ...act,
        storeActionBinding: stepBindings[0],
        storeActionBindings: stepBindings,
      },
      changed: true,
    };
  }

  // If no canvas edges matched and no stepBindings, ensure storeActionBindings and storeActionBinding are in sync
  if (Array.isArray(act.storeActionBindings) && act.storeActionBindings.length > 0) {
    if (!act.storeActionBinding) {
      return {
        action: {
          ...act,
          storeActionBinding: act.storeActionBindings[0],
        },
        changed: true,
      };
    }
  } else if (act.storeActionBinding && !act.storeActionBindings?.length) {
    return {
      action: {
        ...act,
        storeActionBindings: [act.storeActionBinding],
      },
      changed: true,
    };
  }

  return { action: act, changed: false };
}

/**
 * Resolves canvas edges between StateStoreNode handles and WebPageNode action handles,
 * enriching webClientNodes actions with storeActionBinding without requiring manual sidebar entry.
 */
export function resolveStoreActionBindings(
  webClientNodes: readonly BackendNode[],
  allNodes: readonly BackendNode[] = [],
  allEdges: readonly BackendEdge[] = [],
): BackendNode[] {
  return webClientNodes.map((node) => {
    let hasChanges = false;

    // 1. Process sections
    const rawSections = node.data?.sections;
    const nextSections = Array.isArray(rawSections)
      ? rawSections.map((sec) => {
          let sectionChanged = false;
          const nextActions = (sec.actions || []).map((act) => {
            const { action: resolvedAct, changed } = resolveActionWithBindings(
              node.id,
              act,
              allNodes,
              allEdges,
            );
            if (changed) {
              sectionChanged = true;
            }
            return resolvedAct;
          });

          if (sectionChanged) {
            hasChanges = true;
            return {
              ...sec,
              actions: nextActions,
            };
          }
          return sec;
        })
      : rawSections;

    // 2. Process node.data.events (if present)
    const rawEvents = node.data?.events;
    const nextEvents = Array.isArray(rawEvents)
      ? rawEvents.map((evt) => {
          const { action: resolvedEvt, changed } = resolveActionWithBindings(
            node.id,
            evt,
            allNodes,
            allEdges,
          );
          if (changed) {
            hasChanges = true;
          }
          return resolvedEvt;
        })
      : rawEvents;

    // 3. Process realtimeConnections (if present)
    const rawRealtime = node.data?.realtimeConnections;
    const nextRealtime = Array.isArray(rawRealtime)
      ? rawRealtime.map((conn) => {
          // Check if edge connects this realtime connection to a state_store
          const matchEdges = allEdges.filter(
            (e) =>
              (e.source === node.id &&
                (e.sourceHandle === `rtc-out-${conn.id}` || e.sourceHandle === `rtc-in-${conn.id}`)) ||
              (e.target === node.id &&
                (e.targetHandle === `rtc-out-${conn.id}` || e.targetHandle === `rtc-in-${conn.id}`)),
          );

          if (matchEdges.length > 0) {
            const resolvedBindings: StoreActionBinding[] = matchEdges.map((matchEdge, mIdx) => {
              const isSource = matchEdge.source === node.id;
              const storeNodeId = isSource ? matchEdge.target : matchEdge.source;
              const storeHandle = isSource ? matchEdge.targetHandle : matchEdge.sourceHandle;
              const storeNode = allNodes.find((n) => n.id === storeNodeId && n.type === "state_store");

              const storeName = storeNode?.data?.storeName || storeNode?.data?.label || "App";
              const fakeAction: UIEventItem = {
                id: conn.id,
                name: conn.eventName || "message",
                event: "message",
              };
              const binding = storeNode
                ? resolveStoreBindingFromHandle(storeNode, storeHandle, fakeAction, matchEdge)
                : {
                    actionId: "custom",
                    actionName: "message",
                    actionType: "custom" as const,
                  };

              const edgeData = matchEdge.data;
              const existing =
                (conn.storeActionBindings || []).find(
                  (b) =>
                    (edgeData?.bindingId && b.id === edgeData.bindingId) ||
                    (b.storeNodeId === storeNodeId &&
                      (b.actionId === binding.actionId || b.actionName === binding.actionName)),
                ) || (mIdx === 0 ? conn.storeActionBinding : undefined);

              return {
                id: existing?.id || edgeData?.bindingId || `bnd-rtc-${conn.id}-${mIdx}`,
                storeNodeId,
                storeName,
                actionId: existing?.actionId || binding.actionId,
                actionName: existing?.actionName || binding.actionName,
                actionType: existing?.actionType || binding.actionType,
                targetFieldId: existing?.targetFieldId || binding.targetFieldId,
                targetFieldName: existing?.targetFieldName || binding.targetFieldName,
                updateSource: existing?.updateSource || "full_message",
                valuePath: existing?.valuePath,
                customValue: existing?.customValue,
                parameterMappings: existing?.parameterMappings,
              };
            });

            hasChanges = true;
            return {
              ...conn,
              storeActionBinding: resolvedBindings[0],
              storeActionBindings: resolvedBindings,
            };
          }

          if (Array.isArray(conn.storeActionBindings) && conn.storeActionBindings.length > 0) {
            if (!conn.storeActionBinding) {
              hasChanges = true;
              return {
                ...conn,
                storeActionBinding: conn.storeActionBindings[0],
              };
            }
          } else if (conn.storeActionBinding && !conn.storeActionBindings?.length) {
            hasChanges = true;
            return {
              ...conn,
              storeActionBindings: [conn.storeActionBinding],
            };
          }

          return conn;
        })
      : rawRealtime;

    if (!hasChanges) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        sections: nextSections,
        events: nextEvents,
        realtimeConnections: nextRealtime,
      },
    };
  });
}

export function resolveStoreActionMethodName(binding: {
  actionName?: string;
  actionType?: StoreActionType | string;
  targetFieldName?: string;
}): string {
  if (binding.actionName && binding.actionName !== "set" && binding.actionName !== "mutate") {
    return binding.actionName;
  }
  if (binding.targetFieldName) {
    const cap = binding.targetFieldName.charAt(0).toUpperCase() + binding.targetFieldName.slice(1);
    switch (binding.actionType) {
      case "append":
        return `append${cap}`;
      case "prepend":
        return `prepend${cap}`;
      case "pop":
        return `pop${cap}`;
      case "remove":
        return `remove${cap}`;
      case "toggle":
        return `toggle${cap}`;
      case "increment":
        return `increment${cap}`;
      case "decrement":
        return `decrement${cap}`;
      case "update":
        return `update${cap}`;
      case "reset":
        return `reset${cap}`;
      default:
        return `set${cap}`;
    }
  }
  if (binding.actionType === "reset") return "reset";
  if (binding.actionType === "populate") return "populate";
  return binding.actionName || "set";
}
