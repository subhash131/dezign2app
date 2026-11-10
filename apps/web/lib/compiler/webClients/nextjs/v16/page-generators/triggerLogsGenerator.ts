export function generateTriggerLogsState(hasLogsSection: boolean, hasStreamingActions: boolean): string {
  if (!hasLogsSection) return "";
  const streamingField = hasStreamingActions ? `\n    isStreaming?: boolean;` : "";
  return `  const showDebugLogs =
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_LOGS?.trim().toLowerCase() === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_DEBUG_UI?.trim().toLowerCase() === "true";
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [hasLayoutDrawer, setHasLayoutDrawer] = useState(false);
  const [triggerLogs, setTriggerLogs] = useState<Array<{
    id: string;
    eventName: string;
    eventType: string;
    timestamp: string;
    url?: string;
    method?: string;
    status?: number;
    payload?: unknown;
    data: unknown;
    error?: string;${streamingField}
  }>>([]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const check = () => {
        setHasLayoutDrawer(Boolean(document.querySelector('aside[aria-label="Layout Output Log"]')));
      };
      check();
      const timer = setTimeout(check, 200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Bridge layout-level stream and action events into page Output Log
  useEffect(() => {
    const handleLayoutLog = (e: Event) => {
      if (
        e instanceof CustomEvent &&
        typeof e.detail === "object" &&
        e.detail !== null &&
        "id" in e.detail &&
        typeof e.detail.id === "string" &&
        "eventName" in e.detail &&
        typeof e.detail.eventName === "string"
      ) {
        const detailObj = e.detail;
        const entry = {
          id: detailObj.id,
          eventName: detailObj.eventName,
          eventType: typeof detailObj.eventType === "string" ? detailObj.eventType : "LAYOUT",
          timestamp: typeof detailObj.timestamp === "string" ? detailObj.timestamp : new Date().toLocaleTimeString(),
          url: typeof detailObj.url === "string" ? detailObj.url : undefined,
          method: typeof detailObj.method === "string" ? detailObj.method : undefined,
          status: typeof detailObj.status === "number" ? detailObj.status : undefined,
          payload: "payload" in detailObj ? detailObj.payload : undefined,
          data: "data" in detailObj ? detailObj.data : detailObj,
          error: typeof detailObj.error === "string" ? detailObj.error : undefined,
        };
        queueMicrotask(() => {
          setTriggerLogs((prev) => {
            if (prev.some((item) => item.id === entry.id)) return prev;
            return [entry, ...prev];
          });
        });
      }
    };
    window.addEventListener("dezign:layout-log", handleLayoutLog);
    return () => window.removeEventListener("dezign:layout-log", handleLayoutLog);
  }, []);

`;
}

