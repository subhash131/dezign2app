import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import {
  HelpCircle,
  Mail,
  LifeBuoy,
  BookOpen,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Customer Support | dezign2app",
  description:
    "Get in touch with customer support at dezign2app. We are here to help you turn system designs into code.",
};

export default function SupportPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-5xl px-6 py-12 md:py-20 flex flex-col gap-12">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <LifeBuoy className="size-3.5 text-emerald-400" />
            <span>Support &amp; Help Center</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            How can we help you today?
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">
            Have questions about monorepo compilation, Desktop Studio, canvas
            workflows, or billing? Our engineering team is ready to assist.
          </p>
        </div>

        {/* Reach Support Direct Card */}
        <div className="p-8 md:p-10 bg-[#0c0c10] border border-zinc-800 text-white rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col gap-2 max-w-lg">
            <div className="inline-flex items-center gap-2 text-xs text-emerald-400 font-mono uppercase tracking-wider">
              <Mail className="size-4" />
              <span>Direct Founder &amp; Support Line</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold">
              Email Our Team Directly
            </h2>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
              We respond to all technical, workspace, and account queries within
              24 hours.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-6 py-3 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 transition-colors flex items-center gap-2 shrink-0"
          >
            <span>founder@dezign2app.com</span>
            <ArrowRight className="size-4" />
          </a>
        </div>

        {/* Support Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400">
              <BookOpen className="size-5" />
            </div>
            <h3 className="text-base font-bold text-white">Documentation</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Explore detailed guides, API specifications, and architecture
              compiler walkthroughs.
            </p>
            <a
              href="https://docs.dezign2app.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors mt-2"
            >
              Explore Docs →
            </a>
          </div>

          <div className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
              <HelpCircle className="size-5" />
            </div>
            <h3 className="text-base font-bold text-white">Contact Sales</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Looking for organization workspaces, dedicated deployment options,
              or custom stack support?
            </p>
            <Link
              href="/contact"
              className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors mt-2"
            >
              Contact Sales →
            </Link>
          </div>

          <div className="p-6 border border-zinc-800 rounded-2xl bg-[#0a0a0d] flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="text-base font-bold text-white">
              Privacy &amp; Terms
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Read about our commitment to user data protection, uptime, and
              legal compliance.
            </p>
            <div className="flex flex-wrap gap-4 mt-2">
              <Link
                href="/privacy"
                className="text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/acceptable-use"
                className="text-xs font-semibold text-zinc-300 hover:text-white transition-colors"
              >
                Acceptable Use
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
