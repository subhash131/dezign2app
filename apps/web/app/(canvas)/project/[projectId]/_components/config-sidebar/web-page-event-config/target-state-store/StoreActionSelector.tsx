"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Zap } from "lucide-react";
import { toPascalCase } from "./types";

export interface StoreActionSelectorField {
  id: string;
  name: string;
  type: string;
  isArray?: boolean;
}

export interface StoreActionSelectorAction {
  id: string;
  name: string;
  actionType?: string;
  parameters?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export interface StoreActionSelectorProps {
  actionId?: string;
  fields: StoreActionSelectorField[];
  customActions: StoreActionSelectorAction[];
  onActionChange: (actionKey: string) => void;
}

export const StoreActionSelector: React.FC<StoreActionSelectorProps> = ({
  actionId,
  fields,
  customActions,
  onActionChange,
}) => {
  const defaultValue = actionId || (fields.length > 0 ? `setter-${fields[0]!.id}` : "builtin-reset");

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Zap size={10} />
        Store Mutation / Action to Call
      </Label>
      <Select
        value={defaultValue}
        onValueChange={onActionChange}
      >
        <SelectTrigger className="h-9 text-xs bg-background font-mono">
          <SelectValue placeholder="Select mutation or action…" />
        </SelectTrigger>
        <SelectContent>
          {/* Field Setters */}
          {fields.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground">
                Field Setters (Mutate State)
              </SelectLabel>
              {fields.map((f) => {
                const setterName = `set${toPascalCase(f.name)}`;
                return (
                  <SelectItem key={`setter-${f.id}`} value={`setter-${f.id}`} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <span className="font-semibold font-mono">{setterName}(value)</span>
                      <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                        {f.type}
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          )}

          {/* Array Operations: Append & Pop */}
          {fields.some((f) => Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"))) && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                Array Operations
              </SelectLabel>
              {fields
                .filter((f) => Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]")))
                .flatMap((f) => {
                  const appendName = `append${toPascalCase(f.name)}`;
                  const popName = `pop${toPascalCase(f.name)}`;
                  const itemType = f.type.endsWith("[]") ? f.type.slice(0, -2) : "item";
                  return [
                    <SelectItem key={`append-${f.id}`} value={`append-${f.id}`} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                        <span className="font-semibold font-mono">{appendName}({itemType})</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-violet-500/40 text-violet-600 dark:text-violet-400 font-mono">
                          append
                        </Badge>
                      </div>
                    </SelectItem>,
                    <SelectItem key={`pop-${f.id}`} value={`pop-${f.id}`} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="font-semibold font-mono">{popName}()</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400 font-mono">
                          pop last
                        </Badge>
                      </div>
                    </SelectItem>,
                  ];
                })}
            </SelectGroup>
          )}

          {/* Schema Manipulator: Populate */}
          {fields.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                Schema Manipulators
              </SelectLabel>
              <SelectItem value="builtin-populate" className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold font-mono">populate(data)</span>
                  <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-sans">
                    Explicit Field Mapping
                  </Badge>
                </div>
              </SelectItem>
            </SelectGroup>
          )}

          {/* Custom Store Actions */}
          {customActions.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                Custom Actions
              </SelectLabel>
              {customActions.map((act) => (
                <SelectItem key={act.id} value={act.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                    <span className="font-semibold font-mono">{act.name}()</span>
                    <Badge variant="secondary" className="text-[9px] py-0 px-1 uppercase font-mono">
                      {act.actionType || "action"}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Standard Manipulator: Reset */}
          <SelectGroup>
            <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
              Reset
            </SelectLabel>
            <SelectItem value="builtin-reset" className="text-xs">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="font-semibold">reset()</span>
                <span className="text-[10px] text-muted-foreground font-sans">
                  - Restore initial state
                </span>
              </div>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
