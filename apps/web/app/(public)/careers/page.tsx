import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { Briefcase } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers | dezign2app",
  description:
    "Join the team at dezign2app building visual system architecture compilers and developer tooling.",
};

const openPositions = [
  {
    title: "Senior Full Stack Engineer (Next.js / Convex)",
    location: "Remote / Hybrid",
    type: "Full-Time",
  },
  {
    title: "AI / Compiler Engineer (Canvas & Code Gen)",
    location: "Remote",
    type: "Full-Time",
  },
  {
    title: "Product Designer (Design Systems & Canvas UI)",
    location: "Remote",
    type: "Full-Time",
  },
];

export default function CareersPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-12">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <Briefcase className="size-3.5 text-emerald-400" />
            <span>Join Our Team</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Build the Future of Application Architecture
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            We are looking for passionate engineers, designers, and compiler
            builders to redefine how developers architect software.
          </p>
        </div>

        {/* Positions List */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-white">Open Roles</h2>
          <div className="flex flex-col gap-3">
            {openPositions.map((pos, idx) => (
              <div
                key={idx}
                className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-bold text-white">
                    {pos.title}
                  </h3>
                  <div className="flex gap-3 text-xs text-zinc-400 font-mono">
                    <span>{pos.location}</span>
                    <span>•</span>
                    <span>{pos.type}</span>
                  </div>
                </div>
                <a
                  href={`mailto:founder@dezign2app.com?subject=Application for ${encodeURIComponent(pos.title)}`}
                  className="px-4 py-2 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors shrink-0"
                >
                  Apply Now →
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* General Application */}
        <div className="p-8 bg-[#0c0c10] border border-zinc-800 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-bold text-white">
              Don&apos;t see your role?
            </h3>
            <p className="text-xs text-zinc-400">
              Send your CV and portfolio directly to our founder.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-semibold rounded-xl hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
          >
            Email founder@dezign2app.com
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
