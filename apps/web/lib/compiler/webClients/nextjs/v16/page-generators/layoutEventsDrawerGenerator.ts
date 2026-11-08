import type { LinkedRealtimeConnectionInfo } from "../types";
import { generateSseEffects } from "./sseEffectGenerator";
import { generateWebSocketEffects } from "./webSocketEffectGenerator";

/**
 * Generates the LayoutEventsDrawer client component for a Next.js route group layout.
 * This component runs persistent real-time stream listeners (SSE, WebSocket),
 * applies response mappings to Zustand stores, and renders a floating collapsible
 * Output Log drawer that persists across child page navigations.
 */
export function generateLayoutEventsDrawer(
  realtimeConnections: LinkedRealtimeConnectionInfo[] = [],
  hasAuth: boolean = false,
  groupName: string = "Layout",
): string {
  const sseConns = realtimeConnections.filter((c) => c.protocol === "SSE" || !c.protocol);
  const wsConns = realtimeConnections.filter((c) => c.protocol === "WEBSOCKET");
  const hasRealtime = realtimeConnections.length > 0;
  const hasSse = sseConns.length > 0;
  const hasWs = wsConns.length > 0;

  // Collect any referenced store names from bindings
  const storeNames = new Set<string>();
  realtimeConnections.forEach((conn) => {
    const bindings =
      conn.storeActionBindings || (conn.storeActionBinding ? [conn.storeActionBinding] : []);
    bindings.forEach((b) => {
      if (b.storeName) {
        const clean = b.storeName.replace(/Store$/i, "");
        const hook = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
        storeNames.add(hook);
      }
    });
  });

  const storeImports =
    storeNames.size > 0
      ? `import { ${Array.from(storeNames).sort().join(", ")} } from "@/lib/stores";\n`
      : "";

  const hasDynamicRoute = realtimeConnections.some(
    (c) =>
      (c.pathParamBindings && Object.keys(c.pathParamBindings).length > 0) ||
      (c.queryParamBindings && Object.keys(c.queryParamBindings).length > 0) ||
      (c.streamUrl && /(?:\/|^):[a-zA-Z0-9_-]+|\[[a-zA-Z0-9_.-]+\]/.test(c.streamUrl)) ||
      (c.room && /\$\{/.test(c.room)),
  );

  const navigationImports = hasDynamicRoute
    ? `import { useParams, useSearchParams } from "next/navigation";\n`
    : "";

  const routeParamsHook = hasDynamicRoute
    ? `  const routeParams = useParams();\n  const routeSearchParams = useSearchParams();\n\n`
    : "";

  const authImport = hasAuth && hasWs ? `import { getAuthBearerToken } from "@/lib/auth-token";\n` : "";

  const sseEffectsJsx = generateSseEffects(sseConns);
  const wsEffectsJsx = generateWebSocketEffects(wsConns, hasAuth);

  return `"use client";

import React, { useState, useEffect } from "react";
${navigationImports}${authImport}${storeImports}import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Activity, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

export interface LayoutLogEntry {
  id: string;
  eventName: string;
  eventType: string;
  timestamp: string;
  url?: string;
  method?: string;
  status?: number;
  payload?: unknown;
  data: unknown;
  error?: string;
  isStreaming?: boolean;
}

export function LayoutEventsDrawer() {
  const showDebugLogs =
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS?.trim().toLowerCase() === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI?.trim().toLowerCase() === "true";

  const [isOpen, setIsOpen] = useState(false);
  const [triggerLogs, setTriggerLogs] = useState<LayoutLogEntry[]>([]);
  const lastDispatchedIdRef = React.useRef<string | null>(null);

  // Broadcast layout stream logs to child pages via decoupled microtask
  useEffect(() => {
    if (triggerLogs.length === 0 || typeof window === "undefined") return;
    const latest = triggerLogs[0];
    if (latest && latest.id !== lastDispatchedIdRef.current) {
      lastDispatchedIdRef.current = latest.id;
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent("dezign:layout-log", { detail: latest }));
      });
    }
  }, [triggerLogs]);

${routeParamsHook}${sseEffectsJsx}${wsEffectsJsx}  // Listen for layout-level custom log events from buttons or child components
  useEffect(() => {
    const handleLogEvent = (e: Event) => {
      if (
        e instanceof CustomEvent &&
        typeof e.detail === "object" &&
        e.detail !== null &&
        "id" in e.detail &&
        typeof e.detail.id === "string" &&
        e.detail.id !== lastDispatchedIdRef.current &&
        "eventName" in e.detail &&
        typeof e.detail.eventName === "string"
      ) {
        const detailObj = e.detail;
        const entry: LayoutLogEntry = {
          id: detailObj.id,
          eventName: detailObj.eventName,
          eventType: typeof detailObj.eventType === "string" ? detailObj.eventType : "EVENT",
          timestamp: typeof detailObj.timestamp === "string" ? detailObj.timestamp : new Date().toLocaleTimeString(),
          url: typeof detailObj.url === "string" ? detailObj.url : undefined,
          method: typeof detailObj.method === "string" ? detailObj.method : undefined,
          status: typeof detailObj.status === "number" ? detailObj.status : undefined,
          payload: "payload" in detailObj ? detailObj.payload : undefined,
          data: "data" in detailObj ? detailObj.data : detailObj,
          error: typeof detailObj.error === "string" ? detailObj.error : undefined,
        };
        queueMicrotask(() => {
          setTriggerLogs((prev) => {
            if (prev.some((l) => l.id === entry.id)) return prev;
            return [entry, ...prev];
          });
        });
      }
    };
    window.addEventListener("dezign:layout-log", handleLogEvent);
    return () => window.removeEventListener("dezign:layout-log", handleLogEvent);
  }, []);

  if (!showDebugLogs) {
    return null;
  }

  const hasActiveStream = ${hasSse || hasWs};

  return (
    <aside
      aria-label="Layout Output Log"
      className="fixed bottom-3 right-4 z-50 pointer-events-auto flex flex-col items-end"
    >
      {/* Drawer Panel */}
      <div
        className={
          "w-[520px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-xl border border-border bg-card/95 backdrop-blur overflow-hidden flex flex-col transition-all duration-150 ease-out origin-bottom-right mb-2 " +
          (isOpen
            ? "opacity-100 scale-100 translate-y-0 max-h-[420px] pointer-events-auto"
            : "opacity-0 scale-95 translate-y-1 max-h-0 pointer-events-none border-transparent p-0 m-0")
        }
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-xs text-foreground">Layout Output Log</span>
            {hasActiveStream && (
              <Badge
                variant="outline"
                className="text-[9px] font-mono text-muted-foreground border-border bg-muted/30 flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Persistent Stream Active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {triggerLogs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTriggerLogs([])}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive cursor-pointer"
                title="Clear logs"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Collapse"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="p-3 overflow-y-auto max-h-[350px] space-y-2 font-mono text-xs">
          {triggerLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs italic border border-dashed border-border/60 rounded-lg">
              ${hasRealtime ? "Listening for real-time layout events..." : "No activity logged yet."}
            </div>
          ) : (
            triggerLogs.map((log) => (
              <div
                key={log.id}
                className="bg-background/80 border border-border/60 rounded-lg p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{log.eventName}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-primary/10 text-primary border border-primary/20">
                      {log.eventType || "EVENT"}
                    </span>
                    {log.status && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {log.status}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px]">{log.timestamp}</span>
                </div>
                {log.error ? (
                  <div className="text-destructive bg-destructive/10 p-2 rounded text-[11px]">
                    Error: {log.error}
                  </div>
                ) : (
                  <pre className="text-foreground/90 bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap text-[11px] max-h-40">
                    {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Persistent Dock Toggle Pill */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 bg-card/95 border border-border shadow-xl rounded-full px-3 py-1.5 text-xs backdrop-blur font-mono text-foreground hover:bg-muted/40 transition-colors cursor-pointer select-none"
        title={isOpen ? "Collapse Layout Output Log" : "Open Layout Output Log"}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <span className="font-semibold text-foreground">Layout Output Log</span>
        {hasActiveStream && (
          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 rounded-full font-mono">
            LIVE
          </span>
        )}
        {triggerLogs.length > 0 && (
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.2 rounded-full font-bold">
            {triggerLogs.length}
          </span>
        )}
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
        )}
      </button>
    </aside>
  );
}
`;
}
