"use client";

import React, { useMemo } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode } from "@/types/canvas";
import type { CustomTypeItem } from "@workspace/canvas/types";
import { toPascalCase } from "@/lib/utils";
import { Globe, Database, Package, Braces, Sparkles } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface TypeGroupInfo {
  id: string; // Node ID
  label: string; // e.g. "Conversations Types", "Entity Types"
  iconType: "custom" | "service" | "entity" | "package";
  isServiceDerived?: boolean;
  serviceName?: string;
  types: CustomTypeItem[];
}

export interface TwoStepTypeSelectorProps {
  value: string;
  onValueChange: (newType: string, typeItem?: CustomTypeItem, groupId?: string) => void;
  selectedTypeId?: string;
  selectedGroupId?: string;
  allNodes?: BackendNode[];
  compact?: boolean;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

const PRIMITIVE_TYPES = [
  { value: "string", label: "string" },
  { value: "number", label: "number" },
  { value: "boolean", label: "boolean" },
  { value: "array", label: "array" },
  { value: "object", label: "object (generic)" },
];

/**
 * Extracts and categorizes types nodes from the canvas into structured groups:
 * - Standalone Custom Types (user-defined - highest priority)
 * - Service Types (e.g. Conversations Types)
 * - Database Entity Types (e.g. Entity Types)
 * - Package Types (imported npm packages / agent libraries)
 */
export function extractTypeGroups(nodes: BackendNode[]): TypeGroupInfo[] {
  const customGroups: TypeGroupInfo[] = [];
  const serviceGroups: TypeGroupInfo[] = [];
  const entityGroups: TypeGroupInfo[] = [];
  const packageGroups: TypeGroupInfo[] = [];

  nodes.forEach((n) => {
    if (n.type !== "types") return;
    const types: CustomTypeItem[] = Array.isArray(n.data?.types) ? n.data.types : [];
    if (types.length === 0) return;

    const isServiceDerived = Boolean(
      n.data?.isServiceEndpointSchemas ||
        n.data?.sourceServiceId ||
        n.id.startsWith("types-service-"),
    );

    const isEntitySchemas = Boolean(
      n.data?.isEntitySchemas ||
        n.id === "types-entity-schemas" ||
        n.data?.sourceEntityId ||
        n.data?.label === "Entity Types",
    );

    const isPackageNode = Boolean(
      n.data?.isPackageNode ||
        (n.data?.packageSources && n.data.packageSources.length > 0 && !n.data?.isExtended) ||
        n.data?.packageName,
    );

    let iconType: TypeGroupInfo["iconType"] = "custom";
    let label = n.data?.label || "Custom Types";
    let serviceName: string | undefined;

    if (isServiceDerived) {
      iconType = "service";
      serviceName =
        n.data?.sourceServiceName ||
        (label && label.toLowerCase().endsWith(" types")
          ? label.replace(/\s+types$/i, "").trim()
          : undefined) ||
        "Service";
      if (!label || label === "Types") {
        label = `${serviceName} Types`;
      }
      serviceGroups.push({
        id: n.id,
        label,
        iconType,
        isServiceDerived,
        serviceName,
        types,
      });
    } else if (isEntitySchemas) {
      iconType = "entity";
      label = label || "Entity Types";
      entityGroups.push({
        id: n.id,
        label,
        iconType,
        isServiceDerived,
        serviceName,
        types,
      });
    } else if (isPackageNode) {
      iconType = "package";
      label = n.data?.packageName || label || "Package Types";
      packageGroups.push({
        id: n.id,
        label,
        iconType,
        isServiceDerived,
        serviceName,
        types,
      });
    } else {
      iconType = "custom";
      label = label || "Custom Types";
      customGroups.push({
        id: n.id,
        label,
        iconType,
        isServiceDerived,
        serviceName,
        types,
      });
    }
  });

  // Standalone user-defined types ALWAYS take precedence!
  return [...customGroups, ...serviceGroups, ...entityGroups, ...packageGroups];
}

export const TwoStepTypeSelector: React.FC<TwoStepTypeSelectorProps> = ({
  value,
  onValueChange,
  selectedTypeId,
  selectedGroupId,
  allNodes: propNodes,
  compact = false,
  className,
  triggerClassName,
  disabled = false,
}) => {
  const storeNodes = useBackendCanvasStore((s) => s.nodes);
  const nodes = propNodes ?? storeNodes;

  const typeGroups = useMemo(() => extractTypeGroups(nodes), [nodes]);

  const cleanBaseType = (value || "string").replace(/\[\]$/, "").trim();
  const isPrimitive = PRIMITIVE_TYPES.some((p) => p.value === cleanBaseType);

  const matchedGroup = useMemo(() => {
    if (isPrimitive) return undefined;
    if (selectedGroupId) {
      const g = typeGroups.find((grp) => grp.id === selectedGroupId);
      if (g) return g;
    }
    if (selectedTypeId) {
      const g = typeGroups.find((grp) => grp.types.some((t) => t.id === selectedTypeId));
      if (g) return g;
    }
    // Search typeGroups (custom user types first)
    return typeGroups.find((g) => g.types.some((t) => t.name === cleanBaseType));
  }, [typeGroups, cleanBaseType, isPrimitive, selectedGroupId, selectedTypeId]);

  const selectedTypeItemId = useMemo(() => {
    if (!matchedGroup) return undefined;
    if (selectedTypeId && matchedGroup.types.some((t) => t.id === selectedTypeId)) {
      return selectedTypeId;
    }
    const byName = matchedGroup.types.find((t) => t.name === cleanBaseType);
    return byName ? byName.id : undefined;
  }, [matchedGroup, selectedTypeId, cleanBaseType]);

  const primaryValue = useMemo(() => {
    if (matchedGroup) {
      return `group:${matchedGroup.id}`;
    }
    if (isPrimitive) {
      return `primitive:${cleanBaseType}`;
    }
    return `unlisted:${cleanBaseType}`;
  }, [matchedGroup, isPrimitive, cleanBaseType]);

  const handlePrimaryChange = (selected: string) => {
    if (selected.startsWith("primitive:")) {
      const prim = selected.replace("primitive:", "");
      onValueChange(prim, undefined, undefined);
    } else if (selected.startsWith("group:")) {
      const groupId = selected.replace("group:", "");
      const targetGroup = typeGroups.find((g) => g.id === groupId);
      if (targetGroup && targetGroup.types.length > 0) {
        // If current value is already in this group, keep it; otherwise pick first type
        const existingInGroup = targetGroup.types.find(
          (t) => (selectedTypeId && t.id === selectedTypeId) || t.name === cleanBaseType,
        );
        const picked = existingInGroup || targetGroup.types[0]!;
        onValueChange(picked.name, picked, targetGroup.id);
      }
    }
  };

  const handleSecondaryChange = (selectedTypeValue: string) => {
    if (!selectedTypeValue || !selectedTypeValue.trim()) return;
    const clean = selectedTypeValue.trim();
    const targetItem = matchedGroup?.types.find((t) => t.id === clean || t.name === clean);
    if (targetItem) {
      onValueChange(targetItem.name, targetItem, matchedGroup?.id);
    } else {
      onValueChange(clean, undefined, matchedGroup?.id);
    }
  };

  // Partition groups for organized presentation in Dropdown 1
  const customGroups = useMemo(
    () => typeGroups.filter((g) => g.iconType === "custom"),
    [typeGroups],
  );
  const serviceGroups = useMemo(
    () => typeGroups.filter((g) => g.iconType === "service"),
    [typeGroups],
  );
  const entityGroups = useMemo(
    () => typeGroups.filter((g) => g.iconType === "entity"),
    [typeGroups],
  );
  const packageGroups = useMemo(
    () => typeGroups.filter((g) => g.iconType === "package"),
    [typeGroups],
  );

  return (
    <div className={cn("flex flex-col gap-1.5 w-full nodrag", className)} onClick={(e) => e.stopPropagation()}>
      {/* Dropdown 1: Category / Source */}
      <Select value={primaryValue} onValueChange={handlePrimaryChange} disabled={disabled}>
        <SelectTrigger
          size="sm"
          className={cn(
            "h-7 text-xs bg-background font-mono w-full",
            compact ? "h-6 text-[10px]" : "h-7 text-xs",
            triggerClassName,
          )}
        >
          <SelectValue placeholder="Select type..." />
        </SelectTrigger>
        <SelectContent className="font-mono text-xs max-h-72">
          {/* Primitives */}
          <SelectGroup>
            <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/80 px-2 py-1">
              Primitives
            </SelectLabel>
            {PRIMITIVE_TYPES.map((p) => (
              <SelectItem key={p.value} value={`primitive:${p.value}`} className="text-xs font-mono">
                {p.label}
              </SelectItem>
            ))}
          </SelectGroup>

          {/* User-defined Custom Types */}
          {customGroups.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-purple-400 px-2 py-1 flex items-center gap-1">
                <Sparkles size={11} className="text-purple-400" />
                <span>Custom Types</span>
              </SelectLabel>
              {customGroups.map((g) => (
                <SelectItem
                  key={g.id}
                  value={`group:${g.id}`}
                  className="text-xs font-mono text-purple-300 font-semibold"
                >
                  {g.label} ({g.types.length})
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Service Types */}
          {serviceGroups.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-sky-400 px-2 py-1 flex items-center gap-1">
                <Globe size={11} className="text-sky-400" />
                <span>Service Types</span>
              </SelectLabel>
              {serviceGroups.map((g) => (
                <SelectItem
                  key={g.id}
                  value={`group:${g.id}`}
                  className="text-xs font-mono text-sky-300 font-semibold"
                >
                  {g.label} ({g.types.length})
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Entity Types */}
          {entityGroups.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-indigo-400 px-2 py-1 flex items-center gap-1">
                <Database size={11} className="text-indigo-400" />
                <span>Database Entity Types</span>
              </SelectLabel>
              {entityGroups.map((g) => (
                <SelectItem
                  key={g.id}
                  value={`group:${g.id}`}
                  className="text-xs font-mono text-indigo-300 font-semibold"
                >
                  {g.label} ({g.types.length})
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Package Types */}
          {packageGroups.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-emerald-400 px-2 py-1 flex items-center gap-1">
                <Package size={11} className="text-emerald-400" />
                <span>Package Types</span>
              </SelectLabel>
              {packageGroups.map((g) => (
                <SelectItem
                  key={g.id}
                  value={`group:${g.id}`}
                  className="text-xs font-mono text-emerald-300 font-semibold"
                >
                  {g.label} ({g.types.length})
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Unlisted fallback */}
          {!matchedGroup && !isPrimitive && cleanBaseType && (
            <SelectGroup>
              <SelectLabel className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/60 px-2 py-1">
                Custom Type
              </SelectLabel>
              <SelectItem value={`unlisted:${cleanBaseType}`} className="text-xs font-mono">
                {cleanBaseType}
              </SelectItem>
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {/* Dropdown 2: Specific Type inside the selected group */}
      {matchedGroup && (
        <div className="flex flex-col gap-1 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground px-0.5">
            <span className="flex items-center gap-1 font-semibold text-foreground/80">
              {matchedGroup.iconType === "service" ? (
                <Globe size={9} className="text-sky-400" />
              ) : matchedGroup.iconType === "entity" ? (
                <Database size={9} className="text-indigo-400" />
              ) : matchedGroup.iconType === "package" ? (
                <Package size={9} className="text-emerald-400" />
              ) : (
                <Sparkles size={9} className="text-purple-400" />
              )}
              <span>Select from {matchedGroup.label}:</span>
            </span>
            <span className="text-[7px] text-muted-foreground/60">
              {matchedGroup.types.length} types
            </span>
          </div>

          <Select
            value={selectedTypeItemId || cleanBaseType}
            onValueChange={handleSecondaryChange}
            disabled={disabled}
          >
            <SelectTrigger
              size="sm"
              className={cn(
                "h-7 text-xs bg-background font-mono w-full border-indigo-500/40 focus:border-indigo-500",
                compact ? "h-6 text-[10px]" : "h-7 text-xs",
                triggerClassName,
              )}
            >
              <SelectValue placeholder="Select specific type..." />
            </SelectTrigger>
            <SelectContent className="font-mono text-xs max-h-64">
              {matchedGroup.types.map((t) => {
                let display = t.name;
                if (matchedGroup.isServiceDerived && matchedGroup.serviceName) {
                  const pascal = toPascalCase(matchedGroup.serviceName);
                  if (pascal && t.name.startsWith(pascal) && t.name.length > pascal.length) {
                    display = t.name.slice(pascal.length);
                  }
                }

                return (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    className="text-xs font-mono py-1.5"
                    title={`Full type: ${t.name}`}
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-semibold text-foreground">{display}</span>
                      <span className="text-[9px] text-muted-foreground/60 uppercase font-mono">
                        ({t.kind || "type"})
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
