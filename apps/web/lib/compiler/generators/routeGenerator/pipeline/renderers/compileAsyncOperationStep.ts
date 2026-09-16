// ═══════════════════════════════════════════════════════════════
// MODULE: AsyncOperationStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  Async database operations, Redis operations with cache-miss fallbacks, and microservice calls
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { toVarName } from "../../../../utils";
import { PipelineRenderContext } from "../types";
import { buildArgList, resolveBinding } from "../sourceResolver";
import { sortRedisBindings } from "./compileRedisBindingSorter";

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
  const fnName = toVarName(functionRef.name || "operation");
  const rawLines: string[] = [];
  const isRedisOp =
    type === "redis_operation" ||
    Boolean(
      functionRef.importPath &&
        (functionRef.importPath.includes("cache") ||
          functionRef.importPath.includes("redis")),
    );

  let args: string;
  if (isRedisOp && inputBindings.length > 0) {
    const allPositional = inputBindings.every((b) => /^\d+$/.test(b.argName));
    const isSingleSpread =
      inputBindings.length === 1 && inputBindings[0]?.argName === "_spread";

    if (allPositional || isSingleSpread) {
      args = buildArgList(inputBindings, ctx);
    } else {
      const sorted = sortRedisBindings(inputBindings, functionRef.signature);
      args = sorted.map((b) => resolveBinding(b, ctx)).join(", ");
    }
  } else if (type === "db_operation" && inputBindings.length > 0) {
    const fnLower = fnName.toLowerCase();
    const isById =
      fnLower.includes("byid") ||
      fnLower.includes("findone") ||
      step.operationId === "findById" ||
      step.operationId === "deleteById";

    const firstBinding = inputBindings[0];
    if (
      isById &&
      inputBindings.length === 1 &&
      firstBinding &&
      (firstBinding.argName === "id" ||
        firstBinding.argName === "key" ||
        /^\d+$/.test(firstBinding.argName))
    ) {
      args = resolveBinding(firstBinding, ctx);
    } else {
      args = buildArgList(inputBindings, ctx);
    }
  } else {
    args = buildArgList(inputBindings, ctx);
  }

  const isMultiLine = args.includes("\n");
  const isDeclLet = Boolean(
    isRedisOp &&
      step.cacheMiss?.enabled &&
      (step.cacheMiss.action === "fallback_db" ||
        step.cacheMiss.action === "fallback_value"),
  );
  const declKeyword = isDeclLet ? "let" : "const";
  const typeAnnotation =
    isDeclLet && step.cacheMiss?.action === "fallback_db" && step.cacheMiss.functionRef?.name
      ? `: Awaited<ReturnType<typeof ${fnName}>> | Awaited<ReturnType<typeof ${toVarName(step.cacheMiss.functionRef.name)}>>`
      : "";

  if (isMultiLine) {
    rawLines.push(`${declKeyword} ${outputVariable}${typeAnnotation} = await ${fnName}(`);
    args.split("\n").forEach((l) => rawLines.push(`  ${l}`));
    rawLines.push(`);`);
  } else {
    const callExpr = args
      ? `await ${fnName}(${args})`
      : `await ${fnName}()`;
    rawLines.push(`${declKeyword} ${outputVariable}${typeAnnotation} = ${callExpr};`);
  }

  // Cache Miss handling for Redis operations
  if (isRedisOp && step.cacheMiss?.enabled) {
    const {
      action = "fallback_db",
      functionRef: dbFnRef,
      inputBindings: dbBindings = [],
      statusCode = 404,
      errorMessage = "Record not found",
      fallbackValue = "null",
      writeBackToCache = true,
      ttlSeconds,
    } = step.cacheMiss;

    rawLines.push(`if (${outputVariable} === null || ${outputVariable} === undefined) {`);

    if (action === "fallback_db") {
      if (dbFnRef?.name) {
        const dbFn = toVarName(dbFnRef.name);
        let dbArgs: string;
        if (dbBindings.length > 0) {
          const firstDbBinding = dbBindings[0];
          const fnLower = dbFn.toLowerCase();
          const isById =
            fnLower.includes("byid") ||
            fnLower.includes("findone") ||
            (dbBindings.length === 1 &&
              firstDbBinding &&
              (firstDbBinding.argName === "id" || firstDbBinding.argName === "key"));

          if (isById && dbBindings.length === 1 && firstDbBinding) {
            dbArgs = resolveBinding(firstDbBinding, ctx);
          } else {
            dbArgs = buildArgList(dbBindings, ctx);
          }
        } else {
          dbArgs = args;
        }

        if (dbArgs.includes("\n")) {
          rawLines.push(`  ${outputVariable} = await ${dbFn}(`);
          dbArgs.split("\n").forEach((l) => rawLines.push(`    ${l}`));
          rawLines.push(`  );`);
        } else {
          rawLines.push(`  ${outputVariable} = await ${dbFn}(${dbArgs});`);
        }
      }
      if (writeBackToCache) {
        let setFnName: string | undefined;
        if (fnName.toLowerCase().startsWith("get")) {
          setFnName = `set${fnName.slice(3)}`;
        } else if (fnName.toLowerCase().startsWith("find")) {
          setFnName = `set${fnName.slice(4)}`;
        }
        const keyArg = args.split(",")[0]?.trim() || "id";
        if (setFnName) {
          rawLines.push(`  if (${outputVariable} !== null && ${outputVariable} !== undefined) {`);
          if (ttlSeconds && ttlSeconds > 0) {
            rawLines.push(`    await ${setFnName}(${keyArg}, ${outputVariable}, { ttl: ${ttlSeconds} });`);
          } else {
            rawLines.push(`    await ${setFnName}(${keyArg}, ${outputVariable});`);
          }
          rawLines.push(`  }`);
        }
      }
    } else if (action === "early_return") {
      rawLines.push(`  return res.status(${statusCode}).json({ error: "${errorMessage}" });`);
    } else if (action === "fallback_value") {
      rawLines.push(`  ${outputVariable} = ${fallbackValue};`);
    } else if (action === "throw_error") {
      rawLines.push(`  throw new Error("${errorMessage}");`);
    }

    rawLines.push(`}`);

    if (action === "fallback_db") {
      rawLines.push(`if (${outputVariable} === null || ${outputVariable} === undefined) {`);
      rawLines.push(`  return res.status(${statusCode}).json({ error: "${errorMessage}" });`);
      rawLines.push(`}`);
    }
  }

  // DB reads by ID get a 404 guard
  if (
    type === "db_operation" &&
    (fnName.toLowerCase().includes("byid") ||
      fnName.toLowerCase().includes("findone"))
  ) {
    rawLines.push(`if (${outputVariable} === undefined || ${outputVariable} === null) {`);
    rawLines.push(`  return res.status(404).json({ error: "Not found" });`);
    rawLines.push(`}`);
  }

  // Direct Redis get operations without cache miss get a 404 guard (excluding list/array operations)
  const isListOp =
    fnName.toLowerCase().includes("recent") ||
    fnName.toLowerCase().includes("all") ||
    fnName.toLowerCase().includes("list") ||
    fnName.toLowerCase().includes("range");
  if (
    isRedisOp &&
    !step.cacheMiss?.enabled &&
    !isListOp &&
    (fnName.toLowerCase().startsWith("get") ||
      fnName.toLowerCase().startsWith("find"))
  ) {
    rawLines.push(`if (${outputVariable} === undefined || ${outputVariable} === null) {`);
    rawLines.push(`  return res.status(404).json({ error: "Not found" });`);
    rawLines.push(`}`);
  }

  return rawLines;
}

