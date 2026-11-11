"use client";

import { useEffect, useState } from "react";
import { BillingCycle, PlanCard, type Plan } from "./plan-card";

type PricingProps = {
  hideHeader?: boolean;
  hideToggle?: boolean;
  externalBilling?: BillingCycle;
};

interface CreemProductItem {
  id: string;
  name: string;
  description?: string;
  price?: number;
  billing_type?: string;
  billingType?: string;
  billing_period?: string;
  billingPeriod?: string;
  billing_cycle?: string;
  billingCycle?: string;
  interval?: string;
  period?: string;
  metadata?: Record<string, string | undefined>;
}

function normalizeBillingPeriod(
  item: CreemProductItem,
): "every-month" | "every-year" {
  const period = String(
    item.billing_period ||
      item.billingPeriod ||
      item.billing_cycle ||
      item.billingCycle ||
      item.interval ||
      item.period ||
      item.metadata?.billing_period ||
      item.metadata?.billingPeriod ||
      "",
  ).toLowerCase();

  if (
    period.includes("year") ||
    period.includes("annual") ||
    period === "every-year" ||
    period === "every_year"
  ) {
    return "every-year";
  }
  return "every-month";
}

const TARGET_PRODUCT_ID =
  process.env.NEXT_PUBLIC_BETA_PRODUCT_ID || "prod_3SqZz0dwcsNP45v1pDXguW";

const CREEM_PAYMENT_URL =
  process.env.NEXT_PUBLIC_CREEM_PAYMENT_URL ||
  `https://www.creem.io/payment/${TARGET_PRODUCT_ID}`;

const DEFAULT_BETA_PLAN: Plan = {
  id: TARGET_PRODUCT_ID,
  name: "Beta Access",
  desc: "Everything you need to compile system architecture into production code.",
  price: 20,
  billingPeriod: "every-month",
  paymentUrl: CREEM_PAYMENT_URL,
  featured: true,
  features: [
    "Full-Stack Monorepo Code Generation",
    "Visual Architecture Graph to Code Compiler",
    "Data Flow Simulation (Load test system designs before shipping)",
    "Priority Implementation of Your Custom Stack & Products",
  ],
};

const Pricing = ({
  hideHeader = false,
  hideToggle = false,
  externalBilling,
}: PricingProps) => {
  // Pre-seed with DEFAULT_BETA_PLAN so SSR, web crawlers, and AI agents always see real pricing immediately
  const [plans, setPlans] = useState<Plan[]>([DEFAULT_BETA_PLAN]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch("/api/checkout/subscription/products");
        if (!res.ok) throw new Error("Failed to load products");
        const data = await res.json();
        const rawItems: CreemProductItem[] = data.items || [];

        // Match designated production product ID, fallback to beta or first recurring plan
        const targetItem =
          rawItems.find((item: CreemProductItem) => item.id === TARGET_PRODUCT_ID) ||
          rawItems.find((item: CreemProductItem) => item.id === "prod_3SqZz0dwcsNP45v1pDXguW") ||
          rawItems.find((item: CreemProductItem) => item.id === "prod_46nPBCY2wuGTn9mVhoYwWe") ||
          rawItems.find((item: CreemProductItem) =>
            String(item.name || "").toLowerCase().includes("beta")
          ) ||
          rawItems.find((item: CreemProductItem) =>
            String(item.billing_type || item.billingType || "").toLowerCase() === "recurring"
          ) ||
          rawItems[0];

        if (targetItem) {
          // 1. Parse features from Creem metadata OR markdown bullets in description
          let featuresList: string[] = targetItem.metadata?.features
            ? targetItem.metadata.features
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          if (featuresList.length === 0 && targetItem.description) {
            const bulletMatches = targetItem.description
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line.startsWith("*") || line.startsWith("-"))
              .map((line) => line.replace(/^[\*\-]\s+/, "").replace(/\*\*/g, "").trim())
              .filter(Boolean);

            if (bulletMatches.length > 0) {
              featuresList = bulletMatches;
            }
          }

          if (featuresList.length === 0) {
            featuresList = [
              "Full-Stack Monorepo Code Generation",
              "Visual Architecture Graph to Code Compiler",
              "Data Flow Simulation (Load test system designs before shipping)",
              "Priority Implementation of Your Custom Stack & Products",
            ];
          }

          // 2. Parse clean description from Creem, discarding raw markdown headers
          let cleanDesc =
            "Everything you need to compile system architecture into production code.";
          if (
            targetItem.description &&
            !targetItem.description.startsWith("#") &&
            !targetItem.description.toLowerCase().includes("basic pack")
          ) {
            const firstLine = targetItem.description.split("\n")[0]?.trim();
            if (firstLine && firstLine.length > 10) {
              cleanDesc = firstLine;
            }
          }

          // 3. Use actual product name from Creem (or "Beta Access" if raw name is generic)
          const rawName = (targetItem.name || "").trim();
          const planName =
            !rawName || rawName.toLowerCase() === "basic pack" || rawName.toLowerCase() === "basic"
              ? "Beta Access"
              : rawName;

          setPlans([
            {
              id: targetItem.id,
              name: planName,
              desc: cleanDesc,
              price:
                targetItem.price !== undefined
                  ? targetItem.price / 100
                  : 20,
              billingPeriod: normalizeBillingPeriod(targetItem),
              featured: true,
              features: featuresList,
              paymentUrl:
                targetItem.id === TARGET_PRODUCT_ID
                  ? CREEM_PAYMENT_URL
                  : `https://www.creem.io/payment/${targetItem.id}`,
            },
          ]);
          return;
        }

        setPlans([DEFAULT_BETA_PLAN]);
      } catch (error) {
        console.error("Failed to fetch plans from Creem:", error);
        setPlans([DEFAULT_BETA_PLAN]);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  return (
    <section
      className="w-full bg-transparent text-black relative overflow-hidden py-12 scroll-mt-14"
      id="pricing"
    >
      {/* Subtle radial bg */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] z-0"
        style={{
          background:
            "radial-gradient(ellipse, rgba(0,0,0,0.04) 0%, transparent 70%)",
        }}
      />

      {/* Cards */}
      <div className="relative z-10 flex flex-wrap justify-center gap-5 px-6 min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center w-full mt-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading plan...</p>
            </div>
          </div>
        ) : (
          plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))
        )}
      </div>
    </section>
  );
};

export default Pricing;
