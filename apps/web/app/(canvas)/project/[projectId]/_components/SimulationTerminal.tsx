"use client";

import { Eraser, TerminalSquare, X } from "lucide-react";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { Button } from "@workspace/ui/components/button";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

function formatPayload(payload: unknown) {
  if (payload === undefined) return "";
  return JSON.stringify(payload, null, 2);
}

export function SimulationTerminal() {
  const { status, trace, activeIndex, terminalOpen } = useSimulationStore();
  const scrollRef = useRef<HTMLElement>(null);

  const visibleTrace = trace.slice(0, activeIndex + 1);
  const statusLabel = status === "idle" ? "READY" : status === "running" ? "RUNNING" : status === "failed" ? "FAILED" : "COMPLETE";

  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalOpen) return;
    const container = scrollRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const observer = new ResizeObserver(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "auto",
      });
    });

    observer.observe(inner);
    return () => observer.disconnect();
  }, [terminalOpen]);

  if (!terminalOpen) return null;

  return (
    <section
      ref={scrollRef}
      className="w-[min(720px,calc(100vw-3rem))] max-h-60 overflow-y-auto rounded-lg border bg-background/95 shadow-lg backdrop-blur hide-scrollbar" 
      aria-label="Simulation terminal"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        <TerminalSquare className="h-3.5 w-3.5" />
        <span>Simulation terminal</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{statusLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={() => useSimulationStore.getState().clear()}
        >
          <Eraser className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={() => useSimulationStore.setState({ terminalOpen: false })}
        >
          <X className="w-4 h-4" />
        </Button>
      </header>
      <div ref={innerRef} className="space-y-1 px-3 py-2 font-mono text-[10px]">
        <AnimatePresence initial={false}>
          {visibleTrace.length === 0 && (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="text-muted-foreground"
            >
              No simulation executed. Select a test case and trigger an event to see the execution trace.
            </motion.div>
          )}
          {visibleTrace.map((entry, index) => (
            <motion.div 
              key={`${entry.id}-${index}`}
              initial={{ opacity: 0, x: -10, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, x: -10, height: 0 }}
              transition={{ duration: 0.2 }}
              className={entry.status === "failed" ? "text-destructive overflow-hidden" : "text-foreground overflow-hidden"}
            >
              <div className="py-0.5">
                <span className="mr-2 text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <span className={
                  entry.kind === "messaging" ? "text-emerald-400" :
                  entry.kind === "push" ? "text-sky-400" :
                  entry.status === "failed" ? "text-destructive" : ""
                }>
                  {entry.status === "failed" ? "✕" :
                   entry.kind === "messaging" ? "⇢" :
                   entry.kind === "push" ? "⊳" :
                   "›"}{" "}
                  {entry.label}
                </span>
                {entry.detail && <span> — {entry.detail}</span>}
                {entry.input !== undefined && (
                  <pre className="mt-1 ml-6 text-muted-foreground whitespace-pre-wrap break-all bg-foreground/5 p-1.5 rounded border border-border/50">in = {formatPayload(entry.input)}</pre>
                )}
                {entry.output !== undefined && (
                  <pre className="mt-1.5 ml-6 text-muted-foreground whitespace-pre-wrap break-all bg-foreground/5 p-1.5 rounded border border-border/50">out = {formatPayload(entry.output)}</pre>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
