import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Acceptable Use Policy | dezign2app",
  description:
    "Acceptable Use Policy for dezign2app AI tool - Prohibited content, safety guidelines, and platform rules.",
};

export default function AcceptableUsePage() {
  const lastUpdated = "July 24, 2026";

  return (
    <div className="max-w-screen min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden font-sans">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-10">
        {/* Header Section */}
        <div className="flex flex-col gap-4 border-b border-zinc-900 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-mono w-fit font-medium">
            <span>Last Updated: {lastUpdated}</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white">
            Acceptable Use Policy (AUP)
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">
            This Acceptable Use Policy outlines the rules and prohibited
            behaviors when accessing or using the dezign2app platform and our
            AI-powered visual diagramming and system design generation tools.
          </p>
        </div>

        {/* Disclaimer Card */}
        <div className="p-4 md:p-6 bg-amber-950/30 border border-amber-900/50 rounded-2xl text-amber-200 text-xs md:text-sm flex flex-col gap-2">
          <div className="font-bold text-amber-300 flex items-center gap-2">
            <span>⚠️ Safety & AI Compliance Notice</span>
          </div>
          <p className="leading-relaxed">
            dezign2app is strictly designed for legal, professional system
            architecture design, software visualization, and developer
            productivity. We maintain a zero-tolerance policy for illegal,
            harmful, sexually explicit (NSFW), or abusive content generation.
          </p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-10 text-zinc-300 text-sm md:text-base leading-relaxed">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              1. Purpose and Scope
            </h2>
            <p>
              This Policy applies to all users, account holders, guests, and
              automated integrations using dezign2app. By accessing or using our
              services, you agree to comply strictly with this Policy. Failure
              to abide by these guidelines will result in immediate suspension
              or permanent termination of your account.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              2. Prohibited AI Content & Uses
            </h2>
            <p>
              When utilizing our AI visual generator, text-to-diagram engines,
              and code synthesis tools, you must <strong>NEVER</strong> input
              prompts or generate outputs containing:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">
                  NSFW & Sexually Explicit Content:
                </strong>{" "}
                Any pornographic, sexually suggestive, nude, or adult content of
                any kind, including NSFW chatbots, erotic images, or adult
                visual themes.
              </li>
              <li>
                <strong className="text-white">
                  Deepfakes & Face Manipulation:
                </strong>{" "}
                Any face-swapping, deepfake creation, non-consensual image
                manipulation, or impersonation of real living or deceased
                individuals.
              </li>
              <li>
                <strong className="text-white">
                  Malicious Code & Cyber Attacks:
                </strong>{" "}
                Generating spyware, malware, viruses, exploit payloads,
                ransomware, keyloggers, phishing templates, or tools designed to
                compromise computer systems or networks.
              </li>
              <li>
                <strong className="text-white">
                  Hate Speech & Harassment:
                </strong>{" "}
                Content promoting discrimination, hatred, violence, or
                degradation based on race, ethnicity, religion, disability, age,
                nationality, sexual orientation, or gender identity.
              </li>
              <li>
                <strong className="text-white">
                  Illegal Goods & Regulated Services:
                </strong>{" "}
                Promoting or facilitating illegal drugs, weapons, explosives,
                unauthorized pharmaceuticals, gambling, counterfeit goods, or
                multi-level marketing schemes.
              </li>
              <li>
                <strong className="text-white">
                  Misinformation & Fraud:
                </strong>{" "}
                Generating misleading financial advice, deceptive marketing
                materials, political disinformation campaigns, or fraudulent
                identity documentation.
              </li>
              <li>
                <strong className="text-white">
                  Intellectual Property Infringement:
                </strong>{" "}
                Uploading or generating materials that violate third-party
                copyrights, registered trademarks, patents, or trade secrets
                without authorization.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              3. Platform Abuse & Technical Interference
            </h2>
            <p>
              Users must refrain from technical abuse, automated exploitation,
              or disrupting our platform infrastructure. Prohibited actions
              include:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Executing prompt injection, jailbreaking, or intentionally
                circumventing system safety filters and content moderation
                guardrails.
              </li>
              <li>
                Scraping, crawling, or automated data extraction from dezign2app
                without explicit written authorization.
              </li>
              <li>
                Attempting to reverse engineer, decompile, or steal source code,
                model weights, or proprietary visual generation algorithms.
              </li>
              <li>
                Bypassing subscription tiers, user concurrency limits, or rate
                limits via unauthorized scripts or multiple accounts.
              </li>
              <li>
                Reselling raw API endpoints or subleasing account credentials to
                unauthorized third parties.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              4. High-Risk Applications Exclusions
            </h2>
            <p>
              dezign2app is a developer diagramming and design workspace. It is{" "}
              <strong>NOT</strong> certified for use in high-risk autonomous
              operational environments, including:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Direct medical diagnostics, patient care systems, or
                life-support operations.
              </li>
              <li>
                Critical infrastructure control (e.g., nuclear power, air
                traffic control, emergency response networks).
              </li>
              <li>
                Real-time automated financial trading or legal compliance
                decisioning without human review.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              5. Content Moderation & Enforcement
            </h2>
            <p>
              We monitor platform usage and leverage automated moderation tools
              to detect violations. If a violation of this Policy is detected:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                We reserve the right to block offending prompts and purge
                non-compliant workspace projects immediately.
              </li>
              <li>
                We may issue warnings, restrict account features, or permanently
                terminate subscription access without refund.
              </li>
              <li>
                For serious severe violations (e.g., child exploitation, terror
                propaganda, cyber attacks), we will report details to law
                enforcement authorities.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              6. Reporting Violations & Contact Us
            </h2>
            <p>
              If you discover content or behavior on dezign2app that violates
              this Acceptable Use Policy, please report it immediately to our
              compliance team:
            </p>
            <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl text-zinc-200 font-medium flex flex-col gap-1">
              <div>
                Email:{" "}
                <a
                  href="mailto:founder@dezign2app.com"
                  className="text-white font-bold hover:underline"
                >
                  founder@dezign2app.com
                </a>
              </div>
              <div className="text-xs text-zinc-500">
                Subject Line: "AUP / Moderation Violation Report"
              </div>
            </div>
          </section>
        </div>

        {/* Navigation back */}
        <div className="border-t border-zinc-900 pt-6 mt-6 flex justify-between items-center">
          <Link
            href="/"
            className="text-xs font-semibold text-white hover:underline flex items-center gap-1"
          >
            ← Back to Home
          </Link>
          <div className="flex gap-4">
            <Link
              href="/privacy"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Privacy Policy →
            </Link>
            <Link
              href="/terms"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Terms of Service →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
