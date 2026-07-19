import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

export const LLMNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[380px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Brain} title="LLM" colorClass="bg-purple-500/10 text-purple-700 dark:text-purple-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Implementation + Model — Basic */}
      <div className="px-3 py-2 border-b nodrag flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0 w-24">Implementation</Label>
          <Select
            value={data.implementation || ""}
            onValueChange={(v) => updateNode(id, { data: { ...data, implementation: v } })}
          >
            <SelectTrigger className="h-6 text-xs flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OpenAI" className="text-xs">OpenAI</SelectItem>
              <SelectItem value="Anthropic" className="text-xs">Anthropic</SelectItem>
              <SelectItem value="Google Gemini" className="text-xs">Google Gemini</SelectItem>
              <SelectItem value="Mistral" className="text-xs">Mistral</SelectItem>
              <SelectItem value="Cohere" className="text-xs">Cohere</SelectItem>
              <SelectItem value="Ollama" className="text-xs">Ollama</SelectItem>
              <SelectItem value="Other" className="text-xs">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0 w-24">Model</Label>
          <Input
            className="h-6 text-xs bg-background flex-1"
            placeholder="gpt-4o"
            value={data.model || ""}
            onChange={(e) => updateNode(id, { data: { ...data, model: e.target.value } })}
          />
        </div>
      </div>

      {/* Prompts */}
      <EditableNodeList
        nodeId={id}
        title="Prompts"
        items={data.prompts || []}
        field="prompts"
        updateNode={updateNode}
        data={data}
      />

      {/* Tools */}
      <EditableNodeList
        nodeId={id}
        title="Tools"
        items={data.tools || []}
        field="tools"
        updateNode={updateNode}
        data={data}
      />

      {/* Advanced */}
      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">Advanced</span>
          <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground group-hover:text-foreground transition-all">
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        {advancedOpen && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 nodrag">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">Temperature</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="0.7"
                value={data.temperature ?? ""}
                onChange={(e) => updateNode(id, { data: { ...data, temperature: parseFloat(e.target.value) || undefined } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">Max Tokens</Label>
              <Input
                type="number"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="2048"
                value={data.maxTokens ?? ""}
                onChange={(e) => updateNode(id, { data: { ...data, maxTokens: parseInt(e.target.value) || undefined } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`tool-calling-${id}`} className="text-xs text-muted-foreground">Tool Calling</Label>
              <Switch
                id={`tool-calling-${id}`}
                className="nodrag"
                checked={data.toolCalling || false}
                onCheckedChange={(val) => updateNode(id, { data: { ...data, toolCalling: val } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`structured-output-${id}`} className="text-xs text-muted-foreground">Structured Output</Label>
              <Switch
                id={`structured-output-${id}`}
                className="nodrag"
                checked={data.structuredOutput || false}
                onCheckedChange={(val) => updateNode(id, { data: { ...data, structuredOutput: val } })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
