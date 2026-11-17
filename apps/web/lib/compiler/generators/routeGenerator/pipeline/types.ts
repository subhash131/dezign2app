import { ReusableFunction } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";

export interface PipelineStepOutputMeta {
  isArray?: boolean;
  isPrimitive?: boolean;
  primitiveType?: "string" | "number" | "boolean";
  returnType?: string;
  isPresignedStorage?: boolean;
  isDownload?: boolean;
  keyExpression?: string;
  bucketExpression?: string;
}

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
  /** Set of outputVariable names that have been null-narrowed by an upstream guard */
  narrowedOutputs?: Set<string>;
  /** Metadata about step outputs (e.g. whether the return type is an array or primitive) */
  stepOutputMeta?: Map<string, PipelineStepOutputMeta>;
  /** Available reusable functions to inspect return type signatures */
  reusableFunctions?: ReusableFunction[];
  /** Canvas nodes for schema and data structure lookup */
  allNodes?: BackendNode[];
  /** Set of variable identifiers declared in this scope to prevent redeclaration */
  declaredVars?: Set<string>;
  /** Whether this is the final streaming step in the pipeline (controls closing res.end) */
  isLastStreamingStep?: boolean;
}

