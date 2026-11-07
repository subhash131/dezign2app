import {
  CompiledFile,
  Endpoint,
  AnyMessagingResource,
  PipelineStep,
  RealtimeConnection,
} from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  resolveEndpointTrace,
  resolveConsumerTrace,
  resolveProducerTrace,
} from "../traceResolver";
import { toEnvVarName } from "../utils";
import { isServiceConnectedToKafka } from "../kafka";
import { compileRedisNodes, isServiceConnectedToRedis } from "../compileRedisNodes";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { compileStorageNodes, isServiceConnectedToStorage } from "../compileStorageNodes";
import { generateEnvFilesForNode, collectEnvSections } from "./generateEnvFile";
import {
  INTER_SERVICE_PROTOCOL_GRPC,
  GRPC_DEFAULT_PORT,
} from "@workspace/canvas";

export type RealtimeCapabilitiesParam =
  | boolean
  | {
      sse?: boolean;
      ws?: boolean;
    };

export function generateLibFiles(
  hasDb: boolean = true,
  realtime: RealtimeCapabilitiesParam = true,
): CompiledFile[] {
  let hasSse = false;
  let hasWs = false;

  if (typeof realtime === "boolean") {
    hasSse = realtime;
    hasWs = realtime;
  } else if (realtime && typeof realtime === "object") {
    hasSse = Boolean(realtime.sse);
    hasWs = Boolean(realtime.ws);
  }

  const hasRealtime = hasSse || hasWs;
  const dbExport = hasDb ? `export * from "@workspace/db/helpers";\n\n` : "";
  const realtimeExport = hasRealtime ? `export * from "./realtime";\n\n` : "";
  const libIndexCode = `/**
 * Shared lib helpers for this service.${hasDb ? "\n * DB access goes through @workspace/db/helpers — injection-safe prepared statements." : ""}
 */
${dbExport}${realtimeExport}export function formatResponse<T>(data: T, message = "Success") {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}
`;

  if (!hasRealtime) {
    return [
      {
        filename: "src/lib/index.ts",
        language: "typescript",
        content: libIndexCode,
      },
    ];
  }

  const files: CompiledFile[] = [
    {
      filename: "src/lib/index.ts",
      language: "typescript",
      content: libIndexCode,
    },
    {
      filename: "src/lib/realtimeTypes.ts",
      language: "typescript",
      content: `export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
`,
    },
  ];

  const realtimeReExports: string[] = ['export * from "./realtimeTypes";'];

  if (hasSse) {
    const sseCode = `import { Request, Response } from "express";
import { createLogger } from "@workspace/logger";
import type { JsonValue } from "./realtimeTypes";

const logger = createLogger("Realtime:SSE");

type SseClient = {
  id: string;
  res: Response;
  channel?: string;
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
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  if (req.socket) {
    req.socket.setKeepAlive(true);
    req.socket.setTimeout(0);
  }

  const clientId = \`\${Date.now()}-\${Math.random().toString(36).substring(2, 9)}\`;
  const channel = (req.query?.id || req.query?.channel || req.query?.room || req.query?.threadId || req.headers?.["x-channel-id"]) as string | undefined;
  const client: SseClient = { id: clientId, res, channel: channel ? String(channel) : undefined };
  sseClients.add(client);
  logger.info(\`Client connected to SSE stream: \${clientId}\${channel ? \` (channel: \${channel})\` : ""} (active: \${sseClients.size})\`);

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

/**
 * Broadcasts an event and data payload to all connected SSE clients (or filtered by channel).
 */
export function sseBroadcast(eventName: string, data: unknown, channel?: string): void {
  logger.info(\`Broadcasting SSE event: "\${eventName}" to \${sseClients.size} client(s)\${channel ? \` (channel: \${channel})\` : ""}\`);
  const payloadStr = typeof data === "string" ? data : JSON.stringify(data);
  for (const client of sseClients) {
    if (channel && client.channel && client.channel !== channel) {
      continue;
    }
    try {
      if (data === "[DONE]") {
        client.res.write("data: [DONE]\\n\\n");
      } else if (!eventName || eventName === "message") {
        client.res.write(\`data: \${payloadStr}\\n\\n\`);
      } else {
        client.res.write(\`event: \${eventName}\\ndata: \${payloadStr}\\n\\n\`);
      }
    } catch (err) {
      logger.error(\`Failed to deliver SSE event to client \${client.id}:\`, err);
      sseClients.delete(client);
    }
  }
}
`;
    realtimeReExports.push('export * from "./sse";');
    files.push({
      filename: "src/lib/sse.ts",
      language: "typescript",
      content: sseCode,
    });
  }

  if (hasWs) {
    const websocketCode = `import { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import { createLogger } from "@workspace/logger";
import type { JsonValue } from "./realtimeTypes";

const logger = createLogger("Realtime:WS");

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
  signalType?: string;
  signalData?: JsonValue;
  to?: string;
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

  wssInstance.on("connection", (ws: WebSocket, req: IncomingMessage) => {
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

    ws.on("message", (raw: RawData) => {
      try {
        const msg: WebSocketInboundMessage = JSON.parse(raw.toString());
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
        } else if (action === "signal" || action === "webrtc-signal") {
          // WebRTC signaling relay (offer, answer, candidate)
          const targetRoom = msg.room;
          const targetClient = msg.to;
          const signalPayload = JSON.stringify({
            type: "webrtc-signal",
            from: clientId,
            room: targetRoom,
            signalType: msg.signalType,
            signalData: msg.signalData || msg.data,
          });

          for (const [otherWs, otherClient] of wsClients.entries()) {
            if (otherWs === ws || otherWs.readyState !== WebSocket.OPEN) continue;
            if (targetClient && otherClient.id !== targetClient) continue;
            if (targetRoom && !otherClient.rooms.has(targetRoom)) continue;

            try {
              otherWs.send(signalPayload);
            } catch (err) {
              logger.error(\`Failed to forward WebRTC signal from \${clientId} to \${otherClient.id}:\`, err);
            }
          }
        }
      } catch (err) {
        logger.warn(\`Failed to parse message from client \${clientId}:\`, err);
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      logger.info(\`Client disconnected from WebSocket: \${clientId} (remaining: \${wsClients.size})\`);
    });

    ws.on("error", (err: Error) => {
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
export function wsBroadcast(eventName: string, data: Record<string, JsonValue | undefined>, room?: string): void {
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
 * Broadcasts an event via WebRTC Data Channels / signaling relay.
 * If room is provided, only broadcasts to clients in that room.
 */
export function webrtcBroadcast(eventName: string, data: Record<string, JsonValue | undefined>, room?: string): void {
  logger.info(\`Broadcasting WebRTC event: "\${eventName}"\${room ? \` to room "\${room}"\` : ""}\`, data);
  const payloadStr = JSON.stringify({
    type: "webrtc-data",
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
      logger.error(\`Failed to deliver WebRTC event to client \${client.id}:\`, err);
    }
  }
}
`;
    realtimeReExports.push('export * from "./websocket";');
    files.push({
      filename: "src/lib/websocket.ts",
      language: "typescript",
      content: websocketCode,
    });
  }

  const realtimeBarrelCode = `/**
 * Realtime communication exports.
 */
${realtimeReExports.join("\n")}
`;

  files.push({
    filename: "src/lib/realtime.ts",
    language: "typescript",
    content: realtimeBarrelCode,
  });

  return files;
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

export interface ServiceRealtimeCapabilities {
  hasSse: boolean;
  hasWs: boolean;
}

export function resolveServiceRealtimeCapabilities(
  node?: BackendNode,
  endpoints: (Endpoint & { nodeId?: string })[] = [],
  events: (AnyMessagingResource & { nodeId?: string; variant?: "publish" | "consume" })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): ServiceRealtimeCapabilities {
  const data = node?.data;
  const explicitWs = typeof data?.enableWebSocket === "boolean" ? data.enableWebSocket : undefined;
  const explicitSse = typeof data?.enableSse === "boolean" ? data.enableSse : undefined;
  const explicitRealtime = typeof data?.enableRealtime === "boolean" ? data.enableRealtime : undefined;

  let hasSse = explicitSse ?? explicitRealtime ?? false;
  let hasWs = explicitWs ?? explicitRealtime ?? false;

  const protocols = new Set<string>();

  const checkSteps = (steps: PipelineStep[] | undefined) => {
    if (!steps || !Array.isArray(steps)) return;
    for (const s of steps) {
      if (s.enabled !== false && s.type === "push_to_client") {
        const proto = String(s.clientDeliveryProtocol || "SSE").toUpperCase();
        protocols.add(proto);
      }
      // langgraph_invoke streaming requires SSE / WS infrastructure
      if (s.enabled !== false && s.type === "langgraph_invoke") {
        const streamProto = String(s.langGraphStreamingProtocol || "").toLowerCase();
        if (streamProto === "websocket" || streamProto === "ws") {
          protocols.add("WEBSOCKET");
        } else if (s.langGraphStreamingEnabled && (streamProto === "sse" || !s.langGraphStreamingProtocol)) {
          protocols.add("SSE");
        }
      }
      if (s.thenSteps) checkSteps(s.thenSteps);
      if (s.elseSteps) checkSteps(s.elseSteps);
      if (s.trySteps) checkSteps(s.trySteps);
      if (s.catchSteps) checkSteps(s.catchSteps);
      if (s.loopBody) checkSteps(s.loopBody);
      if (s.cacheMissSteps) checkSteps(s.cacheMissSteps);
      if (s.switchCases) s.switchCases.forEach((c) => checkSteps(c.steps));
      if (s.switchDefault) checkSteps(s.switchDefault);
      if (s.parallelBranches) s.parallelBranches.forEach((b) => checkSteps(b.steps));
    }
  };

  // Inspect endpoints
  endpoints.forEach((ep) => checkSteps(ep.pipelineSteps));
  if (Array.isArray(data?.endpoints)) {
    data.endpoints.forEach((ep) => checkSteps(ep.pipelineSteps));
  }
  if (Array.isArray(data?.routeGroups)) {
    data.routeGroups.forEach((g) => {
      if (Array.isArray(g.endpoints)) {
        g.endpoints.forEach((ep) => checkSteps(ep.pipelineSteps));
      }
    });
  }

  // Inspect consumed events
  events.forEach((ev) => checkSteps(ev.pipelineSteps));
  if (Array.isArray(data?.consumedEvents)) {
    data.consumedEvents.forEach((ev) => checkSteps(ev.pipelineSteps));
  }

  if (protocols.size > 0) {
    if (protocols.has("SSE")) hasSse = true;
    if (protocols.has("WEBSOCKET") || protocols.has("WS") || protocols.has("WEBRTC")) {
      hasWs = true;
    } else {
      // Pipeline steps are specifically configured and none require WebSocket
      hasWs = false;
    }
  }

  // Inspect connected WebPage nodes and page_ref nodes on canvas
  if (node) {
    // Track webPage IDs directly connected or linked via page_ref nodes to this service
    const connectedPageIds = new Set<string>();
    for (const edge of allEdges) {
      if (edge.source === node.id || edge.target === node.id) {
        const otherId = edge.source === node.id ? edge.target : edge.source;
        const otherNode = allNodes.find((n) => n.id === otherId);
        if (otherNode?.type === "webPage") {
          connectedPageIds.add(otherNode.id);
        } else if (otherNode?.type === "page_ref") {
          if (otherNode.data?.targetPageId) connectedPageIds.add(String(otherNode.data.targetPageId));
          if (otherNode.data?.pageRefId) connectedPageIds.add(String(otherNode.data.pageRefId));
        }
      }
    }

    for (const n of allNodes) {
      if (n.type === "webPage") {
        const conns: RealtimeConnection[] = Array.isArray(n.data?.realtimeConnections)
          ? n.data.realtimeConnections
          : [];

        for (const conn of conns) {
          let targetsThisService = false;
          if (conn.sourceServiceNodeId === node.id) {
            targetsThisService = true;
          } else if (
            allEdges.some(
              (e) =>
                (e.source === node.id && e.target === n.id) ||
                (e.target === node.id && e.source === n.id),
            ) ||
            connectedPageIds.has(n.id)
          ) {
            targetsThisService = true;
          }

          if (targetsThisService) {
            const proto = String(conn.protocol || "SSE").toUpperCase();
            if (proto === "SSE") hasSse = true;
            if (proto === "WEBSOCKET" || proto === "WS" || proto === "WEBRTC") {
              if (protocols.size === 0 || protocols.has("WEBSOCKET") || protocols.has("WS") || protocols.has("WEBRTC")) {
                hasWs = true;
              }
            }
          }
        }
      }
    }
  }

  if (explicitSse === false) hasSse = false;
  if (explicitWs === false) hasWs = false;

  return { hasSse, hasWs };
}

export function parseRateLimit(rateLimitStr?: string): { max: number; windowMs: number; desc: string } | null {
  if (!rateLimitStr || typeof rateLimitStr !== "string") return null;
  const trimmed = rateLimitStr.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+)(?:\/(\d+)?([smhd]))?$/i);
  if (!match) {
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num > 0) {
      return { max: num, windowMs: 60 * 1000, desc: "1 minute" };
    }
    return null;
  }

  const max = parseInt(match[1]!, 10);
  const multiplier = match[2] ? parseInt(match[2], 10) : 1;
  const unit = (match[3] || "m").toLowerCase();

  let unitMs = 60 * 1000;
  let unitName = "minute";
  if (unit === "s") {
    unitMs = 1000;
    unitName = "second";
  } else if (unit === "h") {
    unitMs = 60 * 60 * 1000;
    unitName = "hour";
  } else if (unit === "d") {
    unitMs = 24 * 60 * 60 * 1000;
    unitName = "day";
  }

  const windowMs = multiplier * unitMs;
  const desc = multiplier === 1 ? `1 ${unitName}` : `${multiplier} ${unitName}s`;
  return { max, windowMs, desc };
}

