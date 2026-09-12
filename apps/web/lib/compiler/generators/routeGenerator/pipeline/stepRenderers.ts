import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "./types";
import { buildArgList, resolveBinding, resolveSource } from "./sourceResolver";
import { compileConditionExpr } from "./conditionCompiler";

/**
 * Renders a "transform" pipeline step (pure synchronous function call).
 */
export function renderTransformStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { outputVariable, functionRef, inputBindings = [] } = step;
  if (!functionRef) {
    return [`// [pipeline] step "${step.name}": missing functionRef`];
  }
  const args = buildArgList(inputBindings, ctx);
  const isMultiLine = args.includes("\n");
  if (isMultiLine) {
    return [
      `const ${outputVariable} = ${functionRef.name}(`,
      ...args.split("\n").map((l) => `  ${l}`),
      `);`,
    ];
  }
  const callExpr = args ? `${functionRef.name}(${args})` : `${functionRef.name}()`;
  return [`const ${outputVariable} = ${callExpr};`];
}

/**
 * Renders an async operation step (DB operation, Redis operation, or service call).
 */
export function renderAsyncOperationStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { outputVariable, functionRef, inputBindings = [], type } = step;
  if (!functionRef) {
    return [`// [pipeline] step "${step.name}": missing functionRef`];
  }
  const rawLines: string[] = [];
  const args = buildArgList(inputBindings, ctx);
  const isMultiLine = args.includes("\n");
  if (isMultiLine) {
    rawLines.push(`const ${outputVariable} = await ${functionRef.name}(`);
    args.split("\n").forEach((l) => rawLines.push(`  ${l}`));
    rawLines.push(`);`);
  } else {
    const callExpr = args
      ? `await ${functionRef.name}(${args})`
      : `await ${functionRef.name}()`;
    rawLines.push(`const ${outputVariable} = ${callExpr};`);
  }

  // DB reads by ID get a 404 guard
  if (
    type === "db_operation" &&
    (functionRef.name.toLowerCase().includes("byid") ||
      functionRef.name.toLowerCase().includes("findone"))
  ) {
    rawLines.push(`if (${outputVariable} === undefined || ${outputVariable} === null) {`);
    rawLines.push(`  return res.status(404).json({ error: "Not found" });`);
    rawLines.push(`}`);
  }

  return rawLines;
}

/**
 * Renders an external API call step (3rd-party SaaS / REST endpoint).
 */
