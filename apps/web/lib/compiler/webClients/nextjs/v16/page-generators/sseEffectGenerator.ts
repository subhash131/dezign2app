import type { LinkedRealtimeConnectionInfo } from "../types";
import { resolveStoreActionMethodName } from "../storeActionResolver";

function generateRealtimeStoreSnippet(
  binding: {
    storeName?: string;
    actionName?: string;
    actionType?: string;
    targetFieldName?: string;
    updateSource?: string;
    valuePath?: string;
    customValue?: string;
    parameterMappings?: Record<string, string>;
  },
  dataVar = "parsed",
): string {
  if (!binding?.storeName) return "";
  const cleanStore = binding.storeName.replace(/Store$/i, "");
  const hookName = `use${cleanStore.charAt(0).toUpperCase() + cleanStore.slice(1)}Store`;
  const actionName = resolveStoreActionMethodName(binding);

  const src = binding.updateSource || "full_message";
  const vPath = binding.valuePath?.trim();
  const cVal = binding.customValue?.trim();

  if (src === "static") {
    let parsedVal = "undefined";
    if (cVal) {
      try {
        JSON.parse(cVal);
        parsedVal = cVal;
      } catch {
        parsedVal = JSON.stringify(cVal);
      }
    }
    return `        ${hookName}.getState().${actionName}(${parsedVal});\n`;
  }

  if (actionName === "populate" && binding.parameterMappings && Object.keys(binding.parameterMappings).length > 0) {
    const fields = Object.entries(binding.parameterMappings)
      .filter(([_, p]: [string, string]) => Boolean(p && p.trim()))
      .map(([k, p]: [string, string]) => `${k}: (${dataVar} as any)${p.split(".").filter(Boolean).map((part: string) => `?.[${JSON.stringify(part)}]`).join("")}`)
      .join(", ");
    return `        ${hookName}.getState().populate({ ${fields} });\n`;
  }

  if (src === "nested_property" && vPath) {
    const chain = vPath.split(".").filter(Boolean).map((k) => `?.[${JSON.stringify(k)}]`).join("");
    return `        const extracted = (${dataVar} as any)${chain};\n        ${hookName}.getState().${actionName}(extracted);\n`;
  }

  // Default: full_message
  return `        ${hookName}.getState().${actionName}(${dataVar});\n`;
}

