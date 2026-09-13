export function generateTriggerLogsState(hasLogsSection: boolean): string {
  if (!hasLogsSection) return "";
  return `  const [triggerLogs, setTriggerLogs] = useState<Array<{
    id: string;
    eventName: string;
    eventType: string;
    timestamp: string;
    url: string;
    method: string;
    status?: number;
    payload?: unknown;
    data: unknown;
    error?: string;
  }>>([]);

`;
}

export function generateTriggerHandler(hasApiActions: boolean): string {
  if (!hasApiActions) return "";
  return `  const handleTriggerAction = async (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: unknown,
  ) => {
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
          url: result.url || result.targetUrl || "N/A",
          method: method || "TRIGGER",
          status: result.status,
          payload: requestBody,
          data: result.data,
          error: result.error,
        },
        ...prev,
      ]);
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
}): string {
  const { hasLogsSection, hasSse, hasWs, hasWebRtc, hasRealtime } = options;
  if (!hasLogsSection) return "";

  return `        {/* Section: Trigger Output Logs */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-bold text-card-foreground">Output Log</CardTitle>
              ${hasSse ? `<Badge variant="outline" className="text-xs flex items-center gap-1.5 font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Stream Active
              </Badge>` : ""}
              ${hasWs ? `<Badge variant="outline" className="text-xs flex items-center gap-1.5 font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" /> WebSocket Connected
              </Badge>` : ""}
              ${hasWebRtc ? `<Badge variant="outline" className="text-xs flex items-center gap-1.5 font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> WebRTC Connected
              </Badge>` : ""}
            </div>
            {triggerLogs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  setTriggerLogs([]);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear logs
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {triggerLogs.length === 0 ? (
              <div className="text-muted-foreground text-sm italic py-6 text-center border border-dashed border-border rounded-lg">
                ${hasRealtime ? "Listening for real-time events..." : "No activity logged yet."}
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {triggerLogs.map((log) => (
                  <div key={log.id} className="bg-muted/40 border border-border rounded-lg p-4 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{log.eventName}</span>
                        {log.eventType === "SSE" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                            SSE
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
                        )}
                      </div>
                      <span>{log.timestamp}</span>
                    </div>
                    {log.error ? (
                      <div className="text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                        Error: {log.error}
                      </div>
                    ) : (
                      <pre className="text-foreground/90 bg-background/80 p-3 rounded border border-border/50 overflow-x-auto whitespace-pre-wrap">
                        {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
`;
}
