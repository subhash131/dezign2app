"use client";

import React from "react";
import {
  Check,
  X,
  Sparkles,
  Zap,
  Cpu,
  Bot,
  ShieldCheck,
} from "lucide-react";

interface ComparisonRow {
  feature: string;
  pureAi: {
    status: "yes" | "no" | "info";
    title: string;
    detail?: string;
  };
  algorithmAi: {
    status: "yes" | "no" | "info";
    title: string;
    detail?: string;
  };
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: "Production Reliability",
    pureAi: {
      status: "no",
      title: "No — Schema & contract drift",
      detail: "Silent type mismatches between frontend, backend, and DB",
    },
    algorithmAi: {
      status: "yes",
      title: "Yes — 100% contract parity",
      detail: "Deterministic AST compiler guarantees type safety across packages",
    },
  },
  {
    feature: "Compute & AI Models",
    pureAi: {
      status: "no",
      title: "Cloud GPUs & Heavy Reasoning",
      detail: "Costly cloud reasoning models churning millions of tokens on repetitive boilerplate",
    },
    algorithmAi: {
      status: "yes",
      title: "Native CPUs + Fast Flash Models",
      detail: "Algorithms execute locally on CPUs at clock speed; Flash AI only writes targeted custom logic",
    },
  },
  {
    feature: "Speed to First Demo",
    pureAi: {
      status: "info",
      title: "Delayed by token reasoning",
      detail: "Waits minutes streaming tokens and guessing repetitive scaffolding",
    },
    algorithmAi: {
      status: "yes",
      title: "Instant on CPUs (<300ms)",
      detail: "If you know what to build, algorithms waste zero time reasoning—your full stack compiles immediately",
    },
  },
  {
    feature: "Speed to Production",
    pureAi: {
      status: "no",
      title: "Stalls hard after ~60-70%",
      detail: "Hits a wall as compounding hallucinations and broken imports pile up",
    },
    algorithmAi: {
      status: "yes",
      title: "Steady & predictable to 100%",
      detail: "Solid architecture ensures smooth sprint-by-sprint extension",
    },
  },
  {
    feature: "System Architecture",
    pureAi: {
      status: "no",
      title: "Whatever the model guesses",
      detail: "Scattered across disjointed files with zero whole-system context",
    },
    algorithmAi: {
      status: "yes",
      title: "Intentional & contract-locked",
      detail: "You pick schemas, API shapes, and state flow on the visual canvas",
    },
  },
  {
    feature: "Token & API Cost Waste",
    pureAi: {
      status: "no",
      title: "High ($$$ in retry loops)",
      detail: "Heavy token burn on repetitive boilerplate and debugging loops",
    },
    algorithmAi: {
      status: "yes",
      title: "$0 scaffolding tokens",
      detail: "Compiler builds monorepo; AI only generates custom business logic",
    },
  },
  {
    feature: "Performance & Indexing",
    pureAi: {
      status: "no",
      title: "Naive implementations",
      detail: "Prone to N+1 queries, unindexed DB scans, and memory leaks",
    },
    algorithmAi: {
      status: "yes",
      title: "Engineered for scale",
      detail: "Proper DB relations, indexing, and connection pooling by design",
    },
  },
  {
    feature: "Security & Authentication",
    pureAi: {
      status: "no",
      title: "High risk & silent gaps",
      detail: "Auth bypasses, unvalidated payload inputs, and exposed secrets",
    },
    algorithmAi: {
      status: "yes",
      title: "Strict & hardened",
      detail: "Better Auth with RBAC guards and strict Zod runtime validation",
    },
  },
  {
    feature: "Debugging & Maintenance",
    pureAi: {
      status: "no",
      title: "Painful black-box hunting",
      detail: "Hard to debug since you don't fully understand the generated code",
    },
    algorithmAi: {
      status: "yes",
      title: "Easy & modular",
      detail: "Every node, contract, and connection exists for a deliberate reason",
    },
  },
  {
    feature: "Best For",
    pureAi: {
      status: "info",
      title: "Throwaway prototypes & hackathons",
      detail: "Validating disposable ideas where maintainability doesn't matter",
    },
    algorithmAi: {
      status: "yes",
      title: "Real production products",
      detail: "Anything dealing with users, transactions, data integrity, and real scale",
    },
  },
];

