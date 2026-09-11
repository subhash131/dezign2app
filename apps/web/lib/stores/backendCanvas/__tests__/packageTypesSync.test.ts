import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  syncPackageTypesToCanvas,
  createExtendedTypeNode,
  fetchPackageTypesFromNodeModules,
} from "../packageTypesSync";
import { SECTION_PRESETS } from "@workspace/canvas";
import { extractPackageTypesFromNodeModules } from "@/lib/server/packageTypeExtractor";

describe("packageTypesSync - Dynamic Inference from node_modules", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-pkg-types-test");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (urlStr.includes("/api/packages/extract-types")) {
        const url = new URL(urlStr, "http://localhost:3000");
        const pkg = url.searchParams.get("pkg") || "";
        const result = extractPackageTypesFromNodeModules(pkg);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    "infers real exported types dynamically from node_modules for installed packages",
    async () => {
      // Extract types directly from node_modules for @xyflow/react
      const result = await fetchPackageTypesFromNodeModules("@xyflow/react");
      expect(result.installed).toBe(true);
      expect(result.types.length).toBeGreaterThan(0);

      const typeNames = result.types.map((t) => t.name);
      expect(typeNames).toContain("Node");
      expect(typeNames).toContain("Edge");
      expect(typeNames.length).toBeGreaterThan(10);

      const nodeType = result.types.find((t) => t.name === "Node");
      expect(nodeType).toBeDefined();
      expect(nodeType?.packageSource).toBe("@xyflow/react");
      expect(nodeType?.isReadOnly).toBe(true);
      expect(nodeType?.isExtendable).toBe(true);
    },
    15000,
  );

  it(
    "infers real exported types dynamically from node_modules for lucide-react",
    async () => {
      const result = await fetchPackageTypesFromNodeModules("lucide-react");
      expect(result.installed).toBe(true);
      expect(result.types.length).toBeGreaterThan(0);

      const typeNames = result.types.map((t) => t.name);
      expect(typeNames).toContain("LucideProps");

      const propsType = result.types.find((t) => t.name === "LucideProps");
      expect(propsType).toBeDefined();
      expect(propsType?.packageSource).toBe("lucide-react");
      expect(propsType?.isReadOnly).toBe(true);
    },
    15000,
  );

  it("flags uninstalled package with isInstalled: false, 0 types, and install error", async () => {
    const store = useBackendCanvasStore.getState();

    store.addNode({
      id: "web-app-1",
      type: "webApp",
      position: { x: 500, y: 200 },
      data: { label: "Portal App" },
    });

    const uninstalledPkg = "@dezign2app-tests/non-existent-lib";
    syncPackageTypesToCanvas("web-app-1", [uninstalledPkg]);

    // Give async extraction a moment to complete
    await new Promise((r) => setTimeout(r, 100));

    const state = useBackendCanvasStore.getState();
    const typesNode = state.nodes.find(
      (n) => n.type === "types" && n.data?.packageName === uninstalledPkg,
    );

    expect(typesNode).toBeDefined();
    expect(typesNode?.data?.label).toBe(uninstalledPkg);
    expect(typesNode?.data?.isPackageNode).toBe(true);
    expect(typesNode?.data?.isInstalled).toBe(false);
    expect(typesNode?.data?.installError).toContain("pnpm i");
    expect(typesNode?.data?.types).toHaveLength(0);
  });

  it("creates SEPARATE TypesNodes when multiple packages are added", async () => {
    const store = useBackendCanvasStore.getState();

    store.addNode({
      id: "web-app-1",
      type: "webApp",
      position: { x: 500, y: 200 },
      data: { label: "Portal App" },
    });

    syncPackageTypesToCanvas("web-app-1", ["@xyflow/react", "lucide-react"]);

    // Wait for async inspection
    await new Promise((r) => setTimeout(r, 500));

    const state = useBackendCanvasStore.getState();
    const typesNodes = state.nodes.filter((n) => n.type === "types");
    expect(typesNodes).toHaveLength(2);

    const xyflowNode = typesNodes.find((n) => n.data?.packageName === "@xyflow/react");
    const lucideNode = typesNodes.find((n) => n.data?.packageName === "lucide-react");

    expect(xyflowNode).toBeDefined();
    expect(lucideNode).toBeDefined();

    expect(xyflowNode?.data?.label).toBe("@xyflow/react");
    expect(lucideNode?.data?.label).toBe("lucide-react");

    expect(xyflowNode?.data?.isPackageNode).toBe(true);
    expect(lucideNode?.data?.isPackageNode).toBe(true);

    // Each node has its own distinct type-reference edge
    const edges = state.edges.filter((e) => e.type === "type-reference" && e.target === "web-app-1");
    expect(edges).toHaveLength(2);
    expect(edges.some((e) => e.source === xyflowNode?.id)).toBe(true);
    expect(edges.some((e) => e.source === lucideNode?.id)).toBe(true);
  });

  it("creates 1 single extended TypesNode and maps edges row-to-row when extending multiple types", async () => {
    const store = useBackendCanvasStore.getState();

    store.addNode({
      id: "web-app-1",
      type: "webApp",
      position: { x: 500, y: 200 },
      data: { label: "Portal App" },
    });

    syncPackageTypesToCanvas("web-app-1", ["@xyflow/react"]);
    await new Promise((r) => setTimeout(r, 800));

    const stateBefore = useBackendCanvasStore.getState();
    const baseTypesNode = stateBefore.nodes.find(
      (n) => n.type === "types" && n.data?.packageName === "@xyflow/react",
    );
    expect(baseTypesNode).toBeDefined();
    if (!baseTypesNode) return;

    const nodeBaseType = baseTypesNode.data?.types?.find((t) => t.name === "Node");
    const edgeBaseType = baseTypesNode.data?.types?.find((t) => t.name === "Edge");
    expect(nodeBaseType).toBeDefined();
    expect(edgeBaseType).toBeDefined();
    if (!nodeBaseType || !edgeBaseType) return;

    // 1. Extend first type: "Node"
    createExtendedTypeNode(baseTypesNode.id, nodeBaseType.id);

    const stateAfterFirst = useBackendCanvasStore.getState();
    const extendedNodesFirst = stateAfterFirst.nodes.filter(
      (n) => n.type === "types" && n.data?.isExtended === true,
    );
    expect(extendedNodesFirst).toHaveLength(1);
    const extendedNode = extendedNodesFirst[0];
    expect(extendedNode).toBeDefined();
    if (!extendedNode) return;

    expect(extendedNode.data?.extendedFromNodeId).toBe(baseTypesNode.id);
    expect(extendedNode.data?.types).toHaveLength(1);

    const firstExtType = extendedNode.data?.types?.[0];
    expect(firstExtType?.name).toBe("CustomNode");
    expect(firstExtType?.extendedFrom).toBe("Node");
    expect(firstExtType?.extendedFromTypeId).toBe(nodeBaseType.id);

    // Verify row-to-row inheritance edge for first type
    const firstEdge = stateAfterFirst.edges.find(
      (e) =>
        e.data?.isExtensionEdge === true &&
        e.source === baseTypesNode.id &&
        e.target === extendedNode.id &&
        e.sourceHandle === `type-out-${nodeBaseType.id}` &&
        e.targetHandle === `type-in-${firstExtType?.id}`,
    );
    expect(firstEdge).toBeDefined();
    expect(firstEdge?.data?.label).toBe("extends");

    // 2. Extend second type from the same package: "Edge"
    createExtendedTypeNode(baseTypesNode.id, edgeBaseType.id);

    const stateAfterSecond = useBackendCanvasStore.getState();
    const extendedNodesSecond = stateAfterSecond.nodes.filter(
      (n) => n.type === "types" && n.data?.isExtended === true,
    );
    // MUST still be exactly 1 extended TypesNode!
    expect(extendedNodesSecond).toHaveLength(1);

    const updatedExtNode = extendedNodesSecond[0];
    expect(updatedExtNode).toBeDefined();
    if (!updatedExtNode) return;

    expect(updatedExtNode.id).toBe(extendedNode.id);
    expect(updatedExtNode.data?.types).toHaveLength(2);

    const secondExtType = updatedExtNode.data?.types?.find((t) => t.name === "CustomEdge");
    expect(secondExtType).toBeDefined();
    expect(secondExtType?.extendedFrom).toBe("Edge");
    expect(secondExtType?.extendedFromTypeId).toBe(edgeBaseType.id);

    // Verify row-to-row inheritance edge for second type
    const secondEdge = stateAfterSecond.edges.find(
      (e) =>
        e.data?.isExtensionEdge === true &&
        e.source === baseTypesNode.id &&
        e.target === updatedExtNode.id &&
        e.sourceHandle === `type-out-${edgeBaseType.id}` &&
        e.targetHandle === `type-in-${secondExtType?.id}`,
    );
    expect(secondEdge).toBeDefined();
    expect(secondEdge?.data?.label).toBe("extends");

    // Total extension edges connecting the two nodes is 2 (one per extended type pair)
    const allExtEdges = stateAfterSecond.edges.filter(
      (e) =>
        e.data?.isExtensionEdge === true &&
        e.source === baseTypesNode.id &&
        e.target === updatedExtNode.id,
    );
    expect(allExtEdges).toHaveLength(2);
  });

  it("ensures section presets include populated action requestBody schemas for mutation actions", () => {
    SECTION_PRESETS.forEach((preset) => {
      expect(preset.defaultActions.length).toBeGreaterThan(0);
      const mutationActions = preset.defaultActions.filter((a) => a.requestBody);
      expect(mutationActions.length).toBeGreaterThan(0);
      mutationActions.forEach((action) => {
        expect(action.name).toBeTruthy();
        expect(action.event).toBeTruthy();
        expect(typeof action.requestBody).toBe("object");
        expect(Object.keys(action.requestBody || {}).length).toBeGreaterThan(0);
      });
    });
  });
});
