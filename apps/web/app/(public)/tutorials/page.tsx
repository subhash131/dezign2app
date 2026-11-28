import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import VideoPlayer from "../_landing_components/intro/video-player";
import { Metadata } from "next";
import { PlayCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Tutorials & Video Walkthroughs | dezign2app",
  description:
    "Video walkthrough on turning system designs into full-stack monorepos with dezign2app.",
};

export default function TutorialsPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <PlayCircle className="size-3.5 text-emerald-400" />
            <span>Developer Tutorials</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Learn how to build faster with dezign2app
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            Watch our walkthrough on visual architecture design, simulation, and
            full-stack monorepo compilation.
          </p>
        </div>

        {/* Featured Video Walkthrough */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">
              Featured Walkthrough
            </h2>
            <a
              href="https://youtu.be/4PHK9rqgrmE?t=26"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-zinc-400 hover:text-white transition-colors"
            >
              Watch on YouTube →
            </a>
          </div>
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-zinc-800 bg-black shadow-2xl">
            <VideoPlayer src="https://www.youtube.com/embed/4PHK9rqgrmE?start=26&rel=0" />
          </div>
        </div>

        {/* Support Section */}
        <div className="p-8 bg-[#0c0c10] border border-zinc-800 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-white">
              Need a custom walkthrough for your team?
            </h3>
            <p className="text-xs text-zinc-400">
              Contact our support engineering team.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-semibold rounded-xl hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
          >
            founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
