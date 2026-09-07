import {
  PipelineStep,
  PipelineStepInputBinding,
  PipelineStepInputSource,
  ConditionClause,
  ConditionExpr,
} from "@workspace/canvas/types";
import {
  compileTemplateString,
  compileJsonExpression,
} from "./jsonInterpolation";

/**
 * Context available while rendering a pipeline step sequence.
 * Tracks which output variables are declared by prior steps so
 * subsequent steps can reference them safely.
 */
export interface PipelineRenderContext {
  /** Map of stepId -> outputVariable name for all prior steps */
  priorOutputs: Map<string, string>;
  /** The validated body variable name (e.g. "body" or "req.body") */
  bodyVar: string;
}

/**
 * Resolves a single StepSource into a TypeScript expression string.
 */
export function resolveSource(
  source: PipelineStepInputSource | undefined,
  ctx: PipelineRenderContext,
): string {
  if (!source) return "undefined";

  switch (source.kind) {
    case "req_body": {
      const field = source.field ? source.field.trim() : "";
      return field ? `${ctx.bodyVar}.${field}` : ctx.bodyVar;
    }
    case "req_params": {
      const field = source.field ? source.field.trim() : "";
      return field ? `req.params.${field}` : "req.params";
    }
    case "req_query": {
      const field = source.field ? source.field.trim() : "";
      return field ? `req.query.${field}` : "req.query";
    }
    case "req_headers": {
      const field = source.field ? source.field.trim() : "";
      return field ? `(req.headers["${field}"] as string)` : "req.headers";
    }
    case "step_output": {
      if (source.stepId === "__catch_error__") {
        const field = source.field ? source.field.trim() : "";
        return field ? `caughtError.${field}` : "caughtError";
      }
      if (source.stepId.startsWith("__iterator__")) {
        const varName = source.stepId.replace("__iterator__", "") || "item";
        const field = source.field ? source.field.trim() : "";
        return field ? `${varName}.${field}` : varName;
      }
      const varName = ctx.priorOutputs.get(source.stepId);
      const field = source.field ? source.field.trim() : "";
      if (!varName) {
        const fallback = `/* step "${source.stepId}" not found */ undefined`;
        return field ? `${fallback}?.${field}` : fallback;
      }
      return field ? `${varName}.${field}` : varName;
    }
    case "inline": {
      const v = source.value;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      const str = String(v ?? "");
      if (!/\$\{([^}]+)\}/.test(str)) {
        return JSON.stringify(str);
      }
      const trimmed = str.trim();
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        return compileJsonExpression(str, ctx);
      }
      return compileTemplateString(str, ctx);
    }
    default:
      return "undefined";
  }
}

/**
 * Resolves a single InputBinding into a TypeScript expression string.
 */
export function resolveBinding(
  binding: PipelineStepInputBinding,
  ctx: PipelineRenderContext,
): string {
  return resolveSource(binding.source, ctx);
}

/**
 * Compiles a single ConditionClause into a TypeScript boolean expression string.
 */
export function compileConditionClause(
  clause: ConditionClause,
  ctx: PipelineRenderContext,
): string {
  const leftExpr = resolveSource(clause.left, ctx);
  const rightExpr = clause.right ? resolveSource(clause.right, ctx) : undefined;

  switch (clause.operator) {
    case "eq":
      return `(${leftExpr} === ${rightExpr ?? "undefined"})`;
    case "neq":
      return `(${leftExpr} !== ${rightExpr ?? "undefined"})`;
    case "gt":
      return `(${leftExpr} > ${rightExpr ?? "0"})`;
    case "gte":
      return `(${leftExpr} >= ${rightExpr ?? "0"})`;
    case "lt":
      return `(${leftExpr} < ${rightExpr ?? "0"})`;
    case "lte":
      return `(${leftExpr} <= ${rightExpr ?? "0"})`;
    case "truthy":
      return `Boolean(${leftExpr})`;
    case "falsy":
      return `!${leftExpr}`;
    case "exists":
      return `(${leftExpr} !== null && ${leftExpr} !== undefined)`;
    case "not_exists":
      return `(${leftExpr} === null || ${leftExpr} === undefined)`;
    case "contains":
      return `(Array.isArray(${leftExpr}) ? ${leftExpr}.includes(${rightExpr}) : typeof ${leftExpr} === "string" ? ${leftExpr}.includes(${rightExpr}) : false)`;
    case "starts_with":
      return `(typeof ${leftExpr} === "string" && ${leftExpr}.startsWith(${rightExpr ?? '""'}))`;
    case "ends_with":
      return `(typeof ${leftExpr} === "string" && ${leftExpr}.endsWith(${rightExpr ?? '""'}))`;
    default:
      return `Boolean(${leftExpr})`;
  }
}

