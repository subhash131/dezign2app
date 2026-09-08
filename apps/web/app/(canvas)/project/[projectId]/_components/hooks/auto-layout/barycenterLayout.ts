import type { LayoutNode, LayoutEdge, DagreGraph } from "./types";
import { getNodeDimensions, getHandleYRatio } from "./nodeDimensions";

// ---------------------------------------------------------------------------
// Bezier helpers
// ---------------------------------------------------------------------------

/** Sample a point on a cubic bezier at parameter t ∈ [0, 1] */
function cubicBezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const mt = 1 - t;
  const x =
    mt * mt * mt * p0[0] +
    3 * mt * mt * t * p1[0] +
    3 * mt * t * t * p2[0] +
    t * t * t * p3[0];
  const y =
    mt * mt * mt * p0[1] +
    3 * mt * mt * t * p1[1] +
    3 * mt * t * t * p2[1] +
    t * t * t * p3[1];
  return [x, y];
}

/** Sample `count` evenly-spaced points along a cubic bezier */
function sampleBezier(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  count: number = 14,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    pts.push(cubicBezierPoint(p0, p1, p2, p3, i / count));
  }
  return pts;
}

/**
 * Build the 4 cubic-bezier control points that approximate a ReactFlow
 * smoothstep / bezier edge given source and target handle positions.
 */
