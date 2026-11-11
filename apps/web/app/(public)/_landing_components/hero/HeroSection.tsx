"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Monitor, Check, ShieldCheck, Zap, Play, X, ExternalLink, Code2 } from "lucide-react";
import { HeroCanvasPreview } from "./HeroCanvasPreview";

// Replace with your YouTube/Loom embed URL when your demo recording is ready
const DEMO_VIDEO_EMBED_URL = ""; 

export const HeroSection: React.FC = () => {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

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

        <button
          onClick={() => setIsVideoModalOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-900 border border-zinc-700/80 text-white hover:bg-zinc-800 transition-colors text-sm font-medium shadow-sm group"
        >
          <Play className="w-4 h-4 fill-emerald-400 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span>Watch 2-Min Demo</span>
        </button>

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

      {/* Demo Video Modal / Verified Proof Dialog */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-4xl bg-[#0c0c0f] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#08080a]">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-semibold text-white">
                  Dezign2App Compiler: Design to Running Monorepo in 3 Minutes
                </h3>
              </div>
              <button
                onClick={() => setIsVideoModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="w-full aspect-video bg-black flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
              {DEMO_VIDEO_EMBED_URL ? (
                <iframe
                  src={DEMO_VIDEO_EMBED_URL}
                  title="Dezign2App Product Demo"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="flex flex-col items-center max-w-md gap-4 z-10">
                  <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-inner">
                    <Play className="w-7 h-7 fill-emerald-400 translate-x-0.5" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-lg mb-1">
                      Interactive Walkthrough &amp; Working Proof
                    </h4>
                    <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed">
                      Watch how a complete Turborepo with Next.js 16, FastAPI microservices, and Docker Compose is deterministically generated from an architecture topology.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                    <a
                      href="https://github.com/dezign2app/dezign2app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-white transition-colors"
                    >
                      <Code2 className="w-4 h-4 text-emerald-400" />
                      <span>Inspect Sample Monorepo (GitHub)</span>
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
                    </a>
                    <button
                      onClick={() => setIsVideoModalOpen(false)}
                      className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-colors"
                    >
                      Explore Interactive Canvas
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