/**
 * Compiles a ConditionExpr (including AND / OR / NOT chains) into a TypeScript expression.
 */
export function compileConditionExpr(
  expr: ConditionExpr | undefined,
  ctx: PipelineRenderContext,
): string {
  if (!expr) return "true";

  if ("and" in expr && Array.isArray(expr.and)) {
    if (expr.and.length === 0) return "true";
    return `(${expr.and.map((sub) => compileConditionExpr(sub, ctx)).join(" && ")})`;
  }

  if ("or" in expr && Array.isArray(expr.or)) {
    if (expr.or.length === 0) return "true";
    return `(${expr.or.map((sub) => compileConditionExpr(sub, ctx)).join(" || ")})`;
  }

  if ("not" in expr && expr.not) {
    return `(!${compileConditionExpr(expr.not, ctx)})`;
  }

  if ("left" in expr && "operator" in expr) {
    return compileConditionClause(expr as ConditionClause, ctx);
  }

  return "true";
}

/**
 * Builds the argument list for a function call expression from bindings.
 */
export function buildArgList(
  bindings: PipelineStepInputBinding[],
  ctx: PipelineRenderContext,
): string {
  if (bindings.length === 0) return "";

  // Positional mode: all argNames are numeric strings "0", "1", …
  const allPositional = bindings.every((b) => /^\d+$/.test(b.argName));
  if (allPositional) {
    return bindings
      .sort((a, b) => Number(a.argName) - Number(b.argName))
      .map((b) => resolveBinding(b, ctx))
      .join(", ");
  }

  // Spread-single mode: single binding with special argName "_spread"
  if (bindings.length === 1 && bindings[0]!.argName === "_spread") {
    return resolveBinding(bindings[0]!, ctx);
  }

  // Object-literal mode: build { argA: exprA, argB: exprB, ... }
  const fields = bindings
    .map((b) => `  ${b.argName}: ${resolveBinding(b, ctx)}`)
    .join(",\n");
  return `{\n${fields}\n}`;
}

/**
 * Helper to render nested sub-steps with context propagation.
 */
export function renderPipelineNested(
  steps: PipelineStep[],
  ctx: PipelineRenderContext,
): string[] {
  const lines: string[] = [];
  for (const step of steps) {
    if (step.enabled === false) continue;
    const stepLines = renderPipelineStep(step, ctx);
    lines.push(...stepLines);
    if (step.outputVariable && step.id) {
      ctx.priorOutputs.set(step.id, step.outputVariable);
    }
  }
  return lines;
}

/**
 * Renders a single pipeline step into one or more lines of TypeScript.
 *
 * @param step    - The pipeline step configuration
 * @param ctx     - Render context (prior outputs, body var name)
 * @returns       Array of code lines (without trailing newline)
 */
