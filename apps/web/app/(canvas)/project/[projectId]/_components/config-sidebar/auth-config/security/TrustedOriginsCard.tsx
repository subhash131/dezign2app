import React from "react";
import { Label } from "@workspace/ui/components/label";
import { LocalInput } from "../LocalInput";
import { Button } from "@workspace/ui/components/button";
import { Globe, Plus, Trash } from "lucide-react";
import { TrustedOriginsCardProps } from "./types";

export const TrustedOriginsCard: React.FC<TrustedOriginsCardProps> = ({
  trustedOrigins,
  onUpdateOrigins,
}) => {
  return (
    <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-primary" /> Trusted Origins & CORS List
          </Label>
          <p className="text-[11px] text-muted-foreground">
            Allowed web app origins for auth cookies and CORS credentials.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs bg-background shrink-0 cursor-pointer"
          onClick={() => {
            const updated = [
              ...trustedOrigins,
              `https://app${trustedOrigins.length + 1}.example.com`,
            ].filter(Boolean);
            onUpdateOrigins(updated);
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Origin
        </Button>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        {trustedOrigins.map((origin, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 p-2 rounded bg-background border border-border/50 text-xs"
          >
            <LocalInput
              className="h-7 text-xs font-mono bg-background flex-1"
              placeholder="https://yourdomain.com"
              value={origin}
              onChange={(e) => {
                const updated = trustedOrigins.map((o, i) => (i === idx ? e.target.value : o));
                onUpdateOrigins(updated);
              }}
            />
            <button
              onClick={() => {
                const updated = trustedOrigins.filter((_, i) => i !== idx);
                onUpdateOrigins(updated);
              }}
              className="p-1 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
            >
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
