import { PipelineStep } from "@workspace/canvas/types";

/**
 * Builds an import map from pipeline steps (including recursive nested branches).
 * Returns a map of { importPath -> Set<functionName> }.
 */
export function collectPipelineImports(
  steps: PipelineStep[],
): Map<string, Set<string>> {
  const imports = new Map<string, Set<string>>();

  function addStepImports(s: PipelineStep): void {
    if (s.functionRef && s.enabled !== false) {
      const { name, importPath } = s.functionRef;
      const existing = imports.get(importPath);
      if (existing) {
        existing.add(name);
      } else {
        imports.set(importPath, new Set([name]));
      }
    } else if (s.type === "langgraph_invoke" && s.enabled !== false) {
      const graphName = s.langGraphTargetNodeId
        ? `${s.langGraphTargetNodeId.replace(/[^a-zA-Z0-9]/g, "")}Graph`
        : "agentGraph";
      const importPath = `../graphs/${graphName}`;
      const existing = imports.get(importPath);
      if (existing) {
        existing.add(graphName);
      } else {
        imports.set(importPath, new Set([graphName]));
      }
    }
    if (s.thenSteps) s.thenSteps.forEach(addStepImports);
    if (s.elseSteps) s.elseSteps.forEach(addStepImports);
    if (s.trySteps) s.trySteps.forEach(addStepImports);
    if (s.catchSteps) s.catchSteps.forEach(addStepImports);
    if (s.switchCases) s.switchCases.forEach((c) => c.steps?.forEach(addStepImports));
    if (s.switchDefault) s.switchDefault.forEach(addStepImports);
    if (s.parallelBranches) s.parallelBranches.forEach((b) => b.steps?.forEach(addStepImports));
    if (s.loopBody) s.loopBody.forEach(addStepImports);
  }

  for (const step of steps) {
    addStepImports(step);
  }

  return imports;
}
