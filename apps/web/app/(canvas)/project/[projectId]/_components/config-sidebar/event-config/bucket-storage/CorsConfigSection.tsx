import React from "react";
import { Switch } from "@workspace/ui/components/switch";
import { Button } from "@workspace/ui/components/button";
import { Globe } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";
import { CORS_METHODS } from "./constants";

export const CorsConfigSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const corsMethodsList = Array.isArray(item.corsMethods)
    ? item.corsMethods
    : ["GET", "PUT", "POST", "HEAD"];

  const toggleCorsMethod = (method: string) => {
    const next = corsMethodsList.includes(method)
      ? corsMethodsList.filter((m) => m !== method)
      : [...corsMethodsList, method];
    handleUpdate(item.id, { corsMethods: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-purple-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            CORS & Web Client Ingress
          </span>
        </div>
        <Switch
          checked={Boolean(item.enableCors)}
          onCheckedChange={(checked) => handleUpdate(item.id, { enableCors: checked })}
        />
      </div>

      {item.enableCors && (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">Allowed Origins</label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="e.g. * or https://myapp.com, http://localhost:3000"
              value={item.corsOrigins || "*"}
              onBlur={(e) => handleUpdate(item.id, { corsOrigins: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">Allowed HTTP Methods</label>
            <div className="flex flex-wrap gap-1.5">
              {CORS_METHODS.map((m) => {
                const active = corsMethodsList.includes(m);
                return (
                  <Button
                    key={m}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className={`h-6 text-[10px] px-2 font-mono ${
                      active
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "text-muted-foreground"
                    }`}
                    onClick={() => toggleCorsMethod(m)}
                  >
                    {m}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">Allowed Headers</label>
              <LocalInput
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="* or Content-Type, Authorization"
                value={item.corsHeaders || "*"}
                onBlur={(e) => handleUpdate(item.id, { corsHeaders: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">Max Age (Seconds)</label>
              <LocalInput
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="3600"
                value={item.corsMaxAge || "3600"}
                onBlur={(e) => handleUpdate(item.id, { corsMaxAge: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
