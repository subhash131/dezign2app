"use client";

import React from "react";
import Pricing from "../pricing";
import { Check, ShieldCheck, Zap, Lock, Coins } from "lucide-react";

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="w-full py-24 bg-[#050505] border-t border-zinc-900 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Sales-Driven Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-14 max-w-2xl">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">
            Simple Pricing
          </span>
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white"
          >
            Pays for Itself on Day One.
          </h2>
          <p className="text-zinc-300 text-sm sm:text-base font-medium leading-relaxed">
            Generate the 70% that&apos;s predictable with algorithms. Use AI only for the 30% that needs thinking.
          </p>
          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed max-w-xl">
            Coding agents charge $20/mo with strict rate limits, burning millions of tokens in endless retry loops just to piece together a single full-stack app. Dezign2App gives you a full month with <strong>zero token limits</strong>—compiling complete production monorepos instantly on your CPU at $0 token cost.
          </p>
        </div>

        {/* Pricing Card Stage */}
        <div className="w-full flex justify-center mb-12">
          <Pricing hideHeader={true} hideToggle={true} />
        </div>

        {/* High-Trust Buyer Guarantees */}
        <div className="flex flex-wrap items-center justify-center gap-8 mt-12 text-xs font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-zinc-400" />
            <span>100% Code Ownership</span>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>Zero Token Limits (Runs on CPU)</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-zinc-400" />
            <span>Zero Vendor Lock-In</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-zinc-400" />
            <span>Cancel Anytime</span>
          </div>
        </div>
      </div>
    </section>
  );
};