export function generateSseEffects(sseConnections: LinkedRealtimeConnectionInfo[]): string {
  if (sseConnections.length === 0) return "";

  const sseByUrl = new Map<string, LinkedRealtimeConnectionInfo[]>();
  sseConnections.forEach((conn) => {
    const url = conn.streamUrl!;
    if (!sseByUrl.has(url)) sseByUrl.set(url, []);
    sseByUrl.get(url)!.push(conn);
  });

  const effectBlocks: string[] = [];
  sseByUrl.forEach((conns, streamUrl) => {
    const hasPathBindings = conns.some(
      (c) => c.pathParamBindings && Object.keys(c.pathParamBindings).length > 0,
    );
    const hasQueryBindings = conns.some(
      (c) => c.queryParamBindings && Object.keys(c.queryParamBindings).length > 0,
    );
    const hasDynamicUrlPattern = /(?:\/|^):[a-zA-Z0-9_-]+|\[[a-zA-Z0-9_.-]+\]/.test(streamUrl);
    const isDynamic = hasPathBindings || hasQueryBindings || hasDynamicUrlPattern;

    const urlVar = isDynamic ? "effectiveUrl" : `"${streamUrl}"`;

    const customEvents = Array.from(
      new Set(
        conns
          .map((c) => c.eventName?.trim())
          .filter((name): name is string => Boolean(name && name !== "message")),
      ),
    );

    const customListeners = customEvents
      .map((evtName) => {
        const matchingBindings = conns
          .filter((c) => c.eventName?.trim() === evtName)
          .flatMap((c) => c.storeActionBindings || (c.storeActionBinding ? [c.storeActionBinding] : []))
          .filter((b) => Boolean(b.storeName));
        const storeStatements = matchingBindings
          .map((b) => generateRealtimeStoreSnippet(b, "parsed"))
          .join("");

        return `      es.addEventListener("${evtName}", (event) => {
        let parsed: unknown = event.data;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = event.data;
        }
${storeStatements}        setTriggerLogs((prev) => [
          {
            id: Math.random().toString(36).substring(2, 9),
            eventName: "${evtName}",
            eventType: "SSE",
            timestamp: new Date().toLocaleTimeString(),
            url: ${urlVar},
            method: "SSE",
            data: parsed,
          },
          ...prev,
        ]);
      });`;
      })
      .join("\n");

    const defaultBindings = conns
      .filter((c) => !c.eventName || c.eventName === "message")
      .flatMap((c) => c.storeActionBindings || (c.storeActionBinding ? [c.storeActionBinding] : []))
      .filter((b) => Boolean(b.storeName));
    const defaultStoreStatements = defaultBindings
      .map((b) => generateRealtimeStoreSnippet(b, "parsed"))
      .join("");

    let dynamicUrlBuilder = "";
    if (isDynamic) {
      const pathReplacements: string[] = [];
      conns.forEach((c) => {
        if (c.pathParamBindings) {
          Object.entries(c.pathParamBindings).forEach(([paramKey, accessor]) => {
            if (accessor.startsWith("params.")) {
              const routeKey = accessor.slice(7);
              pathReplacements.push(`      effectiveUrl = effectiveUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), String(routeParams?.["${routeKey}"] ?? ""));`);
            } else if (accessor.startsWith("query.")) {
              const qKey = accessor.slice(6);
              pathReplacements.push(`      effectiveUrl = effectiveUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), String(routeSearchParams?.get("${qKey}") ?? ""));`);
            } else {
              pathReplacements.push(`      effectiveUrl = effectiveUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), ${JSON.stringify(accessor)});`);
            }
          });
        }
      });

      const queryAppends: string[] = [];
      const seenQueryKeys = new Set<string>();
      conns.forEach((c) => {
        if (c.queryParamBindings) {
          Object.entries(c.queryParamBindings).forEach(([qKey, accessor]) => {
            if (seenQueryKeys.has(qKey)) return;
            seenQueryKeys.add(qKey);
            if (accessor.startsWith("params.")) {
              const routeKey = accessor.slice(7);
              queryAppends.push(`      if (routeParams?.["${routeKey}"]) sseParams.set("${qKey}", String(routeParams["${routeKey}"]));`);
            } else if (accessor.startsWith("query.")) {
              const queryKey = accessor.slice(6);
              queryAppends.push(`      if (routeSearchParams?.get("${queryKey}")) sseParams.set("${qKey}", routeSearchParams.get("${queryKey}")!);`);
            } else {
              queryAppends.push(`      sseParams.set("${qKey}", ${JSON.stringify(accessor)});`);
            }
          });
        }
      });

      dynamicUrlBuilder = `      let effectiveUrl = "${streamUrl}";\n${pathReplacements.join("\n")}${pathReplacements.length > 0 ? "\n" : ""}      effectiveUrl = effectiveUrl.replace(/:([a-zA-Z0-9_-]+)/g, (_, k) => String(routeParams?.[k] ?? ""));\n      effectiveUrl = effectiveUrl.replace(/\\[([a-zA-Z0-9_-]+)\\]/g, (_, k) => String(routeParams?.[k] ?? ""));\n${queryAppends.length > 0 ? `      const sseParams = new URLSearchParams();\n${queryAppends.join("\n")}\n      const sseQueryString = sseParams.toString();\n      if (sseQueryString) {\n        effectiveUrl += (effectiveUrl.includes("?") ? "&" : "?") + sseQueryString;\n      }\n` : ""}`;
    }

    const initSseLine = isDynamic
      ? `${dynamicUrlBuilder}      es = new EventSource(effectiveUrl, { withCredentials: true });`
      : `      es = new EventSource("${streamUrl}", { withCredentials: true });`;

    const openLogLine = isDynamic
      ? `          console.log("[SSE] Connected to " + effectiveUrl);`
      : `          console.log("[SSE] Connected to ${streamUrl}");`;

    const errReconnLine = isDynamic
      ? `        console.warn("[SSE] Reconnecting to stream (" + effectiveUrl + ")...");`
      : `        console.warn("[SSE] Reconnecting to stream (${streamUrl})...");`;

    const errInitLine = isDynamic
      ? `      console.error("[SSE] Failed to initialize EventSource (" + effectiveUrl + "):", err);`
      : `      console.error("[SSE] Failed to initialize EventSource (${streamUrl}):", err);`;

    const depsLine = isDynamic
      ? `  }, [routeParams, routeSearchParams]);`
      : `  }, []);`;

    effectBlocks.push(`  // Real-time SSE listener for ${conns[0]?.sourceServiceName || "Service"}
  useEffect(() => {
    let es: EventSource | null = null;
    let isMounted = true;
    try {
${initSseLine}
      es.onopen = () => {
        if (isMounted) {
${openLogLine}
        }
      };
${customListeners ? `${customListeners}\n` : ""}      es.onmessage = (event) => {
        if (!isMounted) return;
        if (event.data === "[DONE]") {
          return;
        }
        let parsed: unknown = event.data;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = event.data;
        }
${defaultStoreStatements}        setTriggerLogs((prev) => [
          {
            id: Math.random().toString(36).substring(2, 9),
            eventName: "message",
            eventType: "SSE",
            timestamp: new Date().toLocaleTimeString(),
            url: ${urlVar},
            method: "SSE",
            data: parsed,
          },
          ...prev,
        ]);
      };
      es.onerror = (_event) => {
        if (!isMounted || es?.readyState === EventSource.CLOSED) {
          return;
        }
${errReconnLine}
      };
    } catch (err) {
${errInitLine}
    }
    return () => {
      isMounted = false;
      if (es) {
        es.close();
      }
    };
${depsLine}`);
  });

  return effectBlocks.join("\n\n") + "\n\n";
}
