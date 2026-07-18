"use client";

import { TerminalSquare } from "lucide-react";
import { useSimulationStore } from "@/lib/stores/simulationStore";

function formatPayload(payload: unknown) {
  if (payload === undefined) return "";
  const text = JSON.stringify(payload);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function SimulationTerminal() {
  const { status, trace, activeIndex, terminalOpen } = useSimulationStore();
  if (!terminalOpen) return null;

  const visibleTrace = trace.slice(0, activeIndex + 1);
  const statusLabel = status === "idle" ? "READY" : status === "running" ? "RUNNING" : status === "failed" ? "FAILED" : "COMPLETE";

  return (
    <section className="w-[min(720px,calc(100vw-3rem))] max-h-48 overflow-y-auto rounded-lg border bg-background/95 shadow-lg backdrop-blur" aria-label="Simulation terminal">
      <header className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        <TerminalSquare className="h-3.5 w-3.5" />
        <span>Simulation terminal</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{statusLabel}</span>
      </header>
      <div className="space-y-1 px-3 py-2 font-mono text-[10px]">
        {visibleTrace.length === 0 && (
          <div className="text-muted-foreground">No simulation executed. Select a test case and trigger an event to see the execution trace.</div>
        )}
        {visibleTrace.map((entry, index) => (
          <div key={`${entry.id}-${index}`} className={entry.status === "failed" ? "text-destructive" : "text-foreground"}>
            <span className="mr-2 text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span>{entry.status === "failed" ? "✕" : "›"} {entry.label}</span>
            {entry.input !== undefined && <span className="text-muted-foreground"> in={formatPayload(entry.input)}</span>}
            {entry.output !== undefined && <span className="text-muted-foreground"> out={formatPayload(entry.output)}</span>}
            {entry.detail && <span> — {entry.detail}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
