"use client";

import React from "react";
import {
  Workflow,
  Network,
  Bot,
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  Zap,
  PlayCircle,
  ExternalLink,
} from "lucide-react";
import type { CanvasMode, TrafficIntensity } from "../types";

interface HeroCanvasHeaderProps {
  activeMode: CanvasMode;
  setActiveMode: (mode: CanvasMode) => void;
  trafficIntensity: TrafficIntensity;
  setTrafficIntensity: React.Dispatch<React.SetStateAction<TrafficIntensity>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playbackSpeed: 1 | 2;
  setPlaybackSpeed: React.Dispatch<React.SetStateAction<1 | 2>>;
  setWorkerStep: React.Dispatch<React.SetStateAction<number>>;
  securityStep?: number;
  setSecurityStep?: React.Dispatch<React.SetStateAction<number>>;
  totalIngress: number;
  onModeChange: () => void;
}

export const HeroCanvasHeader: React.FC<HeroCanvasHeaderProps> = ({
  activeMode,
  setActiveMode,
  trafficIntensity,
  setTrafficIntensity,
  isPlaying,
  setIsPlaying,
  playbackSpeed,
  setPlaybackSpeed,
  setWorkerStep,
  securityStep = 0,
  setSecurityStep,
  totalIngress,
  onModeChange,
}) => {
  const handleSelectMode = (mode: CanvasMode) => {
    setActiveMode(mode);
    onModeChange();
  };

  return (
    <div className="flex flex-wrap items-center justify-between border-b border-zinc-800/80 bg-[#101014] px-4 py-2.5 gap-2">
      <div className="flex items-center gap-3">
        {/* Mac-style Window Controls */}
        <div className="flex items-center gap-1.5 mr-1">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700 inline-block" />
        </div>
        <span className="text-xs font-mono text-zinc-400 font-semibold hidden sm:inline-block">
          dezign2app-studio
        </span>

        <div className="h-4 w-[1px] bg-zinc-800 hidden sm:block" />

        {/* Studio View Switcher Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-[#09090d] p-1 rounded-lg border border-zinc-800 flex-wrap">
            {/* Tab 1: App Architecture */}
            <button
              onClick={() => handleSelectMode("architecture")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                activeMode === "architecture"
                  ? "bg-zinc-800 text-white shadow-xs border border-zinc-700/80"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
            >
              <Workflow className="w-3.5 h-3.5 text-emerald-400" />
              <span>Design → Code</span>
            </button>

            {/* Tab 2: Topology & Replicas */}
            <button
              onClick={() => handleSelectMode("infrastructure")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                activeMode === "infrastructure"
                  ? "bg-zinc-800 text-white shadow-xs border border-zinc-700/80"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
              }`}
              title="Inspect load balancing, read replicas & traffic flow"
            >
              <Network className="w-3.5 h-3.5 text-zinc-400" />
              <span>Topology &amp; Replicas</span>
            </button>

            {/* Tab 3: Video Tutorial */}
            <button
              onClick={() => handleSelectMode("video")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                activeMode === "video"
                  ? "bg-emerald-950/70 text-emerald-200 shadow-xs border border-emerald-700/70"
                  : "text-zinc-300 hover:text-white hover:bg-zinc-800/40"
              }`}
              title="Watch the Dezign2App video walkthrough"
            >
              <PlayCircle
                className={`w-3.5 h-3.5 ${
                  activeMode === "video" ? "text-emerald-400" : "text-emerald-400/80"
                }`}
              />
              <span>Watch Walkthrough</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Toolbar Status & Interactive Controls */}
      <div className="flex items-center gap-2.5">
        {activeMode === "ethical-hacker" ? (
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#130b10] border border-rose-900/60 text-[11px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  securityStep === 4 ? "bg-emerald-400" : "bg-rose-500 animate-ping"
                }`}
              />
              <span className="text-zinc-400 hidden sm:inline">Status:</span>
              <span className={`font-bold ${securityStep === 4 ? "text-emerald-300" : "text-rose-300"}`}>
                {securityStep === 4 ? "Exploit Blocked (403)" : "Fuzzing Active"}
              </span>
            </div>

            {/* Play / Pause Toggle Button */}
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
              title={isPlaying ? "Pause Pentest" : "Resume Pentest"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="hidden sm:inline">{isPlaying ? "Pause" : "Play"}</span>
            </button>

            {/* Speed toggle */}
            <button
              onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : 1))}
              className="px-2 py-1 rounded text-xs font-mono text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
              title="Toggle Speed"
            >
              {playbackSpeed}x
            </button>

            {/* Reset / Replay Ticket Button */}
            <button
              onClick={() => setSecurityStep && setSecurityStep(0)}
              className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors"
              title="Restart Vulnerability Pentest"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeMode === "ai-worker" ? (
          <div className="flex items-center gap-1.5">
            {/* Play / Pause Toggle Button */}
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors"
              title={isPlaying ? "Pause AI Worker" : "Resume AI Worker"}
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className="hidden sm:inline">{isPlaying ? "Pause" : "Play"}</span>
            </button>

            {/* Speed toggle */}
            <button
              onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : 1))}
              className="px-2 py-1 rounded text-xs font-mono text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 transition-colors"
              title="Toggle Speed"
            >
              {playbackSpeed}x
            </button>

            {/* Reset / Replay Ticket Button */}
            <button
              onClick={() => setWorkerStep(0)}
              className="p-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors"
              title="Restart Ticket Resolution"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : activeMode === "infrastructure" ? (
          <>
            {/* Realtime Ingress Counter */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#09090d] border border-zinc-800 text-[11px] font-mono">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              <span className="text-zinc-400 hidden sm:inline">Live Ingress:</span>
              <span className="text-zinc-200 font-bold">
                {totalIngress.toLocaleString()} req/s
              </span>
            </div>

            {/* Traffic Surge Simulation Toggle */}
            <button
              onClick={() =>
                setTrafficIntensity((prev) => (prev === "normal" ? "burst" : "normal"))
              }
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all ${
                trafficIntensity === "burst"
                  ? "bg-zinc-800 text-white border border-zinc-600 shadow-xs"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800"
              }`}
              title="Simulate traffic surge across load balancers and replicas"
            >
              <Zap
                className={`w-3.5 h-3.5 ${
                  trafficIntensity === "burst"
                    ? "text-zinc-200 fill-zinc-200"
                    : "text-zinc-400"
                }`}
              />
              <span className="hidden sm:inline">
                {trafficIntensity === "burst" ? "Spike Active (2.8x)" : "Simulate Spike"}
              </span>
              <span className="sm:hidden">
                {trafficIntensity === "burst" ? "2.8x" : "Spike"}
              </span>
            </button>
          </>
        ) : activeMode === "video" ? (
          <a
            href="https://youtu.be/4PHK9rqgrmE?t=26"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-mono transition-colors"
          >
            <span>Open on YouTube</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
        ) : (
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Full-Stack Graph · 8 Services</span>
          </div>
        )}
      </div>
    </div>
  );
};
