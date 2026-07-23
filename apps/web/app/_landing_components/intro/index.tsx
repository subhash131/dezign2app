"use client";
import React, { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import {
  ArrowRight,
  FileText,
  LayoutGrid,
  Database,
  Terminal,
  Activity,
  Server,
  Cpu,
} from "lucide-react";

// Two typefaces doing distinct jobs: a geometric display face for the
// headline, and a mono face for anything that reads like the tool's own
// output (status tags, file labels, the badge). This is deliberate — the
// product compiles specs into code, so its UI should occasionally *look*
// like the artifacts it produces.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

// Palette (named, not decorative): ink for text, violet for "input/spec",
// then a semantic three-color pipeline — blue (compiling), amber
// (verifying), emerald (live) — so color encodes pipeline stage rather
// than just alternating for visual interest.
const COLOR = {
  violet: "#5B4FE0",
  violetDeep: "#3F35B8",
  blue: "#2563EB",
  amber: "#B45309",
  emerald: "#0F9D5C",
  ink: "#0B0E14",
};

// ── Diagram geometry ──────────────────────────────────────────────
// viewBox is 1000 x 460. Every node lives at one of these y-values, and
// every card is absolutely positioned at that *same* y-value (as a % of
// the container height) — one source of truth, so the paths and the
// cards can never drift apart the way flex-distributed columns do.
const DIAGRAM_H = 460;
const DIAGRAM_W = 1000;
const NODE_Y = [90, 230, 370] as const;
const LEFT_X = 260; // where left paths terminate / left cards begin
const RIGHT_X = 740; // where right paths terminate / right cards begin
const HUB = { x: 500, y: 230 };

const leftNodes = [
  {
    id: "prd",
    title: "PRD & Specs",
    tag: "spec.prd",
    icon: FileText,
    y: NODE_Y[0],
  },
  {
    id: "topology",
    title: "System Topology",
    tag: "graph.topo",
    icon: LayoutGrid,
    y: NODE_Y[1],
  },
  {
    id: "schema",
    title: "Data Schemas",
    tag: "schema.sql",
    icon: Database,
    y: NODE_Y[2],
  },
];

const rightNodes = [
  {
    id: "code",
    title: "Full-Stack Code",
    status: "BUILD",
    note: "Agents write the app, APIs & tests",
    icon: Terminal,
    color: COLOR.blue,
    y: NODE_Y[0],
  },
  {
    id: "test",
    title: "Load & Stress Tests",
    status: "VERIFY",
    note: "Simulated traffic before it ships",
    icon: Activity,
    color: COLOR.amber,
    y: NODE_Y[1],
  },
  {
    id: "deploy",
    title: "K8s & Cloud",
    status: "LIVE",
    note: "Zero-touch hosting on your cluster",
    icon: Server,
    color: COLOR.emerald,
    y: NODE_Y[2],
  },
];

// Mirrored bezier families — left and right are now the same curve
// shape reflected around the hub, instead of two unrelated path sets.
const leftPath = (y: number) =>
  `M ${LEFT_X} ${y} C 380 ${y}, 420 ${HUB.y}, ${HUB.x} ${HUB.y}`;
const rightPath = (y: number) =>
  `M ${HUB.x} ${HUB.y} C 620 ${HUB.y}, 660 ${y}, ${RIGHT_X} ${y}`;

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

export const Intro = () => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const flowCircle = (path: string, color: string, delay: number) =>
    !reduceMotion && (
      <motion.circle
        r="3.5"
        fill={color}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay }}
        style={{ offsetPath: `path('${path}')` }}
      />
    );

  return (
    <div
      className={`${display.variable} ${mono.variable} w-full flex flex-col items-center bg-[#F6F7F9] text-[#0B0E14] overflow-x-hidden pb-24`}
    >
      <section className="w-full flex flex-col items-center text-center px-4 max-w-6xl relative pt-12">
        {/* Ambient glow — quiet, single source, no competing gradients */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 15%, rgba(91,79,224,0.10) 0%, rgba(246,247,249,1) 70%)",
          }}
        />

        {/* Status badge — reads like a build tag, not a marketing sticker */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-white border border-[#E4E7EC] shadow-sm mb-7"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: COLOR.emerald }}
          />
          <span className="text-[11px] font-medium tracking-tight text-[#0B0E14]">
            dezign2app
          </span>
          <span className="text-[11px] text-[#9AA1AC]">/</span>
          <span className="text-[11px] text-[#5B6472]">autonomous_sdlc.run()</span>
        </motion.div>

        {/* Headline — benefit-first, plain language */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ fontFamily: "var(--font-display)" }}
          className="relative z-10 text-4xl sm:text-5xl lg:text-[3.4rem] font-medium tracking-tight leading-[1.08] text-[#0B0E14] max-w-3xl"
        >
          Describe the system.
          <br />
          Ship the product.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 text-sm text-[#5B6472] leading-relaxed max-w-lg font-normal mt-5"
        >
          Write requirements in plain English. Autonomous agents compile
          production code, load-test it under simulated traffic, and deploy
          it to Kubernetes — no engineer in the loop.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative z-10 mt-7 mb-8"
        >
          <Link
            href="/sign-up"
            className="bg-[#0B0E14] hover:bg-[#1A1F2B] text-white text-sm font-medium px-6 py-3 rounded-lg transition-all shadow-sm hover:shadow-md flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B4FE0]"
          >
            Get started <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {/* ── PIPELINE DIAGRAM ─────────────────────────────────────── */}
        <div className="w-full max-w-5xl h-[460px] relative mt-4">
          {/* Dot-grid — quieter than a line grid, reads as "graph paper"
              without competing with the path lines drawn over it. */}
          <div
            className="absolute inset-0 pointer-events-none rounded-3xl"
            style={{
              backgroundImage:
                "radial-gradient(rgba(91,79,224,0.16) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage:
                "radial-gradient(ellipse at center, black 40%, transparent 82%)",
            }}
          />

          {/* Section labels sit independently of the node columns below —
              they no longer share a flex column with the cards, so they
              can't push card positions off the paths. */}
          <div
            className="absolute left-[4%] top-1 text-[10px] font-medium text-[#5B6472] uppercase tracking-widest z-20"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            01 — system design
          </div>
          <div
            className="absolute right-[4%] top-1 text-[10px] font-medium text-[#5B6472] uppercase tracking-widest z-20"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            02 — 03 · pipeline
          </div>

          <svg
            className="w-full h-full absolute inset-0 pointer-events-none z-10"
            viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`}
            preserveAspectRatio="none"
          >
            {leftNodes.map((node, index) => {
              const d = leftPath(node.y);
              const isHovered = hoveredNode === node.id;
              return (
                <g key={`left-${node.id}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isHovered ? COLOR.violet : "#DCD9F7"}
                    strokeWidth={isHovered ? 2 : 1.25}
                    className="transition-all duration-300"
                  />
                  {/* connector dot marks exactly where the card meets the line */}
                  <circle cx={LEFT_X} cy={node.y} r={3} fill="#fff" stroke={COLOR.violet} strokeWidth={1.5} />
                  {flowCircle(d, COLOR.violet, index * 0.4)}
                </g>
              );
            })}

            {rightNodes.map((node, index) => {
              const d = rightPath(node.y);
              const isHovered = hoveredNode === node.id;
              return (
                <g key={`right-${node.id}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isHovered ? node.color : `${node.color}33`}
                    strokeWidth={isHovered ? 2 : 1.25}
                    className="transition-all duration-300"
                  />
                  <circle cx={RIGHT_X} cy={node.y} r={3} fill="#fff" stroke={node.color} strokeWidth={1.5} />
                  {flowCircle(d, node.color, 1.2 + index * 0.4)}
                </g>
              );
            })}

            {/* hub anchor point, so the paths visibly resolve into the chip */}
            <circle cx={HUB.x} cy={HUB.y} r={4} fill={COLOR.violet} />
          </svg>

          {/* Compiler core — a chip, not a mascot */}
          <div
            className="absolute z-20 flex flex-col items-center"
            style={{ left: pct(HUB.x, DIAGRAM_W), top: pct(HUB.y, DIAGRAM_H), transform: "translate(-50%, -50%)" }}
          >
            <div className="relative flex items-center justify-center">
              {!reduceMotion && (
                <motion.div
                  animate={{ scale: [1, 1.12, 1], opacity: [0.15, 0.35, 0.15] }}
                  transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
                  className="absolute w-28 h-28 rounded-full"
                  style={{ backgroundColor: COLOR.violet, filter: "blur(20px)" }}
                />
              )}
              <div
                className="w-[86px] h-[86px] rounded-2xl flex items-center justify-center relative cursor-pointer hover:scale-105 transition-transform"
                style={{
                  background: `linear-gradient(145deg, ${COLOR.violet}, ${COLOR.violetDeep})`,
                }}
              >
                <div className="w-[76px] h-[76px] rounded-xl bg-[#0B0E14] flex flex-col items-center justify-center border border-white/10 text-white">
                  <Cpu className="w-5 h-5 text-[#B9B3F5]" />
                  <span
                    className="text-[8px] font-medium tracking-widest text-[#B9B3F5] mt-1"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    COMPILER
                  </span>
                </div>
              </div>
            </div>
            <span
              className="mt-2.5 text-[10px] text-[#5B6472] px-2.5 py-0.5 whitespace-nowrap"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              core.compile(spec)
            </span>
          </div>

          {/* Left column — each card's vertical center is pinned to the
              exact same y used by its connecting path via `top: pct(node.y)`.
              No flex distribution, no drift. */}
          <div className="absolute z-20" style={{ left: "4%", width: "22%", top: 0, bottom: 0 }}>
            {leftNodes.map((node) => {
              const Icon = node.icon;
              const isHovered = hoveredNode === node.id;
              return (
                <div
                  key={node.id}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="absolute left-0 w-full p-3 rounded-xl bg-white border shadow-sm flex items-center gap-3 cursor-pointer transition-all duration-200"
                  style={{
                    top: pct(node.y, DIAGRAM_H),
                    transform: `translateY(-50%) translateX(${isHovered ? "3px" : "0"})`,
                    borderColor: isHovered ? "#C9C2F5" : "#E4E7EC",
                    borderLeft: `2.5px solid ${COLOR.violet}`,
                    boxShadow: isHovered
                      ? "0 8px 20px -8px rgba(91,79,224,0.25)"
                      : "0 1px 2px rgba(11,14,20,0.04)",
                  }}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#F1EFFC] flex items-center justify-center text-[#5B4FE0] shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-left overflow-hidden">
                    <div className="text-xs font-medium text-[#0B0E14] truncate">
                      {node.title}
                    </div>
                    <div
                      className="text-[10px] text-[#9AA1AC] truncate"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {node.tag}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right column — same pinning strategy, mirrored. */}
          <div className="absolute z-20" style={{ right: "4%", width: "24%", top: 0, bottom: 0 }}>
            {rightNodes.map((node) => {
              const Icon = node.icon;
              const isHovered = hoveredNode === node.id;
              return (
                <div
                  key={node.id}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="absolute left-0 w-full p-3 rounded-xl bg-white border shadow-sm flex items-center justify-between gap-3 cursor-pointer transition-all duration-200"
                  style={{
                    top: pct(node.y, DIAGRAM_H),
                    transform: `translateY(-50%) translateX(${isHovered ? "-3px" : "0"})`,
                    borderColor: "#E4E7EC",
                    borderRight: `2.5px solid ${node.color}`,
                    boxShadow: isHovered
                      ? `0 8px 20px -8px ${node.color}40`
                      : "0 1px 2px rgba(11,14,20,0.04)",
                  }}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${node.color}18`, color: node.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="text-left overflow-hidden">
                      <div className="text-xs font-medium text-[#0B0E14] truncate">
                        {node.title}
                      </div>
                      <div className="text-[10px] text-[#9AA1AC] truncate">
                        {node.note}
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: node.color,
                      backgroundColor: `${node.color}14`,
                    }}
                  >
                    {node.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── THREE-STAGE SUMMARY ──────────────────────────────────── */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6 mt-10 text-left relative z-20">
          {[
            {
              n: "01",
              title: "System design",
              copy: "Describe requirements and topology in plain English or a diagram — no boilerplate to write.",
            },
            {
              n: "02",
              title: "Autonomous compile",
              copy: "Agents translate the spec into production code, API contracts, and test suites.",
            },
            {
              n: "03",
              title: "Test & deploy",
              copy: "Load-tested against simulated traffic, then shipped to Kubernetes with zero manual ops.",
            },
          ].map((stage) => (
            <div
              key={stage.n}
              className="flex flex-col gap-2 p-5 rounded-xl bg-white border border-[#E4E7EC]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] text-[#9AA1AC]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {stage.n}
                </span>
                <span className="text-xs font-medium text-[#0B0E14]">
                  {stage.title}
                </span>
              </div>
              <p className="text-[12px] text-[#5B6472] leading-relaxed">
                {stage.copy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Intro;