"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, PageSection, Parameter } from "@/types/canvas";
import { Tabs } from "@workspace/ui/components/tabs";
import { useTerminalWorkspace } from "../terminal/hooks/useTerminalWorkspace";
import { useWebPageCodeMismatch } from "./useWebPageCodeMismatch";
import {
  WebPageHeaderSection,
  WebPageTabsNav,
  WebPageSectionsTab,
  WebPageStateTab,
  WebPageUploadsTab,
  WebPageApiTab,
  WebPageCodeSyncTab,
  WebPageProtectionTab,
  WebPageAiTab,
  WebPageDialogs,
  WebPageAccessType,
  useWebPageConnectedContext,
  useWebPageApiParameters,
  useWebPageAiGeneration,
  useWebPageRename,
} from "./web-page-config";

export const WebPageConfig = ({
  id,
  nodeId,
}: {
  id: string;
  nodeId: string;
}) => {
  const router = useRouter();
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === nodeId),
  );
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const allEndpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);
  const patchNodeData = useMutation(api.canvas.patchNodeData);

  const initialTab =
    (activeConfigItem?.initialTab as string) ||
    "sections";
  const [activeTab, setActiveTab] = useState(initialTab);

  React.useEffect(() => {
    const nextTab = activeConfigItem?.initialTab as string;
    if (nextTab) {
      setActiveTab(nextTab);
    }
  }, [activeConfigItem?.initialTab]);

  const resolvedProjectId: string =
    id ||
    (typeof window !== "undefined"
      ? window.location.pathname.split("/project/")[1]?.split("/")[0] ?? ""
      : "");
  const projectId = resolvedProjectId as Id<"projects">;

  const { outputDir } = useTerminalWorkspace(resolvedProjectId);

  if (!node) return null;

  const data = node.data;

  const updateData = (changes: Partial<BackendNode["data"]>) => {
    updateNode(nodeId, { data: { ...data, ...changes } });
  };

  const appName = data.appName || "Web App";
  const appSlug =
    data.appSlug || appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const useZoneDefault = data.useZoneDefault !== false;
  const accessType: WebPageAccessType = data.accessType || "public";
  const allowedRoles = data.allowedRoles || [];
  const requiredPlans = data.requiredPlans || [];
  const redirectTo =
    data.redirectTo ||
    (accessType === "payment-gated"
      ? "/pricing"
      : accessType === "org-gated"
      ? "/select-org"
      : "/login");

  // 1. Resolve connected WebApp, zone name, isProtected & connected service endpoint
  const { connectedWebApp, connectedZoneName, isProtected, connectedEndpoint } =
    useWebPageConnectedContext({
      nodeId,
      data,
      allNodes,
      allEdges,
      allEndpoints,
    });

  // 2. Real-time disk vs server code mismatch detection & merge
  const {
    status: mismatchStatus,
    serverCode,
    detectedDiskPath,
    defaultFilePath,
    diffSummary,
    localDiskCode,
    hasCustomServerFile,
    isSaving: isMismatchSaving,
    dialogOpen: mismatchDialogOpen,
    setDialogOpen: setMismatchDialogOpen,
    pageName,
    pageRoute,
    checkDiskStatus,
    mergeAllToServer,
    mergeSelectedToServer,
    overwriteLocalWithServer,
    resetToCompilerBaseline,
  } = useWebPageCodeMismatch({
    projectId: resolvedProjectId,
    nodeId,
    outputDir: outputDir || "",
    node,
    connectedWebAppNode: connectedWebApp,
    allNodes,
    allEdges,
    endpoints: allEndpoints,
  });

  // 3. Resolve API headers, path/query params and request body schema
  const {
    effectiveHeaders,
    effectivePathParams,
    effectiveQueryParams,
    effectiveRequestBody,
    effectiveRequestBodyMode,
  } = useWebPageApiParameters({
    data,
    connectedEndpoint,
    isProtected,
  });

  // Auto-clean any default or stale auth headers stored on page data
  React.useEffect(() => {
    if (data.headers && data.headers.length > 0) {
      const hasAuth = data.headers.some(
        (h: Parameter) =>
          h.name?.toLowerCase() === "authorization" ||
          h.id === "auth-bearer-header" ||
          h.id?.startsWith("auth-"),
      );
      if (hasAuth) {
        const cleaned = data.headers.filter(
          (h: Parameter) =>
            h.name?.toLowerCase() !== "authorization" &&
            h.id !== "auth-bearer-header" &&
            !h.id?.startsWith("auth-"),
        );
        updateData({ headers: cleaned });
      }
    }
  }, [data.headers]);

  // 4. AI Code Generation
  const { isGeneratingAi, handleGenerateAiCode } = useWebPageAiGeneration({
    nodeId,
    projectId,
    data,
    serverCode,
    detectedDiskPath,
    defaultFilePath,
    outputDir,
    updateData,
    patchNodeData,
    checkDiskStatus,
  });

  // 5. Page Rename Validation & Dialog
  const {
    renameDialogOpen,
    setRenameDialogOpen,
    pendingRename,
    setPendingRename,
    handleRequestRename,
    handleConfirmRename,
  } = useWebPageRename({
    nodeId,
    data,
    updateData,
    connectedWebApp,
    allNodes,
    allEdges,
  });

  const sectionsCount = (data.sections || []).length;
  const stateStoreNodes = allNodes.filter((n) => n.type === "state_store");
  const storeCount = stateStoreNodes.length;

  return (
    <div className="flex flex-col h-full font-sans text-foreground">
      {/* Top Header Section */}
      <WebPageHeaderSection
        label={data.label}
        summary={data.summary}
        description={data.description}
        connectedZoneName={connectedZoneName}
        isProtected={isProtected}
        requireAuth={data.requireAuth !== undefined ? data.requireAuth : isProtected}
        onUpdateSummary={(summary) => updateData({ summary, description: summary })}
        onUpdateRequireAuth={(requireAuth) => updateData({ requireAuth })}
      />

      {/* Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden mt-4"
      >
        <WebPageTabsNav
          sectionsCount={sectionsCount}
          storeCount={storeCount}
          hasUploadsConfig={Boolean(
            data.connectedStorageNodeId || data.uploadBucketId || data.presignEndpointId,
          )}
        />

        {/* Tab 1: Sections & Membership */}
        <WebPageSectionsTab
          nodeId={nodeId}
          label={data.label}
          appSlug={appSlug}
          connectedZoneName={connectedZoneName}
          sections={data.sections}
          onUpdateSections={(sections) => updateData({ sections })}
          onAddSection={(sectionName) => {
            const currentSections: PageSection[] = data.sections || [];
            const newSec: PageSection = {
              id: `sec-${crypto.randomUUID()}`,
              name: sectionName || `Section${currentSections.length + 1}`,
              renderMode: "server",
              loadStrategy: "eager",
              actions: [],
            };
            updateData({ sections: [...currentSections, newSec] });
          }}
          onRequestRename={handleRequestRename}
          onUpdateAppSlug={(slug) => updateData({ appSlug: slug })}
        />

        {/* Tab 2: State Store Configuration */}
        <WebPageStateTab
          nodeId={nodeId}
          data={data}
          initialSelectedStoreId={activeConfigItem?.selectedStoreId as string}
        />

        {/* Tab 3: Image & File Uploads (Presigned URL) */}
        <WebPageUploadsTab
          nodeId={nodeId}
          data={data}
          allNodes={allNodes}
          allEdges={allEdges}
          allEndpoints={allEndpoints}
          onUpdateData={updateData}
        />

        {/* Tab 4: API Parameters & Request Body */}
        <WebPageApiTab
          connectedEndpoint={connectedEndpoint}
          effectiveHeaders={effectiveHeaders}
          effectivePathParams={effectivePathParams}
          effectiveQueryParams={effectiveQueryParams}
          effectiveRequestBody={effectiveRequestBody}
          effectiveRequestBodyMode={effectiveRequestBodyMode}
          onUpdateHeaders={(headers) =>
            updateData({
              headers: headers.filter(
                (h: Parameter) =>
                  h.name?.toLowerCase() !== "authorization" &&
                  h.id !== "auth-bearer-header" &&
                  !h.id?.startsWith("auth-"),
              ),
            })
          }
          onUpdatePathParams={(pathParams) => updateData({ pathParams })}
          onUpdateQueryParams={(queryParams) => updateData({ queryParams })}
          onUpdateRequestBody={(requestBody) => updateData({ requestBody })}
          onUpdateRequestBodyMode={(requestBodyMode) => updateData({ requestBodyMode })}
        />

        {/* Tab 3: Code Sync & Visual Studio */}
        <WebPageCodeSyncTab
          hasCustomServerFile={hasCustomServerFile}
          detectedDiskPath={detectedDiskPath}
          defaultFilePath={defaultFilePath}
          outputDir={outputDir || ""}
          mismatchStatus={mismatchStatus}
          diffSummary={diffSummary}
          isMismatchSaving={isMismatchSaving}
          onOpenMismatchDialog={() => setMismatchDialogOpen(true)}
          onMergeAllToServer={mergeAllToServer}
          onOverwriteLocalWithServer={overwriteLocalWithServer}
          onOpenPageStudio={() => {
            if (resolvedProjectId) router.push(`/project/${resolvedProjectId}/pages/${nodeId}`);
          }}
          onResetToCompilerBaseline={resetToCompilerBaseline}
        />

        {/* Tab 4: Protection Rules & Access */}
        <WebPageProtectionTab
          useZoneDefault={useZoneDefault}
          accessType={accessType}
          allowedRoles={allowedRoles}
          requiredPlans={requiredPlans}
          redirectTo={redirectTo}
          isAuthPage={Boolean(data.isAuthPage)}
          onUpdateUseZoneDefault={(useDefault) => updateData({ useZoneDefault: useDefault })}
          onUpdateAccessType={(type, defaultRedirect) =>
            updateData({ accessType: type, redirectTo: defaultRedirect })
          }
          onUpdateAllowedRoles={(roles) => updateData({ allowedRoles: roles })}
          onUpdateRequiredPlans={(plans) => updateData({ requiredPlans: plans })}
          onUpdateRedirectTo={(target) => updateData({ redirectTo: target })}
          onUpdateIsAuthPage={(isAuth) => updateData({ isAuthPage: isAuth })}
        />

        {/* Tab 5: AI Page Generation Prompts */}
        <WebPageAiTab
          description={data.description}
          uiPrompt={data.uiPrompt}
          isGeneratingAi={isGeneratingAi}
          onUpdateDescription={(description) => updateData({ description })}
          onUpdateUiPrompt={(uiPrompt) => updateData({ uiPrompt })}
          onGenerateAiCode={handleGenerateAiCode}
        />
      </Tabs>

      {/* Granular Code Mismatch & Page Rename Confirmation Dialogs */}
      <WebPageDialogs
        nodeId={nodeId}
        projectId={resolvedProjectId}
        mismatchDialogOpen={mismatchDialogOpen}
        setMismatchDialogOpen={setMismatchDialogOpen}
        pageName={pageName}
        pageRoute={pageRoute}
        filePath={detectedDiskPath || defaultFilePath}
        serverCode={serverCode || ""}
        localDiskCode={localDiskCode}
        diffSummary={diffSummary}
        isMismatchSaving={isMismatchSaving}
        mergeAllToServer={mergeAllToServer}
        mergeSelectedToServer={mergeSelectedToServer}
        overwriteLocalWithServer={overwriteLocalWithServer}
        renameDialogOpen={renameDialogOpen}
        setRenameDialogOpen={setRenameDialogOpen}
        pendingRename={pendingRename}
        setPendingRename={setPendingRename}
        onConfirmRename={handleConfirmRename}
      />
    </div>
  );
};
