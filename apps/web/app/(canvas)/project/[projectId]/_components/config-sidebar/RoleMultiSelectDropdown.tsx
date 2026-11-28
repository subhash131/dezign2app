"use client";

import React, { useMemo, useState } from "react";
import { BackendNode, resolveAuthRoles } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command";
import { ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface RoleMultiSelectDropdownProps {
  /** Currently selected role names. */
  selectedRoles: string[];
  /** Callback invoked whenever the selected roles array changes. */
  onChange: (roles: string[]) => void;
  /** Optional explicit AuthNode to source role options from; falls back to canvas AuthNode. */
  authNode?: BackendNode;
  /** Which AuthNode role set(s) to expose in the dropdown ("all" | "user" | "org"). */
  scope?: "all" | "user" | "org";
  /** Placeholder shown when no roles are selected. */
  placeholder?: string;
  className?: string;
}

/**
 * Reusable multi-select dropdown for picking RBAC roles defined on the canvas AuthNode.
 *
 * Why:
 * - Prevents typos across `AuthVerifyStepSection`, `EndpointConfig`, and `WebPageProtectionSection`
 *   by pulling global user roles and organization roles straight from `resolveAuthRoles(authNode.data)`.
 * - Supports scoping to `"user"` or `"org"` so `auth_verify` can distinguish global user roles
 *   from organization membership roles (e.g. `"admin"` exists in both).
 * - Still allows adding an ad-hoc custom role inside the popover when needed.
 */
export const RoleMultiSelectDropdown: React.FC<RoleMultiSelectDropdownProps> = ({
  selectedRoles,
  onChange,
  authNode,
  scope = "all",
  placeholder = "Any authenticated user (all roles)",
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const storeNodes = useBackendCanvasStore((s) => s.nodes);

  const effectiveAuthNode = useMemo(() => {
    if (authNode) return authNode;
    return storeNodes.find((n) => n.type === "auth");
  }, [authNode, storeNodes]);

  const { userRoles, orgRoles, allRoles } = useMemo(
    () => resolveAuthRoles(effectiveAuthNode?.data),
    [effectiveAuthNode?.data],
  );

  const normalizedSelected = useMemo(
    () => Array.from(new Set((selectedRoles || []).map((r) => r.trim()).filter(Boolean))),
    [selectedRoles],
  );

  const visibleUserRoles = scope === "org" ? [] : userRoles;
  const visibleOrgRoles =
    scope === "user"
      ? []
      : scope === "org"
      ? orgRoles
      : orgRoles.filter((r) => !userRoles.includes(r));

  const availablePool = useMemo(
    () =>
      scope === "user"
        ? userRoles
        : scope === "org"
        ? orgRoles
        : allRoles,
    [scope, userRoles, orgRoles, allRoles],
  );

  // Include any previously saved custom roles not currently in AuthNode so they remain visible/removable
  const extraSelectedRoles = useMemo(
    () => normalizedSelected.filter((r) => !availablePool.includes(r)),
    [normalizedSelected, availablePool],
  );

  const toggleRole = (role: string) => {
    if (normalizedSelected.includes(role)) {
      onChange(normalizedSelected.filter((r) => r !== role));
    } else {
      onChange([...normalizedSelected, role]);
    }
  };

  const trimmedSearch = search
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
  const canAddCustom =
    Boolean(trimmedSearch) &&
    !availablePool.includes(trimmedSearch) &&
    !extraSelectedRoles.includes(trimmedSearch);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "min-h-7 h-auto w-full justify-between px-2 py-1 text-xs font-normal bg-background/70 border-border/60 hover:bg-background",
            className,
          )}
        >
          <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1 text-left">
            {normalizedSelected.length === 0 ? (
              <span className="text-muted-foreground truncate">{placeholder}</span>
            ) : (
              normalizedSelected.map((role) => (
                <Badge
                  key={role}
                  variant="secondary"
                  className="text-[10px] font-mono px-1.5 py-0 h-4 gap-1 bg-indigo-500/15 text-indigo-500 border-indigo-500/30"
                >
                  <span>{role}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRole(role);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleRole(role);
                      }
                    }}
                    className="hover:text-destructive cursor-pointer"
                    aria-label={`Remove role ${role}`}
                  >
                    <X size={9} />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Filter or add custom role..."
            value={search}
            onValueChange={setSearch}
            className="h-8 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-2 px-3 text-[11px] text-muted-foreground">
              {canAddCustom ? "Press below to add custom role." : "No matching roles found."}
            </CommandEmpty>

            {visibleUserRoles.length > 0 && (
              <CommandGroup heading="User Roles">
                {visibleUserRoles.map((role) => {
                  const checked = normalizedSelected.includes(role);
                  return (
                    <CommandItem
                      key={`user-${role}`}
                      value={role}
                      onSelect={() => toggleRole(role)}
                      className="text-xs font-mono flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span>{role}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {visibleOrgRoles.length > 0 && (
              <>
                {visibleUserRoles.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Organization Roles">
                  {visibleOrgRoles.map((role) => {
                    const checked = normalizedSelected.includes(role);
                    return (
                      <CommandItem
                        key={`org-${role}`}
                        value={role}
                        onSelect={() => toggleRole(role)}
                        className="text-xs font-mono flex items-center gap-2 cursor-pointer"
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span>{role}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {extraSelectedRoles.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Custom Selected">
                  {extraSelectedRoles.map((role) => (
                    <CommandItem
                      key={`custom-${role}`}
                      value={role}
                      onSelect={() => toggleRole(role)}
                      className="text-xs font-mono flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox checked className="pointer-events-none" />
                      <span>{role}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {canAddCustom && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__add__${trimmedSearch}`}
                    onSelect={() => {
                      onChange([...normalizedSelected, trimmedSearch]);
                      setSearch("");
                    }}
                    className="text-xs font-mono text-indigo-500 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Add &quot;{trimmedSearch}&quot;</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}

            {normalizedSelected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value="__clear_all__"
                    onSelect={() => onChange([])}
                    className="text-[11px] text-muted-foreground justify-center cursor-pointer"
                  >
                    Clear selected roles
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
