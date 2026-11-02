import { describe, it, expect, vi } from "vitest";
import { performGraphLayout } from "../graphLayout";
import { performLangGraphLayout } from "../langGraphLayout";
import { performSchemaLayout } from "../schemaLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";

describe("Auto-layout filtering - only moved nodes emit position changes", () => {
  it("performGraphLayout only emits changes for nodes whose position actually moved", () => {
    const nodes: LayoutNode[] = [
      { id: "node-1", type: "service", position: { x: 0, y: 0 }, data: { label: "service-1" } },
      { id: "node-2", type: "service", position: { x: 0, y: 0 }, data: { label: "service-2" } },
    ];
    const edges: LayoutEdge[] = [
      { id: "e1", source: "node-1", target: "node-2", type: "connection" },
    ];

    let changes1: PositionNodeChange[] = [];
    const onNodesChange1 = vi.fn((c) => {
      changes1 = c;
    });

    performGraphLayout({
      nodes,
      edges,
      onNodesChange: onNodesChange1,
      fitView: vi.fn(),
      direction: "LR",
    });

    expect(onNodesChange1).toHaveBeenCalledTimes(1);
    expect(changes1.length).toBeGreaterThan(0);

    // Now update nodes to their newly calculated positions
    const laidOutNodes: LayoutNode[] = nodes.map((n) => {
      const change = changes1.find((c) => c.id === n.id);
      return {
        ...n,
        position: change?.position ?? n.position,
        sourcePosition: change?.sourcePosition ?? n.sourcePosition,
        targetPosition: change?.targetPosition ?? n.targetPosition,
      };
    });

    // Run auto-layout a second time on the already-laid-out nodes
    const onNodesChange2 = vi.fn();
    performGraphLayout({
      nodes: laidOutNodes,
      edges,
      onNodesChange: onNodesChange2,
      fitView: vi.fn(),
      direction: "LR",
    });

    // Since none of the nodes moved, onNodesChange should NOT be called
    expect(onNodesChange2).not.toHaveBeenCalled();
  });

  it("performGraphLayout only emits the single displaced node when others are already laid out", () => {
    const nodes: LayoutNode[] = [
      { id: "node-1", type: "service", position: { x: 0, y: 0 }, data: { label: "service-1" } },
      { id: "node-2", type: "service", position: { x: 0, y: 0 }, data: { label: "service-2" } },
    ];
    const edges: LayoutEdge[] = [
      { id: "e1", source: "node-1", target: "node-2", type: "connection" },
    ];

    let initialChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => { initialChanges = c; },
      fitView: vi.fn(),
      direction: "LR",
    });

    const pos1 = initialChanges.find((c) => c.id === "node-1")!.position;
    const pos2 = initialChanges.find((c) => c.id === "node-2")!.position;

    // node-1 is at its correct layout position, but node-2 was dragged far away to (9999, 9999)
    const testNodes: LayoutNode[] = [
      { id: "node-1", type: "service", position: pos1, data: { label: "service-1" } },
      { id: "node-2", type: "service", position: { x: 9999, y: 9999 }, data: { label: "service-2" } },
    ];

    let secondChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((c) => { secondChanges = c; });

    performGraphLayout({
      nodes: testNodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
      direction: "LR",
    });

    expect(onNodesChange).toHaveBeenCalledTimes(1);
    // Only node-2 should have changed, node-1 was already in place!
    expect(secondChanges.map((c) => c.id)).toEqual(["node-2"]);
  });

  it("performLangGraphLayout only emits changes when nodes actually move", () => {
    const nodes: LayoutNode[] = [
      { id: "start", type: "start", position: { x: 0, y: 0 }, data: { label: "start" } },
      { id: "step-1", type: "step", position: { x: 0, y: 0 }, data: { label: "step-1" } },
    ];
    const edges: LayoutEdge[] = [
      { id: "e1", source: "start", target: "step-1", type: "connection" },
    ];

    let changes1: PositionNodeChange[] = [];
    performLangGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => { changes1 = c; },
      fitView: vi.fn(),
      direction: "LR",
    });

    const laidOutNodes: LayoutNode[] = nodes.map((n) => {
      const change = changes1.find((c) => c.id === n.id);
      return {
        ...n,
        position: change?.position ?? n.position,
        sourcePosition: change?.sourcePosition ?? n.sourcePosition,
        targetPosition: change?.targetPosition ?? n.targetPosition,
      };
    });

    const onNodesChange2 = vi.fn();
    performLangGraphLayout({
      nodes: laidOutNodes,
      edges,
      onNodesChange: onNodesChange2,
      fitView: vi.fn(),
      direction: "LR",
    });

    expect(onNodesChange2).not.toHaveBeenCalled();
  });
});