export function renderPipelineStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  if (step.enabled === false) return [];

  let rawLines: string[] = [];
  const { outputVariable, functionRef, inputBindings = [], type, customCode } = step;

  switch (type) {
    // -------------------------------------------------------------------------
    // Transform: pure function call
    // -------------------------------------------------------------------------
    case "transform": {
      if (!functionRef) {
        rawLines.push(`// [pipeline] step "${step.name}": missing functionRef`);
        break;
      }
      const args = buildArgList(inputBindings, ctx);
      const isMultiLine = args.includes("\n");
      if (isMultiLine) {
        rawLines.push(`const ${outputVariable} = ${functionRef.name}(`);
        args.split("\n").forEach((l) => rawLines.push(`  ${l}`));
        rawLines.push(`);`);
      } else {
        const callExpr = args ? `${functionRef.name}(${args})` : `${functionRef.name}()`;
        rawLines.push(`const ${outputVariable} = ${callExpr};`);
      }
      break;
    }

    // -------------------------------------------------------------------------
    // DB / Redis / Service call: async function call
    // -------------------------------------------------------------------------
    case "db_operation":
    case "redis_operation":
    case "service_call": {
      if (!functionRef) {
        rawLines.push(`// [pipeline] step "${step.name}": missing functionRef`);
        break;
      }
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
      break;
    }

    // -------------------------------------------------------------------------
    // External API Call: 3rd-party SaaS / REST endpoint
    // -------------------------------------------------------------------------
    case "external_call": {
      if (functionRef) {
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
        break;
      }

      // Direct fetch call when no custom functionRef is configured
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
      rawLines.push(`} catch (fetchErr: unknown) {`);
      rawLines.push(`  ${outputVariable}Error = { error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr), statusCode: 500 };`);
      rawLines.push(`  logger.error("External call ${step.name || "external_call"} failed:", fetchErr);`);
      rawLines.push(`}`);
      break;
    }

    // -------------------------------------------------------------------------
    // Kafka publish: no meaningful return value, but we still track the var
    // -------------------------------------------------------------------------
    case "kafka_publish": {
      if (!functionRef) {
        rawLines.push(`// [pipeline] step "${step.name}": missing functionRef`);
        break;
      }
      const isGeneric = functionRef.name === "publishKafkaEvent";
      const topicBinding = inputBindings.find((b) => b.argName === "topic");
      const payloadBinding = inputBindings.find(
        (b) => b.argName === "payload" || b.argName === "message" || b.argName === "data",
      );
      const keyBinding = inputBindings.find((b) => b.argName === "key");

      const topicExpr = topicBinding
        ? resolveBinding(topicBinding, ctx)
        : "/* topic */";
      const payloadExpr = payloadBinding
        ? resolveBinding(payloadBinding, ctx)
        : "/* payload */";
      const keyExpr = keyBinding ? resolveBinding(keyBinding, ctx) : null;

      rawLines.push(`const ${outputVariable} = await ${functionRef.name}(`);
      if (isGeneric || topicBinding) {
        rawLines.push(`  ${topicExpr},`);
      }
      rawLines.push(`  ${payloadExpr}${keyExpr ? `,` : ""}`);
      if (keyExpr) {
        rawLines.push(`  ${keyExpr},`);
      }
      rawLines.push(`);`);
      break;
    }

    // -------------------------------------------------------------------------
    // Custom code: inline the raw TypeScript block as-is
    // -------------------------------------------------------------------------
    case "custom_code": {
      if (customCode && customCode.trim()) {
        customCode.split("\n").forEach((l) => rawLines.push(l));
      } else {
        rawLines.push(`// [pipeline] custom_code step "${step.name}" has no code`);
      }
      break;
    }

    // -------------------------------------------------------------------------
    // Control Flow: Condition (if / else)
    // -------------------------------------------------------------------------
    case "condition": {
      const condStr = compileConditionExpr(step.conditionExpr, ctx);
      rawLines.push(`if (${condStr}) {`);
      if (step.thenSteps && step.thenSteps.length > 0) {
        const thenLines = renderPipelineNested(step.thenSteps, ctx);
        thenLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      if (step.elseSteps && step.elseSteps.length > 0) {
        rawLines.push(`} else {`);
        const elseLines = renderPipelineNested(step.elseSteps, ctx);
        elseLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      rawLines.push(`}`);
      break;
    }

    // -------------------------------------------------------------------------
    // Control Flow: Try / Catch
    // -------------------------------------------------------------------------
    case "try_catch": {
      rawLines.push(`try {`);
      if (step.trySteps && step.trySteps.length > 0) {
        const tryLines = renderPipelineNested(step.trySteps, ctx);
        tryLines.forEach((l) => rawLines.push(`  ${l}`));
      }
      rawLines.push(`} catch (caughtError) {`);
      if (step.catchSteps && step.catchSteps.length > 0) {
        const catchLines = renderPipelineNested(step.catchSteps, ctx);
        catchLines.forEach((l) => rawLines.push(`  ${l}`));
      } else {
        rawLines.push(`  logger.error("Error in try_catch block:", caughtError);`);
      }
      rawLines.push(`}`);
      break;
    }

    // -------------------------------------------------------------------------
    // Control Flow: Switch
    // -------------------------------------------------------------------------
    case "switch": {
      const switchTarget = resolveSource(step.switchSource, ctx);
      rawLines.push(`switch (${switchTarget}) {`);
      if (step.switchCases && step.switchCases.length > 0) {
        step.switchCases.forEach((c) => {
          const valStr = typeof c.value === "string" ? JSON.stringify(c.value) : String(c.value);
          rawLines.push(`  case ${valStr}: {`);
          if (c.steps && c.steps.length > 0) {
            const caseLines = renderPipelineNested(c.steps, ctx);
            caseLines.forEach((l) => rawLines.push(`    ${l}`));
          }
          rawLines.push(`    break;`);
          rawLines.push(`  }`);
        });
      }
      if (step.switchDefault && step.switchDefault.length > 0) {
        rawLines.push(`  default: {`);
        const defaultLines = renderPipelineNested(step.switchDefault, ctx);
        defaultLines.forEach((l) => rawLines.push(`    ${l}`));
        rawLines.push(`    break;`);
        rawLines.push(`  }`);
      }
      rawLines.push(`}`);
      break;
    }

    // -------------------------------------------------------------------------
    // Control Flow: Parallel (Promise.all / allSettled)
    // -------------------------------------------------------------------------
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
            const bLines = renderPipelineNested(b.steps, ctx);
            bLines.forEach((l) => rawLines.push(`    ${l}`));
          }
          rawLines.push(`  })(),`);
        });
        rawLines.push(`]);`);
      }
      break;
    }

    // -------------------------------------------------------------------------
    // Control Flow: Loop (Collection Iteration)
    // -------------------------------------------------------------------------
    case "loop": {
      const outVar = outputVariable || `loopResults`;
      const loopTarget = resolveSource(step.loopSource, ctx);
      const iterVar = step.iteratorVariable || "item";

      rawLines.push(`const ${outVar} = await Promise.all(`);
      rawLines.push(`  (Array.isArray(${loopTarget}) ? ${loopTarget} : []).map(async (${iterVar}) => {`);
      if (step.loopBody && step.loopBody.length > 0) {
        const loopLines = renderPipelineNested(step.loopBody, ctx);
        loopLines.forEach((l) => rawLines.push(`    ${l}`));
      }
      rawLines.push(`  })`);
      rawLines.push(`);`);
      break;
    }

    // -------------------------------------------------------------------------
    // Early Return: Mid-pipeline short-circuit
    // -------------------------------------------------------------------------
    case "early_return": {
      const statusCode = step.statusCode || 200;
      const firstBinding = inputBindings[0];
      if (
        inputBindings.length === 1 &&
        firstBinding &&
        (firstBinding.argName === "data" ||
          firstBinding.argName === "_spread" ||
          !firstBinding.argName)
      ) {
        const expr = resolveBinding(firstBinding, ctx);
        rawLines.push(`return res.status(${statusCode}).json(${expr});`);
      } else if (inputBindings.length > 0) {
        const fields = inputBindings
          .map((b) => `  ${b.argName}: ${resolveBinding(b, ctx)}`)
          .join(",\n");
        rawLines.push(`return res.status(${statusCode}).json({\n${fields}\n});`);
      } else {
        rawLines.push(
          `return res.status(${statusCode}).json({ message: "Early return" });`,
        );
      }
      break;
    }

    // -------------------------------------------------------------------------
    // Return Response: emit final HTTP response return statement
    // -------------------------------------------------------------------------
    case "return_response": {
      const statusCode = step.statusCode || 200;
      const firstBinding = inputBindings[0];
      if (
        inputBindings.length === 1 &&
        firstBinding &&
        (firstBinding.argName === "data" ||
          firstBinding.argName === "_spread" ||
          !firstBinding.argName)
      ) {
        const expr = resolveBinding(firstBinding, ctx);
        rawLines.push(`return res.status(${statusCode}).json(${expr});`);
      } else if (inputBindings.length > 0) {
        const fields = inputBindings
          .map((b) => `  ${b.argName}: ${resolveBinding(b, ctx)}`)
          .join(",\n");
        rawLines.push(`return res.status(${statusCode}).json({\n${fields}\n});`);
      } else {
        rawLines.push(
          `return res.status(${statusCode}).json({ message: "Success" });`,
        );
      }
      break;
    }

    default:
      rawLines.push(`// [pipeline] unknown step type "${type}"`);
  }

  // Wrap lines in onError handler if specified
  if (step.onError && rawLines.length > 0) {
    const onError = step.onError;
    const outVar = outputVariable;
    const safeStepName = (step.name || "step").replace(/"/g, '\\"');

    // 1. Handle retries if configured
    if (onError.retries && onError.retries > 0) {
      const stepKey = (step.id || "step").replace(/[^a-zA-Z0-9_]/g, "_");
      let transformedLines = rawLines;
      if (outVar) {
        transformedLines = rawLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        rawLines = [
          `let ${outVar}: Record<string, string | number | boolean | null> | null = null;`,
          `let attempts_${stepKey} = 0;`,
          `while (attempts_${stepKey} <= ${onError.retries}) {`,
          `  try {`,
          ...transformedLines.map((l) => `    ${l}`),
          `    break;`,
          `  } catch (retryErr) {`,
          `    attempts_${stepKey}++;`,
          `    if (attempts_${stepKey} > ${onError.retries}) throw retryErr;`,
          `    await new Promise((r) => setTimeout(r, 300));`,
          `  }`,
          `}`,
        ];
      } else {
        rawLines = [
          `let attempts_${stepKey} = 0;`,
          `while (attempts_${stepKey} <= ${onError.retries}) {`,
          `  try {`,
          ...rawLines.map((l) => `    ${l}`),
          `    break;`,
          `  } catch (retryErr) {`,
          `    attempts_${stepKey}++;`,
          `    if (attempts_${stepKey} > ${onError.retries}) throw retryErr;`,
          `    await new Promise((r) => setTimeout(r, 300));`,
          `  }`,
          `}`,
        ];
      }
    }

    // 2. Handle failure actions: early_return, fallback, ignore
    if (onError.action === "early_return") {
      rawLines = [
        `try {`,
        ...rawLines.map((l) => `  ${l}`),
        `} catch (stepErr: unknown) {`,
        `  logger.error("Step ${safeStepName} failed (early return):", stepErr);`,
        `  return res.status(${onError.statusCode || 502}).json({`,
        `    error: "${onError.errorMessage || `${safeStepName} execution failed`}",`,
        `    details: stepErr instanceof Error ? stepErr.message : String(stepErr),`,
        `    statusCode: ${onError.statusCode || 502},`,
        `  });`,
        `}`,
      ];
    } else if (onError.action === "fallback") {
      let transformedLines = rawLines;
      if (outVar) {
        transformedLines = rawLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        rawLines = [
          `let ${outVar}: Record<string, string | number | boolean | null> | null = null;`,
          `try {`,
          ...transformedLines.map((l) => `  ${l}`),
          `} catch (stepErr: unknown) {`,
          `  logger.warn("Step ${safeStepName} failed, using fallback value:", stepErr);`,
          `  ${outVar} = ${onError.fallbackValue || "null"};`,
          `}`,
        ];
      } else {
        rawLines = [
          `try {`,
          ...rawLines.map((l) => `  ${l}`),
          `} catch (stepErr) {`,
          `  logger.warn("Step ${safeStepName} failed, fallback applied:", stepErr);`,
          `}`,
        ];
      }
    } else if (onError.action === "ignore") {
      let transformedLines = rawLines;
      if (outVar) {
        transformedLines = rawLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        rawLines = [
          `let ${outVar}: Record<string, string | number | boolean | null> | null = null;`,
          `try {`,
          ...transformedLines.map((l) => `  ${l}`),
          `} catch (stepErr: unknown) {`,
          `  logger.error("Step ${safeStepName} failed, proceeding to next step:", stepErr);`,
          `}`,
        ];
      } else {
        rawLines = [
          `try {`,
          ...rawLines.map((l) => `  ${l}`),
          `} catch (stepErr: unknown) {`,
          `  logger.error("Step ${safeStepName} failed, proceeding to next step:", stepErr);`,
          `}`,
        ];
      }
    } else if (onError.action === "throw") {
      let transformedLines = rawLines;
      rawLines = [
        `try {`,
        ...transformedLines.map((l) => `  ${l}`),
        `} catch (stepErr: unknown) {`,
        `  logger.error("Step ${safeStepName} failed:", stepErr);`,
        `  throw stepErr;`,
        `}`,
      ];
    }
  }

  // Wrap lines in runIf guard if specified
  if (step.runIf) {
    const guardExpr = compileConditionExpr(step.runIf, ctx);
    return [
      `if (${guardExpr}) {`,
      ...rawLines.map((l) => `  ${l}`),
      `}`,
    ];
  }

  return rawLines;
}

