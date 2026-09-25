"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";
import { BackendNode } from "@/types/canvas";
import { Database, Info } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface StoreSelectorProps {
  selectedStoreNodeId?: string;
  stateStoreNodes: BackendNode[];
  onStoreChange: (storeId: string) => void;
}

export const StoreSelector: React.FC<StoreSelectorProps> = ({
  selectedStoreNodeId,
  stateStoreNodes,
  onStoreChange,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Database size={10} />
        Target State Store
      </Label>
      <Select
        value={selectedStoreNodeId || ""}
        onValueChange={onStoreChange}
      >
        <SelectTrigger className="h-9 text-xs bg-background">
          <SelectValue placeholder="Choose state store to update…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" className="text-xs text-muted-foreground">
            None (No Store Mutation)
          </SelectItem>
          {stateStoreNodes.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                    s.data?.scope === "global"
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-sky-500/15 text-sky-500",
                  )}
                >
                  {s.data?.scope || "GLOBAL"}
                </span>
                <span className="font-semibold text-foreground">
                  {s.data?.storeName || s.data?.label || "Store"}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({(s.data?.fields || []).length} fields, {(s.data?.actions || []).length} actions)
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {stateStoreNodes.length === 0 && (
        <p className="text-[11px] text-amber-500 flex items-center gap-1.5 mt-1">
          <Info size={11} className="shrink-0" />
          No State Store nodes on canvas. Add a State Store from the node palette to manage reactive client state.
        </p>
      )}
    </div>
  );
};
