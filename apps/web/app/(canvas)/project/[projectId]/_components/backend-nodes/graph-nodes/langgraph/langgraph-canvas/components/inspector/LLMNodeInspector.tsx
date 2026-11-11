import React, { useState, useEffect } from "react";
import {
  Trash,
  Globe,
  Key,
  Code,
  Shield,
  ListFilter,
  PenLine,
  Plus,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@workspace/ui/components/select";
import type { LangGraphLLMNodeData } from "@workspace/canvas";
import { LocalInput, LocalTextarea } from "../../../../common";
import { LLM_PROVIDER_PRESETS } from "./constants";
import {
  saveLocalEnvVariable,
  getLocalEnvVariable,
  fetchLocalEnvVariable,
} from "@/lib/utils/localEnvSync";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";

interface LLMNodeInspectorProps {
  selectedLLMData: LangGraphLLMNodeData;
  onDeleteStep: () => void;
  onUpdateLLM?: (changes: Partial<LangGraphLLMNodeData>) => void;
}

export function LLMNodeInspector({
  selectedLLMData,
  onDeleteStep,
  onUpdateLLM,
}: LLMNodeInspectorProps) {
  const activeProviderKey = selectedLLMData.provider || "openai";
  const activePreset =
    LLM_PROVIDER_PRESETS[activeProviderKey] || LLM_PROVIDER_PRESETS.custom;
  const currentModels = activePreset?.models || [];

  const isModelInPresets = currentModels.includes(selectedLLMData.model || "");
  const [isCustomModel, setIsCustomModel] = useState(
    !isModelInPresets && Boolean(selectedLLMData.model),
  );

  useEffect(() => {
    const inPresets = currentModels.includes(selectedLLMData.model || "");
    if (selectedLLMData.model && !inPresets) {
      setIsCustomModel(true);
    } else if (!selectedLLMData.model) {
      setIsCustomModel(false);
    }
  }, [
    selectedLLMData.provider,
    (selectedLLMData as any).id,
    (selectedLLMData as any).llmId,
    currentModels,
  ]);

  const handleApiKeyChange = (val: string) => {
    onUpdateLLM?.({ apiKeyHeader: val });

    const cleanVal = val.replace(/^Bearer\s+/i, "").trim();
    if (!cleanVal) return;

    const provider = (selectedLLMData.provider || "openai").toLowerCase();
    const envVarName =
      LLM_PROVIDER_PRESETS[provider]?.defaultApiKeyEnv ||
      (provider === "groq" ? "GROQ_API_KEY" : `${provider.toUpperCase()}_API_KEY`);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`dezign2app_lg_key_${provider}`, cleanVal);
        localStorage.setItem(`dezign2app_env_${envVarName}`, cleanVal);
      } catch {}
    }

    saveLocalEnvVariable(envVarName, cleanVal)
      .then((res) => {
        if (res.success) {
          toast.success(`Saved ${envVarName} to local .env`);
        }
      })
      .catch(() => {});

    const store = useBackendCanvasStore.getState();
    const allCanvasNodes = store.nodes;
    const parentLangGraphNode =
      allCanvasNodes.find(
        (n) =>
          n.type === "langgraph" &&
          (n.data?.customLlmNodes || []).some(
            (llm: any) => llm.id === (selectedLLMData as any).id,
          ),
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

  const defaultBody = JSON.stringify(
    {
      model:
        selectedLLMData.model || activePreset?.defaultModel || "gpt-4o-mini",
      messages: [{ role: "user", content: "{{input}}" }],
      temperature: selectedLLMData.temperature ?? 0.7,
    },
    null,
    2,
  );

  const defaultHeaders = JSON.stringify(
    {
      "Content-Type": "application/json",
      Authorization: selectedLLMData.apiKeyHeader
        ? `Bearer ${selectedLLMData.apiKeyHeader}`
        : "Bearer YOUR_API_KEY",
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-primary/15 text-primary rounded border border-primary/20 shadow-sm uppercase">
            {activeProviderKey}
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">
            LLM Config
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onDeleteStep}
        >
          <Trash className="w-3.5 h-3.5 mr-1" /> Delete
        </Button>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Node Label</Label>
        <LocalInput
          className="h-8 text-xs bg-background/50"
          value={selectedLLMData.label || ""}
          onChange={(e) => onUpdateLLM?.({ label: e.target.value })}
        />
      </div>

      {/* Provider Preset */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">Provider Preset</Label>
        <Select
          value={activeProviderKey}
          onValueChange={(val: string) => {
            const preset = LLM_PROVIDER_PRESETS[val];
            if (preset) {
              onUpdateLLM?.({
                provider: val,
                url: preset.defaultUrl,
                baseUrl: preset.defaultUrl,
                model: preset.defaultModel,
              });
            } else {
              onUpdateLLM?.({ provider: val });
            }
            setIsCustomModel(false);
          }}
        >
          <SelectTrigger className="h-8 text-xs bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LLM_PROVIDER_PRESETS).map(([key, preset]) => (
              <SelectItem key={key} value={key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model Identifier */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Model Identifier</Label>
          {currentModels.length > 0 && (
            <div className="flex items-center gap-1.5">
              {isCustomModel ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModel(false);
                    const fallback =
                      activePreset?.defaultModel || currentModels[0] || "";
                    onUpdateLLM?.({ model: fallback });
                  }}
                  className="text-xs text-sky-400 hover:underline cursor-pointer flex items-center gap-1"
                  title="Switch to preset models"
                >
                  <ListFilter className="w-3 h-3" />
                  <span>Use presets</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCustomModel(true)}
                  className="text-xs text-muted-foreground hover:text-sky-400 hover:underline cursor-pointer flex items-center gap-1"
                  title="Configure custom model"
                >
                  <Plus className="w-3 h-3" />
                  <span>Custom model</span>
                </button>
              )}
            </div>
          )}
        </div>
        {currentModels.length > 0 && !isCustomModel ? (
          <div className="flex items-center gap-1.5">
            <Select
              value={
                currentModels.includes(selectedLLMData.model || "")
                  ? selectedLLMData.model
                  : activePreset?.defaultModel || currentModels[0]
              }
              onValueChange={(val: string) => {
                if (val === "__custom__") {
                  setIsCustomModel(true);
                } else {
                  onUpdateLLM?.({ model: val });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background/50 font-mono flex-1">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
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
                    <Plus className="w-3.5 h-3.5" />
                    Custom Model...
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-sky-400"
              onClick={() => setIsCustomModel(true)}
              title="Configure custom model"
            >
              <PenLine className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <LocalInput
              autoFocus={isCustomModel}
              className="h-8 text-xs bg-background/50 font-mono flex-1"
              placeholder={
                activePreset?.defaultModel
                  ? `e.g. ${activePreset.defaultModel}, custom-model`
                  : "e.g. gpt-4o, claude-3-5-sonnet, llama3:8b"
              }
              value={selectedLLMData.model || ""}
              onChange={(e) => onUpdateLLM?.({ model: e.target.value })}
            />
            {currentModels.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                onClick={() => {
                  setIsCustomModel(false);
                  const fallback =
                    activePreset?.defaultModel || currentModels[0] || "";
                  onUpdateLLM?.({ model: fallback });
                }}
                title="Switch back to preset models"
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Presets</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* System Prompt */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium">
          System Prompt / Instructions
        </Label>
        <LocalTextarea
          className="min-h-[90px] text-xs bg-background/50 p-2 font-mono leading-relaxed resize-y placeholder:text-muted-foreground/50"
          placeholder="You are a helpful AI assistant..."
          value={selectedLLMData.systemPrompt || ""}
          onChange={(e) => onUpdateLLM?.({ systemPrompt: e.target.value })}
        />
      </div>

      {/* Method & URL - Only show for custom provider */}
      {activeProviderKey === "custom" && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" /> Base URL /
            Endpoint
          </Label>
          <div className="flex items-center gap-1.5">
            <Select
              value={selectedLLMData.method || "POST"}
              onValueChange={(val: string) => onUpdateLLM?.({ method: val })}
            >
              <SelectTrigger className="h-8 w-20 text-xs font-mono bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
            <LocalInput
              className="h-8 text-xs bg-background/50 font-mono flex-1"
              placeholder="https://api.openai.com/v1/chat/completions"
              value={
                selectedLLMData.url ||
                selectedLLMData.baseUrl ||
                activePreset?.defaultUrl ||
                ""
              }
              onChange={(e) =>
                onUpdateLLM?.({ url: e.target.value, baseUrl: e.target.value })
              }
            />
          </div>
        </div>
      )}

      {/* Auth Key */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-muted-foreground" /> Secret API
          Key (Optional)
        </Label>
        <LocalInput
          type="password"
          className="h-8 text-xs bg-background/50 font-mono"
          placeholder="Bearer sk-... or secret token"
          value={selectedLLMData.apiKeyHeader || ""}
          onChange={(e) => handleApiKeyChange(e.target.value)}
        />
      </div>

      {/* Headers & Body JSON - Only show for custom provider */}
      {activeProviderKey === "custom" && (
        <>
          <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-muted-foreground" /> Headers
              (JSON)
            </span>
            <LocalTextarea
              className="min-h-[80px] max-h-[140px] text-xs bg-background/50 focus-visible:ring-1 font-mono resize-none p-2.5 rounded-md"
              placeholder='{\n  "Content-Type": "application/json"\n}'
              rows={4}
              value={
                selectedLLMData.headersJson !== undefined
                  ? selectedLLMData.headersJson
                  : defaultHeaders
              }
              onChange={(e) => onUpdateLLM?.({ headersJson: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-muted-foreground" /> Request
              Payload (JSON Body)
            </span>
            <LocalTextarea
              className="min-h-[110px] max-h-[200px] text-xs bg-background/50 focus-visible:ring-1 font-mono resize-none p-2.5 rounded-md"
              placeholder='{\n  "model": "gpt-4o",\n  "messages": [{"role": "user", "content": "{{input}}"}]\n}'
              rows={6}
              value={
                selectedLLMData.bodyJson !== undefined
                  ? selectedLLMData.bodyJson
                  : defaultBody
              }
              onChange={(e) => onUpdateLLM?.({ bodyJson: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
