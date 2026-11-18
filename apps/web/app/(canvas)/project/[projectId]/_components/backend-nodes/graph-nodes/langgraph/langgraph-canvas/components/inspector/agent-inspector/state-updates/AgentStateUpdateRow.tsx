import React, { useMemo } from "react";
import {
  Sparkles,
  Trash2,
  Code2,
  Info,
  AlertTriangle,
  Braces,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@workspace/ui/components/select";
import type {
  LangGraphStateChannel,
  LangGraphCustomReducer,
  LangGraphStateUpdateItem,
  StateUpdateSource,
  CustomTypeItem,
} from "@workspace/canvas";
import type { Parameter } from "@/types/canvas";
import { BindingSourceEditor } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor";
import type { AvailableSource, StepBinding } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/types";
import type {
  ReferenceStep,
  TransformerStepLike,
} from "./types";
import {
  getChannelMeta,
  getActionsForReducer,
  isValuelessAction,
  extractFieldsFromCustomType,
  generateDispatchBodyForChannel,
  stateUpdateToBinding,
  bindingToStateUpdate,
} from "./utils";

export interface AgentStateUpdateRowProps {
  su: LangGraphStateUpdateItem;
  sIdx: number;
  stateChannels: LangGraphStateChannel[];
  availableCustomTypes: CustomTypeItem[];
  customReducers: LangGraphCustomReducer[];
  schemaFields: Parameter[];
  transformerSteps: TransformerStepLike[];
  availableSources: AvailableSource[];
  isStructured: boolean;
  isJsonOverride?: boolean;
  onToggleJsonOverride: () => void;
  onUpdateRow: (updater: (prev: LangGraphStateUpdateItem) => LangGraphStateUpdateItem) => void;
  onRemoveRow: () => void;
  // Legacy / testing props
  activeRefStep?: string;
  onChangeRefStep?: (stepId: string) => void;
  activeRefField?: string;
  onChangeRefField?: (fieldPath: string) => void;
  availableReferenceSteps?: ReferenceStep[];
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
  onInsertRefAtCursor?: (refString: string) => void;
  isCustomAction?: boolean;
  onToggleCustomAction?: () => void;
}

export function AgentStateUpdateRow({
  su,
  sIdx,
  stateChannels,
  availableCustomTypes,
  customReducers,
  schemaFields,
  transformerSteps,
  availableSources,
  isStructured,
  isJsonOverride,
  onToggleJsonOverride,
  onUpdateRow,
  onRemoveRow,
}: AgentStateUpdateRowProps) {
  const channelMeta = getChannelMeta(
    su.channelKey,
    stateChannels,
    customReducers,
    availableCustomTypes,
  );
  const channelDisplayType = channelMeta.displayType;
  const isCustomChannel = Boolean(channelMeta.customTypeName || channelMeta.customTypeSchema);
  const customFields = extractFieldsFromCustomType(channelMeta.customTypeSchema);

  const expectsJson =
    channelMeta.type === "object" ||
    channelMeta.reducer === "merge_object" ||
    isCustomChannel;

  const currentSource: StateUpdateSource =
    su.source ||
    (isStructured && su.schemaField
      ? "structured_field"
      : su.mode === "expression"
        ? "expression"
        : expectsJson
          ? "expression"
          : "message_content");

  const matchedSchemaField = schemaFields.find(
    (f) => f.name === (su.schemaField || su.value),
  );

  // Type mismatch check
  const hasTypeMismatch = Boolean(
    currentSource === "structured_field" &&
      matchedSchemaField &&
      (isCustomChannel
        ? matchedSchemaField.type !== channelMeta.customTypeName &&
          matchedSchemaField.type !== "object"
        : channelMeta.type !== "object" &&
          matchedSchemaField.type &&
          !matchedSchemaField.type.startsWith(channelMeta.type) &&
          !(
            channelMeta.type === "array" &&
            matchedSchemaField.type.endsWith("[]")
          )),
  );

  // Available actions for this channel and reducer (auto-detected)
  const availableActions = getActionsForReducer(
    channelMeta.type,
    channelMeta.reducer,
    channelMeta.customCode,
  );

  const currentAction = su.action || "default";
  const isValueless = isValuelessAction(currentAction);

  const selectedActionValue = React.useMemo(() => {
    const act = su.action;
    if (!act || act === "custom") return availableActions[0]?.action || "default";
    const matched = availableActions.find((a) => a.action === act || a.aliases?.includes(act));
    return matched ? matched.action : act;
  }, [su.action, availableActions]);

  // Row mode: JSON textarea mode vs single line
  const isRowJsonMode =
    isJsonOverride !== undefined
      ? isJsonOverride
      : expectsJson ||
        Boolean(su.value && (su.value.includes("\n") || su.value.trim().startsWith("{")));

  // Format value description for footer preview
  const displayVal =
    su.value !== undefined && su.value !== "" && (expectsJson ? su.value !== "response.content" : true)
      ? su.value
      : expectsJson
        ? generateDispatchBodyForChannel(
            channelMeta.channel,
            availableCustomTypes,
            schemaFields,
            transformerSteps,
          )
        : currentSource === "structured_field"
          ? (su.schemaField ? `response.${su.schemaField}` : (su.value || ""))
          : currentSource === "structured_full"
            ? "response"
            : currentSource === "message_content"
              ? "response.content"
              : currentSource === "message_object"
                ? "response"
                : "";

  const valueDisplay = displayVal || (isValueless ? "" : '""');

  // Convert to StepBinding for BindingSourceEditor
  const binding = useMemo(
    () => stateUpdateToBinding(su, schemaFields, availableSources),
    [su, schemaFields, availableSources],
  );

  const handleBindingChange = (updated: StepBinding) => {
    onUpdateRow((prev) => bindingToStateUpdate(updated, prev, schemaFields, availableSources));
  };

  const handleGenerateBody = () => {
    const body = generateDispatchBodyForChannel(
      channelMeta.channel,
      availableCustomTypes,
      schemaFields,
      transformerSteps,
    );
    onUpdateRow((prev) => ({
      ...prev,
      source: "expression",
      mode: "expression",
      value: body,
    }));
  };

  const handleChannelSelect = (newChannelKey: string) => {
    const chMeta = getChannelMeta(newChannelKey, stateChannels, customReducers, availableCustomTypes);
    const isCustom = Boolean(chMeta.customTypeName || chMeta.customTypeSchema);
    const chExpectsJson = chMeta.type === "object" || chMeta.reducer === "merge_object" || isCustom;
    const isTargetMessages = newChannelKey === "messages" || chMeta.type === "messages";

    let nextValue = su.value;
    let nextSource = su.source;
    let nextMode = su.mode;

    if (
      chExpectsJson &&
      (!nextValue ||
        nextValue === "response.content" ||
        nextValue === "${response.content}" ||
        nextSource === "message_content" ||
        nextValue.includes('"${'))
    ) {
      nextValue = generateDispatchBodyForChannel(
        chMeta.channel,
        availableCustomTypes,
        schemaFields,
        transformerSteps,
        "response.content",
      );
      nextSource = "expression";
      nextMode = "expression";
    } else if (
      isTargetMessages &&
      (!nextValue ||
        nextValue === "response.content" ||
        nextValue === "${response.content}" ||
        nextValue === "${response}")
    ) {
      nextValue = "response";
      nextSource = "message_object";
      nextMode = "set";
    }

    const chActions = getActionsForReducer(
      chMeta.type,
      chMeta.reducer,
      chMeta.customCode,
    );
    const validAction = chActions.some((a) => a.action === su.action)
      ? su.action
      : (chActions[0]?.action || "default");

    onUpdateRow((current) => ({
      ...current,
      channelKey: newChannelKey,
      reducer: chMeta.reducer,
      action: validAction,
      value: nextValue,
      source: nextSource,
      mode: nextMode,
    }));
  };

  const handleActionSelect = (newAction: string) => {
    const valueless = isValuelessAction(newAction);

    onUpdateRow((current) => {
      if (valueless) {
        return {
          ...current,
          action: newAction,
          source: "none",
          value: undefined,
          schemaField: undefined,
        };
      }

      let nextValue = current.value;
      let nextSource = current.source === "none" ? undefined : current.source;
      let nextField = current.schemaField;

      if (!nextSource) {
        if (isStructured && schemaFields.length > 0) {
          nextSource = "structured_field";
          nextField = schemaFields[0]?.name;
          nextValue = nextField ? nextField : undefined;
        } else if (expectsJson) {
          nextSource = "expression";
          nextValue = generateDispatchBodyForChannel(
            channelMeta.channel,
            availableCustomTypes,
            schemaFields,
            transformerSteps,
          );
        } else {
          nextSource = "message_content";
          nextValue = "response.content";
        }
      }

      return {
        ...current,
        action: newAction,
        source: nextSource,
        value: nextValue,
        schemaField: nextField,
      };
    });
  };

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-xl border bg-background/60 text-xs shadow-xs transition-all hover:border-border/80">
      {/* ─── Main Mapping Row (PipelineStepEditor style) ─── */}
      <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
        {/* 1. Target Channel */}
        <div className="w-[160px] shrink-0">
          <Select value={su.channelKey} onValueChange={handleChannelSelect}>
            <SelectTrigger className="h-7 text-xs bg-background font-mono truncate">
              <SelectValue placeholder="Select channel..." />
            </SelectTrigger>
            <SelectContent>
              {stateChannels.map((c) => {
                const typeLabel = getChannelMeta(
                  c.key,
                  stateChannels,
                  customReducers,
                  availableCustomTypes,
                ).displayType;
                return (
                  <SelectItem key={c.key} value={c.key} className="text-xs font-mono">
                    <span>{c.key}</span>
                    <span className="text-[10px] text-muted-foreground ml-1 font-sans">
                      [{typeLabel}]
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Reducer Action Dropdown */}
        <div className="w-[140px] shrink-0">
          <Select
            value={selectedActionValue}
            onValueChange={handleActionSelect}
          >
            <SelectTrigger className="h-7 text-xs bg-background font-mono truncate border-border/80">
              <SelectValue placeholder="Action..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px] font-sans text-muted-foreground">
                  Detected Actions ({channelMeta.reducer})
                </SelectLabel>
                {availableActions.map((act) => (
                  <SelectItem key={act.action} value={act.action} className="text-xs font-mono">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="flex items-center gap-1 font-semibold text-foreground">
                        {act.action !== "default" && <span className="text-amber-500">⚡</span>}
                        <span>{act.label}</span>
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Arrow: ← */}
        <span className="text-[11px] text-muted-foreground/50 font-mono px-0.5 select-none shrink-0">
          ←
        </span>

        {/* 3. Value / Source Mapping (BindingSourceEditor) */}
        {isValueless ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/50 border border-border text-muted-foreground text-[11px] font-mono flex-1 min-w-[200px]">
            <Info className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
            <span>No value required ({su.action || "action"})</span>
          </div>
        ) : (
          <div className="flex-1 min-w-[240px]">
            <BindingSourceEditor
              binding={binding}
              availableSources={availableSources}
              placeholder={
                isStructured && schemaFields.length > 0
                  ? `response.${schemaFields[0]?.name || "field"}`
                  : "response.content or ${response.content}"
              }
              textareaPlaceholder={
                generateDispatchBodyForChannel(
                  channelMeta.channel,
                  availableCustomTypes,
                  schemaFields,
                  transformerSteps,
                ) ||
                (customFields.length > 0
                  ? `{\n${customFields.map((f) => `  "${f.name}": \`\${response.${f.name}}\``).join(",\n")}\n}`
                  : `{\n  "field": \`\${response.content}\`\n}`)
              }
              isExpanded={isRowJsonMode}
              onToggleExpanded={onToggleJsonOverride}
              onChange={handleBindingChange}
              extraAction={
                (expectsJson || isCustomChannel) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] font-mono gap-1 border-purple-500/40 bg-purple-500/10 text-purple-300 hover:text-purple-100 hover:bg-purple-500/20 cursor-pointer shrink-0"
                    onClick={handleGenerateBody}
                    title={`Auto-generate dispatch JSON body matching ${channelDisplayType} schema`}
                  >
                    <Sparkles className="w-2.5 h-2.5 text-purple-400" />
                    <span>Auto-Generate Body</span>
                  </Button>
                ) : null
              }
            />
          </div>
        )}

        {/* Action Toggle (Single Line / JSON Active) for JSON or custom channels */}
        {!isValueless && (
          <Button
            type="button"
            size="sm"
            variant={isRowJsonMode ? "secondary" : "ghost"}
            className={`h-7 px-2 text-[9px] font-mono cursor-pointer shrink-0 ${
              isRowJsonMode
                ? "bg-purple-500/20 text-purple-200 border border-purple-500/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={onToggleJsonOverride}
            title="Toggle between single line and multiline expression editor"
          >
            <Code2 className="w-2.5 h-2.5 mr-1" />
            {isRowJsonMode ? "JSON Active" : "Single Line"}
          </Button>
        )}

        {/* Delete button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
          onClick={onRemoveRow}
          title="Remove state update"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Empty Textarea Helper Banner */}
      {isRowJsonMode && (!su.value || !su.value.trim()) && (
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-purple-950/30 border border-purple-500/30 text-[11px] text-purple-200">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>
              Dispatch body is empty. Generate template for <strong className="font-mono text-purple-300">{channelDisplayType}</strong>?
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-5 px-2 text-[10px] font-mono bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border-purple-500/40 gap-1 cursor-pointer"
            onClick={handleGenerateBody}
          >
            <Sparkles className="w-2.5 h-2.5 text-purple-300" />
            Generate Body
          </Button>
        </div>
      )}

      {/* Type Mismatch Warning */}
      {hasTypeMismatch && (
        <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/30 p-1.5 rounded-md">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Type mismatch: Channel is {channelDisplayType}, but mapped field &apos;{matchedSchemaField?.name}&apos; is {matchedSchemaField?.type}.
          </span>
        </div>
      )}

      {/* Contract & Channel Type Footer */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 px-1 font-mono pt-1 border-t border-border/20">
        <span className="truncate">
          {su.action && su.action !== "default" ? (
            isValueless ? (
              <>
                Dispatches:{" "}
                <span className="text-amber-300 font-bold">
                  &#123; action: &quot;{su.action}&quot; &#125;
                </span>{" "}
                ➔{" "}
                <span className="text-sky-300 font-bold">
                  {channelMeta.reducer}
                </span>
              </>
            ) : (
              <>
                Dispatches:{" "}
                <span className="text-amber-300 font-bold">
                  &#123; action: &quot;{su.action}&quot;, value:{" "}
                  <span className="text-purple-300">{valueDisplay}</span>{" "}
                  &#125;
                </span>{" "}
                ➔{" "}
                <span className="text-sky-300 font-bold">
                  {channelMeta.reducer}
                </span>
              </>
            )
          ) : (
            <>
              Dispatches:{" "}
              <span className="text-purple-300 font-bold">{valueDisplay}</span> ➔{" "}
              <span className="text-sky-300 font-bold">
                {channelMeta.reducer}
              </span>
            </>
          )}
        </span>
        <span className="text-[9px] text-muted-foreground/60 shrink-0 ml-2 flex items-center gap-1 font-mono">
          <span>channel:</span>
          {channelMeta.customTypeName ? (
            <span className="text-cyan-400 font-semibold flex items-center gap-0.5">
              <Braces className="w-2.5 h-2.5" />
              {channelMeta.customTypeName}
            </span>
          ) : (
            <span>{channelMeta.type}</span>
          )}
        </span>
      </div>
    </div>
  );
}
