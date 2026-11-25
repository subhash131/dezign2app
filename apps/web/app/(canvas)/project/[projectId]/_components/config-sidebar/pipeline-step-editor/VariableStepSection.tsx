"use client";

import React, { useMemo } from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { Variable, ArrowRight, Code2, AlertCircle, Layers, Brackets } from "lucide-react";
import type { BackendNode } from "@/types/canvas";
import {
  useAvailableCanvasTypes,
  AvailableTypeItem,
} from "@/lib/hooks/useAvailableCanvasTypes";
import { TypeCombobox } from "../TypeCombobox";
import { BufferedInput } from "./BufferedInput";
import { BindingSourceEditor } from "./BindingSourceEditor";
import { TargetVariableCombobox } from "./TargetVariableCombobox";
import {
  PipelineStepDraft,
  AvailableSource,
  StepBinding,
} from "./types";
import { getPriorVariables } from "./utils";
import { toVarName } from "@/lib/compiler/utils";
import {
  adaptInlineValueOnTypeChange,
  coerceInlineValueForType,
  formatInlineValueForPreview,
  formatVariableType,
  getArrayElementType,
  getDefaultInlineValueForType,
  parseVariableTypeParts,
} from "@/lib/compiler/variableValueUtils";

export interface VariableStepSectionProps {
  step: PipelineStepDraft;
  priorSteps: PipelineStepDraft[];
  availableSources: AvailableSource[];
  allNodes?: BackendNode[];
  serviceNodeId?: string;
  onChange: (updated: PipelineStepDraft) => void;
}

