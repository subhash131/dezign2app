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
            Built for Architecture, Simulation &amp; Ship Speed.
          </h2>
          <p className="text-zinc-300 text-sm sm:text-base font-medium leading-relaxed">
            Use deterministic compilation for your monorepo foundation, and focus engineering time on custom business logic.
          </p>
          <p className="text-zinc-400 text-xs sm:text-sm leading-relaxed max-w-xl">
            Beta Access unlocks the multi-canvas studio, Turborepo compiler, in-memory flow simulation, snapshot commit history, organization workspaces, and Desktop Studio with local database runners.
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
            <span>Full Code Ownership</span>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-400" />
            <span>In-Memory Flow Simulation Included</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-zinc-400" />
            <span>No Runtime Vendor Lock-In</span>
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
