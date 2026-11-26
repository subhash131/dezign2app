import { describe, it, expect, beforeEach } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { EndpointWithNode } from "@workspace/canvas";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { generateTypesPackage } from "../generators/typesGenerator";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

describe("StateStore entity rename & stale @workspace/types resolution", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-store-entity-rename-test");
  });

  it("rewrites stale Conversations type references in useAppStore.ts to Conversati when entity is renamed without syncing store fields", () => {
    const webAppNode: BackendNode = {
      id: "webapp-1",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: { label: "Web", appSlug: "web" },
    };

    const entityNode: BackendNode = {
      id: "ent-conv",
      type: "entity",
      position: { x: 100, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "conversati",
        tableName: "conversati",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "created_by", type: "string", isNotNull: true },
        ],
      },
    };

    // Un-synced Entity Types node still carrying old name "Conversations"
    const entityTypesNode: BackendNode = {
      id: "types-entity-schemas",
      type: "types",
      position: { x: 60, y: 60 },
      fractionalIndex: "a2",
      data: {
        label: "Entity Types",
        isEntitySchemas: true,
        types: [
          {
            id: "type-entity-ent-conv",
            name: "Conversations",
            kind: "interface",
            fields: [
              { id: "f1", name: "id", type: "string", required: true },
              { id: "f2", name: "title", type: "string", required: false },
            ],
          },
        ],
      },
    };

    // Case A: field has customTypeId pointing to type-entity-ent-conv
    // Case B: field lacks customTypeId and still holds stale "Conversations" / "Conversation[]"
    const stateStoreNode: BackendNode = {
      id: "store-app",
      type: "state_store",
      position: { x: 200, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "AppStore",
        storeName: "App",
        scope: "global",
        storage: "memory",
        targetWebAppId: "webapp-1",
        fields: [
          {
            id: "f-convs",
            name: "conversations",
            type: "Conversations[]",
            isArray: true,
            customTypeId: "type-entity-ent-conv",
            defaultValue: [],
          },
          {
            id: "f-active",
            name: "activeConversation",
            type: "Conversations",
            defaultValue: null,
          },
        ],
        actions: [
          {
            id: "act-create",
            name: "createLocal",
            actionType: "custom",
            parameters: [
              { id: "p1", name: "payload", type: "CreateConversationsData", required: true },
            ],
          },
        ],
      },
    };

    const allNodes = [webAppNode, entityNode, entityTypesNode, stateStoreNode];
    const webResult = compileNextjsV16WebClient(
      [],
      [],
      [],
      allNodes,
      [],
      "TestApp",
      [],
      "web",
      webAppNode,
    );
    const typesFiles = generateTypesPackage(allNodes, [], [], []);
    const entitiesTs = typesFiles.find((f) => f.filename === "src/entities/index.ts")!.content;

    expect(entitiesTs).toContain("export interface Conversati");
    expect(entitiesTs).not.toContain("export interface Conversations");

    const storeFile = webResult.files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();
    const storeTs = storeFile!.content;

    expect(storeTs).toContain('import type { Conversati, CreateConversatiData } from "@workspace/types";');
    expect(storeTs).not.toMatch(/import type \{[^}]*\bConversations\b[^}]*\} from "@workspace\/types"/);
    expect(storeTs).toContain("conversations: Conversati[];");
    expect(storeTs).toContain("activeConversation: Conversati | null;");
    expect(storeTs).toContain("createLocal: (payload: CreateConversatiData) => void;");
  });

  it("propagates entity renames live in useBackendCanvasStore to state_store fields, action parameters, and pendingNodeUpserts", () => {
    const store = useBackendCanvasStore.getState();

    const entityNode: BackendNode = {
      id: "ent-conv",
      type: "entity",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        tableName: "conversations",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "created_by", type: "string", isNotNull: true },
        ],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "store-app",
      type: "state_store",
      position: { x: 300, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "AppStore",
        storeName: "App",
        scope: "global",
        storage: "memory",
        fields: [
          {
            id: "f-convs",
            name: "conversations",
            type: "Conversations[]",
            isArray: true,
            customTypeId: "type-entity-ent-conv",
            defaultValue: [],
          },
          {
            id: "f-active",
            name: "activeConversation",
            type: "Conversation",
            defaultValue: null,
          },
        ],
        actions: [
          {
            id: "act-add",
            name: "addConv",
            actionType: "custom",
            parameters: [
              { id: "p1", name: "input", type: "CreateConversationsData", required: true },
            ],
          },
        ],
      },
    };

    const endpoint: EndpointWithNode = {
      id: "ep-list",
      nodeId: "service-ai",
      name: "/conversations",
      type: "GET",
      pipelineSteps: [],
    };

    store.addNode(entityNode);
    store.addNode(stateStoreNode);
    useBackendCanvasStore.setState({ endpoints: [endpoint], pendingNodeUpserts: [] });

    store.updateNode("ent-conv", {
      data: {
        ...entityNode.data,
        label: "conversati",
        tableName: "conversati",
      },
    });

    const nextState = useBackendCanvasStore.getState();
    const updatedStoreNode = nextState.nodes.find((n) => n.id === "store-app");
    expect(updatedStoreNode).toBeDefined();
    expect(updatedStoreNode?.data.fields?.[0]?.type).toBe("Conversati[]");
    expect(updatedStoreNode?.data.fields?.[1]?.type).toBe("Conversati");
    expect(updatedStoreNode?.data.actions?.[0]?.parameters?.[0]?.type).toBe("CreateConversatiData");
    expect(nextState.pendingNodeUpserts.some((n) => n.id === "store-app")).toBe(true);
  });
});
