import React from "react";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";
import { Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us | dezign2app",
  description:
    "Get in touch with the dezign2app team for sales, support, and business partnerships.",
};

export default function ContactPage() {
  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-10">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-mono">
            <Mail className="size-3.5 text-emerald-400" />
            <span>Contact dezign2app</span>
          </div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white"
          >
            Let&apos;s talk about your next project
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-xl">
            Whether you have a technical inquiry, feedback, or custom enterprise
            requirements, we&apos;d love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
          {/* Contact Details Card */}
          <div className="p-8 bg-[#0a0a0d] border border-zinc-800 rounded-2xl flex flex-col gap-6">
            <h2 className="text-xl font-bold text-white">Direct Contact</h2>
            <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">
              We respond promptly to all developer and enterprise inquiries.
            </p>

            <div className="flex flex-col gap-4 border-t border-zinc-800 pt-6 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 font-mono">
                  Support &amp; General Inquiries:
                </span>
                <a
                  href="mailto:founder@dezign2app.com"
                  className="font-bold text-white hover:text-emerald-400 transition-colors text-base"
                >
                  founder@dezign2app.com
                </a>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 font-mono">
                  Response Time:
                </span>
                <span className="font-semibold text-zinc-300">
                  Within 24 Hours
                </span>
              </div>
            </div>
          </div>

          {/* Contact Info Card */}
          <div className="p-8 bg-[#0c0c10] border border-zinc-800 text-white rounded-2xl flex flex-col justify-between gap-6">
            <div className="flex flex-col gap-4">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                dezign2app HQ
              </span>
              <h2 className="text-2xl font-bold">
                Build visual architectures that compile cleanly
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Reach out for custom stack templates, organization workspaces, or
                Desktop Studio onboarding help.
              </p>
            </div>

            <div className="border-t border-zinc-800 pt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Need immediate help?
              </span>
              <a
                href="mailto:founder@dezign2app.com"
                className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors flex items-center gap-1"
              >
                Send Email →
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
