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
        }
      } catch (_tokenErr) {}
    }` : ""}

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
      resData = await res.json().catch(() => ({ statusText: res.statusText }));
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
