import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import VideoPlayer from "../_landing_components/intro/video-player";
import { Metadata } from "next";
import {
  PlayCircle,
  BookOpen,
  Sparkles,
  ArrowRight,
  Code2,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Tutorials & Video Walkthroughs | dezign2app",
  description:
    "Step-by-step guides and video tutorials on turning system designs into web apps with dezign2app.",
};

const tutorials = [
  {
    title: "Building your first system architecture diagram on canvas",
    category: "Beginner",
    time: "5 min read",
    desc: "Learn how to use canvas nodes, connectors, and export Tailwind CSS components.",
  },
  {
    title: "Connecting automated background jobs with Inngest and webhooks",
    category: "Advanced",
    time: "10 min read",
    desc: "Set up serverless event triggers that execute long-running AI canvas transformations.",
  },
  {
    title: "Exporting custom Next.js 16 components with TypeScript props",
    category: "Intermediate",
    time: "7 min read",
    desc: "Export clean React components directly into your local app directory structure.",
  },
];

export default function TutorialsPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-white text-black flex flex-col items-center overflow-x-hidden">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black text-white text-xs font-semibold">
            <PlayCircle className="size-3.5" />
            <span>Developer Tutorials</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            Learn how to build faster with dezign2app
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed max-w-xl">
            Step-by-step guides and walkthroughs to help you master visual
            design and workflow automation.
          </p>
        </div>

        {/* Featured Video Walkthrough */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">
              Featured Walkthrough
            </h2>
            <a
              href="https://youtu.be/4PHK9rqgrmE?t=26"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-gray-600 hover:text-black transition-colors"
            >
              Watch on YouTube →
            </a>
          </div>
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-gray-200 bg-black shadow-sm">
            <VideoPlayer src="https://www.youtube.com/embed/4PHK9rqgrmE?start=26&rel=0" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {tutorials.map((tut, idx) => (
            <div
              key={idx}
              className="p-6 border border-gray-200 rounded-2xl bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-all"
            >
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-gray-100 font-bold text-gray-700">
                    {tut.category}
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-500">{tut.time}</span>
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  {tut.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {tut.desc}
                </p>
              </div>
              <Link
                href="/docs"
                className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-all shrink-0"
              >
                Read Guide →
              </Link>
            </div>
          ))}
        </div>

        {/* Support Section */}
        <div className="p-8 bg-gray-50 border border-gray-200 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-gray-900">
              Need a custom tutorial for your team?
            </h3>
            <p className="text-xs text-gray-600">
              Contact our support engineering team.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-5 py-2.5 bg-black text-white text-xs font-semibold rounded-xl hover:bg-gray-800 transition-all shrink-0"
          >
            founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
