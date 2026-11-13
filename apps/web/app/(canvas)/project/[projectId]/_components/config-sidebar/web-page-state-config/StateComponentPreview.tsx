"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, MousePointerClick, AlertTriangle, Timer, X, Check, PanelLeft, PanelTop, PanelLeftClose, PanelLeftOpen, LayoutDashboard, BarChart2, Folder, Settings, Menu } from "lucide-react";
import {
  StateRenderComponent,
  StateRenderConfig,
  ComponentPropMappings,
  ComponentElementBinding,
  JSONValue,
} from "@/types/canvas";
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
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@workspace/ui/components/sidebar";
import { toast } from "sonner";
import { Chat, ChatMessage } from "@workspace/ui/components/chat";

const toValidButtonVariant = (
  val?: string,
): "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" => {
  if (
    val === "destructive" ||
    val === "outline" ||
    val === "secondary" ||
    val === "ghost" ||
    val === "link"
  ) {
    return val;
  }
  return "default";
};

const toValidBadgeVariant = (
  val?: string,
): "default" | "secondary" | "destructive" | "outline" => {
  if (val === "secondary" || val === "destructive" || val === "outline") {
    return val;
  }
  return "secondary";
};

interface SidebarPreviewItem {
  id?: string;
  name?: string;
  link?: string;
  icon?: string;
  badge?: string;
  itemType?: "link" | "action";
  actionId?: string;
  actionName?: string;
}

export interface StateComponentPreviewProps {
  currentComponent: StateRenderComponent;
  currentVariant: NonNullable<StateRenderConfig["variant"]>;
  currentClickAction: NonNullable<StateRenderConfig["clickAction"]>;
  displayLabel: string;
  customLabel?: string;
  formattedPreviewValue: string;
  sampleValue: JSONValue | undefined;
  propMappings: ComponentPropMappings;
  stateName: string;
  copyToastMessage?: string;
  targetActionId?: string;
  elements?: ComponentElementBinding[];
  activeElementId?: string;
  onSelectElement?: (elId: string) => void;
}

