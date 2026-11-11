"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { SubscribeButton } from "./subscribe-button";
import { Check } from "lucide-react";

export type BillingCycle = "monthly" | "annually";

export interface Plan {
  id: string;
  name: string;
  desc: string;
  price: number | null;
  billingPeriod: string;
  freeLabel?: string;
  featured: boolean;
  features: string[];
  paymentUrl?: string;
}

interface PlanCardProps {
  plan: Plan;
  billing?: BillingCycle;
}

export function PlanCard({ plan }: PlanCardProps) {
  const {
    id,
    name,
    desc,
    price,
    billingPeriod,
    freeLabel,
    features,
  } = plan;

  const displayPrice = price;
  const periodLabel =
    billingPeriod === "every-year"
      ? "/ year"
      : billingPeriod === "every-month"
      ? "/ month"
      : "";

  return (
    <div className="relative border border-zinc-800 flex flex-col w-full max-w-[400px] rounded-2xl p-8 bg-[#0c0c0e] text-start shadow-2xl transition-all hover:border-zinc-700">
      {/* Top Tag & Badge */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-medium">
          Beta Early Access
        </span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
          Limited Spots
        </span>
      </div>

      {/* Plan Name */}
      <h3 className="text-2xl font-bold text-white tracking-tight">
        {name}
      </h3>

      {/* Description */}
      <p className="text-xs text-zinc-400 mt-2 mb-6 leading-relaxed">
        {!desc || desc.toLowerCase().includes("basic")
          ? "Everything you need to turn visual system architecture into full-stack production software."
          : desc}
      </p>

      {/* Price Display */}
      <div className="mb-2">
        {freeLabel ? (
          <span className="text-3xl font-bold tracking-tight text-white">
            {freeLabel}
          </span>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tracking-tight text-white font-mono">
              ${displayPrice}
            </span>
            {periodLabel && (
              <span className="text-xs text-zinc-400 font-medium font-mono">
                {periodLabel}
              </span>
            )}
          </div>
        )}
        <p className="text-[11px] text-zinc-500 mt-1.5 font-mono">
          Billed {billingPeriod === "every-year" ? "annually" : "monthly"}. Cancel anytime. Full source ownership.
        </p>
      </div>

      {/* CTA Button */}
      <div className="mt-4">
        <SubscribeButton productId={id} paymentUrl={plan.paymentUrl} />
      </div>

      {/* Value Guarantee */}
      <div className="mt-8 pt-6 border-t border-zinc-800/80 flex flex-col gap-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
          Included with your access:
        </span>
        <ul className="flex flex-col gap-2.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-xs text-zinc-300 font-normal leading-snug"
            >
              <div className="w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5 text-zinc-200">
                <Check className="w-2.5 h-2.5" />
              </div>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
