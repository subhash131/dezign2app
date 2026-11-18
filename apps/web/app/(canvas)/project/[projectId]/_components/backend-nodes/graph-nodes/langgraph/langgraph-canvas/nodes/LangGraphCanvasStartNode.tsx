import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  Zap, Plus, Trash2, ChevronDown, Sparkles,
  ArrowRight, Globe, Sliders, ChevronsRight, Play, Check,
  Database, RefreshCw, Shuffle,
} from "lucide-react";
import {
  type StartNode,
  type LangGraphInputChannel,
  type LangGraphStateChannel,
  resolveInputTransition,
  isLangGraphInputTransition,
} from "@workspace/canvas";
import { Button } from "@workspace/ui/components/button";
import { LocalInput } from "../../../common";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@workspace/ui/components/combobox";
import { cn } from "@workspace/ui/lib/utils";

type InputChannelType = LangGraphInputChannel["type"];

const INPUT_CHANNEL_TYPES: readonly InputChannelType[] = [
  "string",
  "messages",
  "number",
  "boolean",
  "object",
  "array",
];

function isInputChannelType(val: string): val is InputChannelType {
  return (
    val === "string" ||
    val === "messages" ||
    val === "number" ||
    val === "boolean" ||
    val === "object" ||
    val === "array"
  );
}

const TYPE_COLORS: Record<InputChannelType, string> = {
  string:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  messages: "text-primary bg-primary/10 border-primary/30",
  number:   "text-blue-400 bg-blue-400/10 border-blue-400/30",
  boolean:  "text-rose-400 bg-rose-400/10 border-rose-400/30",
  object:   "text-purple-400 bg-purple-400/10 border-purple-400/30",
  array:    "text-orange-400 bg-orange-400/10 border-orange-400/30",
};

const STATE_TYPE_COLORS: Record<string, string> = {
  messages: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  string:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  number:   "text-sky-400 bg-sky-400/10 border-sky-400/30",
  boolean:  "text-rose-400 bg-rose-400/10 border-rose-400/30",
  array:    "text-orange-400 bg-orange-400/10 border-orange-400/30",
  object:   "text-purple-400 bg-purple-400/10 border-purple-400/30",
};

// ─── Inline channel row ───────────────────────────────────────────────────────
interface ChannelRowProps {
  ch: LangGraphInputChannel;
  idx: number;
  stateChannels: LangGraphStateChannel[];
  availableTransformers?: Array<{ id: string; name: string }>;
  onUpdate: (idx: number, changes: Partial<LangGraphInputChannel>) => void;
  onDelete: (idx: number) => void;
}

