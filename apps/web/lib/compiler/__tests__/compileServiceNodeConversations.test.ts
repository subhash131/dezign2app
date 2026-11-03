import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, EndpointWithNode } from "@workspace/canvas/types";
import { compileServiceNode } from "../compileServiceNode";
import { generateTypesPackage } from "../generators/typesGenerator";
import { cleanUnusedImports } from "../utils";
import { compilePostgresDatabase } from "../databases/postgres";
import { compileMysqlDatabase } from "../databases/mysql";
import { compileRawSqliteDatabase } from "../databases/sqlite/raw";
import { cleanupDeletedNodesState, cleanupDeletedEdgesState } from "@/lib/stores/backendCanvas/stateCleanup";
import { compileExpressV4Service } from "../services/express/v4";

describe("compileServiceNode - Conversations route & typing audit", () => {
  it("compiles create-conversation endpoint with exact entity typing, no 'as any', no 'unknown', and guarded body", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const entityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
        ],
      },
    };

    const dbRefNode: BackendNode = {
      id: "db-ref-conversations",
      type: "db_ref",
      position: { x: 100, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "conversations",
        tableRef: "entity-conversations",
      },
    };

    const allNodes: BackendNode[] = [serviceNode, entityNode, dbRefNode];

    const allEdges: BackendEdge[] = [
      {
        id: "e1",
        type: "database-connection",
        fractionalIndex: "a0",
        source: "srv-conversations",
        target: "db-ref-conversations",
      },
    ];

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-create-conversation",
      nodeId: "srv-conversations",
      name: "/create-conversation",
      type: "POST",
      summary: "Create a conversation",
    };

    // 1. Compile Service Node
    const serviceResult = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      allNodes,
      allEdges,
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = serviceResult.files.find((f) =>
      f.filename.includes("postCreateConversation.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Verify ZERO 'as any', ZERO 'as {', ZERO '(PAYLOAD_VAR || {}) as any'
    expect(routeCode).not.toContain("as any");
    expect(routeCode).not.toContain("(PAYLOAD_VAR || {}) as any");
    expect(routeCode).not.toContain("as { id");
    expect(routeCode).not.toContain("as unknown");

    // Verify guarded body and clean create call
    expect(routeCode).toContain("await createConversation(body)");
    expect(routeCode).toContain("data: createdConversations");

    // 2. Compile Types Package
    const typesFiles = generateTypesPackage(
      allNodes,
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      allEdges,
    );

    const routeTypeFile = typesFiles.find((f) =>
      f.filename.includes("postCreateConversation.ts"),
    );
    expect(routeTypeFile).toBeDefined();
    const typeCode = routeTypeFile!.content;

    // Response must type data as Conversations (entity), NOT Record<string, ...> or any
    expect(typeCode).toContain("data: Conversations;");
    expect(typeCode).not.toContain("data?: Record<string, string | number | boolean | null>");
    expect(typeCode).not.toContain("data?: any");

    // Body must type as CreateConversationsData
    expect(typeCode).toContain("export type ConversationsPostCreateConversationBody = CreateConversationsData;");

    // Entities file must export CreateConversationsData with title
    const entitiesFile = typesFiles.find((f) => f.filename === "src/entities/index.ts");
    expect(entitiesFile).toBeDefined();
    expect(entitiesFile!.content).toContain("export type CreateConversationsData = {");
    expect(entitiesFile!.content).toContain("title: string;");
  });

  it("compiles an unconfigured GET /conversations endpoint with optional return type and no forced entity data requirement", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const entityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
        ],
      },
    };

    // Notice: NO edges between serviceNode and entityNode, no db_ref, no db config on endpoint
    const allNodes: BackendNode[] = [serviceNode, entityNode];
    const allEdges: BackendEdge[] = [];

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-get-conversations",
      nodeId: "srv-conversations",
      name: "/conversations",
      type: "GET",
      summary: "Get conversations",
    };

    // 1. Compile Service Node
    const serviceResult = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      allNodes,
      allEdges,
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = serviceResult.files.find((f) =>
      f.filename.includes("getConversations.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Route returns simple message without database queries
    expect(routeCode).toContain('message: "Successfully executed GET /conversations"');
    expect(routeCode).not.toContain("findAllConversations");

    // 2. Compile Types Package
    const typesFiles = generateTypesPackage(
      allNodes,
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      allEdges,
    );

    const routeTypeFile = typesFiles.find((f) =>
      f.filename.includes("getConversations.ts"),
    );
    expect(routeTypeFile).toBeDefined();
    const typeCode = routeTypeFile!.content;

    // Response must NOT require data: Conversations[];
    expect(typeCode).not.toContain("data: Conversations[];");
    expect(typeCode).toContain("export interface ConversationsGetConversationsResponse {");
    expect(typeCode).toContain("message?: string;");
    expect(typeCode).toContain("data?: Record<string, string | number | boolean | null>;");
  });

  it("does not generate createConversation import for POST route with pipeline steps (e.g. LangGraph)", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversation",
        techStack: "express",
        port: "8080",
      },
    };

    const entityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
        ],
      },
    };

    const dbRefNode: BackendNode = {
      id: "db-ref-conversations",
      type: "db_ref",
      position: { x: 100, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "conversations",
        tableRef: "entity-conversations",
      },
    };

    const allNodes: BackendNode[] = [serviceNode, entityNode, dbRefNode];
    const allEdges: BackendEdge[] = [
      {
        id: "e1",
        type: "database-connection",
        fractionalIndex: "a0",
        source: "srv-conversation",
        target: "db-ref-conversations",
      },
    ];

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-message",
      nodeId: "srv-conversation",
      name: "/send-message",
      type: "POST",
      summary: "Send a message via LangGraph",
      pipelineSteps: [
        {
          id: "step-1",
          name: "Invoke LangGraph Agent",
          type: "langgraph_invoke",
          langGraphTargetNodeId: "lg-node-1",
          inputBindings: [],
        },
      ],
    };

    const serviceResult = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      allNodes,
      allEdges,
      [],
      [],
      [],
      "conversation",
    );

    const routeFile = serviceResult.files.find((f) =>
      f.filename.includes("postSendMessage.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Must NOT contain createConversation or unused database import
    expect(routeCode).not.toContain("createConversation");
    expect(routeCode).not.toContain("@workspace/db/helpers/conversations");
  });

  it("does not generate createConversation import when crudOperations is explicitly empty array", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversation",
        techStack: "express",
        port: "8080",
      },
    };

    const entityNode: BackendNode = {
      id: "entity-conversations",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "conversations",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
        ],
      },
    };

    const dbRefNode: BackendNode = {
      id: "db-ref-conversations",
      type: "db_ref",
      position: { x: 100, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "conversations",
        tableRef: "entity-conversations",
      },
    };

    const allNodes: BackendNode[] = [serviceNode, entityNode, dbRefNode];
    const allEdges: BackendEdge[] = [
      {
        id: "e1",
        type: "database-connection",
        fractionalIndex: "a0",
        source: "srv-conversation",
        target: "db-ref-conversations",
      },
    ];

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-post-action",
      nodeId: "srv-conversation",
      name: "/custom-action",
      type: "POST",
      summary: "Custom action without CRUD",
      crudOperations: {
        "db-ref-conversations": [],
      },
    };

    const serviceResult = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      allNodes,
      allEdges,
      [],
      [],
      [],
      "conversation",
    );

    const routeFile = serviceResult.files.find((f) =>
      f.filename.includes("postCustomAction.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Deliberately cleared CRUD operations must NOT be resurrected
    expect(routeCode).not.toContain("createConversation");
    expect(routeCode).not.toContain("@workspace/db/helpers/conversations");
  });

  it("cleanUnusedImports removes unused database imports even when mentioned in AI comment blocks", () => {
    const source = `
import { createConversation, findAllConversations } from "@workspace/db/helpers/conversations";
import { logger } from "@workspace/logger";

/**
 * AI Directive:
 * Available database helpers: createConversation, findAllConversations
 */
export async function handler(req: any, res: any) {
  logger.info("Handling request");
  return res.json({ ok: true });
}
`;
    const cleaned = cleanUnusedImports(source);
    // Unused imports from @workspace/db/helpers/conversations must be removed
    expect(cleaned).not.toContain("@workspace/db/helpers/conversations");
    expect(cleaned).not.toMatch(/import\s*\{[^}]*createConversation/);
    expect(cleaned).not.toMatch(/import\s*\{[^}]*findAllConversations/);
    expect(cleaned).toContain("logger");
  });

  it("generates both singular and plural alias files for database helpers across postgres, mysql, and sqlite raw", () => {
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

    // Postgres
    const pgResult = compilePostgresDatabase([entityNode], []);
    const pgSingular = pgResult.files.find((f) => f.filename === "helpers/conversation.ts");
    const pgPlural = pgResult.files.find((f) => f.filename === "helpers/conversations.ts");
    expect(pgSingular).toBeDefined();
    expect(pgPlural).toBeDefined();
    expect(pgPlural!.content).toContain('export * from "./conversation";');

    // MySQL
    const mysqlResult = compileMysqlDatabase([entityNode], []);
    const mysqlSingular = mysqlResult.files.find((f) => f.filename === "helpers/conversation.ts");
    const mysqlPlural = mysqlResult.files.find((f) => f.filename === "helpers/conversations.ts");
    expect(mysqlSingular).toBeDefined();
    expect(mysqlPlural).toBeDefined();
    expect(mysqlPlural!.content).toContain('export * from "./conversation";');

    // SQLite Raw
    const sqliteResult = compileRawSqliteDatabase([entityNode], []);
    const sqliteSingular = sqliteResult.files.find((f) => f.filename === "helpers/conversation.ts");
    const sqlitePlural = sqliteResult.files.find((f) => f.filename === "helpers/conversations.ts");
    expect(sqliteSingular).toBeDefined();
    expect(sqlitePlural).toBeDefined();
    expect(sqliteSingular!.content).toContain('export * from "./conversations";');
  });

  it("stateCleanup cleans up db_operation pipeline steps when database nodes or edges are removed", () => {
    const mockState: any = {
      nodes: [
        { id: "srv-1", type: "service", data: { label: "srv" } },
        { id: "entity-1", type: "entity", data: { label: "conversations" } },
        { id: "db-1", type: "database", data: { label: "main-db" } },
      ],
      edges: [
        { id: "edge-1", source: "srv-1", target: "db-1" },
      ],
      endpoints: [
        {
          id: "ep-1",
          nodeId: "srv-1",
          name: "/send",
          type: "POST",
          databaseNodeIds: ["db-1"],
          crudOperations: { "db-1": ["create"] },
          pipelineSteps: [
            {
              id: "step-db",
              name: "Save message",
              type: "db_operation",
              databaseId: "db-1",
              tableNodeId: "entity-1",
            },
            {
              id: "step-other",
              name: "Other step",
              type: "custom_code",
            },
          ],
        },
      ],
      events: [],
      pendingNodeUpserts: [],
      pendingEndpointUpserts: [],
      pendingEventUpserts: [],
      pendingEdgeUpserts: [],
      pendingEventRemovals: [],
    };

    // 1. Test node deletion cleanup
    const nodeCleaned = cleanupDeletedNodesState(mockState, ["entity-1"]);
    const epAfterNodeDelete = nodeCleaned.endpoints?.find((e: any) => e.id === "ep-1");
    expect(epAfterNodeDelete).toBeDefined();
    expect(epAfterNodeDelete?.pipelineSteps).toHaveLength(1);
    expect(epAfterNodeDelete?.pipelineSteps?.[0]?.type).toBe("custom_code");

    // 2. Test edge deletion cleanup
    const edgeCleaned = cleanupDeletedEdgesState(mockState, ["edge-1"]);
    const epAfterEdgeDelete = edgeCleaned.endpoints?.find((e: any) => e.id === "ep-1");
    expect(epAfterEdgeDelete).toBeDefined();
    expect(epAfterEdgeDelete?.databaseNodeIds).toEqual([]);
    expect(epAfterEdgeDelete?.pipelineSteps).toHaveLength(1);
    expect(epAfterEdgeDelete?.pipelineSteps?.[0]?.type).toBe("custom_code");
  });

  it("cleanUnusedImports preserves side-effect imports like dotenv/config and keeps default express import", () => {
    const rawIndex = `import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";

const app = express();
app.use(express.json());
`;
    const cleaned = cleanUnusedImports(rawIndex);
    expect(cleaned).toContain('import "dotenv/config";');
    expect(cleaned).toContain("import express");
    expect(cleaned).toContain("from \"express\"");
  });

  it("compileExpressV4Service and compileServiceNode always produce src/index.ts with express and dotenv/config imports", () => {
    const srvNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversation",
        techStack: "express",
        port: "8080",
      },
    };

    // Test compileExpressV4Service directly
    const expressResult = compileExpressV4Service(srvNode);
    const expressIndex = expressResult.files.find((f) => f.filename === "src/index.ts");
    expect(expressIndex).toBeDefined();
    expect(expressIndex!.content).toContain("import express");
    expect(expressIndex!.content).toContain('import "dotenv/config";');
    expect(expressIndex!.content).toContain("const app = express();");

    // Test compileServiceNode wrapper
    const compiledResult = compileServiceNode(srvNode);
    const compiledIndex = compiledResult.files.find((f) => f.filename === "src/index.ts");
    expect(compiledIndex).toBeDefined();
    expect(compiledIndex!.content).toContain("import express");
    expect(compiledIndex!.content).toContain('import "dotenv/config";');
    expect(compiledIndex!.content).toContain("const app = express();");
  });

  it("compileServiceNode and generateTypesPackage correctly type postSendMessage with LangGraph invoke, setHeader on ResponseContext, and auto-provision body.message", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-message",
      nodeId: "srv-conversations",
      name: "/sendMessage",
      type: "POST",
      summary: "Send message to conversation agent",
      requestBody: {
        id: "req-send-msg",
        fields: [
          { name: "thread_id", type: "string", required: false, id: "123" },
        ],
      },
      pipelineSteps: [
        {
          id: "step-lg-invoke",
          name: "agent",
          type: "langgraph_invoke",
          enabled: true,
          outputVariable: "agentResult",
          langGraphTargetNodeId: "agentNode",
          langGraphStreamingEnabled: false,
          langGraphThreadIdSource: "body.thread_id",
          langGraphStateMapping: {
            messages: "body.message",
          },
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessage.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // 1. Must include setHeader and header in ResponseContext union
    expect(routeCode).toContain("ConversationsPostSendMessageResponseContext =");
    expect(routeCode).toContain("setHeader?: (name: string, value: string | number | readonly string[]) => void | Response;");
    expect(routeCode).toContain("header?: (name: string, value?: string | number | readonly string[]) => void | Response;");

    // 2. Must guard res.setHeader call
    expect(routeCode).toContain('if (body.thread_id && typeof res.setHeader === "function") {');
    expect(routeCode).toContain('res.setHeader("X-Thread-Id", String(body.thread_id));');

    // 3. Must contain state channel mapping
    expect(routeCode).toContain('"messages": body.message');

    // 4. Must NOT contain any, unknown, or as casts in route handler
    expect(routeCode).not.toContain(": any");
    expect(routeCode).not.toContain("as any");
    expect(routeCode).not.toContain("as unknown");
    expect(routeCode).not.toMatch(/\bas\s+[A-Za-z0-9_]+/);

    // 5. Types package must include both thread_id and message in body interface and schema
    const typesFiles = generateTypesPackage(
      [serviceNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );

    const typesFile = typesFiles.find((f) =>
      f.filename.includes("postSendMessage.ts"),
    );
    expect(typesFile).toBeDefined();
    const typeCode = typesFile!.content;

    expect(typeCode).toContain("export interface ConversationsPostSendMessageBody {");
    expect(typeCode).toContain("thread_id?: string;");
    expect(typeCode).toContain("message?: string;");
    expect(typeCode).toContain("conversationsPostSendMessageBodySchema = z.object({");
    expect(typeCode).toMatch(/message:\s*z\.string\(\)\.optional\(\)/);

    // 6. Must NOT contain any, unknown, or as casts in types file
    expect(typeCode).not.toContain(": any");
    expect(typeCode).not.toContain("as any");
    expect(typeCode).not.toContain("as unknown");
    expect(typeCode).not.toContain(": unknown");
    expect(typeCode).not.toMatch(/\bas\s+[A-Za-z0-9_]+/);
  });

  it("compiles endpoint with path params and requireAuth without TypeScript overload mismatch", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-message-by-id",
      nodeId: "srv-conversations",
      name: "/send-message/:id",
      type: "POST",
      summary: "Send message by ID",
      requireAuth: true,
      pathParams: [
        { id: "param-id", name: "id", type: "string", required: true },
      ],
      queryParams: [
        { id: "param-q", name: "filter", type: "string", required: false },
      ],
      pipelineSteps: [
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 201,
          inputBindings: [
            {
              argName: "field_1",
              source: { kind: "req_params", field: "id" },
            },
          ],
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    // 1. Verify route handler file is generated
    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessageById.ts"),
    );
    expect(routeFile).toBeDefined();
    expect(routeFile!.content).toContain("export async function postSendMessageByIdHandler");
    expect(routeFile!.content).toContain("ConversationsPostSendMessageByIdParams");
    expect(routeFile!.content).toContain("AuthUser");
    expect(routeFile!.content).not.toContain("export type AuthUser = {");
    expect(routeFile!.content).toContain("user?: AuthUser;");
    expect(routeFile!.content).not.toContain('Express.Request["user"]');

    // 2. Verify router registration mounts requireAuth()
    const routesIndex = compiledService.files.find((f) => f.filename === "src/routes/index.ts");
    expect(routesIndex).toBeDefined();
    expect(routesIndex!.content).toContain('router.post("/send-message/:id", requireAuth(), postSendMessageByIdHandler);');

    // 3. Verify requireAuth middleware has generic signature preventing ParamsDictionary lock
    const requireAuthFile = compiledService.files.find((f) => f.filename === "src/middleware/requireAuth.ts");
    expect(requireAuthFile).toBeDefined();
    expect(requireAuthFile!.content).toContain("export function requireAuth<");
    expect(requireAuthFile!.content).toContain("P = any");
    expect(requireAuthFile!.content).toContain("RequestHandler<P, ResBody, ReqBody, ReqQuery>");

    // 4. Verify src/types.d.ts is generated with Express namespace augmentation importing AuthUser from @workspace/types
    const typesDtsFile = compiledService.files.find((f) => f.filename === "src/types.d.ts");
    expect(typesDtsFile).toBeDefined();
    expect(typesDtsFile!.content).toContain('import type { AuthUser } from "@workspace/types";');
    expect(typesDtsFile!.content).not.toContain("export interface AuthUser {");
    expect(typesDtsFile!.content).toContain("interface Request {");
    expect(typesDtsFile!.content).toContain("user?: AuthUser;");

    // 5. Verify types package generates proper Params and Response interface inferred from pathParams config
    const typesFiles = generateTypesPackage(
      [serviceNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );
    const authTypeFile = typesFiles.find((f) => f.filename === "src/auth.ts");
    expect(authTypeFile).toBeDefined();
    expect(authTypeFile!.content).toContain("export interface AuthUser {");

    const typesIndexFile = typesFiles.find((f) => f.filename === "src/index.ts");
    expect(typesIndexFile).toBeDefined();
    expect(typesIndexFile!.content).toContain('export * from "./auth";');

    const typesFile = typesFiles.find((f) => f.filename.includes("postSendMessageById.ts"));
    expect(typesFile).toBeDefined();
    expect(typesFile!.content).toContain("export interface ConversationsPostSendMessageByIdParams {");
    expect(typesFile!.content).toContain("id: string;");
    expect(typesFile!.content).toContain("export interface ConversationsPostSendMessageByIdResponse {");
    expect(typesFile!.content).toContain("field_1: string;");
    expect(typesFile!.content).not.toContain("field_1: Record<string, string | number | boolean | null>;");
  });

  it("does NOT generate Auth types for non-authenticated endpoints or public services", () => {
    const serviceNode: BackendNode = {
      id: "srv-public",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "public_service",
        techStack: "express",
        port: "8080",
      },
    };

    const publicEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-public-info",
      nodeId: "srv-public",
      name: "/info",
      type: "GET",
      summary: "Public information",
      requireAuth: false,
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [publicEndpoint],
      [],
      [serviceNode],
      [],
      [],
      [],
      [],
      "public_service",
    );

    const routeFile = compiledService.files.find((f) => f.filename.includes("getInfo.ts"));
    expect(routeFile).toBeDefined();
    expect(routeFile!.content).not.toContain("AuthUser");
    expect(routeFile!.content).not.toContain("user?:");
    expect(routeFile!.content).not.toContain("declare global");

    const routesIndex = compiledService.files.find((f) => f.filename === "src/routes/index.ts");
    expect(routesIndex).toBeDefined();
    expect(routesIndex!.content).toContain('router.get("/info", getInfoHandler);');
    expect(routesIndex!.content).not.toContain("requireAuth");

    const requireAuthFile = compiledService.files.find((f) => f.filename === "src/middleware/requireAuth.ts");
    expect(requireAuthFile).toBeUndefined();

    const typesDtsFile = compiledService.files.find((f) => f.filename === "src/types.d.ts");
    expect(typesDtsFile).toBeUndefined();
  });

  it("infers response types dynamically from parameter and body configurations rather than hardcoding", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-mixed-types",
      nodeId: "srv-conversation",
      name: "/items/:itemId",
      type: "POST",
      summary: "Mixed types inference",
      pathParams: [{id:"123456789", name: "itemId", type: "number", required: true }],
      queryParams: [{id:"12345678", name: "active", type: "boolean", required: false }],
      requestBody: {
        id: "rb-1",
        fields: [
          { id: "f1", name: "count", type: "number", required: true, key: "count", value: "" },
          { id: "f2", name: "label", type: "string", required: true, key: "label", value: "" },
        ],
      },
      pipelineSteps: [
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 200,
          inputBindings: [
            {
              argName: "itemId",
              source: { kind: "req_params", field: "itemId" },
            },
            {
              argName: "isActive",
              source: { kind: "req_query", field: "active" },
            },
            {
              argName: "totalCount",
              source: { kind: "req_body", field: "count" },
            },
            {
              argName: "itemLabel",
              source: { kind: "req_body", field: "label" },
            },
          ],
        },
      ],
    };

    const typesFiles = generateTypesPackage(
      [serviceNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );
    const typesFile = typesFiles.find((f) => f.filename.includes("postItemsByItemId.ts"));
    expect(typesFile).toBeDefined();
    expect(typesFile!.content).toContain("export interface ConversationsPostItemsByItemIdResponse {");
    expect(typesFile!.content).toContain("itemId: number;");
    expect(typesFile!.content).toContain("isActive?: boolean | undefined;");
    expect(typesFile!.content).toContain("totalCount: number;");
    expect(typesFile!.content).toContain("itemLabel: string;");
    expect(typesFile!.content).not.toContain("itemId: Record<string, string | number | boolean | null>;");
  });

  it("compiles endpoint with optional query param mapped to response step without TS2322 undefined mismatch", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-msg",
      nodeId: "srv-conversation",
      name: "/send-message/:id",
      type: "POST",
      summary: "Send message by ID with query demo",
      pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
      queryParams: [{ id: "q1", name: "demo", type: "string", required: false }],
      pipelineSteps: [
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 201,
          inputBindings: [
            {
              argName: "field_1",
              source: { kind: "req_params", field: "id" },
            },
            {
              argName: "field_2",
              source: { kind: "req_query", field: "demo" },
            },
          ],
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessageById.ts"),
    );
    expect(routeFile).toBeDefined();
    expect(routeFile!.content).toContain("field_2: req.query.demo");

    const typesFiles = generateTypesPackage(
      [serviceNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );
    const typesFile = typesFiles.find((f) => f.filename.includes("postSendMessageById.ts"));
    expect(typesFile).toBeDefined();
    expect(typesFile!.content).toContain("field_1: string;");
    expect(typesFile!.content).toContain("field_2?: string | undefined;");
  });

  it("compiles endpoint mapping whole LangGraph step response to return_response field without TS2322 incompatibility on state", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const langGraphNode: BackendNode = {
      id: "lg-demo",
      type: "langgraph",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "demo",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
          { key: "message", type: "string", reducer: "replace" },
          { key: "count", type: "number", reducer: "add_number" },
        ],
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-msg-lg",
      nodeId: "srv-conversation",
      name: "/send-message/:id",
      type: "POST",
      summary: "Send message with full LangGraph step mapping",
      pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
      pipelineSteps: [
        {
          id: "step-demo",
          name: "demo",
          type: "langgraph_invoke",
          langGraphTargetNodeId: "lg-demo",
          outputVariable: "demoResult",
          langGraphThreadIdSource: "params.id",
          langGraphStateMapping: {
            message: "body.message",
          },
        },
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 201,
          inputBindings: [
            {
              argName: "field_1",
              source: { kind: "req_params", field: "id" },
            },
            {
              argName: "field_2",
              source: { kind: "step_output", stepId: "step-demo" },
            },
          ],
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode, langGraphNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessageById.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Route handler should construct demoResult with response, threadId, and state
    expect(routeCode).toContain("const demoResultRaw = await demoGraph.invoke(agentState, { configurable: { thread_id: req.params.id } });");
    expect(routeCode).toContain('"message": body.message');
    expect(routeCode).toContain("const demoResult = {");
    expect(routeCode).toContain("response: demoResultResponse,");
    expect(routeCode).toContain("threadId: req.params.id,");
    expect(routeCode).toContain("state: demoResultRaw,");
    expect(routeCode).toContain("field_2: demoResult");

    const typesFiles = generateTypesPackage(
      [serviceNode, langGraphNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );
    const typesFile = typesFiles.find((f) => f.filename.includes("postSendMessageById.ts"));
    expect(typesFile).toBeDefined();
    const typeCode = typesFile!.content;

    expect(typeCode).toContain("export interface ConversationsPostSendMessageByIdResponse {");
    expect(typeCode).toContain("field_1: string;");
    // Crucial: state must be Record<string, unknown> instead of Record<string, string | number | boolean | null>
    expect(typeCode).toContain("state?: Record<string, unknown>");
    expect(typeCode).not.toContain("state?: Record<string, string | number | boolean | null>");
  });

  it("compiles endpoint mapping LangGraph step 'response' and 'state' to return_response fields", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const langGraphNode: BackendNode = {
      id: "lg-demo",
      type: "langgraph",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "demo",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-msg-fields",
      nodeId: "srv-conversation",
      name: "/send-message/:id",
      type: "POST",
      summary: "Send message with specific LangGraph field mappings",
      pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
      pipelineSteps: [
        {
          id: "step-demo",
          name: "demo",
          type: "langgraph_invoke",
          langGraphTargetNodeId: "lg-demo",
          outputVariable: "demoResult",
          langGraphThreadIdSource: "body.thread_id",
          langGraphStateMapping: {
            messages: "body.message",
          },
        },
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 201,
          inputBindings: [
            {
              argName: "field_1",
              source: { kind: "step_output", stepId: "step-demo", field: "response" },
            },
            {
              argName: "field_2",
              source: { kind: "step_output", stepId: "step-demo", field: "state" },
            },
            {
              argName: "field_3",
              source: { kind: "step_output", stepId: "step-demo", field: "messages[last].content" },
            },
          ],
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode, langGraphNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessageById.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    expect(routeCode).toContain("field_1: demoResult.response");
    expect(routeCode).toContain("field_2: demoResult.state");
    // messages[last].content alias should also cleanly resolve to demoResult.response
    expect(routeCode).toContain("field_3: demoResult.response");

    const typesFiles = generateTypesPackage(
      [serviceNode, langGraphNode],
      [endpoint],
      [],
      [{ id: serviceNode.id, name: "conversations", folderName: "conversations" }],
      [],
    );
    const typesFile = typesFiles.find((f) => f.filename.includes("postSendMessageById.ts"));
    expect(typesFile).toBeDefined();
    const typeCode = typesFile!.content;

    expect(typeCode).toContain("field_1: string;");
    expect(typeCode).toContain("field_2: Record<string, unknown>;");
    expect(typeCode).toContain("field_3: string;");
  });

  it("compiles langgraph invoke step with overwrite operation using native __overwrite__ envelope", () => {
    const langGraphNode: BackendNode = {
      id: "node-lg-1",
      type: "langgraph",
      position: { x: 0, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "supportAgent",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: { label: "conversations" },
    };

    const endpoint: EndpointWithNode = {
      id: "ep-reset",
      nodeId: serviceNode.id,
      name: "/resetConversation",
      type: "POST",
      pipelineSteps: [
        {
          id: "step-reset",
          name: "supportAgent",
          type: "langgraph_invoke",
          langGraphTargetNodeId: langGraphNode.id,
          langGraphMessagesConfig: {
            mode: "single",
            userMessageSource: "body.message",
            operation: "overwrite",
          },
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode, langGraphNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postResetConversation.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    expect(routeCode).toContain('"messages": { __overwrite__: supportAgentMessages }');
  });

  it("compiles postSendMessageById with LangGraph token usage tracking without as any, as unknown, or type property access errors", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversation",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        techStack: "express",
        port: "8080",
      },
    };

    const langGraphNode: BackendNode = {
      id: "lg-agent",
      type: "langgraph",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "agent",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
        trackTokenUsage: true,
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-msg-usage",
      nodeId: "srv-conversation",
      name: "/send-message/:id",
      type: "POST",
      summary: "Send message with LangGraph invoke step tracking token usage",
      pathParams: [{ id: "p1", name: "id", type: "string", required: true }],
      pipelineSteps: [
        {
          id: "step-agent",
          name: "agent",
          type: "langgraph_invoke",
          langGraphTargetNodeId: "lg-agent",
          outputVariable: "langGraphAgentResult",
          langGraphThreadIdSource: "params.id",
          langGraphTrackTokenUsage: true,
          langGraphStateMapping: {
            messages: "body.message",
          },
        },
        {
          id: "step-ret",
          name: "Return Response",
          type: "return_response",
          statusCode: 200,
          inputBindings: [
            {
              argName: "result",
              source: { kind: "step_output", stepId: "step-agent" },
            },
          ],
        },
      ],
    };

    const compiledService = compileServiceNode(
      serviceNode,
      [endpoint],
      [],
      [serviceNode, langGraphNode],
      [],
      [],
      [],
      [],
      "conversations",
    );

    const routeFile = compiledService.files.find((f) =>
      f.filename.includes("postSendMessageById.ts"),
    );
    expect(routeFile).toBeDefined();
    const routeCode = routeFile!.content;

    // Must NOT have unsafe unchecked property accesses that cause TS2339
    expect(routeCode).not.toContain("_m?.usage_metadata");
    expect(routeCode).not.toContain("_m?.response_metadata?.token_usage");
    expect(routeCode).not.toContain("langGraphAgentResultRaw.usage");
    expect(routeCode).not.toContain("langGraphAgentResultRaw.token_usage");

    // Must NOT use any, unknown, or as type assertions
    expect(routeCode).not.toContain("as any");
    expect(routeCode).not.toContain("as unknown");
    expect(routeCode).not.toContain("(messageChunk as any)");

    // Must use type-safe guards with the 'in' operator and typeof checks
    expect(routeCode).toContain('"usage_metadata" in _mObj');
    expect(routeCode).toContain('"response_metadata" in _mObj');
    expect(routeCode).toContain('"token_usage" in _rm');
    expect(routeCode).toContain('"tokenUsage" in _rm');
    expect(routeCode).toContain('"kwargs" in _mObj');
    expect(routeCode).toContain('"usage" in _rawObj');
    expect(routeCode).toContain('"token_usage" in _rawObj');
    expect(routeCode).toContain('"tokenUsage" in _rawObj');
    expect(routeCode).toContain("JSON.parse");
  });

  it("extracts token usage and unwraps response from nested serialized AIMessage payload", () => {
    // Simulate user's exact runtime result from Groq/LangGraph
    const userPayloadRaw = {
      messages: [
        {
          lc: 1,
          type: "constructor",
          id: ["langchain_core", "messages", "HumanMessage"],
          kwargs: {
            content: "hi",
            additional_kwargs: {},
            response_metadata: {},
            id: "77422e4e-b24c-482e-8e49-90e5a08a8002",
          },
        },
        {
          lc: 1,
          type: "constructor",
          id: ["langchain_core", "messages", "AIMessage"],
          kwargs: {
            content: JSON.stringify({
              lc: 1,
              type: "constructor",
              id: ["langchain_core", "messages", "AIMessage"],
              kwargs: {
                content: "Hello! How can I assist you today?",
                additional_kwargs: {},
                tool_calls: [],
                invalid_tool_calls: [],
                usage_metadata: { input_tokens: 141, output_tokens: 34, total_tokens: 175 },
                response_metadata: {
                  tokenUsage: { completionTokens: 34, promptTokens: 141, totalTokens: 175 },
                  finish_reason: "stop",
                  model: "openai/gpt-oss-120b",
                  usage: {
                    prompt_tokens: 141,
                    completion_tokens: 34,
                    total_tokens: 175,
                    completion_tokens_details: {
                      reasoning_tokens: 16,
                    },
                  },
                },
              },
            }),
            tool_calls: [],
            invalid_tool_calls: [],
            additional_kwargs: {},
            response_metadata: {},
            id: "87b96208-b991-4657-b50f-de85750b922b",
          },
        },
      ],
    };

    // Execute the exact token usage extraction logic emitted by compileLangGraphStep
    const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };
    if (userPayloadRaw && typeof userPayloadRaw === "object") {
      const _rawObj: object = userPayloadRaw;
      const _rawMsgs = ("messages" in _rawObj && Array.isArray(_rawObj.messages)) ? _rawObj.messages : [];
      for (const _m of _rawMsgs) {
        if (_m && typeof _m === "object") {
          const _mObj: object = _m;
          let _u: object | undefined = undefined;
          let _rm: object | undefined = undefined;
          if ("response_metadata" in _mObj && typeof _mObj.response_metadata === "object" && _mObj.response_metadata !== null) {
            _rm = _mObj.response_metadata;
          } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "response_metadata" in _mObj.kwargs && typeof _mObj.kwargs.response_metadata === "object" && _mObj.kwargs.response_metadata !== null) {
            _rm = _mObj.kwargs.response_metadata;
          }
          if ("usage_metadata" in _mObj && typeof _mObj.usage_metadata === "object" && _mObj.usage_metadata !== null) {
            _u = _mObj.usage_metadata;
          } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "usage_metadata" in _mObj.kwargs && typeof _mObj.kwargs.usage_metadata === "object" && _mObj.kwargs.usage_metadata !== null) {
            _u = _mObj.kwargs.usage_metadata;
          } else if (_rm) {
            if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {
              _u = _rm.token_usage;
            } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {
              _u = _rm.tokenUsage;
            } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {
              _u = _rm.usage;
            }
          }
          if (!_u) {
            let _strMsg: string | undefined = undefined;
            if ("content" in _mObj && typeof _mObj.content === "string") {
              _strMsg = _mObj.content;
            } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "content" in _mObj.kwargs && typeof _mObj.kwargs.content === "string") {
              _strMsg = _mObj.kwargs.content;
            }
            if (_strMsg && _strMsg.startsWith("{")) {
              try {
                const _p = JSON.parse(_strMsg);
                if (typeof _p === "object" && _p !== null) {
                  if ("response_metadata" in _p && typeof _p.response_metadata === "object" && _p.response_metadata !== null) {
                    _rm = _p.response_metadata;
                  } else if ("kwargs" in _p && typeof _p.kwargs === "object" && _p.kwargs !== null && "response_metadata" in _p.kwargs && typeof _p.kwargs.response_metadata === "object" && _p.kwargs.response_metadata !== null) {
                    _rm = _p.kwargs.response_metadata;
                  }
                  if ("usage_metadata" in _p && typeof _p.usage_metadata === "object" && _p.usage_metadata !== null) {
                    _u = _p.usage_metadata;
                  } else if ("kwargs" in _p && typeof _p.kwargs === "object" && _p.kwargs !== null && "usage_metadata" in _p.kwargs && typeof _p.kwargs.usage_metadata === "object" && _p.kwargs.usage_metadata !== null) {
                    _u = _p.kwargs.usage_metadata;
                  } else if (_rm) {
                    if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {
                      _u = _rm.token_usage;
                    } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {
                      _u = _rm.tokenUsage;
                    } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {
                      _u = _rm.usage;
                    }
                  }
                }
              } catch {}
            }
          }
          if (_u) {
            const _in = ("input_tokens" in _u && typeof _u.input_tokens === "number" ? _u.input_tokens : ("prompt_tokens" in _u && typeof _u.prompt_tokens === "number" ? _u.prompt_tokens : ("promptTokens" in _u && typeof _u.promptTokens === "number" ? _u.promptTokens : ("inputTokens" in _u && typeof _u.inputTokens === "number" ? _u.inputTokens : 0))));
            const _out = ("output_tokens" in _u && typeof _u.output_tokens === "number" ? _u.output_tokens : ("completion_tokens" in _u && typeof _u.completion_tokens === "number" ? _u.completion_tokens : ("completionTokens" in _u && typeof _u.completionTokens === "number" ? _u.completionTokens : ("outputTokens" in _u && typeof _u.outputTokens === "number" ? _u.outputTokens : 0))));
            const _tot = ("total_tokens" in _u && typeof _u.total_tokens === "number" ? _u.total_tokens : ("totalTokens" in _u && typeof _u.totalTokens === "number" ? _u.totalTokens : (_in + _out)));
            let _reas = 0;
            if ("reasoning_tokens" in _u && typeof _u.reasoning_tokens === "number") {
              _reas = _u.reasoning_tokens;
            } else if ("reasoningTokens" in _u && typeof _u.reasoningTokens === "number") {
              _reas = _u.reasoningTokens;
            } else if ("completion_tokens_details" in _u && typeof _u.completion_tokens_details === "object" && _u.completion_tokens_details !== null) {
              const _ctd: object = _u.completion_tokens_details;
              if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;
              else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;
            } else if ("output_token_details" in _u && typeof _u.output_token_details === "object" && _u.output_token_details !== null) {
              const _otd: object = _u.output_token_details;
              if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;
              else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;
            }
            if (_reas === 0 && _rm) {
              if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {
                const _rmu: object = _rm.usage;
                if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {
                  const _ctd: object = _rmu.completion_tokens_details;
                  if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;
                  else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;
                } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {
                  _reas = _rmu.reasoning_tokens;
                }
              } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {
                const _ctd: object = _rm.completion_tokens_details;
                if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;
                else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;
              }
            }
            usage.input_tokens += _in;
            usage.output_tokens += _out;
            usage.total_tokens += _tot;
            usage.reasoning_tokens += _reas;
          }
        }
      }
    }
    expect(usage.input_tokens).toBe(141);
    expect(usage.output_tokens).toBe(34);
    expect(usage.total_tokens).toBe(175);
    expect(usage.reasoning_tokens).toBe(16);

    // Execute response unwrapping logic emitted by compileLangGraphStep
    const messages = Array.isArray(userPayloadRaw?.messages) ? userPayloadRaw.messages : [];
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
    let response: string = (typeof lastMsg === "object" && lastMsg !== null) ? (("content" in lastMsg && typeof lastMsg.content === "string") ? lastMsg.content : (("kwargs" in lastMsg && typeof lastMsg.kwargs === "object" && lastMsg.kwargs !== null && "content" in lastMsg.kwargs && typeof lastMsg.kwargs.content === "string") ? lastMsg.kwargs.content : (typeof lastMsg === "string" ? lastMsg : ""))) : (typeof lastMsg === "string" ? lastMsg : "");
    if (typeof response === "string" && response.startsWith("{")) {
      try {
        const _parsedMsg = JSON.parse(response);
        if (typeof _parsedMsg === "object" && _parsedMsg !== null) {
          if ("kwargs" in _parsedMsg && typeof _parsedMsg.kwargs === "object" && _parsedMsg.kwargs !== null && "content" in _parsedMsg.kwargs && typeof _parsedMsg.kwargs.content === "string") {
            response = _parsedMsg.kwargs.content;
          } else if ("content" in _parsedMsg && typeof _parsedMsg.content === "string") {
            response = _parsedMsg.content;
          }
        }
      } catch {}
    }

    expect(response).toBe("Hello! How can I assist you today?");
  });
});

