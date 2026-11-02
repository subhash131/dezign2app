import React, { useState, useCallback } from "react";
import { Panel } from "@xyflow/react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { LayoutTemplate, RotateCcw, Users, FileJson, Check, Sparkles, Braces } from "lucide-react";
import { toast } from "sonner";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { useTestUsersStore } from "../test-users/useTestUsersStore";
import { formatSystemContextForAi, formatSystemContextAsToon } from "@/lib/system-context/formatSystemContext";

interface TopToolbarPanelProps {
  onLayout: (direction: "LR" | "TB") => void;
  projectId?: string;
  projectName?: string;
}

export const TopToolbarPanel: React.FC<TopToolbarPanelProps> = React.memo(({
  onLayout,
  projectId,
  projectName,
}) => {
  const isSimulationActive = useSimulationStore((s) => s.status !== "idle");
  const clearSimulation = useSimulationStore((s) => s.clear);
  const personas = useTestUsersStore((s) => s.personas);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const paletteOpen = useSidebarStore((s) => s.paletteOpen);
  const paletteWidth = useSidebarStore((s) => s.paletteWidth);

  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedAiContext, setCopiedAiContext] = useState(false);
  const [copiedToon, setCopiedToon] = useState(false);

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);
  const identityProviders = useBackendCanvasStore((s) => s.identityProviders);
  const storeProjectId = useBackendCanvasStore((s) => s.projectId);
  const effectiveProjectId = projectId || storeProjectId || "";

  const handleCopyAiContext = useCallback(async () => {
    try {
      const projectPayload = {
        project: {
          id: effectiveProjectId,
          name: projectName || "Untitled Project",
        },
        nodes,
        edges,
        endpoints,
        events,
        identityProviders,
        testUsers: personas,
      };

      const plainText = formatSystemContextForAi(projectPayload, {
        includeNodeIds: true,
        includeDiagnostics: true,
      });

      // Log to browser console so user can directly inspect and explore the clean text
      console.log("[AI System Context (Plain Text)]\n" + plainText);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(plainText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = plainText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedAiContext(true);
      toast.success("AI context copied to clipboard!", {
        description: "Clean plain-text system context with technical node IDs and topology details. Also logged to browser console.",
      });
      setTimeout(() => setCopiedAiContext(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy";
      toast.error("Failed to copy AI context", {
        description: message,
      });
    }
  }, [effectiveProjectId, projectName, nodes, edges, endpoints, events, identityProviders, personas]);

  const handleCopyToon = useCallback(async () => {
    try {
      const projectPayload = {
        project: {
          id: effectiveProjectId,
          name: projectName || "Untitled Project",
        },
        nodes,
        edges,
        endpoints,
        events,
        identityProviders,
        testUsers: personas,
      };

      const toonText = formatSystemContextAsToon(projectPayload);

      // Log to browser console so user can directly inspect and explore the TOON text
      console.log("[Project TOON (Token-Oriented Object Notation)]\n" + toonText);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(toonText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = toonText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedToon(true);
      toast.success("TOON format copied to clipboard!", {
        description: "Token-Oriented Object Notation (TOON) saves context tokens for LLM prompts. Also logged to browser console.",
      });
      setTimeout(() => setCopiedToon(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy";
      toast.error("Failed to copy TOON format", {
        description: message,
      });
    }
  }, [effectiveProjectId, projectName, nodes, edges, endpoints, events, identityProviders, personas]);

  const handleCopyProjectJson = useCallback(async () => {
    try {
      const projectPayload = {
        project: {
          id: effectiveProjectId,
          name: projectName || "Untitled Project",
        },
        nodes,
        edges,
        endpoints,
        events,
        identityProviders,
        testUsers: personas,
      };

      const jsonText = JSON.stringify(projectPayload, null, 2);

      // Log to browser console so user can directly inspect and explore the object
      console.log("[Project JSON]", projectPayload);

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(jsonText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = jsonText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedJson(true);
      toast.success("Project JSON copied to clipboard!", {
        description: `${nodes.length} nodes, ${edges.length} edges, ${endpoints.length} endpoints. Also logged to browser console.`,
      });
      setTimeout(() => setCopiedJson(false), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to copy";
      toast.error("Failed to copy project JSON", {
        description: message,
      });
    }
  }, [effectiveProjectId, projectName, nodes, edges, endpoints, events, identityProviders, personas]);

  return (
    <Panel
      position="top-left"
      className="pointer-events-auto select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-10"
      style={{
        top: "68px",
        left: paletteOpen ? `${paletteWidth + 16}px` : "124px",
      }}
    >
      <div className="flex items-center gap-1 p-1 rounded-xl bg-sidebar/95 backdrop-blur-md border border-sidebar-border shadow-lg">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
          onClick={() => onLayout("LR")}
          title="Auto-arrange nodes in left-to-right flow (Shift + A)"
        >
          <LayoutTemplate className="w-3.5 h-3.5 text-primary" />
          <span>Auto layout</span>
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono font-medium text-muted-foreground/80 bg-sidebar-accent/80 border border-sidebar-border px-1 py-0.5 rounded leading-none ml-0.5">
            ⇧A
          </kbd>
        </Button>

        <div className="w-px h-4 bg-sidebar-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent gap-1.5 transition-colors"
          onClick={handleCopyAiContext}
          title="Copy clean system architecture context for AI (plain text without **, -, headers, backticks, or other markdown formatters, including technical node IDs and link details) to clipboard"
        >
          {copiedAiContext ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          )}
          <span>{copiedAiContext ? "Copied AI Context" : "AI Context"}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent gap-1.5 transition-colors"
          onClick={handleCopyToon}
          title="Copy compact Token-Oriented Object Notation (TOON format: https://github.com/toon-format/toon) for token-efficient LLM prompts to clipboard"
        >
          {copiedToon ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
          ) : (
            <Braces className="w-3.5 h-3.5 text-primary" />
          )}
          <span>{copiedToon ? "Copied TOON" : "TOON"}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent gap-1.5 transition-colors"
          onClick={handleCopyProjectJson}
          title="Copy entire raw project JSON object (including SchemaView, LangGraph, endpoints, and edges) to clipboard"
        >
          {copiedJson ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-50 duration-200" />
          ) : (
            <FileJson className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span>{copiedJson ? "Copied JSON" : "Raw JSON"}</span>
        </Button>

        <div className="w-px h-4 bg-sidebar-border mx-0.5" />

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
          onClick={() =>
            setActiveConfigItem({
              type: "testUsers",
              id: "testUsers",
              nodeId: "testUsers",
            })
          }
          title="Manage Test Users & Database Seed Fixtures"
        >
          <Users className="w-3.5 h-3.5 text-primary" />
          <span>Test Users</span>
          <Badge
            variant="secondary"
            className="px-1.5 py-0 text-[10px] font-mono font-bold bg-sidebar-accent text-sidebar-foreground border border-sidebar-border"
          >
            {personas.length}
          </Badge>
        </Button>

        {isSimulationActive && (
          <>
            <div className="w-px h-4 bg-sidebar-border mx-0.5" />
            <Button
              variant="destructive"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5 shadow-sm"
              onClick={clearSimulation}
              title="Reset simulation state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
});
