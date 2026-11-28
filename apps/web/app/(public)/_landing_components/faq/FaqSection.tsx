"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "What stack does the generated monorepo use?",
    answer:
      "Dezign2App generates clean, standard TypeScript, Python, or Go code structured as a Turborepo + pnpm monorepo. It supports Next.js 16 App Router for web clients, Express, FastAPI, or Go services, Better Auth with RBAC guards, PostgreSQL, MySQL, SQLite, Convex, Redis, Kafka, and Docker Compose.",
  },
  {
    question: "Do I own the code, or is there vendor lock-in?",
    answer:
      "You own 100% of the exported code. There are no runtime fees and no proprietary SDK lock-in. You can download the monorepo as a ZIP, export to disk, or open in StackBlitz and deploy to AWS, GCP, Vercel, Railway, or your own servers.",
  },
  {
    question: "How does Dezign2App work with Cursor, Claude Code, or other AI coding agents?",
    answer:
      "Instead of asking an LLM to guess your entire architecture from scratch, Dezign2App compiles the predictable scaffolding (schemas, typed routes, auth middleware, client hooks, and Docker setup) deterministically, and exposes your live architecture graph over MCP (Model Context Protocol). Your coding agents query exact nodes, edges, and contracts via MCP to implement custom business logic against a verified spec.",
  },
  {
    question: "What happens when I edit generated code and change the diagram later?",
    answer:
      "Dezign2App compiles architecture updates into clean Turborepo packages and computes blast-radius impact and file diffs before applying deletions or structural changes. We recommend exporting to a Git repository and reviewing re-compiled diffs or letting your MCP-connected coding agent apply targeted contract updates so custom business logic stays under your control.",
  },
  {
    question: "Can I run Dezign2App locally on my workstation?",
    answer:
      "Yes. With our Electron 34 Desktop Studio, you get an embedded native PTY terminal, local PostgreSQL, SQLite, and Redis runners, direct disk export, and 1-click Docker Compose execution.",
  },
];

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="w-full py-24 bg-[#08080a] border-t border-zinc-900">
      {/* Schema.org FAQPage JSON-LD for AI crawlers & search agents */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        }}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-12">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">
            Common Questions
          </span>
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-white"
          >
            Frequently Asked Questions
          </h2>
          <p className="text-zinc-400 text-sm max-w-lg">
            Everything you need to know about code ownership, production readiness, and workflow.
          </p>
        </div>

        {/* FAQ Accordion List - Always keep answers in DOM so AI scrapers & crawlers can read full text */}
        <div className="w-full flex flex-col gap-2.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-lg border border-zinc-800 bg-[#0c0c0f] overflow-hidden transition-colors"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={isOpen}
                  className="w-full p-4 sm:p-5 flex items-center justify-between text-left gap-4 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className="text-sm font-semibold text-white">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${
                      isOpen ? "rotate-180 text-white" : ""
                    }`}
                  />
                </button>
                <div
                  className={`px-4 sm:px-5 text-xs sm:text-sm text-zinc-400 leading-relaxed transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? "max-h-[500px] pb-4 sm:pb-5 pt-0 opacity-100 border-t border-zinc-800/80"
                      : "max-h-0 opacity-0 pointer-events-none"
                  }`}
                  aria-hidden={!isOpen}
                >
                  {faq.answer}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
