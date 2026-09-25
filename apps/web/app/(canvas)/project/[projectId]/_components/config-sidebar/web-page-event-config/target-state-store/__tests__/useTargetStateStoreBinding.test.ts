import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTargetStateStoreBinding } from "../useTargetStateStoreBinding";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, StoreActionBinding } from "@/types/canvas";

describe("useTargetStateStoreBinding - Blank/Unconfigured Initial State", () => {
  const mockStateStoreNode: BackendNode = {
    id: "store-conv",
    type: "state_store",
    fractionalIndex: "a0",
    position: { x: 100, y: 100 },
    data: {
      label: "conversationStore",
      storeName: "conversationStore",
      fields: [
        { id: "f-msg", name: "messages", type: "array" },
        { id: "f-active", name: "activeId", type: "string" },
      ],
      actions: [
        { id: "act-clear", name: "clearHistory", actionType: "custom" },
      ],
    },
  };

  const mockWebPageNode: BackendNode = {
    id: "page-1",
    type: "webPage",
    fractionalIndex: "a1",
    position: { x: 500, y: 100 },
    data: {
      label: "Home Page",
      sections: [],
    },
  };

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [mockStateStoreNode, mockWebPageNode],
      edges: [],
    });
  });

  it("adds a blank/unconfigured state store manipulation when handleAddManipulation is called", () => {
    let currentBindings: StoreActionBinding[] = [];
    const onUpdateStoreBindings = vi.fn((next: StoreActionBinding[]) => {
      currentBindings = next;
    });

    const { result, rerender } = renderHook(
      ({ bindings }) =>
        useTargetStateStoreBinding({
          nodeId: "page-1",
          actionId: "act-click-1",
          actionName: "submit",
          actionEvent: "click",
          storeBindings: bindings,
          stateStoreNodes: [mockStateStoreNode],
          isEndpointConnected: true,
          onUpdateStoreBindings,
        }),
      { initialProps: { bindings: [] as StoreActionBinding[] } },
    );

    expect(result.current.bindings).toHaveLength(0);

    // Click "Add Store Mutation"
    act(() => {
      result.current.handleAddManipulation();
    });

    expect(onUpdateStoreBindings).toHaveBeenCalledTimes(1);
    expect(currentBindings).toHaveLength(1);

    const added = currentBindings[0]!;
    // Must be completely blank/unconfigured
    expect(added.storeNodeId).toBeUndefined();
    expect(added.storeName).toBeUndefined();
    expect(added.actionId).toBeUndefined();
    expect(added.actionName).toBeUndefined();
    expect(added.actionType).toBeUndefined();
    expect(added.targetFieldId).toBeUndefined();
    expect(added.targetFieldName).toBeUndefined();

    // Re-render with the updated bindings to simulate parent state update
    rerender({ bindings: currentBindings });

    // No canvas edges should be added while the manipulation is blank/unconfigured
    const edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(0);
  });

  it("draws canvas edge only after store and action are explicitly configured", () => {
    let currentBindings: StoreActionBinding[] = [
      {
        id: "bnd-1",
        storeNodeId: undefined,
        storeName: undefined,
        actionId: undefined,
      },
    ];

    const onUpdateStoreBindings = vi.fn((next: StoreActionBinding[]) => {
      currentBindings = next;
    });

    const { result, rerender } = renderHook(
      ({ bindings }) =>
        useTargetStateStoreBinding({
          nodeId: "page-1",
          actionId: "act-click-1",
          actionName: "submit",
          actionEvent: "click",
          storeBindings: bindings,
          stateStoreNodes: [mockStateStoreNode],
          isEndpointConnected: true,
          onUpdateStoreBindings,
        }),
      { initialProps: { bindings: currentBindings } },
    );

    expect(useBackendCanvasStore.getState().edges).toHaveLength(0);

    // User configures store and action
    act(() => {
      result.current.handleUpdateManipulation(0, {
        id: "bnd-1",
        storeNodeId: "store-conv",
        storeName: "conversationStore",
        actionId: "setter-f-msg",
        actionName: "setMessages",
        actionType: "set",
        targetFieldId: "f-msg",
        targetFieldName: "messages",
        updateSource: "response",
      });
    });

    expect(onUpdateStoreBindings).toHaveBeenCalled();
    rerender({ bindings: currentBindings });

    // Canvas edge should now exist and connect store to page action handle
    const edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]!.source).toBe("store-conv");
    expect(edges[0]!.sourceHandle).toBe("setter-out-f-msg");
    expect(edges[0]!.target).toBe("page-1");
    expect(edges[0]!.targetHandle).toBe("event-in-act-click-1");
  });
});
