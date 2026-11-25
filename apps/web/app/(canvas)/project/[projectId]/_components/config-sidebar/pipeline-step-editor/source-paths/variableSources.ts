import { PipelineStepDraft } from "../types";

export interface PriorVariableInfo {
  name: string;
  stepId?: string;
  stepName?: string;
  stepType?: string;
  stepIndex?: number;
  declarationKind: "let" | "const";
  dataType: string;
  isMutable: boolean; // declarationKind === "let"
  isObject: boolean;
  isArray: boolean;
  knownProperties: string[];
}

/**
 * Introspects all prior pipeline steps to discover variables in scope.
 * Determines their declaration kind ('let' vs 'const'), inferred type,
 * mutability, and known property schema fields.
 */
export function getPriorVariables(
  priorSteps: readonly PipelineStepDraft[] = [],
): PriorVariableInfo[] {
  const vars: PriorVariableInfo[] = [];
  const seen = new Set<string>();

  priorSteps.forEach((s, idx) => {
    const varName = (s.outputVariable || "").trim();
    if (!varName) return;

    // Steps that reassign an existing variable do not introduce a new variable into scope
    const isReassign =
      s.declarationKind === "reassign" ||
      (s.type === "variable" && s.variableOperation === "assign");

    if (isReassign) return;

    if (seen.has(varName)) return;
    seen.add(varName);

    // Determine declaration kind
    let declKind: "let" | "const" = "const";
    if (s.type === "variable") {
      declKind = s.declarationKind === "const" ? "const" : "let";
    } else {
      declKind = s.declarationKind === "let" ? "let" : "const";
    }

    // Extract known properties if present
    const knownProperties: string[] = [];
    if (Array.isArray(s.outputSchema) && s.outputSchema.length > 0) {
      s.outputSchema.forEach((f) => {
        if (f && f.name && !knownProperties.includes(f.name)) {
          knownProperties.push(f.name);
        }
      });
    } else if (
      s.functionRef?.returnSchema &&
      Array.isArray(s.functionRef.returnSchema) &&
      s.functionRef.returnSchema.length > 0
    ) {
      s.functionRef.returnSchema.forEach((f) => {
        if (f && f.name && !knownProperties.includes(f.name)) {
          knownProperties.push(f.name);
        }
      });
    }

    // Determine if array
    const explicitType = (s.variableDataType || "").trim();
    let isArray = false;
    if (explicitType.endsWith("[]") || explicitType.startsWith("Array<")) {
      isArray = true;
    } else if (s.functionRef?.returnIsArray === true) {
      isArray = true;
    } else if (s.type === "parallel") {
      isArray = true;
    }

    // Determine if object
    let isObject = false;
    if (!isArray) {
      if (
        explicitType === "object" ||
        explicitType.startsWith("Record<") ||
        explicitType.startsWith("{")
      ) {
        isObject = true;
      } else if (knownProperties.length > 0) {
        isObject = true;
      } else if (
        [
          "db_operation",
          "storage_operation",
          "redis_operation",
          "service_call",
          "external_call",
        ].includes(s.type)
      ) {
        isObject = true;
      }
    }

    // Inferred data type string
    let inferredType = explicitType;
    if (!inferredType) {
      if (isArray) inferredType = "array";
      else if (isObject) inferredType = "object";
      else inferredType = "any";
    }

    vars.push({
      name: varName,
      stepId: s.id,
      stepName: s.name || `Step ${idx + 1}`,
      stepType: s.type,
      stepIndex: idx + 1,
      declarationKind: declKind,
      dataType: inferredType,
      isMutable: declKind === "let",
      isObject,
      isArray,
      knownProperties,
    });
  });

  return vars;
}

/**
 * Collects all variables declared as mutable (let) in prior steps
 * so they can be selected as assignment targets in subsequent steps.
 */
export function getPriorMutableVariables(
  priorSteps: readonly PipelineStepDraft[] = [],
): Array<{ name: string; type?: string; stepId?: string }> {
  return getPriorVariables(priorSteps.filter((s) => s.type === "variable"))
    .filter((v) => v.isMutable)
    .map((v) => ({
      name: v.name,
      type: v.dataType,
      stepId: v.stepId,
    }));
}
