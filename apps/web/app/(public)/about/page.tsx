import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us | dezign2app",
  description:
    "Learn about the mission, team, and technology behind dezign2app visual architecture compiler.",
};

export default function AboutPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <Sparkles className="size-3.5 text-emerald-400" />
            <span>Our Mission</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Bridging Visual Design &amp; System Architecture
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">
            dezign2app empowers software engineers and product teams to design,
            simulate, and compile full-stack monorepos directly from
            interactive visual canvases.
          </p>
        </div>

        {/* Story Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-white">
              Why we built dezign2app
            </h2>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
              Software design and system architecture have historically been
              separated into static diagrams, wireframes, and hand-coded
              implementations that drift out of sync.
            </p>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
              We built dezign2app to unify the workflow—giving engineers a
              visual canvas that compiles deterministically into TypeScript,
              Python, and Go monorepos with full source ownership.
            </p>
          </div>

          <div className="p-8 bg-[#0a0a0d] border border-zinc-800 rounded-2xl flex flex-col gap-4">
            <h3 className="text-lg font-bold text-white">Core Values</h3>
            <ul className="flex flex-col gap-3 text-xs text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-400">•</span>
                <span>
                  <strong className="text-white">Deterministic Foundations:</strong>{" "}
                  Compile predictable schemas, auth guards, and routing without
                  burning LLM tokens on boilerplate.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-400">•</span>
                <span>
                  <strong className="text-white">Full Code Ownership:</strong>{" "}
                  Standard Turborepo, Next.js 16, Express, FastAPI, Go, and
                  Docker Compose output with zero runtime lock-in.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-400">•</span>
                <span>
                  <strong className="text-white">Simulation &amp; Diffs:</strong>{" "}
                  Verify architecture flows in-memory and inspect blast-radius
                  file diffs before exporting.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact Banner */}
        <div className="p-8 bg-[#0c0c10] border border-zinc-800 text-white rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">
              Have questions or want to partner?
            </h3>
            <p className="text-xs text-zinc-400">
              Reach out to our founding team anytime.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-6 py-2.5 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors shrink-0"
          >
            founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
