import { describe, it, expect } from "vitest";
import { BackendNode } from "@/types/canvas";
import { Endpoint, GlobalStoreDefinition } from "@workspace/canvas/types";
import { generateTypesPackage } from "../generators/typesGenerator";
import { generateZustandStores } from "../webClients/nextjs/v16/storeGenerators";

describe("compileTypesDisambiguation", () => {
  it("disambiguates clashing entity aliases and custom type names in generateTypesPackage", () => {
    const dbEntityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string" },
        ],
      },
    };

    const messagesEntityNode: BackendNode = {
      id: "entity-messages",
      type: "entity",
      position: { x: 0, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "messages",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "content", type: "string" },
        ],
      },
    };

    const typesNode: BackendNode = {
      id: "types-custom",
      type: "types",
      position: { x: 100, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "Custom Types",
        definitionMode: "visual",
        types: [
          {
            id: "t-msg",
            name: "Message",
            kind: "type",
            fields: [
              { id: "f1", name: "id", type: "string", required: true },
              { id: "f2", name: "sender", type: "string", required: true },
              { id: "f3", name: "content", type: "string", required: true },
            ],
          },
          {
            id: "t-conv",
            name: "Conversation",
            kind: "type",
            fields: [
              { id: "f1", name: "id", type: "string", required: true },
              { id: "f2", name: "messages", type: "Message[]", required: true },
            ],
          },
        ],
      },
    };

    const files = generateTypesPackage([dbEntityNode, messagesEntityNode, typesNode], [], [], []);

    const entitiesFile = files.find((f) => f.filename === "src/entities/index.ts");
    expect(entitiesFile).toBeDefined();
    // Tables should generate entity interfaces
    expect(entitiesFile!.content).toContain("export interface Conversations");
    expect(entitiesFile!.content).toContain("export interface Messages");
    // Should NOT generate clashing singular type aliases because custom types already define them
    expect(entitiesFile!.content).not.toContain("export type Conversation = Conversations;");
    expect(entitiesFile!.content).not.toContain("export type Message = Messages;");

    const customFile = files.find((f) => f.filename === "src/custom.ts");
    expect(customFile).toBeDefined();
    expect(customFile!.content).toContain("export type Message = {");
    expect(customFile!.content).toContain("export type Conversation = {");

    const indexFile = files.find((f) => f.filename === "src/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('export * from "./entities";');
    expect(indexFile!.content).toContain('export * from "./custom";');
  });

  it("explicitly re-exports colliding types if entity table name directly collides with custom type", () => {
    // Exact table name collision: table is named "Conversation" (singular)
    const directEntityNode: BackendNode = {
      id: "entity-direct",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversation",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
        ],
      },
    };

    const typesNode: BackendNode = {
      id: "types-custom",
      type: "types",
      position: { x: 100, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Custom",
        definitionMode: "visual",
        types: [
          {
            id: "t1",
            name: "Conversation",
            kind: "type",
            typeAliasValue: "{ id: string; messages: string[] }",
          },
          {
            id: "t2",
            name: "Status",
            kind: "enum",
            enumValues: ["ACTIVE", "ARCHIVED"],
          },
        ],
      },
    };

    const files = generateTypesPackage([directEntityNode, typesNode], [], [], []);
    const indexFile = files.find((f) => f.filename === "src/index.ts");
    expect(indexFile).toBeDefined();
    // Explicit re-export should be present to resolve TS2308
    expect(indexFile!.content).toContain('export type { Conversation } from "./custom";');
  });

  it("exports singular and plural hook aliases in lib/stores/index.ts", () => {
    const files = generateZustandStores([
      {
        id: "store-1",
        name: "Conversation",
        scope: "global",
        storage: "memory",
        fields: [{ id: "f1", name: "messages", type: "array" }],
      },
    ]);

    const storeFile = files.find((f) => f.filename === "lib/stores/useConversationStore.ts");
    expect(storeFile).toBeDefined();
    expect(storeFile!.content).toContain("populate: (data?: Partial<ConversationStoreState>");

    const indexFile = files.find((f) => f.filename === "lib/stores/index.ts");
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('export * from "./useConversationStore";');
    expect(indexFile!.content).not.toContain('export { default as useConversationStore }');
    expect(indexFile!.content).toContain('export { useConversationStore as useConversationsStore } from "./useConversationStore";');
  });

  it("does not generate duplicate identifier collisions when an entity and service share the same name (conversations)", () => {
    const entityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "conversations",
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-get-conversations",
      nodeId: "srv-conversations",
      name: "/conversations",
      type: "GET",
      summary: "Get conversations",
    };

    const typesNode: BackendNode = {
      id: "types-entity-schemas",
      type: "types",
      position: { x: 100, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Entity Types",
        isEntitySchemas: true,
        types: [
          {
            id: "type-entity-entity-conversations",
            name: "Conversations",
            kind: "type",
            fields: [
              { id: "f1", name: "id", type: "string", required: true },
              { id: "f2", name: "title", type: "string", required: true },
            ],
          },
        ],
      },
    };

    const files = generateTypesPackage(
      [entityNode, serviceNode, typesNode],
      [endpoint],
      [],
      [{ id: "srv-conversations", name: "conversations", folderName: "conversations" }],
      [],
    );

    const indexFile = files.find((f) => f.filename === "src/index.ts");
    expect(indexFile).toBeDefined();

    // Service namespace is exported with Service suffix
    expect(indexFile!.content).toContain('export * as ConversationsService from "./conversations";');

    // Entities are exported
    expect(indexFile!.content).toContain('export * from "./entities";');

    // Auto-generated entity schemas are omitted from custom.ts, so no clashing export type { Conversations }
    expect(indexFile!.content).not.toMatch(/export\s+type\s*\{\s*Conversations\s*\}\s*from\s*"\.\/custom"/);

    // Ensure Conversations is not defined twice as a top-level exported symbol
    const occurrences = (indexFile!.content.match(/\bConversations\b/g) || []).length;
    // Only "ConversationsService" should have Conversations in it in index.ts, or at most from entities barrel
    expect(indexFile!.content).not.toContain("export * as Conversations from");
  });

  it("generates type-safe store with custom interface types initialized to null and typed as nullable", () => {
    const storeDef: GlobalStoreDefinition = {
      id: "store-app",
      name: "App",
      storage: "memory",
      scope: "global",
      fields: [
        { id: "f-msg", name: "message", type: "string", defaultValue: "" },
        { id: "f-resp", name: "response", type: "ConversationsPostSendMessageByIdResponse", defaultValue: "" },
      ],
      actions: [],
    };

    const files = generateZustandStores([storeDef]);
    const storeFile = files.find((f) => f.filename === "lib/stores/useAppStore.ts");
    expect(storeFile).toBeDefined();

    const code = storeFile!.content;
    // 1. Types import
    expect(code).toContain('import type { ConversationsPostSendMessageByIdResponse } from "@workspace/types";');

    // 2. Interface typing
    expect(code).toContain("message: string;");
    expect(code).toContain("response: ConversationsPostSendMessageByIdResponse | null;");
    expect(code).toContain("setMessage: (value: string) => void;");
    expect(code).toContain("setResponse: (value: ConversationsPostSendMessageByIdResponse | null) => void;");

    // 3. Initial state
    expect(code).toContain('message: "",');
    expect(code).toContain("response: null,");
    expect(code).not.toContain('response: "",');

    // 4. Update and Reset implementations
    expect(code).toContain('updateResponse: (patch) => set((s) => ({ response: (patch && s.response && typeof s.response === "object") ? { ...s.response, ...patch } : s.response })),');
    expect(code).toContain("reset: () => set(initialState),");
  });
});

