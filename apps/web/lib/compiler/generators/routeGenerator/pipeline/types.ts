import { BackendNode } from "@/types/canvas";
import { PipelineStep } from "@workspace/canvas/types";

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
  /** Map of stepId -> step definition for all prior steps */
  priorSteps?: Map<string, PipelineStep>;
  /** All canvas nodes available for schema/type resolution */
  allNodes?: BackendNode[];
}


