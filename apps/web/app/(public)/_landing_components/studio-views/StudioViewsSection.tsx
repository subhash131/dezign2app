"use client";

import React from "react";
import Link from "next/link";
import {
  Package,
  ShieldCheck,
  Radio,
  Database,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Check,
  Cpu,
} from "lucide-react";

interface FrameworkLayer {
  packageName: string;
  category: string;
  color: string;
  badgeBg: string;
  activeFramework: string;
  runtime: string;
  swappable: string[];
  description: string;
  capabilities: string[];
}

const FRAMEWORK_LAYERS: FrameworkLayer[] = [
  {
    packageName: "@dpm/auth",
    category: "Authentication & Identity",
    color: "text-emerald-400",
    badgeBg: "bg-emerald-950/40 border-emerald-900/50 text-emerald-300",
    activeFramework: "Better Auth",
    runtime: "TypeScript",
    swappable: ["Clerk", "Supabase Auth", "Auth0", "NextAuth"],
    description:
      "A single visual auth contract with OAuth handlers, email/passwords, session cookies, and RBAC guards.",
    capabilities: [
      "Swap auth providers without rewriting route guards",
      "Unified session contract for web and mobile",
      "Automated webhook signature verification",
    ],
  },
  {
    packageName: "@dpm/service",
    category: "Backend Microservices",
    color: "text-blue-400",
    badgeBg: "bg-blue-950/40 border-blue-900/50 text-blue-300",
    activeFramework: "Express (Node.js)",
    runtime: "TypeScript / Python / Go",
    swappable: ["FastAPI (Python)", "NestJS", "Go (Gin)", "Fastify"],
    description:
      "Microservice containers with typed routing, middleware chains, and automatic Zod/Pydantic validation.",
    capabilities: [
      "Target Node.js, Python, or Go from one architecture",
      "Type-safe REST, tRPC, and WebSocket wire protocols",
      "Auto-generated Docker Compose & health checks",
    ],
  },
  {
    packageName: "@dpm/database",
    category: "Databases & Engines",
    color: "text-purple-400",
    badgeBg: "bg-purple-950/40 border-purple-900/50 text-purple-300",
    activeFramework: "PostgreSQL (PG)",
    runtime: "Drizzle & Prisma • Auto Migrations",
    swappable: ["SQLite", "MySQL", "MongoDB", "Redis"],
    description:
      "Visual ERD schemas with foreign key relations, indexes, connection pools, and automated migration scripts.",
    capabilities: [
      "Switch from PostgreSQL to SQLite, MySQL, or MongoDB with 0 code rewrite",
      "Decouple data modeling from SQL dialects and ORM syntax",
      "Compiles to Drizzle, Prisma, SQLAlchemy, or raw SQL migrations",
    ],
  },
];

export const StudioViewsSection: React.FC = () => {
  return (
    <section id="dpm" className="w-full py-20 bg-[#08080a] border-t border-zinc-900 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-14 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-mono text-zinc-300">
            <Package className="w-3.5 h-3.5 text-emerald-400" />
            <span>dpm — DEZIGN PACKAGE MANAGER</span>
          </div>

          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mt-1"
          >
            Design Once. Migrate to Any.
          </h2>

          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed max-w-2xl mt-1">
            <strong>dpm</strong> acts as a single visual interface for the entire package ecosystem.
            There are hundreds of auth frameworks, frontend packages, and servers—Dezign2App is completely language agnostic.
            Once you design your app, switch between any framework or language of your choice with zero code rewrites.
          </p>
        </div>

        {/* 3-Column Swappable Framework Grid (No Tabs) */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {FRAMEWORK_LAYERS.map((layer, idx) => (
            <div
              key={idx}
              className="p-6 sm:p-7 rounded-2xl border border-zinc-800 bg-[#0c0c10] flex flex-col justify-between hover:border-zinc-700 transition-colors relative overflow-hidden group shadow-xl"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-xs font-mono font-bold ${layer.color}`}>
                    {layer.packageName}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${layer.badgeBg}`}
                  >
                    {layer.category}
                  </span>
                </div>

                {/* Active Framework with Swappable Indicator */}
                <div className="p-3 rounded-xl border border-zinc-800 bg-[#08080a] mb-4">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5 font-mono">
                    <span>Default Target:</span>
                    <span className="text-white font-semibold flex items-center gap-1">
                      {layer.category.includes("Auth") && <ShieldCheck className="w-3 h-3 text-emerald-400" />}
                      {layer.category.includes("Backend") && <Radio className="w-3 h-3 text-blue-400" />}
                      {layer.category.includes("Databases") && <Database className="w-3 h-3 text-purple-400" />}
                      {layer.activeFramework}
                    </span>
                  </div>

                  {/* Swappable Framework Badges */}
                  <div className="pt-2 border-t border-zinc-850 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5 text-zinc-400 animate-spin-slow" />
                      <span>Switch to:</span>
                    </span>
                    {layer.swappable.map((fw, fIdx) => (
                      <span
                        key={fIdx}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300"
                      >
                        {fw}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed mb-5">
                  {layer.description}
                </p>

                {/* Bullet Capabilities */}
                <div className="space-y-2 text-xs text-zinc-300">
                  {layer.capabilities.map((cap, cIdx) => (
                    <div key={cIdx} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-4 border-t border-zinc-850 mt-6 flex items-center justify-between text-[11px] font-mono text-zinc-500">
                <span>Runtime:</span>
                <span className="text-zinc-300">{layer.runtime}</span>
              </div>
            </div>
          ))}
        </div>

        {/* The DefinitelyTyped for Architecture Callout */}
        <div className="w-full max-w-4xl p-6 sm:p-7 rounded-2xl border border-zinc-800 bg-gradient-to-r from-[#0d0d12] via-[#0a0a0e] to-[#0d0d12] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-emerald-400 mt-0.5 shadow-inner">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  The &ldquo;DefinitelyTyped&rdquo; of Visual Architecture
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/50 font-semibold">
                  Zero Lock-In
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Just as DefinitelyTyped (<code className="text-zinc-200 font-mono">@types/*</code>) added static typing to JavaScript without changing library code, <strong className="text-white">dpm</strong> (<code className="text-zinc-200 font-mono">@dpm/*</code>) adds visual architecture contracts to libraries. Your design stays pure; compile to whatever stack your team prefers.
              </p>
            </div>
          </div>
          <Link
            href="/dpm"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-xs font-mono text-white transition-colors group"
          >
            <span>Read dpm Spec</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default StudioViewsSection;
