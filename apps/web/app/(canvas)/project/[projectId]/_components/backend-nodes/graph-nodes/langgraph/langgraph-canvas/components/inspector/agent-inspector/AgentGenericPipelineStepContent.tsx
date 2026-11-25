"use client";

import React, { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type {
  PipelineStepDraft,
  LangGraphStateChannel,
} from "@workspace/canvas";
import {
  AvailableSource,
  useStepRowState,
  ArgumentBindingsSection,
  DbOperationStepSection,
  RedisOperationStepSection,
  KafkaPublishStepSection,
  ServiceCallStepSection,
  ExternalCallStepSection,
  VariableStepSection,
  ConditionStepSection,
  TryCatchStepSection,
  SwitchStepSection,
  ParallelStepSection,
  LoopStepSection,
  PushToClientStepSection,
  GenericFunctionRefSection,
} from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor";
import { BufferedInput } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor";
import { StorageOperationStepSection } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/StorageOperationStepSection";

const HAS_OUTPUT_VAR_TYPES = new Set([
  "variable",
  "transform",
  "transformer",
  "db_operation",
  "redis_operation",
  "storage_operation",
  "kafka_publish",
  "service_call",
  "external_call",
  "custom_code",
]);

interface AgentGenericPipelineStepContentProps {
  step: PipelineStepDraft;
  index: number;
  priorSteps: PipelineStepDraft[];
  allSteps?: PipelineStepDraft[];
  stateChannels?: LangGraphStateChannel[];
  onUpdateStep: (updatedStep: PipelineStepDraft) => void;
}

export function AgentGenericPipelineStepContent({
  step,
  index,
  priorSteps,
  allSteps,
  stateChannels = [],
  onUpdateStep,
}: AgentGenericPipelineStepContentProps) {
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const allNodes = useBackendCanvasStore((s) => s.nodes) || [];
  const allEdges = useBackendCanvasStore((s) => s.edges) || [];

  // Build state extra source representing the LangGraph graph state
  const extraSources = useMemo<AvailableSource[]>(() => {
    return [
      {
        id: "state",
        label: "Graph State (state)",
        kind: "state",
        rootVariableName: "state",
        paths: stateChannels.map((c) => ({
          path: c.key,
          type: c.type || "string",
          description: c.defaultValue !== undefined ? String(c.defaultValue) : `State channel: ${c.key}`,
        })),
      },
    ];
  }, [stateChannels]);

  const {
    availableSources,
    selectedDbId,
    expectedArgs,
    isUnconfigured,
    handleAutoMapArguments,
    updateBinding,
    addBinding,
    removeBinding,
  } = useStepRowState({
    step,
    index,
    priorSteps,
    allNodes,
    allEdges,
    extraSources,
    onChange: onUpdateStep,
  });

  const argumentBindingsSection = (
    <ArgumentBindingsSection
      bindings={step.inputBindings || []}
      expectedArgs={expectedArgs}
      availableSources={availableSources}
      onAddBinding={addBinding}
      onUpdateBinding={updateBinding}
      onRemoveBinding={removeBinding}
      onAutoMapArguments={handleAutoMapArguments}
    />
  );

  const hasOutputVar = HAS_OUTPUT_VAR_TYPES.has(step.type) && step.type !== "variable";

  return (
    <div className="flex flex-col gap-3">
      {/* Unconfigured Warning Banner */}
      {isUnconfigured && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-[11px]">
          <AlertTriangle size={12} className="shrink-0" />
          <span>Input variables for this step are not configured. Map the arguments below.</span>
        </div>
      )}

      {/* Output Variable Configuration Header */}
      {hasOutputVar && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg border border-border/40 bg-card/40">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground font-medium">
                {step.declarationKind === "reassign" ? "Target Variable" : "Output Variable"}
              </Label>
              {/* Segmented Toggle: const | let | reassign */}
              <div className="flex items-center rounded-sm bg-muted/60 p-0.5 border border-border/40 text-[9px]">
                <button
                  type="button"
                  className={`px-1.5 py-0.2 rounded-xs font-mono transition-colors ${
                    !step.declarationKind || step.declarationKind === "const"
                      ? "bg-background text-purple-300 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onUpdateStep({ ...step, declarationKind: "const" })}
                  title="Declare immutable const variable"
                >
                  const
                </button>
                <button
                  type="button"
                  className={`px-1.5 py-0.2 rounded-xs font-mono transition-colors ${
                    step.declarationKind === "let"
                      ? "bg-background text-blue-300 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onUpdateStep({ ...step, declarationKind: "let" })}
                  title="Declare mutable let variable"
                >
                  let
                </button>
                <button
                  type="button"
                  className={`px-1.5 py-0.2 rounded-xs font-mono transition-colors ${
                    step.declarationKind === "reassign"
                      ? "bg-background text-amber-300 font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onUpdateStep({ ...step, declarationKind: "reassign" })}
                  title="Reassign existing variable"
                >
                  reassign
                </button>
              </div>
            </div>
            <BufferedInput
              className="h-7 text-xs font-mono bg-background/60 border-border/60"
              value={step.outputVariable ?? ""}
              onCommit={(val) => {
                onUpdateStep({ ...step, outputVariable: val });
              }}
              placeholder="outputVariableName"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground font-medium">
              Description <span className="text-muted-foreground/50 font-normal">(optional)</span>
            </Label>
            <BufferedInput
              className="h-7 text-xs bg-background/60 border-border/60"
              value={step.description ?? ""}
              onCommit={(val) => {
                onUpdateStep({ ...step, description: val });
              }}
              placeholder="Step notes or purpose..."
            />
          </div>
        </div>
      )}

      {/* Main Step Type Configuration */}
      {(() => {
        if (step.type === "db_operation") {
          return (
            <DbOperationStepSection
              step={step}
              allSteps={allSteps}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              availableSources={availableSources}
              selectedDbId={selectedDbId}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </DbOperationStepSection>
          );
        }

        if (step.type === "redis_operation") {
          return (
            <RedisOperationStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              availableSources={availableSources}
              selectedDbId={selectedDbId}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </RedisOperationStepSection>
          );
        }

        if (step.type === "storage_operation") {
          return (
            <StorageOperationStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              availableSources={availableSources}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </StorageOperationStepSection>
          );
        }

        if (step.type === "kafka_publish") {
          return (
            <KafkaPublishStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </KafkaPublishStepSection>
          );
        }

        if (step.type === "service_call") {
          return (
            <ServiceCallStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </ServiceCallStepSection>
          );
        }

        if (step.type === "external_call") {
          return (
            <ExternalCallStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              showAdvancedSettings={showAdvancedSettings}
              onToggleAdvancedSettings={() => setShowAdvancedSettings((v) => !v)}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </ExternalCallStepSection>
          );
        }

        if (step.type === "variable") {
          return (
            <VariableStepSection
              step={step}
              priorSteps={priorSteps}
              availableSources={availableSources}
              allNodes={allNodes}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "condition") {
          return (
            <ConditionStepSection
              step={step}
              priorSteps={priorSteps}
              availableSources={availableSources}
              allNodes={allNodes}
              allEdges={allEdges}
              depth={0}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "try_catch") {
          return (
            <TryCatchStepSection
              step={step}
              availableSources={availableSources}
              allNodes={allNodes}
              allEdges={allEdges}
              depth={0}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "switch") {
          return (
            <SwitchStepSection
              step={step}
              availableSources={availableSources}
              allNodes={allNodes}
              allEdges={allEdges}
              depth={0}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "parallel") {
          return (
            <ParallelStepSection
              step={step}
              availableSources={availableSources}
              allNodes={allNodes}
              allEdges={allEdges}
              depth={0}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "loop") {
          return (
            <LoopStepSection
              step={step}
              availableSources={availableSources}
              allNodes={allNodes}
              allEdges={allEdges}
              depth={0}
              onChange={onUpdateStep}
            />
          );
        }

        if (step.type === "push_to_client") {
          return (
            <PushToClientStepSection
              step={step}
              allNodes={allNodes}
              allEdges={allEdges}
              expectedArgs={expectedArgs}
              availableSources={availableSources}
              onChange={onUpdateStep}
              onAutoMapArguments={handleAutoMapArguments}
            >
              {argumentBindingsSection}
            </PushToClientStepSection>
          );
        }

        return (
          <GenericFunctionRefSection
            step={step}
            onChange={onUpdateStep}
          >
            {argumentBindingsSection}
          </GenericFunctionRefSection>
        );
      })()}
    </div>
  );
}