export const VariableStepSection: React.FC<VariableStepSectionProps> = ({
  step,
  priorSteps,
  availableSources,
  allNodes,
  serviceNodeId,
  onChange,
}) => {
  const variableOperation = step.variableOperation || "declare";
  const declarationKind = step.declarationKind || "let";
  const variableOperator = step.variableOperator || "=";
  const variableDataType = step.variableDataType || "";
  const varName = step.outputVariable || "myVar";
  const variablePropertyPath = step.variablePropertyPath || "";
  const variableMutationKind = step.variableMutationKind || (variableOperator === "push" ? "array_push" : variablePropertyPath ? "property" : "variable");

  // Collect prior variable declarations (ignoring other step types like transform, db_operation, etc.)
  const priorVariables = useMemo(
    () => getPriorVariables(priorSteps.filter((s) => s.type === "variable")),
    [priorSteps],
  );

  const selectedVarInfo = useMemo(
    () => priorVariables.find((v) => v.name === varName),
    [priorVariables, varName],
  );

  const effectiveValueType = useMemo(() => {
    if (variableOperation === "declare") {
      return variableDataType;
    }
    if (variableMutationKind === "variable") {
      return selectedVarInfo?.dataType || "";
    }
    if (variableMutationKind === "array_push") {
      return getArrayElementType(selectedVarInfo?.dataType);
    }
    return "";
  }, [variableOperation, variableDataType, variableMutationKind, selectedVarInfo]);

  const { baseType: baseDataType, isArray: isArrayType } = useMemo(
    () => parseVariableTypeParts(variableDataType),
    [variableDataType],
  );

  const { allTypes } = useAvailableCanvasTypes(allNodes, {
    primitivePreset: "typescript",
  });

  const isObjectLikeType = useMemo(() => {
    const map = new Map<string, AvailableTypeItem>();
    for (const item of allTypes) {
      map.set(item.name, item);
    }
    return (rawType: string): boolean => {
      const { baseType, isArray } = parseVariableTypeParts(rawType);
      if (isArray || !baseType) return false;
      return map.get(baseType)?.kind === "interface";
    };
  }, [allTypes]);

  const applyDataTypeChange = (nextType: string) => {
    const nextStep: PipelineStepDraft = {
      ...step,
      variableDataType: nextType,
    };
    if (!step.variableSource || step.variableSource.kind === "inline") {
      const adaptedValue = adaptInlineValueOnTypeChange(
        step.variableSource?.value,
        variableDataType,
        nextType,
        {
          prevIsObjectLike: isObjectLikeType(variableDataType),
          nextIsObjectLike: isObjectLikeType(nextType),
        },
      );
      nextStep.variableSource = {
        kind: "inline",
        value: adaptedValue,
      };
    }
    onChange(nextStep);
  };

  // Synthesize binding object for BindingSourceEditor
  const currentBinding: StepBinding = useMemo(
    () => ({
      argName: variablePropertyPath ? `${varName}.${variablePropertyPath}` : varName || "value",
      source: step.variableSource || { kind: "inline", value: "" },
    }),
    [varName, variablePropertyPath, step.variableSource],
  );

  const handleSourceChange = (updatedBinding: StepBinding) => {
    let nextSource = updatedBinding.source;
    if (nextSource.kind === "inline") {
      const switchedToInline =
        step.variableSource?.kind !== "inline" &&
        (nextSource.value === "" || nextSource.value === undefined);
      const nextVal = switchedToInline
        ? getDefaultInlineValueForType(effectiveValueType, {
            isObjectLike: isObjectLikeType(effectiveValueType),
          })
        : coerceInlineValueForType(nextSource.value, effectiveValueType);
      nextSource = { kind: "inline", value: nextVal };
    }
    onChange({
      ...step,
      variableSource: nextSource,
    });
  };

  // Preview code generator
  const previewCode = useMemo(() => {
    const cleanName = toVarName(varName || "customVar");
    const source = step.variableSource;
    let sourceStr = "/* uninitialized */";

    if (source) {
      if (source.kind === "inline") {
        sourceStr = formatInlineValueForPreview(source.value, effectiveValueType);
      } else if (source.kind === "req_body") {
        sourceStr = source.field ? `req.body.${source.field}` : `req.body`;
      } else if (source.kind === "req_params") {
        sourceStr = source.field ? `req.params.${source.field}` : `req.params`;
      } else if (source.kind === "req_query") {
        sourceStr = source.field ? `req.query.${source.field}` : `req.query`;
      } else if (source.kind === "auth") {
        sourceStr = source.field ? `auth?.${source.field}` : `auth`;
      } else if (source.kind === "env") {
        sourceStr = `process.env.${source.field || "ENV_VAR"}`;
      } else if (source.kind === "step_output") {
        const matched = priorSteps.find((s) => s.id === source.stepId);
        const refVar = matched?.outputVariable || source.stepId;
        sourceStr = source.field ? `${refVar}.${source.field}` : refVar;
      }
    }

    if (variableOperation === "assign") {
      const cleanProp = variablePropertyPath.trim();
      const currentMutation =
        step.variableMutationKind ||
        (variableOperator === "push"
          ? "array_push"
          : cleanProp
            ? "property"
            : "variable");

      if (currentMutation === "array_push" || variableOperator === "push") {
        const targetExpr = cleanProp ? `${cleanName}.${cleanProp}` : cleanName;
        return `${targetExpr}.push(${sourceStr});`;
      }

      if (currentMutation === "property" && cleanProp) {
        return `${cleanName}.${cleanProp} ${variableOperator} ${sourceStr};`;
      }

      return `${cleanName} ${variableOperator} ${sourceStr};`;
    }

    const keyword = declarationKind === "const" ? "const" : "let";
    const typeStr =
      variableDataType && variableDataType.trim() && variableDataType.trim() !== "any"
        ? `: ${variableDataType.trim()}`
        : "";

    if (!source && keyword === "let") {
      return `let ${cleanName}${typeStr};`;
    }

    return `${keyword} ${cleanName}${typeStr} = ${sourceStr};`;
  }, [
    varName,
    variableOperation,
    declarationKind,
    variableOperator,
    variableDataType,
    effectiveValueType,
    variablePropertyPath,
    step.variableMutationKind,
    step.variableSource,
    priorSteps,
  ]);

  return (
    <div className="flex flex-col gap-3">
      {/* Operation Mode Selector: Declare vs Assign */}
      <div className="flex items-center gap-1.5 p-1 rounded-lg bg-secondary/40 border border-border/50">
        <button
          type="button"
          className={`flex-1 py-1 px-2.5 rounded-md text-[11px] font-medium transition-all ${
            variableOperation === "declare"
              ? "bg-background text-foreground shadow-xs border border-border/70"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => {
            onChange({
              ...step,
              variableOperation: "declare",
              declarationKind: step.declarationKind === "reassign" ? "let" : step.declarationKind || "let",
              variableMutationKind: "variable",
              variablePropertyPath: undefined,
            });
          }}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Variable size={12} className="text-blue-400" />
            <span>Declare Variable</span>
          </span>
        </button>

        <button
          type="button"
          className={`flex-1 py-1 px-2.5 rounded-md text-[11px] font-medium transition-all ${
            variableOperation === "assign"
              ? "bg-background text-foreground shadow-xs border border-border/70"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => {
            const firstAvailable = priorVariables[0];
            const defaultName = firstAvailable?.name || step.outputVariable || "customVar";
            let defaultMutation: "variable" | "property" | "array_push" = "variable";
            let defaultOp: "=" | "+=" | "-=" | "push" = "=";

            if (firstAvailable?.isArray) {
              defaultMutation = "array_push";
              defaultOp = "push";
            } else if (firstAvailable?.isObject && !firstAvailable.isMutable) {
              defaultMutation = "property";
              defaultOp = "=";
            }

            onChange({
              ...step,
              variableOperation: "assign",
              declarationKind: "reassign",
              outputVariable: defaultName,
              variableMutationKind: defaultMutation,
              variableOperator: defaultOp,
              name: `Assign ${defaultName}`,
            });
          }}
        >
          <span className="flex items-center justify-center gap-1.5">
            <ArrowRight size={12} className="text-amber-400" />
            <span>Update / Reassign (=)</span>
          </span>
        </button>
      </div>

      {/* Mode A: Declare Variable */}
      {variableOperation === "declare" && (
        <div className="flex flex-col gap-2.5 p-2.5 rounded-lg border border-border/50 bg-background/40">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            {/* Variable Name */}
            <div className="flex flex-col gap-1 sm:col-span-4">
              <Label className="text-[10px] text-muted-foreground font-medium">Variable Name</Label>
              <BufferedInput
                className="h-7 text-xs font-mono bg-background/60 border-border/60"
                value={step.outputVariable ?? ""}
                onCommit={(val) => {
                  const clean = toVarName(val);
                  onChange({
                    ...step,
                    outputVariable: clean,
                    name: `Variable: ${clean}`,
                  });
                }}
                placeholder="e.g. myVar"
              />
            </div>

            {/* Declaration Kind: let vs const */}
            <div className="flex flex-col gap-1 sm:col-span-3">
              <Label className="text-[10px] text-muted-foreground font-medium">Declaration</Label>
              <div className="flex items-center gap-1 h-7 p-0.5 bg-background/60 border border-border/60 rounded-md">
                <button
                  type="button"
                  className={`flex-1 h-full rounded text-xs font-mono font-medium transition-colors ${
                    declarationKind === "let"
                      ? "bg-blue-500/20 text-blue-300 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onChange({ ...step, declarationKind: "let" })}
                  title="Mutable variable (can be reassigned later)"
                >
                  let
                </button>
                <button
                  type="button"
                  className={`flex-1 h-full rounded text-xs font-mono font-medium transition-colors ${
                    declarationKind === "const"
                      ? "bg-amber-500/20 text-amber-300 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onChange({ ...step, declarationKind: "const" })}
                  title="Constant binding (reference cannot be reassigned)"
                >
                  const
                </button>
              </div>
            </div>

            {/* Data Type Annotation: TypeScript Primitives + TypesNode Custom Types + [] Array Toggle */}
            <div className="flex flex-col gap-1 sm:col-span-5">
              <Label className="text-[10px] text-muted-foreground font-medium">Type</Label>
              <div className="flex items-center gap-1">
                <TypeCombobox
                  value={baseDataType || "string"}
                  onValueChange={(selected) => {
                    const { baseType: cleanBase } = parseVariableTypeParts(selected);
                    applyDataTypeChange(formatVariableType(cleanBase || selected, isArrayType));
                  }}
                  allNodes={allNodes}
                  primitivePreset="typescript"
                  wrapperClassName="flex-1 min-w-0"
                  className="h-7 w-full text-xs font-mono bg-background/60 border border-border/60"
                  placeholder="Type..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={
                    isArrayType
                      ? "Array type active (click to make single)"
                      : "Single type (click to make array [])"
                  }
                  className={cn(
                    "h-7 px-2 font-mono text-xs font-bold shrink-0 rounded transition-all cursor-pointer",
                    isArrayType
                      ? "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 ring-1 ring-primary/30"
                      : "bg-secondary/60 text-muted-foreground/80 hover:bg-secondary hover:text-foreground border border-border/40",
                  )}
                  onClick={() => {
                    applyDataTypeChange(formatVariableType(baseDataType, !isArrayType));
                  }}
                >
                  []
                </Button>
              </div>
            </div>
          </div>

          {/* Initial Value Source Editor */}
          <div className="flex flex-col gap-1 pt-1.5 border-t border-border/30">
            <Label className="text-[10px] text-muted-foreground font-medium">Initial Value</Label>
            <BindingSourceEditor
              binding={currentBinding}
              availableSources={availableSources}
              serviceNodeId={serviceNodeId}
              onChange={handleSourceChange}
            />
          </div>
        </div>
      )}

      {/* Mode B: Update / Reassign Variable */}
      {variableOperation === "assign" && (
        <div className="flex flex-col gap-2.5 p-2.5 rounded-lg border border-border/50 bg-background/40">
          {priorVariables.length === 0 && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>
                No variables declared in prior steps yet. Declare a variable step above first.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Target Variable Combobox */}
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground font-medium">
                Target Variable <span className="text-muted-foreground/60">(from prior steps)</span>
              </Label>
              <TargetVariableCombobox
                value={step.outputVariable ?? ""}
                priorVariables={priorVariables}
                onSelect={(chosenName, chosenVar) => {
                  let nextMutation = step.variableMutationKind || "variable";
                  let nextOp = step.variableOperator || "=";

                  if (chosenVar?.isArray) {
                    nextMutation = "array_push";
                    nextOp = "push";
                  } else if (chosenVar?.isObject && !chosenVar.isMutable) {
                    nextMutation = "property";
                    if (nextOp === "push") nextOp = "=";
                  } else if (chosenVar?.isMutable) {
                    if (nextOp === "push") nextOp = "=";
                  }

                  onChange({
                    ...step,
                    outputVariable: chosenName,
                    variableMutationKind: nextMutation,
                    variableOperator: nextOp,
                    name: `Assign ${chosenName}`,
                  });
                }}
              />
            </div>

            {/* Operator or Action */}
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground font-medium">Operator</Label>
              {variableMutationKind === "array_push" ? (
                <div className="flex items-center h-7 px-2 bg-background/60 border border-border/60 rounded-md text-xs font-mono font-semibold text-purple-300">
                  .push(item)
                </div>
              ) : (
                <Select
                  value={variableOperator === "push" ? "=" : variableOperator}
                  onValueChange={(val) => {
                    if (val === "=" || val === "+=" || val === "-=") {
                      onChange({
                        ...step,
                        variableOperator: val,
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs font-mono bg-background/60 border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="=" className="text-xs font-mono font-semibold">
                      = (Assign)
                    </SelectItem>
                    <SelectItem value="+=" className="text-xs font-mono font-semibold">
                      += (Add / Append)
                    </SelectItem>
                    <SelectItem value="-=" className="text-xs font-mono font-semibold">
                      -= (Subtract)
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Mutation Mode Selector (When target is Object or Array) */}
          {selectedVarInfo && (selectedVarInfo.isObject || selectedVarInfo.isArray) && (
            <div className="flex flex-col gap-1.5 p-2 rounded-md bg-secondary/30 border border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Mutation Action:</span>
                <span className="text-[10px] text-muted-foreground/70 font-mono">
                  {selectedVarInfo.declarationKind} {selectedVarInfo.dataType}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Option 1: Root Reassign */}
                <button
                  type="button"
                  disabled={!selectedVarInfo.isMutable}
                  className={`flex-1 py-1 px-2 rounded text-[10px] font-mono transition-colors ${
                    variableMutationKind === "variable"
                      ? "bg-background text-foreground border border-border/80 shadow-xs font-medium"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  } ${!selectedVarInfo.isMutable ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => {
                    onChange({
                      ...step,
                      variableMutationKind: "variable",
                      variableOperator: variableOperator === "push" ? "=" : variableOperator,
                      variablePropertyPath: undefined,
                    });
                  }}
                  title={
                    selectedVarInfo.isMutable
                      ? "Reassign the entire variable reference"
                      : "Root reassignment requires 'let'. Switch the origin step declaration to 'let'."
                  }
                >
                  Whole Variable (=)
                </button>

                {/* Option 2: Object Property */}
                {selectedVarInfo.isObject && (
                  <button
                    type="button"
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-mono transition-colors flex items-center justify-center gap-1 ${
                      variableMutationKind === "property"
                        ? "bg-background text-emerald-300 border border-border/80 shadow-xs font-medium"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                    onClick={() => {
                      const firstProp = selectedVarInfo.knownProperties[0] || "";
                      onChange({
                        ...step,
                        variableMutationKind: "property",
                        variableOperator: variableOperator === "push" ? "=" : variableOperator,
                        variablePropertyPath: step.variablePropertyPath || firstProp,
                      });
                    }}
                  >
                    <Layers size={11} />
                    <span>Update Property (.prop)</span>
                  </button>
                )}

                {/* Option 3: Array Push */}
                {selectedVarInfo.isArray && (
                  <button
                    type="button"
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-mono transition-colors flex items-center justify-center gap-1 ${
                      variableMutationKind === "array_push"
                        ? "bg-background text-purple-300 border border-border/80 shadow-xs font-medium"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                    onClick={() => {
                      onChange({
                        ...step,
                        variableMutationKind: "array_push",
                        variableOperator: "push",
                      });
                    }}
                  >
                    <Brackets size={11} />
                    <span>Append / Push (.push)</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sub-field: Property Path when in Property Mutation mode */}
          {variableMutationKind === "property" && (
            <div className="flex flex-col gap-1 p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20">
              <Label className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                <Layers size={11} />
                <span>Object Property to Mutate</span>
                <span className="text-muted-foreground/60 font-mono">({varName}.&lt;property&gt;)</span>
              </Label>
              {selectedVarInfo?.knownProperties && selectedVarInfo.knownProperties.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <Select
                    value={step.variablePropertyPath || selectedVarInfo.knownProperties[0]}
                    onValueChange={(val) => {
                      onChange({
                        ...step,
                        variablePropertyPath: val,
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs font-mono bg-background/60 border-border/60 flex-1">
                      <SelectValue placeholder="Select known property..." />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedVarInfo.knownProperties.map((prop) => (
                        <SelectItem key={prop} value={prop} className="text-xs font-mono">
                          {prop}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BufferedInput
                    className="h-7 text-xs font-mono bg-background/60 border-border/60 w-36"
                    value={step.variablePropertyPath ?? ""}
                    onCommit={(val) => {
                      onChange({
                        ...step,
                        variablePropertyPath: val.trim(),
                      });
                    }}
                    placeholder="or custom prop"
                  />
                </div>
              ) : (
                <BufferedInput
                  className="h-7 text-xs font-mono bg-background/60 border-border/60"
                  value={step.variablePropertyPath ?? ""}
                  onCommit={(val) => {
                    onChange({
                      ...step,
                      variablePropertyPath: val.trim(),
                    });
                  }}
                  placeholder="e.g. status or profile.email"
                />
              )}
            </div>
          )}

          {/* Warning for Const Primitives */}
          {selectedVarInfo &&
            !selectedVarInfo.isMutable &&
            !selectedVarInfo.isObject &&
            !selectedVarInfo.isArray &&
            variableMutationKind === "variable" && (
              <div className="flex items-start gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] leading-tight">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>
                  <strong>{varName}</strong> was declared with <code>const</code> in{" "}
                  {selectedVarInfo.stepName}. Primitive values cannot be reassigned. Switch that step&apos;s
                  declaration to <code>let</code> to enable reassignment.
                </span>
              </div>
            )}

          {/* New Value Source Editor */}
          <div className="flex flex-col gap-1 pt-1.5 border-t border-border/30">
            <Label className="text-[10px] text-muted-foreground font-medium">
              {variableMutationKind === "array_push" ? "Item to Push" : "New Value"}
            </Label>
            <BindingSourceEditor
              binding={currentBinding}
              availableSources={availableSources}
              serviceNodeId={serviceNodeId}
              onChange={handleSourceChange}
            />
          </div>
        </div>
      )}

      {/* Code Generation Preview Bar */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 text-[11px] font-mono text-muted-foreground">
        <Code2 size={12} className="text-primary/70 shrink-0" />
        <span className="text-[10px] text-muted-foreground/60 select-none">emits:</span>
        <span className="text-foreground/90 font-medium truncate">{previewCode}</span>
      </div>
    </div>
  );
};