export const CompilerVsAiSection: React.FC = () => {
  return (
    <section className="w-full py-20 bg-[#050505] border-t border-zinc-900 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-12 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>ARCHITECTURE PHILOSOPHY</span>
          </div>

          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mt-1"
          >
            Pure AI vs. Algorithm + AI
          </h2>

          <p className="text-zinc-200 text-base sm:text-lg font-medium leading-relaxed max-w-2xl">
            &ldquo;Stop paying AI tokens to write the same CRUD for the 1000th time.&rdquo;
          </p>
          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed max-w-xl">
            Cheaper, faster, and consistent: AI where it matters, not everywhere. Algorithms compile the foundation deterministically on CPU in milliseconds, leaving fast AI models for custom domain logic.
          </p>
        </div>

        {/* 3-Column High-Impact Comparison Table */}
        <div className="w-full rounded-2xl border border-zinc-800 bg-[#08080a] overflow-hidden shadow-2xl mb-10">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-800 bg-[#0c0c10] text-xs font-mono">
                  <th className="py-4 px-5 font-semibold text-zinc-400 w-[24%]">
                    Feature / Dimension
                  </th>
                  <th className="py-4 px-5 font-semibold text-zinc-300 w-[38%]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
                      <span>Pure AI (&ldquo;Vibe Coding&rdquo;)</span>
                    </div>
                  </th>
                  <th className="py-4 px-5 font-semibold text-white w-[38%] bg-zinc-900/60 border-l border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                      <span className="text-emerald-400 font-bold">Algorithm + AI</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/50">
                        Dezign2App
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-850 text-xs sm:text-sm">
                {COMPARISON_ROWS.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-zinc-900/30 transition-colors group"
                  >
                    {/* Feature */}
                    <td className="py-3.5 px-5 font-semibold text-zinc-300 group-hover:text-white transition-colors align-top">
                      {row.feature}
                    </td>

                    {/* Pure AI */}
                    <td className="py-3.5 px-5 text-zinc-400 leading-relaxed align-top">
                      <div className="flex items-start gap-2.5">
                        {row.pureAi.status === "yes" && (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        {row.pureAi.status === "no" && (
                          <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        {row.pureAi.status === "info" && (
                          <span className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 flex items-center justify-center font-mono text-xs">
                            &bull;
                          </span>
                        )}
                        <div>
                          <div
                            className={`font-medium ${
                              row.pureAi.status === "no"
                                ? "text-zinc-300"
                                : row.pureAi.status === "yes"
                                ? "text-white"
                                : "text-zinc-400"
                            }`}
                          >
                            {row.pureAi.title}
                          </div>
                          {row.pureAi.detail && (
                            <div className="text-[11px] text-zinc-500 mt-0.5 leading-normal">
                              {row.pureAi.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Algorithm + AI */}
                    <td className="py-3.5 px-5 text-zinc-200 bg-zinc-900/30 border-l border-zinc-800/80 leading-relaxed align-top">
                      <div className="flex items-start gap-2.5">
                        {row.algorithmAi.status === "yes" && (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        {row.algorithmAi.status === "no" && (
                          <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        )}
                        {row.algorithmAi.status === "info" && (
                          <span className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5 flex items-center justify-center font-mono text-xs">
                            &bull;
                          </span>
                        )}
                        <div>
                          <div className="font-semibold text-white">
                            {row.algorithmAi.title}
                          </div>
                          {row.algorithmAi.detail && (
                            <div className="text-[11px] text-zinc-400 mt-0.5 leading-normal">
                              {row.algorithmAi.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Line Quote Callout */}
        <div className="w-full max-w-3xl p-5 sm:p-6 rounded-xl border border-zinc-800 bg-[#09090c] text-center">
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            <strong className="text-white">The Bottom Line:</strong> &ldquo;The more you understand the system, the more AI multiplies you; the less you understand, the more it just multiplies your mistakes.&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
};
