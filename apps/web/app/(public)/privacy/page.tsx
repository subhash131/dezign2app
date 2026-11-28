import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | dezign2app",
  description:
    "Privacy Policy for dezign2app - Learn how we collect, use, process AI inputs, and protect your data.",
};

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">
            At dezign2app, we respect your privacy and are committed to
            safeguarding your personal data and intellectual property. This
            Privacy Policy details how we collect, use, process, and protect
            information when you interact with our website, application, and AI
            design tools.
          </p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-10 text-zinc-300 text-sm md:text-base leading-relaxed">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              1. Information We Collect
            </h2>
            <p>
              We collect information necessary to provide and continuously
              improve our visual diagramming and system design generation
              platform. The types of data we collect include:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">Account Credentials:</strong>{" "}
                Name, email address, profile picture, authentication tokens, and
                account preferences when registering via email or single sign-on
                (SSO) providers.
              </li>
              <li>
                <strong className="text-white">
                  Project & Prompt Inputs:
                </strong>{" "}
                System design requirements, text prompts, visual specs, node
                configurations, and workspace canvas data generated during
                design sessions.
              </li>
              <li>
                <strong className="text-white">
                  Payment & Transaction Data:
                </strong>{" "}
                Subscription tier, order histories, billing address, and
                transaction metadata.{" "}
                <em>
                  Note: All payment processing and financial data are securely
                  managed by our Merchant of Record, Creem.io. We do not store
                  raw credit card numbers on our servers.
                </em>
              </li>
              <li>
                <strong className="text-white">
                  Technical & Usage Telemetry:
                </strong>{" "}
                IP address, browser type, device descriptors, operating system,
                session duration, and feature performance metrics.
              </li>
              <li>
                <strong className="text-white">
                  Cookies & Local Storage:
                </strong>{" "}
                Essential session cookies and local storage tokens to preserve
                user preferences and workspace states.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              2. How We Use Your Information
            </h2>
            <p>
              We process personal data only for legitimate business and
              operational purposes, including:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Generating and rendering architectural diagrams, visual
                workflows, and code artifacts requested by users.
              </li>
              <li>
                Authenticating account access and securing user workspaces.
              </li>
              <li>
                Managing billing subscriptions, processing order renewals, and
                issuing transactional notifications via Creem.io.
              </li>
              <li>
                Monitoring platform stability, performance optimizations, and
                preventing unauthorized access or API abuse.
              </li>
              <li>
                Providing responsive customer support and addressing technical
                inquiries within 3 business days.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              3. AI Model Data Privacy & Processing
            </h2>
            <p>
              dezign2app utilizes state-of-the-art Artificial Intelligence (AI)
              foundation models to transform user descriptions into system
              diagrams and functional application blueprints. Regarding AI data
              handling:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">API Processing:</strong> User
                prompts and architectural specifications are transmitted
                securely via API connections to LLM providers (such as OpenAI,
                Anthropic, or Google) solely to generate requested visual and
                code outputs.
              </li>
              <li>
                <strong className="text-white">No Model Training:</strong>{" "}
                Your private prompts, proprietary architecture specs, and
                generated design assets are <strong>NOT</strong> used to train
                public foundation AI models.
              </li>
              <li>
                <strong className="text-white">
                  Independent Branding Disclaimer:
                </strong>{" "}
                dezign2app is an independent application platform and interface.
                dezign2app is not affiliated with, sponsored by, or endorsed by
                Google, OpenAI, Anthropic, or any third-party AI model creators.
                Third-party model names referenced in documentation denote
                functional API integrations only.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              4. Third-Party Service Providers & Merchant of Record
            </h2>
            <p>
              We share data with trusted third-party vendors under strict data
              protection agreements:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">
                  Creem.io (Merchant of Record):
                </strong>{" "}
                Creem.io is our Merchant of Record and reseller. Creem processes
                payments, manages billing subscriptions, calculates applicable
                taxes, and sends official receipts.
              </li>
              <li>
                <strong className="text-white">Clerk:</strong> Provides
                secure user authentication and session token management.
              </li>
              <li>
                <strong className="text-white">
                  Cloud Infrastructure Providers:
                </strong>{" "}
                Hosting, serverless computing, and database services provided by
                Vercel and cloud database partners using encrypted channels.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              5. Data Security & Storage Controls
            </h2>
            <p>
              We enforce robust technical and organizational security controls
              to protect user data from unauthorized access, loss, or
              disclosure:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Encryption in transit using TLS 1.3 protocols and encryption at
                rest (AES-256) for stored data.
              </li>
              <li>
                Strict role-based access control (RBAC) restricting server
                access exclusively to authorized personnel.
              </li>
              <li>Automated system monitoring and periodic security audits.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              6. Your Data Rights (GDPR & CCPA)
            </h2>
            <p>
              Depending on your jurisdiction, you possess the following rights
              regarding your personal data:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">Access & Export:</strong>{" "}
                Request a full copy of your personal data and project records.
              </li>
              <li>
                <strong className="text-white">Rectification:</strong>{" "}
                Correct inaccurate or incomplete account details.
              </li>
              <li>
                <strong className="text-white">Erasure & Deletion:</strong>{" "}
                Request permanent deletion of your account, workspace assets,
                and telemetry records.
              </li>
              <li>
                <strong className="text-white">Opt-Out:</strong> Opt out of
                non-essential product update communications.
              </li>
            </ul>
            <p className="mt-1">
              To exercise any of these rights, email us at{" "}
              <a
                href="mailto:founder@dezign2app.com"
                className="text-white font-bold hover:underline"
              >
                founder@dezign2app.com
              </a>
              .
            </p>
          </section>

          {/* Section 7 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              7. Children's Privacy
            </h2>
            <p>
              dezign2app is not directed at or intended for use by children
              under the age of 16 (or 13 in certain jurisdictions). We do not
              knowingly collect personal data from children. If we discover a
              minor has registered without verifiable parental consent, we will
              promptly purge the account.
            </p>
          </section>

          {/* Section 8 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              8. Contact Us
            </h2>
            <p>
              If you have questions, concerns, or data privacy requests
              regarding this Privacy Policy, please contact our support team:
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
                Customer Support & Privacy Compliance Team
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
              href="/terms"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Terms of Service →
            </Link>
            <Link
              href="/acceptable-use"
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              Acceptable Use Policy →
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
