"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { PageSection, UIEventItem, SectionStateVariable } from "@/types/canvas";
import { SectionPreset } from "@workspace/canvas";
import { toast } from "sonner";
import {
  syncPackageTypesToCanvas,
  syncPackageToDiskPackageJson,
} from "@/lib/stores/backendCanvas/packageTypesSync";

export interface UseSectionStateProps {
  id: string;
  nodeId: string;
}

export function useSectionState({ id, nodeId }: UseSectionStateProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);
  const deleteSectionCollapseState = useSectionCollapseStore((s) => s.deleteSectionCollapseState);

  const parentNode = nodes.find((n) => n.id === nodeId);
  const sections: PageSection[] = parentNode?.data?.sections || [];
  const section = sections.find((s) => s.id === id);

  const connectedEdge = edges.find(
    (e) =>
      (e.source === nodeId && nodes.find((n) => n.id === e.target)?.type === "webApp") ||
      (e.target === nodeId && nodes.find((n) => n.id === e.source)?.type === "webApp")
  );

  const connectedWebApp = connectedEdge
    ? nodes.find(
        (n) => n.type === "webApp" && (n.id === connectedEdge.source || n.id === connectedEdge.target)
      )
    : nodes.find((n) => n.type === "webApp" && n.data?.appSlug === parentNode?.data?.appSlug);

  const availablePackages = useMemo(() => {
    const webAppDeps = connectedWebApp?.data?.customDependencies || [];
    const pageDeps = parentNode?.data?.customDependencies || [];
    const combined = [...webAppDeps, ...pageDeps];
    const seen = new Set<string>();
    return combined.filter((d) => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  }, [connectedWebApp?.data?.customDependencies, parentNode?.data?.customDependencies]);

  const [name, setName] = useState(section?.name || "");
  const [renderMode, setRenderMode] = useState<"server" | "client">(
    section?.renderMode || "server"
  );
  const [loadStrategy, setLoadStrategy] = useState<"eager" | "dynamic" | "dynamic-no-ssr">(
    section?.loadStrategy || "eager"
  );
  const [description, setDescription] = useState(section?.description || "");
  const [uiPrompt, setUiPrompt] = useState(section?.uiPrompt || "");
  const [images, setImages] = useState<string[]>(section?.images || []);
  const [primaryImageUrl, setPrimaryImageUrl] = useState<string | undefined>(
    section?.primaryImageUrl
  );
  const [libraries, setLibraries] = useState<string[]>(section?.libraries || []);
  const [states, setStates] = useState<SectionStateVariable[]>(section?.states || []);

  useEffect(() => {
    if (section) {
      setName(section.name || "");
      setRenderMode(section.renderMode || "server");
      setLoadStrategy(section.loadStrategy || "eager");
      setDescription(section.description || "");
      setUiPrompt(section.uiPrompt || "");
      setImages(section.images || []);
      setPrimaryImageUrl(section.primaryImageUrl);
      setLibraries(section.libraries || []);
      setStates(section.states || []);
    }
  }, [section]);

  const handleUpdate = (changes: Partial<PageSection>) => {
    if (!parentNode) return;
    const updated = sections.map((s) => (s.id === id ? { ...s, ...changes } : s));
    updateNode(nodeId, { data: { ...parentNode.data, sections: updated } });
  };

  const handleUpdateStates = (newStates: SectionStateVariable[]) => {
    setStates(newStates);
    handleUpdate({ states: newStates });
  };

  const handleDeleteSection = () => {
    if (!parentNode) return;
    deleteSectionCollapseState(nodeId, id);
    if (section && section.actions) {
      for (const act of section.actions) {
        const existingEdge = edges.find(
          (edge) => edge.source === nodeId && edge.sourceHandle === `events-${act.id}`
        );
        if (existingEdge) {
          const targetNode = nodes.find((n) => n.id === existingEdge.target);
          deleteEdge(existingEdge.id);
          if (targetNode && targetNode.type === "page_ref") {
            const remaining = edges.filter(
              (edge) => edge.target === targetNode.id && edge.id !== existingEdge.id
            );
            if (remaining.length === 0) deleteNode(targetNode.id);
          }
        }
      }
    }
    const updated = sections.filter((s) => s.id !== id);
    updateNode(nodeId, { data: { ...parentNode.data, sections: updated } });
    setActiveConfigItem(null);
  };

  const handleAddLibrary = (libName: string) => {
    const trimmed = libName.trim();
    if (!trimmed || libraries.includes(trimmed)) return;
    const next = [...libraries, trimmed];
    setLibraries(next);
    handleUpdate({ libraries: next });

    // Sync package types to canvas
    const targetId = connectedWebApp?.id || nodeId;
    syncPackageTypesToCanvas(targetId, [trimmed]);

    // Sync to package.json on disk
    syncPackageToDiskPackageJson({
      action: "add",
      name: trimmed,
      version: "latest",
      nodeType: "webApp",
    });
    toast.success(`Saved "${trimmed}" to package.json! Run 'pnpm i' to install.`);
  };

  const handleRemoveLibrary = (libName: string) => {
    const next = libraries.filter((l) => l !== libName);
    setLibraries(next);
    handleUpdate({ libraries: next });

    // Remove from package.json on disk
    syncPackageToDiskPackageJson({
      action: "remove",
      name: libName,
      nodeType: "webApp",
    });
  };

  const handleApplyPreset = (
    preset: SectionPreset,
    options?: {
      deletePreviousActions?: boolean;
      updateName?: boolean;
    }
  ) => {
    const shouldDeletePreviousActions = options?.deletePreviousActions ?? false;
    const shouldUpdateName = options?.updateName ?? true;

    const nextName = shouldUpdateName
      ? preset.label.replace(/[^a-zA-Z0-9]/g, "")
      : name;

    if (shouldUpdateName) {
      setName(nextName);
    }
    setRenderMode(preset.renderMode);
    setLoadStrategy(preset.loadStrategy);
    setDescription(preset.defaultDesc);
    setUiPrompt(preset.defaultUiPrompt);

    const mergedLibs = Array.from(new Set([...libraries, ...preset.libraries]));
    setLibraries(mergedLibs);

    // Sync all preset libraries to package.json on disk
    preset.libraries.forEach((lib) => {
      syncPackageToDiskPackageJson({
        action: "add",
        name: lib,
        version: "latest",
        nodeType: "webApp",
      });
    });

    const currentActions = section?.actions || [];

    // If deleting previous actions, clean up canvas edges/page_refs
    if (shouldDeletePreviousActions && currentActions.length > 0) {
      for (const act of currentActions) {
        const existingEdge = edges.find(
          (edge) => edge.source === nodeId && edge.sourceHandle === `events-${act.id}`
        );
        if (existingEdge) {
          const targetNode = nodes.find((n) => n.id === existingEdge.target);
          deleteEdge(existingEdge.id);
          if (targetNode && targetNode.type === "page_ref") {
            const remaining = edges.filter(
              (edge) => edge.target === targetNode.id && edge.id !== existingEdge.id
            );
            if (remaining.length === 0) deleteNode(targetNode.id);
          }
        }
      }
    }

    const newActions: UIEventItem[] = preset.defaultActions.map((a) => ({
      id: crypto.randomUUID(),
      name: a.name,
      event: a.event,
      requestBody: a.requestBody,
      requestBodyMode: a.requestBodyMode,
      queryParams: a.queryParams,
      description: a.description,
    }));

    const nextActions = shouldDeletePreviousActions
      ? newActions
      : [...currentActions, ...newActions];

    handleUpdate({
      name: nextName,
      renderMode: preset.renderMode,
      loadStrategy: preset.loadStrategy,
      description: preset.defaultDesc,
      uiPrompt: preset.defaultUiPrompt,
      libraries: mergedLibs,
      actions: nextActions,
    });

    // Synchronize package types to canvas
    const targetId = connectedWebApp?.id || nodeId;
    if (preset.libraries && preset.libraries.length > 0) {
      syncPackageTypesToCanvas(targetId, preset.libraries);
    }

    toast.success(`Applied "${preset.label}" preset`);
  };

  return {
    parentNode,
    section,
    sections,
    connectedWebApp,
    availablePackages,
    name,
    setName,
    renderMode,
    setRenderMode,
    loadStrategy,
    setLoadStrategy,
    description,
    setDescription,
    uiPrompt,
    setUiPrompt,
    images,
    setImages,
    primaryImageUrl,
    setPrimaryImageUrl,
    libraries,
    setLibraries,
    states,
    setStates,
    handleUpdateStates,
    handleUpdate,
    handleDeleteSection,
    handleAddLibrary,
    handleRemoveLibrary,
    handleApplyPreset,
  };
}
