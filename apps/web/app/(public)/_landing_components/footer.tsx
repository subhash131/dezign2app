"use client";

import React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Blockchain04Icon } from "@hugeicons/core-free-icons";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-[#050505] border-t border-zinc-900 py-16 px-4 sm:px-8 text-zinc-400 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-10">
          {/* Brand and Description */}
          <div className="flex flex-col gap-3.5 max-w-sm">
            <Link href="/" className="flex gap-2.5 items-center group">
              <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center text-black">
                <HugeiconsIcon icon={Blockchain04Icon} className="size-4" />
              </div>
              <span className="text-sm font-bold tracking-tight text-white font-mono">
                dezign2app
              </span>
            </Link>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The visual system architecture platform that compiles architecture diagrams directly into production-grade full-stack monorepos.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span>Support:</span>
              <a
                href="mailto:founder@dezign2app.com"
                className="text-zinc-300 hover:text-white transition-colors"
              >
                founder@dezign2app.com
              </a>
            </div>

            {/* Social Icons */}
            <div className="flex gap-4 mt-1 text-zinc-400">
              <a
                href="https://x.com/hash_aidev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                <span className="sr-only">X (Twitter)</span>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                </svg>
              </a>
              <a
                href="https://github.com/dezign2app/dezign2app"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                <span className="sr-only">GitHub</span>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                  <path d="M9 18c-4.51 2-5-2-7-2" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav Columns */}
          <div className="flex flex-wrap gap-12 sm:gap-16 text-xs">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
                Product
              </span>
              <div className="flex flex-col gap-2 text-zinc-400">
                <Link href="/#dpm" className="hover:text-white transition-colors">
                  Targets
                </Link>
                <Link href="/#compiler" className="hover:text-white transition-colors">
                  Monorepo Compiler
                </Link>
                <Link href="/#why-visual" className="hover:text-white transition-colors">
                  Why Visual
                </Link>
                <Link href="/dpm" className="hover:text-white transition-colors flex items-center gap-1.5">
                  <span>dpm</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Upcoming</span>
                </Link>
                <Link href="/#pricing" className="hover:text-white transition-colors">
                  Pricing
                </Link>
                <a
                  href="https://github.com/dezign2app/dezign2app/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Releases
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-mono text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
                Resources
              </span>
              <div className="flex flex-col gap-2 text-zinc-400">
                <a
                  href="https://docs.dezign2app.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Documentation
                </a>
                <Link href="/changelog" className="hover:text-white transition-colors">
                  Changelog
                </Link>
                <Link href="/tutorials" className="hover:text-white transition-colors">
                  Tutorials
                </Link>
                <Link href="/support" className="hover:text-white transition-colors">
                  Support
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-mono text-zinc-300 font-semibold uppercase tracking-wider text-[11px]">
                Legal
              </span>
              <div className="flex flex-col gap-2 text-zinc-400">
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms of Service
                </Link>
                <Link href="/aup" className="hover:text-white transition-colors">
                  Acceptable Use
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="pt-8 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-zinc-500 font-mono">
          <div>&copy; {currentYear} Dezign2App Inc. All rights reserved.</div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>Visual Architecture &amp; Monorepo Compiler</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
