import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { Handshake } from "lucide-react";

export const metadata: Metadata = {
  title: "Partners & Ecosystem | dezign2app",
  description:
    "Partner with dezign2app to integrate canvas architecture into your development workflow.",
};

export default function PartnersPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <Handshake className="size-3.5 text-emerald-400" />
            <span>Partner Program</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Grow with dezign2app Ecosystem
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            Collaborate with us as an agency partner, technology integration
            provider, or package adapter creator.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3">
            <h3 className="text-base font-bold text-white">
              Technology Partners
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Integrate your developer APIs, UI component libraries, or database
              connectors directly into the dezign2app canvas node palette.
            </p>
          </div>

          <div className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3">
            <h3 className="text-base font-bold text-white">
              Agency &amp; Solution Partners
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Accelerate client deliverables with deterministic diagram-to-code
              monorepo pipelines and shared workspace features.
            </p>
          </div>
        </div>

        <div className="p-8 bg-[#0c0c10] border border-zinc-800 text-white rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold">Become a Partner</h3>
            <p className="text-xs text-zinc-400">
              Contact our partnerships leadership team.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com?subject=Partner Program Inquiry"
            className="px-6 py-3 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors shrink-0"
          >
            Email founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
