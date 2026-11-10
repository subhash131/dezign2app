"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  MousePointerClick,
  AlertTriangle,
  Timer,
  X,
  Check,
  Play,
  ShieldAlert,
  Loader2,
  LayoutGrid,
  ChevronDown,
  PanelLeft,
  PanelTop,
} from "lucide-react";
import { ComponentBindingType, JSONValue } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Progress } from "@workspace/ui/components/progress";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { toast } from "sonner";
import { Chat, ChatMessage } from "@workspace/ui/components/chat";

export interface ComponentBindingLivePreviewProps {
  componentType: ComponentBindingType;
  variant?: string;
  label?: string;
  name?: string;
  valueStateName?: string;
  valueStoreName?: string;
  sampleValue?: JSONValue;
  disabledStateName?: string;
  loadingStateName?: string;
  actionId?: string;
  actionName?: string;
  triggerEvent?: string;
  onSimulateAction?: () => void;
  propMappings?: any;
}

export const ComponentBindingLivePreview: React.FC<ComponentBindingLivePreviewProps> = ({
  componentType,
  variant = "default",
  label,
  name,
  valueStateName,
  valueStoreName,
  sampleValue,
  disabledStateName,
  loadingStateName,
  actionId,
  actionName,
  triggerEvent = "click",
  onSimulateAction,
  propMappings = {},
}) => {
  const displayLabel = label || name || "Component";

  // Formatted string representation of sample value
  const initialValueStr =
    sampleValue !== undefined && sampleValue !== null
      ? typeof sampleValue === "object"
        ? JSON.stringify(sampleValue)
        : String(sampleValue)
      : valueStateName
      ? `{${valueStateName}}`
      : "Sample Value";

  // Interactive local states for live preview sandbox
  const [liveInputValue, setLiveInputValue] = useState<string>(initialValueStr);
  const [debouncedLiveValue, setDebouncedLiveValue] = useState<string>(initialValueStr);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [liveSwitchChecked, setLiveSwitchChecked] = useState<boolean>(
    Boolean(sampleValue === true || sampleValue === "true" || sampleValue === 1),
  );
  const [liveCheckboxChecked, setLiveCheckboxChecked] = useState<boolean>(
    Boolean(sampleValue === true || sampleValue === "true" || sampleValue === 1),
  );
  const [liveSelectValue, setLiveSelectValue] = useState<string>("opt-1");

  // Simulation toggles for guards
  const [simulatedDisabled, setSimulatedDisabled] = useState(false);
  const [simulatedLoading, setSimulatedLoading] = useState(false);

  useEffect(() => {
    setLiveInputValue(initialValueStr);
    setDebouncedLiveValue(initialValueStr);
    setIsDebouncing(false);
  }, [initialValueStr]);

  const handleInputTextChange = (val: string) => {
    setLiveInputValue(val);
    setIsDebouncing(true);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedLiveValue(val);
      setIsDebouncing(false);
    }, 300);
  };

  const handleInputCommit = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setDebouncedLiveValue(liveInputValue);
    setIsDebouncing(false);
    if (actionId) {
      toast.success(`⚡ Action triggered: "${actionName || "Action"}" with "${liveInputValue}"`);
    } else {
      toast.info(`Committed input: "${liveInputValue}"`);
    }
  };

  const handleTriggerAction = () => {
    if (onSimulateAction) {
      onSimulateAction();
      return;
    }
    if (actionId) {
      toast.success(`⚡ Action Triggered: "${actionName || "Action"}" on ${triggerEvent}`);
    } else {
      toast.info(`Clicked component: "${displayLabel}" (No action bound yet)`);
    }
  };

  const btnVariant =
    variant === "secondary"
      ? "secondary"
      : variant === "outline"
      ? "outline"
      : variant === "destructive"
      ? "destructive"
      : "default";

  return (
    <Card className="border-purple-500/30 bg-purple-500/[0.02] shadow-xs overflow-hidden">
      {/* Header bar */}
      <CardHeader className="p-3.5 pb-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
            <Sparkles size={13} className="text-purple-500" />
            <span>Live Interactive Preview</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-mono capitalize border-purple-500/30 text-purple-600 dark:text-purple-400">
              &lt;{componentType}&gt;
            </Badge>
            <Badge variant="secondary" className="text-[9px] font-mono">
              Live Sandbox
            </Badge>
          </div>
        </div>
      </CardHeader>

      {/* Main interactive stage */}
      <CardContent className="p-6 flex flex-col items-center justify-center min-h-[120px] bg-background/50">
        {simulatedLoading ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground animate-pulse">
            <Loader2 size={15} className="animate-spin text-purple-500" />
            <span>Simulating loading guard ({loadingStateName || "loading"})...</span>
          </div>
        ) : (
          <>
            {/* 1. BUTTON */}
            {componentType === "button" && (
              <Button
                variant={btnVariant}
                size="sm"
                disabled={simulatedDisabled}
                className={cn(
                  "gap-2 shadow-xs transition-transform active:scale-95 cursor-pointer font-medium",
                  simulatedDisabled && "opacity-50 cursor-not-allowed",
                )}
                onClick={handleTriggerAction}
              >
                <MousePointerClick size={12} />
                <span>{displayLabel}</span>
              </Button>
            )}

            {/* 2. TEXT INPUT */}
            {componentType === "input" && (
              <div className="w-full max-w-xs flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">{displayLabel}</Label>
                  <span className="text-[9px] font-mono text-purple-500 bg-purple-500/10 px-1 py-0.2 rounded border border-purple-500/20 flex items-center gap-0.5">
                    <Timer size={9} />
                    300ms debounce
                  </span>
                </div>
                <div className="relative flex items-center">
                  <Input
                    value={liveInputValue}
                    onChange={(e) => handleInputTextChange(e.target.value)}
                    placeholder={`Enter ${displayLabel}...`}
                    disabled={simulatedDisabled}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInputCommit();
                    }}
                    className={cn(
                      "h-8 text-xs font-mono shadow-2xs pr-7 bg-background focus:ring-1 focus:ring-purple-500/40",
                      simulatedDisabled && "opacity-50 cursor-not-allowed bg-muted/30",
                    )}
                  />
                  {liveInputValue && !simulatedDisabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setLiveInputValue("");
                        setDebouncedLiveValue("");
                      }}
                      className="absolute right-2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Clear"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                  {isDebouncing ? (
                    <span className="text-amber-500 flex items-center gap-1 font-mono text-[9px] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      Debouncing...
                    </span>
                  ) : (
                    <span className="text-emerald-500 flex items-center gap-1 font-mono text-[9px]">
                      <Check size={10} />
                      Committed: &quot;{debouncedLiveValue}&quot;
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground/60 font-mono">
                    ↵ Enter to trigger
                  </span>
                </div>
              </div>
            )}

            {/* 3. CARD */}
            {componentType === "card" && (
              <div
                onClick={actionId ? handleTriggerAction : undefined}
                className={cn(
                  "p-4 rounded-xl bg-card border border-border/80 shadow-xs min-w-[200px] max-w-xs transition-all",
                  actionId && "cursor-pointer hover:border-purple-500/60 hover:shadow-sm active:scale-98",
                )}
              >
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>{displayLabel}</span>
                  {valueStoreName && (
                    <span className="text-[9px] font-mono text-purple-500 lowercase">{valueStoreName}</span>
                  )}
                </div>
                <div className="text-base font-bold text-foreground mt-1.5 font-mono">
                  {liveInputValue || "42 Active"}
                </div>
                {actionId && (
                  <div className="mt-2 text-[9px] text-purple-600 dark:text-purple-400 font-mono flex items-center gap-1">
                    <MousePointerClick size={10} />
                    <span>Click to trigger &quot;{actionName}&quot;</span>
                  </div>
                )}
              </div>
            )}

            {/* 4. SWITCH */}
            {componentType === "switch" && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/60">
                <Switch
                  checked={liveSwitchChecked}
                  disabled={simulatedDisabled}
                  onCheckedChange={(checked) => {
                    setLiveSwitchChecked(checked);
                    toast.info(`Switch toggled to: ${checked ? "ON" : "OFF"}`);
                    if (actionId) handleTriggerAction();
                  }}
                />
                <div className="flex flex-col">
                  <Label className="text-xs font-semibold cursor-pointer">{displayLabel}</Label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    State: {liveSwitchChecked ? "true" : "false"}
                  </span>
                </div>
              </div>
            )}

            {/* 5. CHECKBOX */}
            {componentType === "checkbox" && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/60">
                <Checkbox
                  checked={liveCheckboxChecked}
                  disabled={simulatedDisabled}
                  onCheckedChange={(checked) => {
                    const isChecked = Boolean(checked);
                    setLiveCheckboxChecked(isChecked);
                    toast.info(`Checkbox: ${isChecked ? "Checked" : "Unchecked"}`);
                    if (actionId) handleTriggerAction();
                  }}
                />
                <Label className="text-xs font-semibold cursor-pointer">{displayLabel}</Label>
              </div>
            )}

            {/* 6. PROGRESS BAR */}
            {componentType === "progress" && (
              <div className="w-full max-w-xs flex flex-col gap-1.5 p-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>{displayLabel}</span>
                  <span className="font-mono text-muted-foreground">65%</span>
                </div>
                <Progress value={65} max={100} className="h-2" />
                <span className="text-[9px] text-muted-foreground font-mono">Max: 100</span>
              </div>
            )}

            {/* 7. BADGE */}
            {componentType === "badge" && (
              <Badge
                variant={btnVariant}
                className={cn(
                  "px-3 py-1 text-xs transition-all gap-1",
                  actionId && "cursor-pointer hover:scale-105 active:scale-95 shadow-sm",
                )}
                onClick={actionId ? handleTriggerAction : undefined}
              >
                <span>{displayLabel}</span>
                {liveInputValue && <span className="font-mono opacity-80">: {liveInputValue}</span>}
              </Badge>
            )}

            {/* 8. DATA TABLE */}
            {componentType === "table" && (
              <div className="w-full max-w-xs rounded-lg border border-border/70 overflow-hidden shadow-2xs">
                <div className="bg-muted/40 p-2 text-[10px] font-bold text-muted-foreground flex items-center justify-between border-b border-border/60">
                  <div className="flex items-center gap-1.5">
                    <LayoutGrid size={11} className="text-purple-500" />
                    <span>{displayLabel}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">3 rows</Badge>
                </div>
                <div className="divide-y divide-border/40 text-[11px] font-mono bg-card">
                  <div className="p-2 flex justify-between hover:bg-muted/20 cursor-pointer">
                    <span>#1 Item Alpha</span>
                    <span className="text-emerald-500 font-semibold">$120.00</span>
                  </div>
                  <div className="p-2 flex justify-between hover:bg-muted/20 cursor-pointer">
                    <span>#2 Item Beta</span>
                    <span className="text-emerald-500 font-semibold">$85.50</span>
                  </div>
                  <div className="p-2 flex justify-between hover:bg-muted/20 cursor-pointer">
                    <span>#3 Item Gamma</span>
                    <span className="text-emerald-500 font-semibold">$240.00</span>
                  </div>
                </div>
              </div>
            )}

            {/* 9. SELECT DROPDOWN */}
            {componentType === "select" && (
              <div className="w-full max-w-xs flex flex-col gap-1.5">
                <Label className="text-[11px] text-muted-foreground">{displayLabel}</Label>
                <Select
                  value={liveSelectValue}
                  onValueChange={(val) => {
                    setLiveSelectValue(val);
                    toast.info(`Selected option: ${val}`);
                    if (actionId) handleTriggerAction();
                  }}
                  disabled={simulatedDisabled}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Choose option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opt-1">Option 1: Primary Model</SelectItem>
                    <SelectItem value="opt-2">Option 2: Secondary Flow</SelectItem>
                    <SelectItem value="opt-3">Option 3: Fallback Mode</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 10. ALERT */}
            {componentType === "alert" && (
              <Alert className="max-w-xs py-2 px-3 border-purple-500/30 bg-purple-500/5">
                <AlertTriangle className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                <AlertDescription className="text-xs">
                  <div className="font-semibold text-foreground mb-0.5">{displayLabel}</div>
                  <span className="text-muted-foreground">{liveInputValue}</span>
                </AlertDescription>
              </Alert>
            )}

            {/* 11. AVATAR */}
            {componentType === "avatar" && (
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarFallback className="bg-purple-500/20 text-purple-600 dark:text-purple-400 font-bold text-xs">
                    {displayLabel.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{displayLabel}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{liveInputValue}</span>
                </div>
              </div>
            )}

            {/* 12. SKELETON */}
            {componentType === "skeleton" && (
              <div className="flex items-center gap-3">
                <Skeleton className="h-7 w-28 rounded-md bg-purple-500/20" />
                <span className="text-xs text-muted-foreground font-mono">({displayLabel} loading...)</span>
              </div>
            )}

            {/* 13. SIDEBAR */}
            {componentType === "sidebar" && (() => {
              const items = Array.isArray(sampleValue) && sampleValue.length > 0
                ? sampleValue
                : [
                    { id: "nav-1", name: "Dashboard", link: "/dashboard" },
                    { id: "nav-2", name: "Analytics", link: "/analytics" },
                    { id: "nav-3", name: "Projects", link: "/projects" },
                    { id: "nav-4", name: "Settings", link: "/settings" },
                  ];

              return (
                <div className="w-full max-w-xs rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col text-xs">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-[10px]">
                        <PanelLeft size={12} />
                      </div>
                      <span className="font-semibold text-xs text-foreground truncate max-w-[140px]">
                        {displayLabel}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[8px] font-mono px-1 py-0">
                      sidebar
                    </Badge>
                  </div>
                  <div className="p-2 flex flex-col gap-1">
                    {items.map((item: any, idx: number) => {
                      const isActive = idx === 0;
                      return (
                        <div
                          key={item.id || idx}
                          onClick={() => {
                            if (!simulatedDisabled) {
                              toast.info(`Clicked "${item.name || item.link}"`);
                              if (actionId) onSimulateAction?.();
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-colors text-xs cursor-pointer",
                            isActive
                              ? "bg-purple-600 text-white font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            simulatedDisabled && "opacity-50 pointer-events-none"
                          )}
                        >
                          <span className="truncate">{item.name || `Link ${idx + 1}`}</span>
                          <span className={cn(
                            "text-[9px] font-mono",
                            isActive ? "text-purple-100" : "text-muted-foreground/60"
                          )}>
                            {item.link || "#"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 text-[9px] text-muted-foreground flex items-center justify-between font-mono">
                    <span>{valueStateName ? `{${valueStateName}}` : "Static/Default"}</span>
                    <span>{items.length} items</span>
                  </div>
                </div>
              );
            })()}

            {/* 14. TOPBAR */}

            {componentType === "chat" && (() => {
              const sampleMessages: ChatMessage[] = Array.isArray(sampleValue)
                ? (sampleValue as any[]).map((m, idx) => ({
                    id: m?.id || `msg-${idx + 1}`,
                    role: m?.role === "user" ? "user" : "assistant",
                    content: typeof m?.content === "string" ? m.content : (typeof m === "string" ? m : JSON.stringify(m)),
                  }))
                : [
                    {
                      id: "msg-1",
                      role: "user",
                      content: "How does the AI Elements Chat work?",
                    },
                    {
                      id: "msg-2",
                      role: "assistant",
                      content: "It uses MessageScrollerProvider, Message, and Bubble turns with live auto-scrolling!",
                    },
                  ];

              const alignment = propMappings?.chatAlignment || "center";
              const maxWidth = propMappings?.chatMaxWidth;
              const height = propMappings?.chatHeight;

              let maxWClass = "max-w-sm";
              if (maxWidth === "sm") maxWClass = "max-w-xs";
              else if (maxWidth === "md") maxWClass = "max-w-sm";
              else if (maxWidth === "lg") maxWClass = "max-w-md";
              else if (maxWidth === "xl" || maxWidth === "2xl" || maxWidth === "full" || alignment === "full") maxWClass = "w-full";

              let alignClass = "justify-center";
              if (alignment === "left" || alignment === "floating-left") alignClass = "justify-start";
              else if (alignment === "right" || alignment === "floating-right") alignClass = "justify-end";
              else if (alignment === "full") alignClass = "w-full";

              let heightClass = "h-[280px]";
              if (height === "sm") heightClass = "h-[240px]";
              else if (height === "lg" || height === "xl" || height === "full") heightClass = "h-[340px]";

              return (
                <div className={cn("w-full flex transition-all duration-200", alignClass)}>
                  <div className={cn("w-full transition-all duration-200", maxWClass)}>
                    <Chat
                      title={displayLabel}
                      placeholder="Type a message..."
                      messages={sampleMessages}
                      className={heightClass}
                      onSendMessage={(text) => {
                        toast.info(`Sent message: "${text}"`);
                        if (onSimulateAction) onSimulateAction();
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {componentType === "topbar" && (() => {
              const items = Array.isArray(sampleValue) && sampleValue.length > 0
                ? sampleValue
                : [
                    { id: "nav-1", name: "Home", link: "/" },
                    { id: "nav-2", name: "Features", link: "/features" },
                    { id: "nav-3", name: "Pricing", link: "/pricing" },
                    { id: "nav-4", name: "About", link: "/about" },
                  ];

              return (
                <div className="w-full max-w-sm rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col text-xs">
                  {/* Top Bar Navigation Preview */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/40 gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground truncate shrink-0">
                      <PanelTop size={13} className="text-primary shrink-0" />
                      <span>{displayLabel || "Dezign App"}</span>
                    </div>

                    {/* Nav Links */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {items.slice(0, 3).map((item: any, idx: number) => (
                        <span
                          key={item.id || idx}
                          onClick={() => {
                            if (!simulatedDisabled) {
                              toast.info(`Clicked "${item.name || item.link}"`);
                              if (actionId) onSimulateAction?.();
                            }
                          }}
                          className={cn(
                            "text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded",
                            idx === 0 && "font-semibold text-foreground",
                            simulatedDisabled && "opacity-50 pointer-events-none"
                          )}
                        >
                          {item.name || `Link ${idx + 1}`}
                        </span>
                      ))}
                    </div>

                    {/* Auth Buttons */}
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={simulatedDisabled}
                        onClick={() => {
                          toast.info("Navigating to Sign In (/login)...");
                          if (actionId) onSimulateAction?.();
                        }}
                        className="h-6 px-1.5 text-[10px] font-medium cursor-pointer"
                      >
                        Sign In
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={simulatedDisabled}
                        onClick={() => {
                          toast.info("Navigating to Register (/register)...");
                          if (actionId) onSimulateAction?.();
                        }}
                        className="h-6 px-2 text-[10px] font-medium cursor-pointer shadow-xs"
                      >
                        Register
                      </Button>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 bg-muted/20 text-[9px] text-muted-foreground flex items-center justify-between font-mono">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                      Public Layout Navigation
                    </span>
                    <span>{items.length} links + Auth CTAs</span>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </CardContent>

      {/* Interactive Simulation Controls Strip */}
      <div className="px-4 py-2.5 bg-muted/30 border-t border-border/40 flex items-center justify-between gap-2 flex-wrap text-xs">
        {/* Guard test toggles */}
        <div className="flex items-center gap-2">
          {disabledStateName ? (
            <Button
              type="button"
              variant={simulatedDisabled ? "default" : "outline"}
              size="sm"
              onClick={() => setSimulatedDisabled(!simulatedDisabled)}
              className={cn(
                "h-6 text-[10px] px-2 gap-1 font-mono",
                simulatedDisabled && "bg-amber-600 hover:bg-amber-700 text-white border-transparent",
              )}
            >
              <ShieldAlert size={10} />
              <span>{simulatedDisabled ? "Disable Guard: ACTIVE" : `Simulate (${disabledStateName})`}</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant={simulatedDisabled ? "default" : "ghost"}
              size="sm"
              onClick={() => setSimulatedDisabled(!simulatedDisabled)}
              className="h-6 text-[10px] px-2 gap-1 text-muted-foreground"
            >
              <span>{simulatedDisabled ? "Disabled: ON" : "Test Disabled"}</span>
            </Button>
          )}

          {loadingStateName && (
            <Button
              type="button"
              variant={simulatedLoading ? "default" : "outline"}
              size="sm"
              onClick={() => setSimulatedLoading(!simulatedLoading)}
              className="h-6 text-[10px] px-2 gap-1 font-mono"
            >
              <Loader2 size={10} className={simulatedLoading ? "animate-spin" : ""} />
              <span>{simulatedLoading ? "Loading: ON" : `Simulate (${loadingStateName})`}</span>
            </Button>
          )}
        </div>

        {/* Action simulator button */}
        {actionId && (
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={handleTriggerAction}
            className="h-6 text-[10px] px-2.5 gap-1 bg-purple-600 hover:bg-purple-700 text-white font-medium ml-auto"
          >
            <Play size={10} className="fill-current" />
            <span>Test {triggerEvent} → &quot;{actionName}&quot;</span>
          </Button>
        )}
      </div>
    </Card>
  );
};
