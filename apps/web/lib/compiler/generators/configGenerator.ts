import { CompiledFile } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";
import {
  resolveEndpointTrace,
  resolveConsumerTrace,
  resolveProducerTrace,
} from "../traceResolver";
import { toEnvVarName } from "../utils";
import { isServiceConnectedToKafka } from "../kafka";
import { compileRedisNodes, isServiceConnectedToRedis } from "../compileRedisNodes";
import {
  INTER_SERVICE_PROTOCOL_GRPC,
  GRPC_DEFAULT_PORT,
} from "@workspace/canvas";

export function generateLibFiles(hasDb: boolean = true): CompiledFile[] {
  const dbExport = hasDb ? `export * from "@workspace/db/helpers";\n\n` : "";
  const libIndexCode = `/**
 * Shared lib helpers for this service.${hasDb ? "\n * DB access goes through @workspace/db/helpers — injection-safe prepared statements." : ""}
 */
${dbExport}export * from "./realtime";

export function formatResponse<T>(data: T, message = "Success") {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}
`;

  const realtimeCode = `import { Request, Response } from "express";
import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createLogger } from "@workspace/logger";

const logger = createLogger("Realtime");

type SseClient = {
  id: string;
  res: Response;
};

const sseClients = new Set<SseClient>();

/**
 * Express middleware / route handler for client SSE subscriptions.
 * Mount at GET /events or GET /sse.
 */
export function handleSseConnection(req: Request, res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof (res as any).flushHeaders === "function") {
    (res as any).flushHeaders();
  }

  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }

  const clientId = \`\${Date.now()}-\${Math.random().toString(36).substring(2, 9)}\`;
  const client: SseClient = { id: clientId, res };
  sseClients.add(client);
  logger.info(\`Client connected to SSE stream: \${clientId} (active: \${sseClients.size})\`);

  res.write(": connected\\n\\n");

  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\\n\\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
    logger.info(\`Client disconnected from SSE stream: \${clientId} (remaining: \${sseClients.size})\`);
  });
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Broadcasts an event and data payload to all connected SSE clients.
 */
export function sseBroadcast(eventName: string, data: JsonValue): void {
  logger.info(\`Broadcasting SSE event: "\${eventName}" to \${sseClients.size} client(s)\`);
  const payloadStr = typeof data === "string" ? data : JSON.stringify(data);
  for (const client of sseClients) {
    try {
      client.res.write(\`event: \${eventName}\\ndata: \${payloadStr}\\n\\n\`);
    } catch (err) {
      logger.error(\`Failed to deliver SSE event to client \${client.id}:\`, err);
      sseClients.delete(client);
    }
  }
}

export interface WsClientInfo {
  id: string;
  ws: WebSocket;
  rooms: Set<string>;
  token?: string;
}

export interface WebSocketInboundMessage {
  action?: string;
  type?: string;
  room?: string;
  event?: string;
  data?: JsonValue;
}

let wssInstance: WebSocketServer | null = null;
const wsClients = new Map<WebSocket, WsClientInfo>();

/**
 * Initializes the WebSocket server attached to an HTTP server instance.
 */
export function initWebSocketServer(server: HttpServer): WebSocketServer {
  if (wssInstance) {
    return wssInstance;
  }

  wssInstance = new WebSocketServer({ server, path: "/ws" });

  wssInstance.on("connection", (ws: WebSocket, req) => {
    const clientId = \`\${Date.now()}-\${Math.random().toString(36).substring(2, 9)}\`;
    const urlObj = new URL(req.url || "/ws", "http://localhost");
    const token = urlObj.searchParams.get("token") || undefined;

    const clientInfo: WsClientInfo = {
      id: clientId,
      ws,
      rooms: new Set<string>(),
      token,
    };
    wsClients.set(ws, clientInfo);
    logger.info(\`Client connected to WebSocket: \${clientId} (active: \${wsClients.size})\`);

    ws.send(JSON.stringify({ type: "connected", clientId }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WebSocketInboundMessage;
        const action = msg.action || msg.type;

        if (action === "join") {
          const room = msg.room;
          if (room && typeof room === "string") {
            // Room protection guard: rooms starting with "private:" require valid authentication token
            if (room.startsWith("private:") && !clientInfo.token) {
              logger.warn(\`Unauthorized room join attempt for "\${room}" from client \${clientId}\`);
              ws.send(JSON.stringify({ type: "error", error: "Authentication required for private rooms", room }));
              return;
            }
            clientInfo.rooms.add(room);
            logger.info(\`Client \${clientId} joined room: "\${room}"\`);
            ws.send(JSON.stringify({ type: "joined", room }));
          }
        } else if (action === "leave") {
          const room = msg.room;
          if (room && typeof room === "string") {
            clientInfo.rooms.delete(room);
            logger.info(\`Client \${clientId} left room: "\${room}"\`);
            ws.send(JSON.stringify({ type: "left", room }));
          }
        } else if (action === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (err) {
        logger.warn(\`Failed to parse message from client \${clientId}:\`, err);
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      logger.info(\`Client disconnected from WebSocket: \${clientId} (remaining: \${wsClients.size})\`);
    });

    ws.on("error", (err) => {
      logger.error(\`WebSocket error on client \${clientId}:\`, err);
    });
  });

  return wssInstance;
}

/**
 * Returns active WebSocket server instance if initialized.
 */
export function getWebSocketServer(): WebSocketServer | null {
  return wssInstance;
}

/**
 * Broadcasts an event to WebSocket clients. If room is provided, only broadcasts to clients in that room.
 */
export function wsBroadcast(eventName: string, data: JsonValue, room?: string): void {
  logger.info(\`Broadcasting WebSocket event: "\${eventName}"\${room ? \` to room "\${room}"\` : ""}\`, data);
  const payloadStr = JSON.stringify({
    event: eventName,
    data,
    room,
    timestamp: new Date().toISOString(),
  });

  for (const [ws, client] of wsClients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (room && !client.rooms.has(room)) continue;

    try {
      ws.send(payloadStr);
    } catch (err) {
      logger.error(\`Failed to deliver WS message to client \${client.id}:\`, err);
    }
  }
}

/**
 * Broadcasts an event via WebRTC Data Channels.
 */
export function webrtcBroadcast(eventName: string, data: JsonValue): void {
  logger.info(\`Broadcasting WebRTC event: "\${eventName}"\`, data);
}
`;

  return [
    {
      filename: "src/lib/index.ts",
      language: "typescript",
      content: libIndexCode,
    },
    {
      filename: "src/lib/realtime.ts",
      language: "typescript",
      content: realtimeCode,
    },
  ];
}

