"use client";

import React, { useState } from "react";
import {
  FolderTree,
  FileCode,
  Download,
  ExternalLink,
  Box,
  Check,
} from "lucide-react";

interface CodeSnippet {
  id: string;
  filename: string;
  language: string;
  code: string;
}

const SNIPPETS: CodeSnippet[] = [
  {
    id: "route",
    filename: "apps/api/src/routes/users.ts",
    language: "typescript",
    code: `import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/backend/db";

export const userRouter = Router();

// Auto-generated from Dezign2App User Service node contracts
userRouter.get("/me", requireAuth, async (req, res) => {
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, req.session.userId),
  });
  return res.json({ success: true, user });
});`,
  },
  {
    id: "store",
    filename: "apps/web/stores/useAuthStore.ts",
    language: "typescript",
    code: `import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: { id: string; email: string; role: string } | null;
  isAuthenticated: boolean;
  setUser: (user: AuthState["user"]) => void;
  logout: () => void;
}

// LangGraph-style single-reducer state store
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: "d2a-auth-storage" }
  )
);`,
  },
  {
    id: "docker",
    filename: "docker-compose.yml",
    language: "yaml",
    code: `version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dezign2app
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api-service:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis`,
  },
  {
    id: "schema",
    filename: "packages/backend/schema.sql",
    language: "sql",
    code: `CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(120),
  role VARCHAR(32) DEFAULT 'user' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_email ON users(email);`,
  },
  {
    id: "diff",
    filename: "architecture-impact.diff",
    language: "diff",
    code: `# Round-trip workflow when you edit code locally & update the canvas:
# 1. Custom business logic stays in Git (e.g. apps/api/src/routes/users.ts)
# 2. Rename/update a node or schema on canvas -> inspect blast radius:
~ Severed Connection:
  - API Gateway -> User Service (POST /users)
~ Affected Files Preview (before exporting):
  M packages/types/src/contracts.ts   # updated Zod contract
  M apps/web/lib/api/client.ts        # updated client fetch wrapper
  D apps/user-service/src/routes/users.ts
# 3. Snapshot committed before export — review diffs cleanly in Git`,
  },
];

export const CompilerShowcaseSection: React.FC = () => {
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>("route");
  const activeSnippet = SNIPPETS.find((s) => s.id === selectedSnippetId)!;

  return (
    <section id="compiler" className="w-full py-24 bg-[#050505] border-t border-zinc-900 scroll-mt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-14 max-w-2xl">
          <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
            Monorepo Compiler
          </span>
          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white"
          >
            Visual Diagram → Full-Stack Monorepo
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Dezign2App synthesizes an entire, production-grade <strong>Turborepo + pnpm workspace</strong> with strict TypeScript contracts, Docker Compose orchestration, and verified route handlers.
          </p>
        </div>

        {/* 2-Column Split Studio Preview */}
        <div className="w-full rounded-xl border border-zinc-800 bg-[#0a0a0c] shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Virtual File Tree */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-[#0e0e11] p-4 sm:p-5 flex flex-col justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs font-mono text-white flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-zinc-400" />
                  <span>workspace-monorepo/</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                  Turborepo 2.6
                </span>
              </div>

              {/* Tree File List */}
              <div className="flex flex-col gap-1 text-xs font-mono">
                <span className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wider my-1">
                  Apps &amp; Services
                </span>
                <button
                  onClick={() => setSelectedSnippetId("route")}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${
                    selectedSnippetId === "route"
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">apps/api/src/routes/users.ts</span>
                </button>
                <button
                  onClick={() => setSelectedSnippetId("store")}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${
                    selectedSnippetId === "store"
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">apps/web/stores/useAuthStore.ts</span>
                </button>

                <span className="text-zinc-600 text-[10px] font-semibold uppercase tracking-wider my-1 pt-2">
                  Packages &amp; Config
                </span>
                <button
                  onClick={() => setSelectedSnippetId("schema")}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${
                    selectedSnippetId === "schema"
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">packages/backend/schema.sql</span>
                </button>
                <button
                  onClick={() => setSelectedSnippetId("docker")}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${
                    selectedSnippetId === "docker"
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Box className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">docker-compose.yml</span>
                </button>
                <button
                  onClick={() => setSelectedSnippetId("diff")}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${
                    selectedSnippetId === "diff"
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">architecture-impact.diff</span>
                </button>
              </div>
            </div>

            {/* Export Capabilities */}
            <div className="mt-8 pt-4 border-t border-zinc-800 flex flex-col gap-2">
              <span className="text-[10px] font-mono text-zinc-500 font-semibold uppercase tracking-wider">
                Export Options
              </span>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
                  <Download className="w-3 h-3 text-zinc-400" />
                  <span>ZIP File</span>
                </div>
                <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
                  <ExternalLink className="w-3 h-3 text-zinc-400" />
                  <span>StackBlitz</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Code Viewer */}
          <div className="lg:col-span-8 flex flex-col bg-[#08080a] text-white">
            {/* Editor Tab Bar */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-[#0e0e11] text-xs font-mono">
              <div className="flex items-center gap-2 text-zinc-300">
                <FileCode className="w-3.5 h-3.5 text-zinc-500" />
                <span>{activeSnippet.filename}</span>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                {activeSnippet.language}
              </span>
            </div>

            {/* Code Body */}
            <div className="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto min-h-[360px] text-zinc-300">
              <pre>
                <code>{activeSnippet.code}</code>
              </pre>
            </div>

            {/* Editor Footer Status */}
            <div className="px-4 py-2 border-t border-zinc-800 bg-[#0a0a0c] flex items-center justify-between text-[11px] font-mono text-zinc-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-400" />
                <span>TypeScript strict: 0 errors</span>
              </div>
              <span>pnpm install --frozen-lockfile</span>
            </div>
          </div>
        </div>

        {/* Value Proposition Highlights - Minimalist Cards */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-5 mt-10 text-left">
          <div className="p-5 rounded-lg border border-zinc-800/80 bg-[#0c0c0e] flex flex-col gap-1.5">
            <span className="text-zinc-500 font-mono text-xs">01 — Monorepo Scaffolding</span>
            <h4 className="text-sm font-semibold text-white">Clean Architectural Separation</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Strict isolation between web frontend, backend microservices, shared design system, and canonical schemas.
            </p>
          </div>
          <div className="p-5 rounded-lg border border-zinc-800/80 bg-[#0c0c0e] flex flex-col gap-1.5">
            <span className="text-zinc-500 font-mono text-xs">02 — Blast-Radius &amp; Git Diffs</span>
            <h4 className="text-sm font-semibold text-white">Review Diffs Before Merging</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Every structural canvas edit computes affected routes, severed edges, and file diffs—paired with snapshot commits so you review contract updates cleanly in Git.
            </p>
          </div>
          <div className="p-5 rounded-lg border border-zinc-800/80 bg-[#0c0c0e] flex flex-col gap-1.5">
            <span className="text-zinc-500 font-mono text-xs">03 — Docker Compose</span>
            <h4 className="text-sm font-semibold text-white">Zero Configuration Local Setup</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Spin up your entire distributed system locally with pre-configured PostgreSQL, Redis, and service containers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
