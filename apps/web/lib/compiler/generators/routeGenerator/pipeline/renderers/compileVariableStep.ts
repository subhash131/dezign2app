// ═══════════════════════════════════════════════════════════════
// MODULE: VariableStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  TypeScript variable declarations (let/const), variable assignments (=, +=, -=),
//         object property mutations, and array push operations
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { toVarName } from "../../../../utils";
import { normalizeInlineSourceForCompiler } from "../../../../variableValueUtils";
import { PipelineRenderContext } from "../types";
import { resolveSource } from "../sourceResolver";

/**
 * Sanitizes a dot-separated property path, cleaning each identifier.
 */
function formatPropertyPath(propPath: string): string {
  const trimmed = propPath.trim();
  if (!trimmed) return "";
  return trimmed
    .split(".")
    .map((seg) => toVarName(seg.trim()))
    .filter(Boolean)
    .join(".");
}

/**
 * Renders a "variable" pipeline step (declaration of let/const or assignment/mutation).
 */
export function renderVariableStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  const {
    outputVariable,
    variableOperation = "declare",
    declarationKind = "let",
    variableDataType,
    variableSource,
    variableOperator = "=",
    variablePropertyPath,
    variableMutationKind,
  } = step;

  const varName = toVarName(outputVariable || "customVar");

  // Track the variable in narrowedOutputs so downstream can access
  if (ctx.narrowedOutputs) {
    ctx.narrowedOutputs.add(varName);
  }

  // If this step has an ID, record it in priorOutputs
  if (step.id) {
    ctx.priorOutputs.set(step.id, varName);
  }

  if (variableOperation === "assign") {
    const normalizedAssignSource =
      variableSource && variableOperator === "-="
        ? normalizeInlineSourceForCompiler(variableSource, "number")
        : variableSource;
    const valExpr = normalizedAssignSource ? resolveSource(normalizedAssignSource, ctx) : "undefined";
    const cleanProp = variablePropertyPath ? formatPropertyPath(variablePropertyPath) : "";

    const mutationKind =
      variableMutationKind ||
      (variableOperator === "push"
        ? "array_push"
        : cleanProp
          ? "property"
          : "variable");

    // Case 1: Array Push (.push(value))
    if (mutationKind === "array_push" || variableOperator === "push") {
      const targetExpr = cleanProp ? `${varName}.${cleanProp}` : varName;
      return [`${targetExpr}.push(${valExpr});`];
    }

    // Case 2: Object Property Mutation (target.prop = value or target.prop += value)
    if (mutationKind === "property" && cleanProp) {
      const op = variableOperator || "=";
      return [`${varName}.${cleanProp} ${op} ${valExpr};`];
    }

    // Case 3: Root Variable Reassignment (target = value or target += value)
    const op = variableOperator || "=";
    return [`${varName} ${op} ${valExpr};`];
  }

  // Declaration mode (let or const)
  const keyword = declarationKind === "const" ? "const" : "let";

  // When a user-specified type annotation is present but the source is a request body field
  // (which TypeScript types as `T | undefined` for optional fields), we must widen the annotation
  // to avoid TS2322 ("Type 'string | undefined' is not assignable to type 'string'").
  const rawType =
    variableDataType && variableDataType.trim() && variableDataType.trim() !== "inferred"
      ? variableDataType.trim()
      : "";

  const isBodySource =
    variableSource?.kind === "req_body" ||
    variableSource?.kind === "req_query" ||
    variableSource?.kind === "req_params" ||
    variableSource?.kind === "req_headers" ||
    variableSource?.kind === "auth";

  // Widen primitive types from req_body/req_query/req_params/req_headers sources
  // to include `| undefined` so optional fields don't cause TS2322 errors.
  const needsUndefined =
    isBodySource &&
    rawType &&
    !rawType.includes("undefined") &&
    !rawType.includes("|") &&
    !rawType.startsWith("{") &&
    !rawType.startsWith("[");

  const effectiveType = needsUndefined ? `${rawType} | undefined` : rawType;
  const typeAnnotation = effectiveType ? `: ${effectiveType}` : "";

  if (variableSource) {
    const normalizedSource = normalizeInlineSourceForCompiler(variableSource, rawType);
    const valExpr = resolveSource(normalizedSource, ctx);
    return [`${keyword} ${varName}${typeAnnotation} = ${valExpr};`];
  }

  // Uninitialized let
  if (keyword === "let") {
    return [`let ${varName}${typeAnnotation};`];
  }

  // const requires an initializer
  return [`const ${varName}${typeAnnotation} = undefined;`];
}
