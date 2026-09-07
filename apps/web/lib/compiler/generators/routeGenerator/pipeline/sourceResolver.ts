import {
  PipelineStepInputBinding,
  PipelineStepInputSource,
} from "@workspace/canvas/types";
import {
  compileTemplateString,
  compileJsonExpression,
} from "../jsonInterpolation";
import { PipelineRenderContext } from "./types";

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
      return field ? `req.headers["${field}"]` : "req.headers";
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
  if (bindings.length === 1 && bindings[0]?.argName === "_spread") {
    return resolveBinding(bindings[0], ctx);
  }

  // Object-literal mode: build { argA: exprA, argB: exprB, ... }
  const fields = bindings
    .map((b) => `  ${b.argName}: ${resolveBinding(b, ctx)}`)
    .join(",\n");
  return `{\n${fields}\n}`;
}
