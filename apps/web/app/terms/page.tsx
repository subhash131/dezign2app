import React from "react";
import Link from "next/link";
import { Header } from "../_landing_components/header";
import { Footer } from "../_landing_components/footer";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | dezign2app",
  description: "Terms and Conditions of Service for dezign2app platform.",
};

export default function TermsPage() {
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
            Terms & Conditions
          </h1>
          <p className="text-gray-600 text-sm md:text-base leading-relaxed max-w-2xl">
            These Terms & Conditions govern your access to and use of the dezign2app website, services, and applications. Please read them carefully before using our services.
          </p>
        </div>

        {/* Content Section */}
        <div className="flex flex-col gap-10 text-gray-700 text-sm md:text-base leading-relaxed">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              1. Acceptance of Terms
            </h2>
            <p>
              By registering, accessing, or using dezign2app, you agree to be bound by these Terms & Conditions and our Privacy Policy. If you do not agree with any part of these terms, you must not use our platform.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              2. User Accounts & Registration
            </h2>
            <p>
              To access certain features of dezign2app, you may be required to register for an account. You agree to:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>Provide accurate, current, and complete information during registration.</li>
              <li>Maintain and safeguard the confidentiality of your account credentials.</li>
              <li>Notify us immediately of any unauthorized use or security breach related to your account.</li>
              <li>Accept responsibility for all activities conducted under your user account.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              3. Acceptable Use Policy
            </h2>
            <p>
              You agree to use dezign2app only for lawful purposes. You must not:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-gray-600">
              <li>Violate any applicable local, national, or international laws or regulations.</li>
              <li>Attempt to gain unauthorized access to our servers, user accounts, or connected networks.</li>
              <li>Reverse engineer, decompile, or attempt to extract source code from the platform.</li>
              <li>Upload or transmit harmful code, viruses, malware, or destructive data.</li>
              <li>Use automated tools or scrapers to extract data from our service without prior written authorization.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              4. Intellectual Property Rights
            </h2>
            <p>
              All proprietary rights, intellectual property, software, branding, trademarks, and UI components in dezign2app belong exclusively to dezign2app and its licensors. Users retain ownership of their user-generated content and diagram designs created using the platform.
            </p>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              5. Subscriptions & Billing
            </h2>
            <p>
              Certain features of dezign2app may require a paid subscription. Payments are billed in advance on a recurring monthly or annual basis. Fees are non-refundable except where explicitly required by law or specified in our refund policy.
            </p>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              6. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, dezign2app and its officers, employees, or partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the platform.
            </p>
          </section>

          {/* Section 7 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              7. Termination
            </h2>
            <p>
              We reserve the right to suspend or terminate your account and access to dezign2app at our sole discretion, without prior notice, if you breach these Terms & Conditions.
            </p>
          </section>

          {/* Section 8 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              8. Contact Us
            </h2>
            <p>
              If you have questions regarding these Terms & Conditions, please contact our legal team at:
            </p>
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-gray-800 font-medium">
              Email: legal@dezign2app.com
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
            href="/privacy"
            className="text-xs font-semibold text-gray-600 hover:text-black transition-colors"
          >
            Read Privacy Policy →
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
