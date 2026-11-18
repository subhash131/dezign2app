import React, { useMemo } from "react";
import { Code2, X, Check, Sparkles } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Label } from "@workspace/ui/components/label";
import { LocalInput, LocalTextarea } from "../../../../../../common";
import { TargetVariableCombobox } from "./TargetVariableCombobox";
import {
  REDUCER_CODE_PRESETS,
  extractActionsFromReducerCode,
  extractActionGroupsFromReducerCode,
  getActionMetadata,
} from "../constants";
import type { LangGraphStateChannel } from "@/types/canvas";

interface EditCustomReducerFormProps {
  availableFieldKeys: string[];
  stateChannels: LangGraphStateChannel[];
  editTargetField: string;
  editTargetFieldInput: string;
  editReducerName: string;
  editReducerCode: string;
  editReducerDesc: string;
  onSelectTargetField: (val: string) => void;
  onTargetFieldInputChange: (text: string) => void;
  onReducerNameChange: (name: string) => void;
  onReducerCodeChange: (code: string) => void;
  onReducerDescChange: (desc: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditCustomReducerForm({
  availableFieldKeys,
  stateChannels,
  editTargetField,
  editTargetFieldInput,
  editReducerName,
  editReducerCode,
  editReducerDesc,
  onSelectTargetField,
  onTargetFieldInputChange,
  onReducerNameChange,
  onReducerCodeChange,
  onReducerDescChange,
  onSave,
  onCancel,
}: EditCustomReducerFormProps) {
  const detectedActions = useMemo(() => {
    const groups = extractActionGroupsFromReducerCode(editReducerCode);
    if (groups.length > 0) {
      return groups.flatMap((group) => {
        const primary = group[0];
        return primary ? [getActionMetadata(primary, undefined, group)] : [];
      });
    }
    const actions = extractActionsFromReducerCode(editReducerCode);
    return actions.map((act) => getActionMetadata(act));
  }, [editReducerCode]);

  return (
    <div id="edit-custom-reducer-form" className="flex flex-col gap-2.5 p-2.5 rounded-xl border border-purple-500/50 bg-purple-500/10 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
          <Code2 className="w-3.5 h-3.5" /> Edit Custom Reducer
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <TargetVariableCombobox
        availableFieldKeys={availableFieldKeys}
        stateChannels={stateChannels}
        value={editTargetField}
        onSelectValue={onSelectTargetField}
        inputValue={editTargetFieldInput}
        onInputValueChange={onTargetFieldInputChange}
        labelSize="small"
        placeholder="Search state variable..."
        badgeLabel="Tied to state variable"
      />

      <div className="flex flex-col gap-1">
        <Label className="text-[9px] text-muted-foreground font-mono">
          Reducer Name
        </Label>
        <LocalInput
          className="h-7 text-xs font-mono font-medium bg-background"
          placeholder="reducer_name"
          value={editReducerName}
          onChange={(e) => onReducerNameChange(e.target.value)}
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-[9px] text-muted-foreground font-mono">
            Function Body (JavaScript)
          </Label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onReducerCodeChange(REDUCER_CODE_PRESETS.array)}
              className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-mono transition-colors cursor-pointer"
              title="Append array values"
            >
              +array
            </button>
            <button
              type="button"
              onClick={() => onReducerCodeChange(REDUCER_CODE_PRESETS.object)}
              className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-mono transition-colors cursor-pointer"
              title="Merge object keys"
            >
              +merge
            </button>
            <button
              type="button"
              onClick={() => onReducerCodeChange(REDUCER_CODE_PRESETS.number)}
              className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-mono transition-colors cursor-pointer"
              title="Sum numbers"
            >
              +sum
            </button>
          </div>
        </div>
        <LocalTextarea
          className="min-h-[72px] text-xs font-mono bg-background leading-relaxed p-2 resize-y"
          placeholder="(prev, next) => Array.isArray(prev) ? [...prev, ...next] : next"
          value={editReducerCode}
          onChange={(e) => onReducerCodeChange(e.target.value)}
          debounceMs={150}
        />

        {/* ── Auto-Detected Actions Live Validation Box ── */}
        <div className="flex flex-col gap-1 p-2 rounded-lg bg-purple-500/[0.08] border border-purple-500/20 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-purple-300 font-mono text-[9px] font-semibold">
              <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
              <span>Detected Actions ({detectedActions.length})</span>
            </div>
            <span className="text-[8px] text-muted-foreground font-mono">
              Live from code
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <Badge
              variant="outline"
              className="text-[8px] font-mono px-1.5 py-0.2 border border-purple-500/40 bg-purple-500/10 text-purple-200"
            >
              <span>default</span>
              <span className="ml-1 text-[7px] opacity-70">(direct)</span>
            </Badge>

            {detectedActions.map((act) => (
              <Badge
                key={act.action}
                variant="outline"
                className={`text-[8px] font-mono px-1.5 py-0.2 border transition-colors ${
                  act.requiresValue
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                }`}
                title={act.description}
              >
                <span>⚡ {act.label || act.action}</span>
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[9px] text-muted-foreground font-mono">
          Description (optional)
        </Label>
        <LocalInput
          className="h-7 text-xs bg-background"
          placeholder="Description"
          value={editReducerDesc}
          onChange={(e) => onReducerDescChange(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-1.5 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold gap-1 cursor-pointer"
          onClick={onSave}
          disabled={!editReducerName.trim()}
        >
          <Check className="w-3 h-3" /> Save Changes
        </Button>
      </div>
    </div>
  );
}
