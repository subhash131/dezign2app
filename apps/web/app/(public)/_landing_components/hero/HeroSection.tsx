"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Monitor, Check, ShieldCheck, Zap } from "lucide-react";
import { HeroCanvasPreview } from "./HeroCanvasPreview";

export const HeroSection: React.FC = () => {
  return (
    <section className="w-full flex flex-col items-center text-center px-4 pt-20 pb-20 relative bg-[#050505]">
      {/* Top Value Hook */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 shadow-xs mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        <span className="text-xs font-mono text-zinc-300 font-medium">
          The Visual Software Architecture Platform
        </span>
      </div>

      {/* High-Converting Sales Headline - Pure White, Zero Gradients */}
      <h1
        style={{ fontFamily: "var(--font-display)" }}
        className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white max-w-5xl leading-[1.08]"
      >
        Stop Paying AI to Write the Same CRUD for the 1000th Time.
      </h1>

      {/* Benefit-Driven Subhead */}
      <p className="mt-6 text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl font-normal leading-relaxed">
        Cheaper, faster, and consistent: AI where it matters, not everywhere. Visually map your distributed system and compile a production-ready full-stack codebase in seconds.
      </p>

      {/* Primary CTAs for Conversion */}
      <div className="flex flex-wrap items-center justify-center gap-3.5 mt-8 mb-10">
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors shadow-sm"
        >
          <span>Start Building Free</span>
          <ArrowRight className="w-4 h-4" />
        </Link>

        <a
          href="https://github.com/dezign2app/dezign2app/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-sm font-medium"
        >
          <Monitor className="w-4 h-4" />
          <span>Download Desktop</span>
          <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
            Win/Mac
          </span>
        </a>
      </div>

      {/* Verified Engineering Benchmarks (Agent-evaluated and grounded) */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 max-w-3xl mb-14 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>&lt;800ms Deterministic AST Compile</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-zinc-300" />
          <span>100% Type-Safe Contract Parity</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-300" />
          <span>100% Code Ownership (Turborepo)</span>
        </div>
      </div>

      {/* The Visual Architecture Canvas Preview */}
      <HeroCanvasPreview />
    </section>
  );
};
