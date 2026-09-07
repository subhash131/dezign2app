import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "./types";
import { compileConditionExpr } from "./conditionCompiler";

/**
 * Applies step decorators (onError retries, fallback / ignore / early_return error actions,
 * and runIf execution guards) to the raw emitted lines of a pipeline step.
 */
export function applyStepDecorators(
  step: PipelineStep,
  rawLines: string[],
  ctx: PipelineRenderContext,
): string[] {
  let resultLines = rawLines;

  // Wrap lines in onError handler if specified
  if (step.onError && resultLines.length > 0) {
    const { onError, outputVariable: outVar, id, name } = step;
    const safeStepName = (name || "step").replace(/"/g, '\\"');

    // 1. Handle retries if configured
    if (onError.retries && onError.retries > 0) {
      const stepKey = (id || "step").replace(/[^a-zA-Z0-9_]/g, "_");
      if (outVar) {
        const transformedLines = resultLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        resultLines = [
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
        resultLines = [
          `let attempts_${stepKey} = 0;`,
          `while (attempts_${stepKey} <= ${onError.retries}) {`,
          `  try {`,
          ...resultLines.map((l) => `    ${l}`),
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

    // 2. Handle failure actions: early_return, fallback, ignore, throw
    if (onError.action === "early_return") {
      resultLines = [
        `try {`,
        ...resultLines.map((l) => `  ${l}`),
        `} catch (stepErr) {`,
        `  logger.error("Step ${safeStepName} failed (early return):", stepErr);`,
        `  return res.status(${onError.statusCode || 502}).json({`,
        `    error: "${onError.errorMessage || `${safeStepName} execution failed`}",`,
        `    details: stepErr instanceof Error ? stepErr.message : String(stepErr),`,
        `    statusCode: ${onError.statusCode || 502},`,
        `  });`,
        `}`,
      ];
    } else if (onError.action === "fallback") {
      if (outVar) {
        const transformedLines = resultLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        resultLines = [
          `let ${outVar}: Record<string, string | number | boolean | null> | null = null;`,
          `try {`,
          ...transformedLines.map((l) => `  ${l}`),
          `} catch (stepErr) {`,
          `  logger.warn("Step ${safeStepName} failed, using fallback value:", stepErr);`,
          `  ${outVar} = ${onError.fallbackValue || "null"};`,
          `}`,
        ];
      } else {
        resultLines = [
          `try {`,
          ...resultLines.map((l) => `  ${l}`),
          `} catch (stepErr) {`,
          `  logger.warn("Step ${safeStepName} failed, fallback applied:", stepErr);`,
          `}`,
        ];
      }
    } else if (onError.action === "ignore") {
      if (outVar) {
        const transformedLines = resultLines.map((line) =>
          line.startsWith(`const ${outVar} =`)
            ? line.replace(`const ${outVar} =`, `${outVar} =`)
            : line,
        );
        resultLines = [
          `let ${outVar}: Record<string, string | number | boolean | null> | null = null;`,
          `try {`,
          ...transformedLines.map((l) => `  ${l}`),
          `} catch (stepErr) {`,
          `  logger.error("Step ${safeStepName} failed, proceeding to next step:", stepErr);`,
          `}`,
        ];
      } else {
        resultLines = [
          `try {`,
          ...resultLines.map((l) => `  ${l}`),
          `} catch (stepErr) {`,
          `  logger.error("Step ${safeStepName} failed, proceeding to next step:", stepErr);`,
          `}`,
        ];
      }
    } else if (onError.action === "throw") {
      resultLines = [
        `try {`,
        ...resultLines.map((l) => `  ${l}`),
        `} catch (stepErr) {`,
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
      ...resultLines.map((l) => `  ${l}`),
      `}`,
    ];
  }

  return resultLines;
}
