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
  process.env.NEXT_PUBLIC_BETA_PRODUCT_ID || "prod_46nPBCY2wuGTn9mVhoYwWe";

const DEFAULT_BETA_PLAN: Plan = {
  id: TARGET_PRODUCT_ID,
  name: "Beta Access",
  desc: "Everything you need to compile system architecture into production code.",
  price: 100,
  billingPeriod: "every-year",
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
        const targetItem = rawItems.find(
          (item: CreemProductItem) => item.id === TARGET_PRODUCT_ID,
        );

        if (targetItem) {
          let featuresList: string[] = targetItem.metadata?.features
            ? targetItem.metadata.features
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          if (featuresList.length === 0) {
            featuresList = [
              "Full-Stack Monorepo Code Generation",
              "Visual Architecture Graph to Code Compiler",
              "Data Flow Simulation (Load test system designs before shipping)",
              "Priority Implementation of Your Custom Stack & Products",
            ];
          }

          const cleanDesc =
            "Everything you need to compile system architecture into production code.";

          const planName = "Beta Access";

          setPlans([
            {
              id: targetItem.id,
              name: planName,
              desc: cleanDesc,
              price: targetItem.price ? targetItem.price / 100 : 0,
              billingPeriod: normalizeBillingPeriod(targetItem),
              featured: true,
              features: featuresList,
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
