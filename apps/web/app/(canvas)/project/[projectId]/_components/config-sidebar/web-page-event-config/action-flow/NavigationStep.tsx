import React, { useMemo, useState } from "react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Globe,
  Braces,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Layers,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";
import type {
  BackendNode,
  Endpoint,
  UIEventItem,
  Parameter,
  PageSection,
  PageStateObject,
} from "@workspace/canvas";
import { parseRouteWithQueryParams, pageRouteToUrl } from "@workspace/canvas";
import type {
  FrontendActionStepDraft,
  FrontendFieldSource,
  NavigationPathParamBinding,
  NavigationMethod,
  AvailablePath,
} from "./types";
import { ActionFlowCombobox, ComboboxOption } from "./ActionFlowCombobox";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { cn } from "@workspace/ui/lib/utils";

export interface NavigationStepProps {
  draft: FrontendActionStepDraft;
  allNodes: BackendNode[];
  allSteps?: FrontendActionStepDraft[];
  stepIndex?: number;
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemPropSuggestions?: ComboboxOption[];
  onChange: (updated: FrontendActionStepDraft) => void;
}

export type NavigationParamMode =
  | "prev_response"
  | "state_store"
  | "local_state"
  | "route_param"
  | "query_param"
  | "item_prop"
  | "literal";

function isNavigationParamMode(val: string): val is NavigationParamMode {
  return (
    val === "prev_response" ||
    val === "state_store" ||
    val === "local_state" ||
    val === "route_param" ||
    val === "query_param" ||
    val === "item_prop" ||
    val === "literal"
  );
}

/**
 * Extracts dynamic route parameter names from bracket syntax `[id]`, `[...slug]`
 * or colon syntax `:id`, as well as any configured `pathParams` on the page node.
 */
function extractDynamicRouteParams(
  route: string,
  pageNode?: BackendNode,
): string[] {
  const params: string[] = [];
  if (!route) return params;

  // Next.js bracket syntax: [id], [...slug], [[...slug]]
  const bracketMatches = route.matchAll(
    /\[\[?\.\.\.?([a-zA-Z0-9_-]+)\]?\]|\[([a-zA-Z0-9_-]+)\]/g,
  );
  for (const match of bracketMatches) {
    const name = match[1] || match[2];
    if (name && !params.includes(name)) {
      params.push(name);
    }
  }

  // Colon syntax: :id
  const colonMatches = route.matchAll(/:([a-zA-Z0-9_-]+)/g);
  for (const match of colonMatches) {
    const name = match[1];
    if (name && !params.includes(name)) {
      params.push(name);
    }
  }

  // Also include any pathParams defined directly on the page node
  const nodeParams = pageNode?.data?.pathParams;
  if (Array.isArray(nodeParams)) {
    for (const p of nodeParams) {
      if (p.name && !params.includes(p.name)) {
        params.push(p.name);
      }
    }
  }

  return params;
}

