"use client";

import React, { useMemo } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@workspace/ui/components/combobox";
import {
  useAvailableCanvasTypes,
  AvailableTypeItem,
} from "@/lib/hooks/useAvailableCanvasTypes";
import type { BackendNode } from "@/types/canvas";
import { Braces, Package, Code2, Database } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface TypeComboboxProps {
  value: string;
  onValueChange: (val: string) => void;
  className?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  allNodes?: BackendNode[];
  includeDatabaseTables?: boolean;
  excludeTypeName?: string;
  extraTypes?: AvailableTypeItem[];
  primitivePreset?: "schema" | "typescript";
  placeholder?: string;
}

/**
 * Searchable Combobox using the official @workspace/ui Combobox (Base UI) pattern
 * as documented at https://ui.shadcn.com/docs/components/base/combobox.
 */
export const TypeCombobox: React.FC<TypeComboboxProps> = ({
  value,
  onValueChange,
  className,
  wrapperClassName,
  disabled = false,
  allNodes,
  includeDatabaseTables = false,
  excludeTypeName,
  extraTypes,
  primitivePreset = "schema",
  placeholder = "Select type...",
}) => {
  const { allTypes } = useAvailableCanvasTypes(allNodes, {
    includeDatabaseTables,
    excludeTypeName,
    extraTypes,
    primitivePreset,
  });

  // Map for fast metadata lookup (category, kind, packageSource, sourceLabel)
  const typeMetaMap = useMemo(() => {
    return new Map(allTypes.map((t) => [t.name, t]));
  }, [allTypes]);

  // Ensure current value is included in list even if not in standard types
  const allTypeNames = useMemo(() => {
    const names = allTypes.map((t) => t.name);
    if (value && !names.includes(value)) {
      return [value, ...names];
    }
    return names;
  }, [allTypes, value]);

  return (
    <div
      className={cn("relative nodrag", wrapperClassName)}
      onClick={(e) => e.stopPropagation()}
    >
      <Combobox
        items={allTypeNames}
        value={value || "string"}
        onValueChange={(nextVal) => {
          if (typeof nextVal === "string" && nextVal.trim()) {
            onValueChange(nextVal.trim());
          }
        }}
      >
        <ComboboxInput
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-7 w-[140px] text-xs font-mono nodrag bg-secondary/50 border-none shadow-none focus-visible:ring-1",
            className,
          )}
        />
        <ComboboxContent
          className="w-[280px] p-0 shadow-2xl border border-border/80 bg-popover text-popover-foreground rounded-xl z-50 overflow-hidden"
          align="start"
          sideOffset={4}
        >
          <ComboboxEmpty className="py-4 text-center text-xs text-muted-foreground">
            No matching types found.
          </ComboboxEmpty>
          <ComboboxList className="max-h-72 overflow-y-auto no-scrollbar p-1 bg-popover text-popover-foreground hide-scrollbar">
            {(typeName: string) => {
              const meta = typeMetaMap.get(typeName);
              const isCustom = meta?.category === "custom";
              const isPackage = meta?.category === "package";
              const isDatabase = meta?.category === "database";
              const isPrimitive = !meta || meta.category === "primitive";
              const displayLabel = isDatabase ? (meta?.sourceLabel || typeName) : typeName;

              return (
                <ComboboxItem
                  key={typeName}
                  value={typeName}
                  className="flex items-center justify-between py-1.5 px-2 text-xs font-mono cursor-pointer rounded-md"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    {isDatabase && (
                      <Database className="size-3 text-amber-500 dark:text-amber-400 shrink-0" />
                    )}
                    {isCustom && (
                      <Braces className="size-3 text-indigo-400 shrink-0" />
                    )}
                    {isPackage && (
                      <Package className="size-3 text-emerald-400 shrink-0" />
                    )}
                    {isPrimitive && (
                      <Code2 className="size-3 text-muted-foreground/70 shrink-0" />
                    )}
                    <span className="truncate font-medium">{displayLabel}</span>

                    {/* Metadata tags */}
                    {isDatabase && (
                      <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        entity
                      </span>
                    )}
                    {isCustom && meta?.kind && (
                      <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 shrink-0">
                        {meta.kind}
                      </span>
                    )}
                    {isPackage && meta?.packageSource && (
                      <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 max-w-[90px] truncate">
                        {meta.packageSource}
                      </span>
                    )}
                    {typeName === "enum" && (
                      <span className="text-[9px] font-sans px-1 py-0.2 rounded bg-purple-500/10 text-purple-400 shrink-0">
                        fixed values
                      </span>
                    )}
                  </div>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
};
