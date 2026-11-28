import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | dezign2app",
  description:
    "Terms and Conditions of Service for dezign2app platform - Includes Merchant of Record, Refund Policy, and AI Tool Use Terms.",
};

export default function TermsPage() {
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
            Terms & Conditions of Service
          </h1>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">
            These Terms & Conditions govern your access to and use of the
            dezign2app platform, applications, and AI visual tools. Please read
            these terms carefully before registering or using our platform.
          </p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-10 text-zinc-300 text-sm md:text-base leading-relaxed">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing, registering for, or using dezign2app, you
              acknowledge that you have read, understood, and agree to be bound
              legally by these Terms & Conditions, our{" "}
              <Link
                href="/privacy"
                className="text-white font-semibold hover:underline"
              >
                Privacy Policy
              </Link>
              , and our{" "}
              <Link
                href="/acceptable-use"
                className="text-white font-semibold hover:underline"
              >
                Acceptable Use Policy
              </Link>
              . If you do not agree with any portion of these terms, you must
              discontinue using our services immediately.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              2. Merchant of Record & Payment Processing Disclosures
            </h2>
            <p>
              Our order process and paid subscription billing are conducted by
              our reseller and Merchant of Record, <strong>Creem.io</strong>.
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">Merchant of Record:</strong>{" "}
                Creem.io is the Merchant of Record for all orders placed on
                dezign2app. Creem handles payment collection, tax compliance,
                invoicing, and customer billing inquiries.
              </li>
              <li>
                <strong className="text-white">Recurring Billing:</strong>{" "}
                Paid subscriptions automatically renew on a monthly or annual
                basis unless cancelled prior to the renewal date.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              3. Cancellation & Refund Policy
            </h2>
            <p>
              We want you to be completely satisfied with dezign2app. We
              maintain clear cancellation and refund rules:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">Cancellation:</strong> You may
                cancel your subscription at any time through your workspace
                settings dashboard, directly via the Creem Customer Portal, or
                by emailing{" "}
                <a
                  href="mailto:founder@dezign2app.com"
                  className="text-white font-semibold hover:underline"
                >
                  founder@dezign2app.com
                </a>
                . Upon cancellation, your subscription will remain active until
                the end of your current billing period.
              </li>
              <li>
                <strong className="text-white">Refund:</strong>{" "}
                Non refundable due to the nature of the service.
              </li>
              <li>
                <strong className="text-white">Support Response SLA:</strong>{" "}
                Support inquiries regarding billing, or account access will be
                addressed within 3 business days.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              4. User Accounts & Security
            </h2>
            <p>
              To access certain features of dezign2app, you must register an
              account. You agree to:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Provide accurate, current, and complete registration
                information.
              </li>
              <li>
                Maintain the security and confidentiality of your credentials.
              </li>
              <li>
                Notify us immediately of any unauthorized access or security
                compromise.
              </li>
              <li>
                Accept responsibility for all activities conducted under your
                account.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              5. Intellectual Property Rights & Output Ownership
            </h2>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">
                  User Content Ownership:
                </strong>{" "}
                You retain full ownership and intellectual property rights in
                your input prompts, architecture specifications, and generated
                visual design assets created using dezign2app.
              </li>
              <li>
                <strong className="text-white">Platform IP:</strong>{" "}
                dezign2app and its licensors retain all rights, title, and
                interest in and to the core platform, software, visual
                components, branding, and proprietary algorithms.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              6. AI Service Terms & Disclaimers
            </h2>
            <p>
              dezign2app incorporates AI model integrations to assist in
              generating visual diagrams and code specs.
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                <strong className="text-white">"AS IS" Output:</strong>{" "}
                AI-generated outputs are provided on an "AS IS" and "AS
                AVAILABLE" basis without warranty of accuracy or completeness.
                Users are responsible for evaluating, testing, and verifying
                generated output prior to production deployment.
              </li>
              <li>
                <strong className="text-white">
                  Independent Branding Disclaimer:
                </strong>{" "}
                dezign2app is an independent tool and is not affiliated with,
                sponsored by, or endorsed by Google, OpenAI, Anthropic, or
                third-party AI model creators. Third-party model names
                referenced denote functional API integrations only.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="flex flex-col gap-3 border-l-2 border-emerald-500/60 pl-4 my-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              7. Prohibited Uses & Acceptable Use Policy
            </h2>
            <p>
              You agree to use dezign2app strictly for lawful, professional
              purposes. You are strictly prohibited from generating:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-zinc-400">
              <li>
                Sexually explicit, adult (NSFW), pornographic, or suggestive
                content of any kind.
              </li>
              <li>
                Face-swap, deepfake, or non-consensual image manipulation.
              </li>
              <li>
                Malicious code, spyware, viruses, exploit payloads, or phishing
                materials.
              </li>
              <li>
                Hate speech, harassing material, defamatory statements, or
                violent imagery.
              </li>
            </ul>
            <p className="mt-2 text-xs md:text-sm text-zinc-500">
              For a complete description of prohibited behaviors and technical
              enforcement rules, read our full{" "}
              <Link
                href="/acceptable-use"
                className="text-white font-bold underline"
              >
                Acceptable Use Policy
              </Link>
              .
            </p>
          </section>

          {/* Section 8 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              8. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, dezign2app, its
              directors, employees, or partners shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages,
              including loss of profits, data loss, or system interruption
              arising out of your use of or inability to use the platform.
            </p>
          </section>

          {/* Section 9 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              9. Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate your account and
              platform access without prior notice if you breach these Terms &
              Conditions or our Acceptable Use Policy.
            </p>
          </section>

          {/* Section 10 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              10. Contact Information
            </h2>
            <p>
              If you have any questions or concerns regarding these Terms &
              Conditions, please contact our legal and support team:
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
                Support & Legal Compliance Team
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
