import { BackendNode, BackendEdge } from "@/types/canvas";
import { BROKER_RESOURCE_KEYS } from "@workspace/canvas/constants";
import { generateKeyBetween } from "fractional-indexing";
import { getLastIndex } from "../utils";
import { NodeEdgeSyncResult } from "./types";

function getBrokerResourceList(
  data: BackendNode["data"] | undefined,
  key: (typeof BROKER_RESOURCE_KEYS)[number],
): Array<{ id: string }> {
  if (!data) return [];
  switch (key) {
    case "topics":
      return data.topics || [];
    case "streams":
      return data.streams || [];
    case "queues":
      return data.queues || [];
    case "channels":
      return data.channels || [];
    case "caches":
      return data.caches || [];
    case "buckets":
      return data.buckets || [];
  }
}

/**
 * Synchronizes canvas edges in response to node data updates (publishedEvents,
 * consumedEvents, foreign key columns, and broker resources).
 */
export function syncNodeDropdownEdges(
  id: string,
  updatedNode: BackendNode,
  changes: Partial<BackendNode>,
  currentEdges: BackendEdge[],
  nextNodes: BackendNode[],
): NodeEdgeSyncResult {
  let nextEdges = [...currentEdges];
  let edgesChanged = false;
  const newPendingEdgeRemovals: string[] = [];
  const newPendingEdgeUpserts: BackendEdge[] = [];

  // 1. Published Events -> Edges
  if (changes.data?.publishedEvents) {
    const existingPublishEdges = nextEdges.filter(
      (e) =>
        e.source === id && e.sourceHandle?.startsWith("publishedEvents-out-"),
    );
    const currentEvents = changes.data.publishedEvents;

    existingPublishEdges.forEach((edge) => {
      const eventId = edge.sourceHandle?.replace("publishedEvents-out-", "");
      const ev = currentEvents.find((e) => e.id === eventId);
      if (!ev || ev.targetNodeId !== edge.target || ev.targetNodeId === "none") {
        nextEdges = nextEdges.filter((e) => e.id !== edge.id);
        edgesChanged = true;
        newPendingEdgeRemovals.push(edge.id);
      }
    });

    currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
      if (ev.targetNodeId && ev.targetNodeId !== "none") {
        const hasEdge = existingPublishEdges.some(
          (e) =>
            e.sourceHandle === `publishedEvents-out-${ev.id}` &&
            e.target === ev.targetNodeId,
        );
        if (!hasEdge) {
          const lastEdgeIndex = getLastIndex(nextEdges);
          const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
          const newEdge: BackendEdge = {
            id: `edge-${Date.now()}-${ev.id}`,
            source: id,
            target: ev.targetNodeId,
            type: "message",
            sourceHandle: `publishedEvents-out-${ev.id}`,
            targetHandle: null,
            fractionalIndex,
          };
          nextEdges.push(newEdge);
          edgesChanged = true;
          newPendingEdgeUpserts.push(newEdge);
        }
      }
    });
  }

  // 2. Consumed Events -> Edges
  if (changes.data?.consumedEvents) {
    const existingConsumeEdges = nextEdges.filter(
      (e) => e.target === id && e.targetHandle?.startsWith("consumedEvents-in-"),
    );
    const currentEvents = changes.data.consumedEvents;

    existingConsumeEdges.forEach((edge) => {
      const eventId = edge.targetHandle?.replace("consumedEvents-in-", "");
      const ev = currentEvents.find((e) => e.id === eventId);
      if (!ev || ev.targetNodeId !== edge.source || ev.targetNodeId === "none") {
        nextEdges = nextEdges.filter((e) => e.id !== edge.id);
        edgesChanged = true;
        newPendingEdgeRemovals.push(edge.id);
      }
    });

    currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
      if (ev.targetNodeId && ev.targetNodeId !== "none") {
        const hasEdge = existingConsumeEdges.some(
          (e) =>
            e.targetHandle === `consumedEvents-in-${ev.id}` &&
            e.source === ev.targetNodeId,
        );
        if (!hasEdge) {
          const lastEdgeIndex = getLastIndex(nextEdges);
          const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
          const newEdge: BackendEdge = {
            id: `edge-${Date.now()}-${ev.id}`,
            source: ev.targetNodeId,
            target: id,
            type: "message",
            sourceHandle: null,
            targetHandle: `consumedEvents-in-${ev.id}`,
            fractionalIndex,
          };
          nextEdges.push(newEdge);
          edgesChanged = true;
          newPendingEdgeUpserts.push(newEdge);
        }
      }
    });
  }

  // 3. Entity foreign-key edges
  if (updatedNode.type === "entity" && changes.data?.columns) {
    const currentCols = changes.data.columns;
    const allEntityNodes = nextNodes.filter((n) => n.type === "entity");

    currentCols.forEach((col, colIdx) => {
      const existingEdgeIndices: number[] = [];
      nextEdges.forEach((e, idx) => {
        if (
          e.type === "foreign-key" &&
          e.target === id &&
          (e.targetHandle === `target-${colIdx}` ||
            e.targetHandle === `source-${colIdx}`)
        ) {
          existingEdgeIndices.push(idx);
        }
      });

      if (col.isForeignKey && col.references?.table && col.references?.column) {
        const refNode = allEntityNodes.find(
          (n) => n.data.label === col.references?.table,
        );
        if (refNode && refNode.data.columns) {
          const refColIdx = refNode.data.columns.findIndex(
            (c) => c.name === col.references?.column,
          );
          if (refColIdx !== -1) {
            const expectedSourceHandle = `source-${refColIdx}`;
            const expectedTargetHandle = `target-${colIdx}`;
            const expectedSourceId = refNode.id;

            if (existingEdgeIndices.length > 0) {
              const primaryEdgeIdx = existingEdgeIndices[0];
              const existingEdge =
                primaryEdgeIdx !== undefined ? nextEdges[primaryEdgeIdx] : undefined;

              if (
                existingEdge &&
                (existingEdge.source !== expectedSourceId ||
                  existingEdge.target !== id ||
                  existingEdge.sourceHandle !== expectedSourceHandle ||
                  existingEdge.targetHandle !== expectedTargetHandle)
              ) {
                const updatedEdge: BackendEdge = {
                  ...existingEdge,
                  source: expectedSourceId,
                  target: id,
                  sourceHandle: expectedSourceHandle,
                  targetHandle: expectedTargetHandle,
                };
                if (primaryEdgeIdx !== undefined) {
                  nextEdges[primaryEdgeIdx] = updatedEdge;
                }
                edgesChanged = true;
                newPendingEdgeUpserts.push(updatedEdge);
              }

              for (let i = 1; i < existingEdgeIndices.length; i++) {
                const staleIdx = existingEdgeIndices[i];
                const staleEdge =
                  staleIdx !== undefined ? nextEdges[staleIdx] : undefined;
                if (staleEdge) {
                  nextEdges = nextEdges.filter((e) => e.id !== staleEdge.id);
                  newPendingEdgeRemovals.push(staleEdge.id);
                  edgesChanged = true;
                }
              }
            } else {
              const lastEdgeIndex = getLastIndex(nextEdges);
              const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
              const newEdge: BackendEdge = {
                id: `edge-${Date.now()}-${colIdx}`,
                source: expectedSourceId,
                target: id,
                type: "foreign-key",
                sourceHandle: expectedSourceHandle,
                targetHandle: expectedTargetHandle,
                fractionalIndex,
              };
              nextEdges.push(newEdge);
              edgesChanged = true;
              newPendingEdgeUpserts.push(newEdge);
            }
          }
        }
      } else {
        if (existingEdgeIndices.length > 0) {
          existingEdgeIndices.forEach((edgeIdx) => {
            const edgeToRemove = nextEdges[edgeIdx];
            if (edgeToRemove) {
              nextEdges = nextEdges.filter((e) => e.id !== edgeToRemove.id);
              newPendingEdgeRemovals.push(edgeToRemove.id);
            }
          });
          edgesChanged = true;
        }
      }
    });

    const maxColIdx = currentCols.length - 1;
    nextEdges.forEach((e) => {
      if (e.type === "foreign-key") {
        if (e.target === id && e.targetHandle) {
          const match = e.targetHandle.match(/^(?:source|target)-(\d+)$/);
          if (match && match[1]) {
            const idx = parseInt(match[1], 10);
            if (idx > maxColIdx) {
              nextEdges = nextEdges.filter((edge) => edge.id !== e.id);
              newPendingEdgeRemovals.push(e.id);
              edgesChanged = true;
            }
          }
        }
        if (e.source === id && e.sourceHandle) {
          const match = e.sourceHandle.match(/^(?:source|target)-(\d+)$/);
          if (match && match[1]) {
            const idx = parseInt(match[1], 10);
            if (idx > maxColIdx) {
              nextEdges = nextEdges.filter((edge) => edge.id !== e.id);
              newPendingEdgeRemovals.push(e.id);
              edgesChanged = true;
            }
          }
        }
      }
    });
  }

  // 4. Broker resources (topics, streams, queues, channels, caches, buckets)
  BROKER_RESOURCE_KEYS.forEach((key) => {
    if (changes.data && key in changes.data) {
      const oldList = getBrokerResourceList(updatedNode.data, key);
      const newList = getBrokerResourceList(changes.data, key);
      const newIds = new Set(newList.map((r) => r.id));
      const removedResourceIds = oldList
        .filter((r) => !newIds.has(r.id))
        .map((r) => r.id);

      if (removedResourceIds.length > 0) {
        removedResourceIds.forEach((resId) => {
          const removedForRes = nextEdges.filter(
            (edge) =>
              edge &&
              (edge.sourceResourceId === resId ||
                edge.targetResourceId === resId ||
                edge.sourceHandle?.includes(resId) ||
                edge.targetHandle?.includes(resId)),
          );
          if (removedForRes.length > 0) {
            const ids = removedForRes.map((e) => e.id);
            nextEdges = nextEdges.filter((e) => !ids.includes(e.id));
            edgesChanged = true;
            newPendingEdgeRemovals.push(...ids);
          }
        });
      }
    }
  });

  return {
    nextEdges,
    edgesChanged,
    newPendingEdgeRemovals,
    newPendingEdgeUpserts,
  };
}
