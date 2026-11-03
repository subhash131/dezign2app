import React, { useState, useMemo } from "react";
import {
  Radio,
  Check,
  Sparkles,
  Sliders,
  Eye,
  Code,
  Copy,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { LocalTextarea } from "../../../../../common";
import type { AgentNodeData } from "../../../types";
import type {
  LangGraphAgentStreamConfig,
  LangGraphStreamEnvelopeConfig,
  LangGraphStreamTransformerMode,
} from "@workspace/canvas";
import {
  STREAM_EVENT_TYPES,
  DEFAULT_SELECTED_STREAM_EVENTS,
  DEFAULT_STREAM_ENVELOPE,
  DEFAULT_STREAM_TRANSFORMER_MODE,
  STREAM_TRANSFORMER_PRESETS,
  DEFAULT_CUSTOM_TRANSFORMER_CODE,
} from "../../../constants";

const PRESET_ENVELOPE_MAP: Record<
  LangGraphStreamTransformerMode,
  Partial<LangGraphStreamEnvelopeConfig>
> = {
  standard_sse: {
    includeEvent: true,
    includeAgent: true,
    includeRunId: true,
    includeTimestamp: true,
    includeDelta: true,
    includeContent: true,
    includeTool: true,
    includeInputs: false,
    includeOutput: true,
    includeUsage: true,
    flattenPayload: false,
    stripEmptyDeltas: true,
  },
  ai_sdk: {
    includeEvent: false,
    includeAgent: false,
    includeRunId: false,
    includeTimestamp: false,
    includeDelta: true,
    includeContent: false,
    includeTool: true,
    includeInputs: true,
    includeOutput: true,
    includeUsage: true,
    flattenPayload: true,
    stripEmptyDeltas: true,
  },
  openai_chunk: {
    includeEvent: false,
    includeAgent: false,
    includeRunId: true,
    includeTimestamp: true,
    includeDelta: true,
    includeContent: false,
    includeTool: true,
    includeInputs: true,
    includeOutput: false,
    includeUsage: true,
    flattenPayload: false,
    stripEmptyDeltas: true,
  },
  minimal: {
    includeEvent: false,
    includeAgent: false,
    includeRunId: false,
    includeTimestamp: false,
    includeDelta: true,
    includeContent: false,
    includeTool: true,
    includeInputs: false,
    includeOutput: false,
    includeUsage: false,
    flattenPayload: true,
    stripEmptyDeltas: true,
  },
  full_trace: {
    includeEvent: true,
    includeAgent: true,
    includeRunId: true,
    includeTimestamp: true,
    includeDelta: true,
    includeContent: true,
    includeTool: true,
    includeInputs: true,
    includeOutput: true,
    includeUsage: true,
    flattenPayload: false,
    stripEmptyDeltas: false,
  },
  custom: {
    ...DEFAULT_STREAM_ENVELOPE,
  },
};

function generateSamplePreview(
  tab: "token" | "tool" | "state",
  envelope: LangGraphStreamEnvelopeConfig,
  agentName: string,
  mode: LangGraphStreamTransformerMode,
): string {
  if (mode === "ai_sdk") {
    if (tab === "token") {
      return `0:"Hello, I have processed your request."\n8:[{"agent":"${agentName || "Agent"}"}]`;
    }
    if (tab === "tool") {
      return `9:{"toolCallId":"call_123","toolName":"search","args":{"q":"LangGraph streaming"}}`;
    }
    return `d:{"finishReason":"stop","usage":{"promptTokens":24,"completionTokens":16}}`;
  }

  if (mode === "openai_chunk") {
    if (tab === "token") {
      return JSON.stringify(
        {
          id: envelope.includeRunId ? "chatcmpl_9a8f2c1b" : undefined,
          object: "chat.completion.chunk",
          created: envelope.includeTimestamp
            ? Math.floor(Date.now() / 1000)
            : undefined,
          model: "gpt-4o",
          choices: [
            {
              index: 0,
              delta: {
                content: envelope.includeDelta ? "Hello" : undefined,
              },
              finish_reason: null,
            },
          ],
          usage: envelope.includeUsage
            ? { prompt_tokens: 14, completion_tokens: 8 }
            : undefined,
        },
        null,
        2,
      );
    }
    if (tab === "tool") {
      return JSON.stringify(
        {
          id: envelope.includeRunId ? "chatcmpl_9a8f2c1b" : undefined,
          object: "chat.completion.chunk",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_abc123",
                    function: {
                      name: envelope.includeTool ? "search_docs" : undefined,
                      arguments: envelope.includeInputs
                        ? '{"query":"streamEvents v3"}'
                        : undefined,
                    },
                  },
                ],
              },
            },
          ],
        },
        null,
        2,
      );
    }
    return JSON.stringify(
      {
        id: "chatcmpl_9a8f2c1b",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: envelope.includeUsage
          ? { prompt_tokens: 45, completion_tokens: 38 }
          : undefined,
      },
      null,
      2,
    );
  }

  // Standard SSE / Minimal / Full Trace / Custom JSON envelope
  const base: Record<string, unknown> = {};

  if (envelope.includeEvent) {
    base.event =
      tab === "token"
        ? "on_chat_model_stream"
        : tab === "tool"
          ? "on_tool_start"
          : "on_chain_end";
  }

  if (envelope.includeAgent) {
    base.agent = agentName || "AgentNode";
  }

  if (envelope.includeRunId) {
    base.run_id = "run_7c9e12f0-e54b";
  }

  if (envelope.includeTimestamp) {
    base.timestamp = "2026-10-02T00:15:30.124Z";
  }

  const payload: Record<string, unknown> = {};

  if (tab === "token") {
    if (envelope.includeDelta) payload.delta = " Hello";
    if (envelope.includeContent) {
      payload.content = "Hello, I am processing your query...";
    }
    if (envelope.includeUsage) {
      payload.usage = { prompt_tokens: 18, completion_tokens: 9, total_tokens: 27 };
    }
  } else if (tab === "tool") {
    if (envelope.includeTool) payload.tool = "search_database";
    if (envelope.includeInputs) {
      payload.inputs = { query: "sales_q3", limit: 5 };
    }
    if (envelope.includeOutput) {
      payload.output = { results: ["Report A", "Report B"], count: 2 };
    }
  } else {
    // state snapshot
    if (envelope.includeOutput) {
      payload.output = {
        messages: [
          { role: "user", content: "Show sales data" },
          { role: "assistant", content: "Report retrieved successfully." },
        ],
        status: "completed",
      };
    }
  }

  if (envelope.flattenPayload) {
    Object.assign(base, payload);
  } else if (Object.keys(payload).length > 0) {
    base.data = payload;
  }

  return JSON.stringify(base, null, 2);
}

