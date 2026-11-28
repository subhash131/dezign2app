"use client";

import React from "react";
import { Move, Bot, ShieldAlert, ShieldCheck } from "lucide-react";
import type { CanvasMode, InfraCircle } from "../types";
import type { TicketDef, AgentStep } from "../aiWorkerData";
import type { SecurityVectorDef, SecurityStep } from "../ethicalHackerData";

interface HeroCanvasFooterProps {
  activeMode: CanvasMode;
  activeInfraNode: InfraCircle | null;
  selectedNode: string | null;
  currentStep: AgentStep;
  workerStep: number;
  activeTicket: TicketDef;
  securityStep?: number;
  activeSecurityStep?: SecurityStep | null;
  activeVector?: SecurityVectorDef | null;
  isRealtimeEdgeVisible: boolean;
}

export const HeroCanvasFooter: React.FC<HeroCanvasFooterProps> = ({
  activeMode,
  activeInfraNode,
  selectedNode,
  currentStep,
  workerStep,
  activeTicket,
  securityStep = 0,
  activeSecurityStep,
  activeVector,
  isRealtimeEdgeVisible,
}) => {
  return (
    <div className="border-t border-zinc-800/80 bg-[#101014] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
      <div className="flex items-center gap-3 text-zinc-400">
        {activeMode === "video" ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-zinc-300">
              Walkthrough Tutorial · Starts at 0:26 (Switch back to Design → Code anytime)
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px]">
            <Move className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-300">Drag to Pan</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Ctrl + Wheel to Zoom</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-300">
              {activeInfraNode
                ? `Inspecting: ${activeInfraNode.label} (${activeInfraNode.details.engine})`
                : selectedNode
                ? `Selected: ${selectedNode} (Click to toggle)`
                : activeMode === "ethical-hacker" && activeSecurityStep
                ? `Ethical Hacker: ${activeSecurityStep.phase} · ${activeSecurityStep.subAction}`
                : activeMode === "ai-worker"
                ? `AI Worker: ${currentStep.subAction} · ${currentStep.title}`
                : activeMode === "infrastructure"
                ? "Hover any Load Balancer or Replica circle for flying card telemetry"
                : "Click page-ref or /chat to show SSE stream"}
            </span>
          </div>
        )}
      </div>

      {activeMode === "ethical-hacker" && activeVector && activeSecurityStep ? (
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 text-rose-300">
            {securityStep === 4 ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>
              Attack:{" "}
              <strong className={securityStep === 4 ? "text-emerald-400" : "text-rose-300"}>
                {activeVector.cwe} ({activeVector.displayNumber})
              </strong>
            </span>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            CVSS:{" "}
            <strong className={securityStep === 4 ? "text-emerald-400" : "text-rose-400"}>
              {activeVector.cvssScore}
            </strong>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            Status:{" "}
            <strong className={securityStep === 4 ? "text-emerald-400" : "text-rose-300"}>
              {securityStep === 4 ? "Mitigated (403 Forbidden)" : activeSecurityStep.phase}
            </strong>
          </span>
          <span className="text-zinc-700 hidden md:inline">|</span>
          <span className="hidden md:inline">
            Endpoint: <strong className="text-zinc-300">{activeVector.endpointPath}</strong>
          </span>
        </div>
      ) : activeMode === "ai-worker" ? (
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Status:{" "}
              <strong
                className={
                  workerStep === 5 ? "text-emerald-400" : "text-cyan-300"
                }
              >
                {currentStep.title}
              </strong>
            </span>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            Target: <strong className="text-cyan-300">{activeTicket.targetNodeTitle}</strong>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            PR:{" "}
            <strong className="text-emerald-400">
              {activeTicket.prNumber}{" "}
              {workerStep === 5 ? "Auto-Merged" : "Checks Passing"}
            </strong>
          </span>
          <span className="text-zinc-700 hidden md:inline">|</span>
          <span className="hidden md:inline">
            Branch: <strong className="text-zinc-300">{activeTicket.branchName}</strong>
          </span>
        </div>
      ) : isRealtimeEdgeVisible ? (
        <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-semibold bg-emerald-950/70 border border-emerald-500/50 px-2.5 py-0.5 rounded shadow-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          <span>SSE Return Loop: Active (conversations page ref ➔ /chat)</span>
        </div>
      ) : activeMode === "infrastructure" ? (
        <div className="flex items-center gap-3 text-[11px] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            <span className="text-zinc-300">DB: 1 Primary + 2 Read Replicas</span>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            WAL Lag: <strong className="text-zinc-200">0.2ms</strong>
          </span>
          <span className="text-zinc-700 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            Query Balancing: <strong className="text-zinc-200">PgBouncer (Read/Write Split)</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
};
