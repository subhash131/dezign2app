import { describe, it, expect, vi } from "vitest";
import { performGraphLayout } from "../graphLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";

describe("hangingReferenceLayout - Auto-Layout for Hanging Reference Nodes (DB Ref & Redis Cache)", () => {
  it("positions db_ref and redis-cache nodes in a dedicated column right after the service node", () => {
    const nodes: LayoutNode[] = [
      {
        id: "service-products",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "products",
          endpoints: [{ id: "ep-test", name: "GET test" }],
        },
      },
      {
        id: "redis-cache-1",
        type: "redis-cache",
        position: { x: 0, y: 0 },
        data: { label: "Products cache" },
      },
      {
        id: "db-ref-1",
        type: "db_ref",
        position: { x: 0, y: 0 },
        data: { label: "products" },
      },
      {
        id: "kafka-1",
        type: "kafka",
        position: { x: 0, y: 0 },
        data: { label: "Kafka" },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-service-redis",
        source: "service-products",
        target: "redis-cache-1",
        sourceHandle: "endpoint-out-ep-test",
        targetHandle: "database-target",
        type: "connection",
      },
      {
        id: "e-service-db",
        source: "service-products",
        target: "db-ref-1",
        sourceHandle: "endpoint-out-ep-test",
        targetHandle: "database-target",
        type: "connection",
      },
      {
        id: "e-service-kafka",
        source: "service-products",
        target: "kafka-1",
        sourceHandle: "endpoint-out-ep-test",
        targetHandle: "topic-in",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEndpoints: [{ id: "ep-test", nodeId: "service-products", name: "ep-test", type: "GET" }],
    });

    expect(appliedChanges.length).toBe(4);

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const servicePos = posMap.get("service-products")!;
    const redisPos = posMap.get("redis-cache-1")!;
    const dbRefPos = posMap.get("db-ref-1")!;
    const kafkaPos = posMap.get("kafka-1")!;

    // 1. Both reference nodes are placed to the right of the service node (servicePos.x + serviceWidth + gap)
    expect(redisPos.x).toBeGreaterThan(servicePos.x);
    expect(dbRefPos.x).toBeGreaterThan(servicePos.x);
    expect(redisPos.x).toBeCloseTo(dbRefPos.x, 0);

    // 2. Both reference nodes do not vertically overlap
    const redisTop = redisPos.y;
    const redisBottom = redisPos.y + 80;
    const dbTop = dbRefPos.y;
    const dbBottom = dbRefPos.y + 80;

    const overlaps =
      Math.max(redisTop, dbTop) < Math.min(redisBottom, dbBottom);
    expect(overlaps).toBe(false);

    // 3. Kafka is in the downstream DAG flow and pushed strictly to the right of the reference node column
    expect(kafkaPos.x).toBeGreaterThanOrEqual(dbRefPos.x + 240);
  });

  it("positions langgraph node in the reference column alongside db_ref when connected to service", () => {
    // Recreates user canvas: conversations (service), db_ref (table ref), demo (langgraph), kafka
    const nodes: LayoutNode[] = [
      {
        id: "service-conversations",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "conversations",
          endpoints: [
            { id: "ep-get", name: "GET /" },
            { id: "ep-send", name: "POST send message" },
          ],
        },
      },
      {
        id: "table-ref-conversations",
        type: "db_ref",
        position: { x: 0, y: 0 },
        data: { label: "conversations" },
      },
      {
        id: "langgraph-demo",
        type: "langgraph",
        position: { x: 0, y: 0 },
        data: { label: "demo" },
      },
      {
        id: "kafka-node",
        type: "kafka",
        position: { x: 0, y: 0 },
        data: { label: "kafka" },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-service-db",
        source: "service-conversations",
        target: "table-ref-conversations",
        sourceHandle: "endpoint-out-ep-send",
        targetHandle: "database-target",
        type: "connection",
      },
      {
        id: "e-service-langgraph",
        source: "service-conversations",
        target: "langgraph-demo",
        sourceHandle: "endpoint-out-ep-send",
        targetHandle: "input-start",
        type: "connection",
      },
      {
        id: "e-service-kafka",
        source: "service-conversations",
        target: "kafka-node",
        sourceHandle: "publishedEvents-out-pub-msg",
        targetHandle: "topic-in",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEndpoints: [
        { id: "ep-get", nodeId: "service-conversations", name: "GET /", type: "GET" },
        { id: "ep-send", nodeId: "service-conversations", name: "POST send message", type: "POST" },
      ],
      storeEvents: [
        { id: "pub-msg", nodeId: "service-conversations", name: "Publish Message Sent", variant: "publish" },
      ],
    });

    expect(appliedChanges.length).toBe(4);

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const servicePos = posMap.get("service-conversations")!;
    const dbRefPos = posMap.get("table-ref-conversations")!;
    const langGraphPos = posMap.get("langgraph-demo")!;
    const kafkaPos = posMap.get("kafka-node")!;

    // 1. Both db_ref and langgraph are placed in the reference column immediately to the right of the service node
    expect(dbRefPos.x).toBeGreaterThan(servicePos.x);
    expect(langGraphPos.x).toBeGreaterThan(servicePos.x);
    expect(langGraphPos.x).toBeCloseTo(dbRefPos.x, 0);

    // 2. Both reference nodes do not vertically overlap, and db_ref sits above langgraph
    expect(dbRefPos.y + 80).toBeLessThanOrEqual(langGraphPos.y);

    // 3. Kafka is in the downstream DAG flow and pushed strictly to the right of the reference column (including langgraph width of 280)
    expect(kafkaPos.x).toBeGreaterThanOrEqual(langGraphPos.x + 280);
  });

  it("handles reverse connection from langgraph node to service", () => {
    const nodes: LayoutNode[] = [
      {
        id: "service-1",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "service",
          endpoints: [{ id: "ep-1", name: "GET /test" }],
        },
      },
      {
        id: "lg-1",
        type: "langgraph",
        position: { x: 0, y: 0 },
        data: { label: "agent" },
      },
    ];

    // Edge drawn from langgraph to service
    const edges: LayoutEdge[] = [
      {
        id: "e-reverse",
        source: "lg-1",
        target: "service-1",
        sourceHandle: "input-start",
        targetHandle: "endpoint-out-ep-1",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
      direction: "LR",
      storeEndpoints: [{ id: "ep-1", nodeId: "service-1", name: "test", type: "GET" }],
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    const servicePos = posMap.get("service-1")!;
    const lgPos = posMap.get("lg-1")!;

    expect(lgPos.x).toBeGreaterThan(servicePos.x);
    expect(lgPos.x).toBeCloseTo(servicePos.x + 280 + 80, 0);
  });
});
