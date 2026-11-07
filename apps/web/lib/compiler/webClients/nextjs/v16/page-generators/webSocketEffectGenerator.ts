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
  dataVar = "evtData",
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
    return `          ${hookName}.getState().${actionName}(${parsedVal});\n`;
  }

  if (actionName === "populate" && binding.parameterMappings && Object.keys(binding.parameterMappings).length > 0) {
    const fields = Object.entries(binding.parameterMappings)
      .filter(([_, p]: [string, string]) => Boolean(p && p.trim()))
      .map(([k, p]: [string, string]) => `${k}: (${dataVar} as any)${p.split(".").filter(Boolean).map((part: string) => `?.[${JSON.stringify(part)}]`).join("")}`)
      .join(", ");
    return `          ${hookName}.getState().populate({ ${fields} });\n`;
  }

  if (src === "nested_property" && vPath) {
    const chain = vPath.split(".").filter(Boolean).map((k) => `?.[${JSON.stringify(k)}]`).join("");
    return `          const extracted = (${dataVar} as any)${chain};\n          ${hookName}.getState().${actionName}(extracted);\n`;
  }

  // Default: full_message
  return `          ${hookName}.getState().${actionName}(${dataVar});\n`;
}

export function generateWebSocketEffects(
  wsConnections: LinkedRealtimeConnectionInfo[],
  hasAuth: boolean,
): string {
  if (wsConnections.length === 0) return "";

  const wsByUrl = new Map<string, LinkedRealtimeConnectionInfo[]>();
  wsConnections.forEach((conn) => {
    const url = conn.streamUrl!;
    if (!wsByUrl.has(url)) wsByUrl.set(url, []);
    wsByUrl.get(url)!.push(conn);
  });

  const effectBlocks: string[] = [];
  wsByUrl.forEach((conns, streamUrl) => {
    const rooms = Array.from(
      new Set(
        conns
          .map((c) => c.room?.trim())
          .filter((r): r is string => Boolean(r)),
      ),
    );

    const hasPathBindings = conns.some(
      (c) => c.pathParamBindings && Object.keys(c.pathParamBindings).length > 0,
    );
    const hasQueryBindings = conns.some(
      (c) => c.queryParamBindings && Object.keys(c.queryParamBindings).length > 0,
    );
    const hasDynamicRoom = rooms.some((r) => /\$\{/.test(r));
    const isDynamic = hasPathBindings || hasQueryBindings || hasDynamicRoom || /(?:\/|^):[a-zA-Z0-9_-]+|\[[a-zA-Z0-9_.-]+\]/.test(streamUrl);

    const joinStatements = rooms
      .map((r) => {
        if (/\$\{/.test(r)) {
          const interpolated = r.replace(
            /\$\{params\.([a-zA-Z0-9_-]+)\}|\$\{([a-zA-Z0-9_-]+)\}/g,
            (_, p1, p2) => `\${routeParams?.["${p1 || p2}"] ?? ""}`,
          );
          return `        const effectiveRoom = \`${interpolated}\`;\n        ws?.send(JSON.stringify({ action: "join", room: effectiveRoom }));`;
        }
        return `        ws?.send(JSON.stringify({ action: "join", room: "${r}" }));`;
      })
      .join("\n");

    const leaveStatements = rooms
      .map((r) => {
        if (/\$\{/.test(r)) {
          const interpolated = r.replace(
            /\$\{params\.([a-zA-Z0-9_-]+)\}|\$\{([a-zA-Z0-9_-]+)\}/g,
            (_, p1, p2) => `\${routeParams?.["${p1 || p2}"] ?? ""}`,
          );
          return `        if (ws.readyState === WebSocket.OPEN) { const effectiveRoom = \`${interpolated}\`; ws.send(JSON.stringify({ action: "leave", room: effectiveRoom })); }`;
        }
        return `        if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ action: "leave", room: "${r}" })); }`;
      })
      .join("\n");

    const storeDispatchStatements = conns
      .flatMap((c) => {
        const bindings = c.storeActionBindings || (c.storeActionBinding ? [c.storeActionBinding] : []);
        return bindings.map((b) => ({ conn: c, binding: b }));
      })
      .filter(({ binding }) => Boolean(binding.storeName))
      .map(({ conn, binding }) => {
        if (conn.eventName && conn.eventName !== "message") {
          return `          if (evtName === "${conn.eventName}") {\n  ${generateRealtimeStoreSnippet(binding, "evtData").trim()}\n          }`;
        }
        return generateRealtimeStoreSnippet(binding, "evtData").trim();
      })
      .join("\n");

    let dynamicWsUrlBuilder = "";
    if (isDynamic) {
      const pathReplacements: string[] = [];
      conns.forEach((c) => {
        if (c.pathParamBindings) {
          Object.entries(c.pathParamBindings).forEach(([paramKey, accessor]) => {
            if (accessor.startsWith("params.")) {
              const routeKey = accessor.slice(7);
              pathReplacements.push(`        targetUrl = targetUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), String(routeParams?.["${routeKey}"] ?? ""));`);
            } else if (accessor.startsWith("query.")) {
              const qKey = accessor.slice(6);
              pathReplacements.push(`        targetUrl = targetUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), String(routeSearchParams?.get("${qKey}") ?? ""));`);
            } else {
              pathReplacements.push(`        targetUrl = targetUrl.replace(new RegExp("[:\\\\[]${paramKey}\\\\]?", "g"), ${JSON.stringify(accessor)});`);
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
              queryAppends.push(`        if (routeParams?.["${routeKey}"]) wsParams.set("${qKey}", String(routeParams["${routeKey}"]));`);
            } else if (accessor.startsWith("query.")) {
              const queryKey = accessor.slice(6);
              queryAppends.push(`        if (routeSearchParams?.get("${queryKey}")) wsParams.set("${qKey}", routeSearchParams.get("${queryKey}")!);`);
            } else {
              queryAppends.push(`        wsParams.set("${qKey}", ${JSON.stringify(accessor)});`);
            }
          });
        }
      });

      dynamicWsUrlBuilder = `${pathReplacements.join("\n")}${pathReplacements.length > 0 ? "\n" : ""}        targetUrl = targetUrl.replace(/:([a-zA-Z0-9_-]+)/g, (_, k) => String(routeParams?.[k] ?? ""));\n        targetUrl = targetUrl.replace(/\\[([a-zA-Z0-9_-]+)\\]/g, (_, k) => String(routeParams?.[k] ?? ""));\n${queryAppends.length > 0 ? `        const wsParams = new URLSearchParams();\n${queryAppends.join("\n")}\n        const wsQueryString = wsParams.toString();\n        if (wsQueryString) {\n          targetUrl += (targetUrl.includes("?") ? "&" : "?") + wsQueryString;\n        }\n` : ""}`;
    }

    const depsLine = isDynamic
      ? `  }, [routeParams, routeSearchParams]);`
      : `  }, []);`;

    effectBlocks.push(`  // Real-time WebSocket listener for ${conns[0]?.sourceServiceName || "Service"}
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function initWs() {
      if (!isMounted) return;
      try {
        ${hasAuth ? `const rawToken = await getAuthBearerToken();
        const token = rawToken ? rawToken.replace(/^Bearer\\s+/i, "") : null;
        ${isDynamic ? "let" : "const"} targetUrl = token ? \`${streamUrl}?token=\${encodeURIComponent(token)}\` : "${streamUrl}";` : `${isDynamic ? "let" : "const"} targetUrl = "${streamUrl}";`}
${dynamicWsUrlBuilder}        ws = new WebSocket(targetUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          console.log("[WebSocket] Connected to " + targetUrl);
${joinStatements ? `${joinStatements}\n` : ""}        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          let parsed: unknown = event.data;
          try {
            parsed = JSON.parse(event.data);
          } catch {
            parsed = event.data;
          }

          const parsedObj =
            typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : null;
          const evtName =
            parsedObj && typeof parsedObj.event === "string"
              ? parsedObj.event
              : parsedObj && typeof parsedObj.type === "string"
              ? String(parsedObj.type)
              : "message";
          const evtData =
            parsedObj && "data" in parsedObj && parsedObj.data !== undefined
              ? parsedObj.data
              : parsed;

${storeDispatchStatements ? `${storeDispatchStatements}\n` : ""}          setTriggerLogs((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              eventName: evtName,
              eventType: "WebSocket",
              timestamp: new Date().toLocaleTimeString(),
              url: "${streamUrl}",
              method: "WS",
              data: evtData,
            },
            ...prev,
          ]);
        };

        ws.onerror = (_event) => {
          if (!isMounted) return;
          console.warn("[WebSocket] Error on stream (${streamUrl})");
        };

        ws.onclose = (_event) => {
          if (!isMounted) return;
          console.warn("[WebSocket] Connection closed (${streamUrl}). Reconnecting in 3s...");
          reconnectTimer = setTimeout(initWs, 3000);
        };
      } catch (err) {
        console.error("[WebSocket] Failed to initialize WebSocket (${streamUrl}):", err);
        if (isMounted) {
          reconnectTimer = setTimeout(initWs, 5000);
        }
      }
    }

    initWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
${leaveStatements ? `${leaveStatements}\n` : ""}          ws.close();
        } catch {}
      }
    };
${depsLine}`);
  });

  return effectBlocks.join("\n\n") + "\n\n";
}
