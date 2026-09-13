"use client";

import React, { useState } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Tabs, TabsContent } from "@workspace/ui/components/tabs";
import {
  SectionConfigHeader,
  SectionTabsNav,
  SectionNotFoundState,
  SectionGeneralTab,
  SectionDependenciesTab,
  SectionActionsTab,
  SectionStateTab,
  SectionUiDesignTab,
  useSectionState,
  useSectionActions,
} from "./web-page-section-config";

export interface WebPageSectionConfigProps {
  id: string; // The section ID
  nodeId: string;
}

export const WebPageSectionConfig: React.FC<WebPageSectionConfigProps> = ({ id, nodeId }) => {
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const [activeTab, setActiveTab] = useState("general");

  const {
    parentNode,
    section,
    availablePackages,
    name,
    setName,
    renderMode,
    setRenderMode,
    loadStrategy,
    setLoadStrategy,
    uiPrompt,
    setUiPrompt,
    images,
    setImages,
    primaryImageUrl,
    setPrimaryImageUrl,
    libraries,
    states,
    handleUpdateStates,
    handleUpdate,
    handleDeleteSection,
    handleAddLibrary,
    handleRemoveLibrary,
    handleApplyPreset,
  } = useSectionState({ id, nodeId });

  const {
    currentActions,
    actionSearch,
    setActionSearch,
    expandedActionId,
    setExpandedActionId,
    serviceNodes,
    endpoints,
    handleAddAction,
    handleUpdateAction,
    handleDeleteAction,
    handleDuplicateAction,
    getActionLink,
    handleActionServiceLink,
  } = useSectionActions({
    nodeId,
    section,
    handleUpdate,
  });

  if (!parentNode || !section) {
    return <SectionNotFoundState onClose={() => setActiveConfigItem(null)} />;
  }

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12 font-sans text-foreground">
      {/* Header Banner */}
      <div className="px-4">
        <SectionConfigHeader
          nodeId={nodeId}
          sectionId={section.id}
          pageLabel={parentNode.data?.label}
          sectionName={section.name}
          renderMode={renderMode}
          onDelete={handleDeleteSection}
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <SectionTabsNav
          packagesCount={libraries.length}
          actionsCount={currentActions.length}
          statesCount={states.length}
        />

        {/* 1. General Tab */}
        <TabsContent value="general" className="flex-1 overflow-hidden p-0 m-0 outline-none flex flex-col">
          <SectionGeneralTab
            name={name}
            renderMode={renderMode}
            loadStrategy={loadStrategy}
            currentLibraries={libraries}
            existingActionsCount={currentActions.length}
            onUpdateName={(val) => {
              setName(val);
              handleUpdate({ name: val });
            }}
            onUpdateRenderMode={(val) => {
              setRenderMode(val);
              handleUpdate({ renderMode: val });
            }}
            onUpdateLoadStrategy={(val) => {
              setLoadStrategy(val);
              handleUpdate({ loadStrategy: val });
            }}
            onApplyPreset={handleApplyPreset}
            onDelete={handleDeleteSection}
          />
        </TabsContent>

        {/* 2. Dependencies / Packages Tab */}
        <TabsContent value="dependencies" className="flex-1 overflow-hidden p-0 m-0 outline-none flex flex-col">
          <SectionDependenciesTab
            libraries={libraries}
            availablePackages={availablePackages}
            onAddLibrary={handleAddLibrary}
            onRemoveLibrary={handleRemoveLibrary}
          />
        </TabsContent>

        {/* 3. Actions Tab */}
        <TabsContent value="actions" className="flex-1 overflow-hidden p-0 m-0 outline-none flex flex-col">
          <SectionActionsTab
            nodeId={nodeId}
            sectionId={id}
            actions={currentActions}
            actionSearch={actionSearch}
            expandedActionId={expandedActionId}
            serviceNodes={serviceNodes}
            endpoints={endpoints}
            getActionLink={getActionLink}
            onSetActionSearch={setActionSearch}
            onSetExpandedActionId={setExpandedActionId}
            onAddAction={handleAddAction}
            onUpdateAction={handleUpdateAction}
            onDeleteAction={handleDeleteAction}
            onDuplicateAction={handleDuplicateAction}
            onServiceLink={handleActionServiceLink}
            onOpenTesting={(actionId, targetNodeId, endpointId) =>
              setActiveConfigItem({
                type: "eventTesting",
                id: actionId,
                nodeId,
                targetNodeId,
                endpointId,
                initialTab: "trigger",
              })
            }
            onOpenEventConfig={(actionId) =>
              setActiveConfigItem({
                type: "pageEvent",
                id: actionId,
                nodeId,
                sectionId: id,
              })
            }
          />
        </TabsContent>

        {/* 4. State Tab */}
        <TabsContent value="state" className="flex-1 overflow-hidden p-0 m-0 outline-none flex flex-col">
          <SectionStateTab
            states={states}
            renderMode={renderMode}
            onUpdateStates={handleUpdateStates}
            onUpdateRenderMode={(val) => {
              setRenderMode(val);
              handleUpdate({ renderMode: val });
            }}
          />
        </TabsContent>

        {/* 5. UI Design Tab */}
        <TabsContent value="ui-design" className="flex-1 overflow-hidden p-0 m-0 outline-none flex flex-col">
          <SectionUiDesignTab
            sectionName={section.name}
            actionsCount={currentActions.length}
            uiPrompt={uiPrompt}
            images={images}
            primaryImageUrl={primaryImageUrl}
            onUpdateUiPrompt={(val) => {
              setUiPrompt(val);
              handleUpdate({ uiPrompt: val });
            }}
            onUpdateImages={(nextImages, primaryUrl) => {
              setImages(nextImages);
              setPrimaryImageUrl(primaryUrl);
              handleUpdate({ images: nextImages, primaryImageUrl: primaryUrl });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
