import type { LinkedRealtimeConnectionInfo } from "../types";

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

    const joinStatements = rooms
      .map((r) => `        ws?.send(JSON.stringify({ action: "join", room: "${r}" }));`)
      .join("\n");

    const leaveStatements = rooms
      .map((r) => `        if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ action: "leave", room: "${r}" })); }`)
      .join("\n");

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
        const targetUrl = token ? \`${streamUrl}?token=\${encodeURIComponent(token)}\` : "${streamUrl}";` : `const targetUrl = "${streamUrl}";`}
        ws = new WebSocket(targetUrl);

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

          setTriggerLogs((prev) => [
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
  }, []);`);
  });

  return effectBlocks.join("\n\n") + "\n\n";
}
