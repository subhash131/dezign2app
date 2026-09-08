import React from "react";
import { Database, Layers, Key } from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { LocalInput } from "../../../../../common";
import type { LangGraphAgentMemoryConfig } from "@/types/canvas";

interface EntityNode {
  id: string;
  data?: {
    label?: string;
  };
}

interface AgentMemoryConfigSectionProps {
  memConfig: LangGraphAgentMemoryConfig;
  updateMemoryConfig: (changes: Partial<LangGraphAgentMemoryConfig>) => void;
  entities: EntityNode[];
}

export function AgentMemoryConfigSection({
  memConfig,
  updateMemoryConfig,
  entities,
}: AgentMemoryConfigSectionProps) {
  return (
    <div className="flex flex-col gap-4 p-3 bg-amber-950/10 dark:bg-amber-950/20 rounded-xl border border-amber-500/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-md border ${
              memConfig.enabled !== false
                ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                : "bg-secondary/30 border-border text-muted-foreground"
            }`}
          >
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              Memory & Checkpointer
              {memConfig.enabled !== false && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-semibold">
                  {memConfig.checkpointer || "memory"}
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono text-muted-foreground">
              Saves chat history & state checkpoints per session
            </p>
          </div>
        </div>

        <Switch
          checked={memConfig.enabled !== false}
          onCheckedChange={(enabled) => updateMemoryConfig({ enabled })}
        />
      </div>

      {memConfig.enabled !== false && (
        <div className="flex flex-col gap-4 pt-2 border-t border-amber-500/20">
          {/* Checkpointer Saver Choice */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" />
              Checkpointer Saver Engine
            </Label>
            <Select
              value={memConfig.checkpointer || "memory"}
              onValueChange={(val: string) =>
                updateMemoryConfig({ checkpointer: val })
              }
            >
              <SelectTrigger className="h-7 text-xs bg-background font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="memory">In-Memory (MemorySaver)</SelectItem>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.data?.label || e.id}>
                    {e.data?.label || "Untitled Table"} (Schema Entity)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Specifies backend persistence engine used to checkpoint and
              restore conversation state across turns.
            </p>
          </div>

          {/* Session ID / Thread Key */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              Session / Thread ID Key
            </Label>
            <LocalInput
              value={memConfig.threadIdKey || "thread_id"}
              onChange={(e) =>
                updateMemoryConfig({ threadIdKey: e.target.value })
              }
              className="h-7 text-xs font-mono bg-background"
              placeholder="thread_id"
            />
            <div className="flex flex-wrap gap-1 mt-0.5">
              {["thread_id", "session_id", "user_id"].map((keyName) => (
                <button
                  key={keyName}
                  type="button"
                  onClick={() => updateMemoryConfig({ threadIdKey: keyName })}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    (memConfig.threadIdKey || "thread_id") === keyName
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-300 font-bold"
                      : "bg-background/60 border-border/40 text-muted-foreground hover:bg-secondary/50"
                  }`}
                >
                  {keyName}
                </button>
              ))}
            </div>
            <p className="text-[9px] font-mono text-muted-foreground">
              Runtime config key:{" "}
              <code>{`configurable: { ${memConfig.threadIdKey || "thread_id"}: "..." }`}</code>
            </p>
          </div>

          {/* Auto Summarization & Limits */}
          <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-border/40">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-foreground">
                Auto-Summarize
              </span>
              <span className="text-[9px] text-muted-foreground">
                Compress past messages when token window exceeds limit
              </span>
            </div>
            <Switch
              checked={memConfig.autoSummarize ?? true}
              onCheckedChange={(autoSummarize) =>
                updateMemoryConfig({ autoSummarize })
              }
              className="scale-85 origin-right"
            />
          </div>
        </div>
      )}
    </div>
  );
}
