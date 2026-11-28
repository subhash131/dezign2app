"use client";

import React, { useState } from "react";
import {
  Cpu,
  Terminal,
  PlayCircle,
  GitBranch,
  Database,
  CheckCircle2,
  Compass,
  Server,
} from "lucide-react";

export const FutureRoadmapSection: React.FC = () => {
  const [activeTool, setActiveTool] = useState<number>(0);

  const MCP_TOOLS = [
    {
      name: "get_system_design_context",
      summary: "Project-wide schema, services, endpoints & test cases",
      response: `{
  "services": ["auth-service (:3001)", "orders-api (:3002)"],
  "databases": ["postgres-main (users, orders, order_items)"],
  "auth": "better-auth (email/password + GitHub OAuth + RBAC)",
  "contracts": "14 typed REST endpoints, 2 Kafka topics"
}`,
    },
    {
      name: "traverse_architecture_graph",
      summary: "Deterministic BFS traversal from any topic or node",
      response: `# Subgraph: "orders" (depth=2, no LLM)
[WebPage: /checkout] --(POST /orders)--> [Service: orders-api]
[Service: orders-api] --(write)--> [Entity: orders (Postgres)]
[Service: orders-api] --(publish)--> [Kafka: order.created]`,
    },
    {
      name: "search_architecture_nodes",
      summary: "Filtered node catalogue with 1-hop connections",
      response: `# Node Catalogue (nodeType: "service", keyword: "orders")
- orders-api (express): POST /orders, GET /orders/:id
  Connections: postgres-main, better-auth, kafka-events`,
    },
  ];

  const currentMcpTool = MCP_TOOLS[activeTool] ?? MCP_TOOLS[0]!;

  return (
    <section id="mcp" className="w-full py-24 bg-[#070709] border-t border-zinc-900 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-300">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>BUILT FOR AI AGENTS &amp; LOCAL WORKFLOWS</span>
          </div>

          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mt-2"
          >
            Your Architecture Graph, Exposed via MCP.
          </h2>

          <p className="text-zinc-400 text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl">
            Instead of fighting Cursor or Claude Code, give them a verified architectural source of truth—paired with in-memory simulation and a native Desktop Studio.
          </p>
        </div>

        {/* Featured Card: Live MCP Server Integration */}
        <div className="w-full rounded-2xl border border-zinc-800 bg-[#09090c] p-6 sm:p-10 mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 mb-8 border-b border-zinc-800/80 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-900/50 text-[11px] font-mono text-emerald-300 mb-2">
                <Cpu className="w-3.5 h-3.5" />
                <span>SHIPPED TODAY &bull; SYSTEM DESIGN MCP SERVER</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white">
                Let Coding Agents Build Against Your Live Spec
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
                Our <code className="text-zinc-200 font-mono">apps/system-design-engine</code> MCP server lets Cursor, Claude Code, and other MCP clients query exact nodes, edges, schemas, and test cases deterministically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: MCP Tool Selector */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              {MCP_TOOLS.map((tool, index) => {
                const isSelected = activeTool === index;
                return (
                  <button
                    key={tool.name}
                    onClick={() => setActiveTool(index)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-zinc-900/90 border-zinc-600 text-white"
                        : "bg-[#060608] border-zinc-800/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <div className="font-mono text-xs font-bold text-emerald-400">
                      {tool.name}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {tool.summary}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Tool Output Preview */}
            <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-[#050507] p-5 font-mono text-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-4 text-[11px] text-zinc-400">
                  <span>MCP Tool Response &bull; Deterministic Graph Query</span>
                  <span className="text-emerald-400">stdio / JSON-RPC</span>
                </div>
                <pre className="text-zinc-300 leading-relaxed whitespace-pre-wrap overflow-x-auto">
                  <code>{currentMcpTool.response}</code>
                </pre>
              </div>
              <div className="pt-4 mt-6 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500">
                <span>No vector guessing—reads canonical canvas graph</span>
                <span className="text-zinc-300">Works with Cursor &amp; Claude Code</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2 Shipped Companion Cards: Simulation + Desktop Studio */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Card 1: In-Memory Architecture Simulation */}
          <div className="p-7 sm:p-8 rounded-2xl border border-zinc-800 bg-[#0a0a0d] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 px-2.5 py-1 rounded border border-emerald-900/50 bg-emerald-950/30">
                  Live Today &bull; Simulation Engine
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                In-Memory Flow Simulation &amp; Test Personas
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-6">
                Validate endpoint routing, RBAC guards, broker propagation, and data transformations on the canvas before generating a single file.
              </p>

              <div className="rounded-xl border border-zinc-800/80 bg-[#060608] p-4 font-mono text-[11px] space-y-2 text-zinc-300">
                <div className="flex items-center justify-between">
                  <span>1. Persona: admin@acme.test (RBAC check)</span>
                  <span className="text-emerald-400">PASS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>2. POST /orders → DB insert → Kafka emit</span>
                  <span className="text-emerald-400">PASS</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>3. Snapshot commit &amp; blast-radius check</span>
                  <span className="text-zinc-400">SAVED</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/60 mt-6 flex items-center justify-between text-xs text-zinc-400">
              <span>Step tracing &amp; test assertions</span>
              <span className="text-white font-mono font-semibold">Snapshot Commit History</span>
            </div>
          </div>

          {/* Card 2: Native Electron Desktop Studio */}
          <div className="p-7 sm:p-8 rounded-2xl border border-zinc-800 bg-[#0a0a0d] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Terminal className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300 px-2.5 py-1 rounded border border-emerald-900/50 bg-emerald-950/30">
                  Live Today &bull; Desktop Studio
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Electron Desktop + Embedded PTY &amp; Local DBs
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-6">
                Run the visual studio side-by-side with a real pseudo-terminal (<code className="text-zinc-200 font-mono">node-pty</code>), local PostgreSQL/SQLite/Redis runners, and 1-click Docker Compose export.
              </p>

              <div className="rounded-xl border border-zinc-800/80 bg-[#060608] p-4 font-mono text-[11px] space-y-2 text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>50/50 split canvas + PowerShell / bash / zsh</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Local PostgreSQL, SQLite &amp; Redis runners</span>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>Direct disk export + docker compose up</span>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/60 mt-6 flex items-center justify-between text-xs text-zinc-400">
              <span>Windows &amp; macOS desktop app</span>
              <span className="text-white font-mono font-semibold">Zero Cloud Lock-In</span>
            </div>
          </div>
        </div>

        {/* Focused Horizon Strip (Honest, restrained roadmap) */}
        <div className="w-full rounded-xl border border-zinc-800/80 bg-[#09090c] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <Compass className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <span className="font-mono font-semibold text-white uppercase tracking-wider mr-2">
                Focused Roadmap:
              </span>
              <span className="text-zinc-400">
                Expanding the <strong className="text-zinc-200">dpm</strong> adapter spec, bidirectional Git PR sync workflows, and team collaboration workspaces.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
