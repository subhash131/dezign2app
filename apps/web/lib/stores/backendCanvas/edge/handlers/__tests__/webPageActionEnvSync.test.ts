import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { handleWebPageActionConnect } from "../webPageActionConnect";
import { syncServiceBaseUrlToWebApp } from "../../utils";
import type { BackendNode, BackendEdge } from "@/types/canvas";

vi.mock("@/lib/utils/localEnvSync", () => ({
  saveLocalEnvVariable: vi.fn().mockResolvedValue(true),
  getLocalEnvVariable: vi.fn().mockReturnValue(null),
  fetchLocalEnvVariable: vi.fn().mockResolvedValue(null),
  deleteLocalEnvVariable: vi.fn().mockResolvedValue(true),
  cleanEnvVarName: (v: string) => v,
}));

describe("WebApp Node Environment Variable Creation for Connected Services", () => {
  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [],
      edges: [],
      endpoints: [],
      events: [],
    });
  });

  it("syncServiceBaseUrlToWebApp creates NEXT_PUBLIC_<SERVICE>_BASE_URL on WebApp node", () => {
    const webAppNode: BackendNode = {
      id: "node-web-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        port: "3000",
        envVars: [
          { id: "e1", name: "PORT" },
          { id: "e2", name: "NEXT_PUBLIC_APP_URL" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-srv-1",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 400, y: 0 },
      data: {
        label: "Demo Service",
        port: "8081",
      },
    };

    let updatedNodeData: any = null;
    const updateNode = vi.fn((id, updates) => {
      updatedNodeData = updates.data;
    });

    const changed = syncServiceBaseUrlToWebApp({
      webAppNode,
      serviceNode,
      updateNode,
    });

    expect(changed).toBe(true);
    expect(updateNode).toHaveBeenCalled();
    const varNames = updatedNodeData.envVars.map((v: any) => v.name);
    expect(varNames).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    // Should NOT add redundant un-prefixed variable
    expect(varNames).not.toContain("DEMO_SERVICE_BASE_URL");
  });

  it("syncServiceBaseUrlToWebApp appends _SERVICE when service label lacks Service (e.g. Conversations)", () => {
    const webAppNode: BackendNode = {
      id: "node-web-conv",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        port: "3000",
        envVars: [
          { id: "e1", name: "PORT" },
          { id: "e2", name: "NEXT_PUBLIC_CONVERSATIONS_BASE_URL" }, // legacy name to migrate
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-srv-conv",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 400, y: 0 },
      data: {
        label: "Conversations",
        port: "8082",
      },
    };

    let updatedNodeData: any = null;
    const updateNode = vi.fn((id, updates) => {
      updatedNodeData = updates.data;
    });

    const changed = syncServiceBaseUrlToWebApp({
      webAppNode,
      serviceNode,
      updateNode,
    });

    expect(changed).toBe(true);
    const varNames = updatedNodeData.envVars.map((v: any) => v.name);
    expect(varNames).toContain("NEXT_PUBLIC_CONVERSATIONS_SERVICE_BASE_URL");
    expect(varNames).not.toContain("NEXT_PUBLIC_CONVERSATIONS_BASE_URL");
    expect(varNames).not.toContain("CONVERSATIONS_SERVICE_BASE_URL");
  });

  it("syncServiceBaseUrlToWebApp cleans up redundant un-prefixed base URL if present", () => {
    const webAppNode: BackendNode = {
      id: "node-web-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        port: "3000",
        envVars: [
          { id: "e1", name: "PORT" },
          { id: "e2", name: "DEMO_SERVICE_BASE_URL" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-srv-1",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 400, y: 0 },
      data: {
        label: "Demo Service",
        port: "8081",
      },
    };

    let updatedNodeData: any = null;
    const updateNode = vi.fn((id, updates) => {
      updatedNodeData = updates.data;
    });

    syncServiceBaseUrlToWebApp({
      webAppNode,
      serviceNode,
      updateNode,
    });

    const varNames = updatedNodeData.envVars.map((v: any) => v.name);
    expect(varNames).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(varNames).not.toContain("DEMO_SERVICE_BASE_URL");
  });

  it("syncServiceBaseUrlToWebApp does not duplicate variable if already exists", () => {
    const webAppNode: BackendNode = {
      id: "node-web-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        port: "3000",
        envVars: [
          { id: "e1", name: "PORT" },
          { id: "e2", name: "NEXT_PUBLIC_DEMO_SERVICE_BASE_URL" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-srv-1",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 400, y: 0 },
      data: {
        label: "Demo Service",
        port: "8081",
      },
    };

    const updateNode = vi.fn();
    const changed = syncServiceBaseUrlToWebApp({
      webAppNode,
      serviceNode,
      updateNode,
    });

    expect(changed).toBe(false);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it("handleWebPageActionConnect automatically adds NEXT_PUBLIC_<SERVICE>_BASE_URL to WebApp node", () => {
    const webAppNode: BackendNode = {
      id: "node-web",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        port: "3000",
        envVars: [
          { id: "v1", name: "PORT" },
          { id: "v2", name: "NEXT_PUBLIC_APP_URL" },
        ],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page",
      type: "webPage",
      fractionalIndex: "a1",
      position: { x: 300, y: 0 },
      data: {
        label: "Chat",
        sections: [
          {
            id: "sec-1",
            name: "Main",
            actions: [
              {
                id: "action-test",
                name: "testAction",
                event: "click",
                actionSteps: [],
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service",
      type: "service",
      fractionalIndex: "a2",
      position: { x: 600, y: 0 },
      data: {
        label: "Demo Service",
        port: "8081",
        endpoints: [
          {
            id: "ep-test-route",
            name: "test-route",
            type: "GET",
          },
        ],
      },
    };

    const edgeToWebPage: BackendEdge = {
      id: "e-web-page",
      source: "node-web",
      target: "node-page",
      type: "connection",
      fractionalIndex: "a0",
    };

    useBackendCanvasStore.setState({
      nodes: [webAppNode, webPageNode, serviceNode],
      edges: [edgeToWebPage],
      endpoints: [
        {
          id: "ep-test-route",
          name: "test-route",
          type: "GET",
          nodeId: "node-service",
        },
      ],
    });

    const newEdge: BackendEdge = {
      id: "e-action-endpoint",
      source: "node-page",
      sourceHandle: "events-action-test",
      target: "node-service",
      targetHandle: "endpoints-in-ep-test-route",
      type: "connection",
      fractionalIndex: "a1",
    };

    const handled = handleWebPageActionConnect({
      set: useBackendCanvasStore.setState,
      get: useBackendCanvasStore.getState,
      connection: {
        source: newEdge.source,
        sourceHandle: newEdge.sourceHandle,
        target: newEdge.target,
        targetHandle: newEdge.targetHandle,
      },
      sourceNode: webPageNode,
      targetNode: serviceNode,
      newEdge,
    });

    expect(handled).toBe(true);

    const store = useBackendCanvasStore.getState();
    const updatedWebApp = store.nodes.find((n) => n.id === "node-web");
    expect(updatedWebApp).toBeDefined();

    const envNames = updatedWebApp?.data?.envVars?.map((v: any) => v.name);
    expect(envNames).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(envNames).not.toContain("DEMO_SERVICE_BASE_URL");
  });
});
