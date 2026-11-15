"use client";

import React, { useState, useRef, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Send,
  Loader2,
  Globe,
  Users,
  Copy,
  Terminal,
} from "lucide-react";
import { Endpoint, BackendNode } from "@/types/canvas";
import { CanvasExternalNodeData } from "@workspace/canvas/types";
import { SimulationTestCase } from "@workspace/canvas";
import {
  buildFullEndpointUrl,
  executeLiveApiCall,
  evaluateAssertions,
  getServiceDefaultPort,
  LiveApiCallResult,
  AssertionResultItem,
} from "./utils";
import { useActiveFakeUsers } from "./fakeUser";
import { formatCurlExample } from "../../test-users/tokenGenerator";
import { toast } from "sonner";
import { EndpointResponseViewer } from "./EndpointResponseViewer";
import { cn } from "@workspace/ui/lib/utils";

interface EndpointLiveRunnerProps {
  testCase: SimulationTestCase;
  endpoint: Endpoint;
  nodeId: string;
  serviceNode?: BackendNode | null;
  onRunCompleted?: (result: LiveApiCallResult, assertions: AssertionResultItem[]) => void;
}

export function EndpointLiveRunner({
  testCase,
  endpoint,
  nodeId,
  serviceNode,
  onRunCompleted,
}: EndpointLiveRunnerProps) {
  const defaultPort = useMemo(() => getServiceDefaultPort(serviceNode), [serviceNode]);
  const defaultLocalBaseUrl = `http://localhost:${defaultPort}`;

  // External node detection
  const isExternal = serviceNode?.type === "external";
  const externalData = isExternal ? (serviceNode?.data as unknown as CanvasExternalNodeData) : null;
  const externalBaseUrl = externalData?.baseUrl || "";

  const fakeUsers = useActiveFakeUsers();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() => {
    if (isExternal) return "anonymous";
    const existingAuth = (testCase.request?.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!existingAuth) return "anonymous";
    const matched = fakeUsers.find((u) => u.token === existingAuth);
    return matched ? matched.id : fakeUsers[0]?.id || "anonymous";
  });

  const [customAuthTokenOverride, setCustomAuthTokenOverride] = useState<string | null>(null);

  const [envMode, setEnvMode] = useState<"external" | "local" | "custom">(
    isExternal ? "external" : "local"
  );
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");
  const [activeBaseUrl, setActiveBaseUrl] = useState<string>(
    isExternal ? externalBaseUrl : defaultLocalBaseUrl
  );

  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<LiveApiCallResult | null>(null);
  const [lastAssertions, setLastAssertions] = useState<AssertionResultItem[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Extract path and query params from testCase.request
  const pathParams: Record<string, string> = {};
  const queryParams: Record<string, string> = {};

  if (testCase.request?.params) {
    const rawPath = endpoint.name || "";
    Object.entries(testCase.request.params).forEach(([k, v]) => {
      if (
        rawPath.includes(`:${k}`) ||
        rawPath.includes(`{${k}}`) ||
        endpoint.pathParams?.some((p) => p.key === k || p.name === k)
      ) {
        pathParams[k] = String(v ?? "");
      } else {
        queryParams[k] = String(v ?? "");
      }
    });
  }

  const effectiveBaseUrl =
    envMode === "external"
      ? externalBaseUrl || defaultLocalBaseUrl
      : envMode === "local"
        ? defaultLocalBaseUrl
        : customBaseUrl || defaultLocalBaseUrl;

  const targetUrl = useMemo(() => {
    return buildFullEndpointUrl(
      effectiveBaseUrl,
      endpoint.name || "/",
      pathParams,
      queryParams,
    );
  }, [effectiveBaseUrl, endpoint.name, pathParams, queryParams]);

  const method = (endpoint.type || "GET").toUpperCase();

  const handleSend = async () => {
    if (isLoading) {
      abortControllerRef.current?.abort();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const headers = { ...(testCase.request?.headers || {}) };

      // Strip all existing auth headers case-insensitively to prevent duplicates or stale tokens
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === "authorization") {
          delete headers[k];
        }
      }

      if (customAuthTokenOverride) {
        headers["authorization"] = customAuthTokenOverride.startsWith("Bearer ")
          ? customAuthTokenOverride
          : `Bearer ${customAuthTokenOverride}`;
      } else if (!isExternal && endpoint.requireAuth !== false) {
        const selectedPersona =
          fakeUsers.find((u) => u.id === selectedPersonaId) ||
          fakeUsers.find((u) => !u.isAnonymous) ||
          fakeUsers[0];
        if (selectedPersona && !selectedPersona.isAnonymous && selectedPersona.token) {
          headers["authorization"] = `Bearer ${selectedPersona.token}`;
        }
      }

      const body = testCase.request?.body;

      const result = await executeLiveApiCall({
        url: targetUrl,
        method,
        headers,
        body,
        signal: abortControllerRef.current.signal,
      });

      const assertions = evaluateAssertions({
        actualStatus: result.status,
        actualBody: result.body,
        latencyMs: result.latencyMs,
        expectedStatus: testCase.expectedStatus,
        expectedBody: testCase.expectedBody,
      });

      setLastResult(result);
      setLastAssertions(assertions);
      onRunCompleted?.(result, assertions);
    } finally {
      setIsLoading(false);
    }
  };

  const methodColors: Record<string, string> = {
    GET: "bg-zinc-800 text-sky-400 border-zinc-700/60",
    POST: "bg-zinc-800 text-emerald-400 border-zinc-700/60",
    PUT: "bg-zinc-800 text-amber-400 border-zinc-700/60",
    PATCH: "bg-zinc-800 text-purple-400 border-zinc-700/60",
    DELETE: "bg-zinc-800 text-rose-400 border-zinc-700/60",
  };

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* Target URL & Environment Bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-card/50 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Target Environment & URL</span>
          </span>

          <div className="flex items-center gap-1.5">
            <Select
              value={envMode}
              onValueChange={(val: "external" | "local" | "custom") => setEnvMode(val)}
            >
              <SelectTrigger className="h-6 text-[11px] px-2 bg-background border-border/60">
                <SelectValue placeholder="Select Env" />
              </SelectTrigger>
              <SelectContent>
                {isExternal ? (
                  <SelectItem value="external" className="text-xs">
                    External API ({externalBaseUrl || "no base URL"})
                  </SelectItem>
                ) : (
                  <SelectItem value="local" className="text-xs">
                    Local Dev (:{defaultPort})
                  </SelectItem>
                )}
                <SelectItem value="custom" className="text-xs">
                  Custom URL / Tunnel
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Auth Persona Selector — only for internal service nodes */}
        {!isExternal && endpoint.requireAuth !== false && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/40 text-xs gap-2">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 shrink-0">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Auth Persona:</span>
            </span>

            <Select
              value={selectedPersonaId}
              onValueChange={(val) => {
                setSelectedPersonaId(val);
              }}
            >
              <SelectTrigger className="h-6 text-[11px] bg-background border-border/50 font-medium">
                <SelectValue placeholder="Select Auth Identity" />
              </SelectTrigger>
              <SelectContent>
                {fakeUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span>{u.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">({u.badge})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}


        {envMode === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              value={customBaseUrl}
              onChange={(e) => setCustomBaseUrl(e.target.value)}
              placeholder="e.g. https://api-dev.example.com or http://localhost:8080"
              className="h-7 text-xs font-mono bg-background border-border/60"
            />
          </div>
        )}

        {/* Live URL & Send Bar */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 uppercase",
              methodColors[method] || "bg-secondary text-foreground border-border/50",
            )}
          >
            {method}
          </span>
          <div className="flex-1 px-2.5 py-1 rounded-md bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono text-[11px] truncate select-all">
            {targetUrl}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const selectedPersona = fakeUsers.find((u) => u.id === selectedPersonaId);
              const token = selectedPersona && !selectedPersona.isAnonymous ? selectedPersona.token : undefined;
              const curlStr = formatCurlExample(method, targetUrl, token);
              navigator.clipboard.writeText(curlStr);
              toast.success("Copied cURL command with Bearer token for Postman / Terminal");
            }}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground border-border/60 gap-1 shrink-0 cursor-pointer"
            title="Copy cURL command with Authorization Bearer header for Postman or Terminal"
          >
            <Terminal className="w-3 h-3 text-indigo-500" />
            <span className="hidden sm:inline">cURL</span>
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isLoading && !abortControllerRef.current}
            variant="default"
            className={cn(
              "h-7 px-3 text-xs font-medium border border-border/60 shadow-none gap-1.5 shrink-0 transition-all",
              isLoading
                ? "bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25"
                : "bg-primary hover:bg-primary/80 text-primary-foreground",
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Cancel</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Send Request</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Response and Assertion Results */}
      <EndpointResponseViewer
        result={lastResult}
        assertions={lastAssertions}
        isLoading={isLoading}
        onClear={() => {
          setLastResult(null);
          setLastAssertions([]);
        }}
      />
    </div>
  );
}
