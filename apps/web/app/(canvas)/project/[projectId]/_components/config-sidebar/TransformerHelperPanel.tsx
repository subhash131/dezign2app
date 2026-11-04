"use client";

import React, { useState } from "react";
import { TransformerHelperNodeData } from "@workspace/canvas/types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { TypeCombobox } from "./TypeCombobox";
import { toVarName } from "@/lib/compiler/utils";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash,
  Shuffle,
  Code2,
  AlignLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HelperField = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
};

type HelperDraft = Omit<TransformerHelperNodeData, "id"> & { id?: string };

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const TS_TYPES = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "Record<string, unknown>",
  "unknown",
  "Date",
];

// ---------------------------------------------------------------------------
// FieldListEditor — reusable for input/return schema sections
// ---------------------------------------------------------------------------

interface FieldListEditorProps {
  fields: HelperField[];
  onChange: (fields: HelperField[]) => void;
  placeholder?: string;
}

const FieldListEditor = ({ fields, onChange, placeholder }: FieldListEditorProps) => {
  const add = () =>
    onChange([...fields, { name: "", type: "string", required: true }]);
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<HelperField>) => {
    const next = [...fields];
    next[i] = { ...next[i]!, ...patch };
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[2fr_1.5fr_auto_auto] gap-1.5 items-center">
          <Input
            className="h-7 text-xs font-mono bg-background/60 border-border/60"
            value={f.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder={placeholder ?? "fieldName"}
          />
          <TypeCombobox
            value={f.type || "string"}
            onValueChange={(v) => update(i, { type: v })}
            className="w-full"
          />
          <button
            className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
              f.required === false
                ? "text-muted-foreground/50 border-border/40"
                : "text-primary/70 border-primary/30 bg-primary/5"
            }`}
            title={f.required === false ? "optional" : "required"}
            onClick={() => update(i, { required: !f.required })}
          >
            {f.required === false ? "opt" : "req"}
          </button>
          <button
            className="text-muted-foreground/40 hover:text-destructive transition-colors"
            onClick={() => remove(i)}
          >
            <Trash size={11} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors self-start pt-0.5"
        onClick={add}
      >
        <Plus size={10} />
        Add field
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// HelperCard — a single transformer helper (collapsed / expanded)
// ---------------------------------------------------------------------------

interface HelperCardProps {
  helper: HelperDraft & { id: string };
  onChange: (updated: HelperDraft & { id: string }) => void;
  onDelete: () => void;
}

const HelperCard = ({ helper, onChange, onDelete }: HelperCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<"input" | "logic" | "return">("input");

  const update = (patch: Partial<HelperDraft>) => onChange({ ...helper, ...patch });

  const sectionTabs = (
    <div className="flex rounded-md overflow-hidden border border-border/50 text-[10px] font-medium">
      {(["input", "logic", "return"] as const).map((s) => (
        <button
          key={s}
          className={`flex-1 py-1 transition-colors ${
            activeSection === s
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground/60 hover:bg-muted/30"
          }`}
          onClick={() => setActiveSection(s)}
        >
          {s === "input" ? "1. Input" : s === "logic" ? "2. Logic" : "3. Return"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Shuffle size={11} className="text-purple-400 shrink-0" />
        <span className="text-xs font-mono font-medium text-foreground/90 flex-1 truncate">
          {helper.name || "unnamed helper"}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
            helper.scope === "global"
              ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
              : "text-sky-400 bg-sky-500/10 border-sky-500/20"
          }`}
        >
          {helper.scope}
        </span>
        <button
          className="text-muted-foreground/40 hover:text-destructive transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash size={11} />
        </button>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground/40 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground/40 shrink-0" />
        )}
      </div>

      {/* Expanded 3-section editor */}
      {expanded && (
        <div className="border-t border-border/40 px-3 pt-3 pb-3 flex flex-col gap-3">
          {/* Name + Scope row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Function name (camelCase)</Label>
              <Input
                className="h-7 text-xs font-mono bg-background/60 border-border/60"
                value={helper.name}
                onChange={(e) => update({ name: toVarName(e.target.value) })}
                placeholder="slugifyProductInput"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Scope</Label>
              <Select
                value={helper.scope}
                onValueChange={(v) => update({ scope: v as "global" | "local" })}
              >
                <SelectTrigger className="h-7 text-xs bg-background/60 border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local (this service only)</SelectItem>
                  <SelectItem value="global">Global (shared package)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">Description (optional)</Label>
            <Input
              className="h-7 text-xs bg-background/60 border-border/60"
              value={helper.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="What does this transformation do?"
            />
          </div>

          {/* Section tabs */}
          {sectionTabs}

          {/* Section 1: Input */}
          {activeSection === "input" && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground/70">
                Define the typed input fields this function accepts.
              </p>
              <FieldListEditor
                fields={helper.inputSchema}
                onChange={(fields) => update({ inputSchema: fields })}
                placeholder="inputFieldName"
              />
            </div>
          )}

          {/* Section 2: Logic */}
          {activeSection === "logic" && (
            <div className="flex flex-col gap-2">
              {/* Mode toggle */}
              <div className="flex gap-1.5 text-[10px]">
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                    helper.logicMode === "code"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground/50 border-border/40 hover:bg-muted/20"
                  }`}
                  onClick={() => update({ logicMode: "code" })}
                >
                  <Code2 size={10} />
                  Code
                </button>
                <button
                  className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                    helper.logicMode === "natural_language"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "text-muted-foreground/50 border-border/40 hover:bg-muted/20"
                  }`}
                  onClick={() => update({ logicMode: "natural_language" })}
                >
                  <AlignLeft size={10} />
                  Natural language
                </button>
              </div>

              {helper.logicMode === "code" ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">
                    TypeScript body
                    <span className="ml-1 text-muted-foreground/50">(function body, return statement only)</span>
                  </Label>
                  <Textarea
                    className="text-xs font-mono bg-background/60 border-border/60 min-h-[100px] resize-y"
                    value={helper.code ?? ""}
                    onChange={(e) => update({ code: e.target.value })}
                    placeholder={`return {\n  slug: name.toLowerCase().replace(/\\s+/g, '-'),\n};`}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Describe the transformation
                  </Label>
                  <Textarea
                    className="text-xs bg-background/60 border-border/60 min-h-[80px] resize-y"
                    value={helper.prompt ?? ""}
                    onChange={(e) => update({ prompt: e.target.value })}
                    placeholder="e.g. Convert the product name to a URL-safe slug by lowercasing and replacing spaces with dashes"
                  />
                  <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                    AI will generate the implementation from this description at compile time.
                  </p>
                </div>
              )}

              {/* Async toggle */}
              <label className="flex items-center gap-2 text-[10px] text-muted-foreground/70 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={!!helper.isAsync}
                  onChange={(e) => update({ isAsync: e.target.checked })}
                />
                async function
              </label>
            </div>
          )}

          {/* Section 3: Return */}
          {activeSection === "return" && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-muted-foreground/70">
                Define the typed return fields — these are available as outputs in pipeline step bindings.
              </p>
              <FieldListEditor
                fields={helper.returnSchema}
                onChange={(fields) => update({ returnSchema: fields })}
                placeholder="returnFieldName"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// TransformerHelperPanel — main component
// ---------------------------------------------------------------------------

export interface TransformerHelperPanelProps {
  helpers: (TransformerHelperNodeData)[];
  serviceNodeId: string;
  onChange: (helpers: TransformerHelperNodeData[]) => void;
}

export const TransformerHelperPanel = ({
  helpers,
  serviceNodeId,
  onChange,
}: TransformerHelperPanelProps) => {
  const addHelper = () => {
    const id = generateId();
    onChange([
      ...helpers,
      {
        id,
        name: `transform${helpers.length + 1}`,
        scope: "local",
        targetServiceId: serviceNodeId,
        inputSchema: [],
        logicMode: "code",
        returnSchema: [],
        isAsync: false,
      },
    ]);
  };

  const updateHelper = (index: number, updated: TransformerHelperNodeData) => {
    const next = [...helpers];
    next[index] = updated;
    onChange(next);
  };

  const deleteHelper = (index: number) => {
    onChange(helpers.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-foreground/90">Transformer Helpers</p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            Pure data-transformation functions attached to this service.
            <br />
            Local scope compiles to <span className="font-mono">src/helpers/</span>.
            Global scope compiles to <span className="font-mono">@workspace/transformers</span>.
          </p>
        </div>
        <button
          className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 border border-purple-500/30 bg-purple-500/10 rounded px-2 py-1 transition-colors"
          onClick={addHelper}
        >
          <Plus size={10} />
          Add helper
        </button>
      </div>

      {/* List */}
      {helpers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-4 text-center">
          <Shuffle size={16} className="text-purple-400/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground/60">No transformer helpers yet.</p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">
            Add a helper to define a typed, pure data-transformation function.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {helpers.map((h, i) => (
            <HelperCard
              key={h.id}
              helper={h}
              onChange={(updated) => updateHelper(i, updated)}
              onDelete={() => deleteHelper(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
