import { ResolvedEventParameters } from "../types";

function resolveActionLibImports(libraries?: string[]): string {
  if (!libraries || libraries.length === 0) return "";
  const lines: string[] = [];
  for (const lib of libraries) {
    const clean = lib.trim();
    if (!clean) continue;
    const safeId = clean.replace(/^@/, "").replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+/, "");
    lines.push(`import * as ${safeId} from "${clean}";`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function escapeJsxAttr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/"/g, "&quot;");
}

export function generateInteractiveFormEventTemplate({
  componentName,
  eventName,
  eventType,
  url,
  upperMethod,
  requireAuth = true,
  typeDefs,
  params,
  libraries = [],
}: {
  componentName: string;
  eventName: string;
  eventType: string;
  url: string;
  upperMethod: string;
  requireAuth?: boolean;
  typeDefs: string[];
  params: ResolvedEventParameters;
  libraries?: string[];
}): string {
  const {
    mergedPathParams,
    mergedQueryParams,
    mergedHeaders,
    bodyFields,
    hasPathParams,
    hasQueryParams,
    hasHeaders,
    hasBodyFields,
    hasRawJson,
    pathParamsDefault,
    queryParamsDefault,
    headersDefault,
    bodyFieldsDefault,
    defaultRawJsonString,
  } = params;

  const libImports = resolveActionLibImports(libraries);

  return `"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
${libImports}${requireAuth ? `import { getAuthBearerToken } from "@/lib/auth-token";\n` : ""}
${typeDefs.join("\n\n")}

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
${hasPathParams ? `  const [pathParams, setPathParams] = useState<Record<string, string>>(${pathParamsDefault});\n` : ""}${hasQueryParams ? `  const [queryParams, setQueryParams] = useState<Record<string, string>>(${queryParamsDefault});\n` : ""}${hasHeaders ? `  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(${headersDefault});\n` : ""}${hasBodyFields ? `  const [bodyFields, setBodyFields] = useState<Record<string, any>>(${bodyFieldsDefault});\n` : ""}${hasRawJson ? `  const [rawJsonBody, setRawJsonBody] = useState<string>(${defaultRawJsonString});\n  const [jsonError, setJsonError] = useState<string | null>(null);\n` : ""}
${requireAuth && hasHeaders && mergedHeaders.some((h) => h.name.toLowerCase() === "authorization") ? `  useEffect(() => {
    async function autoFetchToken() {
      try {
        const token = await getAuthBearerToken();
        if (token) {
          setCustomHeaders((prev) => {
            if (!prev["Authorization"] || prev["Authorization"] === "Bearer <token>") {
              return { ...prev, Authorization: token };
            }
            return prev;
          });
        }
      } catch (_err) {}
    }
    autoFetchToken();
  }, []);
` : ""}
  const computeFinalUrl = (): string => {
    let currentUrl = "${url}";
    let origin = "";
    let pathnameAndRest = currentUrl;
    const matchOrigin = currentUrl.match(/^([a-zA-Z]+:\\/\\/[^/]+)(.*)$/);
    if (matchOrigin) {
      origin = matchOrigin[1] || "";
      pathnameAndRest = matchOrigin[2] || "";
    }
${hasPathParams ? `    Object.entries(pathParams).forEach(([key, val]) => {
      if (val !== undefined && val !== "") {
        pathnameAndRest = pathnameAndRest.replace(new RegExp(":" + key + "\\\\b|\\\\{" + key + "\\\\}", "g"), encodeURIComponent(String(val)));
      }
    });\n` : ""}    let finalUrl = origin + pathnameAndRest;
${hasQueryParams ? `    const search = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, val]) => {
      if (val !== undefined && val !== "") {
        search.append(key, String(val));
      }
    });
    const qs = search.toString();
    if (qs) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;
    }\n` : ""}    return finalUrl;
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const finalUrl = computeFinalUrl();
      let payloadBody: unknown = undefined;
${hasBodyFields ? `      // Form fields payload
      payloadBody = { ...bodyFields };
` : ""}${hasRawJson ? `      // Raw JSON payload
      if (rawJsonBody.trim()) {
        try {
          payloadBody = JSON.parse(rawJsonBody);
          setJsonError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setJsonError("Invalid JSON: " + message);
          setIsSubmitting(false);
          return;
        }
      }
` : ""}      await onTrigger?.(
        "${eventName}",
        "${eventType}",
        finalUrl,
        "${upperMethod}",
        ${Boolean(requireAuth)},
        ${hasHeaders ? "Object.keys(customHeaders).length > 0 ? customHeaders : undefined" : "undefined"},
        ${hasQueryParams ? "Object.keys(queryParams).length > 0 ? queryParams : undefined" : "undefined"},
        payloadBody,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full border-border shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border/50">
        <CardTitle className="text-sm font-bold text-card-foreground">
          ${eventName}
        </CardTitle>
      </CardHeader>

      <form onSubmit={handleFormSubmit}>
        <CardContent className="p-4 space-y-4 text-xs">
${hasPathParams ? `          {/* Path Parameters */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Path Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedPathParams.filter((p) => Boolean(p && p.name && p.name.trim())).map((p) => `              <div key="${p.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  :${p.name}${p.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(p.description || p.defaultValue || p.name)}"
                  value={pathParams["${p.name}"] ?? ""}
                  required={${Boolean(p.required)}}
                  onChange={(e) =>
                    setPathParams((prev) => ({ ...prev, "${p.name}": e.target.value }))
                  }
                />
              </div>`).join("\n")}
            </div>
          </div>
