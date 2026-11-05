import {
  PipelineStepInputBinding,
  PipelineStepInputSource,
} from "@workspace/canvas/types";
import {
  compileTemplateString,
  compileJsonExpression,
} from "../jsonInterpolation";
import { PipelineRenderContext } from "./types";
import { cleanEnvVarName } from "./envCollector";

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
    case "auth": {
      const field = source.field ? source.field.trim() : "";
      return field ? `auth?.${field}` : "auth";
    }
    case "env": {
      const field = cleanEnvVarName(source.field);
      if (!field) return "process.env";
      return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field)
        ? `process.env.${field}`
        : `process.env["${field}"]`;
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
      let varName = ctx.priorOutputs.get(source.stepId);
      if (!varName) {
        if (source.stepId.startsWith("var:")) {
          varName = source.stepId.replace("var:", "");
        } else if (ctx.narrowedOutputs?.has(source.stepId) || /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(source.stepId)) {
          varName = source.stepId;
        }
      }
      const field = source.field ? source.field.trim() : "";
      if (!varName) {
        const fallback = `/* step "${source.stepId}" not found */ undefined`;
        return field ? `${fallback}?.${field}` : fallback;
      }
      if (field) {
        const meta =
          ctx.stepOutputMeta?.get(source.stepId) ||
          ctx.stepOutputMeta?.get(varName);

        const fieldLower = field.toLowerCase();
        const varLower = varName.toLowerCase();

        const isPresignedStorage =
          Boolean(meta?.isPresignedStorage) ||
          varLower === "uploadurl" ||
          varLower === "downloadurl" ||
          varLower === "presignedurl" ||
          varLower === "signedurl";

        if (
          fieldLower === varLower ||
          ((varLower === "uploadurl" || varLower === "downloadurl" || varLower === "presignedurl" || varLower === "signedurl" || isPresignedStorage) &&
            (fieldLower === "uploadurl" ||
              fieldLower === "downloadurl" ||
              fieldLower === "presignedurl" ||
              fieldLower === "signedurl" ||
              fieldLower === "url"))
        ) {
          return varName;
        }

        if (isPresignedStorage) {
          if (fieldLower === "key") {
            return meta?.keyExpression || `""`;
          }
          if (fieldLower === "bucket") {
            return meta?.bucketExpression || `""`;
          }
          if (fieldLower === "method") {
            const isDownload = Boolean(meta?.isDownload) || varLower.includes("download");
            return JSON.stringify(isDownload ? "GET" : "PUT");
          }
          if (fieldLower === "expiresinseconds") {
            const isDownload = Boolean(meta?.isDownload) || varLower.includes("download");
            return isDownload ? "3600" : "900";
          }
        }

        // If the step output is marked as a primitive (e.g. string URL or boolean),
        // it has no child properties. Any property reference on a primitive causes TS2339.
        if (meta?.isPrimitive) {
          return varName;
        }

        if (meta?.isArray) {
          return `${varName}[0]?.${field}`;
        }
        // Map LangGraph convenience paths / aliases to actual properties
        if (field === "messages[last].content" || field === "content") {
          return `${varName}.response`;
        }
        if (field === "messages[last]") {
          return `${varName}.messages[${varName}.messages.length - 1]`;
        }
        if (field === "finalState") {
          return `${varName}.state`;
        }
        if (field === "structuredResponse") {
          return `(${varName}.structuredResponse ?? ${varName}.response)`;
        }
        if (field.startsWith("structuredResponse.")) {
          const sub = field.slice(19);
          return `(${varName}.structuredResponse?.${sub} ?? ${varName}.${sub})`;
        }

        if (field.includes("[last]")) {
          const resolvedField = field.replace(
            /([a-zA-Z0-9_$]+)\[last\]/g,
            `$1[$1.length - 1]`,
          );
          if (resolvedField.startsWith("[")) {
            return `${varName}${resolvedField}`;
          }
          return `${varName}.${resolvedField}`;
        }

        if (field.startsWith("[")) {
          return `${varName}${field}`;
        }
        return `${varName}.${field}`;
      }
      return varName;
    }
    case "inline": {
      const v = source.value;
      if (typeof v === "number" || typeof v === "boolean") return String(v);
      const str = String(v ?? "");
      const trimmed = str.trim();
      if (trimmed === "" || trimmed === '""' || trimmed === "''") {
        return '""';
      }
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        try {
          JSON.parse(trimmed);
          return trimmed;
        } catch {
          // not plain JSON, proceed to interpolation check
        }
      }
      if (!/\$\{([^}]+)\}/.test(str)) {
        return JSON.stringify(str);
      }
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