export function renderExternalCallStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { outputVariable, functionRef, inputBindings = [] } = step;
  if (functionRef) {
    const args = buildArgList(inputBindings, ctx);
    const isMultiLine = args.includes("\n");
    if (isMultiLine) {
      return [
        `const ${outputVariable} = await ${functionRef.name}(`,
        ...args.split("\n").map((l) => `  ${l}`),
        `);`,
      ];
    }
    const callExpr = args
      ? `await ${functionRef.name}(${args})`
      : `await ${functionRef.name}()`;
    return [`const ${outputVariable} = ${callExpr};`];
  }

  // Direct fetch call when no custom functionRef is configured
  const rawLines: string[] = [];
  const endpointPath = step.operationId?.includes("_")
    ? step.operationId.substring(step.operationId.indexOf("_") + 1)
    : "/";
  const method = step.operationId?.includes("_")
    ? step.operationId.substring(0, step.operationId.indexOf("_"))
    : "POST";
  const bodyBinding = inputBindings.find(
    (b) => b.argName === "body" || b.argName === "data" || b.argName === "payload",
  );
  const bodyExpr = bodyBinding ? resolveBinding(bodyBinding, ctx) : null;
  const headerBindings = inputBindings.filter((b) =>
    ["authorization", "token", "apikey", "api-key", "x-api-key"].includes(
      b.argName.toLowerCase(),
    ) || b.argName.toLowerCase().startsWith("x-"),
  );
  const nonBodyNonHeaderBindings = inputBindings.filter(
    (b) => b !== bodyBinding && !headerBindings.includes(b),
  );
  const payloadExpr =
    bodyExpr || (nonBodyNonHeaderBindings.length > 0 ? buildArgList(nonBodyNonHeaderBindings, ctx) : null);

  rawLines.push(`// External API Call: ${step.name || "external_call"}`);
  rawLines.push(`let ${outputVariable}: Record<string, string | number | boolean | null> | null = null;`);
  rawLines.push(`let ${outputVariable}Error: Record<string, string | number | boolean | null> | null = null;`);
  rawLines.push(`try {`);
  rawLines.push(
    `  const ${outputVariable}Response = await fetch(\`\${process.env.EXTERNAL_API_BASE_URL || ""}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}\`, {`,
  );
  rawLines.push(`    method: "${method.toUpperCase()}",`);
  if (headerBindings.length > 0) {
    rawLines.push(`    headers: {`);
    rawLines.push(`      "Content-Type": "application/json",`);
    headerBindings.forEach((hb) => {
      rawLines.push(`      "${hb.argName}": ${resolveBinding(hb, ctx)},`);
    });
    rawLines.push(`    },`);
  } else {
    rawLines.push(`    headers: { "Content-Type": "application/json" },`);
  }
  if (payloadExpr && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
    rawLines.push(`    body: JSON.stringify(${payloadExpr}),`);
  }
  rawLines.push(`  });`);
  rawLines.push(`  if (!${outputVariable}Response.ok) {`);
  rawLines.push(`    try { ${outputVariable}Error = await ${outputVariable}Response.json(); } catch { ${outputVariable}Error = { error: ${outputVariable}Response.statusText, statusCode: ${outputVariable}Response.status }; }`);
  rawLines.push(`  } else {`);
  rawLines.push(`    ${outputVariable} = await ${outputVariable}Response.json();`);
  rawLines.push(`  }`);
  rawLines.push(`} catch (fetchErr) {`);
  rawLines.push(`  ${outputVariable}Error = { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr), statusCode: 500 };`);
  rawLines.push(`  logger.error("External call ${step.name || "external_call"} failed:", fetchErr);`);
  rawLines.push(`}`);
  return rawLines;
}

/**
 * Renders a Kafka publisher pipeline step.
 */
export function renderKafkaPublishStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { outputVariable, functionRef, inputBindings = [] } = step;
  if (!functionRef) {
    return [`// [pipeline] step "${step.name}": missing functionRef`];
  }
  const rawLines: string[] = [];
  const isGeneric = functionRef.name === "publishKafkaEvent";
  const topicBinding = inputBindings.find((b) => b.argName === "topic");
  const keyBinding = inputBindings.find((b) => b.argName === "key");

  // Determine if an explicit spread base was specified (e.g. "_spread" or whole-payload binding alongside discrete fields)
  const spreadBinding = inputBindings.find(
    (b) =>
      b.argName === "_spread" ||
      b.argName === "..." ||
      ((b.argName === "payload" || b.argName === "data") &&
        (!b.source || !("field" in b.source) || !b.source.field || b.source.field.trim() === "") &&
        inputBindings.some(
          (other) =>
            other !== b &&
            other.argName !== "topic" &&
            other.argName !== "key" &&
            other.argName !== "_spread" &&
            other.argName !== "...",
        )),
  );

  // Field bindings are all non-topic, non-key bindings (excluding the spread binding)
  const fieldBindings = inputBindings.filter(
    (b) => b.argName !== "topic" && b.argName !== "key" && b !== spreadBinding,
  );

  const topicExpr = topicBinding
    ? resolveBinding(topicBinding, ctx)
    : JSON.stringify(step.name || "default-topic");

  let payloadExpr: string;
  const firstField = fieldBindings[0];
  const firstFieldSourceField = firstField?.source && "field" in firstField.source ? firstField.source.field : undefined;
  if (
    fieldBindings.length === 1 &&
    firstField &&
    !spreadBinding &&
    (!firstFieldSourceField || firstFieldSourceField.trim() === "") &&
    (firstField.argName === "payload" ||
      firstField.argName === "data" ||
      firstField.argName === "message")
  ) {
    payloadExpr = resolveBinding(firstField, ctx);
  } else if (fieldBindings.length > 0 || spreadBinding) {
    const fieldsStr = fieldBindings
      .map((b) => `    ${b.argName}: ${resolveBinding(b, ctx)},`)
      .join("\n");
    if (spreadBinding) {
      const baseExpr = resolveBinding(spreadBinding, ctx);
      payloadExpr = fieldsStr
        ? `{\n    ...${baseExpr},\n${fieldsStr}\n  }`
        : `{\n    ...${baseExpr}\n  }`;
    } else {
      payloadExpr = `{\n${fieldsStr}\n  }`;
    }
  } else {
    payloadExpr = "{}";
  }

  const keyExpr = keyBinding ? resolveBinding(keyBinding, ctx) : null;

  rawLines.push(`const ${outputVariable} = await ${functionRef.name}(`);
  if (isGeneric) {
    rawLines.push(`  ${topicExpr},`);
  }
  rawLines.push(`  ${payloadExpr}${keyExpr ? `,` : ""}`);
  if (keyExpr) {
    rawLines.push(`  ${keyExpr},`);
  }
  rawLines.push(`);`);
  return rawLines;
}

