// ═══════════════════════════════════════════════════════════════
// MODULE: LangGraphStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  LangGraph agent invocations (buffered or SSE streaming)
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "../types";
import { resolveBinding } from "../sourceResolver";
import { toVarName } from "../../../../utils";

function isBlankOrQuotes(val: string | number | boolean | object | null | undefined): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === "string") {
    const trimmed = val.trim();
    return (
      trimmed === "" ||
      trimmed === '""' ||
      trimmed === "''" ||
      trimmed === "inline:" ||
      trimmed === 'inline:""' ||
      trimmed === "inline:''"
    );
  }
  return false;
}

function resolvePathAccessor(path: string, ctx: PipelineRenderContext): string {
  if (isBlankOrQuotes(path)) {
    return '""';
  }
  if (path.startsWith("headers.")) {
    return `req.headers["${path.slice(8)}"]`;
  }
  const headerMatch = path.match(/(?:req\.)?headers\[['"]([^'"]+)['"]\]/);
  if (headerMatch) {
    return `req.headers["${headerMatch[1]}"]`;
  }
  if (path.startsWith("body.")) {
    return `${ctx.bodyVar}.${path.slice(5)}`;
  }
  if (path.startsWith("params.")) {
    return `req.params.${path.slice(7)}`;
  }
  if (path.startsWith("query.")) {
    return `req.query.${path.slice(6)}`;
  }
  if (path.startsWith("event.")) {
    return `event.${path.slice(6)}`;
  }
  if (path === "env" || path === "process.env") {
    return "process.env";
  }
  if (path.startsWith("env.") || path.startsWith("process.env.")) {
    const field = path.startsWith("process.env.") ? path.slice(12) : path.slice(4);
    return `process.env.${field}`;
  }
  if (path.startsWith("inline:")) {
    const val = path.slice(7).trim();
    if (!val || val === '""' || val === "''") return '""';
    if (val.startsWith("`") || val.startsWith('"') || val.startsWith("'")) {
      const innerTrimmed = val.slice(1, -1).trim();
      if (!innerTrimmed && (val.startsWith('"') || val.startsWith("'"))) {
        return '""';
      }
      return val;
    }
    if (val.includes("${")) return `\`${val}\``;
    return JSON.stringify(val);
  }
  if (path.startsWith("`") || path.startsWith('"') || path.startsWith("'")) {
    const trimmed = path.trim();
    if (trimmed === '""' || trimmed === "''") return '""';
    return path;
  }
  if (path.includes("${")) {
    return `\`${path}\``;
  }
  if (path === "body") {
    return ctx.bodyVar;
  }
  if (path === "headers") {
    return "req.headers";
  }
  if (path === "params") {
    return "req.params";
  }
  if (path === "query") {
    return "req.query";
  }
  if (ctx.priorOutputs) {
    const parts = path.split(".");
    const first = parts[0];
    if (first && ctx.priorOutputs.has(first)) {
      const mappedVar = ctx.priorOutputs.get(first);
      return parts.length > 1 ? `${mappedVar}.${parts.slice(1).join(".")}` : (mappedVar || path);
    }
  }
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(path)) {
    return JSON.stringify(path);
  }
  return `${ctx.bodyVar}?.${path}`;
}

/**
 * Renders a LangGraph agent invocation step (sync await or real-time streaming).
 */
