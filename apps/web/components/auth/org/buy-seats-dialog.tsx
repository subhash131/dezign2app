"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { CreditCard, Minus, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { OrgItem, OrgSeatStatus } from "./types";

interface BuySeatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrg: OrgItem | null;
  seatStatus: OrgSeatStatus | null | undefined;
}

export function BuySeatsDialog({
  open,
  onOpenChange,
  activeOrg,
  seatStatus,
}: BuySeatsDialogProps) {
  const [additionalSeatsToBuy, setAdditionalSeatsToBuy] = useState(1);
  const [buyingSeats, setBuyingSeats] = useState(false);

  const handleBuySeats = async () => {
    if (!activeOrg?.id) return;
    setBuyingSeats(true);
    try {
      const res = await fetch("/api/checkout/seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrg.id,
          additionalSeats: additionalSeatsToBuy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMsg =
          typeof data?.error === "string"
            ? data.error
            : "Failed to create checkout";
        throw new Error(errorMsg);
      }
      if (typeof data?.checkoutUrl === "string") {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Checkout failed";
      toast.error(msg);
    } finally {
      setBuyingSeats(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Add Teammate Seats
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Add extra seats to {activeOrg?.name} for your teammates. Each seat
            provides full Pro access within this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs flex justify-between items-center">
            <span className="text-muted-foreground">Current Seat Capacity:</span>
            <span className="font-semibold">
              {seatStatus?.totalSeats ?? 1} Seats ({seatStatus?.usedSeats ?? 1}{" "}
              used)
            </span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Number of Additional Seats
            </Label>
            <div className="flex items-center justify-between border border-border rounded-lg p-1.5 bg-muted/20">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={additionalSeatsToBuy <= 1 || buyingSeats}
                onClick={() =>
                  setAdditionalSeatsToBuy((s) => Math.max(1, s - 1))
                }
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <div className="text-center font-bold text-sm">
                {additionalSeatsToBuy}{" "}
                {additionalSeatsToBuy === 1 ? "Seat" : "Seats"}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={additionalSeatsToBuy >= 50 || buyingSeats}
                onClick={() =>
                  setAdditionalSeatsToBuy((s) => Math.min(50, s + 1))
                }
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Rate per seat:</span>
              <span>$20.00</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5">
              <span>Total:</span>
              <span>${additionalSeatsToBuy * 20}.00</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={buyingSeats}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            onClick={handleBuySeats}
            disabled={buyingSeats}
            className="gap-1.5"
          >
            {buyingSeats ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Preparing Checkout...
              </>
            ) : (
              <>
                <CreditCard className="h-3.5 w-3.5" />
                Buy {additionalSeatsToBuy}{" "}
                {additionalSeatsToBuy === 1 ? "Seat" : "Seats"} ($
                {additionalSeatsToBuy * 20})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
