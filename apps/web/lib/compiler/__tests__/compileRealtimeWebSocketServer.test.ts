import { describe, it, expect } from "vitest";
import { generateConfigFiles, generateLibFiles, generateServerFile } from "../generators/configGenerator";
import { BackendNode } from "@/types/canvas";

describe("Realtime WebSocket Server Generation", () => {
  it("generates src/lib/realtime.ts with initWebSocketServer, room protection, and wsBroadcast", () => {
    const files = generateLibFiles(true);
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(realtimeFile).toBeDefined();
    expect(realtimeFile?.content).toContain("export function initWebSocketServer(");
    expect(realtimeFile?.content).toContain("export function getWebSocketServer(");
    expect(realtimeFile?.content).toContain("export function wsBroadcast(");
    expect(realtimeFile?.content).toContain("new WebSocketServer({ server, path: \"/ws\" })");

    // Room subscription and protection logic
    expect(realtimeFile?.content).toContain('action === "join"');
    expect(realtimeFile?.content).toContain('action === "leave"');
    expect(realtimeFile?.content).toContain('action === "ping"');
    expect(realtimeFile?.content).toContain('room.startsWith("private:")');
    expect(realtimeFile?.content).toContain("Authentication required for private rooms");

    // Re-exported in index
    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain('export * from "./realtime";');
  });

  it("generates src/index.ts with http.createServer and initWebSocketServer attached", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ChatService",
        port: "8080",
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
    expect(content).toContain('import { handleSseConnection, initWebSocketServer } from "./lib";');
    expect(content).toContain("const server = http.createServer(app);");
    expect(content).toContain("initWebSocketServer(server);");
    expect(content).toContain("server.listen(PORT, () => {");
    expect(content).toContain('WebSocket realtime server at ws://localhost:${PORT}/ws');
  });

  it("includes ws and @types/ws in generated package.json", () => {
    const serviceNode: BackendNode = {
      id: "node-svc",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "OrderService",
        port: "8085",
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
});
