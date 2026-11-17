import { PipelineStep, ReusableFunction } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";
import { toVarName } from "../../../utils";
import { PipelineRenderContext, PipelineStepOutputMeta } from "./types";
import {
  renderTransformStep,
  renderAsyncOperationStep,
  renderExternalCallStep,
  renderKafkaPublishStep,
  renderCustomCodeStep,
  renderControlFlowStep,
  renderResponseStep,
  renderLangGraphInvokeStep,
  renderPushToClientStep,
  renderVariableStep,
} from "./compilePipelineSteps";
import { applyStepDecorators } from "./stepDecorators";
import { collectReferencedEnvVars } from "./envCollector";

export * from "./types";
export * from "./sourceResolver";
export * from "./conditionCompiler";
export * from "./compilePipelineSteps";
export * from "./stepRenderers";
export * from "./stepDecorators";
export * from "./importCollector";
export * from "./envCollector";

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
  if (!ctx.narrowedOutputs) {
    ctx.narrowedOutputs = new Set();
  }
  if (!ctx.stepOutputMeta) {
    ctx.stepOutputMeta = new Map();
  }

  let rawLines: string[] = [];
  const { type } = step;

  switch (type) {
    case "variable":
      rawLines = renderVariableStep(step, ctx);
      break;

    case "transform":
      rawLines = renderTransformStep(step, ctx);
      break;

    case "db_operation":
    case "redis_operation":
    case "storage_operation":
    case "service_call":
      rawLines = renderAsyncOperationStep(step, ctx, renderPipelineNested);
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

    case "langgraph_invoke":
      rawLines = renderLangGraphInvokeStep(step, ctx);
      break;

    case "push_to_client":
      rawLines = renderPushToClientStep(step, ctx);
      break;

    default:
      rawLines = [`// [pipeline] unknown step type "${type}"`];
      break;
  }

  return applyStepDecorators(step, rawLines, ctx);
}

/**
 * Ensures all steps within the pipeline block receive distinct outputVariable names
 * so that generated TypeScript code does not encounter block-scoped redeclaration errors (TS2451).
 */
function disambiguateStepOutputs(
  steps: PipelineStep[],
  declaredVars: Set<string>,
): PipelineStep[] {
  const result: PipelineStep[] = [];
  for (const step of steps) {
    if (step.enabled === false) {
      result.push(step);
      continue;
    }
    let outVar = step.outputVariable?.trim();
    if (!outVar && step.type === "langgraph_invoke") {
      outVar = toVarName(step.name || "agentResult") || "agentResult";
    }
    if (outVar) {
      let candidate = toVarName(outVar);
      if (declaredVars.has(candidate)) {
        let suffix = 2;
        while (declaredVars.has(`${candidate}${suffix}`)) {
          suffix++;
        }
        candidate = `${candidate}${suffix}`;
      }
      declaredVars.add(candidate);
      result.push({ ...step, outputVariable: candidate });
    } else {
      result.push(step);
    }
  }
  return result;
}

/**
 * Helper to render nested sub-steps with context propagation.
 */
export function renderPipelineNested(
  steps: PipelineStep[],
  ctx: PipelineRenderContext,
): string[] {
  const declaredVars = ctx.declaredVars ?? (ctx.declaredVars = new Set<string>());
  const sanitizedSteps = disambiguateStepOutputs(steps, declaredVars);
  const lines: string[] = [];
  for (const step of sanitizedSteps) {
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
  options?: {
    reusableFunctions?: ReusableFunction[];
    allNodes?: BackendNode[];
    stepOutputMeta?: Map<string, PipelineStepOutputMeta>;
  },
): string[] {
  const declaredVars = new Set<string>();
  if (bodyVar) declaredVars.add(bodyVar);
  declaredVars.add("req");
  declaredVars.add("res");
  declaredVars.add("abort");
  declaredVars.add("auth");
  declaredVars.add("onClose");
  declaredVars.add("logger");

  const ctx: PipelineRenderContext = {
    priorOutputs: new Map(),
    bodyVar,
    narrowedOutputs: new Set(),
    stepOutputMeta: options?.stepOutputMeta || new Map(),
    reusableFunctions: options?.reusableFunctions,
    allNodes: options?.allNodes,
    declaredVars,
  };

  const sanitizedSteps = disambiguateStepOutputs(steps, declaredVars);

  const allLines: string[] = [];

  // Validate all environment variables referenced by the pipeline steps.
  // Throws an Error if not defined, which naturally narrows their types to `string` in TypeScript
  // without needing `as any`, `as unknown`, or type assertions.
  const referencedEnvVars = collectReferencedEnvVars(sanitizedSteps);
  if (referencedEnvVars.length > 0) {
    allLines.push("// Validate required environment variables");
    for (const envVar of referencedEnvVars) {
      const isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/.test(envVar);
      const envExpr = isIdentifier
        ? `process.env.${envVar}`
        : `process.env["${envVar}"]`;
      allLines.push(`if (!${envExpr}) {`);
      allLines.push(`  throw new Error("Environment variable ${envVar} is required but not set.");`);
      allLines.push(`}`);
    }
    allLines.push("");
  }

  const streamingSteps = sanitizedSteps.filter(
    (s) =>
      s.type === "langgraph_invoke" &&
      s.langGraphStreamingEnabled &&
      (!s.langGraphStreamingProtocol || s.langGraphStreamingProtocol === "sse" || s.langGraphStreamingProtocol === "raw") &&
      s.enabled !== false,
  );
  const hasStreaming = streamingSteps.length > 0;
  const lastStreamingStepId = streamingSteps[streamingSteps.length - 1]?.id;

  for (const step of sanitizedSteps) {
    if (step.enabled === false) continue;
    // When SSE streaming is enabled on the endpoint, the LangGraph step directly streams
    // and terminates the HTTP response via res.write / res.end. Any trailing return_response
    // step must be skipped to avoid ERR_HTTP_HEADERS_SENT ("Cannot set headers after they are sent to the client").
    if (hasStreaming && step.type === "return_response") continue;

    ctx.isLastStreamingStep = streamingSteps.length > 0 ? step.id === lastStreamingStepId : true;

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
