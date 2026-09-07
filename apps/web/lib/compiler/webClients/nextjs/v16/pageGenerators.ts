import { PageInfo } from "./types";
import { BackendNodeData } from "@workspace/canvas";
import { isAuthPage } from "../../../compileAuth";
import { SectionMeta } from "./sectionGenerators";
import { generateAuthPageCode } from "./authPageGenerators";

export function generatePageCode(
  pageMeta: PageInfo,
  pageLoadFetchStatements: string,
  sectionsMeta: SectionMeta[],
  authNodeData?: BackendNodeData,
  /** TypeScript type name to use for pageLoadData state (e.g. "PageLoadData" or "JSONValue") */
  pageLoadDataType: string = "JSONValue",
  /** Optional interface declaration to emit for the above type (empty string if using JSONValue) */
  pageLoadDataTypeDecl: string = "",
): string {
  const isAuth = isAuthPage(pageMeta, authNodeData);

  if (isAuth) {
    return generateAuthPageCode(pageMeta, authNodeData);
  }

  const allImports = sectionsMeta
    .map(
      (s) => `import { ${s.componentName} } from "./_components/${s.folderName}";`
    )
    .join("\n");

  const allActions = sectionsMeta.flatMap((s) => s.actions || []);
  const hasApiActions = allActions.some(
    (a) => a.eventType !== "navigateToPage" && a.url && a.url !== "#",
  );

  const sectionsJsx = sectionsMeta
    .map((s) => `        <${s.componentName}${hasApiActions ? " onTrigger={handleTriggerAction}" : ""} />`)
    .join("\n\n");

  if (pageMeta.slug === "not-found") {
    return `"use client";

import React from "react";
import Link from "next/link";
${allImports ? `${allImports}\n` : ""}export default function ${pageMeta.componentName}() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6 md:p-10 font-sans text-center">
      <div className="max-w-md mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-8xl font-extrabold tracking-tight text-primary">404</h1>
          <h2 className="text-2xl font-bold tracking-tight">Page Not Found</h2>
          <p className="text-muted-foreground text-sm">
            Sorry, the page you are looking for does not exist or has been moved.
          </p>
        </div>
        <div className="pt-2 flex justify-center">
${sectionsJsx ? `${sectionsJsx}` : `          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
          >
            Back to Home
          </Link>`}
        </div>
      </div>
    </main>
  );
}
`;
  }

  const hasAuth = Boolean(authNodeData);
  const hasPageLoad = Boolean(
    pageLoadFetchStatements && pageLoadFetchStatements.trim().length > 0,
  );

  const hooksList: string[] = [];
  if (hasPageLoad) {
    hooksList.push("useState", "useEffect");
  } else if (hasApiActions) {
    hooksList.push("useState");
  }

  const reactImport = hooksList.length > 0
    ? `import React, { ${hooksList.join(", ")} } from "react";`
    : `import React from "react";`;

  const pageLoadStateJsx = hasPageLoad
    ? `  const [pageLoadData, setPageLoadData] = useState<${pageLoadDataType}>(null);
  const [pageLoadLoading, setPageLoadLoading] = useState<boolean>(false);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);

`
    : "";

  const pageLoadEffectJsx = hasPageLoad
    ? `  useEffect(() => {
    async function loadPageData() {
      ${pageLoadFetchStatements}
    }
    loadPageData();
  }, []);

`
    : "";

  const pageLoadSectionJsx = hasPageLoad
    ? `        {/* Section: Page Load Data */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-card-foreground">Page Load Data</CardTitle>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {pageLoadLoading ? "Loading..." : pageLoadError ? "Error" : "Loaded"}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 border border-border rounded-lg p-4 font-mono text-sm text-foreground overflow-x-auto shadow-inner min-h-[120px]">
              <pre className="whitespace-pre-wrap font-mono">
                {pageLoadLoading
                  ? "// Loading page data from API endpoint..."
                  : pageLoadError
                  ? "// Error: " + pageLoadError
                  : pageLoadData !== null
                  ? JSON.stringify(pageLoadData, null, 2)
                  : "// No pageLoad data available."}
              </pre>
            </div>
          </CardContent>
        </Card>

`
    : "";

  const triggerLogsStateJsx = hasApiActions
    ? `  const [triggerLogs, setTriggerLogs] = useState<Array<{
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

`
    : "";

  const triggerHandlerJsx = hasApiActions
    ? `  const handleTriggerAction = async (
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

`
    : "";

  const triggerLogsSectionJsx = hasApiActions
    ? `        {/* Section: Trigger Output Logs */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-card-foreground">Output Log</CardTitle>
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
                No activity logged yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {triggerLogs.map((log) => (
                  <div key={log.id} className="bg-muted/40 border border-border rounded-lg p-4 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border pb-2">
                      <span className="font-semibold text-foreground">{log.eventName}</span>
                      <span>{log.timestamp}</span>
                    </div>
                    {log.error ? (
                      <div className="text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                        Error: {log.error}
                      </div>
                    ) : (
                      <pre className="text-foreground/90 bg-background/80 p-3 rounded border border-border/50 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
`
    : "";

  const cardComponentsNeeded = hasPageLoad || hasApiActions;
  const uiImports: string[] = [];
  if (hasApiActions) {
    uiImports.push(`import { Button } from "@workspace/ui/components/button";`);
    uiImports.push(`import { executeApiAction } from "@/lib/api-client";`);
  }
  if (cardComponentsNeeded) {
    uiImports.push(`import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card";`);
  }
  if (hasPageLoad) {
    uiImports.push(`import { Badge } from "@workspace/ui/components/badge";`);
  }
  if (hasAuth && hasPageLoad) {
    uiImports.push(`import { getAuthBearerToken } from "@/lib/auth-token";`);
  }

  const needsJsonValue = hasPageLoad;
  const jsonValueTypeDecl = needsJsonValue
    ? `type JSONPrimitive = string | number | boolean | null;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = JSONPrimitive | JSONObject | JSONArray;

`
    : "";
  // Named response type declaration (e.g. interface PageLoadData {...})
  const namedTypeDecl = pageLoadDataTypeDecl ? `${pageLoadDataTypeDecl}\n\n` : "";

  return `"use client";

${reactImport}
${uiImports.join("\n")}${uiImports.length > 0 ? "\n" : ""}${allImports ? `${allImports}\n` : ""}${jsonValueTypeDecl}${namedTypeDecl}export default function ${pageMeta.componentName}() {
${pageLoadStateJsx}${triggerLogsStateJsx}${pageLoadEffectJsx}${triggerHandlerJsx}  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
${pageLoadSectionJsx}${sectionsJsx ? `        {/* Page Sections */}\n${sectionsJsx}\n` : ""}${triggerLogsSectionJsx}      </div>
    </main>
  );
}
`;

}
