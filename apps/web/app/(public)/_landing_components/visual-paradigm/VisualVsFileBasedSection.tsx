"use client";

import React, { useState } from "react";
import {
  FolderTree,
  Network,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCode,
  Layers,
  ArrowRight,
  Terminal,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Cpu,
  Download,
  ExternalLink,
  Code2,
  Workflow,
  Eye,
  GitBranch,
} from "lucide-react";

export const VisualVsFileBasedSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"mental-model" | "contract-drift" | "velocity">(
    "mental-model"
  );

  return (
    <section
      id="why-visual"
      className="w-full py-24 bg-[#08080a] border-t border-zinc-900 scroll-mt-14 relative overflow-hidden"
    >
      {/* Anchor for backward compatibility with #desktop links */}
      <span id="desktop" className="absolute -top-16 opacity-0 pointer-events-none" />

      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/5 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-[500px] h-[300px] bg-blue-500/5 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center relative z-10">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-12 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-mono text-zinc-400">
            <Network className="w-3.5 h-3.5 text-emerald-400" />
            <span>THE ARCHITECTURAL PARADIGM SHIFT</span>
          </div>

          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mt-2"
          >
            Why Move from File-Based to Visual Programming?
          </h2>

          <p className="text-zinc-400 text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl">
            Real software systems are directed graphs of microservices, gateways, and data stores.
            Squashing them into 50 disjointed text files creates mental fatigue, silent contract drift,
            and hours of brittle boilerplate.
          </p>

          {/* Interactive perspective pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            <button
              onClick={() => setActiveTab("mental-model")}
              className={`px-4 py-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 ${
                activeTab === "mental-model"
                  ? "bg-white text-black font-semibold shadow-lg shadow-white/10"
                  : "bg-zinc-900/90 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Cognitive Architecture</span>
            </button>
            <button
              onClick={() => setActiveTab("contract-drift")}
              className={`px-4 py-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 ${
                activeTab === "contract-drift"
                  ? "bg-white text-black font-semibold shadow-lg shadow-white/10"
                  : "bg-zinc-900/90 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Contract Integrity</span>
            </button>
            <button
              onClick={() => setActiveTab("velocity")}
              className={`px-4 py-2 rounded-lg text-xs font-mono transition-all flex items-center gap-2 ${
                activeTab === "velocity"
                  ? "bg-white text-black font-semibold shadow-lg shadow-white/10"
                  : "bg-zinc-900/90 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Engineering Velocity</span>
            </button>
          </div>
        </div>

        {/* Side-by-Side Comparison Container */}
        <div className="w-full rounded-2xl border border-zinc-800 bg-[#070709] text-white shadow-2xl overflow-hidden flex flex-col mb-14">
          {/* Top Bar Header */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800 bg-[#0d0d10] border-b border-zinc-800 text-xs font-mono">
            {/* Left Header */}
            <div className="px-5 py-3 flex items-center justify-between text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70 inline-block" />
                <span className="font-semibold text-zinc-300">Legacy File-Based Programming</span>
              </div>
              <span className="text-[11px] text-zinc-500">1D Linear Text Files</span>
            </div>

            {/* Right Header */}
            <div className="px-5 py-3 flex items-center justify-between text-zinc-400 bg-[#0e1014]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                <span className="font-semibold text-white">Dezign2App Visual Architecture</span>
              </div>
              <span className="text-[11px] text-emerald-400 font-medium">Topological Graph Engine</span>
            </div>
          </div>

          {/* Main Comparison Body */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
            {/* Left Column: The File-Based Reality */}
            <div className="p-6 bg-[#0a0a0d] flex flex-col justify-between">
              <div>
                {/* IDE Mockup */}
                <div className="rounded-lg border border-zinc-800/80 bg-[#060608] p-3 font-mono text-[11px] mb-5">
                  <div className="flex items-center justify-between text-zinc-500 border-b border-zinc-800/60 pb-2 mb-2.5">
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <FolderTree className="w-3.5 h-3.5 text-zinc-500" />
                      <span>workspace/packages/</span>
                    </span>
                    <span className="text-red-400/90 text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> 3 drift warnings
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 text-zinc-400 leading-relaxed pl-1">
                    <div className="text-zinc-500">📁 apps/api/src/modules/</div>
                    <div className="pl-4 flex items-center justify-between text-zinc-300">
                      <span>📄 auth.controller.ts</span>
                      <span className="text-zinc-600 text-[10px]"># 240 lines</span>
                    </div>
                    <div className="pl-4 flex items-center justify-between text-red-400/90 bg-red-950/20 px-1 py-0.5 rounded border border-red-900/30">
                      <span>📄 auth.service.ts</span>
                      <span className="text-[10px]">TS2322: Type mismatch</span>
                    </div>
                    <div className="pl-4 text-zinc-400">📄 auth.schema.ts</div>
                    <div className="text-zinc-500 mt-1">📁 packages/shared-contracts/</div>
                    <div className="pl-4 flex items-center justify-between text-amber-400/90 bg-amber-950/20 px-1 py-0.5 rounded border border-amber-900/30">
                      <span>📄 user.dto.ts</span>
                      <span className="text-[10px]">Out of sync with DB</span>
                    </div>
                    <div className="text-zinc-500 mt-1">📁 infra/docker/</div>
                    <div className="pl-4 flex items-center justify-between text-zinc-400">
                      <span>📄 docker-compose.yml</span>
                      <span className="text-zinc-600 text-[10px]">:5432 collision?</span>
                    </div>
                  </div>
                </div>

                {/* Dynamic Content based on selected tab */}
                {activeTab === "mental-model" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-400">
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">Abstracted Blindspots:</strong> Architecture
                        is hidden in 50+ files. You cannot visualize request routes without tracing
                        source code line by line.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">Brutal Developer Onboarding:</strong> New
                        engineers spend weeks reading documentation and reverse-engineering folder
                        trees just to understand system interactions.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "contract-drift" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-400">
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">Silent API Incompatibilities:</strong> Changing
                        a payload in one service quietly breaks another package until runtime or CI
                        fails.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">Duplicated Glue Code:</strong> Engineers
                        spend 60% of their sprints manually copying DTOs, Zod validators, and route
                        types across monorepo boundaries.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "velocity" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-400">
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">Endless Boilerplate Setup:</strong> 2 to 4
                        weeks spent bootstrapping Turborepo, CORS guards, Docker bridges, and database
                        clients before writing actual product features.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-zinc-300">AI Prompt Hallucination:</strong> Raw LLM
                        coding assistants churn tokens editing individual files without whole-system
                        context, hallucinating dead imports.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-900 text-xs font-mono text-zinc-500 flex items-center justify-between">
                <span>Format: Linear text on disk</span>
                <span className="text-red-400/80">High Cognitive Overhead</span>
              </div>
            </div>

            {/* Right Column: The Visual Architecture Paradigm */}
            <div className="p-6 bg-[#08090c] flex flex-col justify-between">
              <div>
                {/* Visual Canvas Mockup */}
                <div className="rounded-lg border border-zinc-800 bg-[#0a0c10] p-3 font-mono text-[11px] mb-5 shadow-inner">
                  <div className="flex items-center justify-between text-zinc-500 border-b border-zinc-800 pb-2 mb-2.5">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Network className="w-3.5 h-3.5" />
                      <span>Live Architecture Topology</span>
                    </span>
                    <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Shared Typed Contracts
                    </span>
                  </div>

                  {/* Interconnected Node Schematic */}
                  <div className="flex flex-col gap-2.5 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-900/90 text-white flex-1 flex items-center justify-between">
                        <span className="font-semibold text-[10px]">API Gateway</span>
                        <span className="text-[9px] text-zinc-400 font-mono">:46500</span>
                      </div>
                      <span className="text-zinc-600 font-mono text-[10px]">──(REST/Zod)──▶</span>
                      <div className="px-2.5 py-1.5 rounded border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 flex-1 flex items-center justify-between">
                        <span className="font-semibold text-[10px]">Auth Service</span>
                        <span className="text-[9px] text-emerald-400">Better Auth</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="px-2.5 py-1.5 rounded border border-zinc-800 bg-[#121318] text-zinc-300 flex-1 flex items-center justify-between">
                        <span className="text-[10px]">PostgreSQL 16</span>
                        <span className="text-[9px] text-zinc-500">SQL DDL &amp; Queries</span>
                      </div>
                      <span className="text-zinc-600 font-mono text-[10px]">◀──(Pool)──</span>
                      <div className="px-2.5 py-1.5 rounded border border-zinc-800 bg-[#121318] text-zinc-300 flex-1 flex items-center justify-between">
                        <span className="text-[10px]">Redis Cache</span>
                        <span className="text-[9px] text-zinc-500">Pub/Sub &amp; Streams</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
                    <span className="text-zinc-500">Compiler Output:</span>
                    <span className="text-emerald-400 font-medium">Deterministic Turborepo + Docker Compose</span>
                  </div>
                </div>

                {/* Dynamic Content based on selected tab */}
                {activeTab === "mental-model" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-300">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">Graph Representation Aligns with Reality:</strong>{" "}
                        Your system exists as an interconnected graph in your head—and now on your screen.
                        Inspect boundaries, data pipelines, and service relations in seconds.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">Zero-Friction Team Alignment:</strong> Engineers,
                        architects, and product leads view the same live topology. No outdated Confluence
                        diagrams; the design is the running application.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "contract-drift" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-300">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">Connections Enforce Type Contracts:</strong> When
                        two nodes connect, their Zod schemas, REST payloads, and SQL models are bound.
                        Updating an endpoint propagates to generated frontend clients automatically.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">Deterministic Monorepo Compilation:</strong>{" "}
                        Template-driven code generation ensures schemas, routes, and database packages
                        compile together consistently without guesswork.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "velocity" && (
                  <div className="space-y-3 text-xs sm:text-sm text-zinc-300">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">From Design to Running Stack Fast:</strong>{" "}
                        Drop database, auth, and service nodes onto the canvas and compile a complete
                        Turborepo with Docker Compose orchestration on demand.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <p>
                        <strong className="text-white">Pure Code Ownership:</strong> Visual design compiles
                        into clean, human-readable TypeScript, Python, or Go code that you run locally
                        or deploy to any cloud.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-900 text-xs font-mono text-zinc-500 flex items-center justify-between">
                <span>Engine: Deterministic Monorepo Compiler</span>
                <span className="text-emerald-400 font-semibold">Consistent Contracts</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Feature Pillars of the Visual Paradigm Shift */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left mb-12">
          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0b0b0e] flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 mb-3.5">
                <Workflow className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1.5">
                Topological Mental Model
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Systems are graphs, not alphabetized folder lists. Visual programming mirrors how your brain
                reasons about services, queues, and databases.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-zinc-900 text-[11px] font-mono text-zinc-500">
              Eliminate cognitive fog
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0b0b0e] flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400 mb-3.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1.5">
                Enforced Cross-Node Contracts
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Edges represent live typed contracts (Zod, REST, SQL, events). Mismatches are caught at
                design time and during simulation before deployment.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-zinc-900 text-[11px] font-mono text-zinc-500">
              Reduce contract drift
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0b0b0e] flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-purple-400 mb-3.5">
                <Cpu className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1.5">
                Deterministic Code Generation
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Skip repetitive LLM prompt loops for CRUD and boilerplate. Our compiler synthesizes
                structured Turborepos deterministically on demand.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-zinc-900 text-[11px] font-mono text-zinc-500">
              Save AI tokens for real logic
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-[#0b0b0e] flex flex-col justify-between hover:border-zinc-700 transition-colors">
            <div>
              <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-amber-400 mb-3.5">
                <Code2 className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white mb-1.5">
                Zero Walled Gardens
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Not a closed no-code sandbox. Export pure, idiomatic TypeScript, Next.js, and Docker stacks
                that you run on any cloud or local terminal.
              </p>
            </div>
            <div className="pt-4 mt-4 border-t border-zinc-900 text-[11px] font-mono text-zinc-500">
              100% standard code &amp; Git
            </div>
          </div>
        </div>

        {/* Developer Workstation Integration Callout (Desktop + Terminal) */}
        <div className="w-full rounded-xl border border-zinc-800/80 bg-gradient-to-r from-[#0d0d12] via-[#09090c] to-[#0d0d12] p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="flex flex-col gap-1 text-left">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-white">
                  Visual-First in Design, Native Terminal in Execution
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Desktop Pro
                </span>
              </div>
              <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                Need deep local workstation capabilities? Dezign2App Desktop pairs the visual architecture
                studio with an embedded native PTY terminal, local database runners (PostgreSQL, SQLite, Redis),
                and 1-click Docker orchestration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://github.com/dezign2app/dezign2app/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black font-medium text-xs hover:bg-zinc-200 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Desktop</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
            <a
              href="https://docs.dezign2app.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800/50 text-xs font-mono transition-colors"
            >
              <span>Read Docs</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
