import {
  BackendNode,
  CustomTypeItem,
  GlobalStoreAction,
  GlobalStoreField,
  PageSection,
  PageStateObject,
  RealtimeConnection,
  StoreActionType,
  UIEventItem,
} from "@/types/canvas";
import { generateKeyBetween } from "fractional-indexing";
import { getLastIndex } from "../../utils";
import { ConnectionContext } from "../types";
import { toast } from "sonner";

/**
 * Handles frontend Hook and Component connections to WebPages, Endpoints, or each other.
 * For global hooks/components: ensures 1 ref node per target page, links edges, and prevents tangles.
 *
 * @returns boolean `true` if direct edge was intercepted and handled, `false` otherwise.
 */
export function handleFrontendConnect({
  set,
  get,
  connection,
  sourceNode,
  targetNode,
  newEdge,
}: ConnectionContext): boolean {
  const isGlobalHookSource =
    sourceNode.type === "hook" && sourceNode.data?.scope === "global";
  const isTargetWebPage = targetNode.type === "webPage";

  // Case 1: Global Hook -> WebPage
  if (isGlobalHookSource && isTargetWebPage) {
    const pageId = targetNode.id;
    const currentNodes = get().nodes;
    const currentEdges = get().edges;
    const hookName =
      sourceNode.data?.hookName || sourceNode.data?.label || "useCustomHook";

    const existingRefNode = currentNodes.find(
      (n) =>
        n.type === "hook_ref" &&
        (n.data?.targetPageId === pageId ||
          currentEdges.some(
            (e) => e.source === n.id && e.target === pageId,
          )),
    );

    let refNodeId = existingRefNode?.id;

    if (!refNodeId) {
      refNodeId = crypto.randomUUID();
      const pageX = targetNode.position?.x ?? 0;
      const pageY = targetNode.position?.y ?? 0;

      const newRefNode: BackendNode = {
        id: refNodeId,
        type: "hook_ref",
        position: {
          x: Math.max(0, pageX - 300),
          y: pageY + 30,
        },
        data: {
          label: `${hookName} (Ref)`,
          hookRef: sourceNode.id,
          targetPageId: pageId,
          targetPageIds: [pageId],
          targetWebAppId: targetNode.data?.targetWebAppId,
        },
        fractionalIndex: generateKeyBetween(getLastIndex(currentNodes), null),
      };
      get().addNode(newRefNode);
    } else {
      const currentLiveRef = currentNodes.find((n) => n.id === refNodeId);
      if (currentLiveRef?.data) {
        get().updateNode(refNodeId, {
          data: {
            ...currentLiveRef.data,
            hookRef: sourceNode.id,
            label: `${hookName} (Ref)`,
            targetPageId: pageId,
          },
        });
      }
    }

    // Connect master hook -> ref node (reference edge)
    const masterToRefExists = currentEdges.some(
      (e) =>
        (e.type === "reference" || e.type === "connection") &&
        e.source === sourceNode.id &&
        e.target === refNodeId,
    );
    if (!masterToRefExists) {
      get().addEdge({
        id: `edge-hook-ref-${sourceNode.id}-${refNodeId}`,
        source: sourceNode.id,
        target: refNodeId,
        sourceHandle: "hook-out",
        targetHandle: "hook-in",
        type: "reference",
      });
    }

    // Connect ref node -> webPage (connection edge)
    const refToPageExists = currentEdges.some(
      (e) => e.source === refNodeId && e.target === pageId,
    );
    if (!refToPageExists) {
      get().addEdge({
        id: `edge-hook-page-${refNodeId}-${pageId}`,
        source: refNodeId,
        target: pageId,
        sourceHandle: "hook-out",
        targetHandle: "page-in",
        type: "connection",
      });
    }

    return true; // Intercepted direct global edge
  }

  // Case 2: Endpoint -> Hook (binds endpoint to hook query)
  if (sourceNode.type === "service" && (targetNode.type === "hook" || targetNode.type === "hook_ref")) {
    const targetHandle = connection.targetHandle ?? "";
    const sourceHandle = connection.sourceHandle ?? "";
    const endpointId = sourceHandle.replace(/^endpoint-(in|out)-/, "");

    get().updateNode(targetNode.id, {
      data: {
        ...targetNode.data,
        targetEndpointId: endpointId,
        targetServiceId: sourceNode.id,
      },
    });
  }

  // Case 3: StateStore -> WebPage (binds store field to rendered state in section)
  if (sourceNode.type === "state_store" && targetNode.type === "webPage") {
    const sourceHandle = connection.sourceHandle ?? "";
    const targetHandle = connection.targetHandle ?? "";
    const storeName = sourceNode.data?.label || sourceNode.data?.storeName || "Store";
    const storeFields: GlobalStoreField[] = sourceNode.data?.fields || [];

    if (sourceHandle.startsWith("store-field-out-")) {
      const fieldId = sourceHandle.replace("store-field-out-", "");
      const field = storeFields.find((f: GlobalStoreField) => f.id === fieldId);
      if (field) {
        const sections: PageSection[] = targetNode.data?.sections || [];

        // Scenario A: Target is a specific section-state-in handle
        if (targetHandle.startsWith("section-state-in-")) {
          let matchedSec: PageSection | undefined = undefined;
          let matchedStateId: string | undefined = undefined;

          for (const sec of sections) {
            for (const st of sec.stateObjects || []) {
              if (targetHandle === `section-state-in-${sec.id}-${st.id}`) {
                matchedSec = sec;
                matchedStateId = st.id;
                break;
              }
            }
            if (matchedSec) break;
          }

          if (matchedSec && matchedStateId) {
            const targetSecId = matchedSec.id;
            const targetStateId = matchedStateId;
            const updatedSections: PageSection[] = sections.map((sec: PageSection): PageSection => {
              if (sec.id !== targetSecId) return sec;
              const nextStateObjects: PageStateObject[] = (sec.stateObjects || []).map((st: PageStateObject): PageStateObject => {
                if (st.id === targetStateId) {
                  return {
                    ...st,
                    name: field.name,
                    type: field.type,
                    defaultValue: field.defaultValue,
                    storeId: sourceNode.id,
                    storeName,
                    fieldId: field.id,
                  };
                }
                return st;
              });
              return { ...sec, stateObjects: nextStateObjects };
            });

            get().updateNode(targetNode.id, {
              data: {
                ...targetNode.data,
                sections: updatedSections,
              },
            });
          }
        } else {
          // Scenario B: Dropped on page-in or general page target
          let targetSec = sections[0];
          let updatedSections: PageSection[];

          if (!targetSec) {
            targetSec = {
              id: `sec-${Date.now()}`,
              name: "Main",
              renderMode: "client",
              actions: [],
              stateObjects: [],
            };
            sections.push(targetSec);
          }

          const existingSt = (targetSec.stateObjects || []).find(
            (s: PageStateObject) => s.fieldId === field.id || (s.storeId === sourceNode.id && s.name === field.name),
          );

          let stateId = existingSt?.id;

          if (!existingSt) {
            stateId = `state-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newObj: PageStateObject = {
              id: stateId,
              name: field.name,
              type: field.type,
              defaultValue: field.defaultValue,
              storeId: sourceNode.id,
              storeName,
              fieldId: field.id,
            };

            const activeTargetSecId = targetSec.id;
            updatedSections = sections.map((sec: PageSection): PageSection =>
              sec.id === activeTargetSecId
                ? { ...sec, stateObjects: [...(sec.stateObjects || []), newObj] }
                : sec,
            );

            get().updateNode(targetNode.id, {
              data: {
                ...targetNode.data,
                sections: updatedSections,
              },
            });
          }

          // Retarget edge to specific section-state-in handle
          if (stateId) {
            const specificTargetHandle = `section-state-in-${targetSec.id}-${stateId}`;
            const currentEdges = get().edges;
            const updatedEdges = currentEdges.map((e) =>
              e.id === newEdge.id
                ? {
                    ...e,
                    targetHandle: specificTargetHandle,
                    data: {
                      ...e.data,
                      isStateSubscription: true,
                      storeName,
                      fieldName: field.name,
                    },
                  }
                : e,
            );
            set({ edges: updatedEdges });
          }
        }

        // Enrich newEdge data
        const currentEdges = get().edges;
        const updatedEdges = currentEdges.map((e) =>
          e.id === newEdge.id
            ? {
                ...e,
                data: {
                  ...e.data,
                  isStateSubscription: true,
                  storeName,
                  fieldName: field.name,
                },
              }
            : e,
        );
        set({ edges: updatedEdges });
      }
    }
  }

  // Case 4: TypesNode -> WebPage / StateStore (data contract wiring)
  if (sourceNode.type === "types") {
    const sourceHandle = connection.sourceHandle ?? "";
    const targetHandle = connection.targetHandle ?? "";
    const typeId = sourceHandle.replace(/^type-out-/, "");
    const typesList: CustomTypeItem[] = sourceNode.data?.types || [];
    const typeItem = typesList.find((t: CustomTypeItem) => t.id === typeId);

    if (typeItem) {
      // Subcase 4A: TypesNode -> WebPage (binding type to a section state object)
      if (targetNode.type === "webPage" && targetHandle.startsWith("section-state-in-")) {
        const sections: PageSection[] = targetNode.data?.sections || [];
        const updatedSections: PageSection[] = sections.map((sec: PageSection): PageSection => ({
          ...sec,
          stateObjects: (sec.stateObjects || []).map((st: PageStateObject): PageStateObject => {
            if (targetHandle === `section-state-in-${sec.id}-${st.id}`) {
              const isArray = Boolean(st.type?.endsWith("[]"));
              return {
                ...st,
                type: isArray ? `${typeItem.name}[]` : typeItem.name,
              };
            }
            return st;
          }),
        }));
        get().updateNode(targetNode.id, {
          data: {
            ...targetNode.data,
            sections: updatedSections,
          },
        });
      }

      // Subcase 4B: TypesNode -> StateStore (binding custom type to a store field)
      if (targetNode.type === "state_store" && targetHandle.startsWith("store-field-in-")) {
        const fieldId = targetHandle.replace("store-field-in-", "");
        const fields: GlobalStoreField[] = targetNode.data?.fields || [];
        const updatedFields: GlobalStoreField[] = fields.map((f: GlobalStoreField): GlobalStoreField => {
          if (f.id === fieldId) {
            const isArray = Boolean(f.isArray || f.type?.endsWith("[]"));
            return {
              ...f,
              type: isArray ? `${typeItem.name}[]` : typeItem.name,
            };
          }
          return f;
        });
        get().updateNode(targetNode.id, {
          data: {
            ...targetNode.data,
            fields: updatedFields,
          },
        });
      }
    }
  }

  // Case 5: WebPage <-> StateStore (Action or Real-Time Connection mutates State Store)
  const isWebPageToStateStore =
    (sourceNode.type === "webPage" && targetNode.type === "state_store") ||
    (sourceNode.type === "state_store" && targetNode.type === "webPage");

  if (isWebPageToStateStore) {
    const webPageNode = sourceNode.type === "webPage" ? sourceNode : targetNode;
    const storeNode = sourceNode.type === "state_store" ? sourceNode : targetNode;
    const isForward = sourceNode.type === "webPage";
    const webHandle = isForward ? (connection.sourceHandle ?? "") : (connection.targetHandle ?? "");
    const storeHandle = isForward ? (connection.targetHandle ?? "") : (connection.sourceHandle ?? "");

    // Check if webHandle is an action or realtime connection
    const isActionHandle =
      webHandle.startsWith("events-") ||
      webHandle.startsWith("event-in-") ||
      webHandle.startsWith("pageload-in-") ||
      webHandle.startsWith("action-in-") ||
      webHandle.startsWith("sse-in-") ||
      webHandle.startsWith("websocket-in-") ||
      webHandle.startsWith("ws-in-") ||
      webHandle.startsWith("webrtc-in-");
    const isRealtimeHandle = webHandle.startsWith("rtc-out-") || webHandle.startsWith("rtc-in-");

    if (isActionHandle || isRealtimeHandle) {
      const storeName = storeNode.data?.label || storeNode.data?.storeName || "Store";
      const storeActions: GlobalStoreAction[] = storeNode.data?.actions || [];
      const storeFields: GlobalStoreField[] = storeNode.data?.fields || [];

      // Determine action type and name
      let actionType: StoreActionType = "mutate";
      let actionName = "mutate";
      let actionId: string | undefined = undefined;
      let targetFieldId: string | undefined = undefined;
      let targetFieldName: string | undefined = undefined;

      if (storeHandle === "populate-in" || storeHandle === "populate-in-left" || storeHandle === "populate-out") {
        actionType = "populate";
        actionName = "populate";
      } else if (storeHandle === "reset-in" || storeHandle === "reset-in-left" || storeHandle === "reset-out") {
        actionType = "reset";
        actionName = "reset";
      } else if (
        storeHandle.startsWith("store-action-in-left-") ||
        storeHandle.startsWith("store-action-in-") ||
        storeHandle.startsWith("store-action-out-")
      ) {
        const idPart = storeHandle.replace(/^store-action-(in-left-|in-|out-)/, "");
        const matchedAction = storeActions.find((a: GlobalStoreAction) => a.id === idPart);
        if (matchedAction) {
          actionId = matchedAction.id;
          actionName = matchedAction.name;
          actionType = matchedAction.actionType || "mutate";
          targetFieldId = matchedAction.targetFieldId;
          targetFieldName = matchedAction.targetFieldName;
        }
      } else if (
        storeHandle.startsWith("setter-in-left-") ||
        storeHandle.startsWith("setter-in-") ||
        storeHandle.startsWith("setter-out-") ||
        storeHandle.startsWith("mutate-in-left-") ||
        storeHandle.startsWith("mutate-in-") ||
        storeHandle.startsWith("mutate-out-")
      ) {
        const fId = storeHandle.replace(/^(setter-|mutate-)(in-left-|in-|out-)/, "");
        const matchedField = storeFields.find((f: GlobalStoreField) => f.id === fId);
        if (matchedField) {
          targetFieldId = matchedField.id;
          targetFieldName = matchedField.name;
          const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
          const defaultSetterName = `set${cap}`;
          const setterAction = storeActions.find(
            (a: GlobalStoreAction) =>
              (a.defaultManipulatorType === "setter" && a.targetFieldId === fId) ||
              (a.targetFieldId === fId && a.name.toLowerCase() === defaultSetterName.toLowerCase()),
          );
          if (setterAction) {
            actionId = setterAction.id;
            actionName = setterAction.name;
            actionType = setterAction.actionType || "set";
          } else {
            actionId = `setter-${fId}`;
            actionName = defaultSetterName;
            actionType = "set";
          }
        }
      } else if (
        storeHandle.startsWith("append-in-left-") ||
        storeHandle.startsWith("append-in-") ||
        storeHandle.startsWith("append-out-")
      ) {
        const fId = storeHandle.replace(/^append-(in-left-|in-|out-)/, "");
        const matchedField = storeFields.find((f: GlobalStoreField) => f.id === fId);
        if (matchedField) {
          targetFieldId = matchedField.id;
          targetFieldName = matchedField.name;
          const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
          const defaultAppendName = `append${cap}`;
          const appendAction = storeActions.find(
            (a: GlobalStoreAction) =>
              (a.defaultManipulatorType === "append" && a.targetFieldId === fId) ||
              ((a.name.toLowerCase() === defaultAppendName.toLowerCase() || a.actionType === "append") &&
                (!a.targetFieldId || a.targetFieldId === fId)),
          );
          if (appendAction) {
            actionId = appendAction.id;
            actionName = appendAction.name;
            actionType = appendAction.actionType || "append";
          } else {
            actionId = `append-${fId}`;
            actionName = defaultAppendName;
            actionType = "append";
          }
        }
      } else if (
        storeHandle.startsWith("pop-in-left-") ||
        storeHandle.startsWith("pop-in-") ||
        storeHandle.startsWith("pop-out-")
      ) {
        const fId = storeHandle.replace(/^pop-(in-left-|in-|out-)/, "");
        const matchedField = storeFields.find((f: GlobalStoreField) => f.id === fId);
        if (matchedField) {
          targetFieldId = matchedField.id;
          targetFieldName = matchedField.name;
          const cap = matchedField.name.charAt(0).toUpperCase() + matchedField.name.slice(1);
          const defaultPopName = `pop${cap}`;
          const popAction = storeActions.find(
            (a: GlobalStoreAction) =>
              (a.defaultManipulatorType === "pop" && a.targetFieldId === fId) ||
              (a.name.toLowerCase() === defaultPopName.toLowerCase() &&
                (!a.targetFieldId || a.targetFieldId === fId)),
          );
          if (popAction) {
            actionId = popAction.id;
            actionName = popAction.name;
            actionType = popAction.actionType || "remove";
          } else {
            actionId = `pop-${fId}`;
            actionName = defaultPopName;
            actionType = "remove";
          }
        }
      } else if (storeHandle.startsWith("store-field-in-") || storeHandle.startsWith("store-field-out-")) {
        const fId = storeHandle.replace(/^store-field-(in-|out-)/, "");
        const matchedField = storeFields.find((f: GlobalStoreField) => f.id === fId);
        if (matchedField) {
          targetFieldId = matchedField.id;
          targetFieldName = matchedField.name;
          actionName = `set${matchedField.name.charAt(0).toUpperCase()}${matchedField.name.slice(1)}`;
          actionType = "set";
        }
      } else {
        actionType = "mutate";
        actionName = "mutate";
      }

      if (isActionHandle) {
        const actionIdToBind = webHandle.replace(/^(events-|event-in-|pageload-in-|action-in-|sse-in-|websocket-in-|ws-in-|webrtc-in-)/, "");
        const sections: PageSection[] = webPageNode.data?.sections || [];
        let updatedActionName = "";

        const updatedSections: PageSection[] = sections.map((sec: PageSection): PageSection => ({
          ...sec,
          actions: (sec.actions || []).map((act: UIEventItem): UIEventItem => {
            if (act.id === actionIdToBind) {
              updatedActionName = act.name || "Action";
              return {
                ...act,
                storeActionBinding: {
                  storeNodeId: storeNode.id,
                  storeName,
                  actionId,
                  actionName,
                  actionType,
                  targetFieldId,
                  targetFieldName,
                  updateSource: "response",
                },
              };
            }
            return act;
          }),
        }));

        get().updateNode(webPageNode.id, {
          data: {
            ...webPageNode.data,
            sections: updatedSections,
          },
        });

        // Normalize edge direction: always from StateStore (source) to WebPage action (target)
        const targetAction = sections.flatMap((sec: PageSection) => sec.actions || []).find((a: UIEventItem) => a.id === actionIdToBind);
        const isPageLoad = targetAction?.event === "pageLoad" || targetAction?.name === "pageLoad";
        const normalizedTargetHandle = isPageLoad ? `pageload-in-${actionIdToBind}` : `event-in-${actionIdToBind}`;
        const normalizedSourceHandle =
          actionType === "populate"
            ? "populate-out"
            : actionType === "reset"
            ? "reset-out"
            : actionType === "append" && targetFieldId
            ? `append-out-${targetFieldId}`
            : actionType === "remove" && targetFieldId
            ? `pop-out-${targetFieldId}`
            : targetFieldId
            ? `setter-out-${targetFieldId}`
            : actionId && !actionId.startsWith("builtin-")
            ? `store-action-out-${actionId}`
            : "mutate-out";

        const currentEdges = get().edges;
        const updatedEdges = currentEdges.map((e) =>
          e.id === newEdge.id
            ? {
                ...e,
                source: storeNode.id,
                target: webPageNode.id,
                sourceHandle: normalizedSourceHandle,
                targetHandle: normalizedTargetHandle,
                data: {
                  ...e.data,
                  isStoreAction: true,
                  isStoreActionBinding: true,
                  storeName,
                  actionName,
                },
              }
            : e,
        );
        set({ edges: updatedEdges });

        toast.success(`Action "${updatedActionName}" bound to update ${storeName}.${actionName}()`);
        return true;
      }

      if (isRealtimeHandle) {
        const connIdToBind = webHandle.replace(/^rtc-(out|in)-/, "");
        const rtcList: RealtimeConnection[] = webPageNode.data?.realtimeConnections || [];
        let updatedConnName = "";

        const updatedRtcList: RealtimeConnection[] = rtcList.map((c: RealtimeConnection): RealtimeConnection => {
          if (c.id === connIdToBind) {
            updatedConnName = c.eventName || c.description || "Realtime connection";
            return {
              ...c,
              storeActionBinding: {
                storeNodeId: storeNode.id,
                storeName,
                actionId,
                actionName,
                actionType,
                targetFieldId,
                targetFieldName,
                updateSource: "full_message",
              },
            };
          }
          return c;
        });

        get().updateNode(webPageNode.id, {
          data: {
            ...webPageNode.data,
            realtimeConnections: updatedRtcList,
          },
        });

        const currentEdges = get().edges;
        const updatedEdges = currentEdges.map((e) =>
          e.id === newEdge.id
            ? {
                ...e,
                data: {
                  ...e.data,
                  isStoreActionBinding: true,
                  storeName,
                  actionName,
                },
              }
            : e,
        );
        set({ edges: updatedEdges });

        toast.success(`Realtime listener "${updatedConnName}" bound to update ${storeName}.${actionName}()`);
        return true;
      }
    }
  }

  return false;
}
