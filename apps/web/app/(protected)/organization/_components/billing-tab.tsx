"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { CreditCard, Zap, Calendar, ChevronRight } from "lucide-react";
import type { OrgItem, OrgSeatStatus } from "@/components/auth/org/types";
import { BuySeatsDialog } from "@/components/auth/org/buy-seats-dialog";
import { useSession } from "@/lib/auth-client";

interface BillingTabProps {
  activeOrg: OrgItem;
  seatStatus: OrgSeatStatus | null | undefined;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  canceled: { label: "Canceled", color: "text-muted-foreground bg-muted/50 border-border" },
  past_due: { label: "Past Due", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  expired: { label: "Expired", color: "text-destructive bg-destructive/10 border-destructive/20" },
  trialing: { label: "Trial", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
};

export function BillingTab({ activeOrg, seatStatus }: BillingTabProps) {
  const [buySeatsOpen, setBuySeatsOpen] = useState(false);
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "";

  const earlyBeliever = useQuery(
    api.billing.getUserEarlyBeliever,
    userEmail ? { email: userEmail } : "skip",
  );

  const statusCfg = STATUS_CONFIG[seatStatus?.status ?? ""] ?? null;
  const seatUsePct = seatStatus
    ? Math.min(100, Math.round((seatStatus.usedSeats / seatStatus.totalSeats) * 100))
    : 0;

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Seat allocation card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Seat Allocation</h3>
          {statusCfg && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          )}
        </div>

        {seatStatus ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Base Seats", value: seatStatus.baseSeats },
                { label: "Extra Seats", value: seatStatus.extraSeats },
                { label: "Total Seats", value: seatStatus.totalSeats },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-muted/30 p-3 text-center"
                >
                  <div className="text-xl font-bold text-foreground">{value}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{seatStatus.usedSeats} used</span>
                <span>{seatStatus.availableSeats} available</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${seatUsePct}%`,
                    background:
                      seatUsePct >= 90
                        ? "hsl(var(--destructive))"
                        : seatUsePct >= 70
                          ? "hsl(38 92% 50%)"
                          : "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>

            {seatStatus.isOwner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBuySeatsOpen(true)}
                className="gap-1.5 text-xs"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Buy Additional Seats
                <ChevronRight className="h-3 w-3 ml-auto" />
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Billing data unavailable.</p>
        )}
      </div>

      {/* Early Believer card */}
      {earlyBeliever && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Early Believer</h3>
            <Badge className="text-[10px] ml-auto">
              {earlyBeliever.discountPercent}% discount
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Seats Included", value: String(earlyBeliever.totalSeats) },
              { label: "Total Invested", value: `$${earlyBeliever.totalPaid.toLocaleString()}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-primary/20 bg-background/50 p-3">
                <div className="text-sm font-bold text-foreground">{value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {earlyBeliever.maxSubscriptionEnd > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Access until{" "}
              {new Date(earlyBeliever.maxSubscriptionEnd).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          )}
        </div>
      )}

      <BuySeatsDialog
        open={buySeatsOpen}
        onOpenChange={setBuySeatsOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus ?? null}
      />
    </div>
  );
}
