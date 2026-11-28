import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import type { Metadata } from "next";
import {
  Sparkles,
  Package,
  Layers,
  Cpu,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Flame,
  TrendingDown,
  Terminal,
  Code2,
  Workflow,
  Zap,
  Box,
  Braces,
  GitFork,
  Check,
  X,
  RefreshCw,
  Globe,
  Server,
  RotateCw,
  Settings,
  Trash2,
  ChevronsUpDown,
  KeyRound,
  Plus,
  ChevronDown,
  FileCode,
  Folder,
  ArrowDown,
} from "lucide-react";

export const metadata: Metadata = {
  title: "dpm — Dezign Package Manager | Universal Visual Package Layer",
  description:
    "dpm brings visual architecture contracts, syntax-free composition, and language-agnostic development to software packages across npm, Go, PyPI, and Cargo. Design once... switch to any language.",
};

export default function DpmPublicPage() {
  return (
    <div className="min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden selection:bg-white/20 selection:text-white font-sans">
      <Header />

      <main className="w-full flex flex-col items-center">
        {/* Compact Hero Section (Designed to fit comfortably in 100vh) */}
        <section className="w-full max-w-5xl px-4 sm:px-6 pt-8 pb-10 flex flex-col items-center text-center">
          {/* Upcoming Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px] font-mono mb-2.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-zinc-400"></span>
            </span>
            <span>UPCOMING SPECIFICATION • MANIFESTO & RFC</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-mono text-white max-w-3xl leading-[1.15]">
            Universal Visual Contracts for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-400">
              Software Packages
            </span>
          </h1>

          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-200 font-mono text-xs font-semibold tracking-wide">
            <Sparkles className="size-3 text-zinc-400" />
            <span>&ldquo;Design once... switch to any language&rdquo;</span>
          </div>

          <p className="mt-2.5 text-xs sm:text-sm text-zinc-400 max-w-xl leading-relaxed">
            Stop locking your application to a single language.{" "}
            <strong className="text-white">dpm</strong> abstracts software packages into visual capability contracts with verified I/O ports. Design once on canvas, compile to any supported programming language.
          </p>

          <div className="mt-3.5 flex flex-wrap gap-2.5 justify-center">
            <Link
              href="/#studio-views"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors"
            >
              <span>Explore Visual Canvas</span>
              <ArrowRight className="size-3" />
            </Link>
            <a
              href="https://github.com/dezign2app/dezign2app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium hover:text-white hover:border-zinc-700 transition-colors"
            >
              <GitFork className="size-3" />
              <span>Contribute to RFC</span>
            </a>
          </div>

          {/* 1 Design -> Any Language Interactive Section (Compact Viewport Fit) */}
          <div className="mt-6 w-full max-w-4xl flex flex-col items-center">
            {/* Header pill */}
            <div className="flex items-center justify-between w-full mb-2.5 px-1 text-[11px] font-mono text-zinc-500">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="size-3 text-zinc-400" />
                <span>ARCHITECTURAL PROJECTION</span>
              </span>
              <span className="text-zinc-300 font-semibold">1 Design ➔ Any Language</span>
            </div>

            {/* TOP: 1 Compact Visual Canvas Node */}
            <div className="w-full py-4 px-3 sm:px-6 rounded-xl bg-zinc-950/60 flex flex-col items-center relative">
              <div className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase mb-2.5 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-zinc-400" />
                <span>The Visual Architecture Contract (Canvas View)</span>
              </div>

              {/* The Realistic Canvas Service Node (Scaled Down) */}
              <div className="w-full max-w-[320px] bg-[#0c0c0e] border border-zinc-700/80 rounded-xl p-3 font-sans text-left shadow-xl relative">
                {/* Left primary handle */}
                <div className="absolute -left-1.5 top-4 w-2.5 h-2.5 rounded-full bg-zinc-300 border-2 border-zinc-900" />

                {/* Node Header */}
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/60">
                  <div className="flex items-center gap-1.5">
                    <Server className="size-3 text-zinc-300" />
                    <span className="font-mono text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                      SERVICE / API
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-400">
                      <KeyRound className="size-2" />
                      <span>5 env</span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded-full bg-zinc-900 border border-zinc-800 text-[9px] font-mono text-zinc-400">
                      <RotateCw className="size-2" />
                      <span>13 types</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <RotateCw className="size-3 hover:text-zinc-300 cursor-pointer transition-colors" />
                    <Settings className="size-3 hover:text-zinc-300 cursor-pointer transition-colors" />
                    <Trash2 className="size-3 hover:text-zinc-300 cursor-pointer transition-colors" />
                  </div>
                </div>

                {/* Service Name & Engine */}
                <div className="mt-1.5 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white tracking-tight">
                    Ai service
                  </h3>
                  <div className="flex items-center gap-1">
                    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                      <span>Express.js</span>
                      <ChevronsUpDown className="size-2.5 text-zinc-500" />
                    </div>
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300">
                      <span>4.x</span>
                      <ChevronsUpDown className="size-2.5 text-zinc-500" />
                    </div>
                  </div>
                </div>

                {/* Endpoints / Routes Section */}
                <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider pb-0.5">
                    <span>ENDPOINTS / ROUTES</span>
                    <Plus className="size-2.5 text-zinc-500 cursor-pointer" />
                  </div>

                  {/* Route 1 */}
                  <div className="relative flex items-center justify-between px-2 py-1 rounded bg-zinc-900/60 border border-zinc-800/80">
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-zinc-500 bg-zinc-950" />
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-zinc-800 text-[8px] font-mono font-bold text-zinc-300">
                        GET
                      </span>
                      <span className="text-[11px] font-mono text-zinc-200">/health</span>
                    </div>
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-zinc-500 bg-zinc-950" />
                  </div>

                  {/* Route 2 */}
                  <div className="relative flex items-center justify-between px-2 py-1 rounded bg-zinc-900/60 border border-zinc-800/80">
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-white bg-white" />
                    <div className="flex items-center gap-1.5">
                      <span className="px-1 py-0.2 rounded bg-zinc-800 text-[8px] font-mono font-bold text-zinc-300">
                        POST
                      </span>
                      <span className="text-[11px] font-mono text-zinc-200">send-message</span>
                    </div>
                    <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-white bg-white" />
                  </div>
                </div>

                {/* Collapsed Meta Strip */}
                <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between px-1.5 py-0.5 rounded bg-zinc-900/30 border border-zinc-800/40 text-[9px] font-mono text-zinc-500">
                  <span>LISTENERS, BACKGROUND EVENTS & ENV (5)</span>
                  <ChevronDown className="size-2.5 text-zinc-500" />
                </div>
              </div>
            </div>

            {/* FLOW CONNECTOR (Compact) */}
            <div className="my-2.5 flex flex-col items-center">
              <div className="w-px h-3 bg-gradient-to-b from-zinc-600 to-zinc-800" />
              <div className="px-3 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-[10px] font-mono text-zinc-200 shadow flex items-center gap-1 my-0.5">
                <ArrowDown className="size-2.5 text-zinc-400" />
                <span>1 Design ➔ Compiles to Any Language Stack</span>
              </div>
              <div className="w-px h-3 bg-gradient-to-b from-zinc-800 to-zinc-900" />
            </div>

            {/* BOTTOM: 3 Side-by-Side Code Blocks in Different Languages (Compact) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 w-full text-left">
              {/* Block 1: TypeScript / Node.js */}
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-850 mb-2">
                    <div className="flex items-center gap-1.5">
                      <FileCode className="size-3 text-zinc-400" />
                      <span className="font-mono text-[11px] font-bold text-white">
                        ai_service.ts
                      </span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      Node.js / npm
                    </span>
                  </div>

                  <pre className="p-2 rounded bg-black/90 border border-zinc-850 font-mono text-[10px] text-zinc-300 leading-snug overflow-x-auto">
                    <code>{`router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.post("/send-message", async (req, res) => {
  const reply = await ai.run(req.body.prompt);
  res.json({ reply });
});`}</code>
                  </pre>
                </div>

                <div className="mt-2 pt-1.5 border-t border-zinc-900 font-mono text-[9px] text-zinc-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Folder className="size-2.5 text-zinc-500" />
                    <span>packages/ai-service/</span>
                  </span>
                  <span>express</span>
                </div>
              </div>

              {/* Block 2: Go (Golang) */}
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-850 mb-2">
                    <div className="flex items-center gap-1.5">
                      <FileCode className="size-3 text-zinc-400" />
                      <span className="font-mono text-xs font-bold text-white">
                        ai_service.go
                      </span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      Go / go.mod
                    </span>
                  </div>

                  <pre className="p-2 rounded bg-black/90 border border-zinc-850 font-mono text-[10px] text-zinc-300 leading-snug overflow-x-auto">
                    <code>{`r.GET("/health", func(c *gin.Context) {
  c.JSON(200, gin.H{"ok": true})
})

r.POST("/send-message", func(c *gin.Context) {
  var req PromptRequest; c.BindJSON(&req)
  c.JSON(200, gin.H{"reply": ai.Run(req)})
})`}</code>
                  </pre>
                </div>

                <div className="mt-2 pt-1.5 border-t border-zinc-900 font-mono text-[9px] text-zinc-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Folder className="size-2.5 text-zinc-500" />
                    <span>services/ai-service/</span>
                  </span>
                  <span>gin-gonic</span>
                </div>
              </div>

              {/* Block 3: Python */}
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-850 mb-2">
                    <div className="flex items-center gap-1.5">
                      <FileCode className="size-3 text-zinc-400" />
                      <span className="font-mono text-xs font-bold text-white">
                        ai_service.py
                      </span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      Python / pip
                    </span>
                  </div>

                  <pre className="p-2 rounded bg-black/90 border border-zinc-850 font-mono text-[10px] text-zinc-300 leading-snug overflow-x-auto">
                    <code>{`@router.get("/health")
async def health():
    return {"ok": True}

@router.post("/send-message")
async def send_message(req: PromptRequest):
    return {"reply": await ai.run(req)}`}</code>
                  </pre>
                </div>

                <div className="mt-2 pt-1.5 border-t border-zinc-900 font-mono text-[9px] text-zinc-500 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Folder className="size-2.5 text-zinc-500" />
                    <span>services/ai_service/</span>
                  </span>
                  <span>fastapi</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: The Breakdown */}
        <section className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 border-t border-zinc-900">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
              The Dual Crisis
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              Why Raw Code Fails Both AI Models & Human Engineers
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Machine Dilemma */}
            <div className="flex flex-col p-6 rounded-2xl bg-zinc-950 border border-zinc-850 relative overflow-hidden">
              <div className="flex items-center gap-2.5 text-zinc-300 mb-4">
                <AlertTriangle className="size-5 text-zinc-400" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                  1. The Machine Dilemma
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                When AI coding models (Cursor, Devin, Claude) are asked to generate language-specific syntax from scratch across different ecosystems, they hit catastrophic probabilistic walls:
              </p>

              <div className="flex flex-col gap-3.5 text-xs text-zinc-300">
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">Cross-Ecosystem Hallucination:</strong> Models confuse Go struct tags with TypeScript interfaces, or invent deprecated SDK parameters from outdated training data.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">70% Token Burn on Boilerplate:</strong> Up to 70% of context tokens are wasted re-typing imports, wire schemas, connection pool scaffolding, and repetitive glue code.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">Brittle Language Rewrites:</strong> Migrating a service from Node.js to Go requires throwing away thousands of lines and starting over with new prompt loops.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">The Token Billing Spiral:</strong> Minor type mismatches trigger 400-line regeneration loops, burning team API budgets on syntax rather than architecture.
                  </div>
                </div>
              </div>
            </div>

            {/* Human Dilemma */}
            <div className="flex flex-col p-6 rounded-2xl bg-zinc-950 border border-zinc-850 relative overflow-hidden">
              <div className="flex items-center gap-2.5 text-zinc-300 mb-4">
                <Flame className="size-5 text-zinc-400" />
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                  2. The Human Dilemma
                </h3>
              </div>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                Even when AI produces code that compiles, it introduces an unsustainable operational crisis for engineering teams:
              </p>

              <div className="flex flex-col gap-3.5 text-zinc-300">
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">Review Fatigue & Rubber-Stamping:</strong> Engineers cannot audit 5,000 lines of generated boilerplate per PR across multiple language stacks. Silent bugs pass.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">Ecosystem & Language Lock-in:</strong> Once an architecture is locked into one runtime, rewrites to faster languages (e.g., Go/Rust) become too risky and costly.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">The Black-Box Codebase:</strong> Teams lose their spatial mental model. Nobody understands how 25 AI-generated microservice files actually connect.
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 mt-1.5 shrink-0" />
                  <div>
                    <strong className="text-white">2 AM Production Debugging:</strong> Engineers are forced to reverse-engineer machine-written boilerplate during outages with zero architectural intent.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: The Solution */}
        <section className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 border-t border-zinc-900">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
              The Paradigm Shift
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              From Language-Locked Syntax to Universal Visual Contracts
            </p>
            <p className="mt-3 text-xs sm:text-sm text-zinc-400">
              dpm separates your architecture from language syntax. Wire visual nodes once; compile to whatever backend stack your team chooses.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Without dpm */}
            <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-zinc-400 font-mono text-xs font-bold uppercase mb-3">
                  <X className="size-4 text-zinc-500" />
                  <span className="text-zinc-400">Without dpm (Raw Prompting & Language Lock-in)</span>
                </div>
                <div className="bg-black/90 rounded-lg p-3.5 border border-zinc-900 font-mono text-[11px] text-zinc-400 leading-relaxed mb-4">
                  <p className="text-zinc-600">// Prompt: "Add Stripe checkout & save user in Go"</p>
                  <p className="text-zinc-300 mt-1.5">AI writes 400 lines of brittle Go syntax...</p>
                  <p className="text-zinc-500 mt-1">- Misses webhook signature verification headers</p>
                  <p className="text-zinc-500">- Mismatches database connection pooling</p>
                  <p className="text-zinc-500">- Want to switch to Node or Python later? Rewrite from scratch</p>
                  <p className="text-zinc-500">- 45 minutes of debugging runtime crashes</p>
                </div>
              </div>
              <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                <span>Language lock-in, high token cost, brittle runtime</span>
              </div>
            </div>

            {/* With dpm */}
            <div className="p-6 rounded-xl bg-zinc-900/40 border border-zinc-700/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-white font-mono text-xs font-bold uppercase mb-3">
                  <Check className="size-4 text-white" />
                  <span>With dpm (Design Once, Switch to Any Language)</span>
                </div>
                <div className="bg-black/90 rounded-lg p-3.5 border border-zinc-800 font-mono text-[11px] text-zinc-300 leading-relaxed mb-4">
                  <p className="text-zinc-500">// Connect visual capability ports:</p>
                  <p className="text-white mt-1.5">connect(@dpm/stripe.on_payment_success,</p>
                  <p className="text-white">        @dpm/database.update_user_tier)</p>
                  <p className="text-zinc-400 mt-2">✓ Schema validated at design-time</p>
                  <p className="text-zinc-400">✓ Switch Target: Node.js (npm) ⇄ Go (go.mod) ⇄ Python (pip)</p>
                  <p className="text-zinc-400">✓ Compiler outputs verified, idiomatic production code</p>
                </div>
              </div>
              <div className="text-[11px] text-zinc-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                <span>Minimal tokens consumed, deterministic adapter templates, portable graph spec</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: What dpm Packages Define */}
        <section className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 border-t border-zinc-900">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
              The Architecture Contract
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              What Every @dpm Package Exposes
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <Workflow className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">1. Universal Input & Output Handles</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Visual connection points (<code className="text-zinc-300 font-mono">req_in</code>, <code className="text-zinc-300 font-mono">event_out</code>, <code className="text-zinc-300 font-mono">db_bind</code>) that wire together regardless of the underlying language.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <ShieldCheck className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">2. Language-Neutral Port Schemas</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Strict type contracts. The canvas rejects incompatible wiring at design time, allowing AI agents and engineers to prevent runtime bugs before compilation.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <Braces className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">3. Visual Property Sidebars</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Structured UI forms to configure API keys, timeouts, pool sizes, and modes directly in the canvas without editing syntax-specific config files.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <Layers className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">4. Pipeline Transformers & Middleware</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Reusable middleware and transform steps (signature validation, JWT checks, sanitization) ready to drop into any request pipeline.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <Code2 className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">5. Multi-Target Codegen Adapters</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Hardened codegen rules written by domain experts: connection pooling, automated caching, zero N+1 queries, and clean idiomatic code in Node, Go, or Python.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-900 flex flex-col gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
                <TrendingDown className="size-4" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-white">6. Cost & Quota Guardrails</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Explicit rate-limiters, cache nodes, and concurrency bounds prevent runaway cloud and AI token billing shocks before deployment.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Dual Packaging Models */}
        <section className="w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-16 border-t border-zinc-900">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
              Distribution & Ecosystem Adapters
            </h2>
            <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
              Two Ways to Ship dpm Packages
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 uppercase">
                  Model 1
                </span>
                <h3 className="text-base font-bold text-white font-mono mt-3">
                  Multi-Language Native Embedding
                </h3>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  Package authors ship a <code className="text-zinc-200 font-mono">dezign/dezign.json</code> specification inside their repositories defining visual ports and multi-target language bindings.
                </p>
                <div className="mt-4 p-3 rounded-lg bg-black/80 border border-zinc-850 font-mono text-[11px] text-zinc-400">
                  <p className="text-zinc-500">redis-capability/</p>
                  <p className="text-white font-semibold">├── dezign/dezign.json <span className="text-zinc-500">// Visual contract</span></p>
                  <p className="text-zinc-400">├── targets/node ➔ npm: ioredis</p>
                  <p className="text-zinc-400">├── targets/go   ➔ go.mod: go-redis</p>
                  <p className="text-zinc-400">└── targets/py   ➔ pip: redis-py</p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 uppercase">
                  Model 2
                </span>
                <h3 className="text-base font-bold text-white font-mono mt-3">
                  Community Ecosystem Adapters
                </h3>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  If an upstream package hasn't added native dpm support, the community publishes a <code className="text-zinc-200 font-mono">@dpm/*</code> adapter that binds existing libraries across npm, Go modules, PyPI, and Cargo.
                </p>
                <div className="mt-4 p-3 rounded-lg bg-black/80 border border-zinc-850 font-mono text-[11px] text-zinc-400">
                  <p className="text-white font-semibold">@dpm/database <span className="text-zinc-500">// Universal wrapper</span></p>
                  <p className="text-zinc-400">  node: @prisma/client / drizzle-orm</p>
                  <p className="text-zinc-400">  go:   gorm.io/gorm / jmoiron/sqlx</p>
                  <p className="text-zinc-400">  py:   sqlalchemy / tortoise-orm</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-20 text-center flex flex-col items-center">
          <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-zinc-900/60 to-zinc-950 border border-zinc-800/80 w-full flex flex-col items-center">
            <h2 className="text-2xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
              Ready for the Visual Era of Software?
            </h2>
            <p className="mt-3 text-xs sm:text-sm text-zinc-400 max-w-lg leading-relaxed">
              Join developers and architects building system design monorepos with zero glue code, zero hallucinated syntax, and language-agnostic visual contracts.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Link
                href="/#studio-views"
                className="px-6 py-2.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2"
              >
                <span>Launch Dezign Canvas</span>
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="/"
                className="px-6 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium hover:text-white transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
