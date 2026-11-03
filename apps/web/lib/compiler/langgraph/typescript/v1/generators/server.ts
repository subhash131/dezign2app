import type { CompileContext, RouteEndpoint } from "../types";
import { toCamelCase, toPascalCase, escapeStr } from "../utils";

export function buildServerFile(ctx: CompileContext, routes: RouteEndpoint[]): string {
  const graphVarName = `${toCamelCase(ctx.graphId)}Graph`;
  const hasMemory = ctx.hasMemory;
  const trackTokenUsage = ctx.trackTokenUsage !== false;

  // Deduplicate routes by path+method so we don't emit the same route twice
  const seen = new Set<string>();
  const deduped = routes.filter((r) => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const routeHandlers = deduped
    .map((route) => {
      const isEvent = route.kind === "event";
      const trackTokenUsage = ctx.trackTokenUsage !== false;
      const payloadMap = route.payloadMapping ?? {};
      const stateChannels = ctx.input.stateChannels || [];

      // Collect all defined state channel keys + explicit payload mapping keys
      const allStateKeys = new Set<string>();
      stateChannels.forEach((ch) => allStateKeys.add(ch.key));
      Object.keys(payloadMap).forEach((k) => allStateKeys.add(k));
      if (allStateKeys.size === 0) {
        allStateKeys.add("messages");
      }

      const stateFields: string[] = [];
      for (const key of allStateKeys) {
        const customPath = payloadMap[key];
        const camelKey = toCamelCase(key);
        if (customPath) {
          const accessor = customPath.startsWith("headers.")
            ? `req.headers["${customPath.slice(8)}"]`
            : customPath.startsWith("body.")
              ? `req.body?.${customPath.slice(5)}`
              : `req.body?.${customPath}`;
          stateFields.push(`      ${camelKey}: ${accessor}`);
        } else if (key === "messages") {
          if (isEvent) {
            stateFields.push(
              `      messages: (typeof req.body === "object" && req.body !== null && "messages" in req.body && Array.isArray(req.body.messages)) ? req.body.messages : [{ role: "user", content: JSON.stringify(req.body) }]`,
            );
          } else {
            stateFields.push(
              `      messages: (typeof req.body === "object" && req.body !== null && "messages" in req.body && Array.isArray(req.body.messages)) ? req.body.messages : [{ role: "user", content: typeof req.body?.message === "string" ? req.body.message : (typeof req.body === "string" ? req.body : JSON.stringify(req.body)) }]`,
            );
          }
        } else {
          stateFields.push(`      ${camelKey}: req.body?.${key} ?? req.body?.${camelKey}`);
        }
      }

      const stateInit = `{\n${stateFields.join(",\n")}\n    }`;

      const preInvokeBlock = (() => {
        if (route.preInvokeCode && route.preInvokeCode.trim()) {
          return `\n      // Pre-Invoke Business Logic\n      ${route.preInvokeCode.trim().replace(/\n/g, "\n      ")}\n`;
        }
        if (route.preInvokePrompt && route.preInvokePrompt.trim()) {
          // Natural language: emit as a comment directive for the AI agent
          const lines = route.preInvokePrompt.trim().split("\n");
          const commentLines = lines
            .map((l, i) => `      // STEP ${i + 1}: ${l.trim()}`)
            .join("\n");
          return `\n      // Pre-Invoke Business Logic (natural language spec — implement below):\n${commentLines}\n`;
        }
        return "";
      })();

      const postInvokeBlock = (() => {
        if (route.postInvokeCode && route.postInvokeCode.trim()) {
          return `\n      // Post-Invoke Business Logic\n      ${route.postInvokeCode.trim().replace(/\n/g, "\n      ")}\n`;
        }
        if (route.postInvokePrompt && route.postInvokePrompt.trim()) {
          const lines = route.postInvokePrompt.trim().split("\n");
          const commentLines = lines
            .map((l, i) => `      // POST-STEP ${i + 1}: ${l.trim()}`)
            .join("\n");
          return `\n      // Post-Invoke Business Logic (natural language spec — implement below):\n${commentLines}\n`;
        }
        return "";
      })();

      const threadIdLine = hasMemory
        ? `\n    const threadId = (typeof req.body === "object" && req.body !== null && "thread_id" in req.body && typeof req.body.thread_id === "string") ? req.body.thread_id : (typeof req.headers["x-thread-id"] === "string" ? req.headers["x-thread-id"] : crypto.randomUUID());`
        : "";

      const configLine = hasMemory
        ? `,\n      { configurable: { thread_id: threadId } }`
        : "";

      const normalizedRoutePath = route.path.startsWith("/") ? route.path : `/${route.path}`;
      const comment = isEvent
        ? `// Event: ${route.eventName ?? normalizedRoutePath} (from ${route.sourceNodeLabel ?? "event source"})`
        : `// Route: ${route.method} ${normalizedRoutePath} (from ${route.sourceNodeLabel ?? "service"})`;

      const isStream = route.responseExecutionMode === "stream";
      const isAsyncAck = route.responseExecutionMode === "async_ack";

      if (isStream) {
        return `
  ${comment}
  app.${route.method.toLowerCase()}(${JSON.stringify(normalizedRoutePath)}, async (req: Request, res: Response) => {
    let isAborted = false;
    let activeStream: { return?: () => void } | null = null;

    req.on("close", () => {
      isAborted = true;
      if (activeStream && typeof activeStream.return === "function") {
        activeStream.return();
      }
    });

    try {${threadIdLine}
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }${hasMemory ? `\n      res.setHeader("X-Thread-Id", threadId);\n      res.write(\`data: \${JSON.stringify({ type: "session", thread_id: threadId })}\\n\\n\`);` : ""}

      const state: Partial<${toPascalCase(ctx.graphId)}StateUpdateType> = ${stateInit};${preInvokeBlock}
      const streamOptions = { streamMode: "messages"${configLine ? `, ${configLine.replace(/^, /, "")}` : ""} };
      const stream = await ${graphVarName}.stream(state, streamOptions);
      activeStream = stream;
      ${trackTokenUsage ? `const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };\n` : ""}

      for await (const chunk of stream) {
        if (isAborted) break;
        let mode = "messages";
        let payload: any = chunk;
        if (Array.isArray(chunk) && chunk.length === 2 && typeof chunk[0] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(chunk[0])) {
          mode = chunk[0];
          payload = chunk[1];
        } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null && !("content" in chunk) && !("text" in chunk)) {
          mode = "updates";
        }

        if (mode === "messages") {
          const [messageChunk, metadata] = Array.isArray(payload) ? payload : [payload, undefined];
          const nodeName = metadata && typeof metadata === "object" && "langgraph_node" in metadata
            ? metadata.langgraph_node
            : undefined;
          ${trackTokenUsage ? `if (messageChunk && typeof messageChunk === "object" && messageChunk.usage_metadata) {
            const u = messageChunk.usage_metadata;
            tokenUsage.prompt_tokens = u.input_tokens ?? tokenUsage.prompt_tokens;
            tokenUsage.completion_tokens = u.output_tokens ?? tokenUsage.completion_tokens;
            tokenUsage.total_tokens = u.total_tokens ?? (tokenUsage.prompt_tokens + tokenUsage.completion_tokens);
          }\n          ` : ""}let reasoningToken: string | undefined = undefined;
          let textToken: string | undefined = undefined;
          if (messageChunk && typeof messageChunk === "object") {
            if (Array.isArray(messageChunk.contentBlocks)) {
              for (const block of messageChunk.contentBlocks) {
                if (block?.type === "reasoning" && (block.reasoning || block.text)) {
                  reasoningToken = (reasoningToken || "") + (block.reasoning || block.text || "");
                } else if (block?.type === "text" && block.text) {
                  textToken = (textToken || "") + block.text;
                }
              }
            }
            if (!reasoningToken && messageChunk.additional_kwargs) {
              const kw = messageChunk.additional_kwargs as Record<string, any>;
              if (typeof kw.reasoning_content === "string") reasoningToken = kw.reasoning_content;
              else if (typeof kw.thinking === "string") reasoningToken = kw.thinking;
            }
            if (!textToken) {
              if (typeof messageChunk.content === "string") {
                textToken = messageChunk.content;
              } else if (typeof messageChunk.text === "string") {
                textToken = messageChunk.text;
              }
            }
          } else if (typeof messageChunk === "string") {
            textToken = messageChunk;
          }
          const token = textToken ?? (typeof payload === "string" ? payload : (typeof payload === "object" && payload !== null && "content" in payload ? payload.content : undefined));
          if (reasoningToken) {
            res.write(\`data: \${JSON.stringify({ type: "reasoning", reasoning: reasoningToken, node: nodeName })}\\n\\n\`);
          }
          if (token !== undefined && token !== "") {
            ${trackTokenUsage ? `tokenUsage.completion_tokens += 1;\n            tokenUsage.total_tokens = tokenUsage.input_tokens + tokenUsage.completion_tokens;\n            ` : ""}res.write(\`data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);
          }
        } else if (mode === "updates") {
          const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;
          res.write(\`data: \${JSON.stringify({ type: "update", mode: "updates", node: nodeName, data: payload })}\\n\\n\`);
        } else if (mode === "custom" || mode === "values") {
          res.write(\`data: \${JSON.stringify({ type: mode, mode, data: payload })}\\n\\n\`);
        }
        if (typeof (res as any).flush === "function") {
          (res as any).flush();
        }
      }
      if (!isAborted) {
        ${trackTokenUsage ? `res.write(\`data: \${JSON.stringify({ type: "usage", usage: tokenUsage })}\\n\\n\`);\n        ` : ""}res.write("data: [DONE]\\n\\n");
        res.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[${route.method} ${normalizedRoutePath}] stream error:", message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: message });
      } else {
        res.write(\`data: \${JSON.stringify({ error: message })}\\n\\n\`);
        res.end();
      }
    }
  });`;
      }

      if (isAsyncAck) {
        return `
  ${comment}
  app.${route.method.toLowerCase()}(${JSON.stringify(normalizedRoutePath)}, async (req: Request, res: Response) => {
    try {${threadIdLine}
      const state: Partial<${toPascalCase(ctx.graphId)}StateUpdateType> = ${stateInit};${preInvokeBlock}
      
      // Async background execution: acknowledge caller immediately with 202 Accepted
      res.status(202).json({ ok: true, status: "processing"${hasMemory ? `, thread_id: threadId` : ""} });

      // Run graph asynchronously with promise rejection handling
      ${graphVarName}.invoke(state${configLine}).then((result) => {${postInvokeBlock}
        console.log("[${route.method} ${normalizedRoutePath}] Async background execution completed:", result);
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[${route.method} ${normalizedRoutePath}] Async background error:", message);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[${route.method} ${normalizedRoutePath}] error:", message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: message });
      }
    }
  });`;
      }

      // Default Sync REST Response Mode
      const resultExpr =
        route.responseOutputMode === "selected" &&
        route.responseFields &&
        route.responseFields.length > 0
          ? `{\n${route.responseFields.map((f) => `        ${JSON.stringify(f)}: (result && typeof result === "object") ? Reflect.get(result, ${JSON.stringify(f)}) : undefined`).join(",\n")}\n      }`
          : "result";

      return `
  ${comment}
  app.${route.method.toLowerCase()}(${JSON.stringify(normalizedRoutePath)}, async (req: Request, res: Response) => {
    try {${threadIdLine}
      const state: Partial<${toPascalCase(ctx.graphId)}StateUpdateType> = ${stateInit};${preInvokeBlock}
      ${trackTokenUsage ? `const tokenHandler = new TokenUsageHandler();\n      ` : ""}const result = await ${graphVarName}.invoke(state${trackTokenUsage ? (configLine ? `, { ...${configLine.replace(/^, /, "")}, callbacks: [tokenHandler] }` : `, { callbacks: [tokenHandler] }`) : configLine});${postInvokeBlock}
      ${trackTokenUsage ? `const usage = extractTokenUsage(result, tokenHandler);\n      ` : ""}res.json({ ok: true, ${hasMemory ? `thread_id: threadId, ` : ""}result: ${resultExpr}${trackTokenUsage ? `, usage` : ""} });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[${route.method} ${normalizedRoutePath}] error:", message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: message });
      }
    }
  });`;
    })
    .join("\n");

  const portEnvLine = `const PORT = Number(process.env.PORT ?? 3001);`;
  const agentLabel = escapeStr(ctx.input.graphLabel || "LangGraph Agent");

  return `import "dotenv/config";
import express, { type Request, type Response } from "express";
${trackTokenUsage ? `import { BaseCallbackHandler } from "@langchain/core/callbacks/base";\nimport type { LLMResult } from "@langchain/core/outputs";\n` : ""}${hasMemory ? `import crypto from "node:crypto";\n` : ""}import { ${graphVarName} } from "./graph";
import type { ${toPascalCase(ctx.graphId)}StateUpdateType } from "./state";${trackTokenUsage ? `\n\n/**\n * Captures token usage across all graph LLM calls using LangChain callback handlers.\n */\nclass TokenUsageHandler extends BaseCallbackHandler {\n  name = "token_usage_handler";\n  input_tokens = 0;\n  output_tokens = 0;\n  total_tokens = 0;\n\n  handleLLMEnd(output: LLMResult) {\n    if (!output || !output.generations) return;\n    for (const gens of output.generations) {\n      for (const gen of gens) {\n        const usage = (gen as any).message?.usage_metadata || (gen as any).generationInfo?.usage_metadata;\n        if (usage) {\n          this.input_tokens += usage.input_tokens ?? usage.prompt_tokens ?? 0;\n          this.output_tokens += usage.output_tokens ?? usage.completion_tokens ?? 0;\n          this.total_tokens += usage.total_tokens ?? ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0));\n        }\n      }\n    }\n  }\n\n  get usage() {\n    return {\n      input_tokens: this.input_tokens,\n      output_tokens: this.output_tokens,\n      total_tokens: this.total_tokens || (this.input_tokens + this.output_tokens),\n      prompt_tokens: this.input_tokens,\n      completion_tokens: this.output_tokens,\n    };\n  }\n}\n\n/**\n * Extracts token usage by combining callback statistics and state AIMessage usage_metadata.\n */\nfunction extractTokenUsage(result: unknown, handler?: TokenUsageHandler) {\n  if (handler && handler.total_tokens > 0) {\n    return handler.usage;\n  }\n  if (!result || typeof result !== "object") return undefined;\n  if ("usage" in result && (result as any).usage) return (result as any).usage;\n  if (Array.isArray((result as any).messages)) {\n    const totals = (result as any).messages\n      .filter((m: any) => m && (m._getType?.() === "ai" || m.role === "assistant"))\n      .reduce(\n        (acc: any, m: any) => {\n          const u = m.usage_metadata || m.response_metadata?.tokenUsage || m.response_metadata?.usage;\n          const inp = u?.input_tokens ?? u?.prompt_tokens ?? 0;\n          const out = u?.output_tokens ?? u?.completion_tokens ?? 0;\n          const tot = u?.total_tokens ?? (inp + out);\n          return {\n            input_tokens: acc.input_tokens + inp,\n            output_tokens: acc.output_tokens + out,\n            total_tokens: acc.total_tokens + tot,\n            prompt_tokens: acc.input_tokens + inp,\n            completion_tokens: acc.output_tokens + out,\n          };\n        },\n        { input_tokens: 0, output_tokens: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }\n      );\n    if (totals.total_tokens > 0) return totals;\n  }\n  return undefined;\n}` : ""}

/**
 * HTTP Server for ${agentLabel}
 *
 * Auto-generated by Dezign2App — exposes the LangGraph agent over HTTP.
 * Each route corresponds to a connected endpoint or event on the main canvas.
 *
 * Start: ts-node src/server.ts  (or compile and run dist/server.js)
 */

const app = express();
app.use(express.json());
${portEnvLine}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, agent: ${JSON.stringify(agentLabel)} });
});
${hasMemory ? `
// ── Thread State & History ───────────────────────────────────────────────────
app.get("/api/threads/:threadId/history", async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    const snapshot = await ${graphVarName}.getState({ configurable: { thread_id: threadId } });
    const messages = (snapshot.values && typeof snapshot.values === "object")
      ? Reflect.get(snapshot.values, "messages") ?? []
      : [];
    res.json({
      ok: true,
      thread_id: threadId,
      state: snapshot.values || {},
      messages: messages || [],
      next: snapshot.next || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/threads/:threadId/history] error:", message);
    res.status(500).json({ ok: false, error: message });
  }
});
` : ""}
// ── Agent routes ──────────────────────────────────────────────────────────────
${routeHandlers}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(\`🤖 ${agentLabel} running on http://localhost:\${PORT}\`);
  console.log("Routes:");
${deduped.map((r) => {
  const normPath = r.path.startsWith("/") ? r.path : `/${r.path}`;
  return `  console.log("  ${r.method.padEnd(6)} http://localhost:\${PORT}${normPath}");`;
}).join("\n")}
  console.log("  GET    http://localhost:\${PORT}/health");
});
`;
}

export function buildExpressDtsFile(): string {
  return `declare module "express" {
  export interface Request {
    body?: Record<string, string | number | boolean | object | null | undefined>;
    headers: Record<string, string | string[] | undefined>;
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    on(event: string, listener: () => void): this;
  }
  export interface Response {
    status(code: number): this;
    json(body: Record<string, string | number | boolean | object | null | undefined> | boolean | string | number): this;
    setHeader(name: string, value: string): this;
    write(chunk: string): boolean;
    end(): this;
    headersSent: boolean;
  }
  export type RequestHandler = (
    req: Request,
    res: Response,
    next?: () => void,
  ) => void | Promise<void>;
  export interface ExpressApp {
    use(middleware: RequestHandler): this;
    get(path: string, handler: RequestHandler): this;
    post(path: string, handler: RequestHandler): this;
    put(path: string, handler: RequestHandler): this;
    delete(path: string, handler: RequestHandler): this;
    listen(port: number, callback?: () => void): void;
  }
  function express(): ExpressApp;
  namespace express {
    export function json(): RequestHandler;
    export type { Request, Response };
  }
  export default express;
}
`;
}
