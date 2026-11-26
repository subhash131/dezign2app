import React from "react";
import {
  Network,
  Save,
  ArrowLeft,
  Trash,
  Check,
  Loader2,
  Code2,
  Terminal,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";

import { LocalInput } from "../../../common";
import { AppUpdateToolbarButton } from "@/app/(canvas)/project/[projectId]/_components/AppUpdateIndicator";

interface LangGraphCanvasHeaderProps {
  label?: string;
  onUpdateLabel?: (label: string) => void;
  onSave: () => void;
  onClose: () => void;
  onAutoLayout?: (direction?: "LR" | "TB") => void;
  onCompile?: () => void;
  saveStatus?: "saved" | "saving" | "idle";
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
}

export function LangGraphCanvasHeader({
  label,
  onUpdateLabel,
  onSave,
  onClose,
  onAutoLayout,
  onCompile,
  saveStatus = "idle",
  terminalOpen = false,
  onToggleTerminal,
}: LangGraphCanvasHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
          onClick={onClose}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-2 rounded-xl bg-secondary text-foreground border border-border">
          <Network className="w-4 h-4" />
        </div>
        {onUpdateLabel ? (
          <LocalInput
            className="h-8 px-3 rounded-md text-base font-bold bg-transparent border-none shadow-none focus-visible:ring-1 focus-visible:ring-ring text-foreground w-[240px] hover:bg-secondary/40 transition-colors"
            value={label || "LangGraph Agent"}
            onChange={(e) => onUpdateLabel(e.target.value)}
          />
        ) : (
          <span className="font-bold text-base text-foreground tracking-wide">
            {label || "LangGraph Agent Canvas"}
          </span>
        )}

        {/* Auto-Save Status Indicator */}
        <div className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/50 border border-border/50 text-muted-foreground transition-all">
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
              <span className="text-amber-500">Saving...</span>
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">Auto-saved</span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
              <span>Auto-save enabled</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <AppUpdateToolbarButton />
        {onToggleTerminal && (
          <Button
            variant={terminalOpen ? "secondary" : "outline"}
            size="sm"
            className={`h-8 font-semibold gap-1.5 px-3 border-border transition-all ${
              terminalOpen
                ? "bg-secondary text-foreground border-primary/40 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            }`}
            onClick={onToggleTerminal}
            title={terminalOpen ? "Hide Terminal (Ctrl+J)" : "Open Terminal (Ctrl+J)"}
          >
            <Terminal className="w-4 h-4 text-sky-400" />
            <span>Terminal</span>
          </Button>
        )}
        {onCompile && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 font-semibold gap-1.5 px-4 border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
            onClick={onCompile}
            title="Export as TypeScript LangGraph code"
          >
            <Code2 className="w-4 h-4 text-primary" />
            Export Code
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          className="h-8 font-semibold gap-1.5 px-4"
          onClick={onSave}
        >
          <Save className="w-4 h-4" /> Save & Close
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <Trash className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
