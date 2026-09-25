import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";
import { classifyHandle } from "@workspace/canvas/utils";
import { isValidConnection } from "@workspace/canvas/validators";
import { cleanupDeletedEdgesState, cleanupDeletedNodesState } from "../stateCleanup";
import { BackendCanvasState } from "../types";

describe("StateStore <-> WebPage & TypesNode Connection and Cleanup", () => {
  describe("classifyHandle and isValidConnection taxonomy", () => {
    it("correctly classifies store and section handles", () => {
      expect(classifyHandle("state_store", "store-field-out-f1", "source")).toBe("store-out");
      expect(classifyHandle("state_store", "store-field-in-f1", "target")).toBe("store-in");
      expect(classifyHandle("webPage", "section-state-in-sec1-st1", "target")).toBe("page-section-in");
      expect(classifyHandle("types", "type-out-type1", "source")).toBe("type-out");
    });

    it("validates store-field-out to section-state-in connection", () => {
      const result = isValidConnection(
        "state_store",
        "store-field-out-field-123",
        "webPage",
        "section-state-in-sec-main-st-456",
      );
      expect(result.valid).toBe(true);
    });

    it("validates type-out to section-state-in and store-field-in connections", () => {
      const typeToSection = isValidConnection(
        "types",
        "type-out-chat-type",
        "webPage",
        "section-state-in-sec-main-st-456",
      );
      expect(typeToSection.valid).toBe(true);

      const typeToStoreField = isValidConnection(
        "types",
        "type-out-chat-type",
        "state_store",
        "store-field-in-field-123",
      );
      expect(typeToStoreField.valid).toBe(true);
    });
  });

  describe("onConnect and handleFrontendConnect integration", () => {
    beforeEach(() => {
      useBackendCanvasStore.getState().reset("proj-state-test");
    });

    it("wires store field to webPage section state on connection", () => {
      const store = useBackendCanvasStore.getState();

      const storeNode: BackendNode = {
        id: "store-1",
        type: "state_store",
        position: { x: 0, y: 0 },
        data: {
          label: "conversations",
          fields: [
            { id: "f1", name: "chats", type: "Chat[]", defaultValue: "[]" },
            { id: "f2", name: "conversations", type: "Message[]", defaultValue: "[]" },
          ],
        },
        fractionalIndex: "a0",
      };

      const pageNode: BackendNode = {
        id: "page-1",
        type: "webPage",
        position: { x: 400, y: 0 },
        data: {
          label: "Main Page",
          sections: [
            {
              id: "sec-1",
              name: "Main Section",
              renderMode: "client",
              actions: [],
              stateObjects: [
                {
                  id: "st-1",
                  name: "placeholder",
                  type: "string",
                  storeId: "store-1",
                },
              ],
            },
          ],
        },
        fractionalIndex: "a1",
      };

      store.setNodesAndEdges([storeNode, pageNode], [], [], [], [], "proj-state-test");

      // Connect store-field-out-f1 to section-state-in-sec-1-st-1
      useBackendCanvasStore.getState().onConnect({
        source: "store-1",
        target: "page-1",
        sourceHandle: "store-field-out-f1",
        targetHandle: "section-state-in-sec-1-st-1",
      });

      const updatedPage = useBackendCanvasStore.getState().nodes.find((n) => n.id === "page-1");
      const section = updatedPage?.data?.sections?.[0];
      const boundState = section?.stateObjects?.[0];

      expect(boundState?.name).toBe("chats");
      expect(boundState?.type).toBe("Chat[]");
      expect(boundState?.fieldId).toBe("f1");
      expect(boundState?.storeId).toBe("store-1");

      const edge = useBackendCanvasStore.getState().edges.find(
        (e) => e.source === "store-1" && e.target === "page-1",
      );
      expect(edge).toBeDefined();
      expect(edge?.data?.isStateSubscription).toBe(true);
      expect(edge?.data?.fieldName).toBe("chats");
    });

    it("binds custom type contract to section state object and store field", () => {
      const store = useBackendCanvasStore.getState();

      const typesNode: BackendNode = {
        id: "types-1",
        type: "types",
        position: { x: 0, y: 0 },
        data: {
          label: "Types",
          types: [
            { id: "t1", name: "Chat", fields: [], kind: "interface" },
            { id: "t2", name: "Message", fields: [], kind: "interface" },
          ],
        },
        fractionalIndex: "a0",
      };

      const storeNode: BackendNode = {
        id: "store-1",
        type: "state_store",
        position: { x: 300, y: 0 },
        data: {
          label: "conversations",
          fields: [{ id: "f1", name: "chats", type: "any[]", isArray: true }],
        },
        fractionalIndex: "a1",
      };

      const pageNode: BackendNode = {
        id: "page-1",
        type: "webPage",
        position: { x: 600, y: 0 },
        data: {
          label: "Main Page",
          sections: [
            {
              id: "sec-1",
              name: "Main Section",
              renderMode: "client",
              actions: [],
              stateObjects: [
                {
                  id: "st-msg",
                  name: "messages",
                  type: "any[]",
                },
              ],
            },
          ],
        },
        fractionalIndex: "a2",
      };

      store.setNodesAndEdges([typesNode, storeNode, pageNode], [], [], [], [], "proj-state-test");

      // 1. Connect Types -> Store field
      useBackendCanvasStore.getState().onConnect({
        source: "types-1",
        target: "store-1",
        sourceHandle: "type-out-t1",
        targetHandle: "store-field-in-f1",
      });

      const updatedStore = useBackendCanvasStore.getState().nodes.find((n) => n.id === "store-1");
      expect(updatedStore?.data?.fields?.[0]?.type).toBe("Chat[]");

      // 2. Connect Types -> WebPage section state
      useBackendCanvasStore.getState().onConnect({
        source: "types-1",
        target: "page-1",
        sourceHandle: "type-out-t2",
        targetHandle: "section-state-in-sec-1-st-msg",
      });

      const updatedPage = useBackendCanvasStore.getState().nodes.find((n) => n.id === "page-1");
      expect(updatedPage?.data?.sections?.[0]?.stateObjects?.[0]?.type).toBe("Message[]");
    });
  });

  describe("stateCleanup edge and node deletion handlers", () => {
    it("cleans up section state object when state subscription edge is removed", () => {
      const mockState: BackendCanvasState = {
        nodes: [
          {
            id: "page-1",
            type: "webPage",
            position: { x: 0, y: 0 },
            data: {
              label: "Page",
              sections: [
                {
                  id: "sec-1",
                  name: "Main",
                  stateObjects: [
                    { id: "st-chats", name: "chats", storeId: "store-1", fieldId: "f1" },
                    { id: "st-other", name: "other" },
                  ],
                },
              ],
            },
            fractionalIndex: "a0",
          },
        ],
        edges: [
          {
            id: "edge-state-sub",
            source: "store-1",
            target: "page-1",
            sourceHandle: "store-field-out-f1",
            targetHandle: "section-state-in-sec-1-st-chats",
            type: "connection",
            data: { isStateSubscription: true },
          },
        ],
        endpoints: [],
        events: [],
        pendingNodeUpserts: [],
        pendingNodeRemovals: [],
        pendingEdgeUpserts: [],
        pendingEdgeRemovals: [],
        pendingEndpointUpserts: [],
        pendingEndpointRemovals: [],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
      } as unknown as BackendCanvasState;

      const result = cleanupDeletedEdgesState(mockState, ["edge-state-sub"]);

      expect(result.edges).toHaveLength(0);
      expect(result.nodes).toBeDefined();
      const updatedPage = result.nodes?.find((n) => n.id === "page-1");
      const remainingStates = updatedPage?.data?.sections?.[0]?.stateObjects;
      expect(remainingStates).toHaveLength(1);
      expect(remainingStates?.[0]?.id).toBe("st-other");
    });

    it("resets custom type to any[] when type reference edge is removed", () => {
      const mockState: BackendCanvasState = {
        nodes: [
          {
            id: "store-1",
            type: "state_store",
            position: { x: 0, y: 0 },
            data: {
              fields: [{ id: "f1", name: "chats", type: "Chat[]", isArray: true }],
            },
            fractionalIndex: "a0",
          },
        ],
        edges: [
          {
            id: "edge-type-ref",
            source: "types-1",
            target: "store-1",
            sourceHandle: "type-out-t1",
            targetHandle: "store-field-in-f1",
            type: "type-reference",
            data: { isTypeReference: true },
          },
        ],
        endpoints: [],
        events: [],
        pendingNodeUpserts: [],
        pendingNodeRemovals: [],
        pendingEdgeUpserts: [],
        pendingEdgeRemovals: [],
        pendingEndpointUpserts: [],
        pendingEndpointRemovals: [],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
      } as unknown as BackendCanvasState;

      const result = cleanupDeletedEdgesState(mockState, ["edge-type-ref"]);

      expect(result.edges).toHaveLength(0);
      const updatedStore = result.nodes?.find((n) => n.id === "store-1");
      expect(updatedStore?.data?.fields?.[0]?.type).toBe("any[]");
    });

    it("removes section stateObjects referencing a deleted state_store node", () => {
      const mockState: BackendCanvasState = {
        nodes: [
          {
            id: "store-1",
            type: "state_store",
            position: { x: 0, y: 0 },
            data: { label: "conversations" },
            fractionalIndex: "a0",
          },
          {
            id: "page-1",
            type: "webPage",
            position: { x: 300, y: 0 },
            data: {
              label: "Page",
              sections: [
                {
                  id: "sec-1",
                  stateObjects: [
                    { id: "st-chats", storeId: "store-1" },
                    { id: "st-local", storeId: "store-local" },
                  ],
                },
              ],
            },
            fractionalIndex: "a1",
          },
        ],
        edges: [],
        endpoints: [],
        events: [],
        identityProviders: [],
        pendingNodeUpserts: [],
        pendingNodeRemovals: [],
        pendingEdgeUpserts: [],
        pendingEdgeRemovals: [],
        pendingEndpointUpserts: [],
        pendingEndpointRemovals: [],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
        pendingIdentityProviderRemovals: [],
      } as unknown as BackendCanvasState;

      const result = cleanupDeletedNodesState(mockState, ["store-1"]);

      expect(result.nodes).toBeDefined();
      const updatedPage = result.nodes?.find((n) => n.id === "page-1");
      const remainingStates = updatedPage?.data?.sections?.[0]?.stateObjects;
      expect(remainingStates).toHaveLength(1);
      expect(remainingStates?.[0]?.id).toBe("st-local");
    });

    it("wires WebPage action to StateStore left handle and auto-syncs storeActionBinding", () => {
      const store = useBackendCanvasStore.getState();

      const storeNode: BackendNode = {
        id: "store-cart",
        type: "state_store",
        position: { x: 400, y: 0 },
        data: {
          label: "CartStore",
          fields: [{ id: "f-items", name: "items", type: "string[]" }],
          actions: [{ id: "act-add", name: "addItem", actionType: "append", targetFieldId: "f-items" }],
        },
        fractionalIndex: "a1",
      };

      const pageNode: BackendNode = {
        id: "page-shop",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "Shop Page",
          sections: [
            {
              id: "sec-products",
              name: "Products",
              renderMode: "client",
              actions: [
                {
                  id: "act-buy",
                  name: "BuyNow",
                  event: "click",
                },
              ],
            },
          ],
        },
        fractionalIndex: "a0",
      };

      store.setNodesAndEdges([pageNode, storeNode], [], [], [], [], "proj-state-test");

      // Connect events-act-buy to store-action-in-left-act-add
      useBackendCanvasStore.getState().onConnect({
        source: "page-shop",
        target: "store-cart",
        sourceHandle: "events-act-buy",
        targetHandle: "store-action-in-left-act-add",
      });

      const updatedPage = useBackendCanvasStore.getState().nodes.find((n) => n.id === "page-shop");
      const action = updatedPage?.data?.sections?.[0]?.actions?.[0];

      expect(action?.storeActionBinding).toBeDefined();
      expect(action?.storeActionBinding?.storeNodeId).toBe("store-cart");
      expect(action?.storeActionBinding?.actionId).toBe("act-add");
      expect(action?.storeActionBinding?.actionName).toBe("addItem");
      expect(action?.storeActionBinding?.actionType).toBe("append");

      const edge = useBackendCanvasStore.getState().edges.find(
        (e) => (e.source === "store-cart" && e.target === "page-shop") || (e.source === "page-shop" && e.target === "store-cart"),
      );
      expect(edge).toBeDefined();
      expect(edge?.source).toBe("store-cart");
      expect(edge?.target).toBe("page-shop");
      expect(edge?.data?.isStoreActionBinding).toBe(true);
    });

    it("wires StateStore manipulator (mutate-out) to WebPage action (event-in) directly", () => {
      const store = useBackendCanvasStore.getState();

      const storeNode: BackendNode = {
        id: "store-conv",
        type: "state_store",
        position: { x: 0, y: 0 },
        data: {
          label: "conversationStore",
          fields: [{ id: "f-msg", name: "messages", type: "Message[]" }],
        },
        fractionalIndex: "a0",
      };

      const pageNode: BackendNode = {
        id: "page-conv",
        type: "webPage",
        position: { x: 400, y: 0 },
        data: {
          label: "Conversations",
          sections: [
            {
              id: "sec-main",
              name: "Main",
              renderMode: "client",
              actions: [
                {
                  id: "act-load",
                  name: "pageLoad",
                  event: "pageLoad",
                },
              ],
            },
          ],
        },
        fractionalIndex: "a1",
      };

      store.setNodesAndEdges([storeNode, pageNode], [], [], [], [], "proj-state-test");

      useBackendCanvasStore.getState().onConnect({
        source: "store-conv",
        target: "page-conv",
        sourceHandle: "mutate-out",
        targetHandle: "pageload-in-act-load",
      });

      const updatedPage = useBackendCanvasStore.getState().nodes.find((n) => n.id === "page-conv");
      const action = updatedPage?.data?.sections?.[0]?.actions?.[0];

      expect(action?.storeActionBinding).toBeDefined();
      expect(action?.storeActionBinding?.storeNodeId).toBe("store-conv");
      expect(action?.storeActionBinding?.actionName).toBe("mutate");

      const edge = useBackendCanvasStore.getState().edges.find(
        (e) => e.source === "store-conv" && e.target === "page-conv",
      );
      expect(edge).toBeDefined();
      expect(edge?.sourceHandle).toBe("mutate-out");
      expect(edge?.targetHandle).toBe("pageload-in-act-load");
    });

    it("wires StateStore field setter manipulator (setter-out) to WebPage action directly", () => {
      const store = useBackendCanvasStore.getState();

      const storeNode: BackendNode = {
        id: "store-conv",
        type: "state_store",
        position: { x: 0, y: 0 },
        data: {
          label: "conversationStore",
          fields: [
            { id: "f-msg", name: "messages", type: "Message[]" },
            { id: "f-conv", name: "conversations", type: "Conversation[]" },
          ],
        },
        fractionalIndex: "a0",
      };

      const pageNode: BackendNode = {
        id: "page-conv",
        type: "webPage",
        position: { x: 400, y: 0 },
        data: {
          label: "Conversations",
          sections: [
            {
              id: "sec-main",
              name: "Main",
              renderMode: "client",
              actions: [
                {
                  id: "act-update",
                  name: "onNewMessage",
                  event: "custom",
                },
              ],
            },
          ],
        },
        fractionalIndex: "a1",
      };

      store.setNodesAndEdges([storeNode, pageNode], [], [], [], [], "proj-state-test");

      useBackendCanvasStore.getState().onConnect({
        source: "store-conv",
        target: "page-conv",
        sourceHandle: "setter-out-f-msg",
        targetHandle: "event-in-act-update",
      });

      const updatedPage = useBackendCanvasStore.getState().nodes.find((n) => n.id === "page-conv");
      const action = updatedPage?.data?.sections?.[0]?.actions?.[0];

      expect(action?.storeActionBinding).toBeDefined();
      expect(action?.storeActionBinding?.storeNodeId).toBe("store-conv");
      expect(action?.storeActionBinding?.actionName).toBe("setMessages");
      expect(action?.storeActionBinding?.actionType).toBe("set");
      expect(action?.storeActionBinding?.targetFieldId).toBe("f-msg");
      expect(action?.storeActionBinding?.targetFieldName).toBe("messages");

      const edge = useBackendCanvasStore.getState().edges.find(
        (e) => e.source === "store-conv" && e.target === "page-conv",
      );
      expect(edge).toBeDefined();
      expect(edge?.sourceHandle).toBe("setter-out-f-msg");
      expect(edge?.targetHandle).toBe("event-in-act-update");
    });

    it("cleans up storeActionBinding when action edge to state_store is removed", () => {
      const mockState: BackendCanvasState = {
        nodes: [
          {
            id: "store-cart",
            type: "state_store",
            position: { x: 0, y: 0 },
            data: { label: "CartStore" },
            fractionalIndex: "a0",
          },
          {
            id: "page-shop",
            type: "webPage",
            position: { x: 400, y: 0 },
            data: {
              sections: [
                {
                  id: "sec-1",
                  actions: [
                    {
                      id: "act-buy",
                      name: "BuyNow",
                      storeActionBinding: {
                        storeNodeId: "store-cart",
                        storeName: "CartStore",
                        actionName: "addItem",
                      },
                    },
                  ],
                },
              ],
            },
            fractionalIndex: "a1",
          },
        ],
        edges: [
          {
            id: "edge-act-store",
            source: "store-cart",
            target: "page-shop",
            sourceHandle: "mutate-out",
            targetHandle: "event-in-act-buy",
            type: "connection",
          },
        ],
        endpoints: [],
        events: [],
        pendingNodeUpserts: [],
        pendingNodeRemovals: [],
        pendingEdgeUpserts: [],
        pendingEdgeRemovals: [],
        pendingEndpointUpserts: [],
        pendingEndpointRemovals: [],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
      } as unknown as BackendCanvasState;

      const result = cleanupDeletedEdgesState(mockState, ["edge-act-store"]);

      expect(result.edges).toHaveLength(0);
      const updatedPage = result.nodes?.find((n) => n.id === "page-shop");
      const action = updatedPage?.data?.sections?.[0]?.actions?.[0];
      expect(action?.storeActionBinding).toBeUndefined();
    });
  });
});
