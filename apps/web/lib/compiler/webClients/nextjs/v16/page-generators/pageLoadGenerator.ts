import type { PageInfo } from "../types";
import type { UIEventItem } from "@workspace/canvas/types";

export interface LifecycleActionMeta {
  action: UIEventItem;
  actName: string;
  actUrl: string;
  actMethod: string;
}

export function generateIntervalEffects(intervalActions: LifecycleActionMeta[]): string {
  if (!intervalActions || intervalActions.length === 0) return "";
  return intervalActions
    .map(({ action, actName, actUrl, actMethod }) => {
      const ms = action.intervalConfig?.intervalMs || 5000;
      const runImmediately = action.intervalConfig?.runImmediately !== false;
      const triggerCall = `handleTriggerAction("${actName}", "interval", ${actUrl ? `"${actUrl}"` : '""'}, "${actMethod || "GET"}");`;
      return `  // Periodic timer interval (${actName}, every ${ms}ms)
  useEffect(() => {
    ${runImmediately ? `${triggerCall}\n    ` : ""}const timer = setInterval(() => {
      ${triggerCall}
    }, ${ms});
    return () => clearInterval(timer);
  }, []);
`;
    })
    .join("\n");
}

export function generateParamChangeEffects(paramChangeActions: LifecycleActionMeta[]): string {
  if (!paramChangeActions || paramChangeActions.length === 0) return "";
  return paramChangeActions
    .map(({ action, actName, actUrl, actMethod }) => {
      const watchPaths = action.paramChangeConfig?.watchPathParams || [];
      const watchQueries = action.paramChangeConfig?.watchQueryParams || [];
      const deps: string[] = [];
      watchPaths.forEach((p) => deps.push(`routeParams?.${p}`));
      watchQueries.forEach((q) => deps.push(`routeSearchParams?.get("${q}")`));
      const depStr = deps.length > 0 ? deps.join(", ") : "routeParams, routeSearchParams";
      const triggerCall = `handleTriggerAction("${actName}", "paramChange", ${actUrl ? `"${actUrl}"` : '""'}, "${actMethod || "GET"}");`;
      return `  // Route parameter change watcher (${actName})
  useEffect(() => {
    ${triggerCall}
  }, [${depStr}]);
`;
    })
    .join("\n");
}

export function generateStateWatcherEffects(effectActions: LifecycleActionMeta[]): string {
  if (!effectActions || effectActions.length === 0) return "";
  return effectActions
    .map(({ action, actName, actUrl, actMethod }) => {
      const mappings = action.effectConfig?.variableMappings;
      const deps: string[] = [];
      const storeSelectors: string[] = [];

      if (mappings && mappings.length > 0) {
        mappings.forEach((m) => {
          if (m.source === "store" && m.storeName) {
            const clean = m.storeName.replace(/Store$/i, "");
            const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
            const varIdentifier = `${clean.toLowerCase()}${m.variableName.charAt(0).toUpperCase() + m.variableName.slice(1)}`;
            storeSelectors.push(`  const ${varIdentifier} = ${hookName}((s) => s.${m.variableName});`);
            deps.push(varIdentifier);
          } else if (m.source === "param") {
            if (m.variableName.startsWith("routeParams") || m.variableName.startsWith("routeSearchParams")) {
              deps.push(m.variableName);
            } else {
              deps.push(`routeParams?.${m.variableName}`);
            }
          } else {
            deps.push(m.variableName);
          }
        });
      } else {
        (action.effectConfig?.dependencies || []).forEach((d) => deps.push(d));
      }

      const debounceMs = action.effectConfig?.debounceMs || 0;
      const depStr = deps.length > 0 ? deps.join(", ") : "";
      const triggerCall = `handleTriggerAction("${actName}", "effect", ${actUrl ? `"${actUrl}"` : '""'}, "${actMethod || "POST"}");`;

      const storePrefix = storeSelectors.length > 0 ? `${storeSelectors.join("\n")}\n\n` : "";

      if (debounceMs > 0) {
        return `${storePrefix}  // Reactive state watcher with ${debounceMs}ms debounce (${actName})
  useEffect(() => {
    const handler = setTimeout(() => {
      ${triggerCall}
    }, ${debounceMs});
    return () => clearTimeout(handler);
  }, [${depStr}]);
`;
      }
      return `${storePrefix}  // Reactive state watcher (${actName})
  useEffect(() => {
    ${triggerCall}
  }, [${depStr}]);
`;
    })
    .join("\n");
}

