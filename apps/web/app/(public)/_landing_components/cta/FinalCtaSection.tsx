"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Monitor, ShieldCheck } from "lucide-react";

export const FinalCtaSection: React.FC = () => {
  return (
    <section className="w-full py-24 bg-[#050505] border-t border-zinc-900 text-center">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Tag */}
        <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold mb-3">
          Zero Token Limits &bull; 100% Code Ownership
        </span>

        {/* Heading */}
        <h2
          style={{ fontFamily: "var(--font-display)" }}
          className="text-3xl sm:text-5xl font-bold tracking-tight text-white max-w-3xl leading-tight"
        >
          Turn System Architecture into Production Software.
        </h2>

        {/* Subhead */}
        <p className="mt-4 text-base text-zinc-400 max-w-xl leading-relaxed">
          Skip weeks of boilerplate and thousands in AI token bills. Model your system visually on CPU in seconds and ship production software today.
        </p>

        {/* Dual Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3.5 mt-8 mb-6">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors shadow-md"
          >
            <span>Start Building Free</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href="https://github.com/dezign2app/dezign2app/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            <Monitor className="w-4 h-4" />
            <span>Download Desktop App</span>
          </a>
        </div>

        {/* Guarantee */}
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
          <ShieldCheck className="w-4 h-4 text-zinc-400" />
          <span>Full source ownership · Real Next.js 16 monorepo · Cancel anytime</span>
        </div>
      </div>
    </section>
  );
};
