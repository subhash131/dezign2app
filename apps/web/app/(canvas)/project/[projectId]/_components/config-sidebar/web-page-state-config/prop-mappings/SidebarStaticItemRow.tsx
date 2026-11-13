"use client";

import React from "react";
import {
  Trash2,
  Plus,
  Braces,
  X,
  Zap,
  Link as LinkIcon,
} from "lucide-react";
import { SidebarStaticItemParam, SidebarStaticItemQueryParam } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { parseRouteWithQueryParams } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { SidebarStaticItemRowProps } from "./types";

export const SidebarStaticItemRow: React.FC<SidebarStaticItemRowProps> = React.memo(({
  item,
  idx,
  stateStores,
  availableActions = [],
  onOpenEventConfig,
  onCreateAction,
  onUpdate,
  onDelete,
}) => {
  // Query available route params and query params across all canvas webPage nodes
  const availableRouteParams = useBackendCanvasStore(
    useShallow((s) => {
      const paramsSet = new Set<string>();
      s.nodes.forEach((n) => {
        if (n.type === "webPage") {
          (n.data?.pathParams || []).forEach((p: { name?: string }) => {
            if (p.name) paramsSet.add(p.name);
          });
          const raw = n.data?.route || n.data?.path || n.data?.label || "";
          const matches = Array.from(raw.matchAll(/\[([^\]]+)\]/g));
          matches.forEach((m) => {
            if (m[1]) paramsSet.add(m[1]);
          });
        }
      });
      return Array.from(paramsSet);
    }),
  );

  const availableQueryParams = useBackendCanvasStore(
    useShallow((s) => {
      const qSet = new Set<string>();
      s.nodes.forEach((n) => {
        if (n.type === "webPage") {
          (n.data?.queryParams || []).forEach((q: { name?: string }) => {
            if (q.name) qSet.add(q.name);
          });
        }
      });
      return Array.from(qSet);
    }),
  );

  // Detect dynamic segments like [id], [slug], [userId]
  const detectedParamNames: string[] = React.useMemo(() => {
    const matches = Array.from((item.link || "").matchAll(/\[([^\]]+)\]/g));
    const paramNames = matches.map((m) => m[1]).filter((p): p is string => Boolean(p));
    return Array.from(new Set(paramNames));
  }, [item.link]);

  const currentPathParams = item.pathParams || [];
  const currentQueryParams = item.queryParams || [];

  // Automatically detect and reconcile path params and query params when link changes
  React.useEffect(() => {
    if (!item.link) return;
    const { extractedPathParams, extractedQueryParams } = parseRouteWithQueryParams(item.link);
    const existingPath = item.pathParams || [];
    const existingQuery = item.queryParams || [];

    const missingPath = extractedPathParams.filter(
      (ep) => !existingPath.some((p) => p.name === ep.name),
    );
    const missingQuery = extractedQueryParams.filter(
      (eq) => !existingQuery.some((q) => q.key === eq.name),
    );

    if (missingPath.length > 0 || missingQuery.length > 0) {
      const nextPath: SidebarStaticItemParam[] = [
        ...existingPath,
        ...missingPath.map((ep) => ({
          name: ep.name,
          value: "",
          mode: "route_param" as const,
          sourceParamName: ep.name,
        })),
      ];
      const nextQuery: SidebarStaticItemQueryParam[] = [
        ...existingQuery,
        ...missingQuery.map((eq) => ({
          id: `q-${eq.name}-${Date.now()}`,
          key: eq.name,
          value: eq.defaultValue || "",
          mode: "static" as const,
        })),
      ];
      onUpdate({
        pathParams: nextPath,
        queryParams: nextQuery,
      });
    }
  }, [item.link]);

  const handleLinkChange = (newLink: string) => {
    const { extractedPathParams, extractedQueryParams } = parseRouteWithQueryParams(newLink);

    const existingPath = item.pathParams || [];
    const updatedPath: SidebarStaticItemParam[] = extractedPathParams.map((ep) => {
      const found = existingPath.find((p) => p.name === ep.name);
      if (found) return found;
      return {
        name: ep.name,
        value: "",
        mode: "route_param" as const,
        sourceParamName: ep.name,
      };
    });

    const existingQuery = item.queryParams || [];
    const updatedQuery: SidebarStaticItemQueryParam[] = [...existingQuery];
    extractedQueryParams.forEach((eq) => {
      const found = updatedQuery.find((q) => q.key === eq.name);
      if (found) {
        if (!found.value && eq.defaultValue) found.value = eq.defaultValue;
      } else {
        updatedQuery.push({
          id: `q-${eq.name}-${Date.now()}`,
          key: eq.name,
          value: eq.defaultValue || "",
          mode: "static" as const,
        });
      }
    });

    onUpdate({
      link: newLink,
      pathParams: updatedPath,
      queryParams: updatedQuery,
    });
  };

  const handleUpdatePathParam = (paramName: string, patch: Partial<SidebarStaticItemParam>) => {
    const exists = currentPathParams.some((p) => p.name === paramName);
    let updated: SidebarStaticItemParam[];
    if (exists) {
      updated = currentPathParams.map((p) =>
        p.name === paramName ? { ...p, ...patch } : p,
      );
    } else {
      updated = [
        ...currentPathParams,
        { name: paramName, value: "", mode: "route_param", sourceParamName: paramName, ...patch },
      ];
    }
    onUpdate({ pathParams: updated });
  };

  const handleAddQueryParam = () => {
    const nextId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newQ: SidebarStaticItemQueryParam = {
      id: nextId,
      key: "",
      value: "",
      mode: "static",
    };
    onUpdate({ queryParams: [...currentQueryParams, newQ] });
  };

  const handleUpdateQueryParam = (qId: string, patch: Partial<SidebarStaticItemQueryParam>) => {
    const updated = currentQueryParams.map((q) => (q.id === qId ? { ...q, ...patch } : q));
    onUpdate({ queryParams: updated });
  };

  const handleDeleteQueryParam = (qId: string) => {
    const updated = currentQueryParams.filter((q) => q.id !== qId);
    onUpdate({ queryParams: updated });
  };

  // Compute live resolved preview URL
  const previewUrl = React.useMemo(() => {
    let url = item.link || "/";
    for (const p of currentPathParams) {
      if (p.name) {
        let rep = p.value;
        if (!rep) {
          if (p.mode === "store_var" && p.storeVar) {
            rep = `$${p.storeVar}`;
          } else if (p.mode === "route_param") {
            rep = `:${p.sourceParamName || p.name}`;
          } else if (p.mode === "query_param") {
            rep = `?[${p.sourceParamName || p.name}]`;
          } else {
            rep = `:${p.name}`;
          }
        }
        url = url.replace(new RegExp(`\\[${p.name}\\]`, "g"), rep);
      }
    }
    // Also normalize any unmatched brackets
    url = url.replace(/\[([^\]]+)\]/g, ":$1");

    const validQueries = currentQueryParams.filter((q) => q.key && q.key.trim().length > 0);
    if (validQueries.length > 0) {
      const qStr = validQueries
        .map((q) => {
          let v = q.value;
          if (!v) {
            if (q.mode === "store_var" && q.storeVar) v = `$${q.storeVar}`;
            else if (q.mode === "route_param") v = `:${q.sourceParamName || q.key}`;
            else if (q.mode === "query_param") v = `?[${q.sourceParamName || q.key}]`;
            else v = "";
          }
          return `${q.key}=${v}`;
        })
        .join("&");
      url += (url.includes("?") ? "&" : "?") + qStr;
    }
    return url;
  }, [item.link, currentPathParams, currentQueryParams]);

  const hasDynamicOrQuery = detectedParamNames.length > 0 || currentQueryParams.length > 0;

  return (
    <div className="p-2.5 rounded-lg bg-background border border-border/50 flex flex-col gap-2">
      {/* Primary Row: Index, Name, Icon, Delete */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
          #{idx + 1}
        </span>
        <LocalInput
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Label (e.g. Dashboard)"
          className="h-7 text-xs flex-1 bg-muted/20"
        />
        <LocalInput
          value={item.icon || ""}
          onChange={(e) => onUpdate({ icon: e.target.value })}
          placeholder="Icon (e.g. Folder)"
          className="h-7 text-xs w-28 font-mono bg-muted/20"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
          title="Delete item"
        >
          <Trash2 size={12} />
        </Button>
      </div>

      {/* Target Type Switcher: Route Link vs Button Action */}
      <div className="flex items-center justify-between pl-6 text-[10px]">
        <div className="flex items-center gap-1 bg-muted/50 p-0.5 rounded border border-border/40">
          <button
            type="button"
            onClick={() => onUpdate({ itemType: "link" })}
            className={cn(
              "px-2 py-0.5 rounded text-[9.5px] font-medium transition-colors cursor-pointer flex items-center gap-1",
              item.itemType !== "action"
                ? "bg-background text-foreground shadow-2xs font-semibold text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LinkIcon size={10} />
            <span>Route Link</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ itemType: "action" })}
            className={cn(
              "px-2 py-0.5 rounded text-[9.5px] font-medium transition-colors cursor-pointer flex items-center gap-1",
              item.itemType === "action"
                ? "bg-background text-foreground shadow-2xs font-semibold text-amber-500"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Zap size={10} />
            <span>Button (onClick)</span>
          </button>
        </div>

        {item.itemType === "action" ? (
          <Badge variant="outline" className="text-[8.5px] font-mono px-1.5 py-0 text-amber-500 border-amber-500/30 bg-amber-500/10">
            Interactive Button
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[8.5px] font-mono px-1.5 py-0 text-muted-foreground border-border/50">
            Navigation Link
          </Badge>
        )}
      </div>

      {item.itemType === "action" ? (
        /* Action Workflow Trigger Row */
        <div className="flex items-center gap-2 pl-6">
          <span className="text-[10px] font-mono text-amber-500 shrink-0 flex items-center gap-0.5">
            <Zap size={10} />
            <span>action:</span>
          </span>

          {availableActions.length > 0 ? (
            <Select
              value={item.actionId || ""}
              onValueChange={(val) => {
                const matched = availableActions.find((a) => a.id === val);
                onUpdate({
                  actionId: val,
                  actionName: matched?.name || "",
                  triggerEvent: matched?.event || "click",
                });
              }}
            >
              <SelectTrigger className="h-6 text-[11px] bg-muted/20 flex-1">
                <SelectValue placeholder="Select Action (onClick)..." />
              </SelectTrigger>
              <SelectContent>
                {availableActions.map((act) => (
                  <SelectItem key={act.id} value={act.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <Zap size={11} className="text-amber-500" />
                      <span className="font-medium">{act.name}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">({act.event || "click"})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="text-[11px] text-muted-foreground flex-1 italic">
              No actions in section. Click "+ New Action"
            </div>
          )}

          {item.actionId && onOpenEventConfig && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenEventConfig(item.actionId!)}
              className="h-6 text-[9px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              title="Edit Action Flow"
            >
              Edit
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const defaultName = item.name ? `${item.name.replace(/[^a-zA-Z0-9]/g, "")}Action` : "SidebarAction";
              onCreateAction?.(defaultName, "click");
            }}
            className="h-6 text-[9px] px-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer shrink-0 gap-1"
            title="Create New Action Flow"
          >
            <Plus size={10} />
            <span>New Action</span>
          </Button>
        </div>
      ) : (
        /* URL Route Input Row with Quick Badges and Actions */
        <div className="flex items-center gap-2 pl-6">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">url:</span>
          <LocalInput
            value={item.link || ""}
            onChange={(e) => handleLinkChange(e.target.value)}
            placeholder="/route (e.g. /dashboard or /chat/[id]?tab=chat)"
            className="h-6 text-[11px] font-mono flex-1 bg-muted/20"
          />
          {detectedParamNames.length > 0 && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 h-5 border-primary/40 text-primary bg-primary/10 font-mono shrink-0"
            >
              {detectedParamNames.map((p) => `[${p}]`).join(" ")}
            </Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleAddQueryParam}
            className="h-6 text-[9px] px-1.5 text-muted-foreground hover:text-primary cursor-pointer shrink-0 gap-1"
            title="Add URL Query Parameter"
          >
            <Plus size={10} />
            <span>Query</span>
          </Button>
        </div>
      )}

      {/* Dynamic Route Parameters & Query Configuration Panel */}
      {item.itemType !== "action" && hasDynamicOrQuery && (
        <div className="ml-6 space-y-2 pt-1 border-t border-border/30">
          {/* Dynamic Path Parameters */}
          {detectedParamNames.length > 0 && (
            <div className="p-2 rounded-lg bg-muted/40 border border-primary/25 space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 font-medium text-primary">
                  <Braces size={11} />
                  <span>Route Parameters</span>
                  <span className="text-[9px] font-normal text-muted-foreground">
                    ({detectedParamNames.length} dynamic {detectedParamNames.length === 1 ? "segment" : "segments"})
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {detectedParamNames.map((paramName) => {
                  const paramConfig = currentPathParams.find((p) => p.name === paramName) || {
                    name: paramName,
                    value: "",
                    mode: "route_param" as const,
                    sourceParamName: paramName,
                  };
                  const paramMode = paramConfig.mode || "route_param";

                  return (
                    <div
                      key={paramName}
                      className="p-2 rounded-md bg-background/90 border border-border/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-primary font-semibold">[{paramName}]</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-muted-foreground border-border/60">
                            Path Param
                          </Badge>
                        </div>
                        <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded border border-border/30">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdatePathParam(paramName, {
                                mode: "route_param",
                                sourceParamName: paramConfig.sourceParamName || paramName,
                              })
                            }
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                              paramMode === "route_param"
                                ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Map from URL route parameter (params.id)"
                          >
                            Route Param
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdatePathParam(paramName, {
                                mode: "query_param",
                                sourceParamName: paramConfig.sourceParamName || paramName,
                              })
                            }
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                              paramMode === "query_param"
                                ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Map from URL query parameter (searchParams.id)"
                          >
                            Query Param
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePathParam(paramName, { mode: "store_var" })}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                              paramMode === "store_var"
                                ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Map from Zustand state store variable"
                          >
                            State Store
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdatePathParam(paramName, { mode: "static" })}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer",
                              paramMode === "static"
                                ? "bg-background text-foreground shadow-2xs font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            title="Use static value"
                          >
                            Static
                          </button>
                        </div>
                      </div>

                      {/* Mode: Route Param */}
                      {paramMode === "route_param" && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground shrink-0 font-mono">Map from:</span>
                            <div className="flex items-center gap-1 flex-1">
                              <span className="text-[10px] font-mono text-primary font-medium shrink-0">params.</span>
                              {availableRouteParams.length > 0 ? (
                                <Select
                                  value={paramConfig.sourceParamName || paramName}
                                  onValueChange={(val) => handleUpdatePathParam(paramName, { sourceParamName: val })}
                                >
                                  <SelectTrigger className="h-6 text-[10px] flex-1 bg-muted/20 font-mono">
                                    <SelectValue placeholder="Route Param Name" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableRouteParams.map((p) => (
                                      <SelectItem key={p} value={p} className="text-xs font-mono">
                                        params.{p}
                                      </SelectItem>
                                    ))}
                                    {!availableRouteParams.includes(paramConfig.sourceParamName || paramName) && (
                                      <SelectItem value={paramConfig.sourceParamName || paramName} className="text-xs font-mono">
                                        params.{paramConfig.sourceParamName || paramName} (custom)
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <LocalInput
                                  value={paramConfig.sourceParamName || paramName}
                                  onChange={(e) => handleUpdatePathParam(paramName, { sourceParamName: e.target.value })}
                                  placeholder={paramName}
                                  className="h-6 text-[10px] font-mono flex-1 bg-muted/20"
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground shrink-0 font-mono">Fallback (if empty):</span>
                            <LocalInput
                              value={paramConfig.value || ""}
                              onChange={(e) => handleUpdatePathParam(paramName, { value: e.target.value })}
                              placeholder={`e.g. new or 1`}
                              className="h-5 text-[9px] font-mono flex-1 bg-muted/20"
                            />
                          </div>
                        </div>
                      )}

                      {/* Mode: Query Param */}
                      {paramMode === "query_param" && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground shrink-0 font-mono">Map from:</span>
                            <div className="flex items-center gap-1 flex-1">
                              <span className="text-[10px] font-mono text-primary font-medium shrink-0">searchParams.get(</span>
                              {availableQueryParams.length > 0 ? (
                                <Select
                                  value={paramConfig.sourceParamName || paramName}
                                  onValueChange={(val) => handleUpdatePathParam(paramName, { sourceParamName: val })}
                                >
                                  <SelectTrigger className="h-6 text-[10px] flex-1 bg-muted/20 font-mono">
                                    <SelectValue placeholder="Query Param Name" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableQueryParams.map((q) => (
                                      <SelectItem key={q} value={q} className="text-xs font-mono">
                                        "{q}"
                                      </SelectItem>
                                    ))}
                                    {!availableQueryParams.includes(paramConfig.sourceParamName || paramName) && (
                                      <SelectItem value={paramConfig.sourceParamName || paramName} className="text-xs font-mono">
                                        "{paramConfig.sourceParamName || paramName}" (custom)
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <LocalInput
                                  value={paramConfig.sourceParamName || paramName}
                                  onChange={(e) => handleUpdatePathParam(paramName, { sourceParamName: e.target.value })}
                                  placeholder={paramName}
                                  className="h-6 text-[10px] font-mono flex-1 bg-muted/20"
                                />
                              )}
                              <span className="text-[10px] font-mono text-primary font-medium shrink-0">)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground shrink-0 font-mono">Fallback (if empty):</span>
                            <LocalInput
                              value={paramConfig.value || ""}
                              onChange={(e) => handleUpdatePathParam(paramName, { value: e.target.value })}
                              placeholder={`e.g. default`}
                              className="h-5 text-[9px] font-mono flex-1 bg-muted/20"
                            />
                          </div>
                        </div>
                      )}

                      {/* Mode: State Store */}
                      {paramMode === "store_var" && (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <Select
                              value={paramConfig.storeId || paramConfig.storeName || (stateStores[0]?.id ?? "")}
                              onValueChange={(val) => {
                                const st = stateStores.find((s) => s.id === val || s.name === val);
                                handleUpdatePathParam(paramName, {
                                  storeId: st?.id,
                                  storeName: st?.name,
                                });
                              }}
                            >
                              <SelectTrigger className="h-6 text-[10px] bg-muted/20">
                                <SelectValue placeholder="Select Store" />
                              </SelectTrigger>
                              <SelectContent>
                                {stateStores.map((st) => (
                                  <SelectItem key={st.id} value={st.id} className="text-xs">
                                    {st.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select
                              value={paramConfig.storeVar || ""}
                              onValueChange={(val) => handleUpdatePathParam(paramName, { storeVar: val })}
                            >
                              <SelectTrigger className="h-6 text-[10px] bg-muted/20 font-mono">
                                <SelectValue placeholder="Select Variable" />
                              </SelectTrigger>
                              <SelectContent>
                                {(() => {
                                  const st = stateStores.find(
                                    (s) => s.id === paramConfig.storeId || s.name === paramConfig.storeName,
                                  ) || stateStores[0];
                                  return (st?.fields || []).map((f) => (
                                    <SelectItem key={f.name} value={f.name} className="text-xs font-mono">
                                      {f.name} {f.type ? `(${f.type})` : ""}
                                    </SelectItem>
                                  ));
                                })()}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground shrink-0 font-mono">Fallback:</span>
                            <LocalInput
                              value={paramConfig.value || ""}
                              onChange={(e) => handleUpdatePathParam(paramName, { value: e.target.value })}
                              placeholder="e.g. new"
                              className="h-5 text-[9px] font-mono flex-1 bg-muted/20"
                            />
                          </div>
                        </div>
                      )}

                      {/* Mode: Static */}
                      {paramMode === "static" && (
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[10px] text-muted-foreground shrink-0 font-mono">Value:</span>
                          <LocalInput
                            value={paramConfig.value || ""}
                            onChange={(e) => handleUpdatePathParam(paramName, { value: e.target.value })}
                            placeholder="e.g. new or 123"
                            className="h-6 text-[10px] font-mono flex-1 bg-muted/20"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Query Parameters Section */}
          {currentQueryParams.length > 0 && (
            <div className="p-2 rounded-md bg-muted/30 border border-border/40 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <span>Query Parameters</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-border text-muted-foreground">
                    {currentQueryParams.length}
                  </Badge>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddQueryParam}
                  className="h-5 text-[9px] px-1.5 text-primary hover:text-primary gap-1 cursor-pointer"
                >
                  <Plus size={9} />
                  <span>Add Param</span>
                </Button>
              </div>

              <div className="space-y-1.5">
                {currentQueryParams.map((q) => {
                  const qMode = q.mode || "static";

                  return (
                    <div key={q.id} className="p-1.5 rounded bg-background/80 border border-border/40 space-y-1">
                      <div className="flex items-center gap-1">
                        <LocalInput
                          value={q.key}
                          onChange={(e) => handleUpdateQueryParam(q.id, { key: e.target.value })}
                          placeholder="key (e.g. tab)"
                          className="h-5 text-[10px] font-mono w-24 bg-muted/20"
                        />
                        <span className="text-[10px] text-muted-foreground font-mono">=</span>

                        {/* Query value depending on mode */}
                        {qMode === "static" && (
                          <LocalInput
                            value={q.value}
                            onChange={(e) => handleUpdateQueryParam(q.id, { value: e.target.value })}
                            placeholder="value (e.g. messages)"
                            className="h-5 text-[10px] font-mono flex-1 bg-muted/20"
                          />
                        )}

                        {qMode === "route_param" && (
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[9px] font-mono text-primary font-medium shrink-0">params.</span>
                            <LocalInput
                              value={q.sourceParamName || q.key}
                              onChange={(e) => handleUpdateQueryParam(q.id, { sourceParamName: e.target.value })}
                              placeholder={q.key}
                              className="h-5 text-[10px] font-mono flex-1 bg-muted/20"
                            />
                          </div>
                        )}

                        {qMode === "query_param" && (
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[9px] font-mono text-primary font-medium shrink-0">searchParams.</span>
                            <LocalInput
                              value={q.sourceParamName || q.key}
                              onChange={(e) => handleUpdateQueryParam(q.id, { sourceParamName: e.target.value })}
                              placeholder={q.key}
                              className="h-5 text-[10px] font-mono flex-1 bg-muted/20"
                            />
                          </div>
                        )}

                        {qMode === "store_var" && (
                          <Select
                            value={q.storeVar || ""}
                            onValueChange={(val) => handleUpdateQueryParam(q.id, { storeVar: val })}
                          >
                            <SelectTrigger className="h-5 text-[10px] flex-1 bg-muted/20 font-mono">
                              <SelectValue placeholder="Variable" />
                            </SelectTrigger>
                            <SelectContent>
                              {stateStores.flatMap((st) =>
                                (st.fields || []).map((f) => (
                                  <SelectItem key={`${st.id}-${f.name}`} value={f.name} className="text-xs font-mono">
                                    {st.name}.{f.name}
                                  </SelectItem>
                                )),
                              )}
                            </SelectContent>
                          </Select>
                        )}

                        {/* Mode switcher dropdown */}
                        <Select
                          value={qMode}
                          onValueChange={(val) =>
                            handleUpdateQueryParam(q.id, {
                              mode: val as SidebarStaticItemQueryParam["mode"],
                              sourceParamName: q.sourceParamName || q.key,
                            })
                          }
                        >
                          <SelectTrigger className="h-5 w-16 px-1 text-[9px] font-mono bg-muted/40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="static" className="text-xs font-mono">Static</SelectItem>
                            <SelectItem value="route_param" className="text-xs font-mono">Route</SelectItem>
                            <SelectItem value="query_param" className="text-xs font-mono">Query</SelectItem>
                            <SelectItem value="store_var" className="text-xs font-mono">Store</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteQueryParam(q.id)}
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                          title="Remove query param"
                        >
                          <X size={10} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resolved Preview URL */}
          <div className="flex items-center gap-1.5 text-[10px] bg-background/70 px-2 py-1 rounded border border-border/30">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
              Resolved:
            </span>
            <span className="font-mono text-[10px] text-emerald-500 truncate" title={previewUrl}>
              {previewUrl}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
SidebarStaticItemRow.displayName = "SidebarStaticItemRow";
