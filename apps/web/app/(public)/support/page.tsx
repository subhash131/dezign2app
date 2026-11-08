import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import {
  HelpCircle,
  Mail,
  MessageSquare,
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
    <div className="max-w-screen min-h-screen w-full bg-white text-black flex flex-col items-center overflow-x-hidden">
      <Header />

      <main className="w-full max-w-5xl px-6 py-12 md:py-20 flex flex-col gap-12">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black text-white text-xs font-semibold">
            <LifeBuoy className="size-3.5" />
            <span>Support & Help Center</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            How can we help you today?
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed max-w-2xl">
            Have questions about system architecture generation, canvas
            workflows, or custom billing? Our engineering team is standing by to
            assist.
          </p>
        </div>

        {/* Reach Support Direct Card */}
        <div className="p-8 md:p-10 bg-gray-900 text-white rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl">
          <div className="flex flex-col gap-2 max-w-lg">
            <div className="inline-flex items-center gap-2 text-xs text-amber-400 font-semibold uppercase tracking-wider">
              <Mail className="size-4" />
              <span>Direct Founder & Support Line</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold">
              Email Our Team Directly
            </h2>
            <p className="text-xs md:text-sm text-gray-300 leading-relaxed">
              We respond to all technical, workspace, and account queries within
              24 hours.
            </p>
          </div>
          <a
            href="mailto:founder@dezign2app.com"
            className="px-6 py-3 bg-white text-black text-xs font-bold rounded-xl hover:bg-gray-100 transition-all flex items-center gap-2 shrink-0 shadow-md"
          >
            <span>founder@dezign2app.com</span>
            <ArrowRight className="size-4" />
          </a>
        </div>

        {/* Support Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 border border-gray-200 rounded-2xl bg-white flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-gray-100 flex items-center justify-center text-black font-bold">
              <BookOpen className="size-5" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Documentation</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Explore detailed guides, API specifications, and architecture
              generator walk-throughs.
            </p>
            <Link
              href="/docs"
              className="text-xs font-semibold text-black hover:underline mt-2"
            >
              Explore Docs →
            </Link>
          </div>

          <div className="p-6 border border-gray-200 rounded-2xl bg-white flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-gray-100 flex items-center justify-center text-black font-bold">
              <HelpCircle className="size-5" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Contact Sales</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Looking for custom API limits, dedicated deployment options, or enterprise
              SSO integrations?
            </p>
            <Link
              href="/contact"
              className="text-xs font-semibold text-black hover:underline mt-2"
            >
              Contact Sales →
            </Link>
          </div>

          <div className="p-6 border border-gray-200 rounded-2xl bg-white flex flex-col gap-3">
            <div className="size-10 rounded-xl bg-gray-100 flex items-center justify-center text-black font-bold">
              <ShieldCheck className="size-5" />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              Privacy & Terms
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Read about our commitment to user data protection, uptime SLAs,
              and legal compliance.
            </p>
            <div className="flex flex-wrap gap-4 mt-2">
              <Link
                href="/privacy"
                className="text-xs font-semibold text-black hover:underline"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-xs font-semibold text-black hover:underline"
              >
                Terms
              </Link>
              <Link
                href="/acceptable-use"
                className="text-xs font-semibold text-black hover:underline"
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
