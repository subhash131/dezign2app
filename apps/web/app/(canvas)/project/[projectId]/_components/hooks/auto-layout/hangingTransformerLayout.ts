import type { LayoutNode, LayoutEdge } from "./types";
import { getNodeDimensions, getHandleYRatio } from "./nodeDimensions";

export interface HangingTransformerLayoutParams {
  nodes: LayoutNode[];
  positionsMap: Map<string, { x: number; y: number }>;
  hangingEdges: LayoutEdge[];
  hangingTransformerNodes: LayoutNode[];
  isHorizontal?: boolean;
  storeEndpoints?: Array<{ id: string; nodeId: string }>;
  storeEvents?: Array<{ id: string; nodeId: string }>;
  secondaryToLeadPageMap?: Map<string, string>;
}

/**
 * Positions hanging transformer nodes (local transformers & global transformer refs)
 * in a dedicated column immediately preceding (to the left of) the service node they connect to,
 * or adjacent to the connected WebPage action handle.
 */
export function layoutHangingTransformerNodes({
  nodes,
  positionsMap,
  hangingEdges,
  hangingTransformerNodes,
  isHorizontal = true,
  storeEndpoints = [],
  storeEvents = [],
  secondaryToLeadPageMap,
}: HangingTransformerLayoutParams): void {
  if (hangingTransformerNodes.length === 0) return;

  // Build lookup maps for endpoint & event handle ratios
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

  const resolveServiceHandleRatio = (
    serviceNode: LayoutNode,
    targetHandle?: string | null,
  ): number => {
    if (!targetHandle) return 0.5;

    if (
      targetHandle.startsWith("endpoint-in-") ||
      targetHandle.startsWith("endpoint-out-")
    ) {
      const epId = targetHandle.replace(/^endpoint-(in|out)-/, "");
      const r = endpointYRatio.get(epId);
      if (r !== undefined) return r;
    }

    if (targetHandle.startsWith("consumedEvents-in-")) {
      const evId = targetHandle.replace("consumedEvents-in-", "");
      const r = eventYRatio.get(evId);
      if (r !== undefined) return r;
    }

    if (
      targetHandle.startsWith("events-") ||
      targetHandle.startsWith("event-in-") ||
      targetHandle.startsWith("action-in-") ||
      targetHandle.startsWith("pageload-in-")
    ) {
      const evId = targetHandle.replace(/^(?:events-|event-in-|action-in-|pageload-in-)/, "");
      const r = eventYRatio.get(evId);
      if (r !== undefined) return r;
    }

    return getHandleYRatio(serviceNode, targetHandle);
  };

  // Group hanging transformers by their target service or webPage node ID
  const transformersByTarget = new Map<string, LayoutNode[]>();
  hangingTransformerNodes.forEach((tNode) => {
    // Prioritize edges connecting to a service or webPage node
    const targetEdge =
      hangingEdges.find((e) => {
        const otherId = e.source === tNode.id ? e.target : e.source;
        const otherNode = nodes.find((n) => n.id === otherId);
        return (
          otherNode &&
          (otherNode.type === "service" ||
            otherNode.type === "webPage" ||
            otherNode.type === "microservice" ||
            otherNode.type === "backend" ||
            otherNode.type === "api")
        );
      }) ||
      hangingEdges.find((e) => {
        const otherId = e.source === tNode.id ? e.target : e.source;
        const otherNode = nodes.find((n) => n.id === otherId);
        return (
          otherNode &&
          otherNode.type !== "state_store" &&
          otherNode.type !== "types" &&
          otherNode.type !== "transformer" &&
          otherNode.type !== "transformer_ref"
        );
      }) ||
      hangingEdges.find((e) => e.source === tNode.id || e.target === tNode.id);

    if (!targetEdge) return;
    const targetId = targetEdge.source === tNode.id ? targetEdge.target : targetEdge.source;
    if (!transformersByTarget.has(targetId)) {
      transformersByTarget.set(targetId, []);
    }
    transformersByTarget.get(targetId)!.push(tNode);
  });

  transformersByTarget.forEach((transformers, targetId) => {
    const targetNode = nodes.find((n) => n.id === targetId);
    let targetPos = positionsMap.get(targetId);
    if (!targetPos && secondaryToLeadPageMap?.has(targetId)) {
      targetPos = positionsMap.get(secondaryToLeadPageMap.get(targetId)!);
    }
    if (!targetNode || !targetPos) return;

    const { width: targetW, height: targetH } = getNodeDimensions(targetNode);
    const isTargetWebPage = targetNode.type === "webPage";

    if (isHorizontal) {
      // LR Layout: Transformers sit in a column next to the target node
      const gapX = 80;
      const minVerticalGap = 16;

      // Find max width among hanging transformers for this target
      const maxTransW = Math.max(
        ...transformers.map((t) => getNodeDimensions(t).width),
      );

      // Find maximum right coordinate of any connected upstream nodes (e.g. state_store / webApp)
      let upstreamMaxRight = -Infinity;
      transformers.forEach((tNode) => {
        const connectedEdges = hangingEdges.filter(
          (e) => e.source === tNode.id || e.target === tNode.id,
        );
        connectedEdges.forEach((e) => {
          const otherId = e.source === tNode.id ? e.target : e.source;
          if (otherId === targetId) return;
          const otherNode = nodes.find((n) => n.id === otherId);
          const otherPos = positionsMap.get(otherId);
          if (otherNode && otherPos) {
            const { width: otherW } = getNodeDimensions(otherNode);
            const otherRight = otherPos.x + otherW;
            if (otherRight > upstreamMaxRight) {
              upstreamMaxRight = otherRight;
            }
          }
        });
      });

      // LR Layout: Transformers sit in a column to the LEFT of the target node (service or webPage)
      // and must sit cleanly between any upstream store node and target node without overlap
      let targetX = targetPos.x - maxTransW - gapX;
      if (upstreamMaxRight !== -Infinity) {
        const minGapFromUpstream = 40;
        const minGapFromTarget = 40;
        if (targetPos.x - upstreamMaxRight >= maxTransW + minGapFromUpstream + minGapFromTarget) {
          const defaultTargetX = targetPos.x - maxTransW - gapX;
          if (defaultTargetX < upstreamMaxRight + minGapFromUpstream) {
            // Cleanly center in between upstream node and target node
            targetX = Math.round((upstreamMaxRight + targetPos.x - maxTransW) / 2);
          } else {
            targetX = defaultTargetX;
          }
        } else {
          // Space is tight: strictly prevent overlapping upstream store node
          targetX = Math.max(targetX, upstreamMaxRight + minGapFromUpstream);
        }
      }

      // Compute ideal Y for each transformer aligned with its connected handle
      interface TransItem {
        node: LayoutNode;
        width: number;
        height: number;
        idealY: number;
        y: number;
      }

      const items: TransItem[] = transformers.map((tNode) => {
        const { width, height } = getNodeDimensions(tNode);
        const edge = hangingEdges.find(
          (e) =>
            (e.source === tNode.id && e.target === targetId) ||
            (e.target === tNode.id && e.source === targetId),
        );
        const handleId =
          edge?.source === targetId ? edge.sourceHandle : edge?.targetHandle;
        const handleRatio = resolveServiceHandleRatio(targetNode, handleId);
        const targetHandleY = targetPos.y + handleRatio * targetH;
        const idealY = targetHandleY - height / 2;

        return {
          node: tNode,
          width,
          height,
          idealY,
          y: idealY,
        };
      });

      // Sort by ideal Y
      items.sort((a, b) => a.idealY - b.idealY);

      // Relax / resolve collisions so no transformers overlap
      if (items.length > 1) {
        // Forward pass: push overlapping items down
        for (let i = 1; i < items.length; i++) {
          const prev = items[i - 1]!;
          const curr = items[i]!;
          const minAllowedY = prev.y + prev.height + minVerticalGap;
          if (curr.y < minAllowedY) {
            curr.y = minAllowedY;
          }
        }

        // Calculate shift to center the stack around the average ideal Y
        const avgIdeal =
          items.reduce((sum, item) => sum + item.idealY + item.height / 2, 0) /
          items.length;
        const totalStackH =
          items[items.length - 1]!.y +
          items[items.length - 1]!.height -
          items[0]!.y;
        const currentCenter = items[0]!.y + totalStackH / 2;
        const shiftY = avgIdeal - currentCenter;

        items.forEach((item) => {
          item.y += shiftY;
        });
      }

      // Store final positions
      items.forEach((item) => {
        const posX = targetX + (maxTransW - item.width) / 2;
        positionsMap.set(item.node.id, {
          x: posX,
          y: item.y,
        });
      });
    } else {
      // TB Layout: Transformers sit in a row above the target node
      const gapY = 60;
      const minHorizontalGap = 20;

      const maxTransH = Math.max(
        ...transformers.map((t) => getNodeDimensions(t).height),
      );
      let targetY = targetPos.y - maxTransH - gapY;

      let upstreamMaxBottom = -Infinity;
      transformers.forEach((tNode) => {
        const connectedEdges = hangingEdges.filter(
          (e) => e.source === tNode.id || e.target === tNode.id,
        );
        connectedEdges.forEach((e) => {
          const otherId = e.source === tNode.id ? e.target : e.source;
          if (otherId === targetId) return;
          const otherNode = nodes.find((n) => n.id === otherId);
          const otherPos = positionsMap.get(otherId);
          if (otherNode && otherPos) {
            const { height: otherH } = getNodeDimensions(otherNode);
            const otherBottom = otherPos.y + otherH;
            if (otherBottom > upstreamMaxBottom) {
              upstreamMaxBottom = otherBottom;
            }
          }
        });
      });

      if (upstreamMaxBottom !== -Infinity) {
        const minGapFromUpstream = 30;
        const minGapFromTarget = 30;
        if (targetPos.y - upstreamMaxBottom >= maxTransH + minGapFromUpstream + minGapFromTarget) {
          const defaultTargetY = targetPos.y - maxTransH - gapY;
          if (defaultTargetY < upstreamMaxBottom + minGapFromUpstream) {
            targetY = Math.round((upstreamMaxBottom + targetPos.y - maxTransH) / 2);
          } else {
            targetY = defaultTargetY;
          }
        } else {
          targetY = Math.max(targetY, upstreamMaxBottom + minGapFromUpstream);
        }
      }

      const items = transformers.map((tNode) => {
        const { width, height } = getNodeDimensions(tNode);
        return {
          node: tNode,
          width,
          height,
          x: targetPos.x + targetW / 2 - width / 2,
        };
      });

      const totalW =
        items.reduce((s, it) => s + it.width, 0) +
        (items.length - 1) * minHorizontalGap;
      let startX = targetPos.x + targetW / 2 - totalW / 2;

      items.forEach((item) => {
        positionsMap.set(item.node.id, {
          x: startX,
          y: targetY + (maxTransH - item.height) / 2,
        });
        startX += item.width + minHorizontalGap;
      });
    }
  });
}
