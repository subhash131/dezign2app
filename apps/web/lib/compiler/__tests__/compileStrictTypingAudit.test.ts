import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileStrictTypingAudit - Verifying strict typing across generated monorepo", () => {
  it("generates monorepo with 0 ambient any in custom.ts, 0 unknown in ResponseContext, and typed actions", () => {
    const serviceNode: BackendNode = {
      id: "node-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversation",
        port: "8082",
      },
    };

    const redisNode: BackendNode = {
      id: "node-redis-conv",
      type: "redis_schema",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Conversation",
        tableName: "conversation",
        redisDataStructure: "json",
        jsonRootType: "array",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "message", type: "string", isNotNull: true },
        ],
      },
    };

    const typesNode: BackendNode = {
      id: "node-types",
      type: "types",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "Domain Models",
        definitionMode: "visual",
        types: [
          {
            id: "t-1",
            name: "ConversationItem",
            kind: "interface",
            fields: [
              { id: "f-1", name: "id", type: "string", required: true },
              { id: "f-2", name: "message", type: "string", required: true },
            ],
          },
        ],
      },
    };

    const webAppNode: BackendNode = {
      id: "node-webapp",
      type: "webApp",
      position: { x: 0, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "Web App 1",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-webpage",
      type: "webPage",
      position: { x: 200, y: 200 },
      fractionalIndex: "a4",
      data: {
        label: "Conversations",
        path: "/conversations",
        sections: [
          {
            id: "sec-main",
            name: "Main",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: "ev-get",
                name: "GetConversationsAction",
                event: "click",
              },
            ],
          },
        ],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-health",
        nodeId: "node-conversation",
        name: "/health",
        type: "GET",
        summary: "Health check",
      },
      {
        id: "ep-get-conversations",
        nodeId: "node-conversation",
        name: "/get-conversations",
        type: "GET",
        summary: "Get conversations",
        pipelineSteps: [
          {
            id: "step-1",
            name: "Get Recent Conversations",
            type: "redis_operation",
            enabled: true,
            outputVariable: "conversations",
            functionRef: {
              name: "getRecentConversationItems",
              importPath: "@workspace/redis",
            },
          },
        ],
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "e-web-page",
        source: "node-webapp",
        target: "node-webpage",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "e-page-srv",
        source: "node-webpage",
        target: "node-conversation",
        type: "connection",
        fractionalIndex: "a1",
      },
      {
        id: "e-srv-redis",
        source: "node-conversation",
        target: "node-redis-conv",
        type: "connection",
        fractionalIndex: "a2",
      },
    ];

    const result = compileMonorepo(
      [serviceNode, redisNode, typesNode, webAppNode, webPageNode],
      endpoints,
      [],
      edges,
      [],
      "StrictTypingProject",
    );

    // 1. Check custom.ts for zero ambient any
    const customFile = result.files.find((f) => f.filename === "packages/types/src/custom.ts");
    expect(customFile).toBeDefined();
    expect(customFile?.content).not.toContain("= any;");
    expect(customFile?.content).not.toContain(": any;");
    expect(customFile?.content).not.toContain("type ReactNode = any");

    // 2. Check route files for 0 unknown in ResponseContext
    const healthRoute = result.files.find((f) => f.filename.includes("routes/getHealth.ts"));
    expect(healthRoute).toBeDefined();
    expect(healthRoute?.content).not.toContain("Record<string, unknown>");
    expect(healthRoute?.content).not.toContain("unknown[]");
    expect(healthRoute?.content).toContain("ConversationGetHealthResponseContext =");

    const convRoute = result.files.find((f) => f.filename.includes("routes/getGetConversations.ts"));
    expect(convRoute).toBeDefined();
    expect(convRoute?.content).not.toContain("Record<string, unknown>");
    expect(convRoute?.content).not.toContain("unknown[]");

    // 3. Check page.tsx for 0 "as any"
    const pageFiles = result.files.filter((f) => f.filename.endsWith("page.tsx"));
    for (const p of pageFiles) {
      expect(p.content).not.toContain(") as any);");
    }

    // 4. Check action component for 0 requestBody?: unknown
    const actionFiles = result.files.filter((f) => f.filename.includes("GetConversationsAction.tsx"));
    for (const a of actionFiles) {
      expect(a.content).not.toContain("requestBody?: unknown");
    }
  });

  it("compiles clean TypeScript for redis step with cache-aside DB fallback when selected as response item or nested field", () => {
    const serviceNode: BackendNode = {
      id: "node-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversation",
        port: "8082",
      },
    };

    const redisNode: BackendNode = {
      id: "node-redis-conv",
      type: "redis_schema",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Conversation",
        tableName: "conversation",
        redisDataStructure: "json",
        jsonRootType: "array",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "sender", type: "string" },
          { name: "message", type: "string" },
        ],
      },
    };

    const dbNode: BackendNode = {
      id: "node-db",
      type: "database",
      position: { x: 0, y: 300 },
      fractionalIndex: "a2",
      data: {
        label: "DB",
        dbEngine: "sqlite",
      },
    };

    const entityNode: BackendNode = {
      id: "node-entity-conversations",
      type: "entity",
      position: { x: 0, y: 450 },
      fractionalIndex: "a3",
      data: {
        label: "conversations",
        databaseId: "node-db",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string" },
        ],
      },
    };

    const edges: BackendEdge[] = [
      { id: "e1", source: "node-conversation", target: "node-redis-conv", type: "connection", fractionalIndex: "e1" },
      { id: "e2", source: "node-conversation", target: "node-db", type: "connection", fractionalIndex: "e2" },
      { id: "e3", source: "node-db", target: "node-entity-conversations", type: "connection", fractionalIndex: "e3" },
    ];

    const convEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-get-conversations",
      nodeId: "node-conversation",
      name: "/get-conversations",
      type: "GET",
      summary: "Get conversations",
      requestBody: {
        id: "rb-1",
        fields: [{ id: "f1", name: "conversation_id", type: "string", required: true }],
      },
      pipelineSteps: [
        {
          id: "step-1",
          name: "getConversation",
          type: "redis_operation",
          enabled: true,
          outputVariable: "getConversationResult",
          functionRef: {
            name: "getConversation",
            importPath: "@workspace/redis",
          },
          inputBindings: [
            { argName: "key", source: { kind: "req_body", field: "conversation_id" } },
          ],
          cacheMiss: {
            enabled: true,
            action: "fallback_db",
            functionRef: {
              name: "findConversationById",
              importPath: "@workspace/db",
            },
            inputBindings: [
              { argName: "id", source: { kind: "req_body", field: "conversation_id" } },
            ],
            writeBackToCache: true,
          },
        },
        {
          id: "step-2",
          name: "returnResponse",
          type: "return_response",
          enabled: true,
          inputBindings: [
            {
              argName: "data",
              source: { kind: "step_output", stepId: "step-1" },
            },
            {
              argName: "sender",
              source: { kind: "step_output", stepId: "step-1", field: "sender" },
            },
          ],
        },
      ],
    };

    const result = compileMonorepo(
      [serviceNode, redisNode, dbNode, entityNode],
      [convEndpoint],
      [],
      edges,
      [],
      "TestCacheAsideStrictApp",
    );

    const routeFile = result.files.find((f) =>
      f.filename.includes("apps/conversation/src/routes/getGetConversations.ts"),
    );
    expect(routeFile).toBeDefined();

    // 1. Verify 404 guard narrows getConversationResult after cache-miss fallback
    expect(routeFile?.content).toContain("if (getConversationResult === null || getConversationResult === undefined) {");
    expect(routeFile?.content).toContain('return res.status(404).json({ error: "Record not found" });');

    // 2. Verify safe field access for sender without as any, without unknown, and without TS2339
    expect(routeFile?.content).toContain(
      "sender: (Array.isArray(getConversationResult) ? getConversationResult[0]?.sender : (getConversationResult as { sender?: string })?.sender)",
    );
    expect(routeFile?.content).not.toContain("as any");
    expect(routeFile?.content).not.toContain("sender?: unknown");

    // 3. Verify response type in packages/types exports union of Redis and DB fallback row types
    const typeFile = result.files.find((f) =>
      f.filename.includes("packages/types/src/conversation/getGetConversations.ts"),
    );
    expect(typeFile).toBeDefined();
    expect(typeFile?.content).toContain("Conversation");
    expect(typeFile?.content).toContain("ConversationsRow");
    expect(typeFile?.content).toContain("sender: string | null | undefined;");

    // 4. Verify entities export the referenced types
    const entitiesFile = result.files.find((f) =>
      f.filename.includes("packages/types/src/entities/index.ts"),
    );
    expect(entitiesFile).toBeDefined();
    expect(entitiesFile?.content).toContain("export interface ConversationsRow");
    expect(entitiesFile?.content).toContain("export interface Conversation");
  });
});

