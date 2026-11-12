import { BackendEdge, PageSection, UIEventItem } from "@/types/canvas";
import {
  FrontendActionStepDraft,
  RealtimeConnection,
} from "@workspace/canvas/types";
import { EdgeCleanupContext } from "../types";

/**
 * Handles edge cleanup for WebPage actions, events, realtime connections,
 * sequence renumbering, and WebPage <-> StateStore action bindings.
 */
export function cleanWebPageEdge(
  edge: BackendEdge,
  ctx: EdgeCleanupContext,
): void {
  // 1. WebPage Action / Event edge cleanup: remove actionSteps & storageOperationBinding
  const isSourceAction = Boolean(
    edge.sourceHandle?.startsWith("events-") ||
      edge.sourceHandle?.startsWith("event-in-") ||
      edge.sourceHandle?.startsWith("pageload-in-") ||
      edge.sourceHandle?.startsWith("mount-in-") ||
      edge.sourceHandle?.startsWith("onmount-in-") ||
      edge.sourceHandle?.startsWith("unmount-in-") ||
      edge.sourceHandle?.startsWith("interval-in-") ||
      edge.sourceHandle?.startsWith("effect-in-") ||
      edge.sourceHandle?.startsWith("action-in-"),
  );
  const isTargetAction = Boolean(
    edge.targetHandle?.startsWith("events-") ||
      edge.targetHandle?.startsWith("event-in-") ||
      edge.targetHandle?.startsWith("pageload-in-") ||
      edge.targetHandle?.startsWith("mount-in-") ||
      edge.targetHandle?.startsWith("onmount-in-") ||
      edge.targetHandle?.startsWith("unmount-in-") ||
      edge.targetHandle?.startsWith("interval-in-") ||
      edge.targetHandle?.startsWith("effect-in-") ||
      edge.targetHandle?.startsWith("action-in-"),
  );

  if (isSourceAction || isTargetAction) {
    const isSrc = isSourceAction;
    const webPageNodeId = isSrc ? edge.source : edge.target;
    const otherNodeId = isSrc ? edge.target : edge.source;
    const otherNode =
      ctx.currentState.nodes.find((n) => n.id === otherNodeId) ||
      ctx.nextNodes.find((n) => n.id === otherNodeId);
    const webHandle = isSrc ? edge.sourceHandle! : edge.targetHandle!;
    const otherHandle = isSrc
      ? (edge.targetHandle ?? "")
      : (edge.sourceHandle ?? "");

    const actionId = webHandle.replace(
      /^(?:events-|event-in-|pageload-in-|mount-in-|onmount-in-|unmount-in-|interval-in-|effect-in-|action-in-)/,
      "",
    );
    const otherEpId = otherHandle
      .replace(/^(?:routeEndpoints|endpoints|endpoint)-(?:in|out)-/, "")
      .replace(/^func-(?:in-)?/, "");

    const wpNode = ctx.nextNodes.find((n) => n.id === webPageNodeId);
    if (wpNode && wpNode.type === "webPage") {
      let wpChanged = false;

      const cleanupSteps = (existingSteps: FrontendActionStepDraft[] = []) => {
        const filtered = existingSteps.filter((s) => {
          // 1. Direct edgeId match
          if (s.edgeId && s.edgeId === edge.id) return false;

          // 2. Target service & endpoint match
          if (
            s.type === "api_call" &&
            s.serviceNodeId === otherNodeId &&
            (s.endpointId === otherEpId ||
              otherHandle.includes(s.endpointId || "") ||
              s.endpointId === edge.targetResourceId ||
              s.endpointId === edge.sourceResourceId)
          ) {
            return false;
          }

          // 3. Storage ref / bucket match
          if (
            s.type === "storage_put" &&
            (s.storageRefNodeId === otherNodeId ||
              s.storageNodeId === otherNodeId)
          ) {
            return false;
          }

          // 4. Transformer match
          if (s.type === "transform") {
            if (s.edgeId && s.edgeId === edge.id) return false;
            if (
              s.transformerRefNodeId === otherNodeId ||
              s.transformerNodeId === otherNodeId
            ) {
              return false;
            }
            if (
              otherNode &&
              (otherNode.type === "transformer_ref" ||
                otherNode.type === "transformer")
            ) {
              const masterRef =
                otherNode.data?.transformerRef || otherNode.id;
              const fnName =
                otherNode.data?.functionName ||
                otherNode.data?.label?.replace(/\s*\(Ref\)$/, "");
              if (
                s.transformerNodeId &&
                (s.transformerNodeId === masterRef ||
                  s.transformerNodeId === fnName)
              ) {
                return false;
              }
              if (
                s.transformerName &&
                (s.transformerName === fnName ||
                  s.transformerName === otherNode.data?.label)
              ) {
                return false;
              }
              if (
                s.functionRef?.name &&
                (s.functionRef.name === fnName ||
                  s.functionRef.name === masterRef)
              ) {
                return false;
              }
            }
          }

          // 5. Browser storage match
          if (
            s.type === "browser_storage" &&
            s.browserStorageNodeId === otherNodeId
          ) {
            return false;
          }

          return true;
        });

        if (filtered.length !== existingSteps.length) {
          wpChanged = true;
          // Renumber remaining steps
          return filtered.map((s, idx) => ({ ...s, order: idx + 1 }));
        }
        return existingSteps;
      };

      let nextSections = wpNode.data?.sections as PageSection[] | undefined;
      if (nextSections) {
        nextSections = nextSections.map((sec) => ({
          ...sec,
          actions: (sec.actions || []).map((act) => {
            if (act.id === actionId) {
              const updatedSteps = cleanupSteps(act.actionSteps);
              const updatedAct: UIEventItem = {
                ...act,
                actionSteps: updatedSteps,
              };
              if (
                act.storageOperationBinding &&
                (act.storageOperationBinding.refNodeId === otherNodeId ||
                  act.storageOperationBinding.storageNodeId === otherNodeId)
              ) {
                wpChanged = true;
                delete (updatedAct as { storageOperationBinding?: unknown })
                  .storageOperationBinding;
              }
              return updatedAct;
            }
            return act;
          }),
        }));
      }

      let nextWpEvents = wpNode.data?.events as UIEventItem[] | undefined;
      if (nextWpEvents) {
        nextWpEvents = nextWpEvents.map((evt) => {
          if (evt.id === actionId) {
            const updatedSteps = cleanupSteps(evt.actionSteps);
            return { ...evt, actionSteps: updatedSteps };
          }
          return evt;
        });
      }

      let nextWpRealtime: RealtimeConnection[] | undefined =
        wpNode.data?.realtimeConnections;
      if (nextWpRealtime) {
        nextWpRealtime = nextWpRealtime.map(
          (conn: RealtimeConnection): RealtimeConnection => {
            if (conn.id === actionId || !actionId) {
              const currentSteps: FrontendActionStepDraft[] =
                conn.actionSteps || [];
              const updatedSteps: FrontendActionStepDraft[] =
                cleanupSteps(currentSteps);
              if (updatedSteps.length !== currentSteps.length) {
                wpChanged = true;
              }
              return { ...conn, actionSteps: updatedSteps };
            }
            return conn;
          },
        );
      }

      if (wpChanged) {
        ctx.nodesChanged = true;
        const updatedWp = {
          ...wpNode,
          data: {
            ...wpNode.data,
            ...(nextSections ? { sections: nextSections } : {}),
            ...(nextWpEvents ? { events: nextWpEvents } : {}),
            ...(nextWpRealtime ? { realtimeConnections: nextWpRealtime } : {}),
          },
        };
        ctx.nextNodes = ctx.nextNodes.map((n) =>
          n.id === wpNode.id ? updatedWp : n,
        );
        ctx.pendingNodeUpserts.push(updatedWp);
      }
    }

    // If the edge was connected to a transformer_ref, check if that transformer_ref is now orphaned
    if (otherNode && otherNode.type === "transformer_ref") {
      const remainingEdges = ctx.nextEdges.filter(
        (e) =>
          !ctx.removedSet.has(e.id) &&
          e.id !== edge.id &&
          (e.target === otherNode.id || e.source === otherNode.id),
      );
      const onlyRefEdges = remainingEdges.every(
        (e) => e.type === "transformer-reference" || e.type === "reference",
      );
      if (onlyRefEdges) {
        remainingEdges.forEach((re) => {
          ctx.removedSet.add(re.id);
          ctx.additionalRemovedEdgeIds = [
            ...(ctx.additionalRemovedEdgeIds || []),
            re.id,
          ];
        });
        ctx.nextEdges = ctx.nextEdges.filter((e) => !ctx.removedSet.has(e.id));
        ctx.deletedNodeIds = [...(ctx.deletedNodeIds || []), otherNode.id];
        ctx.nextNodes = ctx.nextNodes.filter((n) => n.id !== otherNode.id);
        ctx.pendingNodeUpserts = ctx.pendingNodeUpserts.filter(
          (n) => n.id !== otherNode.id,
        );
        ctx.nodesChanged = true;
      }
    }

    // Renumber remaining action edges for this action handle
    const remainingActionEdges = ctx.nextEdges.filter(
      (e) =>
        ((e.source === webPageNodeId && e.sourceHandle === webHandle) ||
          (e.target === webPageNodeId && e.targetHandle === webHandle)) &&
        !ctx.removedSet.has(e.id),
    );
    if (remainingActionEdges.length > 0) {
      const sorted = [...remainingActionEdges].sort(
        (a, b) =>
          (a.data?.sequenceOrder ?? 99) - (b.data?.sequenceOrder ?? 99),
      );
      const renumberedMap = new Map<string, number>();
      sorted.forEach((e, idx) => {
        renumberedMap.set(e.id, idx + 1);
      });
      ctx.nextEdges = ctx.nextEdges.map((e) => {
        const newOrder = renumberedMap.get(e.id);
        if (
          newOrder !== undefined &&
          (e.data?.sequenceOrder !== newOrder ||
            e.data?.label !== String(newOrder))
        ) {
          const updatedEdge = {
            ...e,
            data: {
              ...e.data,
              label: String(newOrder),
              sequenceOrder: newOrder,
            },
          };
          ctx.pendingEdgeUpserts.push(updatedEdge);
          return updatedEdge;
        }
        return e;
      });
    }
  }

  // 2. WebPage Action / RealtimeConnection -> StateStore edge cleanup
  const edgeSrcNode = ctx.currentState.nodes.find((n) => n.id === edge.source);
  const edgeTgtNode = ctx.currentState.nodes.find((n) => n.id === edge.target);
  const isWebPageToStore =
    (edgeSrcNode?.type === "webPage" && edgeTgtNode?.type === "state_store") ||
    (edgeSrcNode?.type === "state_store" && edgeTgtNode?.type === "webPage");

  if (isWebPageToStore) {
    const pageNode =
      edgeSrcNode?.type === "webPage" ? edgeSrcNode : edgeTgtNode!;
    const storeNode =
      edgeSrcNode?.type === "state_store" ? edgeSrcNode : edgeTgtNode!;
    const isSrcWebPage = edgeSrcNode?.type === "webPage";
    const webHandle = isSrcWebPage ? edge.sourceHandle : edge.targetHandle;

    const isActionHandle =
      Boolean(webHandle?.startsWith("events-")) ||
      Boolean(webHandle?.startsWith("event-in-")) ||
      Boolean(webHandle?.startsWith("pageload-in-")) ||
      Boolean(webHandle?.startsWith("mount-in-")) ||
      Boolean(webHandle?.startsWith("onmount-in-")) ||
      Boolean(webHandle?.startsWith("unmount-in-")) ||
      Boolean(webHandle?.startsWith("interval-in-")) ||
      Boolean(webHandle?.startsWith("effect-in-")) ||
      Boolean(webHandle?.startsWith("action-in-")) ||
      Boolean(webHandle?.startsWith("sse-in-")) ||
      Boolean(webHandle?.startsWith("websocket-in-")) ||
      Boolean(webHandle?.startsWith("ws-in-")) ||
      Boolean(webHandle?.startsWith("webrtc-in-"));

    if (isActionHandle) {
      const actionId = webHandle!.replace(
        /^(events-|event-in-|pageload-in-|mount-in-|onmount-in-|unmount-in-|interval-in-|effect-in-|action-in-|sse-in-|websocket-in-|ws-in-|webrtc-in-)/,
        "",
      );
      const hasOtherActionEdge = ctx.nextEdges.some(
        (e) =>
          e &&
          ((e.source === pageNode.id &&
            e.target === storeNode.id &&
            (e.sourceHandle?.endsWith(`-${actionId}`) ||
              e.sourceHandle === webHandle)) ||
            (e.target === pageNode.id &&
              e.source === storeNode.id &&
              (e.targetHandle?.endsWith(`-${actionId}`) ||
                e.targetHandle === webHandle))),
      );

      if (!hasOtherActionEdge) {
        const livePage = ctx.nextNodes.find((n) => n.id === pageNode.id);
        if (livePage?.data?.sections) {
          let pageModified = false;
          const updatedSections = livePage.data.sections.map((sec: any) => ({
            ...sec,
            actions: (sec.actions || []).map((act: any) => {
              if (
                act.id === actionId &&
                act.storeActionBinding?.storeNodeId === storeNode.id
              ) {
                pageModified = true;
                const { storeActionBinding, ...rest } = act;
                return rest;
              }
              return act;
            }),
          }));

          if (pageModified) {
            ctx.nodesChanged = true;
            const updatedPage = {
              ...livePage,
              data: { ...livePage.data, sections: updatedSections },
            };
            ctx.nextNodes = ctx.nextNodes.map((n) =>
              n.id === pageNode.id ? updatedPage : n,
            );
            ctx.pendingNodeUpserts.push(updatedPage);
          }
        }
      }
    } else if (webHandle?.startsWith("rtc-")) {
      const connId = webHandle.replace(/^rtc-(out|in)-/, "");
      const hasOtherRtcEdge = ctx.nextEdges.some(
        (e) =>
          e &&
          ((e.source === pageNode.id &&
            e.target === storeNode.id &&
            (e.sourceHandle === `rtc-out-${connId}` ||
              e.sourceHandle === `rtc-in-${connId}`)) ||
            (e.target === pageNode.id &&
              e.source === storeNode.id &&
              (e.targetHandle === `rtc-out-${connId}` ||
                e.targetHandle === `rtc-in-${connId}`))),
      );

      if (!hasOtherRtcEdge) {
        const livePage = ctx.nextNodes.find((n) => n.id === pageNode.id);
        if (livePage?.data?.realtimeConnections) {
          let pageModified = false;
          const updatedRtc = livePage.data.realtimeConnections.map((c: any) => {
            if (
              c.id === connId &&
              c.storeActionBinding?.storeNodeId === storeNode.id
            ) {
              pageModified = true;
              const { storeActionBinding, ...rest } = c;
              return rest;
            }
            return c;
          });

          if (pageModified) {
            ctx.nodesChanged = true;
            const updatedPage = {
              ...livePage,
              data: { ...livePage.data, realtimeConnections: updatedRtc },
            };
            ctx.nextNodes = ctx.nextNodes.map((n) =>
              n.id === pageNode.id ? updatedPage : n,
            );
            ctx.pendingNodeUpserts.push(updatedPage);
          }
        }
      }
    }
  }
}
