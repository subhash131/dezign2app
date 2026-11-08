import { describe, it, expect, beforeEach } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  isLayoutNode,
  getLayoutNodeDetails,
  resolvePageRefTargets,
  ensureLayoutNodeForTarget,
} from "../reference-connections/pageRefLayoutUtils";

const createMockNode = (partial: Partial<BackendNode> & { id: string; type: BackendNode["type"] }): BackendNode => ({
  position: { x: 0, y: 0 },
  fractionalIndex: "a0",
  data: { label: partial.id },
  ...partial,
});

const createMockEdge = (partial: Partial<BackendEdge> & { id: string; source: string; target: string }): BackendEdge => ({
  type: "connection",
  fractionalIndex: "a0",
  ...partial,
});

describe("pageRefLayoutUtils", () => {
  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [],
      edges: [],
    });
  });

  describe("isLayoutNode", () => {
    it("returns true for node with isLayout: true", () => {
      const node = createMockNode({
        id: "layout-1",
        type: "webPage",
        data: { label: "layout", isLayout: true },
      });
      expect(isLayoutNode(node)).toBe(true);
    });

    it("returns true for node with label 'layout'", () => {
      const node = createMockNode({
        id: "layout-2",
        type: "webPage",
        data: { label: "layout" },
      });
      expect(isLayoutNode(node)).toBe(true);
    });

    it("returns false for standard web page nodes", () => {
      const node = createMockNode({
        id: "page-1",
        type: "webPage",
        data: { label: "/chat/[id]" },
      });
      expect(isLayoutNode(node)).toBe(false);
    });
  });

  describe("getLayoutNodeDetails", () => {
    it("resolves zone name and routePath for layout connected to WebApp zone", () => {
      const webApp = createMockNode({
        id: "webapp-1",
        type: "webApp",
        data: {
          label: "My WebApp",
          zones: [
            { id: "zone-private", handleId: "private-in", name: "Protected Section", accessType: "protected" },
          ],
        },
      });

      const layoutNode = createMockNode({
        id: "layout-private",
        type: "webPage",
        position: { x: 300, y: 0 },
        data: { label: "layout", isLayout: true, zoneId: "zone-private" },
      });

      const edge = createMockEdge({
        id: "edge-1",
        source: "webapp-1",
        sourceHandle: "private-in",
        target: "layout-private",
        targetHandle: "page-in",
      });

      const details = getLayoutNodeDetails(layoutNode, [webApp, layoutNode], [edge]);
      expect(details.zoneSlug).toBe("protected-section");
      expect(details.displayTitle).toBe("(protected-section) Layout");
      expect(details.routePath).toBe("app/(protected-section)/layout.tsx");
      expect(details.isRoot).toBe(false);
    });

    it("resolves Root Layout when no zone is matched", () => {
      const rootLayoutNode = createMockNode({
        id: "layout-root",
        type: "webPage",
        data: { label: "layout", isLayout: true, isRoot: true },
      });

      const details = getLayoutNodeDetails(rootLayoutNode, [rootLayoutNode], []);
      expect(details.isRoot).toBe(true);
      expect(details.displayTitle).toBe("Root Layout");
      expect(details.routePath).toBe("app/layout.tsx");
    });
  });

  describe("resolvePageRefTargets", () => {
    it("correctly partitions pages and layouts, including WebApp zone layouts", () => {
      const webApp = createMockNode({
        id: "webapp-1",
        type: "webApp",
        data: {
          label: "WebApp",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
        },
      });

      const page1 = createMockNode({
        id: "page-1",
        type: "webPage",
        position: { x: 100, y: 100 },
        data: { label: "/", isRoot: true },
      });

      const page2 = createMockNode({
        id: "page-2",
        type: "webPage",
        position: { x: 100, y: 200 },
        data: { label: "/chat/[id]" },
      });

      const existingLayoutNode = createMockNode({
        id: "layout-priv-node",
        type: "webPage",
        position: { x: 400, y: 100 },
        data: { label: "layout", isLayout: true, zoneId: "zone-private" },
      });

      const edge = createMockEdge({
        id: "edge-layout",
        source: "webapp-1",
        sourceHandle: "private-in",
        target: "layout-priv-node",
        targetHandle: "page-in",
      });

      const targets = resolvePageRefTargets(
        [webApp, page1, page2, existingLayoutNode],
        [edge],
      );

      // Verify regular pages
      expect(targets.pages).toHaveLength(2);
      expect(targets.pages.map((p) => p.label)).toEqual(["/", "/chat/[id]"]);

      // Verify layouts
      expect(targets.layouts.length).toBeGreaterThanOrEqual(2);
      // Existing private layout
      const privateLayout = targets.layouts.find((l) => l.zoneSlug === "private-section");
      expect(privateLayout).toBeDefined();
      expect(privateLayout?.isExistingNode).toBe(true);
      expect(privateLayout?.nodeId).toBe("layout-priv-node");

      // Unspawned public layout option
      const publicLayout = targets.layouts.find((l) => l.zoneSlug === "public-section");
      expect(publicLayout).toBeDefined();
      expect(publicLayout?.isExistingNode).toBe(false);
      expect(publicLayout?.id).toContain("create-layout:webapp-1:zone-public");

      // Root layout option
      const rootLayout = targets.layouts.find((l) => l.isRoot);
      expect(rootLayout).toBeDefined();
    });
  });

  describe("ensureLayoutNodeForTarget", () => {
    it("returns existing node ID without mutating store if node already exists", () => {
      const existingNode = createMockNode({
        id: "layout-already-there",
        type: "webPage",
        data: { label: "layout", isLayout: true },
      });
      useBackendCanvasStore.setState({ nodes: [existingNode], edges: [] });

      const result = ensureLayoutNodeForTarget("layout-already-there", [existingNode], []);
      expect(result).toBe("layout-already-there");
      expect(useBackendCanvasStore.getState().nodes).toHaveLength(1);
    });

    it("spawns a new layout node and connects it to the WebApp zone when virtual creation key is passed", () => {
      const webApp = createMockNode({
        id: "webapp-main",
        type: "webApp",
        position: { x: 100, y: 100 },
        data: {
          label: "Dezign WebApp",
          zones: [
            { id: "zone-dashboard", handleId: "dash-handle", name: "Dashboard Section", accessType: "protected" },
          ],
        },
      });
      useBackendCanvasStore.setState({ nodes: [webApp], edges: [] });

      const newId = ensureLayoutNodeForTarget(
        "create-layout:webapp-main:zone-dashboard",
        [webApp],
        [],
      );

      expect(newId).toMatch(/^webPage-layout-/);
      const state = useBackendCanvasStore.getState();
      expect(state.nodes).toHaveLength(2);
      const createdLayout = state.nodes.find((n) => n.id === newId);
      expect(createdLayout?.data?.isLayout).toBe(true);
      expect(createdLayout?.data?.zoneId).toBe("zone-dashboard");

      // Verify edge from webApp to new layout
      expect(state.edges).toHaveLength(1);
      expect(state.edges[0]?.source).toBe("webapp-main");
      expect(state.edges[0]?.sourceHandle).toBe("dash-handle");
      expect(state.edges[0]?.target).toBe(newId);
    });
  });
});