/**
 * Renders an entire ordered pipeline into a block of TypeScript lines.
 *
 * Automatically tracks which output variables are declared so that
 * later steps can reference them via step_output bindings.
 *
 * @param steps    - Ordered pipeline step definitions
 * @param bodyVar  - The validated request body variable name
 * @returns        Array of rendered code lines
 */
export function renderPipeline(
  steps: PipelineStep[],
  bodyVar = "body",
): string[] {
  const ctx: PipelineRenderContext = {
    priorOutputs: new Map(),
    bodyVar,
  };

  const allLines: string[] = [];

  for (const step of steps) {
    if (step.enabled === false) continue;

    allLines.push(`// --- Pipeline Step: ${step.name} ---`);
    const stepLines = renderPipelineStep(step, ctx);
    allLines.push(...stepLines);
    allLines.push("");

    // Register this step's output so subsequent steps can reference it
    if (step.outputVariable && step.id) {
      ctx.priorOutputs.set(step.id, step.outputVariable);
    }
  }

  return allLines;
}

/**
 * Builds an import map from the pipeline steps (including recursive nested branches).
 * Returns a map of { importPath -> Set<functionName> }.
 */
export function collectPipelineImports(
  steps: PipelineStep[],
): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();

  function addStepImports(s: PipelineStep) {
    if (s.functionRef && s.enabled !== false) {
      const { name, importPath } = s.functionRef;
      if (!imports.has(importPath)) {
        imports.set(importPath, new Set());
      }
      imports.get(importPath)!.add(name);
    }
    if (s.thenSteps) s.thenSteps.forEach(addStepImports);
    if (s.elseSteps) s.elseSteps.forEach(addStepImports);
    if (s.trySteps) s.trySteps.forEach(addStepImports);
    if (s.catchSteps) s.catchSteps.forEach(addStepImports);
    if (s.switchCases) s.switchCases.forEach((c) => c.steps?.forEach(addStepImports));
    if (s.switchDefault) s.switchDefault.forEach(addStepImports);
    if (s.parallelBranches) s.parallelBranches.forEach((b) => b.steps?.forEach(addStepImports));
    if (s.loopBody) s.loopBody.forEach(addStepImports);
  }

  for (const step of steps) {
    addStepImports(step);
  }

  return imports;
}
