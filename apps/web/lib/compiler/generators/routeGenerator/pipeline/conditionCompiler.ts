import {
  ConditionClause,
  ConditionExpr,
} from "@workspace/canvas/types";
import { PipelineRenderContext } from "./types";
import { resolveSource } from "./sourceResolver";

/**
 * Type guard to check if a ConditionExpr is a leaf ConditionClause.
 * Avoids any type assertions (`as ConditionClause`).
 */
export function isConditionClause(expr: ConditionExpr): expr is ConditionClause {
  return "left" in expr && "operator" in expr;
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

  if (isConditionClause(expr)) {
    return compileConditionClause(expr, ctx);
  }

  return "true";
}
