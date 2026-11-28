import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { History, CheckCircle2, Github } from "lucide-react";

export const metadata: Metadata = {
  title: "Changelog | dezign2app",
  description:
    "Recent product updates, new features, and improvements in dezign2app.",
};

const releases = [
  {
    version: "v2.4.0",
    date: "July 23, 2026",
    title: "Multi-Target Monorepo Compiler & Support Channel Integration",
    features: [
      "Made all public routes and policy pages accessible without authentication.",
      "Added direct customer support channel founder@dezign2app.com across landing sections.",
      "Added blast-radius impact analysis and node deletion diff previews before export.",
      "Enhanced Documentation and Walkthrough hubs.",
    ],
  },
  {
    version: "v2.3.0",
    date: "July 15, 2026",
    title: "Real-Time Canvas Collaboration & Convex Engine",
    features: [
      "Optimized multi-user presence indicators.",
      "Added drag-and-drop system design primitive node palettes.",
      "Improved export code formatting for Next.js 16.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <History className="size-3.5 text-emerald-400" />
            <span>Product Releases</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Changelog &amp; Release Notes
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            Stay up to date with new features, compiler targets, and performance
            improvements.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {releases.map((rel, idx) => (
            <div
              key={idx}
              className="p-8 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-zinc-900 border border-zinc-700 text-emerald-400 text-xs font-bold rounded-lg font-mono">
                    {rel.version}
                  </span>
                  <h2 className="text-lg font-bold text-white">{rel.title}</h2>
                </div>
                <span className="text-xs text-zinc-500 font-mono">
                  {rel.date}
                </span>
              </div>

              <ul className="flex flex-col gap-2.5 text-xs md:text-sm text-zinc-300">
                {rel.features.map((feat, fIdx) => (
                  <li key={fIdx} className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Support Section */}
        <div className="p-8 bg-[#0c0c10] border border-zinc-800 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-white">
              Have a feature request or feedback?
            </h3>
            <p className="text-xs text-zinc-400">
              Open an issue on GitHub or reach out to our engineering team.
            </p>
          </div>
          <a
            href="https://github.com/dezign2app/dezign2app/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 inline-flex items-center gap-2 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors shrink-0"
          >
            <Github className="size-4" />
            <span>Open GitHub Issues</span>
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