/**
 * Renders an inlined custom TypeScript code block.
 */
export function renderCustomCodeStep(step: PipelineStep): string[] {
  const { customCode, name } = step;
  if (customCode && customCode.trim()) {
    return customCode.split("\n");
  }
  return [`// [pipeline] custom_code step "${name}" has no code`];
}

/**
 * Renders control-flow steps (condition, try_catch, switch, parallel, loop).
 */
export function renderControlFlowStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
  renderNested: (steps: PipelineStep[], ctx: PipelineRenderContext) => string[],
): string[] {
  const rawLines: string[] = [];
  const { type, outputVariable } = step;

  switch (type) {
    case "condition": {
      const condStr = compileConditionExpr(step.conditionExpr, ctx);
      rawLines.push(`if (${condStr}) {`);
      if (step.thenSteps && step.thenSteps.length > 0) {
        const thenLines = renderNested(step.thenSteps, ctx);
        thenLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      if (step.elseSteps && step.elseSteps.length > 0) {
        rawLines.push(`} else {`);
        const elseLines = renderNested(step.elseSteps, ctx);
        elseLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      rawLines.push(`}`);
      break;
    }

    case "try_catch": {
      rawLines.push(`try {`);
      if (step.trySteps && step.trySteps.length > 0) {
        const tryLines = renderNested(step.trySteps, ctx);
        tryLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      rawLines.push(`} catch (caughtError) {`);
      if (step.catchSteps && step.catchSteps.length > 0) {
        const catchLines = renderNested(step.catchSteps, ctx);
        catchLines.forEach((l) => rawLines.push(`  ${l}`));
      } else {
        rawLines.push(`  logger.error("Error in try_catch block:", caughtError);`);
      }
      rawLines.push(`}`);
      break;
    }

    case "switch": {
      const switchTarget = resolveSource(step.switchSource, ctx);
      rawLines.push(`switch (${switchTarget}) {`);
      if (step.switchCases && step.switchCases.length > 0) {
        step.switchCases.forEach((c) => {
          const valStr = typeof c.value === "string" ? JSON.stringify(c.value) : String(c.value);
          rawLines.push(`  case ${valStr}: {`);
          if (c.steps && c.steps.length > 0) {
            const caseLines = renderNested(c.steps, ctx);
            caseLines.forEach((l) => rawLines.push(`    ${l}`));
          }
          rawLines.push(`    break;`);
          rawLines.push(`  }`);
        });
      }
      if (step.switchDefault && step.switchDefault.length > 0) {
        rawLines.push(`  default: {`);
        const defaultLines = renderNested(step.switchDefault, ctx);
        defaultLines.forEach((l) => rawLines.push(`    ${l}`));
        rawLines.push(`    break;`);
        rawLines.push(`  }`);
      }
      rawLines.push(`}`);
      break;
    }

    case "parallel": {
      const outVar = outputVariable || `parallelResults`;
      const isSettled = step.failureMode === "any";
      const promiseMethod = isSettled ? "Promise.allSettled" : "Promise.all";
      const branches = step.parallelBranches || [];

      if (branches.length === 0) {
        rawLines.push(`const ${outVar} = await ${promiseMethod}([]);`);
      } else {
        rawLines.push(`const ${outVar} = await ${promiseMethod}([`);
        branches.forEach((b) => {
          rawLines.push(`  (async () => {`);
          if (b.label) rawLines.push(`    // Branch: ${b.label}`);
          if (b.steps && b.steps.length > 0) {
            const bLines = renderNested(b.steps, ctx);
            bLines.forEach((l) => rawLines.push(`    ${l}`));
          }
          rawLines.push(`  })(),`);
        });
        rawLines.push(`]);`);
      }
      break;
    }

    case "loop": {
      const outVar = outputVariable || `loopResults`;
      const loopTarget = resolveSource(step.loopSource, ctx);
      const iterVar = step.iteratorVariable || "item";

      rawLines.push(`const ${outVar} = await Promise.all(`);
      rawLines.push(`  (Array.isArray(${loopTarget}) ? ${loopTarget} : []).map(async (${iterVar}) => {`);
      if (step.loopBody && step.loopBody.length > 0) {
        const loopLines = renderNested(step.loopBody, ctx);
        loopLines.forEach((l) => rawLines.push(`    ${l}`));
      }
      rawLines.push(`  })`);
      rawLines.push(`);`);
      break;
    }
  }

  return rawLines;
}

/**
 * Renders response-emitting steps (early_return and return_response).
 */
export function renderResponseStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const { inputBindings = [], statusCode: rawStatusCode } = step;
  const statusCode = rawStatusCode || 200;
  const firstBinding = inputBindings[0];

  if (
    inputBindings.length === 1 &&
    firstBinding &&
    (firstBinding.argName === "data" ||
      firstBinding.argName === "_spread" ||
      !firstBinding.argName)
  ) {
    const expr = resolveBinding(firstBinding, ctx);
    return [`return res.status(${statusCode}).json(${expr});`];
  }

  if (inputBindings.length > 0) {
    const fields = inputBindings
      .map((b) => `  ${b.argName}: ${resolveBinding(b, ctx)}`)
      .join(",\n");
    return [`return res.status(${statusCode}).json({\n${fields}\n});`];
  }

  const defaultMsg = step.type === "early_return" ? "Early return" : "Success";
  return [`return res.status(${statusCode}).json({ message: "${defaultMsg}" });`];
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
    langGraphStreamingEnabled,
    langGraphStreamingFields = [],
    langGraphOutputMode = "full_state",
    langGraphOutputFields = [],
    langGraphTargetNodeId,
  } = step;

  const rawLines: string[] = [];
  const graphVar =
    functionRef?.name ||
    (langGraphTargetNodeId
      ? `${langGraphTargetNodeId.replace(/[^a-zA-Z0-9]/g, "")}Graph`
      : "agentGraph");

  // Build state input object
  const stateFields: string[] = [];

  if (inputBindings.length > 0) {
    for (const b of inputBindings) {
      if (b.argName) {
        stateFields.push(`  ${JSON.stringify(b.argName)}: ${resolveBinding(b, ctx)},`);
      }
    }
  } else if (langGraphStateMapping && Object.keys(langGraphStateMapping).length > 0) {
    for (const [key, path] of Object.entries(langGraphStateMapping)) {
      if (!path) continue;
      let accessor: string;
      if (path.startsWith("headers.")) {
        accessor = `req.headers["${path.slice(8)}"]`;
      } else if (path.startsWith("body.")) {
        accessor = `${ctx.bodyVar}.${path.slice(5)}`;
      } else if (path.startsWith("params.")) {
        accessor = `req.params.${path.slice(7)}`;
      } else if (path.startsWith("query.")) {
        accessor = `req.query.${path.slice(6)}`;
      } else if (path === "body") {
        accessor = ctx.bodyVar;
      } else if (path === "headers") {
        accessor = "req.headers";
      } else if (path === "params") {
        accessor = "req.params";
      } else if (path === "query") {
        accessor = "req.query";
      } else {
        accessor = `${ctx.bodyVar}?.${path}`;
      }
      stateFields.push(`  ${JSON.stringify(key)}: ${accessor},`);
    }
  } else {
    stateFields.push(
      `  messages: ${ctx.bodyVar}?.messages ?? [{ role: "user", content: ${ctx.bodyVar}?.message ?? (typeof ${ctx.bodyVar} === "string" ? ${ctx.bodyVar} : JSON.stringify(${ctx.bodyVar})) }],`,
    );
  }

  const stateInit =
    stateFields.length > 0
      ? `{\n${stateFields.join("\n")}\n}`
      : `{ messages: [{ role: "user", content: "hello" }] }`;

  if (langGraphStreamingEnabled) {
    rawLines.push(`// --- LangGraph Streaming Invocation (${step.name}) ---`);
    rawLines.push(`const agentState = ${stateInit};`);
    rawLines.push(`res.setHeader("Content-Type", "text/event-stream");`);
    rawLines.push(`res.setHeader("Cache-Control", "no-cache");`);
    rawLines.push(`res.setHeader("Connection", "keep-alive");`);
    rawLines.push(
      `const stream = await ${graphVar}.stream(agentState, { streamMode: "messages" });`,
    );
    rawLines.push(`for await (const chunk of stream) {`);
    rawLines.push(
      `  const [messageChunk, metadata] = Array.isArray(chunk) ? chunk : [chunk, undefined];`,
    );
    rawLines.push(
      `  const token = messageChunk?.content ?? (typeof chunk === "string" ? chunk : (chunk as { content?: string })?.content ?? chunk);`,
    );
    rawLines.push(
      `  const nodeName = (metadata as { langgraph_node?: string } | undefined)?.langgraph_node;`,
    );
    if (langGraphStreamingFields.length > 0) {
      const allowedFields = JSON.stringify(langGraphStreamingFields);
      rawLines.push(`  if (${allowedFields}.includes(nodeName || "")) {`);
      rawLines.push(`    if (token !== undefined && token !== "") {`);
      rawLines.push(
        `      res.write(\`data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);`,
      );
      rawLines.push(`    }`);
      rawLines.push(`  }`);
    } else {
      rawLines.push(`  if (token !== undefined && token !== "") {`);
      rawLines.push(
        `    res.write(\`data: \${JSON.stringify({ token, node: nodeName })}\\n\\n\`);`,
      );
      rawLines.push(`  }`);
    }
    rawLines.push(`}`);
    rawLines.push(`res.write("data: [DONE]\\n\\n");`);
    rawLines.push(`res.end();`);
  } else {
    rawLines.push(`// --- LangGraph Invocation (${step.name}) ---`);
    rawLines.push(`const agentState = ${stateInit};`);
    rawLines.push(`const ${outputVariable}Raw = await ${graphVar}.invoke(agentState);`);

    if (langGraphOutputMode === "last_message") {
      rawLines.push(
        `const ${outputVariable} = Array.isArray(${outputVariable}Raw?.messages) && ${outputVariable}Raw.messages.length > 0`,
      );
      rawLines.push(
        `  ? ${outputVariable}Raw.messages[${outputVariable}Raw.messages.length - 1]?.content ?? ${outputVariable}Raw`,
      );
      rawLines.push(`  : ${outputVariable}Raw;`);
    } else if (
      langGraphOutputMode === "specific_fields" &&
      langGraphOutputFields.length > 0
    ) {
      const fieldPicks = langGraphOutputFields
        .map((f) => `  ${JSON.stringify(f)}: ${outputVariable}Raw?.${f},`)
        .join("\n");
      rawLines.push(`const ${outputVariable} = {\n${fieldPicks}\n};`);
    } else {
      rawLines.push(`const ${outputVariable} = ${outputVariable}Raw;`);
    }
  }

  return rawLines;
}

/**
 * Renders a push_to_client pipeline step (delivering real-time events via SSE, WebSocket, WebRTC, or Webhook).
 */
export function renderPushToClientStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const {
    inputBindings = [],
    clientDeliveryProtocol = "SSE",
    clientDeliveryEventName,
    outputVariable = "deliveryResult",
  } = step;
  const eventName = clientDeliveryEventName || "message";

  const spreadBinding = inputBindings.find(
    (b) =>
      b.argName === "_spread" ||
      b.argName === "..." ||
      ((b.argName === "payload" || b.argName === "data") &&
        (!b.source || !("field" in b.source) || !b.source.field || b.source.field.trim() === "") &&
        inputBindings.some(
          (other) =>
            other !== b &&
            other.argName !== "_spread" &&
            other.argName !== "...",
        )),
  );

  const fieldBindings = inputBindings.filter((b) => b !== spreadBinding);

  let payloadExpr: string;
  const firstClientField = fieldBindings[0];
  const firstClientFieldSourceField = firstClientField?.source && "field" in firstClientField.source ? firstClientField.source.field : undefined;
  if (
    fieldBindings.length === 1 &&
    firstClientField &&
    !spreadBinding &&
    (!firstClientFieldSourceField || firstClientFieldSourceField.trim() === "") &&
    (firstClientField.argName === "payload" ||
      firstClientField.argName === "data" ||
      firstClientField.argName === "message")
  ) {
    payloadExpr = resolveBinding(firstClientField, ctx);
  } else if (fieldBindings.length > 0 || spreadBinding) {
    const fieldsStr = fieldBindings
      .map((b) => `    ${b.argName}: ${resolveBinding(b, ctx)},`)
      .join("\n");
    if (spreadBinding) {
      const baseExpr = resolveBinding(spreadBinding, ctx);
      payloadExpr = fieldsStr
        ? `{\n    ...${baseExpr},\n${fieldsStr}\n  }`
        : `{\n    ...${baseExpr}\n  }`;
    } else {
      payloadExpr = `{\n${fieldsStr}\n  }`;
    }
  } else {
    payloadExpr = ctx.bodyVar || "{}";
  }

  const rawLines: string[] = [];
  if (clientDeliveryProtocol === "SSE") {
    rawLines.push(`// --- Push to Client via Server-Sent Events (SSE) ---`);
    rawLines.push(`sseBroadcast(${JSON.stringify(eventName)}, ${payloadExpr});`);
  } else if (clientDeliveryProtocol === "WEBSOCKET") {
    const roomParam = step.clientDeliveryRoom ? `, ${JSON.stringify(step.clientDeliveryRoom)}` : "";
    rawLines.push(`// --- Push to Client via WebSocket ---`);
    rawLines.push(`wsBroadcast(${JSON.stringify(eventName)}, ${payloadExpr}${roomParam});`);
  } else if (clientDeliveryProtocol === "API_PUSH") {
    const url = JSON.stringify(step.clientDeliveryWebhookUrl || "https://example.com/webhook");
    const method = JSON.stringify(step.clientDeliveryWebhookMethod || "POST");
    rawLines.push(`// --- Push to Client via Outbound Webhook ---`);
    rawLines.push(`await fetch(${url}, {`);
    rawLines.push(`  method: ${method},`);
    rawLines.push(`  headers: { "Content-Type": "application/json" },`);
    rawLines.push(`  body: JSON.stringify(${payloadExpr}),`);
    rawLines.push(`});`);
  } else {
    rawLines.push(`// --- Push to Client via WebRTC Data Channel ---`);
    rawLines.push(`webrtcBroadcast(${JSON.stringify(eventName)}, ${payloadExpr});`);
  }

  if (outputVariable) {
    rawLines.push(
      `const ${outputVariable} = { delivered: true, event: ${JSON.stringify(eventName)} };`,
    );
  }

  return rawLines;
}

