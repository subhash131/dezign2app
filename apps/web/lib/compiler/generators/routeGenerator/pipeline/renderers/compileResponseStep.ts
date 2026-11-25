// ═══════════════════════════════════════════════════════════════
// MODULE: ResponseStepRenderer
// LAYER:  generators / routeGenerator / pipeline / renderers
// EMITS:  Explicit return_response and early_return statements in the pipeline
// ═══════════════════════════════════════════════════════════════

import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "../types";
import { resolveBinding } from "../sourceResolver";

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
    (firstBinding.argName === "_spread" ||
      !firstBinding.argName)
  ) {
    const expr = resolveBinding(firstBinding, ctx);
    const exprLines = expr.split("\n");
    if (exprLines.length === 1) {
      return [`return res.status(${statusCode}).json(${expr});`];
    }
    return [
      `return res.status(${statusCode}).json(${exprLines[0]}`,
      ...exprLines.slice(1, -1),
      `${exprLines[exprLines.length - 1]});`,
    ];
  }

  if (inputBindings.length > 0) {
    const seen = new Set<string>();
    const uniqueBindings = inputBindings.filter((b) => {
      const key = (b.argName || "").trim();
      if (!key) return false;
      const lower = key.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    if (uniqueBindings.length > 0) {
      const fieldLines: string[] = [];
      uniqueBindings.forEach((b, idx) => {
        const comma = idx < uniqueBindings.length - 1 ? "," : "";
        const valExpr = resolveBinding(b, ctx);
        const valLines = valExpr.split("\n");
        if (valLines.length === 1) {
          fieldLines.push(`  ${b.argName}: ${valExpr}${comma}`);
        } else {
          fieldLines.push(`  ${b.argName}: ${valLines[0]}`);
          for (let i = 1; i < valLines.length; i++) {
            const suffix = i === valLines.length - 1 ? comma : "";
            fieldLines.push(`  ${valLines[i]}${suffix}`);
          }
        }
      });
      return [
        `return res.status(${statusCode}).json({`,
        ...fieldLines,
        `});`,
      ];
    }
  }

  const defaultMsg = step.type === "early_return" ? "Early return" : "Success";
  return [`return res.status(${statusCode}).json({ message: "${defaultMsg}" });`];
}