export function generateTriggerHandler(hasApiActions: boolean, hasStreamingActions: boolean): string {
  if (!hasApiActions) return "";

  if (!hasStreamingActions) {
    // Slim handler for plain REST actions — no streaming callbacks
    return `  const handleTriggerAction = async (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<Record<string, string | number | boolean | null | undefined> | void> => {
    const timestamp = new Date().toLocaleTimeString();
    const logId = Math.random().toString(36).substring(2, 9);
    try {
      const result = await executeApiAction({
        eventName,
        eventType,
        url,
        method,
        requireAuth,
        customHeaders,
        queryParams,
        requestBody,
      });
      setTriggerLogs((prev) => [
        {
          id: logId,
          eventName,
          eventType,
          timestamp,
          url: result.url || result.targetUrl || url || "N/A",
          method: method || "TRIGGER",
          status: result.status,
          payload: requestBody,
          data: result.data,
          error: result.error,
        },
        ...prev,
      ]);
      const dataObj: Record<string, string | number | boolean | null | undefined> =
        result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? (result.data as Record<string, string | number | boolean | null | undefined>)
          : {};
      return {
        id: result.id,
        eventName: result.eventName,
        eventType: result.eventType,
        timestamp: result.timestamp,
        url: result.url,
        method: result.method,
        status: result.status,
        error: result.error,
        ...dataObj,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Request failed";
      setTriggerLogs((prev) => [
        {
          id: logId,
          eventName,
          eventType,
          timestamp,
          url: url || "N/A",
          method: method || "TRIGGER",
          error: errorMessage,
          data: null,
        },
        ...prev,
      ]);
      return { error: errorMessage };
    }
  };

`;
  }

  // Full handler with streaming callbacks (SSE / LangGraph / WebSocket)
  return `  const handleTriggerAction = async (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: Record<string, string | number | boolean | null | undefined>,
  ): Promise<Record<string, string | number | boolean | null | undefined> | void> => {
    const timestamp = new Date().toLocaleTimeString();
    const logId = Math.random().toString(36).substring(2, 9);
    try {
      let streamInitialized = false;
      const result = await executeApiAction({
        eventName,
        eventType,
        url,
        method,
        requireAuth,
        customHeaders,
        queryParams,
        requestBody,
        onStreamStart: (info) => {
          if (!streamInitialized) {
            streamInitialized = true;
            setTriggerLogs((prev) => [
              {
                id: logId,
                eventName,
                eventType: "SSE",
                timestamp,
                url: url || "N/A",
                method: method || "TRIGGER",
                status: 200,
                payload: requestBody,
                data: { streamed: true, threadId: info?.threadId, done: false },
                isStreaming: true,
              },
              ...prev,
            ]);
          }
        },
        onStream: (streamData) => {
          if (!streamInitialized) {
            streamInitialized = true;
            setTriggerLogs((prev) => [
              {
                id: logId,
                eventName,
                eventType: "SSE",
                timestamp,
                url: url || "N/A",
                method: method || "TRIGGER",
                status: 200,
                payload: requestBody,
                data: streamData,
                isStreaming: true,
              },
              ...prev,
            ]);
          } else {
            setTriggerLogs((prev) =>
              prev.map((log) =>
                log.id === logId
                  ? { ...log, data: streamData, isStreaming: true }
                  : log,
              ),
            );
          }
        },
        onStreamEnd: (finalData) => {
          setTriggerLogs((prev) =>
            prev.map((log) =>
              log.id === logId
                ? { ...log, data: finalData, isStreaming: false }
                : log,
            ),
          );
        },
        onStreamError: (err) => {
          setTriggerLogs((prev) =>
            prev.map((log) =>
              log.id === logId
                ? { ...log, error: err instanceof Error ? err.message : String(err), isStreaming: false }
                : log,
            ),
          );
        },
      });

      if (streamInitialized) {
        setTriggerLogs((prev) =>
          prev.map((log) =>
            log.id === logId
              ? {
                  ...log,
                  url: result.url || result.targetUrl || log.url,
                  method: method || "TRIGGER",
                  status: result.status,
                  data: result.data,
                  error: result.error,
                  isStreaming: false,
                }
              : log,
          ),
        );
      } else {
        setTriggerLogs((prev) => [
          {
            id: logId,
            eventName,
            eventType: result.data && typeof result.data === "object" && "streamed" in result.data && Boolean(result.data.streamed) ? "SSE" : eventType,
            timestamp,
            url: result.url || result.targetUrl || "N/A",
            method: method || "TRIGGER",
            status: result.status,
            payload: requestBody,
            data: result.data,
            error: result.error,
            isStreaming: false,
          },
          ...prev,
        ]);
      }
      const dataObj: Record<string, string | number | boolean | null | undefined> =
        result.data && typeof result.data === "object" && !Array.isArray(result.data)
          ? (result.data as Record<string, string | number | boolean | null | undefined>)
          : {};
      return {
        id: result.id,
        eventName: result.eventName,
        eventType: result.eventType,
        timestamp: result.timestamp,
        url: result.url,
        method: result.method,
        status: result.status,
        error: result.error,
        ...dataObj,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Request failed";
      setTriggerLogs((prev) => [
        {
          id: logId,
          eventName,
          eventType,
          timestamp,
          url: url || "N/A",
          method: method || "TRIGGER",
          error: errorMessage,
          data: null,
          isStreaming: false,
        },
        ...prev,
      ]);
      return { error: errorMessage };
    }
  };

`;
}

