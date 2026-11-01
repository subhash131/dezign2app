import { CompiledFile } from "@workspace/canvas/types";

/**
 * Generates the shared API client utility (`lib/api-client.ts`) for Next.js web applications.
 * Centralizes HTTP request execution, query param serialization, auth token injection,
 * and error handling so pages remain clean and unbloated.
 */
export function generateApiClientFile(hasAuth: boolean = false): CompiledFile {
  const content = `/**
 * Shared API Client Utility
 * Handles execution of API actions, query serialization, auth injection, and error handling.
 */

${hasAuth ? `import { getAuthBearerToken } from "./auth-token";\n` : ""}export interface ApiActionOptions<TBody = unknown> {
  eventName: string;
  eventType: string;
  url: string;
  method: string;
  requireAuth?: boolean;
  customHeaders?: Record<string, string>;
  queryParams?: Record<string, string>;
  requestBody?: TBody;
  onStream?: (streamResult: ApiStreamResult) => void;
  onStreamStart?: (info: { threadId?: string }) => void;
  onStreamEnd?: (finalResult: ApiStreamResult) => void;
  onStreamError?: (error: unknown) => void;
  onToolCall?: (toolCall: any) => void;
}

export interface ApiStreamResult {
  content: string;
  response?: string;
  tokens: string[];
  reasoning?: string;
  reasoningTokens?: string[];
  updates?: Array<{ node?: string; data: any }>;
  custom?: any[];
  values?: any;
  toolCalls?: any[];
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  threadId?: string;
  streamed: true;
  statusText?: string;
  raw?: string;
  done?: boolean;
}

export interface ApiActionResult<TData = unknown> {
  id: string;
  eventName: string;
  eventType: string;
  timestamp: string;
  url: string;
  targetUrl?: string;
  method: string;
  status?: number;
  payload?: unknown;
  data: TData;
  error?: string;
}

export async function executeApiAction<TData = unknown, TBody = unknown>(
  options: ApiActionOptions<TBody>,
): Promise<ApiActionResult<TData>> {
  const {
    eventName,
    eventType,
    url,
    method,
    requireAuth,
    customHeaders,
    queryParams,
    requestBody,
    onStream,
    onStreamStart,
    onStreamEnd,
    onStreamError,
    onToolCall,
  } = options;

  const timestamp = new Date().toLocaleTimeString();
  const logId = Math.random().toString(36).substring(2, 9);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(customHeaders || {}),
    };

    if (
      customHeaders?.["Authorization"] &&
      customHeaders["Authorization"].trim() &&
      customHeaders["Authorization"] !== "Bearer <token>"
    ) {
      headers["Authorization"] = customHeaders["Authorization"].trim();
    }${hasAuth ? ` else if (requireAuth !== false) {
      try {
        const token = await getAuthBearerToken();
        if (token) {
          headers["Authorization"] = token;
        } else if (customHeaders?.["Authorization"]) {
          headers["Authorization"] = customHeaders["Authorization"];
        }
      } catch (_tokenErr) {
        if (customHeaders?.["Authorization"]) {
          headers["Authorization"] = customHeaders["Authorization"];
        }
      }
    }` : ` else if (customHeaders?.["Authorization"]) {
      headers["Authorization"] = customHeaders["Authorization"];
    }`}

    let targetUrl = url;
    if (queryParams && Object.keys(queryParams).length > 0 && targetUrl && targetUrl !== "#") {
      try {
        const urlObj = new URL(
          targetUrl,
          typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
        );
        Object.entries(queryParams).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            urlObj.searchParams.set(k, String(v));
          }
        });
        targetUrl = urlObj.toString();
      } catch (_urlErr) {}
    }

    const fetchOptions: RequestInit = {
      method: method || "POST",
      headers,
      credentials: "include",
    };

    if (
      method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      (method === "DELETE" && requestBody !== undefined)
    ) {
      if (requestBody !== undefined) {
        fetchOptions.body =
          typeof requestBody === "string" ? requestBody : JSON.stringify(requestBody);
      }
    }

    let resData: any = null;
    let status: number | undefined = undefined;

    if (targetUrl && targetUrl !== "#") {
      const res = await fetch(targetUrl, fetchOptions);
      status = res.status;
      const cType = res.headers.get("content-type") || "";
      if (cType.includes("text/event-stream")) {
        const tokens: string[] = [];
        const reasoningTokens: string[] = [];
        const updates: Array<{ node?: string; data: any }> = [];
        const custom: any[] = [];
        const toolCalls: any[] = [];
        let latestUsage: { input_tokens: number; output_tokens: number; total_tokens: number } | undefined = undefined;
        let latestValues: any = undefined;
        let lastSessionId: string | undefined = undefined;
        let isDone = false;
        let rawAccumulated = "";

        const buildStreamData = (): ApiStreamResult => {
          let finalContent = tokens.join("");
          if (!finalContent && updates.length > 0) {
            for (let i = updates.length - 1; i >= 0; i--) {
              const u = updates[i]?.data;
              if (u && typeof u === "object") {
                const innerValues = Object.values(u);
                for (const iv of [u, ...innerValues]) {
                  if (iv && typeof iv === "object" && "messages" in (iv as any)) {
                    const msgs = (iv as any).messages;
                    if (Array.isArray(msgs) && msgs.length > 0) {
                      const lastMsg = msgs[msgs.length - 1];
                      const msgContent = typeof lastMsg === "string" ? lastMsg : (lastMsg?.content ?? "");
                      if (typeof msgContent === "string" && msgContent) {
                        finalContent = msgContent;
                        break;
                      }
                    }
                  }
                }
              }
              if (finalContent) break;
            }
          }
          if (!finalContent && latestValues && typeof latestValues === "object" && "messages" in latestValues) {
            const msgs = (latestValues as any).messages;
            if (Array.isArray(msgs) && msgs.length > 0) {
              const lastMsg = msgs[msgs.length - 1];
              const msgContent = typeof lastMsg === "string" ? lastMsg : (lastMsg?.content ?? "");
              if (typeof msgContent === "string" && msgContent) {
                finalContent = msgContent;
              }
            }
          }

          return {
            content: finalContent,
            response: finalContent,
            tokens: [...tokens],
            reasoning: reasoningTokens.join(""),
            reasoningTokens: [...reasoningTokens],
            updates: [...updates],
            custom: [...custom],
            values: latestValues,
            toolCalls: [...toolCalls],
            usage: latestUsage,
            threadId: lastSessionId,
            streamed: true,
            statusText: res.statusText,
            raw: rawAccumulated,
            done: isDone,
          };
        };

        const processSseLine = (trimmed: string) => {
          if (!trimmed.startsWith("data: ")) return;
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === "[DONE]") {
            isDone = true;
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (!parsed || typeof parsed !== "object") {
              tokens.push(String(parsed));
              return;
            }
            if (parsed.type === "stream_start") {
              if (parsed.threadId || parsed.thread_id) {
                lastSessionId = parsed.threadId || parsed.thread_id;
              }
              onStreamStart?.({ threadId: lastSessionId });
            }
            if (parsed.type === "session" && (parsed.thread_id || parsed.threadId)) {
              lastSessionId = parsed.thread_id || parsed.threadId;
            }
            if (parsed.type === "reasoning" || parsed.reasoning !== undefined) {
              const rText = typeof parsed.reasoning === "string" ? parsed.reasoning : JSON.stringify(parsed.reasoning);
              if (rText) reasoningTokens.push(rText);
            }
            if (parsed.type === "update" || parsed.mode === "updates") {
              updates.push({ node: parsed.node, data: parsed.data ?? parsed });
            }
            if (parsed.type === "custom" || parsed.mode === "custom") {
              custom.push(parsed.data ?? parsed);
            }
            if (parsed.type === "values" || parsed.mode === "values") {
              latestValues = parsed.data ?? parsed;
            }
            if (
              parsed.type === "tool_call" ||
              parsed.type === "tool_call_chunk" ||
              parsed.tool_call !== undefined ||
              parsed.tool_calls !== undefined
            ) {
              const tc = parsed.data ?? parsed.tool_call ?? parsed.tool_calls ?? parsed;
              toolCalls.push(tc);
              onToolCall?.(tc);
            }
            if (parsed.type === "usage" || parsed.usage !== undefined) {
              latestUsage = parsed.usage ?? parsed.data ?? parsed;
            }
            if (parsed.type === "stream_end") {
              isDone = true;
              if (parsed.threadId || parsed.thread_id) {
                lastSessionId = parsed.threadId || parsed.thread_id;
              }
              if (parsed.usage) {
                latestUsage = parsed.usage;
              }
            }
            if (parsed.type === "stream_error" || parsed.type === "error") {
              onStreamError?.(parsed.error ?? parsed.data ?? parsed);
            }
            if (typeof parsed.token === "string") {
              tokens.push(parsed.token);
            } else if (parsed.token && typeof parsed.token === "object" && typeof parsed.token.content === "string") {
              tokens.push(parsed.token.content);
            } else if (typeof parsed.content === "string" && parsed.type !== "reasoning" && parsed.type !== "stream_end") {
              tokens.push(parsed.content);
            } else if (parsed.type === "token" && parsed.token !== undefined) {
              tokens.push(typeof parsed.token === "object" ? JSON.stringify(parsed.token) : String(parsed.token));
            }
          } catch {
            tokens.push(dataStr);
          }
        };

        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let lineBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const textChunk = decoder.decode(value, { stream: true });
            rawAccumulated += textChunk;
            lineBuffer += textChunk;

            const lines = lineBuffer.split("\\n");
            lineBuffer = lines.pop() ?? "";
            let updated = false;
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                processSseLine(trimmed);
                updated = true;
              }
            }
            if (updated) {
              resData = buildStreamData();
              onStream?.(resData as ApiStreamResult);
            }
          }

          if (lineBuffer.trim()) {
            processSseLine(lineBuffer.trim());
          }
          isDone = true;
          resData = buildStreamData();
          onStream?.(resData as ApiStreamResult);
          onStreamEnd?.(resData as ApiStreamResult);
        } else {
          const rawText = await res.text();
          rawAccumulated = rawText;
          for (const line of rawText.split("\\n")) {
            processSseLine(line.trim());
          }
          isDone = true;
          resData = buildStreamData();
          onStream?.(resData as ApiStreamResult);
          onStreamEnd?.(resData as ApiStreamResult);
        }
      } else if (cType.includes("text/plain")) {
        let textAccumulated = "";
        const tokens: string[] = [];

        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const textChunk = decoder.decode(value, { stream: true });
            textAccumulated += textChunk;
            tokens.push(textChunk);
            resData = {
              content: textAccumulated,
              response: textAccumulated,
              tokens: [...tokens],
              streamed: true,
              statusText: res.statusText,
              raw: textAccumulated,
              done: false,
            };
            onStream?.(resData as ApiStreamResult);
          }
        } else {
          const text = await res.text();
          textAccumulated = text;
          tokens.push(text);
        }

        resData = {
          content: textAccumulated,
          response: textAccumulated,
          tokens,
          streamed: true,
          statusText: res.statusText,
          raw: textAccumulated,
          done: true,
        };
        onStream?.(resData as ApiStreamResult);
        onStreamEnd?.(resData as ApiStreamResult);
      } else {
        const text = await res.text().catch(() => "");
        if (!text) {
          resData = { statusText: res.statusText };
        } else {
          try {
            resData = JSON.parse(text);
          } catch {
            resData = { text, statusText: res.statusText };
          }
        }
      }
    } else {
      resData = {
        success: true,
        message: "Action '" + eventName + "' (" + eventType + ") triggered successfully",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      id: logId,
      eventName,
      eventType,
      timestamp,
      url: targetUrl || "N/A",
      targetUrl: targetUrl || "N/A",
      method: method || "TRIGGER",
      status,
      payload: requestBody,
      data: resData as TData,
    };
  } catch (err) {
    onStreamError?.(err);
    const errorMessage = err instanceof Error ? err.message : "Request failed";
    return {
      id: logId,
      eventName,
      eventType,
      timestamp,
      url: url || "N/A",
      targetUrl: url || "N/A",
      method: method || "TRIGGER",
      error: errorMessage,
      data: null as unknown as TData,
    };
  }
}
`;

  return {
    filename: "lib/api-client.ts",
    language: "typescript",
    content,
  };
}