` : ""}${hasQueryParams ? `          {/* Query Parameters */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Query Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedQueryParams.filter((q) => Boolean(q && q.name && q.name.trim())).map((q) => `              <div key="${q.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${q.name}${q.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  type="${q.type === "number" ? "number" : "text"}"
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(q.description || q.defaultValue || q.name)}"
                  value={queryParams["${q.name}"] ?? ""}
                  required={${Boolean(q.required)}}
                  onChange={(e) =>
                    setQueryParams((prev) => ({ ...prev, "${q.name}": e.target.value }))
                  }
                />
              </div>`).join("\n")}
            </div>
          </div>
` : ""}${hasHeaders ? `          {/* Headers */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Headers
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedHeaders.filter((h) => Boolean(h && h.name && h.name.trim())).map((h) => {
  if (h.name.toLowerCase() === "authorization" && requireAuth) {
    return `              <div key="${h.name}" className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                    <span>${h.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Bearer Token
                    </span>
                  </Label>
                  <button
                    type="button"
                    onClick={async () => {
                      const token = await getAuthBearerToken();
                      if (token) {
                        setCustomHeaders((prev) => ({ ...prev, Authorization: token }));
                      }
                    }}
                    className="text-[10px] text-primary hover:underline cursor-pointer font-mono"
                  >
                    Refresh from session
                  </button>
                </div>
                <Input
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="Bearer token"
                  value={customHeaders["${h.name}"] ?? ""}
                  onChange={(e) =>
                    setCustomHeaders((prev) => ({ ...prev, "${h.name}": e.target.value }))
                  }
                />
              </div>`;
  }
  return `              <div key="${h.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${h.name}
                </Label>
                <Input
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(h.description || h.defaultValue || h.name)}"
                  value={customHeaders["${h.name}"] ?? ""}
                  onChange={(e) =>
                    setCustomHeaders((prev) => ({ ...prev, "${h.name}": e.target.value }))
                  }
                />
              </div>`;
}).join("\n")}
            </div>
          </div>
` : ""}${hasBodyFields ? `          {/* Request Body Fields */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Request Body
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${bodyFields.filter((f) => Boolean(f && f.name && f.name.trim())).map((f) => {
  if (f.type === "boolean") {
    return `              <div key="${f.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name}${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  value={String(bodyFields["${f.name}"] ?? "false")}
                  onChange={(e) =>
                    setBodyFields((prev) => ({ ...prev, "${f.name}": e.target.value === "true" }))
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>`;
  }
  if (f.type === "object" || f.type === "array") {
    const defaultPlaceholder = f.type === "array" ? '["item1", "item2"]' : '{"key": "val"}';
    const placeholderAttr = f.description
      ? `placeholder={${JSON.stringify(f.description)}}`
      : `placeholder='${defaultPlaceholder}'`;
    return `              <div key="${f.name}" className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name} (${f.type})${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Textarea
                  className="min-h-[60px] text-xs font-mono bg-background"
                  ${placeholderAttr}
                  value={typeof bodyFields["${f.name}"] === "object" ? JSON.stringify(bodyFields["${f.name}"]) : bodyFields["${f.name}"] ?? ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    try {
                      const parsed = JSON.parse(text);
                      setBodyFields((prev) => ({ ...prev, "${f.name}": parsed }));
                    } catch {
                      setBodyFields((prev) => ({ ...prev, "${f.name}": text }));
                    }
                  }}
                />
              </div>`;
  }
  return `              <div key="${f.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name}${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  type="${f.type === "number" ? "number" : "text"}"
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(f.description || f.defaultValue || f.name)}"
                  value={bodyFields["${f.name}"] ?? ""}
                  required={${Boolean(f.required)}}
                  onChange={(e) =>
                    setBodyFields((prev) => ({
                      ...prev,
                      "${f.name}": ${f.type === "number" ? `Number(e.target.value)` : `e.target.value`},
                    }))
                  }
                />
              </div>`;
}).join("\n")}
            </div>
          </div>
` : ""}${hasRawJson ? `          {/* Raw JSON Body */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Request Body (JSON)
            </Label>
            <Textarea
              className="min-h-[90px] text-xs font-mono bg-background"
              value={rawJsonBody}
              onChange={(e) => {
                setRawJsonBody(e.target.value);
                if (jsonError) setJsonError(null);
              }}
            />
            {jsonError && (
              <span className="text-[10px] text-destructive font-mono">{jsonError}</span>
            )}
          </div>
` : ""}        </CardContent>

        <CardFooter className="p-4 pt-2 border-t border-border/50 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="cursor-pointer font-semibold shadow"
          >
            {isSubmitting ? "Executing..." : "${eventName}"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default ${componentName};
`;
}