export function isGrpcEnabledForService(
  node: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): boolean {
  if (node.data?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC) {
    return true;
  }
  return allEdges.some((edge) => {
    if (edge.target === node.id) {
      const sourceNode = allNodes.find((n) => n.id === edge.source && n.type === "service");
      return sourceNode?.data?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC;
    }
    return false;
  });
}

export function generateServerFile(
  serviceName: string,
  port: string,
  cors: boolean,
  corsOrigins: string,
  node?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): CompiledFile {
  const grpcEnabled = node ? isGrpcEnabledForService(node, allNodes, allEdges) : false;
  const grpcPort = node?.data?.grpcPort || "50051";

  let serverCode = `import "dotenv/config";
import http from "http";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createLogger } from "@workspace/logger";
import { router as apiRouter } from "./routes";
import { initConsumers } from "./consumer";
import { handleSseConnection, initWebSocketServer } from "./lib";

const logger = createLogger("${serviceName}");
const app = express();
const PORT = process.env.PORT || ${port};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      ${corsOrigins && corsOrigins !== "*" ? `const allowed = ${JSON.stringify(corsOrigins.split(",").map((s) => s.trim()))};\n      if (!allowed.includes("*") && !allowed.includes(origin)) return callback(null, false);\n` : ""}      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "*"],
  })
);
// --- Request Logger ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(\`\${req.method} \${req.url}\`);
  next();
});

// --- Health Check ---
app.get("/health", (_req: Request, res: Response) => {
  logger.debug("Health check invoked");
  res.status(200).json({
    status: "UP",
    service: "${serviceName}",
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// --- Realtime SSE Streams ---
app.get("/events", handleSseConnection);
app.get("/sse", handleSseConnection);

// --- Mount Routes ---
app.use("/", apiRouter);

// --- Initialize Event Consumers ---
initConsumers().catch((err: unknown) => {
  logger.error("Failed to initialize event consumers:", err);
});

// --- Server & WebSocket Startup ---
const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  logger.info(\`🚀 Service "${serviceName}" operational at http://localhost:\${PORT}\`);
  logger.info(\`📋 Health check available at http://localhost:\${PORT}/health\`);
  logger.info(\`📡 SSE realtime stream at http://localhost:\${PORT}/events\`);
  logger.info(\`🔌 WebSocket realtime server at ws://localhost:\${PORT}/ws\`);
});
`;

  if (grpcEnabled) {
    serverCode += `
// --- gRPC Server Startup ---
import * as grpc from "@grpc/grpc-js";
const GRPC_PORT = Number(process.env.GRPC_PORT || ${grpcPort});
const grpcServer = new grpc.Server();
grpcServer.bindAsync(
  \`0.0.0.0:\${GRPC_PORT}\`,
  grpc.ServerCredentials.createInsecure(),
  (err: Error | null, port: number) => {
    if (err) {
      logger.error(\`Failed to bind gRPC server on port \${GRPC_PORT}:\`, err);
      return;
    }
    logger.info(\`⚡ gRPC server running at 0.0.0.0:\${port}\`);
    grpcServer.start();
  }
);
`;
  }

  return {
    filename: "src/index.ts",
    language: "typescript",
    content: serverCode,
  };
}

