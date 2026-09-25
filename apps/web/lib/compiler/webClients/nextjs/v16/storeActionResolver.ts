import { BackendNode, BackendEdge } from "@/types/canvas";
import { UIEventItem, StoreActionBinding } from "@workspace/canvas/types";

export type StoreActionType =
  | "set"
  | "append"
  | "pop"
  | "remove"
  | "toggle"
  | "increment"
  | "reset"
  | "populate"
  | "custom"
  | "mutate";

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

function isValidStoreActionType(val: string | undefined): val is StoreActionType {
  return (
    val === "set" ||
    val === "append" ||
    val === "pop" ||
    val === "remove" ||
    val === "toggle" ||
    val === "increment" ||
    val === "reset" ||
    val === "populate" ||
    val === "custom" ||
    val === "mutate"
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
): { actionId: string; actionName: string; actionType: StoreActionType; targetFieldId?: string; targetFieldName?: string } {
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
        return {
          actionId: found.id,
          actionName: found.name,
          actionType,
          targetFieldId: found.targetFieldId,
          targetFieldName: found.targetFieldName,
        };
      }
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
      actionId: "builtin-mutate",
      actionName: setterName,
      actionType: "set",
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
  if (pageAction.event === "pageLoad" || pageAction.name === "pageLoad") {
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
      };
    }
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
  const isPageLoad = action.event === "pageLoad" || action.name === "pageLoad";
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

function resolveActionWithBindings(
  pageNodeId: string,
  act: UIEventItem,
  allNodes: readonly BackendNode[],
  allEdges: readonly BackendEdge[],
): { action: UIEventItem; changed: boolean } {
  const matches = findAllMatchingEdgesForAction(pageNodeId, act, allNodes, allEdges);
  if (matches.length > 0) {
    const resolvedBindings: StoreActionBinding[] = matches.map((match, mIdx) => {
      const storeNode = match.storeNode;
      const storeName = storeNode.data?.storeName || storeNode.data?.label || "App";
      const inferred = resolveStoreBindingFromHandle(storeNode, match.storeHandle, act);

      const edgeData = match.edge.data as Record<string, unknown> | undefined;
      const existing =
        (act.storeActionBindings || []).find(
          (b) =>
            (edgeData?.bindingId && b.id === edgeData.bindingId) ||
            (b.storeNodeId === storeNode.id &&
              (b.actionId === inferred.actionId || b.actionName === inferred.actionName)),
        ) || (mIdx === 0 ? act.storeActionBinding : undefined);

      return {
        id: existing?.id || (edgeData?.bindingId as string) || `bnd-${act.id}-${mIdx}`,
        storeNodeId: storeNode.id,
        storeName,
        actionId: existing?.actionId || inferred.actionId,
        actionName: existing?.actionName || inferred.actionName,
        actionType: (existing?.actionType as any) || inferred.actionType,
        targetFieldId: existing?.targetFieldId || inferred.targetFieldId,
        targetFieldName: existing?.targetFieldName || inferred.targetFieldName,
        updateSource:
          existing?.updateSource || (inferred.actionType === "reset" ? "direct" : "response"),
        valuePath: existing?.valuePath,
        customValue: existing?.customValue,
        parameterMappings: existing?.parameterMappings,
      };
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

  // If no canvas edges matched, ensure storeActionBindings and storeActionBinding are in sync
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
                ? resolveStoreBindingFromHandle(storeNode, storeHandle, fakeAction)
                : {
                    actionId: "custom",
                    actionName: "message",
                    actionType: "custom" as const,
                  };

              const edgeData = matchEdge.data as Record<string, unknown> | undefined;
              const existing =
                (conn.storeActionBindings || []).find(
                  (b) =>
                    (edgeData?.bindingId && b.id === edgeData.bindingId) ||
                    (b.storeNodeId === storeNodeId &&
                      (b.actionId === binding.actionId || b.actionName === binding.actionName)),
                ) || (mIdx === 0 ? conn.storeActionBinding : undefined);

              return {
                id: existing?.id || (edgeData?.bindingId as string) || `bnd-rtc-${conn.id}-${mIdx}`,
                storeNodeId,
                storeName,
                actionId: existing?.actionId || binding.actionId,
                actionName: existing?.actionName || binding.actionName,
                actionType: (existing?.actionType as any) || binding.actionType,
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