interface AgentEventStreamingSectionProps {
  selectedAgentData: AgentNodeData;
  onUpdateAgent: (changes: Partial<AgentNodeData>) => void;
  embedded?: boolean;
  hideHeader?: boolean;
}

export function AgentEventStreamingSection({
  selectedAgentData,
  onUpdateAgent,
  embedded = false,
  hideHeader = false,
}: AgentEventStreamingSectionProps) {
  const [previewTab, setPreviewTab] = useState<"token" | "tool" | "state">("token");
  const [copied, setCopied] = useState(false);
  const [showCustomCode, setShowCustomCode] = useState(false);

  const streamConfig: LangGraphAgentStreamConfig =
    selectedAgentData.streamConfig || {
      enabled: false,
      version: "v3",
      selectedEvents: DEFAULT_SELECTED_STREAM_EVENTS,
      envelope: DEFAULT_STREAM_ENVELOPE,
      transformer: {
        mode: DEFAULT_STREAM_TRANSFORMER_MODE,
      },
    };

  const isEnabled = Boolean(streamConfig.enabled);
  const currentMode: LangGraphStreamTransformerMode =
    streamConfig.transformer?.mode || DEFAULT_STREAM_TRANSFORMER_MODE;

  const currentEnvelope: LangGraphStreamEnvelopeConfig = {
    ...DEFAULT_STREAM_ENVELOPE,
    ...(streamConfig.envelope || {}),
  };

  const selectedEvents =
    streamConfig.selectedEvents || DEFAULT_SELECTED_STREAM_EVENTS;

  const updateEnvelopeField = (
    field: keyof LangGraphStreamEnvelopeConfig,
    value: boolean,
  ) => {
    onUpdateAgent({
      ...(field === "includeUsage" ? { trackTokenUsage: value } : {}),
      streamConfig: {
        ...streamConfig,
        envelope: {
          ...currentEnvelope,
          [field]: value,
        },
      },
    });
  };

  const handleSelectPresetMode = (mode: LangGraphStreamTransformerMode) => {
    const presetEnvelope = PRESET_ENVELOPE_MAP[mode] || DEFAULT_STREAM_ENVELOPE;
    onUpdateAgent({
      streamConfig: {
        ...streamConfig,
        transformer: {
          ...streamConfig.transformer,
          mode,
          customCode:
            mode === "custom"
              ? streamConfig.transformer?.customCode ||
                DEFAULT_CUSTOM_TRANSFORMER_CODE
              : streamConfig.transformer?.customCode,
        },
        envelope: {
          ...currentEnvelope,
          ...presetEnvelope,
        },
      },
    });
    if (mode === "custom") {
      setShowCustomCode(true);
    }
  };

  const handleResetToPresetDefaults = () => {
    const presetEnvelope =
      PRESET_ENVELOPE_MAP[currentMode] || DEFAULT_STREAM_ENVELOPE;
    onUpdateAgent({
      streamConfig: {
        ...streamConfig,
        envelope: {
          ...DEFAULT_STREAM_ENVELOPE,
          ...presetEnvelope,
        },
      },
    });
  };

  const activePreset = STREAM_TRANSFORMER_PRESETS.find(
    (p) => p.id === currentMode,
  );

  const samplePreviewText = useMemo(() => {
    return generateSamplePreview(
      previewTab,
      currentEnvelope,
      selectedAgentData.name || "Agent",
      currentMode,
    );
  }, [
    previewTab,
    currentEnvelope,
    selectedAgentData.name,
    currentMode,
  ]);

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(samplePreviewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-4"
          : "flex flex-col gap-4 p-3 bg-cyan-950/10 dark:bg-cyan-950/20 rounded-xl border border-cyan-500/30"
      }
    >
      {/* ─── Header & Toggle Switch ─────────────────────────────────────── */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-md border transition-colors ${
                isEnabled
                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-500 animate-pulse"
                  : "bg-secondary/30 border-border text-muted-foreground"
              }`}
            >
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                Event Streaming
                {isEnabled && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-mono font-semibold">
                    v3 Active
                  </span>
                )}
              </h3>
              <p className="text-[10px] font-mono text-muted-foreground">
                streamEvents(..., version="v3")
              </p>
            </div>
          </div>

          <Switch
            checked={isEnabled}
            onCheckedChange={(enabled) => {
              onUpdateAgent({
                streamConfig: {
                  version: "v3",
                  selectedEvents: DEFAULT_SELECTED_STREAM_EVENTS,
                  envelope: DEFAULT_STREAM_ENVELOPE,
                  transformer: {
                    mode: DEFAULT_STREAM_TRANSFORMER_MODE,
                  },
                  ...streamConfig,
                  enabled,
                },
              });
            }}
          />
        </div>
      )}

      {isEnabled && (
        <div className="flex flex-col gap-4 pt-2 border-t border-cyan-500/20">
          {/* ─── 1. Stream Mode Presets ───────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                Stream Output Preset
              </Label>
              <button
                type="button"
                onClick={handleResetToPresetDefaults}
                className="text-[10px] font-mono text-muted-foreground hover:text-cyan-500 flex items-center gap-1 transition-colors"
                title="Reset checkboxes to this preset's recommended defaults"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset Checkboxes
              </button>
            </div>

            <Select
              value={currentMode}
              onValueChange={(val) =>
                handleSelectPresetMode(val as LangGraphStreamTransformerMode)
              }
            >
              <SelectTrigger className="h-8 text-xs bg-background font-mono border-cyan-500/30 focus:border-cyan-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STREAM_TRANSFORMER_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="font-semibold">{preset.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                        {preset.badge}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {activePreset && (
              <p className="text-[10px] text-muted-foreground leading-relaxed flex items-start gap-1">
                <Info className="w-3 h-3 text-cyan-500 shrink-0 mt-0.5" />
                <span>{activePreset.description}</span>
              </p>
            )}
          </div>

          {/* ─── 2. Active Event Projections (Chips) ──────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-500" />
                Active Event Projections
              </Label>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAgent({
                      streamConfig: {
                        ...streamConfig,
                        selectedEvents: STREAM_EVENT_TYPES.map((e) => e.id),
                      },
                    });
                  }}
                  className="text-muted-foreground hover:text-cyan-500 transition-colors"
                >
                  All
                </button>
                <span className="text-border">|</span>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateAgent({
                      streamConfig: {
                        ...streamConfig,
                        selectedEvents: DEFAULT_SELECTED_STREAM_EVENTS,
                      },
                    });
                  }}
                  className="text-muted-foreground hover:text-cyan-500 transition-colors"
                >
                  Default
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STREAM_EVENT_TYPES.map((ev) => {
                const isSelected = selectedEvents.includes(ev.id);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      const updated = isSelected
                        ? selectedEvents.filter((id) => id !== ev.id)
                        : [...selectedEvents, ev.id];
                      onUpdateAgent({
                        streamConfig: {
                          ...streamConfig,
                          selectedEvents: updated,
                        },
                      });
                    }}
                    title={`${ev.label}: ${ev.description}`}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-700 dark:text-cyan-300 font-semibold shadow-xs"
                        : "bg-background/60 border-border/50 text-muted-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {isSelected && (
                      <Check className="w-3 h-3 text-cyan-500 shrink-0" />
                    )}
                    <span>{ev.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── 3. Envelope Checkboxes (No raw JSON to type!) ───────────── */}
          <div className="flex flex-col gap-3 p-2.5 bg-background/50 rounded-lg border border-cyan-500/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                Stream Envelope & Payload Fields
              </Label>
              <span className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                Checkbox Config
              </span>
            </div>

            {/* Sub-group A: Envelope Metadata */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-muted-foreground">
                Metadata Headers
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeEvent)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeEvent", Boolean(val))
                    }
                  />
                  <span className="truncate">Event Type</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    event
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeAgent)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeAgent", Boolean(val))
                    }
                  />
                  <span className="truncate">Agent Name</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    agent
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeRunId)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeRunId", Boolean(val))
                    }
                  />
                  <span className="truncate">Run ID</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    run_id
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeTimestamp)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeTimestamp", Boolean(val))
                    }
                  />
                  <span className="truncate">Timestamp</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    ISO
                  </span>
                </label>
              </div>
            </div>

            {/* Sub-group B: Payload Data */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-muted-foreground">
                Payload Attributes (data.*)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeDelta)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeDelta", Boolean(val))
                    }
                  />
                  <span className="truncate">Token Delta</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    delta
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeContent)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeContent", Boolean(val))
                    }
                  />
                  <span className="truncate">Full Content</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    content
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeTool)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeTool", Boolean(val))
                    }
                  />
                  <span className="truncate">Tool Name</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    tool
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeInputs)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeInputs", Boolean(val))
                    }
                  />
                  <span className="truncate">Tool Inputs</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    inputs
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.includeOutput)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeOutput", Boolean(val))
                    }
                  />
                  <span className="truncate">Tool / State Output</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    output
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={currentEnvelope.includeUsage !== false}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("includeUsage", Boolean(val))
                    }
                  />
                  <span className="truncate">Token Usage</span>
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                    usage
                  </span>
                </label>
              </div>
            </div>

            {/* Sub-group C: Options */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
              <span className="text-[10px] font-mono uppercase tracking-wider font-semibold text-muted-foreground">
                Output Formatting Options
              </span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.stripEmptyDeltas)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("stripEmptyDeltas", Boolean(val))
                    }
                  />
                  <span className="truncate">Strip Empty Deltas</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  <Checkbox
                    checked={Boolean(currentEnvelope.flattenPayload)}
                    onCheckedChange={(val) =>
                      updateEnvelopeField("flattenPayload", Boolean(val))
                    }
                  />
                  <span className="truncate">Flatten Payload</span>
                </label>
              </div>
            </div>
          </div>

          {/* ─── 4. Live Predictable Response Preview ──────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-cyan-500" />
                <Label className="text-xs font-semibold text-foreground">
                  Response Preview
                </Label>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Sample Event Tabs */}
                <div className="flex items-center bg-background/80 rounded-md p-0.5 border border-border/50 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setPreviewTab("token")}
                    className={`px-2 py-0.5 rounded transition-all ${
                      previewTab === "token"
                        ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("tool")}
                    className={`px-2 py-0.5 rounded transition-all ${
                      previewTab === "tool"
                        ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tool
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab("state")}
                    className={`px-2 py-0.5 rounded transition-all ${
                      previewTab === "state"
                        ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    State
                  </button>
                </div>

                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyPreview}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy sample event JSON"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Real-time representation of what the client stream receives for each event chunk:
            </p>

            <pre className="text-[11px] p-2.5 rounded-lg bg-background font-mono text-cyan-600 dark:text-cyan-300 overflow-x-auto border border-border/60 max-h-[160px] leading-relaxed shadow-xs">
              <code>{samplePreviewText}</code>
            </pre>
          </div>

          {/* ─── 5. Custom Code Accordion (Only when mode === 'custom') ─────── */}
          {currentMode === "custom" && (
            <div className="flex flex-col gap-2 pt-2 border-t border-cyan-500/20">
              <button
                type="button"
                onClick={() => setShowCustomCode(!showCustomCode)}
                className="flex items-center justify-between text-xs font-semibold text-foreground hover:text-cyan-500 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-sky-500" />
                  Custom Transformer Generator Code
                </span>
                {showCustomCode ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {showCustomCode && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>Export async function* customEventStreamTransformer</span>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateAgent({
                          streamConfig: {
                            ...streamConfig,
                            transformer: {
                              ...streamConfig.transformer,
                              customCode: DEFAULT_CUSTOM_TRANSFORMER_CODE,
                            },
                          },
                        });
                      }}
                      className="hover:text-cyan-500 underline"
                    >
                      Reset Default Code
                    </button>
                  </div>
                  <LocalTextarea
                    value={
                      streamConfig.transformer?.customCode ??
                      DEFAULT_CUSTOM_TRANSFORMER_CODE
                    }
                    onChange={(e) => {
                      onUpdateAgent({
                        streamConfig: {
                          ...streamConfig,
                          transformer: {
                            ...streamConfig.transformer,
                            customCode: e.target.value,
                          },
                        },
                      });
                    }}
                    className="text-xs min-h-[130px] resize-y bg-background font-mono leading-relaxed text-sky-600 dark:text-sky-300"
                    placeholder="Configure custom async generator transformer..."
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
