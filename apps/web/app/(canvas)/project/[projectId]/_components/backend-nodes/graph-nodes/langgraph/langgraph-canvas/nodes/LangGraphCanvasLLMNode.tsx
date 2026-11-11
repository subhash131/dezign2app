import React, { useState, useEffect } from "react";
import {
  NodeProps,
  Handle,
  Position,
  useReactFlow,
  Connection,
} from "@xyflow/react";
import {
  Globe,
  Trash,
  Code,
  Key,
  Shield,
  Sparkles,
  Brain,
  ListFilter,
  PenLine,
  Plus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@workspace/ui/components/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import type { LangGraphLLMNode, LangGraphCanvasNode } from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_LLM,
  HANDLE_LLM_IN,
  HANDLE_LLM_OUT,
} from "../constants";
import { LLM_PROVIDER_PRESETS } from "../components/inspector/constants";
import { LocalInput, LocalTextarea } from "../../../common";
import {
  saveLocalEnvVariable,
  getLocalEnvVariable,
  fetchLocalEnvVariable,
} from "@/lib/utils/localEnvSync";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";

export const LangGraphCanvasLLMNode = ({
  id,
  data,
  selected,
}: NodeProps<LangGraphLLMNode>) => {
  const { setNodes } = useReactFlow<LangGraphCanvasNode>();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(data.label || "LLM");

  useEffect(() => {
    setNameValue(data.label || "LLM");
  }, [data.label]);

  const updateLLMData = (changes: Partial<typeof data>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id && n.type === LANGGRAPH_CANVAS_NODE_LLM
          ? { ...n, data: { ...n.data, ...changes } }
          : n,
      ),
    );
  };

  // Auto-populate API key from localStorage or .env if empty on mount
  useEffect(() => {
    if (!data.apiKeyHeader) {
      const provider = (data.provider || "openai").toLowerCase();
      const envVarName =
        LLM_PROVIDER_PRESETS[provider]?.defaultApiKeyEnv ||
        (provider === "groq" ? "GROQ_API_KEY" : `${provider.toUpperCase()}_API_KEY`);

      const cached =
        (typeof window !== "undefined"
          ? localStorage.getItem(`dezign2app_lg_key_${provider}`) ||
            localStorage.getItem(`dezign2app_env_${envVarName}`)
          : "") || "";

      if (cached) {
        updateLLMData({ apiKeyHeader: cached });
      } else {
        fetchLocalEnvVariable(envVarName).then((val) => {
          if (val) {
            updateLLMData({ apiKeyHeader: val });
          }
        });
      }
    }
  }, [data.provider]);

  const handleApiKeyChange = (val: string) => {
    updateLLMData({ apiKeyHeader: val });

    const cleanVal = val.replace(/^Bearer\s+/i, "").trim();
    if (!cleanVal) return;

    const provider = (data.provider || "openai").toLowerCase();
    const envVarName =
      LLM_PROVIDER_PRESETS[provider]?.defaultApiKeyEnv ||
      (provider === "groq" ? "GROQ_API_KEY" : `${provider.toUpperCase()}_API_KEY`);

    // 1. Immediately cache in localStorage for browser simulation
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`dezign2app_lg_key_${provider}`, cleanVal);
        localStorage.setItem(`dezign2app_env_${envVarName}`, cleanVal);
      } catch {}
    }

    // 2. Automatically sync to local .env file on disk via /api/env
    saveLocalEnvVariable(envVarName, cleanVal)
      .then((res) => {
        if (res.success) {
          toast.success(`Saved ${envVarName} to local .env`);
        }
      })
      .catch(() => {});

    // 3. Ensure parent LangGraphNode has this env var in data.envVars
    const store = useBackendCanvasStore.getState();
    const allCanvasNodes = store.nodes;
    const parentLangGraphNode =
      allCanvasNodes.find(
        (n) =>
          n.type === "langgraph" &&
          (n.data?.customLlmNodes || []).some((llm: any) => llm.id === id),
      ) || allCanvasNodes.find((n) => n.type === "langgraph");

    if (parentLangGraphNode) {
      const existingVars = parentLangGraphNode.data?.envVars || [];
      if (!existingVars.some((v: any) => v.name === envVarName)) {
        store.updateNode(parentLangGraphNode.id, {
          data: {
            ...parentLangGraphNode.data,
            envVars: [
              ...existingVars,
              { id: `env-${Date.now()}`, name: envVarName },
            ],
          },
        });
      }

      // 4. Also propagate to any connected Service nodes
      const allEdges = store.edges;
      const connectedEdges = allEdges.filter(
        (e) =>
          (e.source === parentLangGraphNode.id &&
            allCanvasNodes.find((n) => n.id === e.target)?.type === "service") ||
          (e.target === parentLangGraphNode.id &&
            allCanvasNodes.find((n) => n.id === e.source)?.type === "service"),
      );

      for (const edge of connectedEdges) {
        const serviceNodeId =
          edge.source === parentLangGraphNode.id ? edge.target : edge.source;
        const serviceNode = allCanvasNodes.find((n) => n.id === serviceNodeId);
        if (serviceNode && serviceNode.type === "service") {
          const srvVars = serviceNode.data?.envVars || [];
          if (!srvVars.some((v: any) => v.name === envVarName)) {
            store.updateNode(serviceNode.id, {
              data: {
                ...serviceNode.data,
                envVars: [
                  ...srvVars,
                  {
                    id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    name: envVarName,
                  },
                ],
              },
            });
          }
        }
      }
    }
  };

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = nameValue.trim() || "LLM";
    setNameValue(trimmed);
    if (trimmed !== data.label) {
      updateLLMData({ label: trimmed });
    }
  };

  const activeProviderKey = data.provider || "openai";
  const activePreset =
    LLM_PROVIDER_PRESETS[activeProviderKey] || LLM_PROVIDER_PRESETS.custom;
  const currentModels = activePreset?.models || [];

  const isModelInPresets = currentModels.includes(data.model || "");
  const [isCustomModel, setIsCustomModel] = useState(
    !isModelInPresets && Boolean(data.model),
  );

  useEffect(() => {
    if (data.model && !currentModels.includes(data.model)) {
      setIsCustomModel(true);
    }
  }, [data.provider, data.model, currentModels]);

  const defaultBody = JSON.stringify(
    {
      model: data.model || activePreset?.defaultModel || "gpt-4o-mini",
      messages: [{ role: "user", content: "{{input}}" }],
      temperature: data.temperature ?? 0.7,
    },
    null,
    2,
  );

  const defaultHeaders = JSON.stringify(
    {
      "Content-Type": "application/json",
      Authorization: data.apiKeyHeader
        ? `Bearer ${data.apiKeyHeader}`
        : "Bearer YOUR_API_KEY",
    },
    null,
    2,
  );

  return (
    <div
      className={`rounded-xl bg-card border-2 min-w-[300px] max-w-[360px] p-3 flex flex-col gap-2.5 transition-all duration-200 shadow-md relative group ${
        selected
          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-blue-500/10"
          : "border-border hover:border-blue-500/40 hover:shadow-blue-500/5"
      }`}
    >
      {/* Output Handle on right side to connect to ref or step nodes */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_LLM_OUT}
        style={{ top: "24px" }}
        isValidConnection={(connection: Connection) =>
          connection.targetHandle === HANDLE_LLM_IN
        }
        className="!bg-sky-400 !w-3.5 !h-3.5 !border-2 !border-background hover:!scale-125 transition-transform !-right-[7px] z-10"
        title="Connect to LLM Ref or Step Node LLM Config"
      />
      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 -mx-3 -mt-3 border-b border-border/50 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-500 shrink-0">
            <Brain className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            {isEditingName ? (
              <div
                className="nodrag"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <LocalInput
                  autoFocus
                  className="h-6 text-xs bg-background p-1 font-bold flex-1 nodrag"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") handleNameSave();
                    if (e.key === "Escape") {
                      setNameValue(data.label || "LLM");
                      setIsEditingName(false);
                    }
                  }}
                />
              </div>
            ) : (
              <span
                className="font-bold text-xs text-foreground truncate max-w-[140px] cursor-pointer hover:text-sky-400 transition-colors nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                title="Click to rename LLM"
              >
                {data.label || "LLM"}
              </span>
            )}
            <span className="text-[9px] font-mono text-muted-foreground">
              {data.model || activePreset?.defaultModel || "Model Config"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20">
            {activeProviderKey.toUpperCase()}
          </span>
          {data.onDeleteLLM && (
            <button
              type="button"
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100 nodrag"
              onClick={(e) => {
                e.stopPropagation();
                data.onDeleteLLM?.();
              }}
              title="Delete LLM"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Provider Selector Row */}
      <div className="flex flex-col gap-1 nodrag">
        <label className="text-[9px] font-medium text-muted-foreground flex items-center justify-between">
          <span>Provider Preset</span>
          <span className="text-sky-400 font-mono text-[9px]">
            {activePreset?.label}
          </span>
        </label>
        <Select
          value={activeProviderKey}
          onValueChange={(val: string) => {
            const preset = LLM_PROVIDER_PRESETS[val];
            if (preset) {
              updateLLMData({
                provider: val,
                url: preset.defaultUrl,
                baseUrl: preset.defaultUrl,
                model: preset.defaultModel,
              });
            } else {
              updateLLMData({ provider: val });
            }
            setIsCustomModel(false);
          }}
        >
          <SelectTrigger className="h-6 text-[10px] bg-background border border-border/60 rounded px-2 font-medium text-foreground nodrag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="nodrag">
            {Object.entries(LLM_PROVIDER_PRESETS).map(([key, preset]) => (
              <SelectItem key={key} value={key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model & API Key Configuration */}
      {activeProviderKey === "custom" ? (
        <Tabs defaultValue="endpoint" className="w-full text-xs nodrag">
          <TabsList className="grid grid-cols-3 h-7 bg-secondary/50 p-0.5 rounded-lg border border-border/50 text-[10px] nodrag">
            <TabsTrigger
              value="endpoint"
              className="h-6 text-[10px] font-medium data-[state=active]:bg-background data-[state=active]:text-sky-400 nodrag"
            >
              Endpoint
            </TabsTrigger>
            <TabsTrigger
              value="headers"
              className="h-6 text-[10px] font-medium data-[state=active]:bg-background data-[state=active]:text-amber-400 nodrag"
            >
              Headers
            </TabsTrigger>
            <TabsTrigger
              value="body"
              className="h-6 text-[10px] font-medium data-[state=active]:bg-background data-[state=active]:text-emerald-400 nodrag"
            >
              Body
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Custom Endpoint URL */}
          <TabsContent
            value="endpoint"
            className="flex flex-col gap-2 pt-2 nodrag"
          >
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-medium text-muted-foreground">
                Model Identifier
              </label>
              <LocalInput
                className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground nodrag"
                placeholder="e.g. gpt-4o, claude-3-5-sonnet, llama3:8b"
                value={data.model || ""}
                onChange={(e) => updateLLMData({ model: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
                <Globe className="w-3 h-3 text-sky-400" /> Base URL / Endpoint
              </label>
              <div className="flex items-center gap-1.5">
                <Select
                  value={data.method || "POST"}
                  onValueChange={(val: string) =>
                    updateLLMData({ method: val })
                  }
                >
                  <SelectTrigger className="h-6 w-16 text-[9.5px] bg-background border border-border/60 rounded px-1 font-bold font-mono text-sky-400 nodrag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="nodrag">
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
                <LocalInput
                  className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground flex-1 nodrag"
                  placeholder="https://api.openai.com/v1/chat/completions"
                  value={
                    data.url || data.baseUrl || activePreset?.defaultUrl || ""
                  }
                  onChange={(e) =>
                    updateLLMData({
                      url: e.target.value,
                      baseUrl: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
                <Shield className="w-3 h-3 text-amber-400" /> API Key / Secret
                Token (Optional)
              </label>
              <LocalInput
                type="password"
                className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground nodrag"
                placeholder="Bearer sk-... or secret token"
                value={data.apiKeyHeader || ""}
                onChange={(e) =>
                  updateLLMData({ apiKeyHeader: e.target.value })
                }
              />
            </div>
          </TabsContent>

          {/* Tab 2: Headers */}
          <TabsContent
            value="headers"
            className="flex flex-col gap-1.5 pt-2 nodrag"
          >
            <label className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
              <Key className="w-3 h-3 text-amber-400" /> Request Headers (JSON)
            </label>
            <LocalTextarea
              className="min-h-[90px] max-h-[160px] text-[9.5px] bg-background border border-border/60 rounded p-1.5 font-mono text-foreground nodrag resize-y"
              placeholder='{\n  "Content-Type": "application/json"\n}'
              rows={4}
              value={
                data.headersJson !== undefined
                  ? data.headersJson
                  : defaultHeaders
              }
              onChange={(e) => updateLLMData({ headersJson: e.target.value })}
            />
          </TabsContent>

          {/* Tab 3: Request Body */}
          <TabsContent
            value="body"
            className="flex flex-col gap-1.5 pt-2 nodrag"
          >
            <label className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
              <Code className="w-3 h-3 text-emerald-400" /> Request Payload
              (JSON Body)
            </label>
            <LocalTextarea
              className="min-h-[100px] max-h-[180px] text-[9.5px] bg-background border border-border/60 rounded p-1.5 font-mono text-foreground nodrag resize-y"
              placeholder='{\n  "model": "gpt-4o",\n  "messages": [{"role": "user", "content": "{{input}}"}]\n}'
              rows={5}
              value={data.bodyJson !== undefined ? data.bodyJson : defaultBody}
              onChange={(e) => updateLLMData({ bodyJson: e.target.value })}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col gap-2 nodrag">
          {/* Model Selection */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Model Identifier</span>
              <div className="flex items-center gap-1.5">
                {currentModels.length > 0 && (
                  isCustomModel ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomModel(false);
                        const fallback =
                          activePreset?.defaultModel || currentModels[0] || "";
                        updateLLMData({ model: fallback });
                      }}
                      className="text-[8.5px] text-sky-400 hover:underline cursor-pointer flex items-center gap-0.5 nodrag"
                      title="Switch to preset models"
                    >
                      <ListFilter className="w-2.5 h-2.5" />
                      <span>Presets</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCustomModel(true)}
                      className="text-[8.5px] text-muted-foreground hover:text-sky-400 hover:underline cursor-pointer flex items-center gap-0.5 nodrag"
                      title="Configure custom model"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Custom</span>
                    </button>
                  )
                )}
                {isCustomModel ? (
                  <span className="text-[8px] font-mono text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">
                    Custom
                  </span>
                ) : (
                  <span className="font-mono text-[8.5px] text-sky-400">
                    {data.model || activePreset?.defaultModel}
                  </span>
                )}
              </div>
            </label>
            {currentModels.length > 0 && !isCustomModel ? (
              <div className="flex items-center gap-1">
                <Select
                  value={
                    currentModels.includes(data.model || "")
                      ? data.model
                      : activePreset?.defaultModel || currentModels[0]
                  }
                  onValueChange={(val: string) => {
                    if (val === "__custom__") {
                      setIsCustomModel(true);
                    } else {
                      updateLLMData({ model: val });
                    }
                  }}
                >
                  <SelectTrigger className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground flex-1 nodrag">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="nodrag">
                    {currentModels.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem
                      value="__custom__"
                      className="text-sky-400 font-medium focus:text-sky-400 cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <Plus className="w-3 h-3" />
                        Custom Model...
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  className="h-6 w-6 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-sky-400 border border-border/60 flex items-center justify-center shrink-0 nodrag transition-colors"
                  onClick={() => setIsCustomModel(true)}
                  title="Configure custom model"
                >
                  <PenLine className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <LocalInput
                  autoFocus={isCustomModel}
                  className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground flex-1 nodrag"
                  placeholder={
                    activePreset?.defaultModel
                      ? `e.g. ${activePreset.defaultModel}, custom-model`
                      : "e.g. gpt-4o, claude-3-5-sonnet, llama3:8b"
                  }
                  value={data.model || ""}
                  onChange={(e) => updateLLMData({ model: e.target.value })}
                />
                {currentModels.length > 0 && (
                  <button
                    type="button"
                    className="h-6 px-1.5 text-[9px] rounded bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/60 flex items-center gap-1 shrink-0 nodrag transition-colors"
                    onClick={() => {
                      setIsCustomModel(false);
                      const fallback =
                        activePreset?.defaultModel || currentModels[0] || "";
                      updateLLMData({ model: fallback });
                    }}
                    title="Switch back to preset models"
                  >
                    <ListFilter className="w-3 h-3 text-sky-400" />
                    <span>Presets</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* API Key / Secret Token */}
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-medium text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3 text-amber-400" /> API Key / Secret
              Token (Optional)
            </label>
            <LocalInput
              type="password"
              className="h-6 text-[10px] bg-background border border-border/60 rounded px-1.5 font-mono text-foreground nodrag"
              placeholder="Bearer sk-... or secret token"
              value={data.apiKeyHeader || ""}
              onChange={(e) => handleApiKeyChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
