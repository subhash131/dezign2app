import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | dezign2app",
  description: "Privacy Policy for dezign2app - Learn how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  const lastUpdated = "July 23, 2026";

  return (
    <div className="max-w-screen min-h-screen w-full bg-white text-black flex flex-col items-center overflow-x-hidden">
      <Header />

      <main className="w-full max-w-4xl px-6 py-12 md:py-20 flex flex-col gap-10">
        {/* Header Section */}
        <div className="flex flex-col gap-4 border-b border-gray-100 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-600 w-fit font-medium">
            <span>Last Updated: {lastUpdated}</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900">
            Privacy Policy
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed max-w-2xl">
            At dezign2app, we value your privacy and are committed to protecting your personal information. This Privacy Policy outlines how we handle data when you use our platform and services.
          </p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-10 text-gray-700 text-sm md:text-base leading-relaxed">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              1. Information We Collect
            </h2>
            <p>
              We collect information to provide better services to our users. The types of information we collect include:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>
                <strong className="text-gray-800">Account Information:</strong> When you create an account, we may collect your name, email address, password, and authentication details.
              </li>
              <li>
                <strong className="text-gray-800">Usage & Project Data:</strong> Data generated when using our design engine, workflows, diagrams, and canvas projects to facilitate real-time storage and processing.
              </li>
              <li>
                <strong className="text-gray-800">Technical Logs:</strong> IP address, browser type, device information, operating system, and system performance metrics.
              </li>
              <li>
                <strong className="text-gray-800">Cookies & Tracking:</strong> We use essential cookies and similar tracking technologies to store user preferences and maintain secure sessions.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              2. How We Use Your Information
            </h2>
            <p>
              We use the collected information for purposes including:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>Operating, maintaining, and improving our core application services.</li>
              <li>Authenticating users and protecting against unauthorized access.</li>
              <li>Processing transactions and managing subscriptions.</li>
              <li>Analyzing platform performance, usage trends, and system stability.</li>
              <li>Sending essential product updates, security alerts, and support communications.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              3. Data Sharing and Disclosure
            </h2>
            <p>
              We do not sell your personal data to third parties. We may share information under the following limited circumstances:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>
                <strong className="text-gray-800">Service Providers:</strong> Trusted third-party vendors who assist in hosting, database management, payment processing, and analytics under strict confidentiality agreements.
              </li>
              <li>
                <strong className="text-gray-800">Legal Compliance:</strong> When required by applicable law, court order, regulation, or governmental request.
              </li>
              <li>
                <strong className="text-gray-800">Business Transfers:</strong> In connection with a merger, acquisition, or sale of company assets, with appropriate notification to affected users.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              4. Data Security & Storage
            </h2>
            <p>
              We implement industry-standard security practices, including encryption in transit (HTTPS/TLS) and at rest, role-based access control, and routine system audits to safeguard your personal data against loss, misuse, or unauthorized access.
            </p>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              5. Your Rights & Choices
            </h2>
            <p>
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>Access, export, or request a copy of your personal data.</li>
              <li>Request correction or deletion of inaccurate data.</li>
              <li>Opt-out of non-essential marketing communications.</li>
              <li>Request closure of your account and purge of project assets.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              6. Contact Us
            </h2>
            <p>
              If you have any questions or concerns about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-gray-800 font-medium">
              Email: privacy@dezign2app.com
            </div>
          </section>
        </div>

        {/* Navigation back */}
        <div className="border-t border-gray-100 pt-6 mt-6 flex justify-between items-center">
          <Link
            href="/"
            className="text-xs font-semibold text-black hover:underline flex items-center gap-1"
          >
            ← Back to Home
          </Link>
          <Link
            href="/terms"
            className="text-xs font-semibold text-gray-600 hover:text-black transition-colors"
          >
            Read Terms & Conditions →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