export function generateServerFile(
  serviceName: string,
  port: string,
  cors: boolean,
  corsOrigins: string,
  node?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant?: "publish" | "consume";
  })[] = [],
): CompiledFile {
  const grpcEnabled = node ? isGrpcEnabledForService(node, allNodes, allEdges) : false;
  const grpcPort = String(node?.data?.grpcPort || node?.data?.server?.grpcPort || "50051");
  const { hasSse, hasWs } = resolveServiceRealtimeCapabilities(node, endpoints, events, allNodes, allEdges);

  const parsedRateLimit = parseRateLimit(
    node?.data?.rateLimit ||
    node?.data?.server?.rateLimit ||
    node?.data?.serverConfig?.rateLimit,
  );
  const rateLimitImportLine = parsedRateLimit ? `import rateLimit from "express-rate-limit";\n` : "";
  const corsImportLine = cors ? `import cors from "cors";\n` : "";

  const libImports: string[] = [];
  if (hasSse) libImports.push("handleSseConnection");
  if (hasWs) libImports.push("initWebSocketServer");
  const libImportLine = libImports.length > 0 ? `import { ${libImports.join(", ")} } from "./lib";\n` : "";
  const httpImportLine = hasWs ? `import http from "http";\n` : "";

  let serverCode = `import "dotenv/config";
${httpImportLine}import express, { Request, Response, NextFunction } from "express";
${corsImportLine}${rateLimitImportLine}import { createLogger } from "@workspace/logger";
import { router as apiRouter } from "./routes";
import { initConsumers } from "./consumer";
${libImportLine}
const logger = createLogger("${serviceName}");
const app = express();
const PORT = process.env.PORT || ${port};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
${cors ? `app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true);
      ${corsOrigins && corsOrigins !== "*" ? `const allowed = ${JSON.stringify(corsOrigins.split(",").map((s) => s.trim()))};\n      if (!allowed.includes("*") && !allowed.includes(origin)) return callback(null, false);\n` : ""}      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "*"],
  })
);\n` : ""}${parsedRateLimit ? `// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: ${parsedRateLimit.windowMs}, // ${parsedRateLimit.desc}
  max: ${parsedRateLimit.max}, // limit each IP to ${parsedRateLimit.max} requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);\n` : ""}// --- Request Logger ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(\`\${req.method} \${req.url}\`);
  next();
});

