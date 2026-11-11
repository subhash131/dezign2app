"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "Is the generated code actually production-ready?",
    answer:
      "Yes. Dezign2App generates clean, standard TypeScript structured as a Turborepo + pnpm monorepo. It includes Next.js 16 App Router for the frontend, typed Express or FastAPI microservices, Better Auth authentication with RBAC guards, and Docker Compose with database migrations. It is the exact architecture senior engineering teams build by hand.",
  },
  {
    question: "Do I own the code, or is there vendor lock-in?",
    answer:
      "You own 100% of the code. There are zero runtime fees, no proprietary SDKs, and zero vendor lock-in. You can download the project as a ZIP, push it to GitHub, and deploy to AWS, GCP, Vercel, Railway, or your own self-hosted servers. Your code is yours forever.",
  },
  {
    question: "How is Dezign2App different from pure AI code generators (Cursor, Claude, or 'vibe coding')?",
    answer:
      "Pure AI means you describe what you want and accept what comes out—which quickly breaks down in full-stack apps when database schemas, API contracts, auth flows, and frontend state drift out of sync. Dezign2App uses an 'Algorithm + AI' approach: we use deterministic algorithms for the predictable scaffolding (instant AST compilation of schemas, Turborepo packages, typed routes, and Docker bridges with 0 hallucinations and $0 token burn), and AI for custom domain logic. You decide the architecture first; AI implements a verified spec rather than a guess.",
  },
  {
    question: "Can I customize the code? What happens to my custom edits on the next canvas sync?",
    answer:
      "Your custom code is never deleted. Dezign2App separates generated infrastructure contracts (shared schemas, types, and wire protocols) from user business logic (controllers, custom routes, and UI components). When you update your visual canvas, the compiler performs non-destructive incremental updates or emits clean Git PR diffs—ensuring your custom business logic, third-party packages, and manual edits remain 100% intact.",
  },
  {
    question: "Can I run Dezign2App offline on my local machine?",
    answer:
      "Yes. With our native Electron 34 Desktop Studio, you get embedded local database runners (PostgreSQL, SQLite, Redis) and an integrated native PTY terminal. You can design, simulate, and compile complete systems offline with zero cloud setup.",
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