function buildEdgeBezier(
  srcX: number,
  srcY: number,
  tgtX: number,
  tgtY: number,
  isHorizontal: boolean,
): [[number, number], [number, number], [number, number], [number, number]] {
  if (isHorizontal) {
    // Handles exit right / enter left
    const offset = Math.max(Math.abs(tgtX - srcX) * 0.5, 80);
    return [
      [srcX, srcY],
      [srcX + offset, srcY],
      [tgtX - offset, tgtY],
      [tgtX, tgtY],
    ];
  } else {
    // Handles exit bottom / enter top
    const offset = Math.max(Math.abs(tgtY - srcY) * 0.5, 80);
    return [
      [srcX, srcY],
      [srcX, srcY + offset],
      [tgtX, tgtY - offset],
      [tgtX, tgtY],
    ];
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface BarycenterRefinementParams {
  dagreGraph: DagreGraph;
  flowNodes: LayoutNode[];
  flowEdges: LayoutEdge[];
  positionsMap: Map<string, { x: number; y: number }>;
  isHorizontal: boolean;
  storeEndpoints: Array<{ id: string; nodeId: string }>;
  storeEvents: Array<{ id: string; nodeId: string }>;
  hangingEdges?: LayoutEdge[];
  hangingRefEdges?: LayoutEdge[];
  hangingRefNodes?: LayoutNode[];
}

export function runBarycenterRefinement({
  dagreGraph,
  flowNodes,
  flowEdges,
  positionsMap,
  isHorizontal,
  storeEndpoints,
  storeEvents,
  hangingEdges = [],
  hangingRefEdges = [],
  hangingRefNodes = [],
}: BarycenterRefinementParams): void {
  // Whether any entity nodes are present — used to tune gaps
  const hasEntityNodesLocal = flowNodes.some((n) => n.type === "entity");

  const endpointYRatio = new Map<string, number>();
  const epsByNode = new Map<string, string[]>();
  storeEndpoints.forEach((ep) => {
    if (!epsByNode.has(ep.nodeId)) epsByNode.set(ep.nodeId, []);
    epsByNode.get(ep.nodeId)!.push(ep.id);
  });
  epsByNode.forEach((epIds) => {
    epIds.forEach((epId, idx) => {
      endpointYRatio.set(epId, (idx + 0.5) / epIds.length);
    });
  });

  const eventYRatio = new Map<string, number>();
  const evsByNode = new Map<string, string[]>();
  storeEvents.forEach((ev) => {
    if (!evsByNode.has(ev.nodeId)) evsByNode.set(ev.nodeId, []);
    evsByNode.get(ev.nodeId)!.push(ev.id);
  });
  evsByNode.forEach((evIds) => {
    evIds.forEach((evId, idx) => {
      eventYRatio.set(evId, (idx + 0.5) / evIds.length);
    });
  });

  const resolveHandleY = (
    neighborId: string,
    handle: string | null | undefined,
    neighborY: number,
    neighborH: number,
  ): number => {
    if (!handle) return neighborY + neighborH / 2;

    const neighborNode = flowNodes.find((n) => n.id === neighborId);
    if (neighborNode && neighborNode.type === "entity") {
      const ratio = getHandleYRatio(neighborNode, handle);
      return neighborY + ratio * neighborH;
    }

    if (
      handle.startsWith("endpoint-in-") ||
      handle.startsWith("endpoint-out-")
    ) {
      const epId = handle.replace(/^endpoint-(in|out)-/, "");
      const ratio = endpointYRatio.get(epId);
      if (ratio !== undefined) return neighborY + ratio * neighborH;
    }
    if (handle.startsWith("events-")) {
      const evId = handle.replace("events-", "");
      const ratio = eventYRatio.get(evId);
      if (ratio !== undefined) return neighborY + ratio * neighborH;
    }
    if (handle.startsWith("publishedEvents-out-")) {
      const evId = handle.replace("publishedEvents-out-", "");
      const ratio = eventYRatio.get(evId);
      if (ratio !== undefined) return neighborY + ratio * neighborH;
    }
    if (handle.startsWith("consumedEvents-in-")) {
      const evId = handle.replace("consumedEvents-in-", "");
      const ratio = eventYRatio.get(evId);
      if (ratio !== undefined) return neighborY + ratio * neighborH;
    }
    return neighborY + neighborH / 2;
  };

  const resolveMyHandleRatio = (
    node: LayoutNode,
    handle: string | null | undefined,
  ): number => {
    if (!handle) return 0.5;

    if (node.type === "entity") {
      return getHandleYRatio(node, handle);
    }

    if (
      handle.startsWith("endpoint-in-") ||
      handle.startsWith("endpoint-out-")
    ) {
      const epId = handle.replace(/^endpoint-(in|out)-/, "");
      return endpointYRatio.get(epId) ?? 0.5;
    }
    if (handle.startsWith("events-")) {
      return eventYRatio.get(handle.replace("events-", "")) ?? 0.5;
    }
    if (handle.startsWith("publishedEvents-out-")) {
      return (
        eventYRatio.get(handle.replace("publishedEvents-out-", "")) ?? 0.5
      );
    }
    if (handle.startsWith("consumedEvents-in-")) {
      return eventYRatio.get(handle.replace("consumedEvents-in-", "")) ?? 0.5;
    }
    return 0.5;
  };

  const rankMap = new Map<number, string[]>();
  flowNodes.forEach((node: LayoutNode) => {
    const dNode = dagreGraph.node(node.id) as { rank?: number } | undefined;
    if (!dNode) return;
    const r: number = typeof dNode.rank === "number" ? dNode.rank : 0;
    if (!rankMap.has(r)) rankMap.set(r, []);
    rankMap.get(r)!.push(node.id);
  });

  const ranks = Array.from(rankMap.keys()).sort((a, b) => a - b);

  const computeBarycenter = (nodeId: string): number => {
    const node = flowNodes.find((n) => n.id === nodeId);
    if (!node) return 0;
    const pos = positionsMap.get(nodeId);
    if (!pos) return 0;
    const { height } = getNodeDimensions(node);

    const nodeEdges = flowEdges.filter(
      (e) => e.source === nodeId || e.target === nodeId,
    );
    if (nodeEdges.length === 0) return pos.y + height / 2;

    let sum = 0;
    let count = 0;
    nodeEdges.forEach((edge) => {
      const isSrc = edge.source === nodeId;
      const neighborId = isSrc ? edge.target : edge.source;
      const neighborNode = flowNodes.find((n) => n.id === neighborId);
      if (!neighborNode) return;
      const neighborPos = positionsMap.get(neighborId);
      if (!neighborPos) return;
      const { height: nh } = getNodeDimensions(neighborNode);

      const neighborHandle = isSrc ? edge.targetHandle : edge.sourceHandle;
      const myHandle = isSrc ? edge.sourceHandle : edge.targetHandle;

      if (isHorizontal) {
        const neighborHandleY = resolveHandleY(
          neighborId,
          neighborHandle,
          neighborPos.y,
          nh,
        );
        const myRatio = resolveMyHandleRatio(node, myHandle);
        const idealCenterY = neighborHandleY - myRatio * height + height / 2;
        sum += idealCenterY;
      } else {
        sum += neighborPos.x + getNodeDimensions(neighborNode).width / 2;
      }
      count++;
    });

    return count > 0 ? sum / count : pos.y + height / 2;
  };

  const countCrossings = (rankA: string[], rankB: string[]): number => {
    const posB = new Map(rankB.map((id, i) => [id, i]));
    const pairs: [number, number][] = [];
    flowEdges.forEach((e) => {
      const ai = rankA.indexOf(e.source);
      const bi = posB.get(e.target);
      if (ai !== -1 && bi !== undefined) pairs.push([ai, bi]);
      const ai2 = rankA.indexOf(e.target);
      const bi2 = posB.get(e.source);
      if (ai2 !== -1 && bi2 !== undefined) pairs.push([ai2, bi2]);
    });
    let crossings = 0;
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const [a1, b1] = pairs[i]!;
        const [a2, b2] = pairs[j]!;
        if ((a1 < a2 && b1 > b2) || (a1 > a2 && b1 < b2)) crossings++;
      }
    }
    return crossings;
  };

  const totalCrossings = (): number => {
    let total = 0;
    for (let i = 0; i < ranks.length - 1; i++) {
      const a = rankMap.get(ranks[i]!);
      const b = rankMap.get(ranks[i + 1]!);
      if (a && b) total += countCrossings(a, b);
    }
    return total;
  };

  // Use compact gaps so vertical Y-axis spacing remains tight and readable
  const nodeGap = hasEntityNodesLocal ? 60 : 45;
  const minRankGap = hasEntityNodesLocal ? 200 : 160;

  const reapplyRankPositions = () => {
    let lastRankMaxPrimary = -Infinity;

    ranks.forEach((r) => {
      const ids = rankMap.get(r);
      if (!ids || ids.length === 0) return;

      // Grid packing for dense entity ranks (e.g., 1 PK hub connected to 4+ FK tables)
      if (ids.length >= 4 && hasEntityNodesLocal) {
        const numCols = Math.min(3, Math.ceil(Math.sqrt(ids.length)));
        const numRows = Math.ceil(ids.length / numCols);

        let maxNodeWidth = 0;
        let maxNodeHeight = 0;
        ids.forEach((id) => {
          const node = flowNodes.find((n) => n.id === id);
          if (!node) return;
          const { width, height } = getNodeDimensions(node);
          if (width > maxNodeWidth) maxNodeWidth = width;
          if (height > maxNodeHeight) maxNodeHeight = height;
        });

        const subGapX = 80;
        const subGapY = 40;

        const gridTotalWidth =
          numCols * maxNodeWidth + (numCols - 1) * subGapX;
        const gridTotalHeight =
          numRows * maxNodeHeight + (numRows - 1) * subGapY;

        const avgCenter =
          ids.reduce((s, id) => s + computeBarycenter(id), 0) / ids.length;

        let secondaryPos =
          ids.reduce((s, id) => {
            const pos = positionsMap.get(id);
            if (!pos) return s;
            const node = flowNodes.find((n) => n.id === id)!;
            const { width, height } = getNodeDimensions(node);
            return s + (isHorizontal ? pos.x + width / 2 : pos.y + height / 2);
          }, 0) / ids.length;

        const primarySpanHalf =
          (isHorizontal ? maxNodeWidth : maxNodeHeight) / 2;

        const hasHangingTransformersInRank = ids.some((id) =>
          hangingEdges.some((e) => e.target === id),
        );
        const hasHangingReferencesInRank = ids.some((id) =>
          hangingRefEdges.some((e) => e.source === id || e.target === id),
        );
        const effectiveRankGap =
          hasHangingTransformersInRank || hasHangingReferencesInRank
            ? Math.max(minRankGap, 500)
            : minRankGap;

        if (lastRankMaxPrimary !== -Infinity) {
          const minAllowedCenter =
            lastRankMaxPrimary + effectiveRankGap + primarySpanHalf;
          if (secondaryPos < minAllowedCenter) {
            secondaryPos = minAllowedCenter;
          }
        }

        let currentRankMaxPrimary = -Infinity;

        if (isHorizontal) {
          // Ranks move Left-to-Right along X. Grid packs X sub-columns & Y rows.
          const startY = avgCenter - gridTotalHeight / 2;

          ids.forEach((id, index) => {
            const col = Math.floor(index / numRows);
            const row = index % numRows;

            const x = secondaryPos + col * (maxNodeWidth + subGapX);
            const y = startY + row * (maxNodeHeight + subGapY);

            positionsMap.set(id, { x, y });

            const nodeRight = x + maxNodeWidth;
            const connectedRefEdges = hangingRefEdges.filter(
              (e) => e.source === id || e.target === id,
            );
            const hasDownstreamRefs = connectedRefEdges.length > 0;
            const maxRefWidth = hasDownstreamRefs
              ? Math.max(
                  ...connectedRefEdges.map((e) => {
                    const refId = e.source === id ? e.target : e.source;
                    const refNode = hangingRefNodes.find((n) => n.id === refId);
                    return refNode ? getNodeDimensions(refNode).width : 240;
                  }),
                  240,
                )
              : 0;
            const effectiveNodeRight = hasDownstreamRefs
              ? nodeRight + 80 + maxRefWidth
              : nodeRight;
            if (effectiveNodeRight > currentRankMaxPrimary) {
              currentRankMaxPrimary = effectiveNodeRight;
            }
          });
        } else {
          // Ranks move Top-to-Bottom along Y. Grid packs X sub-columns & Y rows.
          const startX = avgCenter - gridTotalWidth / 2;

          ids.forEach((id, index) => {
            const row = Math.floor(index / numCols);
            const col = index % numCols;

            const x = startX + col * (maxNodeWidth + subGapX);
            const y = secondaryPos + row * (maxNodeHeight + subGapY);

            positionsMap.set(id, { x, y });

            const nodeBottom = y + maxNodeHeight;
            const connectedRefEdges = hangingRefEdges.filter(
              (e) => e.source === id || e.target === id,
            );
            const hasDownstreamRefs = connectedRefEdges.length > 0;
            const maxRefHeight = hasDownstreamRefs
              ? Math.max(
                  ...connectedRefEdges.map((e) => {
                    const refId = e.source === id ? e.target : e.source;
                    const refNode = hangingRefNodes.find((n) => n.id === refId);
                    return refNode ? getNodeDimensions(refNode).height : 80;
                  }),
                  80,
                )
              : 0;
            const effectiveNodeBottom = hasDownstreamRefs
              ? nodeBottom + 60 + maxRefHeight
              : nodeBottom;
            if (effectiveNodeBottom > currentRankMaxPrimary) {
              currentRankMaxPrimary = effectiveNodeBottom;
            }
          });
        }

        lastRankMaxPrimary = currentRankMaxPrimary;
        return;
      }

      let totalLen = 0;
      ids.forEach((id, idx) => {
        const node = flowNodes.find((n) => n.id === id)!;
        const { width, height } = getNodeDimensions(node);
        totalLen += (isHorizontal ? height : width) + (idx > 0 ? nodeGap : 0);
      });

      const avgCenter =
        ids.reduce((s, id) => s + computeBarycenter(id), 0) / ids.length;
      let cursor = avgCenter - totalLen / 2;

      let secondaryPos =
        ids.reduce((s, id) => {
          const pos = positionsMap.get(id);
          if (!pos) return s;
          const node = flowNodes.find((n) => n.id === id)!;
          const { width, height } = getNodeDimensions(node);
          return s + (isHorizontal ? pos.x + width / 2 : pos.y + height / 2);
        }, 0) / ids.length;

      // Calculate max half-dimension along the primary rank axis
      const maxHalfSize = Math.max(
        ...ids.map((id) => {
          const node = flowNodes.find((n) => n.id === id)!;
          const { width, height } = getNodeDimensions(node);
          return (isHorizontal ? width : height) / 2;
        }),
      );

      const hasHangingTransformersInRank = ids.some((id) =>
        hangingEdges.some((e) => e.target === id),
      );
      const hasHangingReferencesInRank = ids.some((id) =>
        hangingRefEdges.some((e) => e.source === id || e.target === id),
      );
      const effectiveRankGap =
        hasHangingTransformersInRank || hasHangingReferencesInRank
          ? Math.max(minRankGap, 500)
          : minRankGap;

      // Enforce clean rank separation from previous rank
      if (lastRankMaxPrimary !== -Infinity) {
        const minAllowedCenter =
          lastRankMaxPrimary + effectiveRankGap + maxHalfSize;
        if (secondaryPos < minAllowedCenter) {
          secondaryPos = minAllowedCenter;
        }
      }

      let currentRankMaxPrimary = -Infinity;

      ids.forEach((id) => {
        const node = flowNodes.find((n) => n.id === id)!;
        const { width, height } = getNodeDimensions(node);
        if (isHorizontal) {
          positionsMap.set(id, { x: secondaryPos - width / 2, y: cursor });
          cursor += height + nodeGap;
          const nodeRight = secondaryPos + width / 2;
          const connectedRefEdges = hangingRefEdges.filter(
            (e) => e.source === id || e.target === id,
          );
          const hasDownstreamRefs = connectedRefEdges.length > 0;
          const maxRefWidth = hasDownstreamRefs
            ? Math.max(
                ...connectedRefEdges.map((e) => {
                  const refId = e.source === id ? e.target : e.source;
                  const refNode = hangingRefNodes.find((n) => n.id === refId);
                  return refNode ? getNodeDimensions(refNode).width : 240;
                }),
                240,
              )
            : 0;
          const effectiveNodeRight = hasDownstreamRefs
            ? nodeRight + 80 + maxRefWidth
            : nodeRight;
          if (effectiveNodeRight > currentRankMaxPrimary) {
            currentRankMaxPrimary = effectiveNodeRight;
          }
        } else {
          positionsMap.set(id, { x: cursor, y: secondaryPos - height / 2 });
          cursor += width + nodeGap;
          const nodeBottom = secondaryPos + height / 2;
          const connectedRefEdges = hangingRefEdges.filter(
            (e) => e.source === id || e.target === id,
          );
          const hasDownstreamRefs = connectedRefEdges.length > 0;
          const maxRefHeight = hasDownstreamRefs
            ? Math.max(
                ...connectedRefEdges.map((e) => {
                  const refId = e.source === id ? e.target : e.source;
                  const refNode = hangingRefNodes.find((n) => n.id === refId);
                  return refNode ? getNodeDimensions(refNode).height : 80;
                }),
                80,
              )
            : 0;
          const effectiveNodeBottom = hasDownstreamRefs
            ? nodeBottom + 60 + maxRefHeight
            : nodeBottom;
          if (effectiveNodeBottom > currentRankMaxPrimary) {
            currentRankMaxPrimary = effectiveNodeBottom;
          }
        }
      });

      lastRankMaxPrimary = currentRankMaxPrimary;
    });
  };

  const transposeRefine = () => {
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 10) {
      improved = false;
      iterations++;
      ranks.forEach((r) => {
        const ids = rankMap.get(r)!;
        for (let i = 0; i < ids.length - 1; i++) {
          const before = totalCrossings();
          const tmp = ids[i]!;
          ids[i] = ids[i + 1]!;
          ids[i + 1] = tmp;
          const after = totalCrossings();
          if (after < before) {
            improved = true;
          } else {
            const tmp2 = ids[i]!;
            ids[i] = ids[i + 1]!;
            ids[i + 1] = tmp2;
          }
        }
      });
    }
  };

  const sweepRanks = (rankOrder: number[]) => {
    rankOrder.forEach((r) => {
      const ids = rankMap.get(r);
      if (!ids || ids.length <= 1) return;
      ids.sort((a, b) => computeBarycenter(a) - computeBarycenter(b));
    });
  };

  let bestOrder: Map<number, string[]> | null = null;
  let bestScore = Infinity;

  // Increased to 10 passes for better crossing minimisation
  for (let pass = 0; pass < 10; pass++) {
    sweepRanks(pass % 2 === 0 ? [...ranks] : [...ranks].reverse());
    transposeRefine();
    reapplyRankPositions();
    const score = totalCrossings();
    if (score < bestScore) {
      bestScore = score;
      bestOrder = new Map(
        Array.from(rankMap.entries()).map(([k, v]) => [k, [...v]]),
      );
    }
  }

  // --- Post-Processing: Elevate intermediate nodes above rank-skipping edges ---
  const adjustIntermediateNodesForSkipEdges = () => {
    const nodeToRank = new Map<string, number>();
    rankMap.forEach((ids, r) => {
      ids.forEach((id) => nodeToRank.set(id, r));
    });

    const skipEdges: Array<{
      edge: LayoutEdge;
      minRank: number;
      maxRank: number;
    }> = [];

    flowEdges.forEach((edge) => {
      const srcRank = nodeToRank.get(edge.source);
      const tgtRank = nodeToRank.get(edge.target);
      if (srcRank !== undefined && tgtRank !== undefined) {
        const minRank = Math.min(srcRank, tgtRank);
        const maxRank = Math.max(srcRank, tgtRank);
        if (maxRank - minRank >= 2) {
          skipEdges.push({ edge, minRank, maxRank });
        }
      }
    });

    if (skipEdges.length === 0) return;

    skipEdges.forEach(({ edge, minRank, maxRank }) => {
      const srcNode = flowNodes.find((n) => n.id === edge.source);
      const tgtNode = flowNodes.find((n) => n.id === edge.target);
      if (!srcNode || !tgtNode) return;

      const srcPos = positionsMap.get(edge.source);
      const tgtPos = positionsMap.get(edge.target);
      if (!srcPos || !tgtPos) return;

      const srcH = getNodeDimensions(srcNode).height;
      const tgtH = getNodeDimensions(tgtNode).height;

      const srcHandleY = resolveHandleY(
        edge.source,
        edge.sourceHandle,
        srcPos.y,
        srcH,
      );
      const tgtHandleY = resolveHandleY(
        edge.target,
        edge.targetHandle,
        tgtPos.y,
        tgtH,
      );

      for (let r = minRank + 1; r < maxRank; r++) {
        const rankNodeIds = rankMap.get(r);
        if (!rankNodeIds || rankNodeIds.length === 0) continue;

        const t = (r - minRank) / (maxRank - minRank);
        const yEdgeAtRank = srcHandleY + t * (tgtHandleY - srcHandleY);

        rankNodeIds.forEach((nodeId) => {
          const nNode = flowNodes.find((n) => n.id === nodeId);
          if (!nNode) return;
          const nPos = positionsMap.get(nodeId);
          if (!nPos) return;
          const { height: nH } = getNodeDimensions(nNode);

          const isConnectedToSkipEdge = flowEdges.some(
            (e) =>
              (e.source === nodeId &&
                (e.target === edge.source || e.target === edge.target)) ||
              (e.target === nodeId &&
                (e.source === edge.source || e.source === edge.target)),
          );

          const nodeBottom = nPos.y + nH;
          const overlapsEdge =
            nPos.y <= yEdgeAtRank + 40 && nodeBottom >= yEdgeAtRank - 40;

          if (isConnectedToSkipEdge || overlapsEdge) {
            // Choose the direction that requires less movement
            const pushUpY = yEdgeAtRank - nH - 45;
            const pushDownY = yEdgeAtRank + 45;
            const nodeCenterY = nPos.y + nH / 2;
            const distUp = Math.abs(nodeCenterY - (pushUpY + nH / 2));
            const distDown = Math.abs(nodeCenterY - (pushDownY + nH / 2));
            if (distUp <= distDown) {
              positionsMap.set(nodeId, { x: nPos.x, y: pushUpY });
            } else {
              positionsMap.set(nodeId, { x: nPos.x, y: pushDownY });
            }
          }
        });
      }
    });

    let minY = Infinity;
    positionsMap.forEach((pos) => {
      if (pos.y < minY) minY = pos.y;
    });

    if (minY < 60) {
      const shiftY = 60 - minY;
      positionsMap.forEach((pos, id) => {
        positionsMap.set(id, { x: pos.x, y: pos.y + shiftY });
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Node-to-Edge Clearance Pass (bezier-aware)
  // ---------------------------------------------------------------------------
  const resolveNodeEdgeOverlaps = () => {
    const BEZIER_SAMPLES = 14;
    const clearance = hasEntityNodesLocal ? 40 : 30;
    const maxPasses = 6;

    for (let pass = 0; pass < maxPasses; pass++) {
      let movedAny = false;

      flowEdges.forEach((edge) => {
        const srcNode = flowNodes.find((n) => n.id === edge.source);
        const tgtNode = flowNodes.find((n) => n.id === edge.target);
        if (!srcNode || !tgtNode) return;

        const srcPos = positionsMap.get(edge.source);
        const tgtPos = positionsMap.get(edge.target);
        if (!srcPos || !tgtPos) return;

        const srcDim = getNodeDimensions(srcNode);
        const tgtDim = getNodeDimensions(tgtNode);

        const srcHandleY = resolveHandleY(
          edge.source,
          edge.sourceHandle,
          srcPos.y,
          srcDim.height,
        );
        const tgtHandleY = resolveHandleY(
          edge.target,
          edge.targetHandle,
          tgtPos.y,
          tgtDim.height,
        );

        // Build bezier control points matching ReactFlow's edge curve shape
        let p0: [number, number],
          p1: [number, number],
          p2: [number, number],
          p3: [number, number];

        if (isHorizontal) {
          const srcX = srcPos.x + srcDim.width; // right handle exit
          const tgtX = tgtPos.x; // left handle entry
          [p0, p1, p2, p3] = buildEdgeBezier(
            srcX,
            srcHandleY,
            tgtX,
            tgtHandleY,
            true,
          );
        } else {
          const srcHandleX = srcPos.x + srcDim.width / 2;
          const tgtHandleX = tgtPos.x + tgtDim.width / 2;
          const srcY = srcPos.y + srcDim.height; // bottom handle exit
          const tgtY = tgtPos.y; // top handle entry
          [p0, p1, p2, p3] = buildEdgeBezier(
            srcHandleX,
            srcY,
            tgtHandleX,
            tgtY,
            false,
          );
        }

        const edgePoints = sampleBezier(p0, p1, p2, p3, BEZIER_SAMPLES);

        // Compute the bounding box of the bezier path for a quick pre-filter
        let edgeMinX = Infinity,
          edgeMaxX = -Infinity,
          edgeMinY = Infinity,
          edgeMaxY = -Infinity;
        edgePoints.forEach(([ex, ey]) => {
          if (ex < edgeMinX) edgeMinX = ex;
          if (ex > edgeMaxX) edgeMaxX = ex;
          if (ey < edgeMinY) edgeMinY = ey;
          if (ey > edgeMaxY) edgeMaxY = ey;
        });

        flowNodes.forEach((node) => {
          if (node.id === edge.source || node.id === edge.target) return;
          const pos = positionsMap.get(node.id);
          if (!pos) return;
          const { width, height } = getNodeDimensions(node);

          const nodeLeft = pos.x - clearance;
          const nodeRight = pos.x + width + clearance;
          const nodeTop = pos.y - clearance;
          const nodeBottom = pos.y + height + clearance;

          // Quick AABB pre-filter against edge bounding box
          if (
            nodeRight < edgeMinX ||
            nodeLeft > edgeMaxX ||
            nodeBottom < edgeMinY ||
            nodeTop > edgeMaxY
          ) {
            return;
          }

          // Precise check: does any sampled bezier point fall inside the node's
          // clearance-expanded bounding box?
          const intersects = edgePoints.some(
            ([ex, ey]) =>
              ex >= nodeLeft &&
              ex <= nodeRight &&
              ey >= nodeTop &&
              ey <= nodeBottom,
          );

          if (!intersects) return;

          movedAny = true;

          // Find the edge Y closest to the node's horizontal centre to decide
          // which direction to push
          const nodeCenterX = pos.x + width / 2;
          let closestEdgeY = p0[1];
          let minDist = Infinity;
          edgePoints.forEach(([ex, ey]) => {
            const dist = Math.abs(ex - nodeCenterX);
            if (dist < minDist) {
              minDist = dist;
              closestEdgeY = ey;
            }
          });

          const nodeCenterY = pos.y + height / 2;
          const pushUpY = closestEdgeY - height - clearance;
          const pushDownY = closestEdgeY + clearance;
          const distUp = Math.abs(nodeCenterY - (pushUpY + height / 2));
          const distDown = Math.abs(nodeCenterY - (pushDownY + height / 2));

          if (distUp <= distDown) {
            positionsMap.set(node.id, { x: pos.x, y: pushUpY });
          } else {
            positionsMap.set(node.id, { x: pos.x, y: pushDownY });
          }
        });
      });

      if (!movedAny) break;
    }
  };

  // --- Final AABB Overlap Resolution Pass ---
  const resolveNodeOverlaps = () => {
    const padding = hasEntityNodesLocal ? 35 : 25;
    let hasOverlaps = true;
    let iterations = 0;
    const maxIterations = 20;

    while (hasOverlaps && iterations < maxIterations) {
      hasOverlaps = false;
      iterations++;

      for (let i = 0; i < flowNodes.length; i++) {
        const nodeA = flowNodes[i]!;
        const posA = positionsMap.get(nodeA.id);
        if (!posA) continue;
        const dimA = getNodeDimensions(nodeA);

        for (let j = i + 1; j < flowNodes.length; j++) {
          const nodeB = flowNodes[j]!;
          const posB = positionsMap.get(nodeB.id);
          if (!posB) continue;
          const dimB = getNodeDimensions(nodeB);

          const overlapX =
            Math.min(
              posA.x + dimA.width + padding,
              posB.x + dimB.width + padding,
            ) - Math.max(posA.x, posB.x);
          const overlapY =
            Math.min(
              posA.y + dimA.height + padding,
              posB.y + dimB.height + padding,
            ) - Math.max(posA.y, posB.y);

          if (overlapX > 0 && overlapY > 0) {
            hasOverlaps = true;
            if (isHorizontal) {
              if (posA.y <= posB.y) {
                positionsMap.set(nodeB.id, { x: posB.x, y: posB.y + overlapY });
              } else {
                positionsMap.set(nodeA.id, { x: posA.x, y: posA.y + overlapY });
              }
            } else {
              if (posA.x <= posB.x) {
                positionsMap.set(nodeB.id, { x: posB.x + overlapX, y: posB.y });
              } else {
                positionsMap.set(nodeA.id, { x: posA.x + overlapX, y: posA.y });
              }
            }
          }
        }
      }
    }
  };

  // Apply the best crossing-minimal order found across all sweep passes
  if (bestOrder) {
    bestOrder.forEach((ids, r) => rankMap.set(r, ids));
  }
  reapplyRankPositions();
  adjustIntermediateNodesForSkipEdges();

  // First pass: push nodes out of bezier edge paths
  resolveNodeEdgeOverlaps();

  // Separate any still-overlapping node pairs
  resolveNodeOverlaps();

  // Second pass: re-check bezier overlaps that may have been introduced by
  // the node-node separation step above
  resolveNodeEdgeOverlaps();
}
