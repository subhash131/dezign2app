import React, { useState, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Terminal, Copy, Check } from "lucide-react";
import { ConfigItemData } from "../types";
import { PreviewTab } from "./types";
import {
  generateSdkSnippet,
  generateConfigSpec,
  generateEnvSnippet,
} from "./snippetUtils";

export interface StoragePreviewSectionProps {
  item: ConfigItemData;
}

export const StoragePreviewSection: React.FC<StoragePreviewSectionProps> = ({
  item,
}) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>("code");
  const [copied, setCopied] = useState<boolean>(false);

  const activeSnippet = useMemo(() => {
    if (activeTab === "code") return generateSdkSnippet(item);
    if (activeTab === "spec") return generateConfigSpec(item);
    return generateEnvSnippet(item);
  }, [item, activeTab]);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(activeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <Terminal size={14} className="text-amber-500" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
            Configuration & SDK Preview
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={activeTab === "code" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setActiveTab("code")}
          >
            SDK Code
          </Button>
          <Button
            type="button"
            variant={activeTab === "spec" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setActiveTab("spec")}
          >
            Config Spec (JSON)
          </Button>
          <Button
            type="button"
            variant={activeTab === "env" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setActiveTab("env")}
          >
            .env File
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 ml-1"
            onClick={handleCopy}
          >
            {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>

      <pre className="p-3 rounded-lg bg-background/90 border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto leading-relaxed max-h-[320px]">
        {activeSnippet}
      </pre>
    </div>
  );
};
