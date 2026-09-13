import type { LinkedRealtimeConnectionInfo } from "../types";

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
      .map(
        (evtName) => `      es.addEventListener("${evtName}", (event) => {
        let parsed: unknown = event.data;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = event.data;
        }
        setTriggerLogs((prev) => [
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
      });`,
      )
      .join("\n");

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
        setTriggerLogs((prev) => [
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
