import { PipelineStep } from "@workspace/canvas/types";
import { PipelineRenderContext } from "./types";
import {
  renderTransformStep,
  renderAsyncOperationStep,
  renderExternalCallStep,
  renderKafkaPublishStep,
  renderCustomCodeStep,
  renderControlFlowStep,
  renderResponseStep,
} from "./stepRenderers";
import { applyStepDecorators } from "./stepDecorators";

export * from "./types";
export * from "./sourceResolver";
export * from "./conditionCompiler";
export * from "./stepRenderers";
export * from "./stepDecorators";
export * from "./importCollector";

/**
 * Renders a single pipeline step into one or more lines of TypeScript.
 *
 * @param step - The pipeline step configuration
 * @param ctx - Render context (prior outputs, body var name)
 * @returns Array of code lines (without trailing newline)
 */
export function renderPipelineStep(
  step: PipelineStep,
  ctx: PipelineRenderContext,
): string[] {
  if (step.enabled === false) return [];

  let rawLines: string[] = [];
  const { type } = step;

  switch (type) {
    case "transform":
      rawLines = renderTransformStep(step, ctx);
      break;

    case "db_operation":
    case "redis_operation":
    case "service_call":
      rawLines = renderAsyncOperationStep(step, ctx);
      break;

    case "external_call":
      rawLines = renderExternalCallStep(step, ctx);
      break;

    case "kafka_publish":
      rawLines = renderKafkaPublishStep(step, ctx);
      break;

    case "custom_code":
      rawLines = renderCustomCodeStep(step);
      break;

    case "condition":
    case "try_catch":
    case "switch":
    case "parallel":
    case "loop":
      rawLines = renderControlFlowStep(step, ctx, renderPipelineNested);
      break;

    case "early_return":
    case "return_response":
      rawLines = renderResponseStep(step, ctx);
      break;

    default:
      rawLines = [`// [pipeline] unknown step type "${type}"`];
      break;
  }

  return applyStepDecorators(step, rawLines, ctx);
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
 * Renders an entire ordered pipeline into a block of TypeScript lines.
 *
 * Automatically tracks which output variables are declared so that
 * later steps can reference them via step_output bindings.
 *
 * @param steps - Ordered pipeline step definitions
 * @param bodyVar - The validated request body variable name (defaults to "body")
 * @returns Array of rendered code lines
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
