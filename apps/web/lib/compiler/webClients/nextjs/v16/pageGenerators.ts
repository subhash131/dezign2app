import { PageInfo } from "./types";
import { BackendNodeData } from "@workspace/canvas";
import { isAuthPage, AuthCompilerNodeData } from "../../../compileAuth";
import { SectionMeta } from "./sectionGenerators";
import { generateAuthPageCode } from "./authPageGenerators";
import {
  generatePageLoadState,
  generatePageLoadEffect,
  generatePageLoadSection,
  generateJsonValueTypeDecl,
  generateSseEffects,
  generateWebSocketEffects,
  generateWebRtcEffects,
  resolveWebRtcMediaCapabilities,
  generateMediaStateJsx,
  generateMediaSectionJsx,
  generateTriggerLogsState,
  generateTriggerHandler,
  generateTriggerLogsSection,
} from "./page-generators";

export function generatePageCode(
  pageMeta: PageInfo,
  pageLoadFetchStatements: string,
  sectionsMeta: SectionMeta[],
  authNodeData?: AuthCompilerNodeData,
  /** TypeScript type name to use for pageLoadData state (e.g. "PageLoadData" or "JSONValue") */
  pageLoadDataType: string = "JSONValue",
  /** Optional interface declaration to emit for the above type (empty string if using JSONValue) */
  pageLoadDataTypeDecl: string = "",
  /** Optional unmount cleanup statements (e.g. useCartStore.getState().reset()) */
  unmountCleanups: string = "",
  /** Optional store imports (e.g. import { useCartStore } from "@/lib/stores") */
  storeImports: string = "",
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
    (a) => a.eventType !== "navigateToPage" && ((a.url && a.url !== "#") || Boolean(a.eventName)),
  );
  // Only generate streaming plumbing when at least one action uses SSE / WebSocket / WebRTC.
  // Plain REST actions do not need it.
  const STREAMING_EVENT_TYPES = new Set(["SSE", "WebSocket", "WebRTC"]);
  const hasStreamingActions =
    (pageMeta.realtimeConnections || []).some((c) => Boolean(c.streamUrl)) ||
    allActions.some((a) => STREAMING_EVENT_TYPES.has(a.eventType));

  const sectionsJsx = sectionsMeta
    .map((s) => `        <${s.componentName}${hasApiActions ? " onTrigger={handleTriggerAction}" : ""} />`)
    .join("\n\n");


  const hasPageLoad = Boolean(pageLoadFetchStatements);
  const hasAuth = Boolean(authNodeData);

  const sseConnections = (pageMeta.realtimeConnections || []).filter(
    (c) => c.protocol === "SSE" && c.streamUrl,
  );
  const hasSse = sseConnections.length > 0;

  const wsConnections = (pageMeta.realtimeConnections || []).filter(
    (c) => c.protocol === "WEBSOCKET" && c.streamUrl,
  );
  const hasWs = wsConnections.length > 0;

  const webrtcConnections = (pageMeta.realtimeConnections || []).filter(
    (c) => c.protocol === "WEBRTC" && c.streamUrl,
  );
  const hasWebRtc = webrtcConnections.length > 0;

  const mediaCaps = resolveWebRtcMediaCapabilities(webrtcConnections);
  const hasRealtime = hasSse || hasWs || hasWebRtc;
  const hasLogsSection = hasApiActions || hasRealtime || hasPageLoad;
  const hasUnmount = Boolean(unmountCleanups && unmountCleanups.trim());

  const hooksList: string[] = [];
  if (hasPageLoad || hasRealtime || hasUnmount) {
    if (hasPageLoad || hasRealtime) {
      hooksList.push("useState");
    }
    hooksList.push("useEffect");
  } else if (hasLogsSection) {
    hooksList.push("useState");
  }
  if (mediaCaps.hasMediaStream) {
    hooksList.push("useRef");
  }

  const reactImport = hooksList.length > 0
    ? `import React, { ${hooksList.join(", ")} } from "react";`
    : `import React from "react";`;

  // Page Load Data & Lifecycle
  const pageLoadStateJsx = generatePageLoadState(hasPageLoad, pageLoadDataType);
  const pageLoadEffectJsx = generatePageLoadEffect(
    hasPageLoad,
    pageMeta,
    pageLoadFetchStatements,
    unmountCleanups,
  );
  const pageLoadSectionJsx = generatePageLoadSection(hasPageLoad);
  const jsonValueTypeDecl = pageLoadDataType.includes("JSONValue") ? generateJsonValueTypeDecl(hasPageLoad) : "";

  // Realtime Effects
  const sseEffectsJsx = generateSseEffects(sseConnections);
  const wsEffectsJsx = generateWebSocketEffects(wsConnections, hasAuth);
  const webrtcEffectsJsx = generateWebRtcEffects(webrtcConnections, hasAuth);

  // WebRTC Media Stream
  const mediaStateJsx = generateMediaStateJsx(mediaCaps);
  const mediaSectionJsx = generateMediaSectionJsx(mediaCaps);

  // Trigger Actions & Output Logs
  const triggerLogsStateJsx = generateTriggerLogsState(hasLogsSection, hasStreamingActions);
  const triggerHandlerJsx = generateTriggerHandler(hasApiActions, hasStreamingActions);
  const triggerLogsSectionJsx = generateTriggerLogsSection({
    hasLogsSection,
    hasSse,
    hasWs,
    hasWebRtc,
    hasRealtime,
    hasStreamingActions,
  });

  // Assemble UI Imports
  const cardComponentsNeeded = hasPageLoad || hasLogsSection || mediaCaps.hasMediaStream;
  const uiImports: string[] = [];
  if (hasLogsSection || mediaCaps.hasMediaStream) {
    uiImports.push(`import { Button } from "@workspace/ui/components/button";`);
  }
  if (hasApiActions) {
    uiImports.push(`import { executeApiAction } from "@/lib/api-client";`);
  }
  if (cardComponentsNeeded) {
    uiImports.push(`import { Card, CardHeader, CardTitle, CardContent } from "@workspace/ui/components/card";`);
  }
  if (hasRealtime) {
    uiImports.push(`import { Badge } from "@workspace/ui/components/badge";`);
  }
  if (hasAuth && (hasPageLoad || hasWs || hasWebRtc)) {
    uiImports.push(`import { getAuthBearerToken } from "@/lib/auth-token";`);
  }

  if (pageMeta.slug === "not-found") {
    const notFoundUiImports = uiImports.length > 0 ? `${uiImports.join("\n")}\n` : "";
    return `"use client";

${reactImport}
import Link from "next/link";
${notFoundUiImports}${storeImports ? `${storeImports}\n` : ""}${allImports ? `${allImports}\n` : ""}export default function ${pageMeta.componentName}() {
${triggerLogsStateJsx}${triggerHandlerJsx}  return (
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
${hasLogsSection ? `${triggerLogsSectionJsx}` : ""}      </div>
    </main>
  );
}
`;
  }

  const namedTypeDecl = pageLoadDataTypeDecl ? `${pageLoadDataTypeDecl}\n\n` : "";
  const sidebarSection = sectionsMeta.find((s) => s.hasSidebar);
  const hasSidebar = Boolean(sidebarSection);

  if (hasSidebar && sidebarSection) {
    const sidebarJsx = `      <${sidebarSection.componentName}${hasApiActions ? " onTrigger={handleTriggerAction}" : ""} />`;
    const contentSections = sectionsMeta.filter((s) => !s.hasSidebar);
    const contentSectionsJsx = contentSections
      .map((s) => `          <${s.componentName}${hasApiActions ? " onTrigger={handleTriggerAction}" : ""} />`)
      .join("\n\n");

    return `"use client";

${reactImport}
${uiImports.join("\n")}${uiImports.length > 0 ? "\n" : ""}${storeImports ? `${storeImports}\n` : ""}${allImports ? `${allImports}\n` : ""}${jsonValueTypeDecl}${namedTypeDecl}export default function ${pageMeta.componentName}() {
${pageLoadStateJsx}${mediaStateJsx}${triggerLogsStateJsx}${pageLoadEffectJsx}${sseEffectsJsx}${wsEffectsJsx}${webrtcEffectsJsx}${triggerHandlerJsx}  return (
    <div className="min-h-screen bg-background text-foreground flex w-full">
${sidebarJsx}
      <main className="flex-1 min-w-0 p-6 md:p-10 space-y-8">
        <div className="max-w-5xl space-y-8">
${pageLoadSectionJsx}${mediaSectionJsx}${contentSectionsJsx ? `          {/* Page Content Sections */}\n${contentSectionsJsx}\n` : ""}${triggerLogsSectionJsx}        </div>
      </main>
    </div>
  );
}
`;
  }


  return `"use client";

${reactImport}
${uiImports.join("\n")}${uiImports.length > 0 ? "\n" : ""}${storeImports ? `${storeImports}\n` : ""}${allImports ? `${allImports}\n` : ""}${jsonValueTypeDecl}${namedTypeDecl}export default function ${pageMeta.componentName}() {
${pageLoadStateJsx}${mediaStateJsx}${triggerLogsStateJsx}${pageLoadEffectJsx}${sseEffectsJsx}${wsEffectsJsx}${webrtcEffectsJsx}${triggerHandlerJsx}  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
${pageLoadSectionJsx}${mediaSectionJsx}${sectionsJsx ? `        {/* Page Sections */}\n${sectionsJsx}\n` : ""}${triggerLogsSectionJsx}      </div>
    </main>
  );
}
`;
}