export function generateVisibilityEffects(visibilityActions: LifecycleActionMeta[]): string {
  if (!visibilityActions || visibilityActions.length === 0) return "";
  return visibilityActions
    .map(({ actName, actUrl, actMethod }) => {
      const triggerCall = `handleTriggerAction("${actName}", "visibilityChange", ${actUrl ? `"${actUrl}"` : '""'}, "${actMethod || "GET"}");`;
      return `  // Tab visibility change (${actName})
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ${triggerCall}
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);
`;
    })
    .join("\n");
}

export function generateBeforeUnloadEffects(beforeUnloadActions: LifecycleActionMeta[]): string {
  if (!beforeUnloadActions || beforeUnloadActions.length === 0) return "";
  return beforeUnloadActions
    .map(({ actName }) => {
      return `  // Before unload confirmation guard (${actName})
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return (e.returnValue = "");
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
`;
    })
    .join("\n");
}

export function generatePageLoadState(
  hasPageLoad: boolean,
  pageLoadDataType: string = "JSONValue",
  isSsr: boolean = false,
): string {
  if (!hasPageLoad) return "";
  const initialDataExpr = isSsr ? "initialData ?? null" : "null";
  const initialErrorExpr = isSsr ? "initialError ?? null" : "null";
  return `  const [pageLoadData, setPageLoadData] = useState<${pageLoadDataType}>(${initialDataExpr});
  const [pageLoadLoading, setPageLoadLoading] = useState<boolean>(false);
  const [pageLoadError, setPageLoadError] = useState<string | null>(${initialErrorExpr});

`;
}

export function generatePageLoadEffect(
  hasPageLoad: boolean,
  pageMeta: PageInfo,
  pageLoadFetchStatements: string,
  unmountCleanups: string = "",
  isSsr: boolean = false,
  ssrStorePopulation: string = "",
): string {
  const hasUnmount = Boolean(unmountCleanups && unmountCleanups.trim());
  if (!hasPageLoad && !hasUnmount) return "";

  if (isSsr) {
    const adjustedStorePopulation = ssrStorePopulation
      ? ssrStorePopulation.replace(/\bdata\b/g, "initialData").trim()
      : "";
    const storeBlock = adjustedStorePopulation
      ? `    if (initialData) {\n      ${adjustedStorePopulation}\n    }\n`
      : "";
    const cleanupBlock = [
      "      isMounted = false;",
      unmountCleanups ? `      ${unmountCleanups.trim()}` : "",
    ].filter(Boolean).join("\n");

    return `  // SSR Hydration & Lifecycle for ${pageMeta.label}
  useEffect(() => {
    let isMounted = true;
${storeBlock}    return () => {
${cleanupBlock}
    };
  }, [initialData]);

`;
  }

  const loadDataBlock = hasPageLoad
    ? `    async function loadPageData() {
      setPageLoadLoading(true);
      setPageLoadError(null);
      try {
        ${pageLoadFetchStatements}
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : "Failed to load page data";
          setPageLoadError(errorMessage);
          setTriggerLogs((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              eventName: "pageLoad",
              eventType: "pageLoad",
              timestamp: new Date().toLocaleTimeString(),
              url: "N/A",
              method: "LOAD",
              error: errorMessage,
              data: null,
            },
            ...prev,
          ]);
        }
      } finally {
        if (isMounted) {
          setPageLoadLoading(false);
        }
      }
    }
    loadPageData();`
    : "";

  const cleanupBlock = [
    "      isMounted = false;",
    unmountCleanups ? `      ${unmountCleanups.trim()}` : "",
  ].filter(Boolean).join("\n");

  return `  // Page lifecycle (load & unmount cleanup) for ${pageMeta.label}
  useEffect(() => {
    let isMounted = true;
${loadDataBlock ? `${loadDataBlock}\n` : ""}    return () => {
${cleanupBlock}
    };
  }, []);

`;
}

export function generatePageLoadSection(hasPageLoad: boolean): string {
  // Page load data is now presented in the Output Log section
  return "";
}

export function generateJsonValueTypeDecl(hasPageLoad: boolean): string {
  if (!hasPageLoad) return "";
  return `type JSONPrimitive = string | number | boolean | null;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = JSONPrimitive | JSONObject | JSONArray;

`;
}
