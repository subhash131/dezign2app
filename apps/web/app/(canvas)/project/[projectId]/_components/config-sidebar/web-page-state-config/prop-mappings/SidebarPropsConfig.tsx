"use client";

import React, { useMemo, useCallback } from "react";
import {
  PanelLeft,
  PanelRight,
  SlidersHorizontal,
  Zap,
  Plus,
  Trash2,
  FolderKanban,
  Layers,
  Sparkles,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { StateStoreVariablePicker } from "../StateStoreVariablePicker";
import { isSidebarCollapsible, isSidebarVariant, isSidebarSide } from "../constants";
import { SidebarPropsConfigProps, SidebarGroupConfig } from "./types";
import { SidebarStaticItemRow } from "./SidebarStaticItemRow";
import { SidebarStaticItem } from "@/types/canvas";

export const SidebarPropsConfig: React.FC<SidebarPropsConfigProps> = React.memo(({
  propMappings,
  onUpdatePropMapping,
  stateStores,
  effectiveStoreName,
  effectiveStoreId,
  onCreateNavStateVariable,
  availableActions = [],
  onOpenEventConfig,
  onCreateAction,
}) => {
  // Derive groups from propMappings.sidebarGroups or fallback to legacy single group
  const rawGroups = propMappings.sidebarGroups;
  const groups: SidebarGroupConfig[] = useMemo(() => {
    if (rawGroups && rawGroups.length > 0) {
      return rawGroups;
    }
    const legacyMode = propMappings.sidebarNavMode || "static";
    const legacyItems = propMappings.sidebarStaticItems ?? [
      { id: "nav-1", name: "Dashboard", link: "/dashboard", icon: "LayoutDashboard" },
      { id: "nav-2", name: "Analytics", link: "/analytics", icon: "BarChart3" },
      { id: "nav-3", name: "Projects", link: "/projects", icon: "Folder" },
      { id: "nav-4", name: "Settings", link: "/settings", icon: "Settings" },
    ];
    return [
      {
        id: "group-1",
        label: "Navigation",
        mode: legacyMode,
        items: legacyItems,
        navBinding: propMappings.sidebarNavBinding || propMappings.valueBinding || "navItems",
        navStoreId: propMappings.sidebarNavStoreId || effectiveStoreId,
        navStoreName: propMappings.sidebarNavStoreName || effectiveStoreName,
      },
    ];
  }, [
    rawGroups,
    propMappings.sidebarNavMode,
    propMappings.sidebarStaticItems,
    propMappings.sidebarNavBinding,
    propMappings.valueBinding,
    propMappings.sidebarNavStoreId,
    effectiveStoreId,
    propMappings.sidebarNavStoreName,
    effectiveStoreName,
  ]);

  const updateGroups = useCallback((newGroups: SidebarGroupConfig[]) => {
    const firstGroup = newGroups[0];
    onUpdatePropMapping({
      sidebarGroups: newGroups,
      ...(firstGroup
        ? {
            sidebarNavMode: firstGroup.mode || "static",
            sidebarNavBinding: firstGroup.navBinding,
            sidebarNavStoreId: firstGroup.navStoreId,
            sidebarNavStoreName: firstGroup.navStoreName,
            sidebarStaticItems: firstGroup.items,
          }
        : {}),
    });
  }, [onUpdatePropMapping]);

  const handleAddGroup = () => {
    const nextGroupId = `group-${Date.now()}`;
    const newGroup: SidebarGroupConfig = {
      id: nextGroupId,
      label: `Section ${groups.length + 1}`,
      mode: "static",
      items: [
        {
          id: `nav-${Date.now()}-1`,
          name: `Page 1`,
          link: `/page-${groups.length + 1}`,
          icon: "Circle",
        },
      ],
    };
    updateGroups([...groups, newGroup]);
  };

  const handleUpdateGroup = (groupId: string, patch: Partial<SidebarGroupConfig>) => {
    const updated = groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g));
    updateGroups(updated);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (groups.length <= 1) return;
    const updated = groups.filter((g) => g.id !== groupId);
    updateGroups(updated);
  };

  const handleAddItemToGroup = (groupId: string) => {
    const targetGroup = groups.find((g) => g.id === groupId);
    if (!targetGroup) return;
    const currentItems = targetGroup.items || [];
    const nextId = `nav-${Date.now()}`;
    const newItem: SidebarStaticItem = {
      id: nextId,
      name: `Page ${currentItems.length + 1}`,
      link: `/page-${currentItems.length + 1}`,
      icon: "Circle",
    };
    handleUpdateGroup(groupId, {
      items: [...currentItems, newItem],
    });
  };

  const handleUpdateItemInGroup = (
    groupId: string,
    itemId: string,
    patch: Partial<SidebarStaticItem>,
  ) => {
    const targetGroup = groups.find((g) => g.id === groupId);
    if (!targetGroup) return;
    const currentItems = targetGroup.items || [];
    const updated = currentItems.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    );
    handleUpdateGroup(groupId, { items: updated });
  };

  const handleDeleteItemInGroup = (groupId: string, itemId: string) => {
    const targetGroup = groups.find((g) => g.id === groupId);
    if (!targetGroup) return;
    const currentItems = targetGroup.items || [];
    const updated = currentItems.filter((item) => item.id !== itemId);
    handleUpdateGroup(groupId, { items: updated });
  };

  const staticGroupsCount = groups.filter((g) => g.mode === "static").length;
  const dynamicGroupsCount = groups.filter((g) => g.mode === "dynamic").length;

  return (
    <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-muted/20 border border-border/50 text-xs">
      {/* Header pill / group status indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-[11px]">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <PanelLeft size={13} className="text-primary" />
          <span>Sidebar Navigation Setup</span>
        </div>
        <div className="flex items-center gap-1">
          {dynamicGroupsCount > 0 && (
            <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {dynamicGroupsCount} Dynamic
            </Badge>
          )}
          {staticGroupsCount > 0 && (
            <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-emerald-500 border-emerald-500/30">
              {staticGroupsCount} Static
            </Badge>
          )}
          <Badge variant="secondary" className="text-[9px] font-mono px-1.5 py-0 bg-primary/10 text-primary border border-primary/20">
            {groups.length} {groups.length === 1 ? "Group" : "Groups"}
          </Badge>
        </div>
      </div>

      {/* Sidebar Title / Header Brand */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-foreground flex items-center justify-between">
          <span>Sidebar Title / Header</span>
          <span className="text-[9px] text-muted-foreground font-mono">title</span>
        </Label>
        <LocalInput
          value={propMappings.sidebarTitle ?? "Dezign App"}
          onChange={(e) => onUpdatePropMapping({ sidebarTitle: e.target.value })}
          placeholder="Dezign App"
          className="h-8 text-xs bg-background"
        />
      </div>

      {/* Layout & Behavior Selectors (Side, Variant, Collapsible) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-medium text-foreground flex items-center gap-1.5">
            <SlidersHorizontal size={11} className="text-primary" />
            <span>Layout & Shadcn Variants</span>
          </Label>
          <code className="text-[9px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
            {`<Sidebar side="${propMappings.sidebarSide || "left"}" variant="${propMappings.sidebarVariant || "sidebar"}" collapsible="${propMappings.sidebarCollapsible || "offcanvas"}" />`}
          </code>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* 1. Placement / Side */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Position / Side</span>
              <span className="font-mono text-[9px] text-cyan-500">side</span>
            </Label>
            <Select
              value={propMappings.sidebarSide || "left"}
              onValueChange={(val) => {
                if (isSidebarSide(val)) {
                  onUpdatePropMapping({ sidebarSide: val });
                }
              }}
            >
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <PanelLeft size={12} className="text-muted-foreground" />
                    <span>Left (Default)</span>
                  </div>
                </SelectItem>
                <SelectItem value="right" className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <PanelRight size={12} className="text-muted-foreground" />
                    <span>Right (Docked)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 2. Visual Variant */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Visual Variant</span>
              <span className="font-mono text-[9px] text-cyan-500">variant</span>
            </Label>
            <Select
              value={propMappings.sidebarVariant || "sidebar"}
              onValueChange={(val) => {
                if (isSidebarVariant(val)) {
                  onUpdatePropMapping({ sidebarVariant: val });
                }
              }}
            >
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sidebar" className="text-xs">Standard (sidebar)</SelectItem>
                <SelectItem value="floating" className="text-xs">Floating Card (floating)</SelectItem>
                <SelectItem value="inset" className="text-xs">Inset Panel (inset)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Collapsible Mode */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Collapsible Mode</span>
              <span className="font-mono text-[9px] text-cyan-500">collapsible</span>
            </Label>
            <Select
              value={propMappings.sidebarCollapsible || "offcanvas"}
              onValueChange={(val) => {
                if (isSidebarCollapsible(val)) {
                  onUpdatePropMapping({ sidebarCollapsible: val });
                }
              }}
            >
              <SelectTrigger className="h-7 text-[11px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offcanvas" className="text-xs">Offcanvas (Drawer)</SelectItem>
                <SelectItem value="icon" className="text-xs">Icon Rail (Rail)</SelectItem>
                <SelectItem value="none" className="text-xs">None (Fixed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Sidebar Groups (<SidebarGroup />) */}
      <div className="space-y-3 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <FolderKanban size={13} className="text-primary" />
              <span>Sidebar Groups</span>
              <code className="text-[9px] font-mono text-muted-foreground bg-muted/60 px-1 py-0.2 rounded">
                &lt;SidebarGroup /&gt;
              </code>
            </Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Combine static navigation and dynamic store-bound routes in structured shadcn groups.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddGroup}
            className="h-6 text-[10px] gap-1 px-2 cursor-pointer border-dashed hover:border-primary"
          >
            <Plus size={10} />
            <span>Add Group</span>
          </Button>
        </div>

        {/* Groups List */}
        <div className="space-y-3">
          {groups.map((group, groupIdx) => {
            const isDynamic = group.mode === "dynamic";
            const groupItems = group.items || [];

            return (
              <div
                key={group.id || groupIdx}
                className="flex flex-col gap-2.5 p-3 rounded-lg bg-background/60 border border-border/60 hover:border-border transition-colors shadow-2xs"
              >
                {/* Group Card Header */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/30">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 shrink-0 text-muted-foreground">
                      #{groupIdx + 1}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <LocalInput
                        value={group.label ?? `Section ${groupIdx + 1}`}
                        onChange={(e) => handleUpdateGroup(group.id, { label: e.target.value })}
                        placeholder="Group Label (e.g. Platform, Projects, Settings)"
                        className="h-7 text-xs font-semibold bg-background/90"
                      />
                    </div>
                  </div>

                  {/* Mode Toggle for this Group */}
                  <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded-md border border-border/40 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUpdateGroup(group.id, { mode: "dynamic" })}
                      className={`py-0.5 px-2 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                        isDynamic
                          ? "bg-background text-foreground shadow-2xs font-semibold text-sky-500"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ⚡ Dynamic
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateGroup(group.id, { mode: "static" })}
                      className={`py-0.5 px-2 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                        !isDynamic
                          ? "bg-background text-foreground shadow-2xs font-semibold text-emerald-500"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Static
                    </button>
                  </div>

                  {/* Delete Group Button */}
                  {groups.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGroup(group.id)}
                      title="Delete this Sidebar Group"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>

                {/* Group Body: Dynamic vs Static */}
                {isDynamic ? (
                  <div className="flex flex-col gap-2.5 pt-1">
                    {/* 1-Click State Store Shortcut Banner for this group */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-sky-500/[0.06] border border-sky-500/20">
                      <div className="flex items-center gap-2">
                        <div className="p-1 rounded bg-sky-500/20 text-sky-600 dark:text-sky-400 shrink-0">
                          <Zap size={12} />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Auto-bind <span className="font-mono font-medium text-foreground">{group.label ? `${group.label.toLowerCase().replace(/[^a-z0-9]/g, "")}Items` : "navItems"}</span> variable in State Store
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onCreateNavStateVariable?.(group.navStoreId || effectiveStoreId)}
                        className="h-6 text-[10px] font-medium bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shrink-0 ml-2"
                      >
                        <Zap size={10} className="mr-1" />
                        Create & Bind
                      </Button>
                    </div>

                    {/* State Store Variable Picker for this Group */}
                    <StateStoreVariablePicker
                      label={`"${group.label || "Group"}" Items Variable`}
                      propName={group.label ? `${group.label.toLowerCase().replace(/[^a-z0-9]/g, "")}Items` : "navItems"}
                      valueBinding={group.navBinding || "navItems"}
                      storeName={group.navStoreName || effectiveStoreName}
                      storeId={group.navStoreId || effectiveStoreId}
                      mode="store_var"
                      stateStores={stateStores}
                      expectedType="any"
                      placeholder="navItems"
                      description={`State store variable containing navigation items (NavItem[]) for ${group.label || "this group"}.`}
                      onChange={(res) => {
                        handleUpdateGroup(group.id, {
                          navBinding: res.valueBinding,
                          navStoreName: res.storeName,
                          navStoreId: res.storeId,
                        });
                      }}
                    />

                    {/* Field contract hint */}
                    <div className="p-2 rounded bg-background/80 border border-border/30 text-[10px] space-y-0.5">
                      <span className="font-semibold text-muted-foreground uppercase text-[9px] tracking-wider">
                        Expected Item Fields:
                      </span>
                      <span className="font-mono text-muted-foreground ml-1.5">
                        <span className="text-foreground">id</span>, <span className="text-foreground">name</span>, <span className="text-foreground">link</span>, <span className="text-foreground">icon?</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-foreground">
                        Static Navigation Items ({groupItems.length})
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddItemToGroup(group.id)}
                        className="h-5 text-[9px] gap-1 px-1.5 cursor-pointer"
                      >
                        <Plus size={9} />
                        <span>Add Item</span>
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      {groupItems.map((item, idx) => (
                        <SidebarStaticItemRow
                          key={item.id || idx}
                          item={item}
                          idx={idx}
                          stateStores={stateStores}
                          availableActions={availableActions}
                          onOpenEventConfig={onOpenEventConfig}
                          onCreateAction={onCreateAction}
                          onUpdate={(patch) => handleUpdateItemInGroup(group.id, item.id, patch)}
                          onDelete={() => handleDeleteItemInGroup(group.id, item.id)}
                        />
                      ))}

                      {groupItems.length === 0 && (
                        <div className="p-3 text-center text-[11px] text-muted-foreground border border-dashed rounded-lg">
                          No navigation items in this group. Click "+ Add Item" above.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
SidebarPropsConfig.displayName = "SidebarPropsConfig";
