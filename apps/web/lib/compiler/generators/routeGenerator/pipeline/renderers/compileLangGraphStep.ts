// ═══════════════════════════════════════════════════════════════
// MODULE: LangGraphStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  LangGraph agent invocations (buffered or SSE streaming)
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "../types";
import { resolveBinding } from "../sourceResolver";
import { toVarName } from "../../../../utils";

function isBlankOrQuotes(val: unknown): boolean {
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
        `  ...${messagesVarName}Raw.map((m: any) => {`,
        `    if (typeof m === "string") return new HumanMessage(m);`,
        `    const content = m?.content ?? (typeof m === "object" ? JSON.stringify(m) : String(m ?? ""));`,
        `    if (m?.role === "system") return new SystemMessage(content);`,
        `    if (m?.role === "assistant" || m?.role === "ai") return new AIMessage(content);`,
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
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };`,
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
      rawLines.push(`  let payload: any = chunk;`);
      rawLines.push(`  // Cast to any[] to avoid TypeScript strict tuple-length narrowing errors`);
      rawLines.push(`  // (e.g. when subgraphs:true yields [namespace, mode, data] 3-tuples)`);
      rawLines.push(`  const _c = chunk as any[];`);
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
      rawLines.push(`      if (!reasoningToken && messageChunk.additional_kwargs) {`);
      rawLines.push(`        const kw = messageChunk.additional_kwargs as Record<string, any>;`);
      rawLines.push(`        if (typeof kw.reasoning_content === "string") reasoningToken = kw.reasoning_content;`);
      rawLines.push(`        else if (typeof kw.thinking === "string") reasoningToken = kw.thinking;`);
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
          `    const _chunkUsage = (messageChunk as any)?.usage_metadata || (messageChunk as any)?.response_metadata?.token_usage;`,
          `    if (_chunkUsage) {`,
          `      const _in = Number(_chunkUsage.input_tokens ?? _chunkUsage.prompt_tokens ?? 0) || 0;`,
          `      const _out = Number(_chunkUsage.output_tokens ?? _chunkUsage.completion_tokens ?? 0) || 0;`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
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
        `    const _toolCalls = (messageChunk as any)?.tool_calls || (messageChunk as any)?.tool_call_chunks;`,
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
      rawLines.push(`  if (typeof (res as any).flush === "function") {`);
      rawLines.push(`    (res as any).flush();`);
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
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };`,
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
      rawLines.push(`  let payload: any = chunk;`);
      rawLines.push(`  // Cast to any[] to avoid TypeScript strict tuple-length narrowing errors`);
      rawLines.push(`  // (e.g. when subgraphs:true yields [namespace, mode, data] 3-tuples)`);
      rawLines.push(`  const _c = chunk as any[];`);
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
          `    const _chunkUsage = (messageChunk as any)?.usage_metadata || (messageChunk as any)?.response_metadata?.token_usage;`,
          `    if (_chunkUsage) {`,
          `      const _in = Number(_chunkUsage.input_tokens ?? _chunkUsage.prompt_tokens ?? 0) || 0;`,
          `      const _out = Number(_chunkUsage.output_tokens ?? _chunkUsage.completion_tokens ?? 0) || 0;`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
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
        `    const _wsToolCalls = (messageChunk as any)?.tool_calls || (messageChunk as any)?.tool_call_chunks;`,
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
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };`,
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
      rawLines.push(`  let payload: any = chunk;`);
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
          `    const _chunkUsage = (messageChunk as any)?.usage_metadata || (messageChunk as any)?.response_metadata?.token_usage;`,
          `    if (_chunkUsage) {`,
          `      const _in = Number(_chunkUsage.input_tokens ?? _chunkUsage.prompt_tokens ?? 0) || 0;`,
          `      const _out = Number(_chunkUsage.output_tokens ?? _chunkUsage.completion_tokens ?? 0) || 0;`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
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
        `    const _kafkaToolCalls = (messageChunk as any)?.tool_calls || (messageChunk as any)?.tool_call_chunks;`,
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
        `const ${stepPrefix}TokenUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };`,
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
      rawLines.push(`  let payload: any = chunk;`);
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
          `    const _chunkUsage = (messageChunk as any)?.usage_metadata || (messageChunk as any)?.response_metadata?.token_usage;`,
          `    if (_chunkUsage) {`,
          `      const _in = Number(_chunkUsage.input_tokens ?? _chunkUsage.prompt_tokens ?? 0) || 0;`,
          `      const _out = Number(_chunkUsage.output_tokens ?? _chunkUsage.completion_tokens ?? 0) || 0;`,
          `      if (_in > 0) ${stepPrefix}TokenUsage.input_tokens = _in;`,
          `      if (_out > 0) ${stepPrefix}TokenUsage.output_tokens = _out;`,
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
        `    const _redisToolCalls = (messageChunk as any)?.tool_calls || (messageChunk as any)?.tool_call_chunks;`,
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
          `await redisClient.xadd(${streamKeyExpr}, "*", "type", "usage", "input_tokens", String(${stepPrefix}TokenUsage.input_tokens), "output_tokens", String(${stepPrefix}TokenUsage.output_tokens), "total_tokens", String(${stepPrefix}TokenUsage.total_tokens), "done", "false");`,
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
        `const ${outputVariable}Usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };`,
        `if (${outputVariable}Raw && typeof ${outputVariable}Raw === "object") {`,
        `  const _rawMsgs = Array.isArray(${outputVariable}Raw.messages) ? ${outputVariable}Raw.messages : [];`,
        `  for (const _m of _rawMsgs) {`,
        `    const _u = _m?.usage_metadata || _m?.response_metadata?.token_usage || _m?.response_metadata?.usage;`,
        `    if (_u) {`,
        `      const _in = Number(_u.input_tokens ?? _u.prompt_tokens ?? 0) || 0;`,
        `      const _out = Number(_u.output_tokens ?? _u.completion_tokens ?? 0) || 0;`,
        `      const _tot = Number(_u.total_tokens ?? (_in + _out)) || (_in + _out);`,
        `      ${outputVariable}Usage.input_tokens += _in;`,
        `      ${outputVariable}Usage.output_tokens += _out;`,
        `      ${outputVariable}Usage.total_tokens += _tot;`,
        `    }`,
        `  }`,
        `  if (${outputVariable}Usage.total_tokens === 0 && (${outputVariable}Raw.usage || ${outputVariable}Raw.token_usage)) {`,
        `    const _u = ${outputVariable}Raw.usage || ${outputVariable}Raw.token_usage;`,
        `    const _in = Number(_u.input_tokens ?? _u.prompt_tokens ?? 0) || 0;`,
        `    const _out = Number(_u.output_tokens ?? _u.completion_tokens ?? 0) || 0;`,
        `    ${outputVariable}Usage.input_tokens = _in;`,
        `    ${outputVariable}Usage.output_tokens = _out;`,
        `    ${outputVariable}Usage.total_tokens = Number(_u.total_tokens ?? (_in + _out)) || (_in + _out);`,
        `  }`,
        `  ${outputVariable}Usage.inputTokens = ${outputVariable}Usage.input_tokens;`,
        `  ${outputVariable}Usage.outputTokens = ${outputVariable}Usage.output_tokens;`,
        `  ${outputVariable}Usage.totalTokens = ${outputVariable}Usage.total_tokens;`,
        `}`,
        `if (typeof res?.setHeader === "function") {`,
        `  res.setHeader("X-Input-Tokens", String(${outputVariable}Usage.input_tokens));`,
        `  res.setHeader("X-Output-Tokens", String(${outputVariable}Usage.output_tokens));`,
        `  res.setHeader("X-Total-Tokens", String(${outputVariable}Usage.total_tokens));`,
        `}`,
      );
    }

    if (langGraphOutputMode === "last_message") {
      if (langGraphTrackTokenUsage) {
        rawLines.push(
          `const ${outputVariable}Content = Array.isArray(${outputVariable}Raw?.messages) && ${outputVariable}Raw.messages.length > 0`,
          `  ? ${outputVariable}Raw.messages[${outputVariable}Raw.messages.length - 1]?.content ?? ${outputVariable}Raw`,
          `  : ${outputVariable}Raw;`,
          `const ${outputVariable} = typeof ${outputVariable}Content === "object" && ${outputVariable}Content !== null`,
          `  ? { ...${outputVariable}Content, usage: ${outputVariable}Usage }`,
          `  : { response: ${outputVariable}Content, content: ${outputVariable}Content, usage: ${outputVariable}Usage };`,
        );
      } else {
        rawLines.push(
          `const ${outputVariable} = Array.isArray(${outputVariable}Raw?.messages) && ${outputVariable}Raw.messages.length > 0`,
          `  ? ${outputVariable}Raw.messages[${outputVariable}Raw.messages.length - 1]?.content ?? ${outputVariable}Raw`,
          `  : ${outputVariable}Raw;`,
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
      );
      rawLines.push(
        `const ${outputVariable}LastMsg = ${outputVariable}Messages.length > 0 ? ${outputVariable}Messages[${outputVariable}Messages.length - 1] : undefined;`,
      );
      rawLines.push(
        `const ${outputVariable}Response = (typeof ${outputVariable}LastMsg === "object" && ${outputVariable}LastMsg !== null && "content" in ${outputVariable}LastMsg && ${outputVariable}LastMsg.content !== undefined ? (typeof ${outputVariable}LastMsg.content === "string" ? ${outputVariable}LastMsg.content : JSON.stringify(${outputVariable}LastMsg.content)) : undefined) ?? (typeof ${outputVariable}Raw === "string" ? ${outputVariable}Raw : "");`,
      );
      rawLines.push(`const ${outputVariable} = {
  ...${outputVariable}Raw,
  response: ${outputVariable}Response,
  content: ${outputVariable}Response,
  threadId: ${threadIdExpr || "undefined"},
  state: ${outputVariable}Raw,${langGraphTrackTokenUsage ? `\n  usage: ${outputVariable}Usage,` : ""}
};`);
    }
  }

  return rawLines;
}
