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
  const payloadBinding = inputBindings.find(
    (b) => b.argName === "payload" || b.argName === "message" || b.argName === "data",
  );
  const keyBinding = inputBindings.find((b) => b.argName === "key");

  const fieldBindings = inputBindings.filter(
    (b) =>
      b.argName !== "topic" &&
      b.argName !== "key" &&
      b.argName !== "payload" &&
      b.argName !== "message" &&
      b.argName !== "data",
  );

  const topicExpr = topicBinding
    ? resolveBinding(topicBinding, ctx)
    : JSON.stringify(step.name || "default-topic");

  let payloadExpr: string;
  if (fieldBindings.length > 0) {
    const fieldsStr = fieldBindings
      .map((b) => `    ${b.argName}: ${resolveBinding(b, ctx)},`)
      .join("\n");
    if (payloadBinding) {
      const baseExpr = resolveBinding(payloadBinding, ctx);
      payloadExpr = `{\n    ...${baseExpr},\n${fieldsStr}\n  }`;
    } else {
      payloadExpr = `{\n${fieldsStr}\n  }`;
    }
  } else if (payloadBinding) {
    payloadExpr = resolveBinding(payloadBinding, ctx);
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