export function renderLangGraphInvokeStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const {
    outputVariable = "agentResult",
    functionRef,
    inputBindings = [],
    langGraphStateMapping,
    langGraphThreadIdSource,
    langGraphMessagesConfig,
    langGraphStreamingEnabled,
    langGraphStreamingFields = [],
    langGraphStreamModes,
    langGraphStreamIncludeReasoning = true,
    langGraphStreamSubgraphs,
    langGraphOutputMode = "full_state",
    langGraphOutputFields = [],
    langGraphTargetNodeId,
    langGraphTrackTokenUsage,
  } = step;

  const rawLines: string[] = [];
  const rawLabel = step.name || "agent";
  const graphVar =
    functionRef?.name ||
    (langGraphTargetNodeId &&
    !/^[0-9]/.test(langGraphTargetNodeId) &&
    !langGraphTargetNodeId.includes("-") &&
    langGraphTargetNodeId.length < 20
      ? `${toVarName(langGraphTargetNodeId)}Graph`
      : `${toVarName(rawLabel)}Graph`);

  // Extract thread_id if configured or mapped
  let threadIdExpr: string | undefined = langGraphThreadIdSource
    ? resolvePathAccessor(langGraphThreadIdSource, ctx)
    : undefined;

  // ─── LangGraph Action: History (getState / getStateHistory) ───
  if (step.langGraphAction === "history") {
    const threadAccessor = threadIdExpr || "req.params.threadId ?? req.query.thread_id ?? req.headers[\"x-thread-id\"]";
    const format = step.langGraphHistoryFormat || "chat_messages";
    const snapVar = outputVariable + "Snapshot";
    const isPaginated = Boolean(step.langGraphHistoryPaginationEnabled);

    let limitAccessor = "req.query.limit";
    let beforeAccessor = "req.query.before";

    if (isPaginated) {
      const limitSource = step.langGraphHistoryLimitSource || "query.limit";
      limitAccessor = resolvePathAccessor(limitSource, ctx);
      const defaultLimit = step.langGraphHistoryLimitDefault || 20;

      const beforeSource = step.langGraphHistoryBeforeSource || "query.before";
      beforeAccessor = resolvePathAccessor(beforeSource, ctx);

      rawLines.push("const " + outputVariable + "Limit = Math.max(1, Number(" + limitAccessor + ") || " + defaultLimit + ");");
      rawLines.push("const " + outputVariable + "BeforeRaw = " + beforeAccessor + ";");
      rawLines.push("const " + outputVariable + "Before = (" + outputVariable + "BeforeRaw && " + outputVariable + "BeforeRaw !== \"0\" && " + outputVariable + "BeforeRaw !== \"null\" && " + outputVariable + "BeforeRaw !== \"undefined\") ? { configurable: { checkpoint_id: String(" + outputVariable + "BeforeRaw).trim() } } : undefined;");
      rawLines.push("const " + outputVariable + "Snapshots: any[] = [];");
      rawLines.push("for await (const snap of " + graphVar + ".getStateHistory(");
      rawLines.push("  { configurable: { thread_id: " + threadAccessor + " } },");
      rawLines.push("  { limit: " + outputVariable + "Limit, before: " + outputVariable + "Before }");
      rawLines.push(")) {");
      rawLines.push("  " + outputVariable + "Snapshots.push(snap);");
      rawLines.push("}");
      rawLines.push("const " + snapVar + " = " + outputVariable + "Snapshots[0] || (await " + graphVar + ".getState({ configurable: { thread_id: " + threadAccessor + " } }));");
      rawLines.push("const " + outputVariable + "NextCursor = " + outputVariable + "Snapshots[" + outputVariable + "Snapshots.length - 1]?.config?.configurable?.checkpoint_id ?? null;");
    } else {
      rawLines.push("const " + snapVar + " = await " + graphVar + ".getState({");
      rawLines.push("  configurable: { thread_id: " + threadAccessor + " },");
      rawLines.push("});");
    }

    if (format === "full_state") {
      rawLines.push("const " + outputVariable + " = {");
      rawLines.push("  threadId: " + threadAccessor + ",");
      rawLines.push("  values: " + snapVar + "?.values ?? {},");
      rawLines.push("  next: " + snapVar + "?.next ?? [],");
      if (isPaginated) {
        rawLines.push("  pagination: {");
        rawLines.push("    limit: " + outputVariable + "Limit,");
        rawLines.push("    before: " + beforeAccessor + " ?? null,");
        rawLines.push("    next_cursor: " + outputVariable + "NextCursor,");
        rawLines.push("  },");
      }
      rawLines.push("};");
    } else {
      const excludeTools = step.langGraphHistoryExcludeToolMessages !== false;
      rawLines.push("const " + outputVariable + "RawMessages = (" + snapVar + "?.values as any)?.messages ?? [];");
      rawLines.push("const " + outputVariable + "Messages = (Array.isArray(" + outputVariable + "RawMessages) ? " + outputVariable + "RawMessages : [])");
      if (excludeTools) {
        rawLines.push("  .filter((m: any) => {");
        rawLines.push("    const t = typeof m.getType === \"function\" ? m.getType() : m.role;");
        rawLines.push("    return t === \"human\" || t === \"user\" || t === \"ai\" || t === \"assistant\";");
        rawLines.push("  })");
      }
      rawLines.push("  .map((m: any) => {");
      rawLines.push("    const t = typeof m.getType === \"function\" ? m.getType() : m.role;");
      rawLines.push("    const role = (t === \"human\" || t === \"user\") ? \"user\" : (t === \"ai\" || t === \"assistant\") ? \"assistant\" : String(t || \"assistant\");");
      rawLines.push("    const content = typeof m.content === \"string\"");
      rawLines.push("      ? m.content");
      rawLines.push("      : Array.isArray(m.content)");
      rawLines.push("        ? m.content.map((b: any) => b.text || \"\").join(\"\")");
      rawLines.push("        : String(m.content ?? \"\");");
      rawLines.push("    return { id: m.id || (typeof crypto !== \"undefined\" && typeof crypto.randomUUID === \"function\" ? crypto.randomUUID() : String(Date.now())), role, content };");
      rawLines.push("  });");

      if (isPaginated) {
        rawLines.push("const " + outputVariable + " = {");
        rawLines.push("  messages: " + outputVariable + "Messages,");
        rawLines.push("  pagination: {");
        rawLines.push("    limit: " + outputVariable + "Limit,");
        rawLines.push("    before: " + beforeAccessor + " ?? null,");
        rawLines.push("    next_cursor: " + outputVariable + "NextCursor,");
        rawLines.push("  },");
        rawLines.push("};");
      } else {
        rawLines.push("const " + outputVariable + " = " + outputVariable + "Messages;");
      }
    }

    return rawLines;
  }

  // Build dedicated messages initialization if langGraphMessagesConfig is defined
  const stepPrefix = toVarName(step.name || step.id || "agent");
  const messagesInitLines: string[] = [];
  let messagesVarName: string | undefined;

  if (langGraphMessagesConfig) {
    messagesVarName = `${stepPrefix}Messages`;
    const systemSource = langGraphMessagesConfig.systemMessageSource?.trim();
    const systemAccessor = systemSource ? resolvePathAccessor(systemSource, ctx) : undefined;
    const aiSource = langGraphMessagesConfig.aiMessageSource?.trim();
    const aiAccessor = aiSource ? resolvePathAccessor(aiSource, ctx) : undefined;

    if (langGraphMessagesConfig.mode === "bulk") {
      const bulkSource = langGraphMessagesConfig.bulkMessagesSource || "body.messages";
      const bulkAccessor = resolvePathAccessor(bulkSource, ctx);
      messagesInitLines.push(
        `const ${messagesVarName}Raw = Array.isArray(${bulkAccessor}) ? ${bulkAccessor} : [];`,
        `const ${messagesVarName} = [`,
        ...(systemAccessor
          ? [`  ...(${systemAccessor} ? [new SystemMessage(String(${systemAccessor}))] : []),`]
          : []),
        `  ...${messagesVarName}Raw.map((m) => {`,
        `    if (typeof m === "string") return new HumanMessage(m);`,
        `    const content = m?.content ?? (typeof m === "object" && m !== null && "kwargs" in m && typeof m.kwargs === "object" && m.kwargs !== null && "content" in m.kwargs && typeof m.kwargs.content === "string" ? m.kwargs.content : (typeof m === "object" ? JSON.stringify(m) : String(m ?? "")));`,
        `    if (m?.role === "system") return new SystemMessage(content);`,
        `    if (m?.role === "assistant" || m?.role === "ai") return new AIMessage(content);`,
        `    if (m?._getType?.() === "ai" || (Array.isArray(m?.id) && m.id.includes("AIMessage"))) return new AIMessage(content);`,
        `    return new HumanMessage(content);`,
        `  }),`,
        `];`,
      );
    } else {
      // Single turn mode
      const userSource = langGraphMessagesConfig.userMessageSource || "body.message";
      const userAccessor = resolvePathAccessor(userSource, ctx);

      messagesInitLines.push(
        `const ${messagesVarName} = [`,
        ...(systemAccessor
          ? [`  ...(${systemAccessor} ? [new SystemMessage(String(${systemAccessor}))] : []),`]
          : []),
        ...(aiAccessor
          ? [`  ...(${aiAccessor} ? [new AIMessage(String(${aiAccessor}))] : []),`]
          : []),
        `  new HumanMessage(String(${userAccessor} || "")),`,
        `];`,
      );
    }
  }

  // Build state input object
  const stateFields: string[] = [];
  const mappedFieldKeys = new Set<string>();

  if (messagesVarName) {
    mappedFieldKeys.add("messages");
    if (langGraphMessagesConfig?.operation === "overwrite") {
      stateFields.push(`  "messages": { __overwrite__: ${messagesVarName} },`);
    } else {
      stateFields.push(`  "messages": ${messagesVarName},`);
    }
  }

  if (inputBindings.length > 0) {
    for (const b of inputBindings) {
      if (b.argName) {
        if (b.argName === "thread_id" || b.argName === "threadId") {
          if (!threadIdExpr) {
            threadIdExpr = resolveBinding(b, ctx);
          }
          continue;
        }
        if ((b.argName === "messages" || b.argName === "message") && messagesVarName) {
          continue;
        }
        mappedFieldKeys.add(b.argName);
        stateFields.push(`  ${JSON.stringify(b.argName)}: ${resolveBinding(b, ctx)},`);
      }
    }
  } else if (langGraphStateMapping && Object.keys(langGraphStateMapping).length > 0) {
    for (const [key, path] of Object.entries(langGraphStateMapping)) {
      if (path === undefined || path === null) continue;
      if (key === "thread_id" || key === "threadId") {
        if (!threadIdExpr && !isBlankOrQuotes(path)) {
          threadIdExpr = resolvePathAccessor(path, ctx);
        }
        continue;
      }
      if ((key === "messages" || key === "message") && messagesVarName) {
        continue;
      }
      mappedFieldKeys.add(key);
      if (isBlankOrQuotes(path)) {
        stateFields.push(`  ${JSON.stringify(key)}: "",`);
        continue;
      }
      stateFields.push(`  ${JSON.stringify(key)}: ${resolvePathAccessor(path, ctx)},`);
    }
  } else if (!messagesVarName) {
    mappedFieldKeys.add("messages");
    stateFields.push(
      `  messages: ${ctx.bodyVar}?.messages ?? [{ role: "user", content: ${ctx.bodyVar}?.message ?? (typeof ${ctx.bodyVar} === "string" ? ${ctx.bodyVar} : JSON.stringify(${ctx.bodyVar})) }],`,
    );
  }

  const stateInit =
    stateFields.length > 0
      ? `{\n${stateFields.join("\n")}\n}`
      : `{ messages: [{ role: "user", content: "hello" }] }`;

  const activeStreamModes = (langGraphStreamModes && langGraphStreamModes.length > 0)
    ? langGraphStreamModes
    : ["messages"];

  const streamModeExpr = activeStreamModes.length === 1
    ? JSON.stringify(activeStreamModes[0])
    : JSON.stringify(activeStreamModes);

  const streamConfigProps: string[] = [`streamMode: ${streamModeExpr}`];
  if (threadIdExpr) {
    streamConfigProps.push(`configurable: { thread_id: ${threadIdExpr} }`);
  }
  if (langGraphStreamSubgraphs) {
    streamConfigProps.push(`subgraphs: true`);
  }
  const streamConfigOptions = `{ ${streamConfigProps.join(", ")} }`;

  const invokeConfigOptions = threadIdExpr
    ? `, { configurable: { thread_id: ${threadIdExpr} } }`
    : "";

  if (langGraphStreamingEnabled) {
    const streamProtocol = step.langGraphStreamingProtocol || "sse";

    if (streamProtocol === "sse" || streamProtocol === "raw") {
      const isRaw = streamProtocol === "raw";
      const sseEvt = !isRaw && step.clientDeliveryEventName && step.clientDeliveryEventName !== "message"
        ? `event: ${step.clientDeliveryEventName}\\n`
        : "";
      rawLines.push(
        `// --- LangGraph Streaming Invocation (${step.name}) via ${isRaw ? "Raw Stream" : "SSE"} ---`,
      );
      if (messagesInitLines.length > 0) {
        rawLines.push(...messagesInitLines);
      }
      rawLines.push(`const agentState = ${stateInit};`);
      if (isRaw) {
        rawLines.push(`res.setHeader("Content-Type", "text/plain; charset=utf-8");`);
        rawLines.push(`res.setHeader("Cache-Control", "no-cache");`);
        rawLines.push(`res.setHeader("Transfer-Encoding", "chunked");`);
      } else {
        rawLines.push(`res.setHeader("Content-Type", "text/event-stream");`);
        rawLines.push(`res.setHeader("Cache-Control", "no-cache");`);
        rawLines.push(`res.setHeader("Connection", "keep-alive");`);
      }
      rawLines.push(`res.setHeader("X-Accel-Buffering", "no");`);
      if (threadIdExpr) {
        rawLines.push(`if (${threadIdExpr} && typeof res.setHeader === "function") {`);
        rawLines.push(`  res.setHeader("X-Thread-Id", String(${threadIdExpr}));`);
        rawLines.push(`}`);
      }
      rawLines.push(`if (typeof res.flushHeaders === "function") {`);
      rawLines.push(`  res.flushHeaders();`);
      rawLines.push(`}`);
      rawLines.push(
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };`,
        `let ${outputVariable}Content = "";`,
      );
      if (!isRaw) {
        rawLines.push(
          `res.write(\`${sseEvt}data: \${JSON.stringify({ type: "stream_start", threadId: ${threadIdExpr || "undefined"} })}\\n\\n\`);`,
        );
      }
      rawLines.push(
        `const stream = await ${graphVar}.stream(agentState, ${streamConfigOptions});`,
      );
      rawLines.push(`for await (const chunk of stream) {`);
      rawLines.push(`  if (res.writableEnded || res.destroyed) {`);
      rawLines.push(`    break;`);
      rawLines.push(`  }`);
      rawLines.push(`  let mode: string = "messages";`);
      rawLines.push(`  let payload = chunk;`);
      rawLines.push(`  const _c = Array.isArray(chunk) ? chunk : undefined;`);
      rawLines.push(`  if (Array.isArray(_c) && _c.length === 3 && Array.isArray(_c[0]) && typeof _c[1] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(_c[1])) {`);
      rawLines.push(`    // subgraphs:true + multi-mode: [namespace[], mode, data]`);
      rawLines.push(`    mode = _c[1];`);
      rawLines.push(`    payload = _c[2];`);
      rawLines.push(`  } else if (Array.isArray(_c) && _c.length === 2 && Array.isArray(_c[0])) {`);
      rawLines.push(`    // subgraphs:true + single-mode: [namespace[], data]`);
      rawLines.push(`    payload = _c[1];`);
      rawLines.push(`  } else if (Array.isArray(_c) && _c.length === 2 && typeof _c[0] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(_c[0])) {`);
      rawLines.push(`    // multi-mode without subgraphs: [mode, data]`);
      rawLines.push(`    mode = _c[0];`);
      rawLines.push(`    payload = _c[1];`);
      rawLines.push(`  } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null && !("content" in chunk) && !("text" in chunk)) {`);
      rawLines.push(`    mode = "updates";`);
      rawLines.push(`  }`);
      rawLines.push(`  if (mode === "messages") {`);
      rawLines.push(
        `    const [messageChunk, metadata] = Array.isArray(payload) ? payload : [payload, undefined];`,
      );
      rawLines.push(
        `    const nodeName = typeof metadata === "object" && metadata !== null && "langgraph_node" in metadata ? metadata.langgraph_node : undefined;`,
      );
      rawLines.push(`    let reasoningToken: string | undefined = undefined;`);
      rawLines.push(`    let textToken: string | undefined = undefined;`);
      rawLines.push(`    if (messageChunk && typeof messageChunk === "object") {`);
      rawLines.push(`      if (Array.isArray(messageChunk.contentBlocks)) {`);
      rawLines.push(`        for (const block of messageChunk.contentBlocks) {`);
      rawLines.push(`          if (block?.type === "reasoning" && (block.reasoning || block.text)) {`);
      rawLines.push(`            reasoningToken = (reasoningToken || "") + (block.reasoning || block.text || "");`);
      rawLines.push(`          } else if (block?.type === "text" && block.text) {`);
      rawLines.push(`            textToken = (textToken || "") + block.text;`);
      rawLines.push(`          }`);
      rawLines.push(`        }`);
      rawLines.push(`      }`);
      rawLines.push(`      if (!reasoningToken && typeof messageChunk === "object" && messageChunk !== null && "additional_kwargs" in messageChunk && typeof messageChunk.additional_kwargs === "object" && messageChunk.additional_kwargs !== null) {`);
      rawLines.push(`        const kw = messageChunk.additional_kwargs;`);
      rawLines.push(`        if ("reasoning_content" in kw && typeof kw.reasoning_content === "string") reasoningToken = kw.reasoning_content;`);
      rawLines.push(`        else if ("thinking" in kw && typeof kw.thinking === "string") reasoningToken = kw.thinking;`);
      rawLines.push(`      }`);
      rawLines.push(`      if (!textToken) {`);
      rawLines.push(`        if (typeof messageChunk.content === "string") {`);
      rawLines.push(`          textToken = messageChunk.content;`);
      rawLines.push(`        } else if (typeof messageChunk.text === "string") {`);
      rawLines.push(`          textToken = messageChunk.text;`);
      rawLines.push(`        } else if (Array.isArray(messageChunk.content)) {`);
      rawLines.push(`          for (const item of messageChunk.content) {`);
      rawLines.push(`            if (typeof item === "string") textToken = (textToken || "") + item;`);
      rawLines.push(`            else if (item && typeof item === "object") {`);
      rawLines.push(`              if (item.type === "reasoning") reasoningToken = (reasoningToken || "") + (item.reasoning || item.text || "");`);
      rawLines.push(`              else if (item.type === "text" && item.text) textToken = (textToken || "") + item.text;`);
      rawLines.push(`            }`);
      rawLines.push(`          }`);
      rawLines.push(`        }`);
      rawLines.push(`      }`);
      rawLines.push(`    } else if (typeof messageChunk === "string") {`);
      rawLines.push(`      textToken = messageChunk;`);
      rawLines.push(`    }`);
      rawLines.push(
        `    const token = textToken ?? (typeof payload === "string" ? payload : (typeof payload === "object" && payload !== null && "content" in payload ? payload.content : undefined));`,
      );
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `    let _chunkUsage: object | undefined = undefined;`,
          `    let _rm: object | undefined = undefined;`,
          `    if (messageChunk && typeof messageChunk === "object") {`,
          `      if ("response_metadata" in messageChunk && typeof messageChunk.response_metadata === "object" && messageChunk.response_metadata !== null) {`,
          `        _rm = messageChunk.response_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "response_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.response_metadata === "object" && messageChunk.kwargs.response_metadata !== null) {`,
          `        _rm = messageChunk.kwargs.response_metadata;`,
          `      }`,
          `      if ("usage_metadata" in messageChunk && typeof messageChunk.usage_metadata === "object" && messageChunk.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.usage_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "usage_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.usage_metadata === "object" && messageChunk.kwargs.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.kwargs.usage_metadata;`,
          `      } else if (_rm) {`,
          `        if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
          `          _chunkUsage = _rm.token_usage;`,
          `        } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
          `          _chunkUsage = _rm.tokenUsage;`,
          `        } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          _chunkUsage = _rm.usage;`,
          `        }`,
          `      }`,
          `    }`,
          `    if (_chunkUsage) {`,
          `      const _in = ("input_tokens" in _chunkUsage && typeof _chunkUsage.input_tokens === "number" ? _chunkUsage.input_tokens : ("prompt_tokens" in _chunkUsage && typeof _chunkUsage.prompt_tokens === "number" ? _chunkUsage.prompt_tokens : ("promptTokens" in _chunkUsage && typeof _chunkUsage.promptTokens === "number" ? _chunkUsage.promptTokens : ("inputTokens" in _chunkUsage && typeof _chunkUsage.inputTokens === "number" ? _chunkUsage.inputTokens : 0))));`,
          `      const _out = ("output_tokens" in _chunkUsage && typeof _chunkUsage.output_tokens === "number" ? _chunkUsage.output_tokens : ("completion_tokens" in _chunkUsage && typeof _chunkUsage.completion_tokens === "number" ? _chunkUsage.completion_tokens : ("completionTokens" in _chunkUsage && typeof _chunkUsage.completionTokens === "number" ? _chunkUsage.completionTokens : ("outputTokens" in _chunkUsage && typeof _chunkUsage.outputTokens === "number" ? _chunkUsage.outputTokens : 0))));`,
          `      let _reas = 0;`,
          `      if ("reasoning_tokens" in _chunkUsage && typeof _chunkUsage.reasoning_tokens === "number") {`,
          `        _reas = _chunkUsage.reasoning_tokens;`,
          `      } else if ("reasoningTokens" in _chunkUsage && typeof _chunkUsage.reasoningTokens === "number") {`,
          `        _reas = _chunkUsage.reasoningTokens;`,
          `      } else if ("completion_tokens_details" in _chunkUsage && typeof _chunkUsage.completion_tokens_details === "object" && _chunkUsage.completion_tokens_details !== null) {`,
          `        const _ctd: object = _chunkUsage.completion_tokens_details;`,
          `        if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `        else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `      } else if ("output_token_details" in _chunkUsage && typeof _chunkUsage.output_token_details === "object" && _chunkUsage.output_token_details !== null) {`,
          `        const _otd: object = _chunkUsage.output_token_details;`,
          `        if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
          `        else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
          `      }`,
          `      if (_reas === 0 && _rm) {`,
          `        if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          const _rmu: object = _rm.usage;`,
          `          if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
          `            const _ctd: object = _rmu.completion_tokens_details;`,
          `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `          } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
          `            _reas = _rmu.reasoning_tokens;`,
          `          }`,
          `        } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
          `          const _ctd: object = _rm.completion_tokens_details;`,
          `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `        }`,
          `      }`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
          `      if (_reas > 0) ${stepPrefix}TokenUsage.reasoning_tokens = _reas;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    } else if (token !== undefined && token !== "") {`,
          `      ${stepPrefix}TokenUsage.output_tokens += 1;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    }`,
        );
      }
      if (langGraphStreamingFields.length > 0) {
        const allowedFields = JSON.stringify(langGraphStreamingFields);
        rawLines.push(`    if (${allowedFields}.includes(nodeName || "")) {`);
        if (langGraphStreamIncludeReasoning !== false) {
          rawLines.push(`      if (reasoningToken) {`);
          if (isRaw) {
            rawLines.push(`        res.write(reasoningToken);`);
          } else {
            rawLines.push(`        res.write(\`${sseEvt}data: \${JSON.stringify({ type: "reasoning", reasoning: reasoningToken, node: nodeName })}\\n\\n\`);`);
          }
          rawLines.push(`      }`);
        }
        rawLines.push(`      if (token !== undefined && token !== "") {`);
        rawLines.push(`        ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(`        ${isRaw ? 'res.write(typeof token === "string" ? token : JSON.stringify(token));' : `res.write(\`${sseEvt}data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);`}`);
        rawLines.push(`      }`);
        rawLines.push(`    }`);
      } else {
        if (langGraphStreamIncludeReasoning !== false) {
          rawLines.push(`    if (reasoningToken) {`);
          if (isRaw) {
            rawLines.push(`      res.write(reasoningToken);`);
          } else {
            rawLines.push(`      res.write(\`${sseEvt}data: \${JSON.stringify({ type: "reasoning", reasoning: reasoningToken, node: nodeName })}\\n\\n\`);`);
          }
          rawLines.push(`    }`);
        }
        rawLines.push(`    if (token !== undefined && token !== "") {`);
        rawLines.push(`      ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(`      ${isRaw ? 'res.write(typeof token === "string" ? token : JSON.stringify(token));' : `res.write(\`${sseEvt}data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);`}`);
        rawLines.push(`    }`);
      }
      rawLines.push(
        `    const _toolCalls = (typeof messageChunk === "object" && messageChunk !== null)`,
        `      ? ("tool_calls" in messageChunk && Array.isArray(messageChunk.tool_calls) ? messageChunk.tool_calls : ("tool_call_chunks" in messageChunk && Array.isArray(messageChunk.tool_call_chunks) ? messageChunk.tool_call_chunks : undefined))`,
        `      : undefined;`,
        `    if (Array.isArray(_toolCalls) && _toolCalls.length > 0) {`,
        isRaw
          ? `      res.write(JSON.stringify({ type: "tool_call", tool_calls: _toolCalls }));`
          : `      res.write(\`${sseEvt}data: \${JSON.stringify({ type: "tool_call", tool_calls: _toolCalls, node: nodeName })}\\n\\n\`);`,
        `    }`,
      );
      rawLines.push(`  } else if (mode === "updates") {`);
      rawLines.push(`    const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;`);
      if (langGraphStreamingFields.length > 0) {
        const allowedFields = JSON.stringify(langGraphStreamingFields);
        rawLines.push(`    if (${allowedFields}.includes(nodeName || "")) {`);
        if (isRaw) {
          rawLines.push(`      res.write(JSON.stringify(payload));`);
        } else {
          rawLines.push(`      res.write(\`${sseEvt}data: \${JSON.stringify({ type: "update", mode: "updates", node: nodeName, data: payload })}\\n\\n\`);`);
        }
        rawLines.push(`    }`);
      } else {
        if (isRaw) {
          rawLines.push(`    res.write(JSON.stringify(payload));`);
        } else {
          rawLines.push(`    res.write(\`${sseEvt}data: \${JSON.stringify({ type: "update", mode: "updates", node: nodeName, data: payload })}\\n\\n\`);`);
        }
      }
      rawLines.push(`  } else if (mode === "custom") {`);
      if (isRaw) {
        rawLines.push(`    res.write(typeof payload === "string" ? payload : JSON.stringify(payload));`);
      } else {
        rawLines.push(`    res.write(\`${sseEvt}data: \${JSON.stringify({ type: "custom", mode: "custom", data: payload })}\\n\\n\`);`);
      }
      rawLines.push(`  } else if (mode === "values") {`);
      if (isRaw) {
        rawLines.push(`    res.write(JSON.stringify(payload));`);
      } else {
        rawLines.push(`    res.write(\`${sseEvt}data: \${JSON.stringify({ type: "values", mode: "values", data: payload })}\\n\\n\`);`);
      }
      rawLines.push(`  }`);
      rawLines.push(`  if ("flush" in res && typeof res.flush === "function") {`);
      rawLines.push(`    res.flush();`);
      rawLines.push(`  }`);
      rawLines.push(`}`);
      rawLines.push(`if (!res.writableEnded && !res.destroyed) {`);
      if (!isRaw) {
        if (langGraphTrackTokenUsage) {
          rawLines.push(`  res.write(\`${sseEvt}data: \${JSON.stringify({ type: "usage", usage: ${stepPrefix}TokenUsage })}\\n\\n\`);`);
        }
        rawLines.push(`  res.write(\`${sseEvt}data: \${JSON.stringify({ type: "stream_end", done: true, content: ${outputVariable}Content, usage: ${stepPrefix}TokenUsage, threadId: ${threadIdExpr || "undefined"} })}\\n\\n\`);`);
        rawLines.push(`  res.write("${sseEvt}data: [DONE]\\n\\n");`);
      }
      rawLines.push(`  res.end();`);
      rawLines.push(`}`);
      if (outputVariable) {
        rawLines.push(`const ${outputVariable} = {
  streamed: true,
  protocol: "${streamProtocol}",
  response: ${outputVariable}Content,
  content: ${outputVariable}Content,
  usage: ${stepPrefix}TokenUsage,
  threadId: ${threadIdExpr || "undefined"},
};`);
      }
    } else if (streamProtocol === "websocket") {
      const roomExpr = step.langGraphStreamingRoom
        ? resolvePathAccessor(step.langGraphStreamingRoom, ctx)
        : (threadIdExpr || `"default"`);

      rawLines.push(`// --- LangGraph Streaming Invocation (${step.name}) via WebSocket ---`);
      if (messagesInitLines.length > 0) {
        rawLines.push(...messagesInitLines);
      }
      rawLines.push(`const agentState = ${stateInit};`);
      rawLines.push(
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };`,
        `let ${outputVariable}Content = "";`,
      );
      rawLines.push(
        `wsBroadcast("agent_stream", { type: "stream_start", threadId: ${threadIdExpr || "undefined"}, done: false }, ${roomExpr});`,
      );
      rawLines.push(
        `const stream = await ${graphVar}.stream(agentState, ${streamConfigOptions});`,
      );
      rawLines.push(`for await (const chunk of stream) {`);
      rawLines.push(`  let mode: string = "messages";`);
      rawLines.push(`  let payload = chunk;`);
      rawLines.push(`  const _c = Array.isArray(chunk) ? chunk : undefined;`);
      rawLines.push(`  if (Array.isArray(_c) && _c.length === 3 && Array.isArray(_c[0]) && typeof _c[1] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(_c[1])) {`);
      rawLines.push(`    // subgraphs:true + multi-mode: [namespace[], mode, data]`);
      rawLines.push(`    mode = _c[1];`);
      rawLines.push(`    payload = _c[2];`);
      rawLines.push(`  } else if (Array.isArray(_c) && _c.length === 2 && Array.isArray(_c[0])) {`);
      rawLines.push(`    // subgraphs:true + single-mode: [namespace[], data]`);
      rawLines.push(`    payload = _c[1];`);
      rawLines.push(`  } else if (Array.isArray(_c) && _c.length === 2 && typeof _c[0] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(_c[0])) {`);
      rawLines.push(`    // multi-mode without subgraphs: [mode, data]`);
      rawLines.push(`    mode = _c[0];`);
      rawLines.push(`    payload = _c[1];`);
      rawLines.push(`  } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null && !("content" in chunk) && !("text" in chunk)) {`);
      rawLines.push(`    mode = "updates";`);
      rawLines.push(`  }`);
      rawLines.push(`  if (mode === "messages") {`);
      rawLines.push(
        `    const [messageChunk, metadata] = Array.isArray(payload) ? payload : [payload, undefined];`,
      );
      rawLines.push(
        `    const token = (typeof messageChunk === "object" && messageChunk !== null && "content" in messageChunk && messageChunk.content !== undefined ? messageChunk.content : undefined) ?? (typeof chunk === "string" ? chunk : (typeof chunk === "object" && chunk !== null && "content" in chunk && chunk.content !== undefined ? chunk.content : chunk));`,
      );
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `    let _chunkUsage: object | undefined = undefined;`,
          `    let _rm: object | undefined = undefined;`,
          `    if (messageChunk && typeof messageChunk === "object") {`,
          `      if ("response_metadata" in messageChunk && typeof messageChunk.response_metadata === "object" && messageChunk.response_metadata !== null) {`,
          `        _rm = messageChunk.response_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "response_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.response_metadata === "object" && messageChunk.kwargs.response_metadata !== null) {`,
          `        _rm = messageChunk.kwargs.response_metadata;`,
          `      }`,
          `      if ("usage_metadata" in messageChunk && typeof messageChunk.usage_metadata === "object" && messageChunk.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.usage_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "usage_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.usage_metadata === "object" && messageChunk.kwargs.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.kwargs.usage_metadata;`,
          `      } else if (_rm) {`,
          `        if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
          `          _chunkUsage = _rm.token_usage;`,
          `        } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
          `          _chunkUsage = _rm.tokenUsage;`,
          `        } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          _chunkUsage = _rm.usage;`,
          `        }`,
          `      }`,
          `    }`,
          `    if (_chunkUsage) {`,
          `      const _in = ("input_tokens" in _chunkUsage && typeof _chunkUsage.input_tokens === "number" ? _chunkUsage.input_tokens : ("prompt_tokens" in _chunkUsage && typeof _chunkUsage.prompt_tokens === "number" ? _chunkUsage.prompt_tokens : ("promptTokens" in _chunkUsage && typeof _chunkUsage.promptTokens === "number" ? _chunkUsage.promptTokens : ("inputTokens" in _chunkUsage && typeof _chunkUsage.inputTokens === "number" ? _chunkUsage.inputTokens : 0))));`,
          `      const _out = ("output_tokens" in _chunkUsage && typeof _chunkUsage.output_tokens === "number" ? _chunkUsage.output_tokens : ("completion_tokens" in _chunkUsage && typeof _chunkUsage.completion_tokens === "number" ? _chunkUsage.completion_tokens : ("completionTokens" in _chunkUsage && typeof _chunkUsage.completionTokens === "number" ? _chunkUsage.completionTokens : ("outputTokens" in _chunkUsage && typeof _chunkUsage.outputTokens === "number" ? _chunkUsage.outputTokens : 0))));`,
          `      let _reas = 0;`,
          `      if ("reasoning_tokens" in _chunkUsage && typeof _chunkUsage.reasoning_tokens === "number") {`,
          `        _reas = _chunkUsage.reasoning_tokens;`,
          `      } else if ("reasoningTokens" in _chunkUsage && typeof _chunkUsage.reasoningTokens === "number") {`,
          `        _reas = _chunkUsage.reasoningTokens;`,
          `      } else if ("completion_tokens_details" in _chunkUsage && typeof _chunkUsage.completion_tokens_details === "object" && _chunkUsage.completion_tokens_details !== null) {`,
          `        const _ctd: object = _chunkUsage.completion_tokens_details;`,
          `        if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `        else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `      } else if ("output_token_details" in _chunkUsage && typeof _chunkUsage.output_token_details === "object" && _chunkUsage.output_token_details !== null) {`,
          `        const _otd: object = _chunkUsage.output_token_details;`,
          `        if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
          `        else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
          `      }`,
          `      if (_reas === 0 && _rm) {`,
          `        if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          const _rmu: object = _rm.usage;`,
          `          if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
          `            const _ctd: object = _rmu.completion_tokens_details;`,
          `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `          } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
          `            _reas = _rmu.reasoning_tokens;`,
          `          }`,
          `        } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
          `          const _ctd: object = _rm.completion_tokens_details;`,
          `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `        }`,
          `      }`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
          `      if (_reas > 0) ${stepPrefix}TokenUsage.reasoning_tokens = _reas;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    } else if (token !== undefined && token !== "") {`,
          `      ${stepPrefix}TokenUsage.output_tokens += 1;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    }`,
        );
      }
      rawLines.push(
        `    const nodeName = typeof metadata === "object" && metadata !== null && "langgraph_node" in metadata ? metadata.langgraph_node : undefined;`,
      );
      if (langGraphStreamingFields.length > 0) {
        const allowedFields = JSON.stringify(langGraphStreamingFields);
        rawLines.push(`    if (${allowedFields}.includes(nodeName || "")) {`);
        rawLines.push(`      if (token !== undefined && token !== "") {`);
        rawLines.push(`        ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `        wsBroadcast("agent_stream", { token, node: nodeName, done: false }, ${roomExpr});`,
        );
        rawLines.push(`      }`);
        rawLines.push(`    }`);
      } else {
        rawLines.push(`    if (token !== undefined && token !== "") {`);
        rawLines.push(`      ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `      wsBroadcast("agent_stream", { token, node: nodeName, done: false }, ${roomExpr});`,
        );
        rawLines.push(`    }`);
      }
      rawLines.push(
        `    const _wsToolCalls = (typeof messageChunk === "object" && messageChunk !== null)`,
        `      ? ("tool_calls" in messageChunk && Array.isArray(messageChunk.tool_calls) ? messageChunk.tool_calls : ("tool_call_chunks" in messageChunk && Array.isArray(messageChunk.tool_call_chunks) ? messageChunk.tool_call_chunks : undefined))`,
        `      : undefined;`,
        `    if (Array.isArray(_wsToolCalls) && _wsToolCalls.length > 0) {`,
        `      wsBroadcast("agent_stream", { type: "tool_call", tool_calls: _wsToolCalls, node: nodeName, done: false }, ${roomExpr});`,
        `    }`,
      );
      rawLines.push(`  } else if (mode === "updates") {`);
      rawLines.push(`    const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;`);
      rawLines.push(`    wsBroadcast("agent_stream", { type: "update", mode: "updates", node: nodeName, data: payload, done: false }, ${roomExpr});`);
      rawLines.push(`  } else if (mode === "custom" || mode === "values") {`);
      rawLines.push(`    wsBroadcast("agent_stream", { type: mode, mode, data: payload, done: false }, ${roomExpr});`);
      rawLines.push(`  }`);
      rawLines.push(`}`);
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `wsBroadcast("agent_stream", { type: "usage", usage: ${stepPrefix}TokenUsage, done: false }, ${roomExpr});`,
        );
      }
      rawLines.push(
        `wsBroadcast("agent_stream", { type: "stream_end", done: true, content: ${outputVariable}Content, usage: ${stepPrefix}TokenUsage, threadId: ${threadIdExpr || "undefined"} }, ${roomExpr});`,
      );
      rawLines.push(`wsBroadcast("agent_stream", { done: true }, ${roomExpr});`);
      if (outputVariable) {
        rawLines.push(`const ${outputVariable} = {
  streamed: true,
  protocol: "websocket",
  room: ${roomExpr},
  response: ${outputVariable}Content,
  content: ${outputVariable}Content,
  usage: ${stepPrefix}TokenUsage,
  threadId: ${threadIdExpr || "undefined"},
};`);
      }
    } else if (streamProtocol === "kafka") {
      const topicExpr = JSON.stringify(step.langGraphStreamingKafkaTopic || `${toVarName(step.name || "agent")}-tokens`);
      const keyExpr = step.langGraphStreamingKafkaKey
        ? resolvePathAccessor(step.langGraphStreamingKafkaKey, ctx)
        : (threadIdExpr || `"agent"`);

      rawLines.push(`// --- LangGraph Streaming Invocation (${step.name}) to Kafka Topic ---`);
      if (messagesInitLines.length > 0) {
        rawLines.push(...messagesInitLines);
      }
      rawLines.push(`const agentState = ${stateInit};`);
      rawLines.push(
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };`,
        `let ${outputVariable}Content = "";`,
      );
      rawLines.push(
        `await publishKafkaEvent(${topicExpr}, { type: "stream_start", threadId: ${threadIdExpr || "undefined"}, done: false }, ${keyExpr});`,
      );
      rawLines.push(
        `const stream = await ${graphVar}.stream(agentState, ${streamConfigOptions});`,
      );
      rawLines.push(`for await (const chunk of stream) {`);
      rawLines.push(`  let mode: string = "messages";`);
      rawLines.push(`  let payload = chunk;`);
      rawLines.push(`  if (Array.isArray(chunk) && chunk.length === 2 && typeof chunk[0] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(chunk[0])) {`);
      rawLines.push(`    mode = chunk[0];`);
      rawLines.push(`    payload = chunk[1];`);
      rawLines.push(`  } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null && !("content" in chunk) && !("text" in chunk)) {`);
      rawLines.push(`    mode = "updates";`);
      rawLines.push(`  }`);
      rawLines.push(`  if (mode === "messages") {`);
      rawLines.push(
        `    const [messageChunk, metadata] = Array.isArray(payload) ? payload : [payload, undefined];`,
      );
      rawLines.push(
        `    const token = (typeof messageChunk === "object" && messageChunk !== null && "content" in messageChunk && messageChunk.content !== undefined ? messageChunk.content : undefined) ?? (typeof chunk === "string" ? chunk : (typeof chunk === "object" && chunk !== null && "content" in chunk && chunk.content !== undefined ? chunk.content : chunk));`,
      );
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `    let _chunkUsage: object | undefined = undefined;`,
          `    let _rm: object | undefined = undefined;`,
          `    if (messageChunk && typeof messageChunk === "object") {`,
          `      if ("response_metadata" in messageChunk && typeof messageChunk.response_metadata === "object" && messageChunk.response_metadata !== null) {`,
          `        _rm = messageChunk.response_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "response_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.response_metadata === "object" && messageChunk.kwargs.response_metadata !== null) {`,
          `        _rm = messageChunk.kwargs.response_metadata;`,
          `      }`,
          `      if ("usage_metadata" in messageChunk && typeof messageChunk.usage_metadata === "object" && messageChunk.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.usage_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "usage_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.usage_metadata === "object" && messageChunk.kwargs.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.kwargs.usage_metadata;`,
          `      } else if (_rm) {`,
          `        if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
          `          _chunkUsage = _rm.token_usage;`,
          `        } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
          `          _chunkUsage = _rm.tokenUsage;`,
          `        } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          _chunkUsage = _rm.usage;`,
          `        }`,
          `      }`,
          `    }`,
          `    if (_chunkUsage) {`,
          `      const _in = ("input_tokens" in _chunkUsage && typeof _chunkUsage.input_tokens === "number" ? _chunkUsage.input_tokens : ("prompt_tokens" in _chunkUsage && typeof _chunkUsage.prompt_tokens === "number" ? _chunkUsage.prompt_tokens : ("promptTokens" in _chunkUsage && typeof _chunkUsage.promptTokens === "number" ? _chunkUsage.promptTokens : ("inputTokens" in _chunkUsage && typeof _chunkUsage.inputTokens === "number" ? _chunkUsage.inputTokens : 0))));`,
          `      const _out = ("output_tokens" in _chunkUsage && typeof _chunkUsage.output_tokens === "number" ? _chunkUsage.output_tokens : ("completion_tokens" in _chunkUsage && typeof _chunkUsage.completion_tokens === "number" ? _chunkUsage.completion_tokens : ("completionTokens" in _chunkUsage && typeof _chunkUsage.completionTokens === "number" ? _chunkUsage.completionTokens : ("outputTokens" in _chunkUsage && typeof _chunkUsage.outputTokens === "number" ? _chunkUsage.outputTokens : 0))));`,
          `      let _reas = 0;`,
          `      if ("reasoning_tokens" in _chunkUsage && typeof _chunkUsage.reasoning_tokens === "number") {`,
          `        _reas = _chunkUsage.reasoning_tokens;`,
          `      } else if ("reasoningTokens" in _chunkUsage && typeof _chunkUsage.reasoningTokens === "number") {`,
          `        _reas = _chunkUsage.reasoningTokens;`,
          `      } else if ("completion_tokens_details" in _chunkUsage && typeof _chunkUsage.completion_tokens_details === "object" && _chunkUsage.completion_tokens_details !== null) {`,
          `        const _ctd: object = _chunkUsage.completion_tokens_details;`,
          `        if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `        else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `      } else if ("output_token_details" in _chunkUsage && typeof _chunkUsage.output_token_details === "object" && _chunkUsage.output_token_details !== null) {`,
          `        const _otd: object = _chunkUsage.output_token_details;`,
          `        if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
          `        else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
          `      }`,
          `      if (_reas === 0 && _rm) {`,
          `        if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          const _rmu: object = _rm.usage;`,
          `          if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
          `            const _ctd: object = _rmu.completion_tokens_details;`,
          `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `          } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
          `            _reas = _rmu.reasoning_tokens;`,
          `          }`,
          `        } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
          `          const _ctd: object = _rm.completion_tokens_details;`,
          `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `        }`,
          `      }`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
          `      if (_reas > 0) ${stepPrefix}TokenUsage.reasoning_tokens = _reas;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    } else if (token !== undefined && token !== "") {`,
          `      ${stepPrefix}TokenUsage.output_tokens += 1;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    }`,
        );
      }
      rawLines.push(
        `    const nodeName = typeof metadata === "object" && metadata !== null && "langgraph_node" in metadata ? metadata.langgraph_node : undefined;`,
      );
      if (langGraphStreamingFields.length > 0) {
        const allowedFields = JSON.stringify(langGraphStreamingFields);
        rawLines.push(`  if (${allowedFields}.includes(nodeName || "")) {`);
        rawLines.push(`    if (token !== undefined && token !== "") {`);
        rawLines.push(`      ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `      await publishKafkaEvent(${topicExpr}, { token, node: nodeName, done: false }, ${keyExpr});`,
        );
        rawLines.push(`    }`);
        rawLines.push(`  }`);
      } else {
        rawLines.push(`  if (token !== undefined && token !== "") {`);
        rawLines.push(`    ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `    await publishKafkaEvent(${topicExpr}, { token, node: nodeName, done: false }, ${keyExpr});`,
        );
        rawLines.push(`  }`);
      }
      rawLines.push(
        `    const _kafkaToolCalls = (typeof messageChunk === "object" && messageChunk !== null)`,
        `      ? ("tool_calls" in messageChunk && Array.isArray(messageChunk.tool_calls) ? messageChunk.tool_calls : ("tool_call_chunks" in messageChunk && Array.isArray(messageChunk.tool_call_chunks) ? messageChunk.tool_call_chunks : undefined))`,
        `      : undefined;`,
        `    if (Array.isArray(_kafkaToolCalls) && _kafkaToolCalls.length > 0) {`,
        `      await publishKafkaEvent(${topicExpr}, { type: "tool_call", tool_calls: _kafkaToolCalls, node: nodeName, done: false }, ${keyExpr});`,
        `    }`,
      );
      rawLines.push(`  } else if (mode === "updates") {`);
      rawLines.push(`    const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;`);
      rawLines.push(`    await publishKafkaEvent(${topicExpr}, { type: "update", mode: "updates", node: nodeName, data: payload, done: false }, ${keyExpr});`);
      rawLines.push(`  } else if (mode === "custom" || mode === "values") {`);
      rawLines.push(`    await publishKafkaEvent(${topicExpr}, { type: mode, mode, data: payload, done: false }, ${keyExpr});`);
      rawLines.push(`  }`);
      rawLines.push(`}`);
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `await publishKafkaEvent(${topicExpr}, { type: "usage", usage: ${stepPrefix}TokenUsage, done: false }, ${keyExpr});`,
        );
      }
      rawLines.push(
        `await publishKafkaEvent(${topicExpr}, { type: "stream_end", done: true, content: ${outputVariable}Content, usage: ${stepPrefix}TokenUsage, threadId: ${threadIdExpr || "undefined"} }, ${keyExpr});`,
      );
      rawLines.push(`await publishKafkaEvent(${topicExpr}, { done: true }, ${keyExpr});`);
      if (outputVariable) {
        rawLines.push(`const ${outputVariable} = {
  streamed: true,
  protocol: "kafka",
  topic: ${topicExpr},
  response: ${outputVariable}Content,
  content: ${outputVariable}Content,
  usage: ${stepPrefix}TokenUsage,
  threadId: ${threadIdExpr || "undefined"},
};`);
      }
    } else if (streamProtocol === "redis_stream") {
      const rawRedisKey = step.langGraphStreamingRedisKey?.trim();
      const streamKeyExpr = rawRedisKey
        ? resolvePathAccessor(rawRedisKey, ctx)
        : (threadIdExpr ? `\`stream:agent:\${${threadIdExpr}}\`` : `"stream:agent:default"`);

      rawLines.push(`// --- LangGraph Streaming Invocation (${step.name}) to Redis Stream ---`);
      if (messagesInitLines.length > 0) {
        rawLines.push(...messagesInitLines);
      }
      rawLines.push(`const agentState = ${stateInit};`);
      rawLines.push(`const redisClient = await getRedisClient();`);
      rawLines.push(
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };`,
        `let ${outputVariable}Content = "";`,
      );
      rawLines.push(
        `await redisClient.xadd(${streamKeyExpr}, "*", "type", "stream_start", "thread_id", String(${threadIdExpr || "undefined"}), "done", "false");`,
      );
      rawLines.push(
        `const stream = await ${graphVar}.stream(agentState, ${streamConfigOptions});`,
      );
      rawLines.push(`for await (const chunk of stream) {`);
      rawLines.push(`  let mode: string = "messages";`);
      rawLines.push(`  let payload = chunk;`);
      rawLines.push(`  if (Array.isArray(chunk) && chunk.length === 2 && typeof chunk[0] === "string" && ["messages", "updates", "custom", "values", "debug"].includes(chunk[0])) {`);
      rawLines.push(`    mode = chunk[0];`);
      rawLines.push(`    payload = chunk[1];`);
      rawLines.push(`  } else if (!Array.isArray(chunk) && typeof chunk === "object" && chunk !== null && !("content" in chunk) && !("text" in chunk)) {`);
      rawLines.push(`    mode = "updates";`);
      rawLines.push(`  }`);
      rawLines.push(`  if (mode === "messages") {`);
      rawLines.push(
        `    const [messageChunk, metadata] = Array.isArray(payload) ? payload : [payload, undefined];`,
      );
      rawLines.push(
        `    const token = (typeof messageChunk === "object" && messageChunk !== null && "content" in messageChunk && messageChunk.content !== undefined ? messageChunk.content : undefined) ?? (typeof chunk === "string" ? chunk : (typeof chunk === "object" && chunk !== null && "content" in chunk && chunk.content !== undefined ? chunk.content : chunk));`,
      );
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `    let _chunkUsage: object | undefined = undefined;`,
          `    let _rm: object | undefined = undefined;`,
          `    if (messageChunk && typeof messageChunk === "object") {`,
          `      if ("response_metadata" in messageChunk && typeof messageChunk.response_metadata === "object" && messageChunk.response_metadata !== null) {`,
          `        _rm = messageChunk.response_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "response_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.response_metadata === "object" && messageChunk.kwargs.response_metadata !== null) {`,
          `        _rm = messageChunk.kwargs.response_metadata;`,
          `      }`,
          `      if ("usage_metadata" in messageChunk && typeof messageChunk.usage_metadata === "object" && messageChunk.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.usage_metadata;`,
          `      } else if ("kwargs" in messageChunk && typeof messageChunk.kwargs === "object" && messageChunk.kwargs !== null && "usage_metadata" in messageChunk.kwargs && typeof messageChunk.kwargs.usage_metadata === "object" && messageChunk.kwargs.usage_metadata !== null) {`,
          `        _chunkUsage = messageChunk.kwargs.usage_metadata;`,
          `      } else if (_rm) {`,
          `        if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
          `          _chunkUsage = _rm.token_usage;`,
          `        } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
          `          _chunkUsage = _rm.tokenUsage;`,
          `        } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          _chunkUsage = _rm.usage;`,
          `        }`,
          `      }`,
          `    }`,
          `    if (_chunkUsage) {`,
          `      const _in = ("input_tokens" in _chunkUsage && typeof _chunkUsage.input_tokens === "number" ? _chunkUsage.input_tokens : ("prompt_tokens" in _chunkUsage && typeof _chunkUsage.prompt_tokens === "number" ? _chunkUsage.prompt_tokens : ("promptTokens" in _chunkUsage && typeof _chunkUsage.promptTokens === "number" ? _chunkUsage.promptTokens : ("inputTokens" in _chunkUsage && typeof _chunkUsage.inputTokens === "number" ? _chunkUsage.inputTokens : 0))));`,
          `      const _out = ("output_tokens" in _chunkUsage && typeof _chunkUsage.output_tokens === "number" ? _chunkUsage.output_tokens : ("completion_tokens" in _chunkUsage && typeof _chunkUsage.completion_tokens === "number" ? _chunkUsage.completion_tokens : ("completionTokens" in _chunkUsage && typeof _chunkUsage.completionTokens === "number" ? _chunkUsage.completionTokens : ("outputTokens" in _chunkUsage && typeof _chunkUsage.outputTokens === "number" ? _chunkUsage.outputTokens : 0))));`,
          `      let _reas = 0;`,
          `      if ("reasoning_tokens" in _chunkUsage && typeof _chunkUsage.reasoning_tokens === "number") {`,
          `        _reas = _chunkUsage.reasoning_tokens;`,
          `      } else if ("reasoningTokens" in _chunkUsage && typeof _chunkUsage.reasoningTokens === "number") {`,
          `        _reas = _chunkUsage.reasoningTokens;`,
          `      } else if ("completion_tokens_details" in _chunkUsage && typeof _chunkUsage.completion_tokens_details === "object" && _chunkUsage.completion_tokens_details !== null) {`,
          `        const _ctd: object = _chunkUsage.completion_tokens_details;`,
          `        if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `        else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `      } else if ("output_token_details" in _chunkUsage && typeof _chunkUsage.output_token_details === "object" && _chunkUsage.output_token_details !== null) {`,
          `        const _otd: object = _chunkUsage.output_token_details;`,
          `        if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
          `        else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
          `      }`,
          `      if (_reas === 0 && _rm) {`,
          `        if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
          `          const _rmu: object = _rm.usage;`,
          `          if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
          `            const _ctd: object = _rmu.completion_tokens_details;`,
          `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `          } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
          `            _reas = _rmu.reasoning_tokens;`,
          `          }`,
          `        } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
          `          const _ctd: object = _rm.completion_tokens_details;`,
          `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
          `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
          `        }`,
          `      }`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
          `      if (_reas > 0) ${stepPrefix}TokenUsage.reasoning_tokens = _reas;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    } else if (token !== undefined && token !== "") {`,
          `      ${stepPrefix}TokenUsage.output_tokens += 1;`,
          `      ${stepPrefix}TokenUsage.total_tokens = ${stepPrefix}TokenUsage.input_tokens + ${stepPrefix}TokenUsage.output_tokens;`,
          `    }`,
        );
      }
      rawLines.push(
        `    const nodeName = typeof metadata === "object" && metadata !== null && "langgraph_node" in metadata ? metadata.langgraph_node : undefined;`,
      );
      if (langGraphStreamingFields.length > 0) {
        const allowedFields = JSON.stringify(langGraphStreamingFields);
        rawLines.push(`    if (${allowedFields}.includes(nodeName || "")) {`);
        rawLines.push(`      if (token !== undefined && token !== "") {`);
        rawLines.push(`        ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `        await redisClient.xadd(${streamKeyExpr}, "*", "token", String(token), "node", String(nodeName || ""), "done", "false");`,
        );
        rawLines.push(`      }`);
        rawLines.push(`    }`);
      } else {
        rawLines.push(`    if (token !== undefined && token !== "") {`);
        rawLines.push(`      ${outputVariable}Content += typeof token === "string" ? token : JSON.stringify(token);`);
        rawLines.push(
          `      await redisClient.xadd(${streamKeyExpr}, "*", "token", String(token), "node", String(nodeName || ""), "done", "false");`,
        );
        rawLines.push(`    }`);
      }
      rawLines.push(
        `    const _redisToolCalls = (typeof messageChunk === "object" && messageChunk !== null)`,
        `      ? ("tool_calls" in messageChunk && Array.isArray(messageChunk.tool_calls) ? messageChunk.tool_calls : ("tool_call_chunks" in messageChunk && Array.isArray(messageChunk.tool_call_chunks) ? messageChunk.tool_call_chunks : undefined))`,
        `      : undefined;`,
        `    if (Array.isArray(_redisToolCalls) && _redisToolCalls.length > 0) {`,
        `      await redisClient.xadd(${streamKeyExpr}, "*", "type", "tool_call", "data", JSON.stringify(_redisToolCalls), "done", "false");`,
        `    }`,
      );
      rawLines.push(`  } else if (mode === "updates") {`);
      rawLines.push(`    const nodeName = typeof payload === "object" && payload !== null ? Object.keys(payload)[0] : undefined;`);
      rawLines.push(`    await redisClient.xadd(${streamKeyExpr}, "*", "type", "update", "mode", "updates", "node", String(nodeName || ""), "data", JSON.stringify(payload), "done", "false");`);
      rawLines.push(`  } else if (mode === "custom" || mode === "values") {`);
      rawLines.push(`    await redisClient.xadd(${streamKeyExpr}, "*", "type", mode, "mode", mode, "data", JSON.stringify(payload), "done", "false");`);
      rawLines.push(`  }`);
      rawLines.push(`}`);
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `await redisClient.xadd(${streamKeyExpr}, "*", "type", "usage", "input_tokens", String(${stepPrefix}TokenUsage.input_tokens), "output_tokens", String(${stepPrefix}TokenUsage.output_tokens), "total_tokens", String(${stepPrefix}TokenUsage.total_tokens), "reasoning_tokens", String(${stepPrefix}TokenUsage.reasoning_tokens), "done", "false");`,
        );
      }
      rawLines.push(
        `await redisClient.xadd(${streamKeyExpr}, "*", "type", "stream_end", "content", String(${outputVariable}Content), "done", "true");`,
      );
      rawLines.push(`await redisClient.xadd(${streamKeyExpr}, "*", "token", "", "done", "true");`);
      if (outputVariable) {
        rawLines.push(`const ${outputVariable} = {
  streamed: true,
  protocol: "redis_stream",
  streamKey: ${streamKeyExpr},
  response: ${outputVariable}Content,
  content: ${outputVariable}Content,
  usage: ${stepPrefix}TokenUsage,
  threadId: ${threadIdExpr || "undefined"},
};`);
      }
    }
  } else {
    rawLines.push(`// --- LangGraph Invocation (${step.name}) ---`);
    if (threadIdExpr) {
      rawLines.push(`if (${threadIdExpr} && typeof res.setHeader === "function") {`);
      rawLines.push(`  res.setHeader("X-Thread-Id", String(${threadIdExpr}));`);
      rawLines.push(`}`);
    }
    if (messagesInitLines.length > 0) {
      rawLines.push(...messagesInitLines);
    }
    rawLines.push(`const agentState = ${stateInit};`);
    rawLines.push(`const ${outputVariable}Raw = await ${graphVar}.invoke(agentState${invokeConfigOptions});`);

    if (langGraphTrackTokenUsage) {
      rawLines.push(
        `const ${outputVariable}Usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, reasoning_tokens: 0 };`,
        `if (${outputVariable}Raw && typeof ${outputVariable}Raw === "object") {`,
        `  const _rawObj: object = ${outputVariable}Raw;`,
        `  const _rawMsgs = ("messages" in _rawObj && Array.isArray(_rawObj.messages)) ? _rawObj.messages : [];`,
        `  for (const _m of _rawMsgs) {`,
        `    if (_m && typeof _m === "object") {`,
        `      const _mObj: object = _m;`,
        `      let _u: object | undefined = undefined;`,
        `      let _rm: object | undefined = undefined;`,
        `      if ("response_metadata" in _mObj && typeof _mObj.response_metadata === "object" && _mObj.response_metadata !== null) {`,
        `        _rm = _mObj.response_metadata;`,
        `      } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "response_metadata" in _mObj.kwargs && typeof _mObj.kwargs.response_metadata === "object" && _mObj.kwargs.response_metadata !== null) {`,
        `        _rm = _mObj.kwargs.response_metadata;`,
        `      }`,
        `      if ("usage_metadata" in _mObj && typeof _mObj.usage_metadata === "object" && _mObj.usage_metadata !== null) {`,
        `        _u = _mObj.usage_metadata;`,
        `      } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "usage_metadata" in _mObj.kwargs && typeof _mObj.kwargs.usage_metadata === "object" && _mObj.kwargs.usage_metadata !== null) {`,
        `        _u = _mObj.kwargs.usage_metadata;`,
        `      } else if (_rm) {`,
        `        if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
        `          _u = _rm.token_usage;`,
        `        } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
        `          _u = _rm.tokenUsage;`,
        `        } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
        `          _u = _rm.usage;`,
        `        }`,
        `      }`,
        `      if (!_u) {`,
        `        let _strMsg: string | undefined = undefined;`,
        `        if ("content" in _mObj && typeof _mObj.content === "string") {`,
        `          _strMsg = _mObj.content;`,
        `        } else if ("kwargs" in _mObj && typeof _mObj.kwargs === "object" && _mObj.kwargs !== null && "content" in _mObj.kwargs && typeof _mObj.kwargs.content === "string") {`,
        `          _strMsg = _mObj.kwargs.content;`,
        `        }`,
        `        if (_strMsg && _strMsg.startsWith("{")) {`,
        `          try {`,
        `            const _p = JSON.parse(_strMsg);`,
        `            if (typeof _p === "object" && _p !== null) {`,
        `              if ("response_metadata" in _p && typeof _p.response_metadata === "object" && _p.response_metadata !== null) {`,
        `                _rm = _p.response_metadata;`,
        `              } else if ("kwargs" in _p && typeof _p.kwargs === "object" && _p.kwargs !== null && "response_metadata" in _p.kwargs && typeof _p.kwargs.response_metadata === "object" && _p.kwargs.response_metadata !== null) {`,
        `                _rm = _p.kwargs.response_metadata;`,
        `              }`,
        `              if ("usage_metadata" in _p && typeof _p.usage_metadata === "object" && _p.usage_metadata !== null) {`,
        `                _u = _p.usage_metadata;`,
        `              } else if ("kwargs" in _p && typeof _p.kwargs === "object" && _p.kwargs !== null && "usage_metadata" in _p.kwargs && typeof _p.kwargs.usage_metadata === "object" && _p.kwargs.usage_metadata !== null) {`,
        `                _u = _p.kwargs.usage_metadata;`,
        `              } else if (_rm) {`,
        `                if ("token_usage" in _rm && typeof _rm.token_usage === "object" && _rm.token_usage !== null) {`,
        `                  _u = _rm.token_usage;`,
        `                } else if ("tokenUsage" in _rm && typeof _rm.tokenUsage === "object" && _rm.tokenUsage !== null) {`,
        `                  _u = _rm.tokenUsage;`,
        `                } else if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
        `                  _u = _rm.usage;`,
        `                }`,
        `              }`,
        `            }`,
        `          } catch {}`,
        `        }`,
        `      }`,
        `      if (_u) {`,
        `        const _in = ("input_tokens" in _u && typeof _u.input_tokens === "number" ? _u.input_tokens : ("prompt_tokens" in _u && typeof _u.prompt_tokens === "number" ? _u.prompt_tokens : ("promptTokens" in _u && typeof _u.promptTokens === "number" ? _u.promptTokens : ("inputTokens" in _u && typeof _u.inputTokens === "number" ? _u.inputTokens : 0))));`,
        `        const _out = ("output_tokens" in _u && typeof _u.output_tokens === "number" ? _u.output_tokens : ("completion_tokens" in _u && typeof _u.completion_tokens === "number" ? _u.completion_tokens : ("completionTokens" in _u && typeof _u.completionTokens === "number" ? _u.completionTokens : ("outputTokens" in _u && typeof _u.outputTokens === "number" ? _u.outputTokens : 0))));`,
        `        const _tot = ("total_tokens" in _u && typeof _u.total_tokens === "number" ? _u.total_tokens : ("totalTokens" in _u && typeof _u.totalTokens === "number" ? _u.totalTokens : (_in + _out)));`,
        `        let _reas = 0;`,
        `        if ("reasoning_tokens" in _u && typeof _u.reasoning_tokens === "number") {`,
        `          _reas = _u.reasoning_tokens;`,
        `        } else if ("reasoningTokens" in _u && typeof _u.reasoningTokens === "number") {`,
        `          _reas = _u.reasoningTokens;`,
        `        } else if ("completion_tokens_details" in _u && typeof _u.completion_tokens_details === "object" && _u.completion_tokens_details !== null) {`,
        `          const _ctd: object = _u.completion_tokens_details;`,
        `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `        } else if ("output_token_details" in _u && typeof _u.output_token_details === "object" && _u.output_token_details !== null) {`,
        `          const _otd: object = _u.output_token_details;`,
        `          if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
        `          else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
        `        }`,
        `        if (_reas === 0 && _rm) {`,
        `          if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
        `            const _rmu: object = _rm.usage;`,
        `            if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
        `              const _ctd: object = _rmu.completion_tokens_details;`,
        `              if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `              else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `            } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
        `              _reas = _rmu.reasoning_tokens;`,
        `            }`,
        `          } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
        `            const _ctd: object = _rm.completion_tokens_details;`,
        `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `          }`,
        `        }`,
        `        ${outputVariable}Usage.input_tokens += _in;`,
        `        ${outputVariable}Usage.output_tokens += _out;`,
        `        ${outputVariable}Usage.total_tokens += _tot;`,
        `        ${outputVariable}Usage.reasoning_tokens += _reas;`,
        `      }`,
        `    }`,
        `  }`,
        `  if (${outputVariable}Usage.total_tokens === 0) {`,
        `    let _u: object | undefined = undefined;`,
        `    let _rm: object | undefined = undefined;`,
        `    if ("response_metadata" in _rawObj && typeof _rawObj.response_metadata === "object" && _rawObj.response_metadata !== null) {`,
        `      _rm = _rawObj.response_metadata;`,
        `    }`,
        `    if ("usage" in _rawObj && typeof _rawObj.usage === "object" && _rawObj.usage !== null) {`,
        `      _u = _rawObj.usage;`,
        `    } else if ("token_usage" in _rawObj && typeof _rawObj.token_usage === "object" && _rawObj.token_usage !== null) {`,
        `      _u = _rawObj.token_usage;`,
        `    } else if ("tokenUsage" in _rawObj && typeof _rawObj.tokenUsage === "object" && _rawObj.tokenUsage !== null) {`,
        `      _u = _rawObj.tokenUsage;`,
        `    }`,
        `    if (_u) {`,
        `      const _in = ("input_tokens" in _u && typeof _u.input_tokens === "number" ? _u.input_tokens : ("prompt_tokens" in _u && typeof _u.prompt_tokens === "number" ? _u.prompt_tokens : ("promptTokens" in _u && typeof _u.promptTokens === "number" ? _u.promptTokens : ("inputTokens" in _u && typeof _u.inputTokens === "number" ? _u.inputTokens : 0))));`,
        `      const _out = ("output_tokens" in _u && typeof _u.output_tokens === "number" ? _u.output_tokens : ("completion_tokens" in _u && typeof _u.completion_tokens === "number" ? _u.completion_tokens : ("completionTokens" in _u && typeof _u.completionTokens === "number" ? _u.completionTokens : ("outputTokens" in _u && typeof _u.outputTokens === "number" ? _u.outputTokens : 0))));`,
        `      const _tot = ("total_tokens" in _u && typeof _u.total_tokens === "number" ? _u.total_tokens : ("totalTokens" in _u && typeof _u.totalTokens === "number" ? _u.totalTokens : (_in + _out)));`,
        `      let _reas = 0;`,
        `      if ("reasoning_tokens" in _u && typeof _u.reasoning_tokens === "number") {`,
        `        _reas = _u.reasoning_tokens;`,
        `      } else if ("reasoningTokens" in _u && typeof _u.reasoningTokens === "number") {`,
        `        _reas = _u.reasoningTokens;`,
        `      } else if ("completion_tokens_details" in _u && typeof _u.completion_tokens_details === "object" && _u.completion_tokens_details !== null) {`,
        `        const _ctd: object = _u.completion_tokens_details;`,
        `        if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `        else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `      } else if ("output_token_details" in _u && typeof _u.output_token_details === "object" && _u.output_token_details !== null) {`,
        `        const _otd: object = _u.output_token_details;`,
        `        if ("reasoning" in _otd && typeof _otd.reasoning === "number") _reas = _otd.reasoning;`,
        `        else if ("reasoning_tokens" in _otd && typeof _otd.reasoning_tokens === "number") _reas = _otd.reasoning_tokens;`,
        `      }`,
        `      if (_reas === 0 && _rm) {`,
        `        if ("usage" in _rm && typeof _rm.usage === "object" && _rm.usage !== null) {`,
        `          const _rmu: object = _rm.usage;`,
        `          if ("completion_tokens_details" in _rmu && typeof _rmu.completion_tokens_details === "object" && _rmu.completion_tokens_details !== null) {`,
        `            const _ctd: object = _rmu.completion_tokens_details;`,
        `            if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `            else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `          } else if ("reasoning_tokens" in _rmu && typeof _rmu.reasoning_tokens === "number") {`,
        `            _reas = _rmu.reasoning_tokens;`,
        `          }`,
        `        } else if ("completion_tokens_details" in _rm && typeof _rm.completion_tokens_details === "object" && _rm.completion_tokens_details !== null) {`,
        `          const _ctd: object = _rm.completion_tokens_details;`,
        `          if ("reasoning_tokens" in _ctd && typeof _ctd.reasoning_tokens === "number") _reas = _ctd.reasoning_tokens;`,
        `          else if ("reasoning" in _ctd && typeof _ctd.reasoning === "number") _reas = _ctd.reasoning;`,
        `        }`,
        `      }`,
        `      ${outputVariable}Usage.input_tokens = _in;`,
        `      ${outputVariable}Usage.output_tokens = _out;`,
        `      ${outputVariable}Usage.total_tokens = _tot;`,
        `      ${outputVariable}Usage.reasoning_tokens = _reas;`,
        `    }`,
        `  }`,
        `}`,
        `if (typeof res?.setHeader === "function") {`,
        `  res.setHeader("X-Input-Tokens", String(${outputVariable}Usage.input_tokens));`,
        `  res.setHeader("X-Output-Tokens", String(${outputVariable}Usage.output_tokens));`,
        `  res.setHeader("X-Total-Tokens", String(${outputVariable}Usage.total_tokens));`,
        `  if (${outputVariable}Usage.reasoning_tokens > 0) {`,
        `    res.setHeader("X-Reasoning-Tokens", String(${outputVariable}Usage.reasoning_tokens));`,
        `  }`,
        `}`,
      );
    }

    if (langGraphOutputMode === "last_message") {
      rawLines.push(
        `let ${outputVariable}Content = Array.isArray(${outputVariable}Raw?.messages) && ${outputVariable}Raw.messages.length > 0`,
        `  ? ${outputVariable}Raw.messages[${outputVariable}Raw.messages.length - 1]?.content ?? ${outputVariable}Raw`,
        `  : ${outputVariable}Raw;`,
        `if (typeof ${outputVariable}Content === "object" && ${outputVariable}Content !== null && "kwargs" in ${outputVariable}Content && typeof ${outputVariable}Content.kwargs === "object" && ${outputVariable}Content.kwargs !== null && "content" in ${outputVariable}Content.kwargs && typeof ${outputVariable}Content.kwargs.content === "string") {`,
        `  ${outputVariable}Content = ${outputVariable}Content.kwargs.content;`,
        `}`,
        `if (typeof ${outputVariable}Content === "string" && ${outputVariable}Content.startsWith("{")) {`,
        `  try {`,
        `    const _parsedMsg = JSON.parse(${outputVariable}Content);`,
        `    if (typeof _parsedMsg === "object" && _parsedMsg !== null) {`,
        `      if ("kwargs" in _parsedMsg && typeof _parsedMsg.kwargs === "object" && _parsedMsg.kwargs !== null && "content" in _parsedMsg.kwargs && typeof _parsedMsg.kwargs.content === "string") {`,
        `        ${outputVariable}Content = _parsedMsg.kwargs.content;`,
        `      } else if ("content" in _parsedMsg && typeof _parsedMsg.content === "string") {`,
        `        ${outputVariable}Content = _parsedMsg.content;`,
        `      }`,
        `    }`,
        `  } catch {}`,
        `}`,
      );
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `const ${outputVariable} = typeof ${outputVariable}Content === "object" && ${outputVariable}Content !== null`,
          `  ? { ...${outputVariable}Content, usage: ${outputVariable}Usage }`,
          `  : { response: ${outputVariable}Content, content: ${outputVariable}Content, usage: ${outputVariable}Usage };`,
        );
      } else {
        rawLines.push(
          `const ${outputVariable} = ${outputVariable}Content;`,
        );
      }
    } else if (
      langGraphOutputMode === "specific_fields" &&
      langGraphOutputFields.length > 0
    ) {
      const fieldPicks = langGraphOutputFields
        .map((f) => `  ${JSON.stringify(f)}: ${outputVariable}Raw?.${f},`)
        .join("\n");
      rawLines.push(`const ${outputVariable} = {\n${fieldPicks}${langGraphTrackTokenUsage ? `\n  usage: ${outputVariable}Usage,` : ""}\n};`);
    } else {
      rawLines.push(
        `const ${outputVariable}Messages = Array.isArray(${outputVariable}Raw?.messages) ? ${outputVariable}Raw.messages : [];`,
        `const ${outputVariable}LastMsg = ${outputVariable}Messages.length > 0 ? ${outputVariable}Messages[${outputVariable}Messages.length - 1] : undefined;`,
        `let ${outputVariable}Response: string = (typeof ${outputVariable}LastMsg === "object" && ${outputVariable}LastMsg !== null) ? (("content" in ${outputVariable}LastMsg && typeof ${outputVariable}LastMsg.content === "string") ? ${outputVariable}LastMsg.content : (("kwargs" in ${outputVariable}LastMsg && typeof ${outputVariable}LastMsg.kwargs === "object" && ${outputVariable}LastMsg.kwargs !== null && "content" in ${outputVariable}LastMsg.kwargs && typeof ${outputVariable}LastMsg.kwargs.content === "string") ? ${outputVariable}LastMsg.kwargs.content : (typeof ${outputVariable}LastMsg === "string" ? ${outputVariable}LastMsg : ""))) : (typeof ${outputVariable}LastMsg === "string" ? ${outputVariable}LastMsg : (typeof ${outputVariable}Raw === "string" ? ${outputVariable}Raw : ""));`,
        `if (typeof ${outputVariable}Response === "string" && ${outputVariable}Response.startsWith("{")) {`,
        `  try {`,
        `    const _parsedMsg = JSON.parse(${outputVariable}Response);`,
        `    if (typeof _parsedMsg === "object" && _parsedMsg !== null) {`,
        `      if ("kwargs" in _parsedMsg && typeof _parsedMsg.kwargs === "object" && _parsedMsg.kwargs !== null && "content" in _parsedMsg.kwargs && typeof _parsedMsg.kwargs.content === "string") {`,
        `        ${outputVariable}Response = _parsedMsg.kwargs.content;`,
        `      } else if ("content" in _parsedMsg && typeof _parsedMsg.content === "string") {`,
        `        ${outputVariable}Response = _parsedMsg.content;`,
        `      }`,
        `    }`,
        `  } catch {}`,
        `}`,
        `const ${outputVariable} = {`,
        `  ...${outputVariable}Raw,`,
        `  response: ${outputVariable}Response,`,
        `  content: ${outputVariable}Response,`,
        `  threadId: ${threadIdExpr || "undefined"},`,
        `  state: ${outputVariable}Raw,${langGraphTrackTokenUsage ? `\n  usage: ${outputVariable}Usage,` : ""}
};`,
      );
    }
  }

  return rawLines;
}
