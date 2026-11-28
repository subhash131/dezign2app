import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { Newspaper, Calendar, User } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog & Engineering Insights | dezign2app",
  description:
    "Read the latest engineering updates, system architecture design patterns, and product announcements from dezign2app.",
};

const posts = [
  {
    title: "Introducing dezign2app 2.0: Visual System Architecture to Monorepo Code",
    date: "July 20, 2026",
    author: "dezign2app Team",
    snippet:
      "Discover how our multi-canvas studio compiles interactive architecture diagrams into full-stack TypeScript, Python, and Go monorepos.",
  },
  {
    title:
      "How We Built a Real-Time Collaborative Canvas with Convex and React",
    date: "July 12, 2026",
    author: "Engineering",
    snippet:
      "A deep dive into reactive state sync, optimistic updates, and snapshot commit history.",
  },
  {
    title:
      "Deterministic Scaffolding vs. Pure Prompting in Full-Stack Monorepos",
    date: "June 28, 2026",
    author: "Product Strategy",
    snippet:
      "Why pairing deterministic monorepo compilation with visual schemas eliminates contract drift before AI touches custom logic.",
  },
];

export default function BlogPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <Newspaper className="size-3.5 text-emerald-400" />
            <span>Blog &amp; Insights</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Engineering, Design &amp; Product Updates
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            Articles and technical deep dives from the creators of dezign2app.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {posts.map((post, idx) => (
            <article
              key={idx}
              className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {post.date}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {post.author}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white">{post.title}</h2>
              <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
                {post.snippet}
              </p>
              <a
                href="https://docs.dezign2app.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 mt-1 transition-colors"
              >
                Read Documentation →
              </a>
            </article>
          ))}
        </div>

        {/* Contact Support */}
        <div className="p-8 bg-[#0c0c10] border border-zinc-800 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-white">
              Want to contribute a guest post?
            </h3>
            <p className="text-xs text-zinc-400">
              Get in touch with our editorial team.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-5 py-2.5 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors shrink-0"
          >
            founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
