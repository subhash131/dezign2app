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
      ${trackTokenUsage ? `const tokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };\n` : ""}

      for await (const chunk of stream) {
        if (isAborted) break;
        let mode = "messages";
        let payload = chunk;
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
          ${trackTokenUsage ? `let _u: object | undefined = undefined;
          let _rm: object | undefined = undefined;
          if (messageChunk && typeof messageChunk === "object") {
            if ("response_metadata" in messageChunk && typeof messageChunk.response_metadata === "object" && messageChunk.response_metadata !== null) {
              _rm = messageChunk.response_metadata;
            } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "response_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.response_metadata === "object" && messageChunk.kwargs.response_metadata !== null) {
              _rm = messageChunk.kwargs.response_metadata;
            }
            if ("usage_metadata" in messageChunk && typeof messageChunk.usage_metadata === "object" && messageChunk.usage_metadata !== null) {
              _u = messageChunk.usage_metadata;
            } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "usage_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.usage_metadata === "object" && messageChunk.kwargs.usage_metadata !== null) {
              _u = messageChunk.kwargs.usage_metadata;
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
          if (_u) {
            const inTok = "input_tokens" in _u && typeof _u.input_tokens === "number" ? _u.input_tokens : ("prompt_tokens" in _u && typeof _u.prompt_tokens === "number" ? _u.prompt_tokens : ("promptTokens" in _u && typeof _u.promptTokens === "number" ? _u.promptTokens : ("inputTokens" in _u && typeof _u.inputTokens === "number" ? _u.inputTokens : 0)));
            const outTok = "output_tokens" in _u && typeof _u.output_tokens === "number" ? _u.output_tokens : ("completion_tokens" in _u && typeof _u.completion_tokens === "number" ? _u.completion_tokens : ("completionTokens" in _u && typeof _u.completionTokens === "number" ? _u.completionTokens : ("outputTokens" in _u && typeof _u.outputTokens === "number" ? _u.outputTokens : 0)));
            let reasTok = 0;
            if ("reasoning_tokens" in _u && typeof _u.reasoning_tokens === "number") {
              reasTok = _u.reasoning_tokens;
            } else if ("reasoningTokens" in _u && typeof _u.reasoningTokens === "number") {
              reasTok = _u.reasoningTokens;
            } else if ("completion_tokens_details" in _u && typeof _u.completion_tokens_details === "object" && _u.completion_tokens_details !== null) {
              const ctd: object = _u.completion_tokens_details;
              if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;
              else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;
            } else if ("output_token_details" in _u && typeof _u.output_token_details === "object" && _u.output_token_details !== null) {
              const otd: object = _u.output_token_details;
              if ("reasoning" in otd && typeof otd.reasoning === "number") reasTok = otd.reasoning;
              else if ("reasoning_tokens" in otd && typeof otd.reasoning_tokens === "number") reasTok = otd.reasoning_tokens;
            }
            if (reasTok === 0 && _rm) {
              if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {
                const rmu: object = _rm.usage;
                if ("completion_tokens_details" in rmu && typeof rmu.completion_tokens_details === "object" && rmu.completion_tokens_details !== null) {
                  const ctd: object = rmu.completion_tokens_details;
                  if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;
                  else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;
                } else if ("reasoning_tokens" in rmu && typeof rmu.reasoning_tokens === "number") {
                  reasTok = rmu.reasoning_tokens;
                }
              } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {
                const ctd: object = _rm.completion_tokens_details;
                if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;
                else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;
              }
            }
            if (inTok > 0) tokenUsage.input_tokens = inTok;
            if (outTok > 0) tokenUsage.output_tokens = outTok;
            if (reasTok > 0) tokenUsage.reasoning_tokens = reasTok;
            tokenUsage.total_tokens = tokenUsage.input_tokens + tokenUsage.output_tokens;
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
            if (!reasoningToken && "additional_kwargs" in messageChunk && typeof messageChunk.additional_kwargs === "object" && messageChunk.additional_kwargs !== null) {
              const kw = messageChunk.additional_kwargs;
              if ("reasoning_content" in kw && typeof kw.reasoning_content === "string") reasoningToken = kw.reasoning_content;
              else if ("thinking" in kw && typeof kw.thinking === "string") reasoningToken = kw.thinking;
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
            ${trackTokenUsage ? `tokenUsage.output_tokens += 1;\n            tokenUsage.total_tokens = tokenUsage.input_tokens + tokenUsage.output_tokens;\n            ` : ""}res.write(\`data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);
          }
        } else if (mode === "updates") {
          const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;
          res.write(\`data: \${JSON.stringify({ type: "update", mode: "updates", node: nodeName, data: payload })}\\n\\n\`);
        } else if (mode === "custom" || mode === "values") {
          res.write(\`data: \${JSON.stringify({ type: mode, mode, data: payload })}\\n\\n\`);
        }
        if ("flush" in res && typeof res.flush === "function") {
          res.flush();
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

      if (route.action === "history") {
        const isPaginated = Boolean(route.historyPaginationEnabled);
        const format = route.historyFormat || "chat_messages";

        let threadIdResolution = `const threadId = String(req.params?.threadId ?? req.query?.thread_id ?? req.query?.threadId ?? req.headers?.["x-thread-id"] ?? req.body?.thread_id ?? "");`;
        if (route.threadIdSource) {
          if (route.threadIdSource.startsWith("params.")) {
            const p = route.threadIdSource.replace("params.", "");
            threadIdResolution = `const threadId = String(req.params?.[${JSON.stringify(p)}] ?? req.params?.threadId ?? req.query?.thread_id ?? req.headers?.["x-thread-id"] ?? "");`;
          } else if (route.threadIdSource.startsWith("query.")) {
            const q = route.threadIdSource.replace("query.", "");
            threadIdResolution = `const threadId = String(req.query?.[${JSON.stringify(q)}] ?? req.query?.thread_id ?? req.params?.threadId ?? req.headers?.["x-thread-id"] ?? "");`;
          } else if (route.threadIdSource.startsWith("headers.")) {
            const h = route.threadIdSource.replace("headers.", "").toLowerCase();
            threadIdResolution = `const threadId = String(req.headers?.[${JSON.stringify(h)}] ?? req.headers?.["x-thread-id"] ?? req.params?.threadId ?? req.query?.thread_id ?? "");`;
          } else if (route.threadIdSource.startsWith("body.")) {
            const b = route.threadIdSource.replace("body.", "");
            threadIdResolution = `const threadId = String(req.body?.[${JSON.stringify(b)}] ?? req.params?.threadId ?? req.query?.thread_id ?? "");`;
          }
        }

        return `
  ${comment}
  app.${route.method.toLowerCase()}(${JSON.stringify(normalizedRoutePath)}, async (req: Request, res: Response) => {
    try {
      ${threadIdResolution}
      if (!threadId) {
        return res.status(400).json({ ok: false, error: "Missing thread_id in request" });
      }
      ${isPaginated ? `
      const limit = Math.max(1, Number(req.query.limit) || 20);
      const beforeRaw = req.query.before;
      const before = (typeof beforeRaw === "string" && beforeRaw.trim() && beforeRaw !== "0" && beforeRaw !== "null" && beforeRaw !== "undefined")
        ? { configurable: { checkpoint_id: beforeRaw.trim() } }
        : undefined;

      const historySnapshots: any[] = [];
      for await (const snap of ${graphVarName}.getStateHistory(
        { configurable: { thread_id: threadId } },
        { limit, before }
      )) {
        historySnapshots.push(snap);
      }
      const snapshot = historySnapshots[0] || (await ${graphVarName}.getState({ configurable: { thread_id: threadId } }));
      const nextCursor = historySnapshots[historySnapshots.length - 1]?.config?.configurable?.checkpoint_id ?? null;
      ` : `
      const snapshot = await ${graphVarName}.getState({ configurable: { thread_id: threadId } });
      `}
      ${format === "full_state" ? `
      res.json({
        ok: true,
        thread_id: threadId,
        state: snapshot?.values || {},
        next: snapshot?.next || [],
        ${isPaginated ? `pagination: { limit, before: req.query.before ?? null, next_cursor: nextCursor },` : ""}
      });
      ` : `
      const rawMessages = (snapshot?.values && typeof snapshot.values === "object")
        ? Reflect.get(snapshot.values, "messages") ?? []
        : [];

      const allMessages = (Array.isArray(rawMessages) ? rawMessages : [])
        .map((m) => {
          const t = typeof m.getType === "function" ? m.getType() : typeof m._getType === "function" ? m._getType() : (m.type || m.role);
          const isTool = t === "tool" || t === "tool_message" || t === "ToolMessage" || Boolean(m.tool_call_id) || m.role === "tool";
          const role = isTool ? "tool" : (t === "human" || t === "user") ? "user" : (t === "ai" || t === "assistant") ? "assistant" : (t === "system") ? "system" : String(t || "assistant");
          let content = "";
          if (typeof m.content === "string") {
            content = m.content;
          } else if (Array.isArray(m.content)) {
            for (const item of m.content) {
              if (typeof item === "string") content += item;
              else if (item && typeof item === "object" && "text" in item && typeof item.text === "string") content += item.text;
              else content += JSON.stringify(item);
            }
          } else {
            content = String(m.content ?? "");
          }
          const id = (typeof m.id === "string" && m.id) ? m.id : (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()));
          const toolCalls = (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) ? m.tool_calls : (m.additional_kwargs?.tool_calls && Array.isArray(m.additional_kwargs.tool_calls) && m.additional_kwargs.tool_calls.length > 0 ? m.additional_kwargs.tool_calls : undefined);
          const toolCallId = m.tool_call_id || m.toolCallId || m.kwargs?.tool_call_id;
          const toolName = m.name || m.kwargs?.name;
          const toolStatus = m.status || m.kwargs?.status;
          return {
            id,
            role,
            content,
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
            ...(toolCallId ? { tool_call_id: toolCallId } : {}),
            ...(toolName ? { name: toolName } : {}),
            ...(toolStatus ? { status: toolStatus } : {}),
            ...(m.artifact !== undefined ? { artifact: m.artifact } : {}),
          };
        });

      ${isPaginated ? `
      res.json({
        ok: true,
        messages: allMessages,
        pagination: {
          limit,
          before: req.query.before ?? null,
          next_cursor: nextCursor,
        },
      });
      ` : `
      res.json({
        ok: true,
        thread_id: threadId,
        messages: allMessages,
      });
      `}
      `}
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
import type { ${toPascalCase(ctx.graphId)}StateUpdateType } from "./state";${trackTokenUsage ? `\n\n/**\n * Captures token usage across all graph LLM calls using LangChain callback handlers.\n */\nclass TokenUsageHandler extends BaseCallbackHandler {\n  name = "token_usage_handler";\n  input_tokens = 0;\n  output_tokens = 0;\n  total_tokens = 0;\n  reasoning_tokens = 0;\n\n  handleLLMEnd(output: LLMResult) {\n    if (!output || !output.generations) return;\n    for (const gens of output.generations) {\n      for (const gen of gens) {\n        if (!gen || typeof gen !== "object") continue;\n        let u: object | undefined = undefined;\n        let rm: object | undefined = undefined;\n        if ("message" in gen && typeof gen.message === "object" && gen.message !== null) {\n          const msgObj: object = gen.message;\n          if ("response_metadata" in msgObj && typeof msgObj.response_metadata === "object" && msgObj.response_metadata !== null) {\n            rm = msgObj.response_metadata;\n          }\n          if ("usage_metadata" in msgObj && typeof msgObj.usage_metadata === "object" && msgObj.usage_metadata !== null) {\n            u = msgObj.usage_metadata;\n          } else if (rm) {\n            if ("token_usage" in rm && typeof rm.token_usage === "object" && rm.token_usage !== null) {\n              u = rm.token_usage;\n            } else if ("tokenUsage" in rm && typeof rm.tokenUsage === "object" && rm.tokenUsage !== null) {\n              u = rm.tokenUsage;\n            } else if ("usage" in rm && typeof rm.usage === "object" && rm.usage !== null) {\n              u = rm.usage;\n            }\n          }\n        }\n        if (!u && "generationInfo" in gen && typeof gen.generationInfo === "object" && gen.generationInfo !== null) {\n          const gi: object = gen.generationInfo;\n          if ("usage_metadata" in gi && typeof gi.usage_metadata === "object" && gi.usage_metadata !== null) {\n            u = gi.usage_metadata;\n          } else if ("token_usage" in gi && typeof gi.token_usage === "object" && gi.token_usage !== null) {\n            u = gi.token_usage;\n          } else if ("tokenUsage" in gi && typeof gi.tokenUsage === "object" && gi.tokenUsage !== null) {\n            u = gi.tokenUsage;\n          } else if ("usage" in gi && typeof gi.usage === "object" && gi.usage !== null) {\n            u = gi.usage;\n          }\n        }\n        if (u) {\n          const inTok = "input_tokens" in u && typeof u.input_tokens === "number" ? u.input_tokens : ("prompt_tokens" in u && typeof u.prompt_tokens === "number" ? u.prompt_tokens : ("promptTokens" in u && typeof u.promptTokens === "number" ? u.promptTokens : ("inputTokens" in u && typeof u.inputTokens === "number" ? u.inputTokens : 0)));\n          const outTok = "output_tokens" in u && typeof u.output_tokens === "number" ? u.output_tokens : ("completion_tokens" in u && typeof u.completion_tokens === "number" ? u.completion_tokens : ("completionTokens" in u && typeof u.completionTokens === "number" ? u.completionTokens : ("outputTokens" in u && typeof u.outputTokens === "number" ? u.outputTokens : 0)));\n          const totTok = "total_tokens" in u && typeof u.total_tokens === "number" ? u.total_tokens : ("totalTokens" in u && typeof u.totalTokens === "number" ? u.totalTokens : (inTok + outTok));\n          let reasTok = 0;\n          if ("reasoning_tokens" in u && typeof u.reasoning_tokens === "number") {\n            reasTok = u.reasoning_tokens;\n          } else if ("reasoningTokens" in u && typeof u.reasoningTokens === "number") {\n            reasTok = u.reasoningTokens;\n          } else if ("completion_tokens_details" in u && typeof u.completion_tokens_details === "object" && u.completion_tokens_details !== null) {\n            const ctd: object = u.completion_tokens_details;\n            if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;\n            else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;\n          } else if ("output_token_details" in u && typeof u.output_token_details === "object" && u.output_token_details !== null) {\n            const otd: object = u.output_token_details;\n            if ("reasoning" in otd && typeof otd.reasoning === "number") reasTok = otd.reasoning;\n            else if ("reasoning_tokens" in otd && typeof otd.reasoning_tokens === "number") reasTok = otd.reasoning_tokens;\n          }\n          if (reasTok === 0 && rm) {\n            if ("usage" in rm && typeof rm.usage === "object" && rm.usage !== null) {\n              const rmu: object = rm.usage;\n              if ("completion_tokens_details" in rmu && typeof rmu.completion_tokens_details === "object" && rmu.completion_tokens_details !== null) {\n                const ctd: object = rmu.completion_tokens_details;\n                if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;\n                else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;\n              } else if ("reasoning_tokens" in rmu && typeof rmu.reasoning_tokens === "number") {\n                reasTok = rmu.reasoning_tokens;\n              }\n            } else if ("completion_tokens_details" in rm && typeof rm.completion_tokens_details === "object" && rm.completion_tokens_details !== null) {\n              const ctd: object = rm.completion_tokens_details;\n              if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") reasTok = ctd.reasoning_tokens;\n              else if ("reasoning" in ctd && typeof ctd.reasoning === "number") reasTok = ctd.reasoning;\n            }\n          }\n          this.input_tokens += inTok;\n          this.output_tokens += outTok;\n          this.total_tokens += totTok;\n          this.reasoning_tokens += reasTok;\n        }\n      }\n    }\n  }\n\n  get usage() {\n    return {\n      input_tokens: this.input_tokens,\n      output_tokens: this.output_tokens,\n      total_tokens: this.total_tokens || (this.input_tokens + this.output_tokens),\n      reasoning_tokens: this.reasoning_tokens,\n    };\n  }\n}\n\n/**\n * Extracts token usage by combining callback statistics and state AIMessage usage_metadata.\n */\nfunction extractTokenUsage(result: object | null | undefined, handler?: TokenUsageHandler) {\n  if (handler && handler.total_tokens > 0) {\n    return handler.usage;\n  }\n  if (!result || typeof result !== "object") return undefined;\n  if ("usage" in result && typeof result.usage === "object" && result.usage !== null) return result.usage;\n  if ("token_usage" in result && typeof result.token_usage === "object" && result.token_usage !== null) return result.token_usage;\n  if ("tokenUsage" in result && typeof result.tokenUsage === "object" && result.tokenUsage !== null) return result.tokenUsage;\n  if ("messages" in result && Array.isArray(result.messages)) {\n    let inTok = 0;\n    let outTok = 0;\n    let totTok = 0;\n    let reasTok = 0;\n    for (const m of result.messages) {\n      if (!m || typeof m !== "object") continue;\n      const isAI = ("_getType" in m && typeof m._getType === "function" && m._getType() === "ai") || ("role" in m && (m.role === "assistant" || m.role === "ai")) || ("id" in m && Array.isArray(m.id) && m.id.includes("AIMessage"));\n      if (!isAI) continue;\n      let u: object | undefined = undefined;\n      let rm: object | undefined = undefined;\n      if ("response_metadata" in m && typeof m.response_metadata === "object" && m.response_metadata !== null) {\n        rm = m.response_metadata;\n      } else if ("kwargs" in m && typeof m.kwargs === "object" && m.kwargs !== null && "response_metadata" in m.kwargs && typeof m.kwargs.response_metadata === "object" && m.kwargs.response_metadata !== null) {\n        rm = m.kwargs.response_metadata;\n      }\n      if ("usage_metadata" in m && typeof m.usage_metadata === "object" && m.usage_metadata !== null) {\n        u = m.usage_metadata;\n      } else if ("kwargs" in m && typeof m.kwargs === "object" && m.kwargs !== null && "usage_metadata" in m.kwargs && typeof m.kwargs.usage_metadata === "object" && m.kwargs.usage_metadata !== null) {\n        u = m.kwargs.usage_metadata;\n      } else if (rm) {\n        if ("token_usage" in rm && typeof rm.token_usage === "object" && rm.token_usage !== null) {\n          u = rm.token_usage;\n        } else if ("tokenUsage" in rm && typeof rm.tokenUsage === "object" && rm.tokenUsage !== null) {\n          u = rm.tokenUsage;\n        } else if ("usage" in rm && typeof rm.usage === "object" && rm.usage !== null) {\n          u = rm.usage;\n        }\n      }\n      if (!u) {\n        let strMsg: string | undefined = undefined;\n        if ("content" in m && typeof m.content === "string") {\n          strMsg = m.content;\n        } else if ("kwargs" in m && typeof m.kwargs === "object" && m.kwargs !== null && "content" in m.kwargs && typeof m.kwargs.content === "string") {\n          strMsg = m.kwargs.content;\n        }\n        if (strMsg && strMsg.startsWith("{")) {\n          try {\n            const p = JSON.parse(strMsg);\n            if (typeof p === "object" && p !== null) {\n              if ("response_metadata" in p && typeof p.response_metadata === "object" && p.response_metadata !== null) {\n                rm = p.response_metadata;\n              } else if ("kwargs" in p && typeof p.kwargs === "object" && p.kwargs !== null && "response_metadata" in p.kwargs && typeof p.kwargs.response_metadata === "object" && p.kwargs.response_metadata !== null) {\n                rm = p.kwargs.response_metadata;\n              }\n              if ("usage_metadata" in p && typeof p.usage_metadata === "object" && p.usage_metadata !== null) {\n                u = p.usage_metadata;\n              } else if ("kwargs" in p && typeof p.kwargs === "object" && p.kwargs !== null && "usage_metadata" in p.kwargs && typeof p.kwargs.usage_metadata === "object" && p.kwargs.usage_metadata !== null) {\n                u = p.kwargs.usage_metadata;\n              } else if (rm) {\n                if ("token_usage" in rm && typeof rm.token_usage === "object" && rm.token_usage !== null) {\n                  u = rm.token_usage;\n                } else if ("tokenUsage" in rm && typeof rm.tokenUsage === "object" && rm.tokenUsage !== null) {\n                  u = rm.tokenUsage;\n                } else if ("usage" in rm && typeof rm.usage === "object" && rm.usage !== null) {\n                  u = rm.usage;\n                }\n              }\n            }\n          } catch {}\n        }\n      }\n      if (u) {\n        const curIn = "input_tokens" in u && typeof u.input_tokens === "number" ? u.input_tokens : ("prompt_tokens" in u && typeof u.prompt_tokens === "number" ? u.prompt_tokens : ("promptTokens" in u && typeof u.promptTokens === "number" ? u.promptTokens : ("inputTokens" in u && typeof u.inputTokens === "number" ? u.inputTokens : 0)));\n        const curOut = "output_tokens" in u && typeof u.output_tokens === "number" ? u.output_tokens : ("completion_tokens" in u && typeof u.completion_tokens === "number" ? u.completion_tokens : ("completionTokens" in u && typeof u.completionTokens === "number" ? u.completionTokens : ("outputTokens" in u && typeof u.outputTokens === "number" ? u.outputTokens : 0)));\n        const curTot = "total_tokens" in u && typeof u.total_tokens === "number" ? u.total_tokens : ("totalTokens" in u && typeof u.totalTokens === "number" ? u.totalTokens : (curIn + curOut));\n        let curReas = 0;\n        if ("reasoning_tokens" in u && typeof u.reasoning_tokens === "number") {\n          curReas = u.reasoning_tokens;\n        } else if ("reasoningTokens" in u && typeof u.reasoningTokens === "number") {\n          curReas = u.reasoningTokens;\n        } else if ("completion_tokens_details" in u && typeof u.completion_tokens_details === "object" && u.completion_tokens_details !== null) {\n          const ctd: object = u.completion_tokens_details;\n          if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") curReas = ctd.reasoning_tokens;\n          else if ("reasoning" in ctd && typeof ctd.reasoning === "number") curReas = ctd.reasoning;\n        } else if ("output_token_details" in u && typeof u.output_token_details === "object" && u.output_token_details !== null) {\n          const otd: object = u.output_token_details;\n          if ("reasoning" in otd && typeof otd.reasoning === "number") curReas = otd.reasoning;\n          else if ("reasoning_tokens" in otd && typeof otd.reasoning_tokens === "number") curReas = otd.reasoning_tokens;\n        }\n        if (curReas === 0 && rm) {\n          if ("usage" in rm && typeof rm.usage === "object" && rm.usage !== null) {\n            const rmu: object = rm.usage;\n            if ("completion_tokens_details" in rmu && typeof rmu.completion_tokens_details === "object" && rmu.completion_tokens_details !== null) {\n              const ctd: object = rmu.completion_tokens_details;\n              if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") curReas = ctd.reasoning_tokens;\n              else if ("reasoning" in ctd && typeof ctd.reasoning === "number") curReas = ctd.reasoning;\n            } else if ("reasoning_tokens" in rmu && typeof rmu.reasoning_tokens === "number") {\n              curReas = rmu.reasoning_tokens;\n            }\n          } else if ("completion_tokens_details" in rm && typeof rm.completion_tokens_details === "object" && rm.completion_tokens_details !== null) {\n            const ctd: object = rm.completion_tokens_details;\n            if ("reasoning_tokens" in ctd && typeof ctd.reasoning_tokens === "number") curReas = ctd.reasoning_tokens;\n            else if ("reasoning" in ctd && typeof ctd.reasoning === "number") curReas = ctd.reasoning;\n          }\n        }\n        inTok += curIn;\n        outTok += curOut;\n        totTok += curTot;\n        reasTok += curReas;\n      }\n    }\n    if (totTok > 0) {\n      return {\n        input_tokens: inTok,\n        output_tokens: outTok,\n        total_tokens: totTok,\n        reasoning_tokens: reasTok,\n      };\n    }\n  }\n  return undefined;\n}` : ""}

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
    const limit = Math.max(1, Number(req.query.limit) || 20);
    const before = typeof req.query.before === "string" && req.query.before.trim() && req.query.before !== "0" && req.query.before !== "null" && req.query.before !== "undefined"
      ? { configurable: { checkpoint_id: req.query.before.trim() } }
      : undefined;

    const historySnapshots: any[] = [];
    for await (const snap of ${graphVarName}.getStateHistory(
      { configurable: { thread_id: threadId } },
      { limit, before }
    )) {
      historySnapshots.push(snap);
    }

    const snapshot = historySnapshots[0] || (await ${graphVarName}.getState({ configurable: { thread_id: threadId } }));
    const nextCursor = historySnapshots[historySnapshots.length - 1]?.config?.configurable?.checkpoint_id ?? null;

    const rawMessages = (snapshot?.values && typeof snapshot.values === "object")
      ? Reflect.get(snapshot.values, "messages") ?? []
      : [];

    const formattedMessages = (Array.isArray(rawMessages) ? rawMessages : [])
      .map((m) => {
        const t = typeof m.getType === "function" ? m.getType() : typeof m._getType === "function" ? m._getType() : (m.type || m.role);
        const isTool = t === "tool" || t === "tool_message" || t === "ToolMessage" || Boolean(m.tool_call_id) || m.role === "tool";
        const role = isTool ? "tool" : (t === "human" || t === "user") ? "user" : (t === "ai" || t === "assistant") ? "assistant" : (t === "system") ? "system" : String(t || "assistant");
        let content = "";
        if (typeof m.content === "string") {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          for (const item of m.content) {
            if (typeof item === "string") content += item;
            else if (item && typeof item === "object" && "text" in item && typeof item.text === "string") content += item.text;
            else content += JSON.stringify(item);
          }
        } else {
          content = String(m.content ?? "");
        }
        const id = (typeof m.id === "string" && m.id) ? m.id : (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now()));
        const toolCalls = (m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) ? m.tool_calls : (m.additional_kwargs?.tool_calls && Array.isArray(m.additional_kwargs.tool_calls) && m.additional_kwargs.tool_calls.length > 0 ? m.additional_kwargs.tool_calls : undefined);
        const toolCallId = m.tool_call_id || m.toolCallId || m.kwargs?.tool_call_id;
        const toolName = m.name || m.kwargs?.name;
        const toolStatus = m.status || m.kwargs?.status;
        return {
          id,
          role,
          content,
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
          ...(toolCallId ? { tool_call_id: toolCallId } : {}),
          ...(toolName ? { name: toolName } : {}),
          ...(toolStatus ? { status: toolStatus } : {}),
          ...(m.artifact !== undefined ? { artifact: m.artifact } : {}),
        };
      });

    res.json({
      ok: true,
      thread_id: threadId,
      state: snapshot?.values || {},
      messages: formattedMessages,
      next: snapshot?.next || [],
      pagination: {
        limit,
        before: req.query.before ?? null,
        next_cursor: nextCursor,
      },
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
    flush?(): void;
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
