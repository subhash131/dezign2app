import type { LinkedRealtimeConnectionInfo } from "../types";

function generateRealtimeStoreSnippet(
  binding: {
    storeName?: string;
    actionName?: string;
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
  const actionName =
    binding.actionName ||
    (binding.targetFieldName
      ? `set${binding.targetFieldName.charAt(0).toUpperCase() + binding.targetFieldName.slice(1)}`
      : "mutate");

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
            url: "${streamUrl}",
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

    effectBlocks.push(`  // Real-time SSE listener for ${conns[0]?.sourceServiceName || "Service"}
  useEffect(() => {
    let es: EventSource | null = null;
    let isMounted = true;
    try {
      es = new EventSource("${streamUrl}", { withCredentials: true });
      es.onopen = () => {
        if (isMounted) {
          console.log("[SSE] Connected to ${streamUrl}");
        }
      };
${customListeners ? `${customListeners}\n` : ""}      es.onmessage = (event) => {
        if (!isMounted) return;
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
            url: "${streamUrl}",
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
        console.warn("[SSE] Reconnecting to stream (${streamUrl})...");
      };
    } catch (err) {
      console.error("[SSE] Failed to initialize EventSource (${streamUrl}):", err);
    }
    return () => {
      isMounted = false;
      if (es) {
        es.close();
      }
    };
  }, []);`);
  });

  return effectBlocks.join("\n\n") + "\n\n";
}
