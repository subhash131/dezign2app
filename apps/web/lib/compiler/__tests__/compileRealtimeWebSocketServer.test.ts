import { describe, it, expect } from "vitest";
import { generateConfigFiles, generateLibFiles, generateServerFile, resolveServiceRealtimeCapabilities } from "../generators/configGenerator";
import { compileServiceNode, isServiceConnectedToWebSocket } from "../compileServiceNode";
import { BackendNode, Endpoint, EndpointWithNode } from "@/types/canvas";

describe("Realtime WebSocket Server Generation", () => {
  it("generates src/lib/websocket.ts with initWebSocketServer, room protection, and wsBroadcast", () => {
    const files = generateLibFiles(true, { ws: true });
    const wsFile = files.find((f) => f.filename === "src/lib/websocket.ts");
    const sseFile = files.find((f) => f.filename === "src/lib/sse.ts");
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(wsFile).toBeDefined();
    expect(wsFile?.content).toContain("export function initWebSocketServer(");
    expect(wsFile?.content).toContain("export function getWebSocketServer(");
    expect(wsFile?.content).toContain("export function wsBroadcast(");
    expect(wsFile?.content).toContain("new WebSocketServer({ server, path: \"/ws\" })");

    // Room subscription and protection logic
    expect(wsFile?.content).toContain('action === "join"');
    expect(wsFile?.content).toContain('action === "leave"');
    expect(wsFile?.content).toContain('action === "ping"');
    expect(wsFile?.content).toContain('room.startsWith("private:")');
    expect(wsFile?.content).toContain("Authentication required for private rooms");

    // Strict typing checks: no implicit or explicit any/unknown, typed callbacks
    expect(wsFile?.content).toContain('import { Server as HttpServer, IncomingMessage } from "http";');
    expect(wsFile?.content).toContain('import { WebSocketServer, WebSocket, RawData } from "ws";');
    expect(wsFile?.content).toContain('(ws: WebSocket, req: IncomingMessage)');
    expect(wsFile?.content).toContain('(raw: RawData)');
    expect(wsFile?.content).toContain('(err: Error)');
    expect(wsFile?.content).not.toMatch(/\(ws:\s*WebSocket,\s*req\)\s*=>/);
    expect(wsFile?.content).not.toMatch(/\(raw\)\s*=>/);
    expect(wsFile?.content).not.toMatch(/\(err\)\s*=>/);
    expect(wsFile?.content).not.toMatch(/:\s*any\b/);
    expect(wsFile?.content).not.toMatch(/:\s*unknown\b/);
    expect(wsFile?.content).not.toMatch(/\bas\s+any\b/);
    expect(wsFile?.content).not.toMatch(/\bas\s+unknown\b/);

    // SSE file should be omitted when only WS is enabled
    expect(sseFile).toBeUndefined();

    // Re-exported in realtime and index
    expect(realtimeFile).toBeDefined();
    expect(realtimeFile?.content).toContain('export * from "./websocket";');
    expect(realtimeFile?.content).not.toContain('export * from "./sse";');

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain('export * from "./realtime";');
  });

  it("generates src/lib/sse.ts and omits websocket code when only SSE is configured", () => {
    const files = generateLibFiles(true, { sse: true });
    const sseFile = files.find((f) => f.filename === "src/lib/sse.ts");
    const wsFile = files.find((f) => f.filename === "src/lib/websocket.ts");
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(sseFile).toBeDefined();
    expect(sseFile?.content).toContain("export function handleSseConnection(");
    expect(sseFile?.content).toContain("export function sseBroadcast(");
    expect(sseFile?.content).not.toContain("WebSocketServer");
    expect(sseFile?.content).not.toContain("initWebSocketServer");
    expect(sseFile?.content).not.toContain('from "ws"');

    // WebSocket file should be omitted when only SSE is enabled
    expect(wsFile).toBeUndefined();

    // Realtime barrel re-exports only SSE
    expect(realtimeFile).toBeDefined();
    expect(realtimeFile?.content).toContain('export * from "./sse";');
    expect(realtimeFile?.content).not.toContain('export * from "./websocket";');
    expect(realtimeFile?.content).not.toContain("initWebSocketServer");

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain('export * from "./realtime";');
  });

  it("omits src/lib/realtime.ts, sse.ts, websocket.ts and realtime exports when realtime is not enabled", () => {
    const files = generateLibFiles(true, false);
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const sseFile = files.find((f) => f.filename === "src/lib/sse.ts");
    const wsFile = files.find((f) => f.filename === "src/lib/websocket.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(realtimeFile).toBeUndefined();
    expect(sseFile).toBeUndefined();
    expect(wsFile).toBeUndefined();
    expect(indexFile).toBeDefined();
    expect(indexFile?.content).not.toContain('export * from "./realtime";');
    expect(indexFile?.content).toContain("export function formatResponse<T>");
  });

  it("generates src/index.ts with http.createServer and initWebSocketServer attached when enabled", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ChatService",
        port: "8080",
        enableWebSocket: true,
      },
    };

    const serverFile = generateServerFile(
      "ChatService",
      "8080",
      true,
      "*",
      serviceNode,
      [serviceNode],
      [],
    );
    expect(serverFile).toBeDefined();
    expect(serverFile.filename).toBe("src/index.ts");

    const content = serverFile.content;
    expect(content).toContain('import http from "http";');
    expect(content).toContain('import { initWebSocketServer } from "./lib";');
    expect(content).toContain("const server = http.createServer(app);");
    expect(content).toContain("initWebSocketServer(server);");
    expect(content).toContain("server.listen(PORT, () => {");
    expect(content).toContain('WebSocket realtime server at ws://localhost:${PORT}/ws');
    expect(content).not.toContain("SSE realtime stream");
  });

  it("includes ws and @types/ws in generated package.json when WebSocket is enabled", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "OrderService",
        port: "8085",
        enableWebSocket: true,
      },
    };

    const files = generateConfigFiles(
      serviceNode,
      "order-service",
      "OrderService",
      "8085",
      true,
      [],
      [],
      [serviceNode],
      [],
    );

    const packageFile = files.find((f) => f.filename === "package.json");
    expect(packageFile).toBeDefined();

    const pkg = JSON.parse(packageFile!.content);
    expect(pkg.dependencies).toHaveProperty("ws");
    expect(pkg.devDependencies).toHaveProperty("@types/ws");
  });

  it("generates clean REST server without WebSocket or SSE when not configured", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ConversationsService",
        port: "8080",
      },
    };

    const serverFile = generateServerFile(
      "ConversationsService",
      "8080",
      true,
      "*",
      serviceNode,
      [serviceNode],
      [],
    );
    expect(serverFile).toBeDefined();

    const content = serverFile.content;
    // Clean express setup
    expect(content).toContain("app.listen(PORT, () => {");
    expect(content).not.toContain('import http from "http";');
    expect(content).not.toContain("initWebSocketServer");
    expect(content).not.toContain("handleSseConnection");
    expect(content).not.toContain("WebSocket realtime server");
    expect(content).not.toContain("SSE realtime stream");
    expect(content).not.toContain("/events");
    expect(content).not.toContain("/sse");
    expect(content).not.toContain("/ws");

    // Package.json should not have ws
    const configFiles = generateConfigFiles(
      serviceNode,
      "conversations",
      "ConversationsService",
      "8080",
      true,
      [],
      [],
      [serviceNode],
      [],
    );
    const packageFile = configFiles.find((f) => f.filename === "package.json");
    const pkg = JSON.parse(packageFile!.content);
    expect(pkg.dependencies).not.toHaveProperty("ws");
    expect(pkg.devDependencies).not.toHaveProperty("@types/ws");
  });

  it("generates SSE-only server when only SSE is configured", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "EventsService",
        port: "8080",
        enableSse: true,
      },
    };

    const serverFile = generateServerFile(
      "EventsService",
      "8080",
      true,
      "*",
      serviceNode,
      [serviceNode],
      [],
    );
    expect(serverFile).toBeDefined();

    const content = serverFile.content;
    expect(content).toContain('import { handleSseConnection } from "./lib";');
    expect(content).toContain('app.get("/events", handleSseConnection);');
    expect(content).toContain('app.get("/sse", handleSseConnection);');
    expect(content).toContain('SSE realtime stream at http://localhost:${PORT}/events');
    expect(content).not.toContain("initWebSocketServer");
    expect(content).not.toContain("WebSocket realtime server");
  });

  it("does not include ws or @types/ws in package.json when only SSE is enabled", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "EventsService",
        port: "8080",
        enableSse: true,
      },
    };

    const configFiles = generateConfigFiles(
      serviceNode,
      "events-service",
      "EventsService",
      "8080",
      true,
      [],
      [],
      [serviceNode],
      [],
    );
    const packageFile = configFiles.find((f) => f.filename === "package.json");
    expect(packageFile).toBeDefined();

    const pkg = JSON.parse(packageFile!.content);
    expect(pkg.dependencies).not.toHaveProperty("ws");
    expect(pkg.devDependencies).not.toHaveProperty("@types/ws");
  });

  it("generates src/lib/realtimeTypes.ts and avoids TS2308 ambiguity when both SSE and WebSocket are enabled", () => {
    const files = generateLibFiles(true, { sse: true, ws: true });
    const realtimeTypesFile = files.find((f) => f.filename === "src/lib/realtimeTypes.ts");
    const sseFile = files.find((f) => f.filename === "src/lib/sse.ts");
    const wsFile = files.find((f) => f.filename === "src/lib/websocket.ts");
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(realtimeTypesFile).toBeDefined();
    expect(realtimeTypesFile?.content).toContain("export type JsonPrimitive =");
    expect(realtimeTypesFile?.content).toContain("export type JsonObject =");
    expect(realtimeTypesFile?.content).toContain("export type JsonArray =");
    expect(realtimeTypesFile?.content).toContain("export type JsonValue =");

    expect(sseFile).toBeDefined();
    expect(sseFile?.content).toContain('import type { JsonValue } from "./realtimeTypes";');
    expect(sseFile?.content).not.toContain("export type JsonValue");
    expect(sseFile?.content).not.toContain("export type JsonPrimitive");

    expect(wsFile).toBeDefined();
    expect(wsFile?.content).toContain('import type { JsonValue } from "./realtimeTypes";');
    expect(wsFile?.content).not.toContain("export type JsonValue");
    expect(wsFile?.content).not.toContain("export type JsonPrimitive");

    expect(realtimeFile).toBeDefined();
    expect(realtimeFile?.content).toContain('export * from "./realtimeTypes";');
    expect(realtimeFile?.content).toContain('export * from "./sse";');
    expect(realtimeFile?.content).toContain('export * from "./websocket";');

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain('export * from "./realtime";');

    // Verify there are zero overlapping exported names between sse.ts and websocket.ts (preventing TS2308)
    const exportRegex = /export\s+(?:type|interface|function|const|let|var)\s+([A-Za-z0-9_]+)/g;
    const extractExports = (content: string) => {
      const names = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = exportRegex.exec(content)) !== null) {
        const exportedName = match[1];
        if (exportedName) {
          names.add(exportedName);
        }
      }
      return names;
    };

    const sseExports = extractExports(sseFile!.content);
    const wsExports = extractExports(wsFile!.content);
    const typesExports = extractExports(realtimeTypesFile!.content);

    const sseAndWsIntersection = [...sseExports].filter((x) => wsExports.has(x));
    const sseAndTypesIntersection = [...sseExports].filter((x) => typesExports.has(x));
    const wsAndTypesIntersection = [...wsExports].filter((x) => typesExports.has(x));

    expect(sseAndWsIntersection).toEqual([]);
    expect(sseAndTypesIntersection).toEqual([]);
    expect(wsAndTypesIntersection).toEqual([]);
  });

  it("does not install ws or generate websocket code when endpoint uses LangGraph invoke with SSE streaming", () => {
    const serviceNode: BackendNode = {
      id: "srv-chat",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "conversations",
        port: "8080",
        enableRealtime: true, // Generic realtime flag should not force WebSocket when step specifically uses SSE
      },
    };

    const endpoint: EndpointWithNode = {
      id: "ep-stream",
      nodeId: "srv-chat",
      name: "/chat/stream",
      type: "POST",
      pipelineSteps: [
        {
          id: "step-lg",
          name: "invoke-agent",
          type: "langgraph_invoke",
          enabled: true,
          langGraphStreamingEnabled: true,
          langGraphStreamingProtocol: "sse",
        },
      ],
    };

    const caps = resolveServiceRealtimeCapabilities(serviceNode, [endpoint], [], [serviceNode], []);
    expect(caps.hasSse).toBe(true);
    expect(caps.hasWs).toBe(false);

    const configFiles = generateConfigFiles(
      serviceNode,
      "conversations",
      "conversations",
      "8080",
      true,
      [endpoint],
      [],
      [serviceNode],
      [],
    );

    const packageJsonFile = configFiles.find((f) => f.filename === "package.json");
    expect(packageJsonFile).toBeDefined();
    const pkg = JSON.parse(packageJsonFile!.content);
    expect(pkg.dependencies).not.toHaveProperty("ws");
    expect(pkg.devDependencies).not.toHaveProperty("@types/ws");

    const serverFile = generateServerFile(
      "conversations",
      "8080",
      true,
      "*",
      serviceNode,
      [serviceNode],
      [],
      [endpoint],
      [],
    );
    expect(serverFile.content).not.toContain("initWebSocketServer");
    expect(serverFile.content).not.toContain('from "ws"');
    expect(serverFile.content).toContain("handleSseConnection");

    const libFiles = generateLibFiles(true, { sse: caps.hasSse, ws: caps.hasWs });
    expect(libFiles.find((f) => f.filename === "src/lib/websocket.ts")).toBeUndefined();
    expect(libFiles.find((f) => f.filename === "src/lib/sse.ts")).toBeDefined();
  });

  it("compileServiceNode disables WebSocket and strips ws dependencies when service has no WebSocket connection config even if enableWebSocket is present in node data", () => {
    const serviceNode: BackendNode = {
      id: "srv-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        port: "8080",
        enableWebSocket: true, // Stale canvas draft flag without actual WS steps or connections
        customDependencies: [
          { name: "ws", version: "^8.18.0", isDev: false },
          { name: "@types/ws", version: "^8.5.12", isDev: true },
        ],
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-msg",
      nodeId: "srv-conversations",
      name: "/chat/message",
      type: "POST",
      pipelineSteps: [
        {
          id: "step-lg",
          name: "invoke-agent",
          type: "langgraph_invoke",
          enabled: true,
          // No streaming enabled, regular sync invoke
        },
      ],
    };

    // 1. isServiceConnectedToWebSocket returns false
    const isWs = isServiceConnectedToWebSocket(serviceNode, [serviceNode], [], [endpoint], []);
    expect(isWs).toBe(false);

    // 2. compileServiceNode cleans up WebSocket
    const result = compileServiceNode(serviceNode, [endpoint], [], [serviceNode], []);
    expect(result).toBeDefined();

    const serverFile = result.files.find((f) => f.filename === "src/index.ts");
    expect(serverFile).toBeDefined();
    expect(serverFile?.content).toContain("app.listen(PORT, () => {");
    expect(serverFile?.content).not.toContain("initWebSocketServer");
    expect(serverFile?.content).not.toContain('import http from "http";');
    expect(serverFile?.content).not.toContain("WebSocket realtime server");
    expect(serverFile?.content).not.toContain("ws://localhost:");

    const packageJsonFile = result.files.find((f) => f.filename === "package.json");
    expect(packageJsonFile).toBeDefined();
    const pkg = JSON.parse(packageJsonFile!.content);
    expect(pkg.dependencies).not.toHaveProperty("ws");
    expect(pkg.devDependencies).not.toHaveProperty("@types/ws");

    const libIndexFile = result.files.find((f) => f.filename === "src/lib/index.ts");
    expect(libIndexFile).toBeDefined();
    expect(libIndexFile?.content).not.toContain('export * from "./realtime";');

    const websocketFile = result.files.find((f) => f.filename === "src/lib/websocket.ts");
    expect(websocketFile).toBeUndefined();
  });
});