export const StateComponentPreview: React.FC<StateComponentPreviewProps> = React.memo(({
  currentComponent,
  currentVariant,
  currentClickAction,
  displayLabel,
  customLabel,
  formattedPreviewValue,
  sampleValue,
  propMappings,
  stateName,
  copyToastMessage,
  targetActionId,
  elements,
  activeElementId,
  onSelectElement,
}) => {
  const labelToRender = customLabel?.trim() || "";
  const isMultiElement = Boolean(elements && elements.length > 1);

  // Live interactive state for Input component preview
  // Live interactive state for Sidebar preview
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Live interactive state for Input component preview
  const [liveInputValue, setLiveInputValue] = useState<string>(String(formattedPreviewValue ?? ""));
  const [debouncedLiveValue, setDebouncedLiveValue] = useState<string>(String(formattedPreviewValue ?? ""));
  const [isDebouncing, setIsDebouncing] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLiveInputValue(String(formattedPreviewValue ?? ""));
    setDebouncedLiveValue(String(formattedPreviewValue ?? ""));
    setIsDebouncing(false);
  }, [formattedPreviewValue]);

  const handlePreviewInputChange = (val: string) => {
    setLiveInputValue(val);
    if (propMappings.debounceUpdate) {
      setIsDebouncing(true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      const delay = propMappings.debounceMs ?? 300;
      debounceTimerRef.current = setTimeout(() => {
        setDebouncedLiveValue(val);
        setIsDebouncing(false);
      }, delay);
    } else {
      setDebouncedLiveValue(val);
    }
  };

  const handlePreviewInputCommit = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setDebouncedLiveValue(liveInputValue);
    setIsDebouncing(false);
  };

  return (
    <Card className="border-cyan-500/30 bg-cyan-500/[0.02] shadow-xs overflow-hidden">
      <CardHeader className="p-3.5 pb-2 border-b border-border/40 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/90">
            <Sparkles size={13} className="text-cyan-500" />
            <span>Live Component Preview</span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono capitalize">
            {isMultiElement ? `${elements!.length} Selected Components` : currentComponent}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-5 flex flex-col items-center justify-center min-h-[100px] bg-background/50">
        {/* If multiple elements: render ALL selected components together in a composite card */}
        {isMultiElement ? (
          <div className="w-full max-w-sm flex flex-col gap-3 p-4 rounded-xl border border-border/70 bg-card shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <span className="text-xs font-bold text-foreground font-mono">
                &lt;{displayLabel} /&gt;
              </span>
              <Badge variant="outline" className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-semibold">
                {elements!.length} Components
              </Badge>
            </div>
            <div className="flex flex-col gap-2.5 pt-1">
              {elements!.map((el) => {
                const elType = el.elementType || "input";
                const isActive = el.id === activeElementId;
                const elProps = (isActive ? propMappings : el.propMappings) || {};
                const showLabel = elProps.hasLabel !== false;
                const labelText = elProps.labelBinding || el.label || el.name;

                return (
                  <div
                    key={el.id}
                    onClick={() => onSelectElement?.(el.id)}
                    className={cn(
                      "transition-all rounded-lg cursor-pointer p-1.5",
                      isActive
                        ? "ring-1 ring-cyan-500/60 bg-cyan-500/[0.05] border border-cyan-500/30"
                        : "hover:bg-muted/30 border border-transparent",
                    )}
                  >
                    {elType === "button" && (
                      <Button
                        variant={toValidButtonVariant(el.variant)}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (el.actionName || el.actionId) {
                            toast.info(`Simulated: Trigger action "${el.actionName || el.actionId}"`);
                          } else {
                            toast.info(`Button "${el.name || el.label}" clicked`);
                          }
                        }}
                        className="w-full text-xs font-medium cursor-pointer"
                      >
                        {el.label || el.name || "Button"}
                      </Button>
                    )}

                    {elType === "input" && (
                      <div className="space-y-1">
                        {showLabel && (
                          <Label className="text-[10px] font-medium text-foreground">{labelText}</Label>
                        )}
                        <Input
                          type={elProps.inputType || el.propMappings?.inputType || "text"}
                          placeholder={elProps.placeholder || el.placeholder || `Enter ${labelText}...`}
                          defaultValue=""
                          onClick={(e) => e.stopPropagation()}
                          className="h-8 text-xs font-mono bg-background"
                        />
                      </div>
                    )}

                    {elType === "switch" && (
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-muted/20 border border-border/40">
                        {showLabel && (
                          <Label className="text-xs font-medium cursor-pointer">{labelText}</Label>
                        )}
                        <Switch onClick={(e) => e.stopPropagation()} />
                      </div>
                    )}

                    {elType === "checkbox" && (
                      <div className="flex items-center justify-between p-1">
                        <div className="flex items-center gap-2">
                          <Checkbox onClick={(e) => e.stopPropagation()} />
                          {showLabel && (
                            <Label className="text-xs font-medium cursor-pointer">{labelText}</Label>
                          )}
                        </div>
                      </div>
                    )}

                    {elType === "badge" && (
                      <div className="flex items-center justify-between p-1">
                        <span className="text-xs text-muted-foreground">{el.label || el.name}:</span>
                        <Badge variant={toValidBadgeVariant(el.variant)} className="text-xs font-mono">
                          {el.valueStateName || "Badge"}
                        </Badge>
                      </div>
                    )}

                    {elType === "card" && (
                      <div className="p-2.5 rounded-lg border border-border/60 bg-muted/15 flex flex-col gap-1">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">{el.label || el.name}</div>
                        <div className="text-sm font-bold font-mono text-foreground">{el.valueStateName || "Card Content"}</div>
                      </div>
                    )}

                    {elType === "progress" && (
                      <div className="space-y-1 p-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span>{el.label || el.name}</span>
                          <span className="font-mono text-cyan-500">65%</span>
                        </div>
                        <Progress value={65} className="h-2" />
                      </div>
                    )}

                    {elType === "alert" && (
                      <Alert className="py-2 px-3">
                        <AlertDescription className="text-xs">
                          {el.label || el.name || "Notice message"}
                        </AlertDescription>
                      </Alert>
                    )}

                    {!["button", "input", "switch", "checkbox", "badge", "card", "progress", "alert"].includes(elType) && (
                      <div className="text-xs p-2 rounded bg-muted/20 border border-border/30 flex items-center justify-between">
                        <span className="font-medium">{el.label || el.name}</span>
                        <Badge variant="outline" className="text-[9px] font-mono">{elType}</Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
        {/* Dynamic Component Preview Rendering */}
        {currentComponent === "badge" && (
          <Badge
            variant={currentVariant}
            className={cn(
              "px-3 py-1 text-xs transition-all",
              currentClickAction !== "none" && "cursor-pointer hover:scale-105 active:scale-95 shadow-sm",
            )}
            onClick={() => {
              if (currentClickAction === "copy_to_clipboard") {
                navigator.clipboard?.writeText(String(sampleValue));
                toast.success(copyToastMessage || `Copied ${stateName} to clipboard!`);
              } else if (currentClickAction === "trigger_event") {
                toast.info(`Simulated: Trigger action "${targetActionId || "action"}"`);
              }
            }}
          >
            {labelToRender && <span className="font-semibold mr-1">{labelToRender}:</span>}
            <span>{formattedPreviewValue}</span>
          </Badge>
        )}

        {currentComponent === "card" && (
          <div
            className={cn(
              "p-3 rounded-lg bg-card border border-border/70 shadow-xs min-w-[180px] max-w-xs transition-all",
              currentClickAction !== "none" && "cursor-pointer hover:border-cyan-500/60 shadow-sm",
            )}
          >
            {(propMappings.titleBinding || labelToRender) && (
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {propMappings.titleBinding || labelToRender}
              </div>
            )}
            {propMappings.descriptionBinding && (
              <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                {propMappings.descriptionBinding}
              </div>
            )}
            <div className="text-base font-bold text-foreground mt-0.5 font-mono">
              {formattedPreviewValue}
            </div>
          </div>
        )}

        {currentComponent === "button" && (
          <Button
            variant={currentVariant}
            size={propMappings.buttonSize || "sm"}
            disabled={Boolean(propMappings.disabled)}
            className="gap-1.5 shadow-xs"
            onClick={() => {
              if (currentClickAction === "copy_to_clipboard") {
                navigator.clipboard?.writeText(String(sampleValue));
                toast.success(copyToastMessage || `Copied ${stateName} to clipboard!`);
              } else if (currentClickAction === "trigger_event") {
                toast.info(`Simulated: Trigger action "${targetActionId || "action"}"`);
              }
            }}
          >
            <span>{labelToRender || formattedPreviewValue || "Button"}</span>
          </Button>
        )}

        {currentComponent === "switch" && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/20 border border-border/40">
            <Switch checked={Boolean(sampleValue)} disabled={Boolean(propMappings.disabled)} />
            <Label className="text-xs font-medium cursor-pointer">{displayLabel}</Label>
          </div>
        )}

        {currentComponent === "checkbox" && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/40">
            <Checkbox checked={Boolean(sampleValue)} disabled={Boolean(propMappings.disabled)} />
            <Label className="text-xs font-medium cursor-pointer">{displayLabel}</Label>
          </div>
        )}

        {currentComponent === "progress" && (
          <div className="w-full max-w-xs flex flex-col gap-1.5 p-2">
            <div className="flex justify-between text-xs font-medium">
              <span>{displayLabel}</span>
              {propMappings.showPercent !== false && (
                <span className="font-mono text-muted-foreground">{formattedPreviewValue}%</span>
              )}
            </div>
            <Progress
              value={Math.min(propMappings.max || 100, Math.max(0, Number(sampleValue) || 45))}
              max={propMappings.max || 100}
            />
            {propMappings.max && propMappings.max !== 100 && (
              <span className="text-[9px] text-muted-foreground font-mono">Max: {propMappings.max}</span>
            )}
          </div>
        )}

        {currentComponent === "input" && (
          <div className="w-full max-w-xs flex flex-col gap-2">
            {propMappings.hasLabel !== false ? (
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium text-foreground/90">
                  {propMappings.labelBinding || labelToRender || displayLabel}
                </Label>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono text-cyan-500 bg-cyan-500/10 px-1 py-0.2 rounded border border-cyan-500/20">
                    type="{propMappings.inputType || "text"}"
                  </span>
                  {propMappings.debounceUpdate && (
                    <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded border border-indigo-500/20 flex items-center gap-0.5">
                      <Timer size={9} />
                      {propMappings.debounceMs ?? 300}ms
                    </span>
                  )}
                </div>
              </div>
            ) : (
              (Boolean(propMappings.inputType && propMappings.inputType !== "text") || Boolean(propMappings.debounceUpdate)) ? (
                <div className="flex items-center justify-end gap-1">
                  {propMappings.inputType && propMappings.inputType !== "text" && (
                    <span className="text-[9px] font-mono text-cyan-500 bg-cyan-500/10 px-1 py-0.2 rounded border border-cyan-500/20">
                      type="{propMappings.inputType}"
                    </span>
                  )}
                  {propMappings.debounceUpdate && (
                    <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded border border-indigo-500/20 flex items-center gap-0.5">
                      <Timer size={9} />
                      {propMappings.debounceMs ?? 300}ms
                    </span>
                  )}
                </div>
              ) : null
            )}

            {/* Input Element */}
            {(() => {
              const isReadOnlyPreview = Boolean(
                propMappings.readOnly ||
                (propMappings.readOnlyMode === "state_binding" && propMappings.readOnlyBinding)
              );
              const isDisabledPreview = Boolean(
                propMappings.disabled ||
                (propMappings.disabledMode === "state_binding" && propMappings.disabledBinding)
              );

              return (
                <div className="relative flex items-center">
                  <Input
                    type={propMappings.inputType || "text"}
                    value={isReadOnlyPreview ? String(formattedPreviewValue) : liveInputValue}
                    onChange={(e) => handlePreviewInputChange(e.target.value)}
                    placeholder={propMappings.placeholder || `Enter ${displayLabel}...`}
                    readOnly={isReadOnlyPreview}
                    disabled={isDisabledPreview}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && propMappings.commitOnEnter !== false) {
                        handlePreviewInputCommit();
                        toast.info(`Committed input: "${liveInputValue}"`);
                      }
                    }}
                    onBlur={() => {
                      if (propMappings.commitOnBlur !== false && isDebouncing) {
                        handlePreviewInputCommit();
                      }
                    }}
                    className={cn(
                      "h-8 text-xs font-mono shadow-2xs transition-colors",
                      propMappings.clearable && "pr-7",
                      isReadOnlyPreview ? "bg-muted/30 cursor-default" : "bg-background focus:ring-1 focus:ring-primary/40",
                    )}
                  />
                  {propMappings.clearable && !isReadOnlyPreview && !isDisabledPreview && liveInputValue && (
                    <button
                      type="button"
                      onClick={() => {
                        handlePreviewInputChange("");
                        handlePreviewInputCommit();
                      }}
                      className="absolute right-2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Clear input"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Reactive Feedback & Debounce Indicator */}
            {!propMappings.readOnly && !propMappings.disabled && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                {propMappings.debounceUpdate ? (
                  isDebouncing ? (
                    <span className="text-amber-500 flex items-center gap-1 font-mono text-[9px] animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      Debouncing ({propMappings.debounceMs ?? 300}ms)...
                    </span>
                  ) : (
                    <span className="text-emerald-500 flex items-center gap-1 font-mono text-[9px]">
                      <Check size={10} />
                      Committed: &quot;{debouncedLiveValue}&quot;
                    </span>
                  )
                ) : (
                  <span className="text-muted-foreground/80 font-mono text-[9px]">
                    Direct sync: &quot;{liveInputValue}&quot;
                  </span>
                )}
                {propMappings.commitOnEnter !== false && (
                  <span className="text-[9px] text-muted-foreground/60 font-mono">
                    ↵ Enter to commit
                  </span>
                )}
              </div>
            )}

            {/* ReadOnly & Disabled Status Indicators (Dynamic & Static) */}
            {(propMappings.readOnly ||
              propMappings.disabled ||
              propMappings.readOnlyMode === "state_binding" ||
              propMappings.readOnlyMode === "expression" ||
              propMappings.disabledMode === "state_binding" ||
              propMappings.disabledMode === "expression") && (
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/80 pt-0.5">
                {/* ReadOnly indicator */}
                {propMappings.readOnlyMode === "state_binding" && propMappings.readOnlyBinding && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-[9px] font-mono text-indigo-400 border border-indigo-500/20">
                    readOnly={`{${propMappings.readOnlyInverted ? "!" : ""}${propMappings.readOnlyBinding}}`}
                  </span>
                )}
                {propMappings.readOnlyMode === "expression" && propMappings.readOnlyExpression && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-[9px] font-mono text-indigo-400 border border-indigo-500/20">
                    readOnly={`{${propMappings.readOnlyExpression}}`}
                  </span>
                )}
                {(!propMappings.readOnlyMode || propMappings.readOnlyMode === "static") && propMappings.readOnly && (
                  <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] font-mono text-muted-foreground border border-border/40">
                    readOnly
                  </span>
                )}

                {/* Disabled indicator */}
                {propMappings.disabledMode === "state_binding" && propMappings.disabledBinding && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-mono text-amber-500 border border-amber-500/20">
                    disabled={`{${propMappings.disabledInverted ? "!" : ""}${propMappings.disabledBinding}}`}
                  </span>
                )}
                {propMappings.disabledMode === "expression" && propMappings.disabledExpression && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-mono text-amber-500 border border-amber-500/20">
                    disabled={`{${propMappings.disabledExpression}}`}
                  </span>
                )}
                {(!propMappings.disabledMode || propMappings.disabledMode === "static") && propMappings.disabled && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-mono text-amber-500 border border-amber-500/20">
                    disabled
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {currentComponent === "alert" && (
          <Alert className="max-w-sm py-2 px-3 border-cyan-500/30 bg-cyan-500/5">
            <AlertTriangle className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
            <AlertDescription className="text-xs">
              {propMappings.alertTitle && (
                <div className="font-semibold text-foreground mb-0.5">{propMappings.alertTitle}</div>
              )}
              {labelToRender && <strong className="mr-1">{labelToRender}:</strong>}
              <span>{formattedPreviewValue}</span>
            </AlertDescription>
          </Alert>
        )}

        {currentComponent === "avatar" && (
          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9 border border-border">
              {propMappings.avatarSrc ? (
                <img
                  src={propMappings.avatarSrc}
                  alt={labelToRender || displayLabel}
                  className="h-full w-full object-cover rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <AvatarFallback className="bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-bold text-xs">
                {propMappings.avatarFallback || (labelToRender ? labelToRender.slice(0, 2).toUpperCase() : (displayLabel ? displayLabel.slice(0, 2).toUpperCase() : "AV"))}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              {labelToRender && <span className="text-xs font-semibold">{labelToRender}</span>}
              <span className="text-[10px] text-muted-foreground font-mono">{formattedPreviewValue}</span>
            </div>
          </div>
        )}

        {currentComponent === "skeleton" && (
          <div className="flex items-center gap-3">
            <Skeleton className={cn(propMappings.skeletonHeight || "h-7", propMappings.skeletonWidth || "w-28", "rounded-md")} />
            <span className="text-xs text-muted-foreground font-mono">({labelToRender || "State"} loading...)</span>
          </div>
        )}

        {currentComponent === "code" && (
          <pre className="text-[11px] font-mono p-3 rounded-lg bg-muted/50 border border-border/60 max-w-sm w-full overflow-x-auto text-foreground">
            {typeof sampleValue === "object"
              ? JSON.stringify(sampleValue, null, 2)
              : labelToRender
              ? `${labelToRender}: ${formattedPreviewValue}`
              : formattedPreviewValue}
          </pre>
        )}

        {currentComponent === "text" && (
          <div className="text-xs px-2.5 py-1.5 rounded-md bg-secondary/50 border border-border text-foreground font-mono">
            {labelToRender && <span className="text-muted-foreground">{labelToRender}: </span>}
            <span>{formattedPreviewValue}</span>
          </div>
        )}

        {currentComponent === "table" && (
          <div className="w-full max-w-sm rounded-lg border border-border/70 overflow-hidden bg-card text-xs">
            <div className="px-3 py-2 bg-muted/40 font-semibold border-b border-border/60 flex items-center justify-between">
              <span>{displayLabel}</span>
              <Badge variant="outline" className="text-[9px] font-mono">Data Table</Badge>
            </div>
            <div className="p-3 text-[11px] text-muted-foreground font-mono">
              {formattedPreviewValue || "Array / Collection"}
            </div>
          </div>
        )}

        {currentComponent === "sidebar" && (() => {
          const navMode = propMappings.sidebarNavMode || "dynamic";
          const defaultItems: SidebarPreviewItem[] = [
            { id: "nav-1", name: "Dashboard", link: "/dashboard" },
            { id: "nav-2", name: "Analytics", link: "/analytics" },
            { id: "nav-3", name: "Projects", link: "/projects" },
            { id: "nav-4", name: "Settings", link: "/settings" },
          ];

          const parseSidebarItem = (val: JSONValue): SidebarPreviewItem | null => {
            if (typeof val === "object" && val !== null && !Array.isArray(val)) {
              const id = typeof val.id === "string" ? val.id : undefined;
              const name = typeof val.name === "string" ? val.name : (typeof val.label === "string" ? val.label : (typeof val.title === "string" ? val.title : undefined));
              const link = typeof val.link === "string" ? val.link : (typeof val.href === "string" ? val.href : (typeof val.url === "string" ? val.url : undefined));
              const icon = typeof val.icon === "string" ? val.icon : undefined;
              const badge = typeof val.badge === "string" ? val.badge : undefined;
              const itemType = val.itemType === "action" ? "action" : "link";
              const actionId = typeof val.actionId === "string" ? val.actionId : undefined;
              const actionName = typeof val.actionName === "string" ? val.actionName : undefined;
              return { id, name, link, icon, badge, itemType, actionId, actionName };
            }
            return null;
          };

          const dynamicItems: SidebarPreviewItem[] = Array.isArray(sampleValue)
            ? sampleValue.map(parseSidebarItem).filter((i): i is SidebarPreviewItem => i !== null)
            : [];

          const staticItems: SidebarPreviewItem[] = propMappings.sidebarStaticItems || [];

          const rawItems = navMode === "dynamic"
            ? (dynamicItems.length > 0 ? dynamicItems : staticItems)
            : staticItems;

          const items: SidebarPreviewItem[] = rawItems.length > 0 ? rawItems : defaultItems;

          const configuredGroups = propMappings.sidebarGroups;
          const groupsToRender: Array<{
            id: string;
            label: string;
            items: SidebarPreviewItem[];
            isDynamic: boolean;
          }> = configuredGroups && configuredGroups.length > 0
            ? configuredGroups.map((grp, gIdx) => {
                const isDynamic = grp.mode === "dynamic";
                let grpItems: SidebarPreviewItem[] = [];
                if (isDynamic) {
                  grpItems = dynamicItems.length > 0
                    ? dynamicItems
                    : [
                        { id: `dyn-${gIdx}-1`, name: `${grp.label || "Item"} 1`, link: "/#" },
                        { id: `dyn-${gIdx}-2`, name: `${grp.label || "Item"} 2`, link: "/#" },
                      ];
                } else {
                  grpItems = (grp.items && grp.items.length > 0)
                    ? grp.items
                    : [
                        { id: `st-${gIdx}-1`, name: `${grp.label || "Page"} 1`, link: `/${(grp.label || "page").toLowerCase().replace(/[^a-z0-9]/g, "")}-1` },
                      ];
                }
                return {
                  id: grp.id || `group-${gIdx}`,
                  label: grp.label || "Navigation",
                  items: grpItems,
                  isDynamic,
                };
              })
            : [
                {
                  id: "group-main",
                  label: "Navigation",
                  items: items,
                  isDynamic: navMode === "dynamic",
                },
              ];

          const variant = propMappings.sidebarVariant || "sidebar";
          const side = propMappings.sidebarSide || "left";
          const collapsible = propMappings.sidebarCollapsible || "offcanvas";
          const title = propMappings.sidebarTitle ?? "Dezign App";

          const isCollapsed = collapsible !== "none" && !sidebarOpen;
          const isIconMode = collapsible === "icon" && isCollapsed;
          const isOffcanvasClosed = collapsible === "offcanvas" && isCollapsed;

          const navIcons = [LayoutDashboard, BarChart2, Folder, Settings];

          return (
            <div className="w-full flex flex-col gap-2.5">
              {/* Interactive Collapsible Mode Toolbar */}
              <div className="flex items-center justify-between px-1 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-medium">Mode:</span>
                  {collapsible === "icon" && (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
                      Icon Rail (Collapsible)
                    </Badge>
                  )}
                  {collapsible === "offcanvas" && (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/20">
                      Offcanvas (Mobile Drawer)
                    </Badge>
                  )}
                  {collapsible === "none" && (
                    <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-muted-foreground border-border/50">
                      Fixed (Non-Collapsible)
                    </Badge>
                  )}
                </div>

                {collapsible !== "none" && (
                  <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-md border border-border/40">
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(true)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                        sidebarOpen
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Expanded
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                        !sidebarOpen
                          ? "bg-background text-foreground shadow-2xs font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {collapsible === "icon" ? "Icon Rail" : "Drawer Closed"}
                    </button>
                  </div>
                )}
              </div>

              {/* Sidebar View Container */}
              <div className={`w-full flex py-1 ${side === "right" ? "justify-end" : "justify-start"}`}>
                {isOffcanvasClosed ? (
                  /* Offcanvas Closed State Placeholder with Trigger */
                  <div className="w-full flex items-center justify-between p-3 rounded-lg border border-dashed border-border/70 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSidebarOpen(true)}
                        className="h-7 text-xs font-medium cursor-pointer shadow-2xs gap-1.5"
                      >
                        <Menu size={13} />
                        <span>Toggle Sidebar</span>
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        Sidebar is hidden off-screen (Drawer Closed)
                      </span>
                    </div>
                  </div>
                ) : (
                  <SidebarProvider className="min-h-0 w-auto">
                    <Sidebar
                      collapsible="none"
                      variant={variant}
                      side={side}
                      className={cn(
                        "border relative bg-sidebar shadow-xs transition-all duration-200 hover:border-sidebar-ring/50",
                        isIconMode ? "w-14" : "w-56",
                        variant === "floating"
                          ? "rounded-xl m-1.5 shadow-md border-border/80"
                          : variant === "inset"
                          ? "rounded-lg border-dashed"
                          : "rounded-lg"
                      )}
                    >
                      <SidebarContent>
                        {/* Sidebar Header */}
                        <div className="flex items-center justify-between px-2.5 py-2 border-b border-border/40">
                          <div className={cn("flex items-center gap-1.5 min-w-0", isIconMode && "justify-center w-full")}>
                            <PanelLeft size={13} className="text-primary shrink-0" />
                            {!isIconMode && (
                              <span className="text-xs font-semibold truncate text-foreground">
                                {title}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Floating Toggle Button outside sidebar edge */}
                        {collapsible !== "none" && (
                          <button
                            type="button"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                            className={cn(
                              "absolute top-3.5 z-30 h-5 w-5 rounded-full border border-border/80 bg-background shadow-xs hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer transition-transform duration-150 hover:scale-105",
                              side === "right" ? "-left-2.5" : "-right-2.5"
                            )}
                          >
                            {sidebarOpen ? <PanelLeftClose size={10} /> : <PanelLeftOpen size={10} />}
                          </button>
                        )}

                        {groupsToRender.map((group, groupIdx) => (
                          <SidebarGroup key={group.id || groupIdx}>
                            {!isIconMode && (
                              <SidebarGroupLabel className="text-[10px] flex items-center justify-between">
                                <span>{group.label}</span>
                                {groupIdx === 0 && (
                                  <span className="text-[8px] font-mono text-muted-foreground uppercase">
                                    {side} · {variant}
                                  </span>
                                )}
                              </SidebarGroupLabel>
                            )}
                            <SidebarGroupContent>
                              <SidebarMenu className={isIconMode ? "items-center" : ""}>
                                {group.items.map((item: SidebarPreviewItem, idx: number) => {
                                  const isActive = groupIdx === 0 && idx === 0;
                                  const NavIcon = (navIcons[(groupIdx * 2 + idx) % navIcons.length]) ?? Folder;
                                  const isActionButton = item.itemType === "action" || Boolean(item.actionId || item.actionName);

                                  if (isActionButton) {
                                    return (
                                      <SidebarMenuItem key={item.id || idx}>
                                        <SidebarMenuButton
                                          tooltip={item.name}
                                          isActive={isActive}
                                          onClick={() => {
                                            toast.success(`Action Triggered: ${item.actionName || item.name || "Button Action"}`);
                                          }}
                                          className={cn(
                                            "text-xs flex items-center gap-2 cursor-pointer transition-colors hover:text-amber-500",
                                            isIconMode && "justify-center p-1.5"
                                          )}
                                        >
                                          <NavIcon size={14} className="shrink-0 text-amber-500" />
                                          {!isIconMode && (
                                            <span className="flex-1 truncate text-left">{item.name || `Action ${idx + 1}`}</span>
                                          )}
                                          {!isIconMode && (
                                            <span className="text-[7.5px] font-mono text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                                              action
                                            </span>
                                          )}
                                        </SidebarMenuButton>
                                      </SidebarMenuItem>
                                    );
                                  }

                                  return (
                                    <SidebarMenuItem key={item.id || idx}>
                                      <SidebarMenuButton
                                        asChild
                                        tooltip={item.name}
                                        isActive={isActive}
                                        onClick={() => {
                                          toast.info(`Simulated route: ${item.link || item.name}`);
                                        }}
                                      >
                                        <a
                                          href={item.link || "#"}
                                          className={cn(
                                            "text-xs flex items-center gap-2",
                                            isIconMode && "justify-center p-1.5"
                                          )}
                                          title={item.name}
                                        >
                                          <NavIcon size={14} className="shrink-0" />
                                          {!isIconMode && <span>{item.name || `Nav ${idx + 1}`}</span>}
                                        </a>
                                      </SidebarMenuButton>
                                    </SidebarMenuItem>
                                  );
                                })}
                              </SidebarMenu>
                            </SidebarGroupContent>
                          </SidebarGroup>
                        ))}
                      </SidebarContent>
                    </Sidebar>
                  </SidebarProvider>
                )}
              </div>
            </div>
          );
        })()}


        {currentComponent === "chat" && (() => {
          const rawTitle = propMappings.chatTitle;
          const title = typeof rawTitle === "string" ? rawTitle : (rawTitle && typeof (rawTitle as any)?.target?.value === "string" ? (rawTitle as any).target.value : labelToRender || "AI Assistant");
          const placeholder = propMappings.chatPlaceholder || "Type a message...";
          const emptyTitle = propMappings.chatEmptyTitle || "No messages yet";
          const emptyDescription = propMappings.chatEmptyDescription || "Start a conversation to see messages here";
          const autoScroll = propMappings.chatAutoScroll ?? true;
          const showAvatars = propMappings.chatShowAvatars ?? true;
          const alignment = propMappings.chatAlignment || "center";
          const maxWidth = propMappings.chatMaxWidth;
          const height = propMappings.chatHeight;

          let maxWClass = "max-w-sm";
          if (maxWidth === "sm") maxWClass = "max-w-xs";
          else if (maxWidth === "md") maxWClass = "max-w-sm";
          else if (maxWidth === "lg") maxWClass = "max-w-md";
          else if (maxWidth === "xl" || maxWidth === "2xl" || maxWidth === "full" || alignment === "full") maxWClass = "w-full";

          let alignClass = "justify-center";
          if (alignment === "left" || alignment === "floating-left") alignClass = "justify-start";
          else if (alignment === "right" || alignment === "floating-right") alignClass = "justify-end";
          else if (alignment === "full") alignClass = "w-full";

          let heightClass = "h-[300px]";
          if (height === "sm") heightClass = "h-[240px]";
          else if (height === "lg" || height === "xl" || height === "full") heightClass = "h-[340px]";

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
                  content: "Add a dark mode toggle to the settings page.",
                },
                {
                  id: "msg-2",
                  role: "assistant",
                  content: "I've checked the project. Next-themes is configured, so I added the ModeToggle component to settings.",
                },
              ];

          return (
            <div className={cn("w-full flex transition-all duration-200", alignClass)}>
              <div className={cn("w-full transition-all duration-200", maxWClass)}>
                <Chat
                  title={title}
                  placeholder={placeholder}
                  emptyTitle={emptyTitle}
                  emptyDescription={emptyDescription}
                  autoScroll={autoScroll}
                  showAvatars={showAvatars}
                  messages={sampleMessages}
                  className={heightClass}
                  onSendMessage={(text) => {
                    toast.info(`Simulated prompt: "${text}"`);
                  }}
                />
              </div>
            </div>
          );
        })()}

        {currentComponent === "topbar" && (() => {
          const navMode = propMappings.topbarNavMode || "static";
          const title = propMappings.topbarTitle || "Dezign App";
          const isSticky = propMappings.topbarSticky ?? true;
          const showAuth = propMappings.showAuthButtons ?? true;
          const signIn = propMappings.signInText || "Sign In";
          const register = propMappings.registerText || "Register";

          const parseSidebarItem = (val: JSONValue): SidebarPreviewItem | null => {
            if (typeof val === "object" && val !== null && !Array.isArray(val)) {
              const id = typeof val.id === "string" ? val.id : undefined;
              const name = typeof val.name === "string" ? val.name : (typeof val.label === "string" ? val.label : (typeof val.title === "string" ? val.title : undefined));
              const link = typeof val.link === "string" ? val.link : (typeof val.href === "string" ? val.href : (typeof val.url === "string" ? val.url : undefined));
              const icon = typeof val.icon === "string" ? val.icon : undefined;
              const badge = typeof val.badge === "string" ? val.badge : undefined;
              const itemType = val.itemType === "action" ? "action" : "link";
              const actionId = typeof val.actionId === "string" ? val.actionId : undefined;
              const actionName = typeof val.actionName === "string" ? val.actionName : undefined;
              return { id, name, link, icon, badge, itemType, actionId, actionName };
            }
            return null;
          };

          const dynamicItems: SidebarPreviewItem[] = Array.isArray(sampleValue)
            ? sampleValue.map(parseSidebarItem).filter((i): i is SidebarPreviewItem => i !== null)
            : [];

          const staticItems: SidebarPreviewItem[] = propMappings.topbarStaticItems || [
            { id: "nav-1", name: "Home", link: "/" },
            { id: "nav-2", name: "Features", link: "/features" },
            { id: "nav-3", name: "Pricing", link: "/pricing" },
            { id: "nav-4", name: "About", link: "/about" },
          ];

          const items = navMode === "dynamic"
            ? (dynamicItems.length > 0 ? dynamicItems : staticItems)
            : staticItems;

          return (
            <div className="w-full max-w-sm rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col text-xs">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/40 gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground truncate shrink-0">
                  <PanelTop size={13} className="text-primary shrink-0" />
                  <span>{title}</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  {items.slice(0, 3).map((item, idx) => (
                    <span
                      key={item.id || idx}
                      onClick={() => toast.info(`Clicked "${item.name}" link`)}
                      className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-1 py-0.5 rounded font-medium"
                    >
                      {item.name}
                    </span>
                  ))}
                </div>

                {showAuth && (
                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toast.info(`Navigating to ${propMappings.signInLink || "/login"}`)}
                      className="h-6 px-1.5 text-[10px] font-medium cursor-pointer"
                    >
                      {signIn}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => toast.info(`Navigating to ${propMappings.registerLink || "/register"}`)}
                      className="h-6 px-2 text-[10px] font-medium cursor-pointer shadow-xs"
                    >
                      {register}
                    </Button>
                  </div>
                )}
              </div>

              <div className="px-3 py-1.5 bg-muted/20 text-[9px] text-muted-foreground flex items-center justify-between font-mono">
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${navMode === "dynamic" ? "bg-sky-500" : "bg-emerald-500"} inline-block`} />
                  Top Bar Navigation ({isSticky ? "Sticky" : "Static"}) • {navMode === "dynamic" ? "Dynamic Store" : "Static Mode"}
                </span>
                <span>{items.length} links</span>
              </div>
            </div>
          );
        })()}

                {currentClickAction !== "none" && (
          <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground/80">
            <MousePointerClick size={10} className="text-cyan-500" />
            <span>Click to test interactive action ({currentClickAction})</span>
          </div>
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
});
StateComponentPreview.displayName = "StateComponentPreview";
