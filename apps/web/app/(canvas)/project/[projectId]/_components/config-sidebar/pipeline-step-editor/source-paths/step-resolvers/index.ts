import { BackendNode, Endpoint } from "@workspace/canvas/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { AvailablePath, AvailableSource, PipelineStepDraft } from "../../types";
import { resolveTransformerStepPaths } from "./resolveTransformerStep";
import { resolveDatabaseStepPaths } from "./resolveDatabaseStep";
import { resolveCallStepPaths } from "./resolveCallStep";
import {
  resolveStorageStepPaths,
  createPresignedUrlExtraSource,
} from "./resolveStorageStep";
import { resolveLangGraphStepPaths } from "./resolveLangGraphStep";

export {
  resolveTransformerStepPaths,
  resolveDatabaseStepPaths,
  resolveCallStepPaths,
  resolveStorageStepPaths,
  createPresignedUrlExtraSource,
  resolveLangGraphStepPaths,
};

/**
 * Resolves the available output paths for a single pipeline step.
 */
export function resolveStepOutputPaths(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  allEndpoints: readonly Endpoint[] = useBackendCanvasStore.getState().endpoints,
): AvailablePath[] {
  const stepPaths: AvailablePath[] = [];

  if (Array.isArray(step.outputSchema) && step.outputSchema.length > 0) {
    step.outputSchema.forEach((os) => {
      if (os.name) stepPaths.push({ path: os.name, type: os.type });
    });
  }

  // 1. Transformer Step
  resolveTransformerStepPaths(step, allNodes, stepPaths);

  // 2. Database & Redis Step
  resolveDatabaseStepPaths(step, allNodes, stepPaths);

  // 3. External & Service Call Step
  resolveCallStepPaths(step, allNodes, stepPaths, allEndpoints);

  // 4. Storage Step
  resolveStorageStepPaths(step, stepPaths);

  // 5. LangGraph Agent Step
  resolveLangGraphStepPaths(step, allNodes, stepPaths);

  // 6. Auth Verify Step (outputs AuthUser identity for downstream steps in HTTP or Kafka consumers)
  if (step.type === "auth_verify") {
    stepPaths.push(
      { path: "id", type: "string", description: "Verified user ID" },
      { path: "userId", type: "string", description: "Verified user ID" },
      { path: "email", type: "string", description: "Verified user email" },
      { path: "name", type: "string", description: "Verified user name" },
      { path: "username", type: "string", description: "Verified username" },
      { path: "role", type: "string", description: "Verified user role" },
      { path: "activeOrganizationId", type: "string", description: "Active organization ID" },
      { path: "orgRole", type: "string", description: "Verified active organization role" },
    );
  }

  // 7. Variable Step
  if (step.type === "variable") {
    if (step.variableOperation !== "assign") {
      const varName = step.outputVariable || step.name || "var";
      stepPaths.push({
        path: "",
        type: step.variableDataType || "string",
        description: `Variable: ${varName} (${step.declarationKind || "let"})`,
      });
    }
  }

  return stepPaths;
}

/**
 * Creates an AvailableSource representation for a prior pipeline step.
 * Returns null if the step is an in-place mutation (e.g. variable assignment)
 * that does not declare or emit a separate variable output.
 */
export function createStepSource(
  step: PipelineStepDraft,
  index: number,
  allNodes: BackendNode[],
  allEndpoints: readonly Endpoint[] = useBackendCanvasStore.getState().endpoints,
): AvailableSource | null {
  if (step.type === "variable" && step.variableOperation === "assign") {
    // Variable mutation step - no separate output variable to declare
    return null;
  }

  const varName = step.outputVariable || step.name || `step${index + 1}Result`;
  const stepPaths = resolveStepOutputPaths(step, allNodes, allEndpoints);

  const isGenericStepName =
    !step.name ||
    step.name.trim() === "" ||
    step.name.toLowerCase() === varName.toLowerCase() ||
    step.name.toLowerCase() === `step ${index + 1}`.toLowerCase() ||
    step.name.toLowerCase() === `step${index + 1}`.toLowerCase();

  const stepLabel =
    step.type === "variable"
      ? `Variable: ${varName} (${step.declarationKind || "let"})`
      : isGenericStepName
      ? `Step ${index + 1}: ${varName}`
      : `Step ${index + 1}: ${step.name} (${varName})`;

  return {
    id: `step:${step.id}`,
    label: stepLabel,
    kind: "step_output",
    stepId: step.id,
    variableName: varName,
    rootVariableName: varName,
    paths: stepPaths,
  };
}