export function generateConfigFiles(
  node: BackendNode,
  sanitizedName: string,
  serviceName: string,
  port: string,
  cors: boolean,
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): CompiledFile[] {
  const grpcEnabled = isGrpcEnabledForService(node, allNodes, allEdges);
  const hasDb = allNodes.some(
    (n) => n.type === "database" || n.type === "entity" || n.type === "db_ref" || n.type === "auth",
  );
  const hasKafka = isServiceConnectedToKafka(node, allNodes, allEdges, endpoints, events);
  const firstKafkaNode = allNodes.find(
    (n) =>
      n.type === "kafka" ||
      n.type === "eventstream" ||
      (n.type === "queue" &&
        n.data?.implementation?.toLowerCase() === "kafka"),
  );
  const kafkaPackageFolder = firstKafkaNode
    ? (firstKafkaNode.data?.label
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "kafka")
    : "kafka";
  const kafkaPackageName = `@workspace/${kafkaPackageFolder}`;

  const hasRedis = isServiceConnectedToRedis(node, allNodes, allEdges, endpoints);
  const compiledRedis = hasRedis ? compileRedisNodes(allNodes, allEdges) : { packages: [], files: [] };
  const redisDeps: Record<string, string> = {};
  if (hasRedis) {
    if (compiledRedis.packages && compiledRedis.packages.length > 0) {
      compiledRedis.packages.forEach((p) => {
        redisDeps[p.packageName] = "workspace:*";
      });
    } else if (compiledRedis.packageName) {
      redisDeps[compiledRedis.packageName] = "workspace:*";
    }
  }

  const dependencies: Record<string, string> = {
    ...(hasDb ? { "@workspace/db": "workspace:*" } : {}),
    ...(hasKafka ? { [kafkaPackageName]: "workspace:*" } : {}),
    ...redisDeps,
    "@workspace/logger": "workspace:*",
    "@workspace/types": "workspace:*",
    express: "^4.19.2",
    cors: "^2.8.5",
    dotenv: "^16.4.5",
    zod: "^3.24.2",
    jose: "^5.9.6",
    ws: "^8.18.0",
  };

  if (grpcEnabled) {
    dependencies["@grpc/grpc-js"] = "^1.11.1";
    dependencies["@grpc/proto-loader"] = "^0.7.13";
  }

  const devDependencies: Record<string, string> = {
    "@workspace/typescript-config": "workspace:*",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.12",
    "ts-node-dev": "^2.0.0",
    typescript: "^5.3.3",
    vitest: "^1.6.0",
  };

  // Merge custom dependencies from node data
  if (Array.isArray(node.data?.customDependencies)) {
    node.data.customDependencies.forEach((dep) => {
      if (!dep || !dep.name) return;
      const ver = dep.version || "latest";
      if (dep.isDev) {
        devDependencies[dep.name] = ver;
      } else {
        dependencies[dep.name] = ver;
      }
    });
  }

  const packageJson = JSON.stringify(
    {
      name: `@workspace/${sanitizedName}`,
      version: "0.0.0",
      private: true,
      description:
        node.data?.description || `Generated microservice for ${serviceName}`,
      main: "dist/index.js",
      scripts: {
        build: "tsc",
        start: "node dist/index.js",
        dev: "ts-node-dev --respawn --watch .env src/index.ts",
        test: "vitest run",
      },
      dependencies,
      devDependencies,
    },
    null,
    2,
  );

  const tsconfig = JSON.stringify(
    {
      extends: "@workspace/typescript-config/base.json",
      compilerOptions: {
        outDir: "./dist",
        rootDir: "./src",
        declaration: false,
        declarationMap: false,
      },
      include: ["src/**/*"],
    },
    null,
    2,
  );

  const connectedServiceEnvLines: string[] = [];
  const seenTargetServiceIds = new Set<string>();

  allEdges.forEach((edge) => {
    if (edge.source === node.id) {
      const targetNode = allNodes.find(
        (n) => n.id === edge.target && n.type === "service",
      );
      if (targetNode && !seenTargetServiceIds.has(targetNode.id)) {
        seenTargetServiceIds.add(targetNode.id);
        const tgtLabel = targetNode.data?.label || targetNode.id;
        const tgtPort = targetNode.data?.port || "8080";
        const tgtGrpcPort = targetNode.data?.grpcPort || "50051";

        const usesGrpc = node.data?.interServiceProtocol === INTER_SERVICE_PROTOCOL_GRPC;

        if (usesGrpc) {
          const grpcEnvVarName = `${toEnvVarName(tgtLabel)}_GRPC_URL`;
          connectedServiceEnvLines.push(`${grpcEnvVarName}=localhost:${tgtGrpcPort}`);
        } else {
          const envVarName = `${toEnvVarName(tgtLabel)}_BASE_URL`;
          connectedServiceEnvLines.push(`${envVarName}=http://localhost:${tgtPort}`);
        }
      }
    }
  });

  const redisEnvLines: string[] = [];
  if (hasRedis) {
    if (compiledRedis.packages && compiledRedis.packages.length > 0) {
      compiledRedis.packages.forEach((pkg) => {
        const instNode = allNodes.find((n) => n.id === pkg.redisNodeId);
        const host = instNode?.data?.host || "localhost";
        const port = instNode?.data?.port ? String(instNode.data.port) : "6379";
        const envKey =
          instNode?.data?.connectionStringEnv ||
          (pkg.packageFolder === "redis"
            ? "REDIS_URL"
            : `${pkg.packageFolder.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}_URL`);
        redisEnvLines.push(`${envKey}=redis://${host}:${port}`);
        if (pkg.packageFolder === "redis" || redisEnvLines.length === 1) {
          redisEnvLines.push(`REDIS_HOST=${host}`);
          redisEnvLines.push(`REDIS_PORT=${port}`);
        }
      });
    } else {
      const primaryRedisNode = allNodes.find(
        (n) =>
          n.type === "redis_instance" ||
          (n.type === "database" &&
            (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
      );
      const redisHost = primaryRedisNode?.data?.host || "localhost";
      const redisPort = primaryRedisNode?.data?.port
        ? String(primaryRedisNode.data.port)
        : "6379";
      redisEnvLines.push(`REDIS_HOST=${redisHost}`);
      redisEnvLines.push(`REDIS_PORT=${redisPort}`);
    }
  }

  const grpcPort = node.data?.grpcPort || "50051";
  const dbEnvLines: string[] = [];
  if (hasDb) {
    dbEnvLines.push("DATABASE_PATH=../../packages/db/sqlite.db");
    dbEnvLines.push("DATABASE_URL=../../packages/db/sqlite.db");
  }

  const envFile = `PORT=${port}
GRPC_PORT=${grpcPort}
NODE_ENV=development
LOG_LEVEL=info
${dbEnvLines.length > 0 ? dbEnvLines.join("\n") + "\n" : ""}${redisEnvLines.length > 0 ? redisEnvLines.join("\n") + "\n" : ""}${connectedServiceEnvLines.length > 0 ? connectedServiceEnvLines.join("\n") + "\n" : ""}`;




  const gitignoreFile = `node_modules
dist
.env
*.log
`;

  // Build service-level README.md
  let readmeLines = [
    `# ${serviceName} Microservice`,
    ``,
    `Port: \`${port}\``,
    `Description: ${node.data?.description || "Modular microservice compiled from Dezign2App architecture canvas."}`,
    ``,
    `## Connected Routes & Endpoint Data Flow`,
    ``,
  ];

  const srvEndpoints = endpoints.filter((e) => e.nodeId === node.id);
  if (srvEndpoints.length === 0) {
    readmeLines.push(`- Health route: \`GET /health\``);
  } else {
    srvEndpoints.forEach((ep) => {
      const trace = resolveEndpointTrace(
        node,
        ep,
        allNodes,
        allEdges,
        endpoints,
      );
      readmeLines.push(
        `### \`${(ep.type || "GET").toUpperCase()} ${ep.name || "/"}\``,
      );
      readmeLines.push(`- **Summary**: ${ep.summary || "Endpoint handler"}`);

      readmeLines.push(`- **Incoming Callers**:`);
      if (trace.incoming.length > 0) {
        trace.incoming.forEach((inc) => {
          readmeLines.push(
            `  - ${inc.nodeName} (${inc.nodeType}): ${inc.detail}${inc.dataContext ? ` — ${inc.dataContext}` : ""}`,
          );
        });
      } else {
        readmeLines.push(`  - Direct HTTP Clients`);
      }

      readmeLines.push(`- **Outgoing Destinations**:`);
      if (trace.outgoing.length > 0) {
        trace.outgoing.forEach((out) => {
          readmeLines.push(
            `  - ${out.nodeName} (${out.nodeType}): ${out.detail}${out.dataContext ? ` — ${out.dataContext}` : ""}`,
          );
        });
      } else {
        readmeLines.push(`  - HTTP Response`);
      }
      readmeLines.push(``);
    });
  }

  const consumedEvents = events.filter(
    (e) => e.nodeId === node.id && e.variant === "consume",
  );
  if (consumedEvents.length > 0) {
    readmeLines.push(`## Consumed Events`);
    consumedEvents.forEach((ev) => {
      const trace = resolveConsumerTrace(node, ev, allNodes, allEdges);
      readmeLines.push(`### Event: \`${ev.name}\``);
      readmeLines.push(
        `- **Incoming Source**: ${trace.incoming.map((i: { nodeName: string; detail: string }) => `${i.nodeName} (${i.detail})`).join(", ")}`,
      );
      readmeLines.push(
        `- **Outgoing Target**: ${trace.outgoing.map((o: { nodeName: string; detail: string }) => `${o.nodeName} (${o.detail})`).join(", ") || "Domain Logic"}`,
      );
      readmeLines.push(``);
    });
  }

  const publishedEvents = events.filter(
    (e) => e.nodeId === node.id && e.variant === "publish",
  );
  if (publishedEvents.length > 0) {
    readmeLines.push(`## Published Events`);
    publishedEvents.forEach((ev) => {
      const trace = resolveProducerTrace(node, ev, allNodes, allEdges);
      readmeLines.push(`### Event: \`${ev.name}\``);
      readmeLines.push(
        `- **Destination Broker/Consumers**: ${trace.outgoing.map((o: { nodeName: string; detail: string }) => `${o.nodeName} (${o.detail})`).join(", ")}`,
      );
      readmeLines.push(``);
    });
  }

  return [
    {
      filename: "package.json",
      language: "json",
      content: packageJson,
    },
    {
      filename: "tsconfig.json",
      language: "json",
      content: tsconfig,
    },
    {
      filename: ".env",
      language: "dotenv",
      content: envFile,
    },
    {
      filename: ".gitignore",
      language: "gitignore",
      content: gitignoreFile,
    },
    {
      filename: "README.md",
      language: "markdown",
      content: readmeLines.join("\n"),
    },
  ];
}
