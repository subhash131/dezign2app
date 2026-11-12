"use client";

import React from "react";
import type { MountConfig } from "@workspace/canvas/types";
import { Badge } from "@workspace/ui/components/badge";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { Zap, Globe, ShieldAlert, Check, Clock, Code2, Info } from "lucide-react";

export interface MountExecutionStrategySectionProps {
  mountConfig: MountConfig;
  onChange: (config: MountConfig) => void;
  isProtected?: boolean;
  hasEndpoint?: boolean;
}

export function MountExecutionStrategySection({
  mountConfig,
  onChange,
  isProtected = false,
  hasEndpoint = true,
}: MountExecutionStrategySectionProps) {
  const currentStrategy = mountConfig?.strategy === "ssr" ? "ssr" : "client";
  const currentCacheMode = mountConfig?.cacheMode || "no-store";
  const revalidateSeconds = mountConfig?.revalidateSeconds ?? 60;

  const handleSelectStrategy = (strategy: "client" | "ssr") => {
    onChange({
      ...(mountConfig || {}),
      strategy,
      cacheMode: mountConfig?.cacheMode || "no-store",
    });
  };

  const handleSelectCacheMode = (cacheMode: "no-store" | "force-cache" | "revalidate") => {
    onChange({
      ...(mountConfig || {}),
      cacheMode,
    });
  };

  const handleRevalidateChange = (val: number) => {
    onChange({
      ...(mountConfig || {}),
      revalidateSeconds: Math.max(1, val || 1),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header Description */}
      <div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Choose whether initial page data is fetched in the browser on mount or pre-rendered on the Next.js server.
        </p>
      </div>

      {/* Strategy Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Client (useEffect) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelectStrategy("client")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectStrategy("client");
            }
          }}
          className={cn(
            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2.5",
            currentStrategy === "client"
              ? "bg-secondary/70 border-sky-500/60 ring-1 ring-sky-500/50 shadow-sm"
              : "bg-secondary/20 border-border/40 hover:bg-secondary/40",
          )}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Zap size={14} className="text-amber-500" /> Client (useEffect)
              </span>
              {currentStrategy === "client" ? (
                <Check size={14} className="text-sky-500" />
              ) : (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                  Default
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Runs in the user&apos;s browser after mount. Best for authenticated dashboards with localStorage tokens, direct Zustand stores, and live simulation.
            </p>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
            <span>deps: []</span>
            <span>•</span>
            <span>Client State</span>
          </div>
        </div>

        {/* Server-Side (SSR) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelectStrategy("ssr")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSelectStrategy("ssr");
            }
          }}
          className={cn(
            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2.5",
            currentStrategy === "ssr"
              ? "bg-secondary/70 border-sky-500/60 ring-1 ring-sky-500/50 shadow-sm"
              : "bg-secondary/20 border-border/40 hover:bg-secondary/40",
          )}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe size={14} className="text-sky-500" /> Server-Side (SSR)
              </span>
              {currentStrategy === "ssr" ? (
                <Check size={14} className="text-sky-500" />
              ) : (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-sky-500/80 border-sky-500/30">
                  SEO Ready
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pre-renders data on the Next.js server before transmitting HTML. Best for public pages, SEO indexing, and zero loading spinner flicker.
            </p>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
            <span>async Page()</span>
            <span>•</span>
            <span>RSC</span>
          </div>
        </div>
      </div>

      {/* Helper cue when client strategy is active */}
      {currentStrategy === "client" && (
        <p className="text-[11px] text-muted-foreground/80 italic flex items-center gap-1.5 px-0.5">
          <span>💡</span>
          <span>Select the <strong>Server-Side</strong> card above to configure Next.js server caching (no-store, force-cache, ISR revalidate).</span>
        </p>
      )}

      {/* No Connected Endpoint Notice if SSR is selected */}
      {currentStrategy === "ssr" && !hasEndpoint && (
        <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-xs flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            No API endpoint connected to this action in canvas. Connect an edge to a backend endpoint to enable server-side pre-fetching. Currently compiles to a clean Server Component with <code className="font-mono">initialData={null}</code>.
          </p>
        </div>
      )}

      {/* Protected Page Notice if SSR is selected */}
      {currentStrategy === "ssr" && isProtected && (
        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            <strong>Notice:</strong> This page is protected. Server-side fetching will require cookie-based session forwarding, as client <code className="font-mono text-amber-500">localStorage</code> tokens are not accessible on the Node.js server.
          </p>
        </div>
      )}

      {/* SSR Caching Configuration (Only visible when SSR is selected) */}
      {currentStrategy === "ssr" && (
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Clock size={13} className="text-sky-500" /> Next.js Cache Strategy
            </Label>
            <Badge variant="outline" className="text-[10px] font-mono">
              {currentCacheMode}
            </Badge>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => handleSelectCacheMode("no-store")}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-center transition-all text-[11px]",
                currentCacheMode === "no-store"
                  ? "bg-primary text-primary-foreground font-medium border-primary shadow-xs"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-secondary/50",
              )}
            >
              Dynamic (no-store)
            </button>
            <button
              type="button"
              onClick={() => handleSelectCacheMode("force-cache")}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-center transition-all text-[11px]",
                currentCacheMode === "force-cache"
                  ? "bg-primary text-primary-foreground font-medium border-primary shadow-xs"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-secondary/50",
              )}
            >
              Static (force-cache)
            </button>
            <button
              type="button"
              onClick={() => handleSelectCacheMode("revalidate")}
              className={cn(
                "px-2 py-1.5 rounded-lg border text-center transition-all text-[11px]",
                currentCacheMode === "revalidate"
                  ? "bg-primary text-primary-foreground font-medium border-primary shadow-xs"
                  : "bg-background border-border/60 text-muted-foreground hover:bg-secondary/50",
              )}
            >
              ISR (revalidate)
            </button>
          </div>

          {currentCacheMode === "revalidate" && (
            <div className="flex items-center gap-2 pt-1">
              <Label className="text-xs text-muted-foreground shrink-0">Revalidate interval:</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  value={revalidateSeconds}
                  onChange={(e) => handleRevalidateChange(parseInt(e.target.value, 10))}
                  className="h-7 w-20 text-xs font-mono text-center"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Code Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Code2 size={13} className="text-primary" />
          <span>Generated Next.js Pattern</span>
        </div>
        <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
          {currentStrategy === "ssr" ? (
            <pre className="whitespace-pre">
{hasEndpoint ? `// Server Component (app/.../page.tsx)
export default async function Page() {
  const res = await fetch("/api/data", {
    ${currentCacheMode === "revalidate" ? `next: { revalidate: ${revalidateSeconds} }` : `cache: "${currentCacheMode}"`}
  });
  const initialData = await res.json();
  return <PageClient initialData={initialData} />;
}` : `// Server Component (app/.../page.tsx)
// (Connect an API endpoint to enable server-side pre-fetching)
export default async function Page() {
  return <PageClient initialData={null} initialError={null} />;
}`}
            </pre>
          ) : (
            <pre className="whitespace-pre">
{`// Client Component (app/.../page.tsx)
"use client";

export default function Page() {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/data");
      setData(await res.json());
    }
    load();
  }, []); // Runs once in browser on mount
}`}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default MountExecutionStrategySection;