export function generateTriggerLogsSection(options: {
  hasLogsSection: boolean;
  hasSse: boolean;
  hasWs: boolean;
  hasWebRtc: boolean;
  hasRealtime: boolean;
  hasStreamingActions: boolean;
}): string {
  const { hasLogsSection, hasSse, hasWs, hasWebRtc, hasRealtime, hasStreamingActions } = options;
  if (!hasLogsSection) return "";

  // Badge label in the log entry: streaming-aware vs simple REST
  const logEntryBadge = hasStreamingActions
    ? `{log.isStreaming ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                            STREAMING
                          </span>
                        ) : log.eventType === "pageLoad" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                            PAGE LOAD
                          </span>
                        ) : log.eventType === "SSE" || (log.data && typeof log.data === "object" && "streamed" in log.data && Boolean(log.data.streamed)) ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            STREAM
                          </span>
                        ) : log.eventType === "WebSocket" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                            WS
                          </span>
                        ) : log.eventType === "WebRTC" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            RTC
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-primary/10 text-primary border border-primary/20">
                            {log.method || "API"}
                          </span>
                        )}`
    : `{log.eventType === "pageLoad" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                            PAGE LOAD
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-primary/10 text-primary border border-primary/20">
                            {log.method || "API"}
                          </span>
                        )}`;

  // Streaming cursor in the pre block — only when streaming is possible
  const streamingCursor = hasStreamingActions
    ? `
                        {log.isStreaming && (
                          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary animate-pulse align-middle" />
                        )}`
    : "";

  // Data display — streaming responses may have a `.raw` field
  const dataDisplay = hasStreamingActions
    ? `{log.data && typeof log.data === "object" && "raw" in log.data && typeof log.data.raw === "string" && log.data.raw
                          ? log.data.raw
                          : typeof log.data === "string"
                          ? log.data
                          : JSON.stringify(log.data, null, 2)}`
    : `{typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}`;

  return `        {/* Page Output Log Drawer */}
        {showDebugLogs && (
        <aside
          aria-label="Page Output Log"
          className={\`fixed bottom-3 z-50 pointer-events-auto flex flex-col items-end transition-all duration-200 \${
            hasLayoutDrawer ? "right-[230px]" : "right-4"
          }\`}
        >
          {/* Drawer Panel */}
          <div
            className={
              "w-[520px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-xl border border-border bg-card/95 backdrop-blur overflow-hidden flex flex-col transition-all duration-150 ease-out origin-bottom-right mb-2 " +
              (isLogsOpen
                ? "opacity-100 scale-100 translate-y-0 max-h-[420px] pointer-events-auto"
                : "opacity-0 scale-95 translate-y-1 max-h-0 pointer-events-none border-transparent p-0 m-0")
            }
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary shrink-0" />
                <span className="font-bold text-xs text-foreground">Output Log</span>
                ${hasSse ? `<Badge variant="outline" className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Stream Active
                </Badge>` : ""}
                ${hasWs ? `<Badge variant="outline" className="text-[9px] font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" /> WebSocket Connected
                </Badge>` : ""}
                ${hasWebRtc ? `<Badge variant="outline" className="text-[9px] font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> WebRTC Connected
                </Badge>` : ""}
              </div>
              <div className="flex items-center gap-1">
                {triggerLogs.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setTriggerLogs([]);
                    }}
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive cursor-pointer"
                    title="Clear logs"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Clear
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsLogsOpen(false)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Collapse"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="p-3 overflow-y-auto max-h-[350px] space-y-2 font-mono text-xs">
              {triggerLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs italic border border-dashed border-border/60 rounded-lg">
                  ${hasRealtime ? "Listening for real-time events..." : "No activity logged yet."}
                </div>
              ) : (
                triggerLogs.map((log) => (
                  <div key={log.id} className="bg-background/80 border border-border/60 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{log.eventName}</span>
                        ${logEntryBadge}
                        {log.status && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {log.status}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px]">{log.timestamp}</span>
                    </div>
                    {log.error ? (
                      <div className="text-destructive bg-destructive/10 p-2 rounded text-[11px]">
                        Error: {log.error}
                      </div>
                    ) : (
                      <pre className="text-foreground/90 bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap text-[11px] max-h-40">
                        ${dataDisplay}${streamingCursor}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Persistent Dock Toggle Pill */}
          <button
            type="button"
            onClick={() => setIsLogsOpen((prev) => !prev)}
            className="flex items-center gap-2 bg-card/95 border border-border shadow-xl rounded-full px-3 py-1.5 text-xs backdrop-blur font-mono text-foreground hover:bg-muted/40 transition-colors cursor-pointer select-none"
            title={isLogsOpen ? "Collapse Output Log" : "Open Output Log"}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-semibold text-foreground">Output Log</span>
            ${hasRealtime ? `<span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 rounded-full font-mono">LIVE</span>` : ""}
            {triggerLogs.length > 0 && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.2 rounded-full font-bold">
                {triggerLogs.length}
              </span>
            )}
            {isLogsOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
            )}
          </button>
        </aside>
        )}
`;
}
