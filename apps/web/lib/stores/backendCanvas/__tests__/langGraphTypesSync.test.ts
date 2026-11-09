import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, CustomTypeItem, CustomTypeField } from "@/types/canvas";
import { isValidConnection } from "@workspace/canvas";

describe("LangGraph Types Synchronization Engine", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-langgraph-types-sync-test");
  });

  it("automatically creates a companion TypesNode representing @workspace/langgraph-<name> when a LangGraphNode is added", () => {
    const store = useBackendCanvasStore.getState();
    const langGraphId = "agent-support-1";

    // 1. Add LangGraphNode
    store.addNode({
      id: langGraphId,
      type: "langgraph",
      position: { x: 500, y: 200 },
      data: {
        label: "Support Agent",
      },
    });

    const state = useBackendCanvasStore.getState();
    const companionTypesNode = state.nodes.find(
      (n: BackendNode) =>
        n.type === "types" &&
        (n.id === `types-langgraph-${langGraphId}` ||
          n.data?.sourceLangGraphId === langGraphId),
    );

    expect(companionTypesNode).toBeDefined();
    if (!companionTypesNode) return;

    expect(companionTypesNode.data?.label).toBe("Support Agent Types");
    expect(companionTypesNode.data?.isPackageNode).toBe(true);
    expect(companionTypesNode.data?.isLangGraphPackage).toBe(true);
    expect(companionTypesNode.data?.packageName).toBe("@workspace/langgraph-support-agent");
    expect(companionTypesNode.data?.sourceLangGraphId).toBe(langGraphId);

    // Verify companion edge exists linking TypesNode (source) to LangGraphNode (target)
    const companionEdge = state.edges.find(
      (e) => e.source === companionTypesNode.id && e.target === langGraphId,
    );
    expect(companionEdge).toBeDefined();
    expect(companionEdge?.sourceHandle).toBe("types-out");
    expect(companionEdge?.targetHandle).toBe("types-in");
    expect(companionEdge?.type).toBe("type-reference");

    // Default state types should be generated (<Agent>State and <Agent>StateUpdate)
    const types: CustomTypeItem[] = companionTypesNode.data?.types || [];
    expect(types.length).toBeGreaterThanOrEqual(2);

    const stateType = types.find((t) => t.name === "SupportAgentState");
    expect(stateType).toBeDefined();
    expect(stateType?.fields?.some((f) => f.name === "messages")).toBe(true);

    const updateType = types.find((t) => t.name === "SupportAgentStateUpdate");
    expect(updateType).toBeDefined();

    // Verify connection is valid in taxonomy
    const validation = isValidConnection(
      "types",
      companionEdge?.sourceHandle,
      "langgraph",
      companionEdge?.targetHandle,
    );
    expect(validation.valid).toBe(true);
  });

  it("handles 2 LangGraph nodes by creating dedicated, independent TypesNodes for each package", () => {
    const store = useBackendCanvasStore.getState();
    const agent1Id = "agent-support";
    const agent2Id = "agent-sales";

    // 1. Add first agent
    store.addNode({
      id: agent1Id,
      type: "langgraph",
      position: { x: 500, y: 100 },
      data: {
        label: "Support Agent",
      },
    });

    // 2. Add second agent
    store.addNode({
      id: agent2Id,
      type: "langgraph",
      position: { x: 500, y: 450 },
      data: {
        label: "Sales Agent",
      },
    });

    const state = useBackendCanvasStore.getState();

    // Both companion TypesNodes must exist
    const typesNode1 = state.nodes.find((n) => n.id === `types-langgraph-${agent1Id}`);
    const typesNode2 = state.nodes.find((n) => n.id === `types-langgraph-${agent2Id}`);

    expect(typesNode1).toBeDefined();
    expect(typesNode2).toBeDefined();
    expect(typesNode1?.id).not.toBe(typesNode2?.id);

    // Each represents its own independent package
    expect(typesNode1?.data?.packageName).toBe("@workspace/langgraph-support-agent");
    expect(typesNode2?.data?.packageName).toBe("@workspace/langgraph-sales-agent");

    // Each has its own distinct state interfaces
    const types1 = typesNode1?.data?.types || [];
    const types2 = typesNode2?.data?.types || [];
    expect(types1.some((t: CustomTypeItem) => t.name === "SupportAgentState")).toBe(true);
    expect(types2.some((t: CustomTypeItem) => t.name === "SalesAgentState")).toBe(true);

    // Cascade deletion of Agent 1 leaves Agent 2 and its types intact
    store.deleteNode(agent1Id);

    const stateAfterDelete = useBackendCanvasStore.getState();
    expect(stateAfterDelete.nodes.some((n) => n.id === agent1Id)).toBe(false);
    expect(stateAfterDelete.nodes.some((n) => n.id === `types-langgraph-${agent1Id}`)).toBe(false);

    // Agent 2 and its types remain completely untouched
    expect(stateAfterDelete.nodes.some((n) => n.id === agent2Id)).toBe(true);
    expect(stateAfterDelete.nodes.some((n) => n.id === `types-langgraph-${agent2Id}`)).toBe(true);
  });

  it("disambiguates package names if 2 LangGraph nodes share the identical label", () => {
    const store = useBackendCanvasStore.getState();
    const agent1Id = "agent-dup-1";
    const agent2Id = "agent-dup-2";

    store.addNode({
      id: agent1Id,
      type: "langgraph",
      position: { x: 400, y: 100 },
      data: {
        label: "LangGraph Agent",
      },
    });

    store.addNode({
      id: agent2Id,
      type: "langgraph",
      position: { x: 400, y: 400 },
      data: {
        label: "LangGraph Agent",
      },
    });

    const state = useBackendCanvasStore.getState();
    const typesNode1 = state.nodes.find((n) => n.id === `types-langgraph-${agent1Id}`);
    const typesNode2 = state.nodes.find((n) => n.id === `types-langgraph-${agent2Id}`);

    expect(typesNode1).toBeDefined();
    expect(typesNode2).toBeDefined();

    // Package names are disambiguated matching compiler folder resolution
    expect(typesNode1?.data?.packageName).toBe("@workspace/langgraph-agent");
    expect(typesNode2?.data?.packageName).toBe("@workspace/langgraph-agent-2");
  });

  it("updates the companion TypesNode when stateChannels or label change", () => {
    const store = useBackendCanvasStore.getState();
    const agentId = "agent-custom-state";

    store.addNode({
      id: agentId,
      type: "langgraph",
      position: { x: 400, y: 100 },
      data: {
        label: "Triage Bot",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
      },
    });

    // Update state channels to add 'urgency' and 'ticketId'
    store.updateNode(agentId, {
      data: {
        label: "Triage Bot",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
          { key: "urgency", type: "string", reducer: "replace" },
          { key: "ticketId", type: "number", reducer: "replace" },
        ],
      },
    });

    const state = useBackendCanvasStore.getState();
    const companion = state.nodes.find((n) => n.id === `types-langgraph-${agentId}`);
    expect(companion).toBeDefined();

    const types: CustomTypeItem[] = companion?.data?.types || [];
    const stateInterface = types.find((t) => t.name === "TriageBotState");
    expect(stateInterface).toBeDefined();

    const fields = stateInterface?.fields || [];
    expect(fields.some((f) => f.name === "urgency" && f.type === "string")).toBe(true);
    expect(fields.some((f) => f.name === "ticketId" && f.type === "number")).toBe(true);
  });

  it("exports BaseMessage, HumanMessage, AIMessage, SystemMessage, and the runnable graph instance in the companion TypesNode", () => {
    const store = useBackendCanvasStore.getState();
    const agentId = "agent-messages-test";

    store.addNode({
      id: agentId,
      type: "langgraph",
      position: { x: 300, y: 150 },
      data: {
        label: "Support Agent",
      },
    });

    const state = useBackendCanvasStore.getState();
    const companion = state.nodes.find((n) => n.id === `types-langgraph-${agentId}`);
    expect(companion).toBeDefined();

    const types: CustomTypeItem[] = companion?.data?.types || [];
    const typeNames = types.map((t) => t.name);

    expect(typeNames).toContain("BaseMessage");
    expect(typeNames).toContain("HumanMessage");
    expect(typeNames).toContain("AIMessage");
    expect(typeNames).toContain("SystemMessage");
    expect(typeNames).toContain("supportAgentGraph");
    expect(typeNames).toContain("SupportAgentState");
    expect(typeNames).toContain("SupportAgentStateType");
    expect(typeNames).toContain("SupportAgentStateUpdate");
    expect(typeNames).toContain("SupportAgentStateUpdateType");
  });

  it("does not reset StateStore field type to 'any' when switching custom types or cleaning up stale edges", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Add LangGraph Node
    const agentId = "agent-langgraph";
    store.addNode({
      id: agentId,
      type: "langgraph",
      position: { x: 100, y: 100 },
      data: {
        label: "LangGraph Agent",
      },
    });

    // 2. Add StateStoreNode with a field typed as 'langGraphAgentGraph'
    const storeNodeId = "store-test";
    const fieldId = "field-messages";
    store.addNode({
      id: storeNodeId,
      type: "state_store",
      position: { x: 600, y: 100 },
      data: {
        label: "GlobalStore",
        fields: [
          {
            id: fieldId,
            name: "messages",
            type: "langGraphAgentGraph",
            isArray: false,
          },
        ],
      },
    });

    // 3. Connect type reference edge from TypesNode (langGraphAgentGraph) to StateStore field
    const typesNodeId = `types-langgraph-${agentId}`;
    const initialEdgeId = "edge-type-initial";
    store.addEdge({
      id: initialEdgeId,
      source: typesNodeId,
      target: storeNodeId,
      sourceHandle: "type-out-type-lg-graph-agent-langgraph",
      targetHandle: `store-field-in-${fieldId}`,
      type: "type-reference",
      data: {
        baseTypeName: "langGraphAgentGraph",
        label: "langGraphAgentGraph",
        isTypeReference: true,
      },
    });

    const stateWithEdge = useBackendCanvasStore.getState();
    expect(stateWithEdge.edges.some((e) => e.id === initialEdgeId)).toBe(true);

    // 4. User updates field type to 'BaseMessage' in the StoreFieldsSection
    store.updateNode(storeNodeId, {
      data: {
        label: "GlobalStore",
        fields: [
          {
            id: fieldId,
            name: "messages",
            type: "BaseMessage",
            isArray: false,
          },
        ],
      },
    });

    // 5. Simulate cleaning up the stale edge (pointing to old type langGraphAgentGraph)
    store.deleteEdge(initialEdgeId);

    // 6. Verify that field.type REMAINS 'BaseMessage' and did NOT jump to 'any'
    const finalState = useBackendCanvasStore.getState();
    const finalStore = finalState.nodes.find((n) => n.id === storeNodeId);
    expect(finalStore).toBeDefined();

    const messagesField = finalStore?.data?.fields?.find((f) => f.id === fieldId);
    expect(messagesField).toBeDefined();
    expect(messagesField?.type).toBe("BaseMessage");
    expect(messagesField?.type).not.toBe("any");
  });
});