// --- Mount Routes ---
app.use("/", apiRouter);

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
${hasSse ? `
// --- Realtime SSE Streams ---
app.get("/events", handleSseConnection);
app.get("/sse", handleSseConnection);
` : ""}

// --- Initialize Event Consumers ---
initConsumers().catch((err: Error) => {
  logger.error("Failed to initialize event consumers:", err);
});
`;

  if (hasWs) {
    serverCode += `
// --- Server & WebSocket Startup ---
const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  logger.info(\`🚀 Service "${serviceName}" operational at http://localhost:\${PORT}\`);
  logger.info(\`📋 Health check available at http://localhost:\${PORT}/health\`);
${hasSse ? `  logger.info(\`📡 SSE realtime stream at http://localhost:\${PORT}/events\`);\n` : ""}  logger.info(\`🔌 WebSocket realtime server at ws://localhost:\${PORT}/ws\`);
});
`;
  } else {
    serverCode += `
app.listen(PORT, () => {
  logger.info(\`🚀 Service "${serviceName}" operational at http://localhost:\${PORT}\`);
  logger.info(\`📋 Health check available at http://localhost:\${PORT}/health\`);
${hasSse ? `  logger.info(\`📡 SSE realtime stream at http://localhost:\${PORT}/events\`);\n` : ""}});
`;
  }

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

  const hasStorage = isServiceConnectedToStorage(node, allNodes, allEdges, endpoints, events);
  const storageDeps: Record<string, string> = {};
  if (hasStorage) {
    const compiledStorage = compileStorageNodes(allNodes, allEdges, endpoints, events);
    if (compiledStorage.packages && compiledStorage.packages.length > 0) {
      compiledStorage.packages.forEach((p) => {
        storageDeps[p.packageName] = "workspace:*";
      });
    } else if (compiledStorage.packageName) {
      storageDeps[compiledStorage.packageName] = "workspace:*";
    }
  }

  const { hasSse, hasWs } = resolveServiceRealtimeCapabilities(node, endpoints, events, allNodes, allEdges);
  const requiresWs = hasWs;

  const dbDeps: Record<string, string> = {};
  if (hasDb) {
    dbDeps["@workspace/db"] = "workspace:*";
    const compiledDb = compileDatabaseNodes(allNodes, allEdges);
    if (compiledDb.packages && compiledDb.packages.length > 0) {
      compiledDb.packages.forEach((p) => {
        if (p.packageName && p.packageName !== "@workspace/db") {
          dbDeps[p.packageName] = "workspace:*";
        }
      });
    }
  }

  const langGraphDeps: Record<string, string> = {};
  let hasGlobalTransformers = false;
  const serviceEndpoints = endpoints.filter(
    (e) =>
      e.nodeId === node.id ||
      (e.nodeId &&
        ((node.data?.label && e.nodeId === node.data.label) ||
          (node.data?.label && e.nodeId === node.data.label.toLowerCase()))),
  );

  function checkStepsForLangGraph(steps: PipelineStep[] | undefined) {
    if (!steps || !Array.isArray(steps)) return;
    for (const step of steps) {
      if (step.enabled === false) continue;
      // Detect global transformer imports → @workspace/transformers dependency
      if (step.type === "transform") {
        const importPath = step.functionRef?.importPath || "";
        if (
          step.functionRef?.isGlobal ||
          importPath === "@workspace/transformers" ||
          importPath.startsWith("@workspace/transformers")
        ) {
          hasGlobalTransformers = true;
        }
      }
      if (step.type === "langgraph_invoke") {
        if (step.functionRef?.importPath?.startsWith("@")) {
          langGraphDeps[step.functionRef.importPath] = "workspace:*";
        } else {
          const targetNode =
            allNodes.find(
              (n) => n.id === step.langGraphTargetNodeId && n.type === "langgraph",
            ) ||
            allNodes.find(
              (n) => n.type === "langgraph" && n.data?.label === step.name,
            );
          const rawLabel =
            targetNode?.data?.label ||
            step.name ||
            step.langGraphTargetNodeId ||
            "agent";
          const pkgSlug =
            rawLabel
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, "-")
              .replace(/^-+|-+$/g, "") || "agent";
          langGraphDeps[
            `@workspace/langgraph-${pkgSlug.replace(/^langgraph-/, "")}`
          ] = "workspace:*";
        }
      }
      if (step.thenSteps) checkStepsForLangGraph(step.thenSteps);
      if (step.elseSteps) checkStepsForLangGraph(step.elseSteps);
      if (step.trySteps) checkStepsForLangGraph(step.trySteps);
      if (step.catchSteps) checkStepsForLangGraph(step.catchSteps);
      if (step.loopBody) checkStepsForLangGraph(step.loopBody);
    }
  }

  serviceEndpoints.forEach((ep) => {
    if (ep.pipelineSteps) checkStepsForLangGraph(ep.pipelineSteps);
  });

  allEdges.forEach((edge) => {
    if (edge.source === node.id) {
      const target = allNodes.find(
        (n) => n.id === edge.target && n.type === "langgraph",
      );
      if (target) {
        const rawLabel = target.data?.label || target.id || "agent";
        const pkgSlug =
          rawLabel
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "-")
            .replace(/^-+|-+$/g, "") || "agent";
        langGraphDeps[
          `@workspace/langgraph-${pkgSlug.replace(/^langgraph-/, "")}`
        ] = "workspace:*";
      }
    }
  });

  // Also check canvas-level transformer nodes connected to this service
  if (!hasGlobalTransformers) {
    const transformerNodes = allNodes.filter((n) => n.type === "transformer");
    hasGlobalTransformers = transformerNodes.some((tn) => {
      const scope = tn.data?.scope || "global";
      if (scope !== "global") return false;
      return allEdges.some(
        (e) => e.source === tn.id && e.target === node.id || e.target === tn.id && e.source === node.id,
      );
    });
  }

  const dependencies: Record<string, string> = {
    ...dbDeps,
    ...(hasKafka ? { [kafkaPackageName]: "workspace:*" } : {}),
    ...redisDeps,
    ...storageDeps,
    ...langGraphDeps,
    ...(hasGlobalTransformers ? { "@workspace/transformers": "workspace:*" } : {}),
    "@workspace/logger": "workspace:*",
    "@workspace/types": "workspace:*",
    express: "^4.19.2",
    cors: "^2.8.5",
    dotenv: "^16.4.5",
    zod: "^3.24.2",
    jose: "^5.9.6",
    ...(requiresWs ? { ws: "^8.18.0" } : {}),
  };

  const parsedRateLimit = parseRateLimit(
    node.data?.rateLimit ||
    node.data?.server?.rateLimit ||
    node.data?.serverConfig?.rateLimit,
  );
  if (parsedRateLimit) {
    dependencies["express-rate-limit"] = "^7.5.0";
  }

  if (grpcEnabled) {
    dependencies["@grpc/grpc-js"] = "^1.11.1";
    dependencies["@grpc/proto-loader"] = "^0.7.13";
  }

  const devDependencies: Record<string, string> = {
    "@workspace/typescript-config": "workspace:*",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.11.0",
    ...(requiresWs ? { "@types/ws": "^8.5.12" } : {}),
    "ts-node-dev": "^2.0.0",
    typescript: "^5.3.3",
    vitest: "^1.6.0",
  };

  // Merge custom dependencies from node data
  if (Array.isArray(node.data?.customDependencies)) {
    node.data.customDependencies.forEach((dep) => {
      if (!dep || !dep.name) return;
      if (!requiresWs && (dep.name === "ws" || dep.name === "@types/ws")) return;
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

  // ── Canvas-driven .env generation ─────────────────────────────────────────
  // Prefer envVars defined on the canvas node (own + connected package nodes).
  // Fall back to the legacy hardcoded lines only when no canvas envVars exist.
  const canvasSections = collectEnvSections(node, allNodes, allEdges, undefined, endpoints);

  let envFile: string;
  let envExampleFile: string;

  if (canvasSections.length > 0) {
    // Canvas-driven: use structured envVars from the node and its package dependencies
    const { env, envExample } = generateEnvFilesForNode(node, allNodes, allEdges, undefined, endpoints);
    envFile = env;
    envExampleFile = envExample;
  } else {
    // Legacy fallback: build .env from inferred lines (old behaviour)
    const dbEnvLines: string[] = [];
    if (hasDb) {
      dbEnvLines.push("DATABASE_PATH=../../packages/db/sqlite.db");
      dbEnvLines.push("DATABASE_URL=../../packages/db/sqlite.db");
    }

    envFile = `PORT=${port}
GRPC_PORT=${grpcPort}
NODE_ENV=development
LOG_LEVEL=info
${dbEnvLines.length > 0 ? dbEnvLines.join("\n") + "\n" : ""}${redisEnvLines.length > 0 ? redisEnvLines.join("\n") + "\n" : ""}${connectedServiceEnvLines.length > 0 ? connectedServiceEnvLines.join("\n") + "\n" : ""}`;
    envExampleFile = envFile;
  }


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
      filename: ".env.example",
      language: "dotenv",
      content: envExampleFile,
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
