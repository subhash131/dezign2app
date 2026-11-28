import React from "react";
import TemplateCard from "./template-card";

const TEMPLATES_DATA = [
  {
    title: "AI Lead Enrichment Flow",
    description: "Scrape and enrich lead profiles via LLM, then route to CRM",
    authorImg: "/hash.png",
    authorName: "Subhash",
    experienceStack: [
      { src: "/tech/gemini.svg", alt: "Gemini AI" },
      { src: "/tech/postgres.svg", alt: "Postgres" },
      { src: "/tech/langgraph.svg", alt: "LangGraph" },
    ],
    features: [
      "Webhook Trigger",
      "Gemini Reasoning",
      "Postgres Query Node",
      "Success/Failure Branching",
      "Better Auth RBAC",
    ],
  },
  {
    title: "Support Ticket Classifier",
    description:
      "Analyze customer inquiry sentiment and route to high-priority queues",
    authorImg: "/hash.png",
    authorName: "Subhash",
    experienceStack: [
      { src: "/tech/openai.svg", alt: "OpenAI" },
      { src: "/tech/convex.svg", alt: "Convex DB" },
      { src: "/tech/clerk.svg", alt: "Clerk" },
    ],
    features: [
      "Inbound Webhook",
      "LLM Sentiment Analysis",
      "Conditional Branching",
      "Convex DB Sync",
      "Real-time SSE Notification",
    ],
  },
  {
    title: "Smart RSS Digest Builder",
    description:
      "Aggregate RSS feeds, summarize contents with LLM, and send newsletters",
    authorImg: "/hash.png",
    authorName: "Subhash",
    experienceStack: [
      { src: "/tech/gemini.svg", alt: "Gemini AI" },
      { src: "/tech/nextjs.svg", alt: "NextJS" },
      { src: "/tech/postgres.svg", alt: "Postgres" },
    ],
    features: [
      "Cron Scheduled Trigger",
      "RSS Parser",
      "Gemini Summarization",
      "Email Dispatcher",
      "Inngest Queue Worker",
    ],
  },
  {
    title: "Database Schema Analyzer",
    description:
      "Inspect relational schemas and generate SQL migrations deterministically",
    authorImg: "/hash.png",
    authorName: "Subhash",
    experienceStack: [
      { src: "/tech/postgres.svg", alt: "Postgres" },
      { src: "/tech/openai.svg", alt: "OpenAI" },
      { src: "/tech/langgraph.svg", alt: "LangGraph" },
    ],
    features: [
      "Interactive Trigger",
      "Schema Discovery",
      "OpenAI Generator",
      "Migration Safe Verification",
      "End-node SSE Log Stream",
    ],
  },
];

const Templates = () => {
  return (
    <div className="w-full h-full flex flex-col gap-2 text-center lg:text-start pt-6">
      <h2 className="text-sm font-semibold tracking-wider">
        Featured AI Templates
      </h2>
      <div className="relative h-auto lg:h-[calc(100vh-16rem)]">
        {/* Top fade */}
        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />

        <div className="h-full overflow-y-scroll hide-scrollbar -mx-3 px-3">
          <div className="flex flex-col gap-3 pb-10 pt-4">
            {TEMPLATES_DATA.map((template, index) => (
              <TemplateCard
                key={index}
                {...template}
                className={index % 2 === 0 ? "-rotate-1" : "rotate-1"}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Templates;
