"use client";

import React, { useState } from "react";
import {
  Cloud,
  Activity,
  Bot,
  ShieldAlert,
  GitPullRequest,
  TrendingDown,
  FileCheck,
  Radio,
  CheckCircle2,
} from "lucide-react";

export const FutureRoadmapSection: React.FC = () => {
  const [activeWorker, setActiveWorker] = useState<number>(0);

  const AI_WORKERS = [
    {
      id: "hacker",
      title: "AI Ethical Hacker",
      role: "Continuous Red Team & Penetration Testing",
      badge: "SECURITY DEFENSE",
      icon: ShieldAlert,
      description:
        "Autonomously probes your deployed services and APIs for OWASP Top 10 exploits, broken authentication, exposed secrets, and DDoS vectors. Patches vulnerabilities before malicious actors find them.",
      highlights: [
        "Continuous automated penetration tests",
        "Secrets & IAM privilege escalation audits",
        "Simulated attack vectors & zero-day checks",
      ],
      outputBadge: "0 Vulnerabilities Detected",
    },
    {
      id: "tickets",
      title: "AI Ticket & Bug Resolver",
      role: "Auto-Reproduce, Patch & Push PRs",
      badge: "DEV AGENT",
      icon: GitPullRequest,
      description:
        "Listens to production error logs (Sentry, Datadog) and issue trackers (GitHub, Jira). Automatically reproduces the bug in an isolated container, writes a regression test, fixes the code, and opens a verified PR.",
      highlights: [
        "Instant error log to reproduction sandbox",
        "Generates unit & integration regression tests",
        "Submits ready-to-merge GitHub Pull Requests",
      ],
      outputBadge: "PR #142 Ready to Merge",
    },
    {
      id: "finops",
      title: "AI FinOps Cost Optimizer",
      role: "24/7 Cloud Spend Reduction",
      badge: "COST CONTROL",
      icon: TrendingDown,
      description:
        "Continuously audits live infrastructure usage across AWS and GCP. Identifies idle compute instances, unindexed heavy database queries, and redundant egress traffic to slash monthly cloud bills.",
      highlights: [
        "Automatic autoscaler right-sizing",
        "Detects expensive unindexed DB scans",
        "Saves an average of 30–45% on monthly cloud bills",
      ],
      outputBadge: "Saved $1,240 / month",
    },
    {
      id: "compliance",
      title: "AI Compliance Sentinel",
      role: "SOC2, HIPAA & GDPR Governance",
      badge: "AUDIT & GOVERNANCE",
      icon: FileCheck,
      description:
        "Real-time governance engine verifying data encryption at rest and in transit across every canvas node. Generates exportable evidence and security logs for SOC2 Type II, HIPAA, and ISO 27001 audits.",
      highlights: [
        "Canvas topology encryption verification",
        "Automated audit evidence collection",
        "Continuous least-privilege IAM enforcement",
      ],
      outputBadge: "SOC2 & HIPAA Compliant",
    },
  ];

  const currentWorker = AI_WORKERS[activeWorker] ?? AI_WORKERS[0]!;

  return (
    <section className="w-full py-24 bg-[#070709] border-t border-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center gap-3 mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs font-mono text-zinc-400">
            <Radio className="w-3.5 h-3.5 text-zinc-300 animate-pulse" />
            <span>PHASED ROADMAP &amp; ECOSYSTEM</span>
          </div>

          <h2
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mt-2"
          >
            Compiler First. Cloud Control Plane Next.
          </h2>

          <p className="text-zinc-400 text-sm sm:text-base md:text-lg leading-relaxed max-w-2xl">
            Our deterministic monorepo compiler is live in Beta today. We are methodically extending the core engine with modular cloud provisioning and live telemetry extensions.
          </p>
        </div>

        {/* 2 Big Preview Cards: Cloud Infra UI + Real-Time Telemetry */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Card 1: Visual Cloud Infrastructure */}
          <div className="p-7 sm:p-8 rounded-2xl border border-zinc-800 bg-[#0a0a0d] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Cloud className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-2.5 py-1 rounded border border-zinc-800 bg-zinc-900/60">
                  Phase 2 &bull; Cloud Infra Sync
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Visual Cloud Infrastructure (AWS / GCP)
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-6">
                Configure enterprise cloud environments with a clean, intuitive visual canvas. No wrestling with sprawling Terraform templates or navigating nested cloud console menus.
              </p>

              {/* Mock Visual UI */}
              <div className="rounded-xl border border-zinc-800/80 bg-[#060608] p-5 font-mono text-xs flex flex-col gap-3">
                <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800/60 pb-2">
                  <span className="text-[11px] text-zinc-500 uppercase">Provider Config</span>
                  <span className="text-[11px] text-zinc-300">AWS us-east-1 &bull; VPC 10.0.0.0/16</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded border border-zinc-800/70 bg-zinc-900/40">
                    <span className="text-zinc-500 block text-[10px]">APPLICATION LOAD BALANCER</span>
                    <span className="text-white font-semibold">Dual-AZ ALB &bull; SSL/TLS</span>
                  </div>
                  <div className="p-2.5 rounded border border-zinc-800/70 bg-zinc-900/40">
                    <span className="text-zinc-500 block text-[10px]">WAF &amp; FIREWALL</span>
                    <span className="text-white font-semibold">Rate Limit + DDoS Guard</span>
                  </div>
                  <div className="p-2.5 rounded border border-zinc-800/70 bg-zinc-900/40">
                    <span className="text-zinc-500 block text-[10px]">AUTOSCALING REPLICAS</span>
                    <span className="text-white font-semibold">3 &ndash; 12 Pods (CPU &gt; 70%)</span>
                  </div>
                  <div className="p-2.5 rounded border border-zinc-800/70 bg-zinc-900/40">
                    <span className="text-zinc-500 block text-[10px]">PERSISTENT STORAGE</span>
                    <span className="text-white font-semibold">Aurora Postgres + Multi-AZ</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/60 mt-6 flex items-center justify-between text-xs text-zinc-400">
              <span>Supports AWS, GCP &amp; Azure</span>
              <span className="text-white font-mono font-semibold">1-Click Terraform Export</span>
            </div>
          </div>

          {/* Card 2: Real-Time Node Telemetry & Live Traffic */}
          <div className="p-7 sm:p-8 rounded-2xl border border-zinc-800 bg-[#0a0a0d] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white">
                  <Activity className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 px-2.5 py-1 rounded border border-zinc-800 bg-zinc-900/60">
                  Phase 3 &bull; Live Telemetry
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Real-Time Traffic Tracing &amp; Node Telemetry
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-6">
                Turn your static architecture diagram into a live observability HUD. Track real-time throughput, latency spikes, and execution breakpoints directly on each canvas node.
              </p>

              {/* Mock Live Telemetry Display */}
              <div className="rounded-xl border border-zinc-800/80 bg-[#060608] p-5 font-mono text-xs flex flex-col gap-3">
                <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-800/60 pb-2">
                  <span className="text-[11px] text-zinc-500 uppercase">Live Canvas Telemetry</span>
                  <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span>Real-time Stream</span>
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-zinc-300">API Gateway :46500</span>
                    <span className="text-white font-semibold">2,840 req/s &bull; 4ms latency</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-zinc-300">Auth Service :3001</span>
                    <span className="text-white font-semibold">920 req/s &bull; 12ms latency</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-zinc-900/40 border border-zinc-800/60">
                    <span className="text-zinc-300">PostgreSQL Primary</span>
                    <span className="text-amber-400 font-semibold">P99: 48ms &bull; 1 Breakpoint Logged</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-800/60 mt-6 flex items-center justify-between text-xs text-zinc-400">
              <span>Zero-Instrumentation OpenTelemetry</span>
              <span className="text-white font-mono font-semibold">Visual Breakpoint Debugging</span>
            </div>
          </div>
        </div>

        {/* Feature 3: Autonomous AI Workers */}
        <div className="w-full rounded-2xl border border-zinc-800 bg-[#09090c] p-6 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 mb-8 border-b border-zinc-800/80 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400 mb-2">
                <Bot className="w-3.5 h-3.5 text-zinc-300" />
                <span>TOOL 3 &bull; AUTONOMOUS AI SQUAD</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white">
                Autonomous AI Workers for Your Cloud
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
                Specialized autonomous agents that monitor, secure, and maintain your software ecosystem 24 hours a day, 7 days a week.
              </p>
            </div>
          </div>

          {/* Worker Tabs & Detail View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Worker Selector */}
            <div className="lg:col-span-5 flex flex-col gap-2">
              {AI_WORKERS.map((worker, index) => {
                const Icon = worker.icon;
                const isSelected = activeWorker === index;
                return (
                  <button
                    key={worker.id}
                    onClick={() => setActiveWorker(index)}
                    className={`text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? "bg-zinc-900/90 border-zinc-600 text-white"
                        : "bg-[#060608] border-zinc-800/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? "bg-white text-black border-white"
                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-white truncate">
                          {worker.title}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase">
                          {worker.badge}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400 block truncate mt-0.5">
                        {worker.role}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Selected Worker Deep Dive */}
            <div className="lg:col-span-7 p-6 sm:p-7 rounded-xl border border-zinc-800 bg-[#060608] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    {React.createElement(currentWorker.icon, {
                      className: "w-5 h-5 text-white",
                    })}
                    <h4 className="text-lg font-bold text-white">
                      {currentWorker.title}
                    </h4>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {currentWorker.outputBadge}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-6">
                  {currentWorker.description}
                </p>

                <div className="space-y-3 mb-6">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 block">
                    Core Capabilities
                  </span>
                  {currentWorker.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-xs sm:text-sm text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                      <span>{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400 font-mono">
                <span>Status: In Active Engineering</span>
                <span className="text-white">Private Beta Access in 2026</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