export const NavigationStep: React.FC<NavigationStepProps> = ({
  draft,
  allNodes,
  allSteps = [],
  stepIndex = 0,
  endpoints = [],
  webPageNodeId,
  isItemScoped = false,
  itemKeyField,
  itemPropSuggestions = [],
  onChange,
}) => {
  const pageNodes = useMemo(() => {
    return allNodes.filter((n) => {
      if (n.type !== "webPage" && n.type !== "page_ref") return false;
      if (n.data?.isLayout) return false;
      const label = (n.data?.label || n.data?.name || "").trim().toLowerCase();
      if (label === "layout" || label.endsWith(" layout") || label.endsWith("-layout")) return false;
      const path = (n.data?.path || "").trim().toLowerCase();
      if (path.includes("layout")) return false;
      return true;
    });
  }, [allNodes]);

  const navType = draft.navType || "route";
  const targetRoute = draft.targetRoute || "/";
  const navCondition = draft.navCondition || "direct";
  const navMethod: NavigationMethod = draft.navMethod || "router_push";
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      (draft.navMethod && draft.navMethod !== "router_push") ||
        (draft.navCondition && draft.navCondition !== "direct"),
    ),
  );

  // Build configured route options from all canvas web pages
  const configuredRouteOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = [];
    const seenRoutes = new Set<string>();

    pageNodes.forEach((p) => {
      const raw = p.data?.path || p.data?.label || "/";
      const route = p.data?.isRoot ? "/" : pageRouteToUrl(raw);
      if (seenRoutes.has(route)) return;
      seenRoutes.add(route);

      const dynamicSegments = extractDynamicRouteParams(route, p);
      const isDynamic = dynamicSegments.length > 0;
      const pageLabel = p.data?.label || p.data?.name || "Page";

      options.push({
        value: route,
        label: `${route} (${pageLabel})`,
        type: isDynamic ? `[${dynamicSegments.join(", ")}]` : "page",
        description: pageLabel,
      });
    });

    // Provide default root option if not present
    if (!seenRoutes.has("/")) {
      options.unshift({ value: "/", label: "/ (Root / Home)", type: "root" });
    }

    return options;
  }, [pageNodes]);

  // Find corresponding page node for current targetRoute or targetPageId
  const matchedPageNode = useMemo(() => {
    if (draft.targetPageId) {
      const byId = pageNodes.find((p) => p.id === draft.targetPageId);
      if (byId) return byId;
    }
    const cleanRoute = (targetRoute || "").trim();
    return pageNodes.find((p) => {
      const r = p.data?.isRoot
        ? "/"
        : pageRouteToUrl(p.data?.path || p.data?.label || "/");
      return (
        r === cleanRoute ||
        p.data?.path === cleanRoute ||
        p.data?.label === cleanRoute
      );
    });
  }, [pageNodes, draft.targetPageId, targetRoute]);

  // Detected dynamic parameters in targetRoute (e.g. ['id', 'slug'])
  const detectedDynamicParams = useMemo(() => {
    return extractDynamicRouteParams(targetRoute, matchedPageNode);
  }, [targetRoute, matchedPageNode]);

  // Prior steps (e.g. api_call or transform) that can supply response data
  const priorSteps = useMemo(() => {
    return allSteps.slice(0, stepIndex);
  }, [allSteps, stepIndex]);

  const priorStepsWithOptions = useMemo(() => {
    return priorSteps.filter(
      (s) =>
        s.type === "api_call" ||
        s.type === "transform" ||
        s.type === "browser_storage",
    );
  }, [priorSteps]);

  // Current page node context
  const currentPageNode = useMemo(() => {
    return allNodes.find((n) => n.id === webPageNodeId);
  }, [allNodes, webPageNodeId]);

  // Current page route parameters
  const currentRouteParams = useMemo(() => {
    const list: string[] = [];
    const params = currentPageNode?.data?.pathParams;
    if (Array.isArray(params)) {
      params.forEach((p: Parameter) => {
        if (p.name && !list.includes(p.name)) list.push(p.name);
      });
    }
    const currentRoute =
      currentPageNode?.data?.path || currentPageNode?.data?.label || "";
    extractDynamicRouteParams(currentRoute).forEach((p) => {
      if (!list.includes(p)) list.push(p);
    });
    return list;
  }, [currentPageNode]);

  // Current page query parameters
  const currentQueryParams = useMemo(() => {
    const list: string[] = [];
    const queries = currentPageNode?.data?.queryParams;
    if (Array.isArray(queries)) {
      queries.forEach((q: Parameter) => {
        if (q.name && !list.includes(q.name)) list.push(q.name);
      });
    }
    return list;
  }, [currentPageNode]);

  // Available Zustand state stores
  const stateStores = useMemo(() => {
    return allNodes.filter((n) => n.type === "state_store");
  }, [allNodes]);

  const stateStoreFieldSuggestions: ComboboxOption[] = useMemo(() => {
    const list: ComboboxOption[] = [];
    for (const store of stateStores) {
      const storeName = store.data?.label || store.data?.storeName || "Store";
      const fields = store.data?.fields;
      if (Array.isArray(fields)) {
        for (const field of fields) {
          list.push({
            value: `${storeName}.${field.name}`,
            label: `${storeName}.${field.name}`,
            type: field.type || "string",
            description: storeName,
          });
        }
      }
    }
    return list;
  }, [stateStores]);

  // Available local state objects on the current page
  const localStateSuggestions: ComboboxOption[] = useMemo(() => {
    const list: ComboboxOption[] = [];
    const sections = currentPageNode?.data?.sections;
    if (Array.isArray(sections)) {
      sections.forEach((sec: PageSection) => {
        const stateObjects = sec.stateObjects;
        if (Array.isArray(stateObjects)) {
          stateObjects.forEach((st: PageStateObject) => {
            list.push({
              value: st.name || st.id,
              label: st.name || st.id,
              type: st.type || "string",
              description: sec.name || "Local State",
            });
          });
        }
      });
    }
    return list;
  }, [currentPageNode]);

  // Item prop suggestions
  const itemPropOptions: ComboboxOption[] = useMemo(() => {
    if (itemPropSuggestions && itemPropSuggestions.length > 0) {
      return itemPropSuggestions;
    }
    return [
      { value: itemKeyField || "id", label: `item.${itemKeyField || "id"}`, type: "string" },
      { value: "id", label: "item.id", type: "string" },
      { value: "name", label: "item.name", type: "string" },
    ];
  }, [itemPropSuggestions, itemKeyField]);

  // Handle route change with automatic parameter binding reconciliation
  const handleRouteChange = (newRoute: string) => {
    const cleanRoute = newRoute.trim();
    const matched = pageNodes.find((p) => {
      const r = p.data?.isRoot
        ? "/"
        : pageRouteToUrl(p.data?.path || p.data?.label || "/");
      return (
        r === cleanRoute ||
        p.data?.path === cleanRoute ||
        p.data?.label === cleanRoute
      );
    });

    const newDynamicParams = extractDynamicRouteParams(cleanRoute, matched);
    const existingBindings = draft.pathParamBindings || [];

    // Keep existing bindings that still match a dynamic param in the route
    const updatedBindings: NavigationPathParamBinding[] = [];

    newDynamicParams.forEach((paramName) => {
      const existing = existingBindings.find((b) => b.paramName === paramName);
      if (existing) {
        updatedBindings.push(existing);
      } else {
        // Auto-suggest initial source
        let initialSource: FrontendFieldSource = { kind: "literal", value: "" };

        // 1. Try prior step output (e.g. api_call id)
        const firstPriorStep =
          priorStepsWithOptions[priorStepsWithOptions.length - 1];
        if (firstPriorStep) {
          initialSource = {
            kind: "prev_response",
            stepId: firstPriorStep.id,
            fieldPath: paramName,
          };
        } else if (isItemScoped) {
          initialSource = {
            kind: "item_prop",
            propPath: paramName,
          };
        } else if (currentRouteParams.includes(paramName)) {
          initialSource = {
            kind: "route_param",
            paramName,
          };
        } else if (
          stateStoreFieldSuggestions.some((s) => s.value.endsWith(`.${paramName}`))
        ) {
          const match = stateStoreFieldSuggestions.find((s) =>
            s.value.endsWith(`.${paramName}`),
          );
          const parts = match!.value.split(".");
          initialSource = {
            kind: "state_var",
            sourceType: "store",
            storeName: parts[0],
            stateKey: parts[1] || paramName,
            fieldPath: match!.value,
          };
        }

        updatedBindings.push({
          paramName,
          source: initialSource,
        });
      }
    });

    onChange({
      ...draft,
      targetRoute: newRoute,
      targetPageId: matched ? matched.id : draft.targetPageId,
      pathParamBindings: updatedBindings,
    });
  };

  // Update a single parameter binding
  const handleUpdateParamBinding = (
    paramName: string,
    source: FrontendFieldSource,
  ) => {
    const current = draft.pathParamBindings || [];
    const exists = current.some((b) => b.paramName === paramName);
    const updated = exists
      ? current.map((b) => (b.paramName === paramName ? { ...b, source } : b))
      : [...current, { paramName, source }];

    onChange({
      ...draft,
      pathParamBindings: updated,
    });
  };

  // Change source mode for a parameter binding
  const handleParamModeChange = (
    paramName: string,
    newKind:
      | "prev_response"
      | "state_store"
      | "local_state"
      | "route_param"
      | "query_param"
      | "item_prop"
      | "literal",
  ) => {
    let newSource: FrontendFieldSource;
    if (newKind === "prev_response") {
      const defaultStep =
        priorStepsWithOptions[priorStepsWithOptions.length - 1];
      newSource = {
        kind: "prev_response",
        stepId: defaultStep?.id || "",
        fieldPath: paramName,
      };
    } else if (newKind === "state_store") {
      const defaultField = stateStoreFieldSuggestions[0]?.value || "";
      const parts = defaultField.split(".");
      newSource = {
        kind: "state_var",
        sourceType: "store",
        storeName: parts[0] || "",
        stateKey: parts[1] || paramName,
        fieldPath: defaultField,
      };
    } else if (newKind === "local_state") {
      const defaultLocal = localStateSuggestions[0]?.value || paramName;
      newSource = {
        kind: "state_var",
        sourceType: "local",
        stateKey: defaultLocal,
      };
    } else if (newKind === "route_param") {
      newSource = {
        kind: "route_param",
        paramName: currentRouteParams[0] || paramName,
      };
    } else if (newKind === "query_param") {
      newSource = {
        kind: "query_param",
        paramName: currentQueryParams[0] || paramName,
      };
    } else if (newKind === "item_prop") {
      newSource = {
        kind: "item_prop",
        propPath: paramName,
      };
    } else {
      newSource = {
        kind: "literal",
        value: "",
      };
    }

    handleUpdateParamBinding(paramName, newSource);
  };

  // Live compiled preview of router.push(...)
  const livePreview = useMemo(() => {
    let preview = targetRoute || "/";
    const bindings = draft.pathParamBindings || [];
    let isDynamic = false;

    bindings.forEach((b) => {
      const src = b.source;
      let rep = `:${b.paramName}`;
      if (src) {
        if (src.kind === "literal") {
          rep = src.value ? src.value : `[${b.paramName}]`;
        } else if (src.kind === "prev_response") {
          isDynamic = true;
          rep = `\${step.${src.fieldPath || "id"}}`;
        } else if (src.kind === "state_var") {
          isDynamic = true;
          rep = `\${${
            src.fieldPath ||
            (src.storeName
              ? `${src.storeName}.${src.stateKey}`
              : src.stateKey)
          }}`;
        } else if (src.kind === "route_param") {
          isDynamic = true;
          rep = `\${params.${src.paramName}}`;
        } else if (src.kind === "query_param") {
          isDynamic = true;
          rep = `\${query.${src.paramName}}`;
        } else if (src.kind === "item_prop") {
          isDynamic = true;
          rep = `\${item.${src.propPath || src.fieldPath || "id"}}`;
        }
      }
      preview = preview.replace(new RegExp(`\\[${b.paramName}\\]`, "g"), rep);
    });

    const method = draft.navMethod || "router_push";
    let previewText = "";
    if (method === "history_push") {
      previewText = isDynamic
        ? `history.pushState({}, "", \`${preview}\`)`
        : `history.pushState({}, "", "${preview}")`;
    } else if (method === "history_replace") {
      previewText = isDynamic
        ? `history.replaceState({}, "", \`${preview}\`)`
        : `history.replaceState({}, "", "${preview}")`;
    } else if (method === "router_replace") {
      previewText = isDynamic
        ? `router.replace(\`${preview}\`)`
        : `router.replace("${preview}")`;
    } else {
      previewText = isDynamic
        ? `router.push(\`${preview}\`)`
        : `router.push("${preview}")`;
    }

    return {
      text: previewText,
      isDynamic,
    };
  }, [targetRoute, draft.pathParamBindings, draft.navMethod]);

  // Check if all detected dynamic params have a non-empty mapping
  const allParamsMapped = useMemo(() => {
    if (detectedDynamicParams.length === 0) return true;
    const bindings = draft.pathParamBindings || [];
    return detectedDynamicParams.every((p) => {
      const b = bindings.find((item) => item.paramName === p);
      if (!b) return false;
      const s = b.source;
      if (s.kind === "literal") return Boolean(s.value && s.value.trim().length > 0);
      if (s.kind === "prev_response") return Boolean(s.stepId && s.fieldPath);
      if (s.kind === "state_var") return Boolean(s.stateKey);
      if (s.kind === "route_param" || s.kind === "query_param")
        return Boolean(s.paramName);
      if (s.kind === "item_prop") return Boolean(s.propPath || s.fieldPath);
      return false;
    });
  }, [detectedDynamicParams, draft.pathParamBindings]);

  return (
    <div className="space-y-3 pt-1 text-xs">
      {/* Destination Page / Route */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Globe size={11} className="text-primary" />
            <span className="font-medium text-foreground">Destination Route / Page</span>
            {detectedDynamicParams.length > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary border-primary/30 font-mono"
              >
                {detectedDynamicParams.map((p) => `[${p}]`).join(" ")}
              </Badge>
            )}
          </Label>
          {matchedPageNode && (
            <span className="text-[9.5px] font-mono text-primary font-medium">
              Page: {matchedPageNode.data?.label || matchedPageNode.data?.name || "Canvas Page"}
            </span>
          )}
        </div>

        <ActionFlowCombobox
          value={targetRoute}
          onChange={handleRouteChange}
          options={configuredRouteOptions}
          placeholder="Select a canvas page or type /route..."
          headerLabel="Configured Pages & Routes"
        />

        {/* Quick Route Pills */}
        {configuredRouteOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <span className="text-[9px] text-muted-foreground mr-0.5">
              Quick:
            </span>
            {configuredRouteOptions.slice(0, 6).map((opt) => {
              const isSelected = targetRoute === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleRouteChange(opt.value)}
                  className={cn(
                    "text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-semibold shadow-2xs"
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/40",
                  )}
                  title={opt.description || opt.value}
                >
                  {opt.value}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Advanced Transition & Timing Options */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none py-1"
        >
          <SlidersHorizontal size={11} className="text-primary/70" />
          <span className="font-medium">Advanced Options</span>
          <span className="text-[9px] text-muted-foreground font-mono">
            ({navMethod.replace("_", ".")}{navCondition !== "direct" ? `, ${navCondition}` : ""})
          </span>
          {showAdvanced ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showAdvanced && (
          <div className="mt-1.5 space-y-2 p-2.5 rounded-lg border border-border/60 bg-secondary/15">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Transition Method
                </Label>
                <Select
                  value={navMethod}
                  onValueChange={(val: string) =>
                    onChange({ ...draft, navMethod: val as NavigationMethod })
                  }
                >
                  <SelectTrigger className="w-full h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="router_push">
                      router.push() (standard)
                    </SelectItem>
                    <SelectItem value="router_replace">
                      router.replace() (replace history)
                    </SelectItem>
                    <SelectItem value="history_push">
                      history.pushState() (in-place)
                    </SelectItem>
                    <SelectItem value="history_replace">
                      history.replaceState() (in-place)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Trigger Timing
                </Label>
                <Select
                  value={navCondition}
                  onValueChange={(val: "direct" | "on_success" | "on_error") =>
                    onChange({ ...draft, navCondition: val })
                  }
                >
                  <SelectTrigger className="w-full h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Immediate</SelectItem>
                    <SelectItem value="on_success">On Prior step Success</SelectItem>
                    <SelectItem value="on_error">On Prior step Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-[9.5px] text-muted-foreground leading-relaxed">
              {navMethod === "history_push"
                ? "Updates address bar via history.pushState() without unmounting or re-rendering."
                : navMethod === "history_replace"
                ? "Replaces address bar in-place via history.replaceState() without reload."
                : navMethod === "router_replace"
                ? "Replaces current history entry via Next.js router.replace()."
                : "Standard Next.js router.push() navigation."}
            </p>
          </div>
        )}
      </div>

      {/* Dynamic Route Parameters Mapping Panel */}
      {detectedDynamicParams.length > 0 ? (
        <div className="space-y-2 p-2.5 rounded-lg bg-muted/30 border border-primary/25">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-primary font-medium text-xs">
              <Braces size={13} className="shrink-0" />
              <span>Dynamic Route Parameter Mapping</span>
              <Badge
                variant="outline"
                className="text-[8px] px-1 py-0 h-3.5 bg-primary/10 border-primary/30 text-primary font-mono"
              >
                {detectedDynamicParams.length}{" "}
                {detectedDynamicParams.length === 1 ? "param" : "params"}
              </Badge>
            </div>
            {allParamsMapped ? (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 text-emerald-500 bg-emerald-500/10 border-emerald-500/30 flex items-center gap-1"
              >
                <CheckCircle2 size={10} />
                <span>Mapped</span>
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 text-amber-500 bg-amber-500/10 border-amber-500/30 flex items-center gap-1"
              >
                <AlertCircle size={10} />
                <span>Mapping Needed</span>
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Map each bracketed segment in{" "}
            <code className="text-primary font-mono">{targetRoute}</code> to its
            runtime value:
          </p>

          {/* Parameter Mapping Rows */}
          <div className="space-y-2 pt-1">
            {detectedDynamicParams.map((paramName) => {
              const binding = (draft.pathParamBindings || []).find(
                (b) => b.paramName === paramName,
              );
              const source = binding?.source || {
                kind: "literal",
                value: "",
              };

              // Determine selected mode
              const currentMode =
                source.kind === "state_var"
                  ? source.sourceType === "local"
                    ? "local_state"
                    : "state_store"
                  : source.kind;

              return (
                <div
                  key={paramName}
                  className="p-2 rounded-md bg-background border border-border/60 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-primary font-semibold">
                        [{paramName}]
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        segment
                      </span>
                    </div>

                    {/* Source Mode Selector */}
                    <div className="w-[160px] shrink-0">
                      <Select
                        value={currentMode}
                        onValueChange={(val: string) => {
                          if (isNavigationParamMode(val)) {
                            handleParamModeChange(paramName, val);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full h-7 text-xs bg-background">
                          <SelectValue placeholder="Select source..." />
                        </SelectTrigger>
                        <SelectContent>
                          {priorStepsWithOptions.length > 0 && (
                            <SelectItem value="prev_response">
                              Prior Step Response
                            </SelectItem>
                          )}
                          {stateStores.length > 0 && (
                            <SelectItem value="state_store">
                              Zustand State Store
                            </SelectItem>
                          )}
                          {localStateSuggestions.length > 0 && (
                            <SelectItem value="local_state">
                              Page Local State
                            </SelectItem>
                          )}
                          {currentRouteParams.length > 0 && (
                            <SelectItem value="route_param">
                              Route Param (params.x)
                            </SelectItem>
                          )}
                          {currentQueryParams.length > 0 && (
                            <SelectItem value="query_param">
                              Query Param (query.x)
                            </SelectItem>
                          )}
                          {isItemScoped && (
                            <SelectItem value="item_prop">
                              Item Context (item.x)
                            </SelectItem>
                          )}
                          <SelectItem value="literal">Static Literal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Source Value Configurator based on Mode */}
                  <div className="flex items-center gap-2 pl-0.5">
                    <ArrowRight
                      size={12}
                      className="text-muted-foreground/60 shrink-0"
                    />

                    {/* Mode: Prior Step Output */}
                    {source.kind === "prev_response" && (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {priorStepsWithOptions.length > 0 && (
                          <div className="w-44 shrink-0">
                            <Select
                              value={source.stepId || priorStepsWithOptions[0]?.id || ""}
                              onValueChange={(val) =>
                                handleUpdateParamBinding(paramName, {
                                  ...source,
                                  stepId: val,
                                })
                              }
                            >
                              <SelectTrigger className="w-full h-7 text-xs bg-background truncate">
                                <SelectValue placeholder="Select step..." />
                              </SelectTrigger>
                              <SelectContent>
                                {priorStepsWithOptions.map((s, idx) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    Step {s.order || idx + 1} ({s.type})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const selectedStep =
                              priorStepsWithOptions.find(
                                (s) => s.id === source.stepId,
                              ) || priorStepsWithOptions[0];
                            const selectedEndpoint = endpoints.find(
                              (e) => e.id === selectedStep?.endpointId,
                            );

                            return (
                              <ResponseFieldPicker
                                value={source.fieldPath || ""}
                                onChange={(fieldPath) =>
                                  handleUpdateParamBinding(paramName, {
                                    kind: "prev_response",
                                    stepId: selectedStep?.id || "",
                                    fieldPath,
                                  })
                                }
                                step={selectedStep}
                                endpoint={selectedEndpoint}
                                allNodes={allNodes}
                                endpoints={endpoints}
                                placeholder={`e.g. ${paramName} or data.${paramName}`}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Mode: State Store */}
                    {source.kind === "state_var" &&
                      source.sourceType !== "local" && (
                        <div className="flex-1 min-w-0">
                          <ActionFlowCombobox
                            value={
                              source.fieldPath ||
                              (source.storeName
                                ? `${source.storeName}.${source.stateKey}`
                                : source.stateKey) ||
                              ""
                            }
                            onChange={(val) => {
                              const parts = val.split(".");
                              const storeName = parts.length > 1 ? parts[0] : "";
                              const stateKey =
                                parts.length > 1 ? parts.slice(1).join(".") : val;
                              handleUpdateParamBinding(paramName, {
                                kind: "state_var",
                                sourceType: "store",
                                storeName,
                                stateKey,
                                fieldPath: val,
                              });
                            }}
                            options={stateStoreFieldSuggestions}
                            placeholder="Store.field (e.g. userStore.id)"
                            headerLabel="State Store Fields"
                          />
                        </div>
                      )}

                    {/* Mode: Local Page State */}
                    {source.kind === "state_var" &&
                      source.sourceType === "local" && (
                        <div className="flex-1 min-w-0">
                          <ActionFlowCombobox
                            value={source.stateKey || ""}
                            onChange={(val) =>
                              handleUpdateParamBinding(paramName, {
                                kind: "state_var",
                                sourceType: "local",
                                stateKey: val,
                              })
                            }
                            options={localStateSuggestions}
                            placeholder="Local State Key (e.g. selectedId)"
                            headerLabel="Page Local State"
                          />
                        </div>
                      )}

                    {/* Mode: Route Param */}
                    {source.kind === "route_param" && (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 bg-muted/60 px-1.5 py-1 rounded border border-border/50 h-7 flex items-center">
                          params.
                        </span>
                        <div className="flex-1 min-w-0">
                          <ActionFlowCombobox
                            value={source.paramName || ""}
                            onChange={(val) =>
                              handleUpdateParamBinding(paramName, {
                                kind: "route_param",
                                paramName: val,
                              })
                            }
                            options={currentRouteParams}
                            placeholder={paramName}
                            headerLabel="Current Route Parameters"
                          />
                        </div>
                      </div>
                    )}

                    {/* Mode: Query Param */}
                    {source.kind === "query_param" && (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 bg-muted/60 px-1.5 py-1 rounded border border-border/50 h-7 flex items-center">
                          searchParams.
                        </span>
                        <div className="flex-1 min-w-0">
                          <ActionFlowCombobox
                            value={source.paramName || ""}
                            onChange={(val) =>
                              handleUpdateParamBinding(paramName, {
                                kind: "query_param",
                                paramName: val,
                              })
                            }
                            options={currentQueryParams}
                            placeholder={paramName}
                            headerLabel="Current Query Parameters"
                          />
                        </div>
                      </div>
                    )}

                    {/* Mode: Item Context Prop */}
                    {source.kind === "item_prop" && (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 bg-muted/60 px-1.5 py-1 rounded border border-border/50 h-7 flex items-center">
                          item.
                        </span>
                        <div className="flex-1 min-w-0">
                          <ActionFlowCombobox
                            value={source.propPath || source.fieldPath || ""}
                            onChange={(val) =>
                              handleUpdateParamBinding(paramName, {
                                kind: "item_prop",
                                propPath: val,
                                fieldPath: val,
                              })
                            }
                            options={itemPropOptions}
                            placeholder={paramName}
                            headerLabel="Item Context Properties"
                          />
                        </div>
                      </div>
                    )}

                    {/* Mode: Static Literal */}
                    {source.kind === "literal" && (
                      <div className="flex-1 min-w-0">
                        <Input
                          value={source.value || ""}
                          onChange={(e) =>
                            handleUpdateParamBinding(paramName, {
                              kind: "literal",
                              value: e.target.value,
                            })
                          }
                          placeholder={`Static value for [${paramName}] (e.g. 123 or new)`}
                          className="h-7 text-xs font-mono bg-background"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Live Route Code Preview */}
      <div className="p-2 rounded-lg bg-card/80 border border-border/50 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground font-medium">
            Compiled Navigation Call
          </span>
          {detectedDynamicParams.length > 0 && (
            <span
              className={cn(
                "text-[9px] font-medium font-mono",
                allParamsMapped ? "text-emerald-500" : "text-amber-500",
              )}
            >
              {allParamsMapped ? "Ready" : "Dynamic values pending"}
            </span>
          )}
        </div>
        <div className="text-[11px] font-mono text-foreground px-2 py-1 rounded bg-muted/30 border border-border/30 overflow-x-auto whitespace-nowrap">
          {livePreview.text}
        </div>
      </div>
    </div>
  );
};
  