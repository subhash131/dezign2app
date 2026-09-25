import React from "react";
import { TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import {
  Layers,
  Sparkles,
  Shield,
  FileCode,
  Settings,
  Database,
  Upload,
} from "lucide-react";

interface WebPageTabsNavProps {
  sectionsCount: number;
  storeCount?: number;
  hasUploadsConfig?: boolean;
}

export function WebPageTabsNav({
  sectionsCount,
  storeCount = 0,
  hasUploadsConfig = false,
}: WebPageTabsNavProps) {
  return (
    <div className="border-b border-border/50 pb-2 bg-background">
      <TabsList className="grid w-full grid-cols-7 h-8 p-0.5 bg-secondary/50 border border-border/40 rounded-lg">
        <TabsTrigger
          value="sections"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Layers size={12} className="shrink-0" />
          <span className="truncate">Sections</span>
          {sectionsCount > 0 && (
            <span className="px-1 py-0.2 rounded-full text-[9px] bg-secondary text-muted-foreground font-mono font-medium">
              {sectionsCount}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger
          value="state"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Database size={12} className="shrink-0 text-cyan-500" />
          <span className="truncate">State</span>
          {storeCount > 0 && (
            <span className="px-1 py-0.2 rounded-full text-[9px] bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-mono font-medium">
              {storeCount}
            </span>
          )}
        </TabsTrigger>

        <TabsTrigger
          value="uploads"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Upload size={12} className="shrink-0 text-amber-500" />
          <span className="truncate">Upload</span>
          {hasUploadsConfig && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          )}
        </TabsTrigger>

        <TabsTrigger
          value="api"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Settings size={12} className="shrink-0" />
          <span className="truncate">API</span>
        </TabsTrigger>

        <TabsTrigger
          value="code"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <FileCode size={12} className="shrink-0" />
          <span className="truncate">Sync</span>
        </TabsTrigger>

        <TabsTrigger
          value="protection"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Shield size={12} className="shrink-0" />
          <span className="truncate">Auth</span>
        </TabsTrigger>

        <TabsTrigger
          value="ai"
          className="text-[11px] flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground transition-all font-medium px-1 cursor-pointer"
        >
          <Sparkles size={12} className="shrink-0" />
          <span className="truncate">AI</span>
        </TabsTrigger>
      </TabsList>
    </div>
  );
}