function ChannelRow({
  ch,
  idx,
  stateChannels,
  availableTransformers = [],
  onUpdate,
  onDelete,
}: ChannelRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const typeColor = TYPE_COLORS[ch.type] || TYPE_COLORS.string;
  const validStateChannels = stateChannels.filter((sc) => Boolean(sc.key?.trim()));
  const targetChannel = stateChannels.find((sc) => sc.key === ch.stateChannelKey);
  const resolvedTransition = resolveInputTransition(ch, targetChannel);
  const inferredTransition = resolveInputTransition(
    { ...ch, transition: undefined },
    targetChannel,
  );
  const inferredLabel =
    inferredTransition === "as_human_message"
      ? "HumanMessage"
      : inferredTransition === "append_to_list"
        ? "Append to List"
        : inferredTransition === "parse_json"
          ? "Parse JSON"
          : inferredTransition === "merge_object"
            ? "Merge Object"
            : "Direct";

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (e.target instanceof Node && rowRef.current?.contains(e.target)) {
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        e.target.closest(
          "[role='listbox'], [data-radix-popper-content-wrapper], [data-radix-focus-guard], [data-radix-select-viewport]",
        )
      ) {
        return;
      }
      setIsEditing(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing]);

  if (isEditing) {
    return (
      <div
        ref={rowRef}
        className="flex flex-col gap-1 px-2.5 py-1.5 bg-secondary/40 border-b border-border/40 nodrag nokey nowheel nopan"
        onClick={stop}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            e.stopPropagation();
            e.nativeEvent?.stopImmediatePropagation?.();
          }
        }}
      >
        {/* Key + type */}
        <div className="flex items-center gap-1">
          <LocalInput
            className="h-6 text-[10px] font-mono bg-background flex-1 nodrag nokey nowheel nopan"
            value={ch.key}
            autoFocus
            onChange={(e) => onUpdate(idx, { key: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Backspace" || e.key === "Delete") {
                e.stopPropagation();
                e.nativeEvent?.stopImmediatePropagation?.();
              }
              if (e.key === "Enter" || e.key === "Escape") {
                setIsEditing(false);
              }
            }}
            placeholder="field_key"
          />
          <Select
            value={ch.type}
            onValueChange={(v) => {
              if (isInputChannelType(v)) {
                onUpdate(idx, { type: v });
              }
            }}
          >
            <SelectTrigger className="h-6 w-[72px] text-[9px] font-mono bg-background nodrag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INPUT_CHANNEL_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs font-mono">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-emerald-400 shrink-0 nodrag"
            onClick={(e) => { stop(e); setIsEditing(false); }}
            title="Done"
          >
            <Check className="w-3 h-3 text-emerald-400" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0 nodrag"
            onClick={(e) => { stop(e); onDelete(idx); setIsEditing(false); }}
            title="Delete variable"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {/* State mapping */}
        <div className="flex items-center gap-1.5 pl-0.5">
          <ChevronsRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
          <span className="text-[8px] text-muted-foreground shrink-0">maps to state</span>
          <Select
            value={ch.stateChannelKey || "__none__"}
            onValueChange={(v) => onUpdate(idx, { stateChannelKey: v === "__none__" ? undefined : v })}
          >
            <SelectTrigger className="h-5 flex-1 text-[9px] font-mono bg-background nodrag">
              <SelectValue placeholder="none" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs text-muted-foreground">— none —</SelectItem>
              {validStateChannels.map((sc) => (
                <SelectItem key={sc.key} value={sc.key} className="text-xs font-mono">
                  {sc.key}
                  <span className="ml-1 text-[8px] text-muted-foreground">({sc.type})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Transition mode */}
        {ch.stateChannelKey && (
          <div className="flex items-center gap-1.5 pl-0.5">
            <Shuffle className="w-2.5 h-2.5 text-purple-400 shrink-0" />
            <span className="text-[8px] text-muted-foreground shrink-0">transition</span>
            <Select
              value={ch.transition || "__auto__"}
              onValueChange={(v) =>
                onUpdate(idx, {
                  transition: isLangGraphInputTransition(v) ? v : undefined,
                })
              }
            >
              <SelectTrigger className="h-5 flex-1 text-[9px] font-mono bg-background nodrag">
                <SelectValue placeholder="auto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__" className="text-xs font-mono">auto ({inferredLabel})</SelectItem>
                <SelectItem value="as_human_message" className="text-xs font-mono">HumanMessage (User Query)</SelectItem>
                <SelectItem value="append_to_list" className="text-xs font-mono">Append to List</SelectItem>
                <SelectItem value="merge_object" className="text-xs font-mono">Merge Object (Dict)</SelectItem>
                <SelectItem value="direct" className="text-xs font-mono">Direct Pass-through</SelectItem>
                <SelectItem value="parse_json" className="text-xs font-mono">Parse JSON String</SelectItem>
                <SelectItem value="transformer" className="text-xs font-mono text-purple-400 font-semibold">⚡ Transformer Node...</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Transformer node selector if transformer transition */}
        {ch.stateChannelKey && (ch.transition === "transformer" || ch.transformerRef) && (
          <div className="flex items-center gap-1.5 pl-0.5">
            <span className="text-[8px] text-purple-400 font-semibold shrink-0">transformer node</span>
            <Select
              value={ch.transformerRef || "__none__"}
              onValueChange={(v) => onUpdate(idx, {
                transformerRef: v === "__none__" ? undefined : v,
                transition: "transformer"
              })}
            >
              <SelectTrigger className="h-5 flex-1 text-[9px] font-mono bg-background nodrag text-purple-400">
                <SelectValue placeholder="select transformer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-muted-foreground">— select —</SelectItem>
                {availableTransformers.map((t) => (
                  <SelectItem key={t.id} value={t.name || t.id} className="text-xs font-mono">
                    {t.name || t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/20 hover:bg-secondary/20 transition-colors cursor-pointer group/row nodrag"
      onClick={(e) => { stop(e); setIsEditing(true); }}
    >
      {/* Type badge */}
      <span className={cn(
        "text-[7px] font-mono font-bold px-1 py-0.5 rounded border shrink-0 uppercase leading-none",
        typeColor,
      )}>
        {ch.type.slice(0, 3)}
      </span>

      {/* Key */}
      <span className="flex-1 text-[10px] font-mono text-foreground truncate min-w-0">
        {ch.key || <span className="text-muted-foreground italic">unnamed</span>}
        {ch.required && <span className="text-rose-400 ml-0.5 text-[8px]">*</span>}
      </span>

      {/* State mapping badge */}
      {ch.stateChannelKey ? (
        <div className="flex items-center gap-0.5 shrink-0 bg-[#006ddd]/10 px-1 py-0.5 rounded border border-[#006ddd]/20">
          <ArrowRight className="w-2.5 h-2.5 text-[#006ddd]" />
          <span className="text-[9px] font-mono font-medium text-[#006ddd] truncate max-w-[65px]">
            {ch.stateChannelKey}
          </span>
          <span className="text-[7px] font-mono text-muted-foreground/70 ml-0.5">
            {ch.transformerRef
              ? `(⚡${ch.transformerRef})`
              : resolvedTransition === "as_human_message"
                ? "(msg)"
                : resolvedTransition === "append_to_list"
                  ? "(+list)"
                  : resolvedTransition === "parse_json"
                    ? "(json)"
                    : resolvedTransition === "merge_object"
                      ? "(merge)"
                      : ""}
          </span>
        </div>
      ) : (
        <span className="text-[8px] text-muted-foreground/40 shrink-0 italic">unmapped</span>
      )}

      {/* Delete on hover */}
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0 nodrag"
        onMouseDown={(e) => { stop(e); onDelete(idx); }}
      >
        <Trash2 className="w-2.5 h-2.5" />
      </Button>
    </div>
  );
}

// ─── State Mapping Row ────────────────────────────────────────────────────────
interface StateMappingRowProps {
  sc: LangGraphStateChannel;
  allChannels: LangGraphInputChannel[];
  onMapToInput: (inputKeyOrId?: string) => void;
  onCreateInput: () => void;
}

function StateMappingRow({
  sc,
  allChannels,
  onMapToInput,
  onCreateInput,
}: StateMappingRowProps) {
  // Find which input channel maps to this state variable
  const mappedInput = allChannels.find(
    (c) =>
      c.stateChannelKey === sc.key ||
      (!c.stateChannelKey && c.key === sc.key) ||
      (c.stateChannelKey &&
        c.stateChannelKey.split(",").map((s) => s.trim()).includes(sc.key)),
  );

  const transition = mappedInput ? resolveInputTransition(mappedInput, sc) : undefined;

  const typeColor =
    STATE_TYPE_COLORS[sc.type] || "text-muted-foreground bg-muted border-border/40";

  const items = useMemo(() => {
    const channelKeys = allChannels.map((c) => c.key || c.id || "").filter(Boolean);
    return [
      "— unmapped —",
      ...channelKeys,
      `+ Create input for "${sc.key}"`,
    ];
  }, [allChannels, sc.key]);

  const currentValue = mappedInput ? (mappedInput.key || mappedInput.id || "") : "— unmapped —";

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/20 hover:bg-secondary/15 transition-colors nodrag">
      {/* State type badge */}
      <span
        className={cn(
          "text-[7px] font-mono font-bold px-1 py-0.5 rounded border shrink-0 uppercase leading-none",
          typeColor,
        )}
      >
        {sc.type.slice(0, 3)}
      </span>

      {/* State variable key */}
      <span
        className="text-[10px] font-mono text-[#006ddd] font-semibold truncate max-w-[76px]"
        title={`State channel: ${sc.key} (${sc.type}, reducer: ${sc.reducer})`}
      >
        {sc.key}
      </span>

      {/* Ingestion arrow indicator: input feeds state */}
      <span
        className="text-[9px] font-mono text-muted-foreground/60 shrink-0 font-bold"
        title="receives value from"
      >
        ←
      </span>

      {/* Mapping target input selector using Combobox (Base UI) */}
      <div
        className="flex-1 min-w-0 nodrag flex items-center gap-1"
        data-testid="mock-select"
        data-value={mappedInput?.id || mappedInput?.key || "__none__"}
      >
        <Combobox
          items={items}
          value={currentValue}
          onValueChange={(val) => {
            if (!val || val === "— unmapped —" || val === "__none__") {
              onMapToInput(undefined);
            } else if (typeof val === "string" && val.startsWith("+ Create input")) {
              onCreateInput();
            } else {
              const matched = allChannels.find((c) => c.key === val || c.id === val);
              onMapToInput(matched ? (matched.id || matched.key) : val);
            }
          }}
        >
          <ComboboxInput
            placeholder="— unmapped —"
            className="h-5 text-[9px] font-mono bg-background/80 hover:bg-background border border-input/60 rounded px-1.5 w-full nodrag"
          />
          <ComboboxContent
            className="w-[240px] p-0 shadow-2xl border border-border/80 bg-popover text-popover-foreground rounded-lg z-50 overflow-hidden font-mono text-xs"
            align="start"
            sideOffset={4}
          >
            <ComboboxEmpty className="py-2 px-3 text-center text-xs text-muted-foreground">
              No matching inputs
            </ComboboxEmpty>
            <ComboboxList className="max-h-56 overflow-y-auto no-scrollbar p-1 bg-popover text-popover-foreground hide-scrollbar">
              {(item: string) => {
                if (item === "— unmapped —") {
                  return (
                    <ComboboxItem
                      key={item}
                      value={item}
                      className="py-1 px-2 text-xs font-mono text-muted-foreground cursor-pointer rounded-md hover:bg-accent hover:text-accent-foreground"
                    >
                      — unmapped —
                    </ComboboxItem>
                  );
                }
                if (item.startsWith("+ Create input")) {
                  return (
                    <ComboboxItem
                      key={item}
                      value={item}
                      className="py-1 px-2 text-xs font-mono text-primary font-semibold cursor-pointer rounded-md hover:bg-primary/10 border-t border-border/40 mt-1 pt-1 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item}</span>
                    </ComboboxItem>
                  );
                }
                const ch = allChannels.find((c) => c.key === item || c.id === item);
                const itemTransition = ch ? resolveInputTransition(ch, sc) : undefined;
                const roleHint =
                  itemTransition === "as_human_message"
                    ? " → HumanMessage"
                    : itemTransition === "append_to_list"
                      ? " → Append"
                      : itemTransition === "merge_object"
                        ? " → Merge"
                        : itemTransition === "parse_json"
                          ? " → JSON.parse"
                          : itemTransition === "transformer"
                            ? ` (⚡ ${ch?.transformerRef || "txfm"})`
                            : "";
                return (
                  <ComboboxItem
                    key={item}
                    value={item}
                    className="flex items-center justify-between py-1 px-2 text-xs font-mono cursor-pointer rounded-md hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="truncate">{item}{roleHint}</span>
                    {ch?.type && (
                      <span className="text-[8px] text-muted-foreground shrink-0 ml-1">
                        ({ch.type})
                      </span>
                    )}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      {/* Transition mode badge */}
      {mappedInput && transition && (
        <span
          className={cn(
            "text-[7px] font-mono px-1 py-0.5 rounded border shrink-0 font-medium leading-none",
            transition === "transformer"
              ? "text-purple-400 bg-purple-400/10 border-purple-400/30"
              : transition === "as_human_message"
                ? "text-sky-400 bg-sky-400/10 border-sky-400/30"
                : transition === "append_to_list"
                  ? "text-orange-400 bg-orange-400/10 border-orange-400/30"
                  : transition === "merge_object"
                    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                    : transition === "parse_json"
                      ? "text-violet-400 bg-violet-400/10 border-violet-400/30"
                      : "text-muted-foreground bg-muted border-border/40",
          )}
          title={`Transition: ${transition}${mappedInput.transformerRef ? ` (${mappedInput.transformerRef})` : ""}`}
        >
          {transition === "transformer"
            ? (mappedInput.transformerRef ? `⚡ ${mappedInput.transformerRef}` : "txfm")
            : transition === "as_human_message"
              ? "user msg"
              : transition === "append_to_list"
                ? "+ list"
                : transition === "merge_object"
                  ? "merge"
                  : transition === "parse_json"
                    ? "json"
                    : "direct"}
        </span>
      )}

      {/* Quick 1-click create button if unmapped */}
      {!mappedInput && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-primary hover:text-primary hover:bg-primary/10 shrink-0 nodrag"
          onClick={(e) => {
            e.stopPropagation();
            onCreateInput();
          }}
          title={`Create & map an input variable for "${sc.key}"`}
        >
          <Plus className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  icon, label, count, onAdd, color, extraAction,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | string;
  onAdd?: (e: React.MouseEvent) => void;
  color: string;
  extraAction?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 border-b border-border/30", color)}>
      <span className="shrink-0">{icon}</span>
      <span className="text-[9px] font-bold uppercase tracking-wider flex-1">{label}</span>
      <span className="text-[8px] font-mono opacity-60 mr-0.5">{count}</span>
      {extraAction}
      {onAdd && (
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground nodrag ml-0.5"
          onClick={onAdd}
          title={`Add ${label.toLowerCase()} variable`}
        >
          <Plus className="w-2.5 h-2.5" />
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export const LangGraphCanvasStartNode = ({
  data,
  selected,
}: NodeProps<StartNode>) => {
  const allChannels    = data.inputChannels || [];
  const stateChannels  = (data.stateChannels || []);
  const suggestedParams = data.suggestedParams;
  const [collapsed, setCollapsed] = useState(false);

  const onAddInputChannel     = data.onAddInputChannel;
  const onAddSuggestedChannel = data.onAddSuggestedChannel;
  const onUpdateInputChannel  = data.onUpdateInputChannel;
  const onDeleteInputChannel  = data.onDeleteInputChannel;
  const onOpenInputsTab       = data.onOpenInputsTab;
  const onOpenTestingTab      = data.onOpenTestingTab;
  const onAutoMapStateChannels = data.onAutoMapStateChannels;
  const onMapStateToInput      = data.onMapStateToInput;
  const onOpenStateTab         = data.onOpenStateTab;
  const onRefreshInputs        = data.onRefreshInputs;
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefreshInputs) return;
    setIsRefreshing(true);
    try {
      await onRefreshInputs();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [onRefreshInputs]);

  const validStateChannels = stateChannels.filter((sc) => Boolean(sc.key?.trim()));

  // Split inputs by source: show ONLY fields mapped to the LangGraph step
  const hasSuggestedParams = Array.isArray(suggestedParams);
  const mappedKeySet = hasSuggestedParams
    ? new Set(suggestedParams.map((s) => s.key))
    : null;

  const requestVars = allChannels.filter((c) => {
    if (c.source === "custom") return false;
    if (mappedKeySet) return mappedKeySet.has(c.key);
    return c.source === "request";
  });
  const customVars = allChannels.filter((c) => c.source === "custom");
  const visibleChannels = [...requestVars, ...customVars];

  // Suggested not yet added
  const pendingSuggestions = (suggestedParams || []).filter(
    (s) => !allChannels.some((c) => c.key === s.key),
  );

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleAddCustom = useCallback((e: React.MouseEvent) => {
    stop(e);
    onAddInputChannel?.();
  }, [onAddInputChannel]);

  const availableTransformers = data.availableTransformers ?? [];

  const handleAddSuggested = useCallback(
    (e: React.MouseEvent, s: typeof pendingSuggestions[0]) => {
      stop(e);
      const targetState =
        s.targetStateChannel ||
        (validStateChannels.some((sc) => sc.key === s.key)
          ? s.key
          : s.type === "messages" && validStateChannels.some((sc) => sc.key === "messages")
            ? "messages"
            : undefined);

      onAddSuggestedChannel?.({
        id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        key: s.key,
        type: s.type,
        required: s.required ?? true,
        description: s.description || "",
        source: "request",
        ...(targetState ? { stateChannelKey: targetState } : {}),
      });
    },
    [onAddSuggestedChannel, validStateChannels],
  );

  // Find global index for an input channel
  const globalIdx = (ch: LangGraphInputChannel) =>
    allChannels.findIndex((c) => (c.id && ch.id ? c.id === ch.id : c === ch));

  // Count mapped state variables
  const mappedStateCount = validStateChannels.filter((sc) =>
    visibleChannels.some(
      (c) =>
        c.stateChannelKey === sc.key ||
        (!c.stateChannelKey && c.key === sc.key) ||
        (c.stateChannelKey &&
          c.stateChannelKey.split(",").map((s) => s.trim()).includes(sc.key)),
    ),
  ).length;

  // Auto-map inputs to state variables
  const handleAutoMap = useCallback(() => {
    if (onAutoMapStateChannels) {
      onAutoMapStateChannels();
      return;
    }
    const validKeys = new Set(validStateChannels.map((s) => s.key));
    allChannels.forEach((ch, idx) => {
      if (ch.stateChannelKey && validKeys.has(ch.stateChannelKey)) return;
      const sug = suggestedParams?.find((s) => s.key === ch.key);
      const targetState =
        sug?.targetStateChannel ||
        (validKeys.has(ch.key)
          ? ch.key
          : ch.type === "messages" && validKeys.has("messages")
            ? "messages"
            : undefined);

      if (targetState) {
        onUpdateInputChannel?.(idx, { stateChannelKey: targetState });
      }
    });
  }, [allChannels, onAutoMapStateChannels, onUpdateInputChannel, validStateChannels, suggestedParams]);

  // Map state to input handler
  const handleMapState = useCallback(
    (stateKey: string, inputKeyOrId?: string) => {
      if (onMapStateToInput) {
        onMapStateToInput(stateKey, inputKeyOrId);
        return;
      }
      allChannels.forEach((ch, idx) => {
        const isTarget =
          Boolean(inputKeyOrId) && (ch.id === inputKeyOrId || ch.key === inputKeyOrId);
        if (isTarget) {
          onUpdateInputChannel?.(idx, { stateChannelKey: stateKey });
        } else if (ch.stateChannelKey === stateKey && !isTarget) {
          onUpdateInputChannel?.(idx, { stateChannelKey: undefined });
        }
      });
    },
    [allChannels, onMapStateToInput, onUpdateInputChannel],
  );

  // 1-Click create input for a state variable
  const handleAddInputForState = useCallback(
    (sc: LangGraphStateChannel) => {
      onAddSuggestedChannel?.({
        id: `input_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        key: sc.key,
        type: sc.type === "messages" ? "string" : sc.type,
        required: false,
        description: `Initial value for ${sc.key} state`,
        source: "custom",
        stateChannelKey: sc.key,
      });
    },
    [onAddSuggestedChannel],
  );

  return (
    <div
      className={cn(
        "rounded-2xl bg-card/95 backdrop-blur-md border-2 w-[310px] flex flex-col shadow-xl transition-all duration-200",
        selected
          ? "border-primary ring-4 ring-primary/20 scale-[1.03]"
          : "border-primary/50 hover:border-primary/80",
      )}
    >
      {/* ── Card header ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer nodrag select-none"
        onClick={() => { setCollapsed(!collapsed); onOpenInputsTab?.(); }}
      >
        <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 shrink-0">
          <Zap className="w-3.5 h-3.5 text-primary animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-xs tracking-widest text-primary">START</p>
          <p className="text-[9px] text-muted-foreground font-mono">
            {requestVars.length} req · {customVars.length} custom · {mappedStateCount}/{validStateChannels.length} state
            {pendingSuggestions.length > 0 && (
              <span className="ml-1 text-amber-400">· {pendingSuggestions.length} new</span>
            )}
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2 py-0 font-semibold gap-1 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300 nodrag shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenTestingTab) {
              onOpenTestingTab();
            } else {
              onOpenInputsTab?.();
            }
          }}
          title="Open in-browser testing playground"
        >
          <Play className="w-2.5 h-2.5 fill-current" />
          <span>Test</span>
        </Button>

        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
          collapsed && "rotate-180",
        )} />
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="flex flex-col border-t border-border/50">

          {/* ── Section 1: Incoming Request Variables ── */}
          <div>
            <SectionHeader
              icon={<Globe className="w-2.5 h-2.5 text-sky-400" />}
              label="Incoming Request"
              count={requestVars.length}
              color="bg-sky-500/5 text-sky-400"
              extraAction={
                onRefreshInputs && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1.5 text-[8px] font-semibold text-sky-400 hover:text-sky-300 hover:bg-sky-500/15 gap-1 nodrag"
                    onClick={handleRefresh}
                    title="Check & sync configured input fields from connected endpoint"
                  >
                    <RefreshCw className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
                    <span>Sync</span>
                  </Button>
                )
              }
            />

            {requestVars.length === 0 && pendingSuggestions.length === 0 && (
              <div className="px-3 py-2 text-[9px] text-muted-foreground flex flex-col items-center gap-1.5 text-center">
                <span>No endpoint connected</span>
                {onRefreshInputs && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 text-[9px] px-2 py-0 font-medium gap-1 text-sky-400 border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-300 nodrag"
                    onClick={handleRefresh}
                    title="Check & sync configured input fields from endpoint"
                  >
                    <RefreshCw className={cn("w-2.5 h-2.5", isRefreshing && "animate-spin")} />
                    <span>Check / Sync Inputs</span>
                  </Button>
                )}
              </div>
            )}

            <div className="max-h-[140px] overflow-y-auto">
              {requestVars.map((ch) => (
                <ChannelRow
                  key={ch.id || `req_${globalIdx(ch)}`}
                  ch={ch}
                  idx={globalIdx(ch)}
                  stateChannels={stateChannels}
                  availableTransformers={availableTransformers}
                  onUpdate={onUpdateInputChannel ?? (() => {})}
                  onDelete={onDeleteInputChannel ?? (() => {})}
                />
              ))}

              {/* Pending suggestions */}
              {pendingSuggestions.length > 0 && (
                <div className="flex flex-col">
                  {pendingSuggestions.map((s, i) => {
                    const typeColor = TYPE_COLORS[s.type] || TYPE_COLORS.string;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-sky-500/10 hover:bg-sky-500/5 cursor-pointer group/sug nodrag"
                        onClick={(e) => handleAddSuggested(e, s)}
                        title={`Import "${s.key}" from endpoint`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-amber-400/60 shrink-0" />
                        <span className={cn(
                          "text-[7px] font-mono font-bold px-1 py-0.5 rounded border shrink-0 uppercase opacity-60",
                          typeColor,
                        )}>
                          {s.type.slice(0, 3)}
                        </span>
                        <span className="flex-1 text-[10px] font-mono text-muted-foreground truncate">
                          {s.key}
                          {s.required && <span className="text-rose-400 ml-0.5">*</span>}
                        </span>
                        <Plus className="w-3 h-3 text-sky-400 opacity-0 group-hover/sug:opacity-100 transition-opacity shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Custom Variables ── */}
          <div className="border-t border-border/40">
            <SectionHeader
              icon={<Sliders className="w-2.5 h-2.5 text-violet-400" />}
              label="Custom Variables"
              count={customVars.length}
              onAdd={handleAddCustom}
              color="bg-violet-500/5 text-violet-400"
            />

            <div className="max-h-[140px] overflow-y-auto">
              {customVars.length === 0 ? (
                <div
                  className="flex items-center justify-center gap-1.5 px-3 py-2 cursor-pointer hover:bg-violet-500/5 transition-colors nodrag"
                  onClick={handleAddCustom}
                >
                  <Plus className="w-2.5 h-2.5 text-violet-400/60" />
                  <span className="text-[9px] text-violet-400/60 italic">add a custom variable</span>
                </div>
              ) : (
                customVars.map((ch) => (
                  <ChannelRow
                    key={ch.id || `custom_${globalIdx(ch)}`}
                    ch={ch}
                    idx={globalIdx(ch)}
                    stateChannels={stateChannels}
                    availableTransformers={availableTransformers}
                    onUpdate={onUpdateInputChannel ?? (() => {})}
                    onDelete={onDeleteInputChannel ?? (() => {})}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Section 3: State Variable Mapping ── */}
          <div className="border-t border-border/40">
            <SectionHeader
              icon={<Database className="w-2.5 h-2.5 text-[#006ddd]" />}
              label="Input Ingestion"
              count={`${mappedStateCount}/${validStateChannels.length}`}
              color="bg-[#006ddd]/5 text-[#006ddd]"
              extraAction={
                validStateChannels.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1 text-[8px] font-semibold text-[#006ddd] hover:bg-[#006ddd]/15 gap-0.5 nodrag"
                    onClick={(e) => {
                      stop(e);
                      handleAutoMap();
                    }}
                    title="Auto-map matching input and state variables"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                    <span>Auto</span>
                  </Button>
                )
              }
            />

            <div className="max-h-[160px] overflow-y-auto">
              {validStateChannels.length === 0 ? (
                <div
                  className="px-3 py-2 text-[9px] text-muted-foreground italic text-center cursor-pointer hover:bg-secondary/20"
                  onClick={() => onOpenStateTab?.()}
                  title="Configure state variables in State Node"
                >
                  No state variables. Click to open State Schema.
                </div>
              ) : (
                validStateChannels.map((sc) => (
                  <StateMappingRow
                    key={sc.key}
                    sc={sc}
                    allChannels={visibleChannels}
                    onMapToInput={(inputKeyOrId) => handleMapState(sc.key, inputKeyOrId)}
                    onCreateInput={() => handleAddInputForState(sc)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── State mapping legend ── */}
          {validStateChannels.length > 0 && visibleChannels.some((c) => c.stateChannelKey) && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-t border-border/30 bg-primary/3">
              <ArrowRight className="w-2.5 h-2.5 text-primary/40 shrink-0" />
              <span className="text-[8px] text-muted-foreground/60">
                Mapped input values feed state channel updates on invoke
              </span>
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-primary !w-3.5 !h-3.5 !border-2 !border-background hover:!scale-125 transition-transform"
      />
    </div>
  );
};
