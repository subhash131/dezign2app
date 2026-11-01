"use client";

import React, { useMemo, useCallback, useState, useEffect } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { Trash2, AlertCircle } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  PageSection,
  SectionComponentBinding,
  ComponentElementBinding,
  ComponentBindingType,
  UIEventItem,
  JSONValue,
  StateRenderComponent,
  StateRenderConfig,
  ComponentPropMappings,
  PageStateObject,
} from "@workspace/canvas";
import {
  StateComponentPreview,
  ComponentSelector,
  ComponentPropMappingsSection,
  COMPONENT_OPTIONS,
  DEFAULT_COMPONENT_OPTION,
  ComponentOption,
} from "./web-page-state-config";
import {
  ComponentBreadcrumbsHeader,
  ComponentIdentityCard,
  ComponentEventActionCard,
  GenerateFormFromEndpointDialog,
  ComponentResponseMappingCard,
} from "./web-page-component-config";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { toast } from "sonner";
import { toPascalCase } from "@/lib/utils";
import { ensureNavItemTypeOnCanvas, ensureChatMessageTypeOnCanvas } from "../backend-nodes/graph-nodes/nodes/compute/TypesNode";
import { Badge } from "@workspace/ui/components/badge";
import { Sparkles } from "lucide-react";

export { toPascalCase };

export interface WebPageComponentConfigProps {
  id: string; // Component binding ID
  nodeId: string; // WebPageNode ID
  sectionId?: string; // Section ID
}

const toStateRenderComponent = (val: string): StateRenderComponent => {
  switch (val) {
    case "badge":
    case "card":
    case "button":
    case "switch":
    case "checkbox":
    case "progress":
    case "input":
    case "alert":
    case "avatar":
    case "skeleton":
    case "table":
    case "code":
    case "text":
    case "sidebar":
    case "topbar":
    case "chat":
      return val;
    default:
      return "input";
  }
};

const toValidVariant = (val?: string): NonNullable<StateRenderConfig["variant"]> => {
  if (val === "secondary" || val === "outline" || val === "destructive") {
    return val;
  }
  return "default";
};

const toClickAction = (actId?: string): NonNullable<StateRenderConfig["clickAction"]> => {
  if (actId) return "trigger_event";
  return "none";
};

export const WebPageComponentConfig: React.FC<WebPageComponentConfigProps> = ({
  id,
  nodeId,
  sectionId,
}) => {
  const parentNode = useBackendCanvasStore(
    useCallback((s) => s.nodes.find((n) => n.id === nodeId), [nodeId]),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  // All state store nodes for state binding dropdowns
  const stateStores = useBackendCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "state_store")),
  );

  const sections: PageSection[] = parentNode?.data?.sections || [];

  // Target section containing this component
  const targetSection =
    sections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
    sections.find((s) => s.id === sectionId) ||
    sections[0];

  const componentBinding: SectionComponentBinding | undefined =
    targetSection?.componentBindings?.find((c) => c.id === id);

  const displayLabel = useMemo(() => {
    const raw = componentBinding?.name || componentBinding?.label || "";
    return toPascalCase(raw) || "Component";
  }, [componentBinding?.name, componentBinding?.label]);

  // Helper to persist updates to component binding
  const handleUpdate = useCallback(
    (changes: Partial<SectionComponentBinding>) => {
      const currentParent = useBackendCanvasStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      if (!currentParent) return;

      const currentSections: PageSection[] = currentParent.data?.sections || [];
      const currentTargetSec =
        currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
        currentSections.find((s) => s.id === sectionId) ||
        currentSections[0];
      if (!currentTargetSec) return;

      // CRITICAL: component name must never be empty!
      if (changes.name !== undefined) {
        const pascal = toPascalCase(changes.name);
        if (!pascal) return;
      }

      const currentBindings = currentTargetSec.componentBindings || [];
      const updatedBindings = currentBindings.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...changes };
        if (changes.name !== undefined) {
          const pascal = toPascalCase(changes.name);
          next.name = pascal;
          if (changes.label !== undefined || !next.label) {
            next.label = pascal;
          }
        }
        return next;
      });

      const updatedSections = currentSections.map((sec) =>
        sec.id === currentTargetSec.id
          ? { ...sec, componentBindings: updatedBindings }
          : sec,
      );

      updateNode(nodeId, {
        data: {
          ...currentParent.data,
          sections: updatedSections,
        },
      });
    },
    [nodeId, id, sectionId, updateNode],
  );

  // Auto-normalize component name and label to PascalCase
  useEffect(() => {
    if (!componentBinding) return;
    const currentName = componentBinding.name || componentBinding.label;
    if (currentName) {
      const pascal = toPascalCase(currentName);
      if (pascal && (componentBinding.name !== pascal || componentBinding.label !== pascal)) {
        handleUpdate({ name: pascal, label: pascal });
      }
    }
  }, [componentBinding?.name, componentBinding?.label, handleUpdate]);

  // Available state variables across section and state stores
  const storeFields = useMemo(() => {
    return stateStores.flatMap((st) => {
      const sName = st.data?.label || st.data?.storeName || "Store";
      return (st.data?.fields || []).map((f) => ({
        id: `${st.id}-${f.name}`,
        storeId: st.id,
        storeName: sName,
        fieldName: f.name,
        type: f.type || "string",
        label: `${sName}.${f.name}`,
      }));
    });
  }, [stateStores]);

  const localStates = useMemo(() => {
    const list: Array<{ name: string; type?: string }> = [];
    (targetSection?.stateObjects || []).forEach((st) => {
      if (st.name && !st.storeName) {
        list.push({ name: st.name, type: st.type });
      }
    });
    (targetSection?.states || []).forEach((st) => {
      if (st.name && !list.some((existing) => existing.name === st.name)) {
        list.push({ name: st.name, type: st.type });
      }
    });
    return list;
  }, [targetSection]);

  const availableStateVars = useMemo(() => {
    const list: Array<{ name: string; type?: string; source: "store" | "local" }> = [];
    storeFields.forEach((f) => {
      list.push({ name: f.label, type: f.type, source: "store" });
    });
    localStates.forEach((s) => {
      list.push({ name: s.name, type: s.type, source: "local" });
    });
    return list;
  }, [storeFields, localStates]);

  const availableActions: UIEventItem[] = targetSection?.actions || [];

  const handleCreateAction = useCallback(
    (name?: string, eventType?: string) => {
      const currentParent = useBackendCanvasStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      if (!currentParent) return;

      const currentSections: PageSection[] = currentParent.data?.sections || [];
      const currentTargetSec =
        currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
        currentSections.find((s) => s.id === sectionId) ||
        currentSections[0];
      if (!currentTargetSec) return;

      const currentBinding = currentTargetSec.componentBindings?.find((c) => c.id === id);
      if (!currentBinding) return;

      const newActId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const actionName = name || `${currentBinding.name || currentBinding.label || "trigger"}Action`;

      const newAction: UIEventItem = {
        id: newActId,
        name: actionName,
        event: eventType || currentBinding.triggerEvent || "click",
        actionSteps: [],
      };

      const updatedActions = [...(currentTargetSec.actions || []), newAction];
      const updatedBindings = (currentTargetSec.componentBindings || []).map((c) =>
        c.id === id
          ? {
              ...c,
              actionId: newActId,
              actionName,
              propMappings: {
                ...(c.propMappings || {}),
                onChangeActionId: newActId,
              },
            }
          : c,
      );

      const updatedSections = currentSections.map((sec) =>
        sec.id === currentTargetSec.id
          ? { ...sec, actions: updatedActions, componentBindings: updatedBindings }
          : sec,
      );

      updateNode(nodeId, {
        data: {
          ...currentParent.data,
          sections: updatedSections,
        },
      });

      toast.success(`Created action "${actionName}"!`);
    },
    [id, nodeId, sectionId, updateNode],
  );

  const handleCreateComponentAction = useCallback(
    (name?: string, eventType?: string) => {
      handleCreateAction(name, eventType || "change");
    },
    [handleCreateAction],
  );

  const handleOpenActionFlow = useCallback(
    (actionId: string) => {
      setActiveConfigItem({
        type: "pageEvent",
        id: actionId,
        nodeId,
        sectionId: targetSection?.id,
        initialTab: "simulate",
      });
    },
    [setActiveConfigItem, nodeId, targetSection?.id],
  );

  const currentRenderComponent = toStateRenderComponent(
    componentBinding?.componentType || "input",
  );

  const selectedOption: ComponentOption = useMemo(() => {
    const found = COMPONENT_OPTIONS.find((opt) => opt.id === currentRenderComponent);
    return found || DEFAULT_COMPONENT_OPTION;
  }, [currentRenderComponent]);

  const selectedStore = useMemo(() => {
    if (!componentBinding?.valueStoreName) return undefined;
    return stateStores.find(
      (st) =>
        st.data?.label === componentBinding.valueStoreName ||
        st.data?.storeName === componentBinding.valueStoreName,
    );
  }, [componentBinding?.valueStoreName, stateStores]);

  const bindingStateType = useMemo(() => {
    if (!componentBinding) return undefined;
    if (componentBinding.valueStoreName && componentBinding.valueStateName) {
      const match = storeFields.find(
        (f) =>
          f.storeName === componentBinding.valueStoreName &&
          f.fieldName === componentBinding.valueStateName,
      );
      if (match) return match.type;
    }
    if (componentBinding.valueStateName) {
      const match = localStates.find((s) => s.name === componentBinding.valueStateName);
      if (match) return match.type;
    }
    return undefined;
  }, [componentBinding, storeFields, localStates]);

  const propMappings: ComponentPropMappings = useMemo(() => {
    return componentBinding?.propMappings || {};
  }, [componentBinding?.propMappings]);

  const handleUpdatePropMapping = useCallback(
    (changes: Partial<ComponentPropMappings>) => {
      if (!componentBinding) return;
      const currentProps = componentBinding.propMappings || {};
      const sanitizedChanges: Record<string, any> = {};
      for (const [k, v] of Object.entries(changes)) {
        if (v && typeof v === "object" && "target" in (v as any) && typeof (v as any).target === "object") {
          sanitizedChanges[k] = (v as any).target.value;
        } else {
          sanitizedChanges[k] = v;
        }
      }
      const updatedProps: ComponentPropMappings = {
        ...currentProps,
        ...sanitizedChanges,
      };

      const topLevelUpdates: Partial<SectionComponentBinding> = {
        propMappings: updatedProps,
      };

      if (changes.labelBinding !== undefined) {
        topLevelUpdates.label = changes.labelBinding;
      }
      if (changes.valueBinding !== undefined) {
        topLevelUpdates.valueStateName = changes.valueBinding;
      }
      if (changes.valueStoreName !== undefined) {
        topLevelUpdates.valueStoreName = changes.valueStoreName;
        topLevelUpdates.valueSourceType = changes.valueStoreName ? "store" : undefined;
      }
      if (changes.onChangeActionId) {
        topLevelUpdates.actionId = changes.onChangeActionId;
        const matched = availableActions.find((a) => a.id === changes.onChangeActionId);
        if (matched) {
          topLevelUpdates.actionName = matched.name;
        }
      }
      if (changes.disabledBinding) {
        topLevelUpdates.disabledStateName = changes.disabledBinding;
      }
      if (changes.disabledStoreName) {
        topLevelUpdates.disabledStoreName = changes.disabledStoreName;
      }

      handleUpdate(topLevelUpdates);
    },
    [componentBinding, availableActions, handleUpdate],
  );

  // Normalized multiple Shadcn UI elements within this component
  const currentElements: ComponentElementBinding[] = useMemo(() => {
    if (componentBinding?.elements && componentBinding.elements.length > 0) {
      return componentBinding.elements;
    }
    if (!componentBinding) return [];
    return [
      {
        id: `el-${componentBinding.id}`,
        name: componentBinding.name || "Element1",
        elementType: componentBinding.componentType || "input",
        label: componentBinding.label || componentBinding.name || "Element 1",
        variant: componentBinding.variant,
        valueStateName: componentBinding.valueStateName,
        valueStoreName: componentBinding.valueStoreName,
        valueSourceType: componentBinding.valueSourceType,
        actionId: componentBinding.actionId,
        actionName: componentBinding.actionName,
        triggerEvent: componentBinding.triggerEvent || "click",
        disabledStateName: componentBinding.disabledStateName,
        disabledStoreName: componentBinding.disabledStoreName,
        propMappings: componentBinding.propMappings,
      },
    ];
  }, [componentBinding]);

  const [activeElementId, setActiveElementId] = useState<string>("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  useEffect(() => {
    if (!currentElements.some((e) => e.id === activeElementId) && currentElements[0]) {
      setActiveElementId(currentElements[0].id);
    }
  }, [currentElements, activeElementId]);

  const handleUpdateElements = useCallback(
    (nextElements: ComponentElementBinding[]) => {
      const first = nextElements[0];
      handleUpdate({
        elements: nextElements,
        propMappings: first?.propMappings,
        componentType: first?.elementType || componentBinding?.componentType || "button",
        valueStateName: first?.valueStateName,
        valueStoreName: first?.valueStoreName,
        valueSourceType: first?.valueSourceType,
        actionId: first?.actionId,
        actionName: first?.actionName,
        triggerEvent: first?.triggerEvent,
      });
    },
    [handleUpdate, componentBinding?.componentType],
  );

  const handleAddElement = useCallback(
    (type: StateRenderComponent = "input") => {
      const elIndex = currentElements.length + 1;
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const newElName = `${typeLabel}${elIndex}`;
      const newElId = `el-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const newElement: ComponentElementBinding = {
        id: newElId,
        name: newElName,
        elementType: type,
        label: `${typeLabel} ${elIndex}`,
        placeholder: type === "input" ? `Enter ${newElName.toLowerCase()}...` : undefined,
        variant: type === "button" ? "default" : type === "badge" ? "secondary" : undefined,
        triggerEvent: type === "button" ? "click" : "change",
      };

      const updated = [...currentElements, newElement];
      handleUpdateElements(updated);
      setActiveElementId(newElId);
      toast.success(`Added ${typeLabel} component!`);
    },
    [currentElements, handleUpdateElements],
  );

  const handleUpdateElement = useCallback(
    (elId: string, changes: Partial<ComponentElementBinding>) => {
      const updated = currentElements.map((el) => {
        if (el.id !== elId) return el;
        const next = { ...el, ...changes };
        if (changes.name) {
          const pascal = toPascalCase(changes.name);
          if (pascal) {
            next.name = pascal;
            if (!next.label || changes.label !== undefined) next.label = pascal;
          }
        }
        return next;
      });
      handleUpdateElements(updated);
    },
    [currentElements, handleUpdateElements],
  );

  const handleChangeElementType = useCallback(
    (elId: string, type: StateRenderComponent) => {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      if (type === "chat") {
        handleUpdateElement(elId, {
          elementType: "chat",
          variant: "default",
          triggerEvent: "submit",
          valueStateName: "messages",
          propMappings: {
            chatTitle: "AI Assistant",
            chatPlaceholder: "Type a message...",
            chatMessagesBinding: "messages",
            chatInputBinding: "chatInput",
            chatAutoScroll: true,
            chatShowAvatars: true,
          },
        });
      } else {
        handleUpdateElement(elId, {
          elementType: type,
          variant: type === "button" ? "default" : type === "badge" ? "secondary" : undefined,
          triggerEvent: type === "button" ? "click" : "change",
        });
      }
      toast.success(`Changed to ${typeLabel}`);
    },
    [handleUpdateElement],
  );

  const handleDeleteEntireComponent = useCallback(() => {
    const currentParent = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === nodeId);
    if (!currentParent?.data || !targetSection) return;

    const currentBindings = targetSection.componentBindings || [];
    const updatedBindings = currentBindings.filter((c) => c.id !== id);
    const updatedSections = sections.map((sec) =>
      sec.id === targetSection.id
        ? { ...sec, componentBindings: updatedBindings }
        : sec,
    );

    updateNode(nodeId, {
      data: {
        ...currentParent.data,
        label: currentParent.data.label || "Web Page",
        sections: updatedSections,
      },
    });
    setActiveConfigItem(null);
    toast.success(`Removed <${displayLabel} /> component`);
  }, [targetSection, id, sections, updateNode, nodeId, setActiveConfigItem, displayLabel]);

  const handleDeleteElement = useCallback(
    (elId: string) => {
      if (currentElements.length <= 1) {
        handleDeleteEntireComponent();
        return;
      }
      const updated = currentElements.filter((el) => el.id !== elId);
      handleUpdateElements(updated);
      if (activeElementId === elId) {
        setActiveElementId(updated[0]?.id || "");
      }
      toast.success("Component removed");
    },
    [currentElements, activeElementId, handleUpdateElements, handleDeleteEntireComponent],
  );

  const handleMoveElement = useCallback(
    (index: number, direction: "up" | "down") => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= currentElements.length) return;
      const copy = [...currentElements];
      const temp = copy[index]!;
      copy[index] = copy[targetIndex]!;
      copy[targetIndex] = temp;
      handleUpdateElements(copy);
    },
    [currentElements, handleUpdateElements],
  );

  const activeElement: ComponentElementBinding = useMemo(() => {
    return (
      currentElements.find((e) => e.id === activeElementId) ||
      currentElements[0] || {
        id: `el-${componentBinding?.id || "default"}`,
        name: componentBinding?.name || "Component",
        elementType: componentBinding?.componentType || "input",
        label: componentBinding?.label || componentBinding?.name || "Component",
      }
    );
  }, [currentElements, activeElementId, componentBinding]);

  const activeRenderComponent = toStateRenderComponent(
    activeElement.elementType || "input",
  );

  const activeOption: ComponentOption = useMemo(() => {
    const found = COMPONENT_OPTIONS.find((opt) => opt.id === activeRenderComponent);
    return found || DEFAULT_COMPONENT_OPTION;
  }, [activeRenderComponent]);

  const activeSelectedStore = useMemo(() => {
    if (!activeElement.valueStoreName) return undefined;
    return stateStores.find(
      (st) =>
        st.data?.label === activeElement.valueStoreName ||
        st.data?.storeName === activeElement.valueStoreName,
    );
  }, [activeElement.valueStoreName, stateStores]);

  const activeBindingStateType = useMemo(() => {
    if (activeElement.valueStoreName && activeElement.valueStateName) {
      const match = storeFields.find(
        (f) =>
          f.storeName === activeElement.valueStoreName &&
          f.fieldName === activeElement.valueStateName,
      );
      if (match) return match.type;
    }
    if (activeElement.valueStateName) {
      const match = localStates.find((s) => s.name === activeElement.valueStateName);
      if (match) return match.type;
    }
    return undefined;
  }, [activeElement.valueStoreName, activeElement.valueStateName, storeFields, localStates]);

  const activePropMappings: ComponentPropMappings = useMemo(() => {
    return {
      ...(componentBinding?.propMappings || {}),
      ...(activeElement.propMappings || {}),
    };
  }, [componentBinding?.propMappings, activeElement.propMappings]);

  const handleUpdateActivePropMapping = useCallback(
    (changes: Partial<ComponentPropMappings>) => {
      const currentProps = {
        ...(componentBinding?.propMappings || {}),
        ...(activeElement.propMappings || {}),
      };
      const updatedProps: ComponentPropMappings = {
        ...currentProps,
        ...changes,
      };

      const elementChanges: Partial<ComponentElementBinding> = {
        propMappings: updatedProps,
      };

      if (changes.valueBinding !== undefined) {
        elementChanges.valueStateName = changes.valueBinding;
      }
      if (changes.valueStoreName !== undefined) {
        elementChanges.valueStoreName = changes.valueStoreName;
        elementChanges.valueSourceType = changes.valueStoreName ? "store" : undefined;
      }
      if (changes.onChangeActionId !== undefined) {
        elementChanges.actionId = changes.onChangeActionId;
        const matched = availableActions.find((a) => a.id === changes.onChangeActionId);
        if (matched) {
          elementChanges.actionName = matched.name;
        }
      }
      if (changes.disabledBinding !== undefined) {
        elementChanges.disabledStateName = changes.disabledBinding;
      }
      if (changes.disabledStoreName !== undefined) {
        elementChanges.disabledStoreName = changes.disabledStoreName;
      }

      handleUpdateElement(activeElement.id, elementChanges);
    },
    [activeElement, componentBinding?.propMappings, availableActions, handleUpdateElement],
  );

  const handleCreateActionForElement = useCallback(
    (elId: string, defaultName?: string, eventType?: string) => {
      const currentParent = useBackendCanvasStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      if (!currentParent) return;

      const currentSections: PageSection[] = currentParent.data?.sections || [];
      const currentTargetSec =
        currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
        currentSections.find((s) => s.id === sectionId) ||
        currentSections[0];
      if (!currentTargetSec) return;

      const targetEl = currentElements.find((e) => e.id === elId);
      const actionName = defaultName || `${targetEl?.name || "button"}Action`;
      const newActId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const newAction: UIEventItem = {
        id: newActId,
        name: actionName,
        event: eventType || targetEl?.triggerEvent || "click",
        actionSteps: [],
      };

      const isPageLoad = eventType === "pageLoad";
      const isSubmit = eventType === "submit";

      const updatedActions = [...(currentTargetSec.actions || []), newAction];
      const updatedElements = currentElements.map((el) => {
        if (el.id !== elId) return el;
        const currentPropMappings = { ...(el.propMappings || {}) };
        if (isPageLoad) {
          currentPropMappings.chatOnFetchActionId = newActId;
          currentPropMappings.chatOnFetchActionName = actionName;
          return {
            ...el,
            propMappings: currentPropMappings,
          };
        } else {
          if (isSubmit || el.elementType === "chat") {
            currentPropMappings.chatOnSendActionId = newActId;
            currentPropMappings.chatOnSendActionName = actionName;
          }
          return {
            ...el,
            actionId: newActId,
            actionName,
            triggerEvent: eventType || el.triggerEvent || "click",
            propMappings: currentPropMappings,
          };
        }
      });

      const updatedBindings = (currentTargetSec.componentBindings || []).map((c) =>
        c.id === id
          ? {
              ...c,
              elements: updatedElements,
              propMappings: {
                ...(c.propMappings || {}),
                ...(isPageLoad
                  ? {
                      chatOnFetchActionId: newActId,
                      chatOnFetchActionName: actionName,
                    }
                  : {
                      chatOnSendActionId: newActId,
                      chatOnSendActionName: actionName,
                    }),
              },
              actionId: isPageLoad ? c.actionId : (updatedElements[0]?.actionId || newActId),
              actionName: isPageLoad ? c.actionName : (updatedElements[0]?.actionName || actionName),
            }
          : c,
      );

      const updatedSections = currentSections.map((sec) =>
        sec.id === currentTargetSec.id
          ? { ...sec, actions: updatedActions, componentBindings: updatedBindings }
          : sec,
      );

      updateNode(nodeId, {
        data: {
          ...currentParent.data,
          sections: updatedSections,
        },
      });

      toast.success(`Created and wired action "${actionName}"!`);
    },
    [currentElements, nodeId, id, sectionId, updateNode],
  );

  const handleCreateActiveElementAction = useCallback(
    (name?: string, eventType?: string) => {
      handleCreateActionForElement(activeElement.id, name, eventType);
    },
    [activeElement.id, handleCreateActionForElement],
  );

  const handleUpdateChatAction = useCallback(
    (slot: "fetch" | "send", actId?: string, actName?: string) => {
      const currentParent = useBackendCanvasStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      if (!currentParent) return;

      const currentSections: PageSection[] = currentParent.data?.sections || [];
      const currentTargetSec =
        currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
        currentSections.find((s) => s.id === sectionId) ||
        currentSections[0];
      if (!currentTargetSec) return;

      const currentProps = {
        ...(componentBinding?.propMappings || {}),
        ...(activeElement.propMappings || {}),
      };

      const updatedProps: ComponentPropMappings =
        slot === "fetch"
          ? {
              ...currentProps,
              chatOnFetchActionId: actId,
              chatOnFetchActionName: actName,
            }
          : {
              ...currentProps,
              chatOnSendActionId: actId,
              chatOnSendActionName: actName,
            };

      const updatedElements = currentElements.map((el) => {
        if (el.id !== activeElement.id) return el;
        if (slot === "fetch") {
          return {
            ...el,
            propMappings: updatedProps,
          };
        } else {
          return {
            ...el,
            actionId: actId,
            actionName: actName,
            triggerEvent: "submit",
            propMappings: updatedProps,
          };
        }
      });

      const updatedBindings = (currentTargetSec.componentBindings || []).map((c) =>
        c.id === id
          ? {
              ...c,
              elements: updatedElements,
              propMappings: updatedProps,
              ...(slot === "send"
                ? {
                    actionId: actId,
                    actionName: actName,
                    triggerEvent: "submit",
                  }
                : {}),
            }
          : c,
      );

      const updatedSections = currentSections.map((sec) =>
        sec.id === currentTargetSec.id
          ? { ...sec, componentBindings: updatedBindings }
          : sec,
      );

      updateNode(nodeId, {
        data: {
          ...currentParent.data,
          sections: updatedSections,
        },
      });

      toast.success(
        slot === "fetch"
          ? actName
            ? `Bound history hydration to "${actName}"`
            : "Removed history hydration action"
          : actName
          ? `Bound prompt submission to "${actName}"`
          : "Removed prompt submission action",
      );
    },
    [nodeId, id, sectionId, activeElement, currentElements, componentBinding?.propMappings, updateNode],
  );

  const handleQuickWireChatActions = useCallback(() => {
    const currentParent = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === nodeId);
    if (!currentParent) return;

    const currentSections: PageSection[] = currentParent.data?.sections || [];
    const currentTargetSec =
      currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
      currentSections.find((s) => s.id === sectionId) ||
      currentSections[0];
    if (!currentTargetSec) return;

    const currentBinding = currentTargetSec.componentBindings?.find((c) => c.id === id);
    if (!currentBinding) return;

    const existingActions = [...(currentTargetSec.actions || [])];
    const newActionsToAdd: UIEventItem[] = [];

    // 1. Fetch History action (pageLoad)
    let fetchAct = existingActions.find(
      (a) => a.name === "fetchConversationHistory" || (a.event === "pageLoad" && a.name.toLowerCase().includes("chat")),
    );
    if (!fetchAct) {
      const anyPageLoad = existingActions.find((a) => a.name === "pageLoad" || a.event === "pageLoad");
      if (anyPageLoad) {
        fetchAct = anyPageLoad;
      } else {
        const fetchActId = `act-${Date.now()}-fetch-${Math.random().toString(36).substring(2, 5)}`;
        fetchAct = {
          id: fetchActId,
          name: "fetchConversationHistory",
          event: "pageLoad",
          actionSteps: [],
        };
        newActionsToAdd.push(fetchAct);
      }
    }

    // 2. Send Message action (submit)
    let sendAct = existingActions.find(
      (a) =>
        a.id === activeElement.actionId ||
        a.name === "sendMessage" ||
        a.name === "chatSubmit" ||
        (a.event === "submit" && a.name.toLowerCase().includes("message")),
    );
    if (!sendAct) {
      const sendActId = `act-${Date.now()}-send-${Math.random().toString(36).substring(2, 5)}`;
      sendAct = {
        id: sendActId,
        name: "sendMessage",
        event: "submit",
        actionSteps: [],
      };
      newActionsToAdd.push(sendAct);
    }

    const allActions = [...existingActions, ...newActionsToAdd];

    // 3. Realtime SSE streaming connection
    const existingConnections = currentParent.data?.realtimeConnections || [];
    let streamConn = existingConnections.find(
      (c: any) =>
        c.eventName === "chat_stream" ||
        c.eventName === "agent_stream" ||
        c.storeActionBinding?.targetFieldName === "messages",
    );
    let nextRealtimeConnections = [...existingConnections];
    if (!streamConn) {
      const newConnId = `rtc-chat-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      streamConn = {
        id: newConnId,
        protocol: "SSE",
        eventName: "chat_stream",
        streamUrl: "/api/chat/stream",
        description: "AI Assistant Response Stream",
        storeActionBinding: {
          storeNodeId: activeSelectedStore?.id,
          storeName: activeElement.valueStoreName || "ChatStore",
          targetFieldName: activeElement.valueStateName || "messages",
          actionType: "append",
          updateSource: "full_message",
        },
      };
      nextRealtimeConnections.push(streamConn);
    }

    const currentProps = {
      ...(componentBinding?.propMappings || {}),
      ...(activeElement.propMappings || {}),
    };

    const updatedProps: ComponentPropMappings = {
      ...currentProps,
      chatOnSendActionId: sendAct.id,
      chatOnSendActionName: sendAct.name,
      chatOnFetchActionId: fetchAct.id,
      chatOnFetchActionName: fetchAct.name,
      chatStreamConnectionId: streamConn.id,
      chatStreamProtocol: streamConn.protocol as any,
      chatStreamEventName: streamConn.eventName,
    };

    const updatedElements = currentElements.map((el) => {
      if (el.id !== activeElement.id) return el;
      return {
        ...el,
        actionId: sendAct!.id,
        actionName: sendAct!.name,
        triggerEvent: "submit",
        propMappings: updatedProps,
      };
    });

    const updatedBindings = (currentTargetSec.componentBindings || []).map((c) =>
      c.id === id
        ? {
            ...c,
            actionId: sendAct!.id,
            actionName: sendAct!.name,
            triggerEvent: "submit",
            elements: updatedElements,
            propMappings: updatedProps,
          }
        : c,
    );

    const updatedSections = currentSections.map((sec) =>
      sec.id === currentTargetSec.id
        ? { ...sec, actions: allActions, componentBindings: updatedBindings }
        : sec,
    );

    updateNode(nodeId, {
      data: {
        ...currentParent.data,
        sections: updatedSections,
        realtimeConnections: nextRealtimeConnections,
      },
    });

    toast.success(
      `Wired Complete Chat Pipeline: "${fetchAct.name}" (onMount), "${sendAct.name}" (onSend), & SSE Stream!`,
    );
  }, [nodeId, id, sectionId, activeElement, currentElements, componentBinding, activeSelectedStore, updateNode]);

  const handleQuickWireChatStreamConnection = useCallback(() => {
    const currentParent = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === nodeId);
    if (!currentParent) return;

    const existingConnections = currentParent.data?.realtimeConnections || [];
    let streamConn = existingConnections.find(
      (c: any) =>
        c.id === activePropMappings.chatStreamConnectionId ||
        c.eventName === "chat_stream" ||
        c.eventName === "agent_stream" ||
        c.storeActionBinding?.targetFieldName === "messages" ||
        c.description?.toLowerCase().includes("chat"),
    );

    let updatedConnections = [...existingConnections];

    if (!streamConn) {
      const newConnId = `rtc-chat-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
      streamConn = {
        id: newConnId,
        protocol: "SSE",
        eventName: "chat_stream",
        streamUrl: "/api/chat/stream",
        description: "AI Assistant Response Stream",
        storeActionBinding: {
          storeNodeId: activeSelectedStore?.id,
          storeName: activeElement.valueStoreName || "ChatStore",
          targetFieldName: activeElement.valueStateName || "messages",
          actionType: "append",
          updateSource: "full_message",
        },
      };
      updatedConnections.push(streamConn);
    }

    handleUpdateActivePropMapping({
      chatStreamConnectionId: streamConn.id,
      chatStreamProtocol: streamConn.protocol as any,
      chatStreamEventName: streamConn.eventName,
    });

    updateNode(nodeId, {
      data: {
        ...currentParent.data,
        realtimeConnections: updatedConnections,
      },
    });

    toast.success(`Wired Realtime SSE stream "${streamConn.eventName}" to messages!`);
  }, [nodeId, activePropMappings.chatStreamConnectionId, activeSelectedStore, activeElement, handleUpdateActivePropMapping, updateNode]);

  const handleUpdateChatStreamConnection = useCallback(
    (connId?: string) => {
      const currentParent = useBackendCanvasStore
        .getState()
        .nodes.find((n) => n.id === nodeId);
      const conn = (currentParent?.data?.realtimeConnections || []).find((c: any) => c.id === connId);
      handleUpdateActivePropMapping({
        chatStreamConnectionId: connId,
        chatStreamProtocol: conn?.protocol as any,
        chatStreamEventName: conn?.eventName,
      });
      toast.success(connId ? `Linked stream "${conn?.eventName || conn?.protocol || "stream"}"` : "Detached stream connection");
    },
    [nodeId, handleUpdateActivePropMapping],
  );

  const handleOpenRealtimeConnectionConfig = useCallback(
    (connId: string) => {
      setActiveConfigItem({
        type: "realtimeConnection",
        id: connId,
        nodeId,
      });
    },
    [setActiveConfigItem, nodeId],
  );

  const handleCreateNavStateVariable = useCallback(
    (preferredStoreId?: string) => {
      const storeState = useBackendCanvasStore.getState();
      const currentNodes = storeState.nodes;
      const currentStores = currentNodes.filter((n) => n.type === "state_store");

      let targetStore = preferredStoreId
        ? currentStores.find((s) => s.id === preferredStoreId)
        : currentStores[0];

      const defaultItems = [
        { id: "nav-1", name: "Dashboard", link: "/dashboard", icon: "LayoutDashboard" },
        { id: "nav-2", name: "Analytics", link: "/analytics", icon: "BarChart3" },
        { id: "nav-3", name: "Projects", link: "/projects", icon: "Folder" },
        { id: "nav-4", name: "Settings", link: "/settings", icon: "Settings" },
      ];

      const parentPos = parentNode?.position || { x: 100, y: 100 };
      const storePos = targetStore?.position || { x: parentPos.x + 380, y: parentPos.y };

      // Ensure TypesNode exists on canvas with typed NavItem interface
      const { typesNodeId, typeItem } = ensureNavItemTypeOnCanvas({
        x: storePos.x,
        y: Math.max(20, storePos.y - 260),
      });

      let storeIdToUse = targetStore?.id;
      let storeNameToUse = targetStore?.data?.label || targetStore?.data?.storeName || "AppStore";
      let navFieldId = `f-nav-${Date.now()}`;

      if (!targetStore) {
        const newStoreId = `store-${Date.now()}`;
        storeIdToUse = newStoreId;
        storeNameToUse = "AppStore";

        const newStoreNode = {
          id: newStoreId,
          type: "state_store" as const,
          position: { x: storePos.x, y: storePos.y },
          data: {
            label: "AppStore",
            storeName: "AppStore",
            description: "Global Application Navigation & State Store",
            fields: [
              {
                id: navFieldId,
                name: "navItems",
                type: "NavItem[]",
                isArray: true,
                defaultValue: defaultItems,
                reducer: "navItems_reducer",
                actions: ["set", "append", "pop", "remove", "reset"],
                description: "Sidebar navigation menu items",
              },
            ],
            actions: [],
          },
        };

        addNode(newStoreNode);
      } else {
        const existingFields = targetStore.data?.fields || [];
        const existingNavField = existingFields.find((f: any) => f.name === "navItems");

        if (!existingNavField) {
          const newField = {
            id: navFieldId,
            name: "navItems",
            type: "NavItem[]",
            isArray: true,
            defaultValue: defaultItems,
            reducer: "navItems_reducer",
            actions: ["set", "append", "pop", "remove", "reset"],
            description: "Sidebar navigation menu items",
          };
          updateNode(targetStore.id, {
            data: {
              ...targetStore.data,
              fields: [...existingFields, newField],
            },
          });
        } else {
          navFieldId = existingNavField.id;
          // Upgrade generic array type to typed NavItem[]
          const updatedFields = existingFields.map((f: any) => {
            if (f.name === "navItems") {
              return {
                ...f,
                type: "NavItem[]",
                isArray: true,
                defaultValue: f.defaultValue && Array.isArray(f.defaultValue) && f.defaultValue.length > 0
                  ? f.defaultValue
                  : defaultItems,
                reducer: f.reducer || "navItems_reducer",
                actions: f.actions || ["set", "append", "pop", "remove", "reset"],
              };
            }
            return f;
          });
          updateNode(targetStore.id, {
            data: {
              ...targetStore.data,
              fields: updatedFields,
            },
          });
        }
      }

      // Auto-wire type-reference edge between TypesNode and StateStoreNode
      if (typesNodeId && storeIdToUse && navFieldId) {
        const expectedSourceHandle = `type-out-${typeItem.id}`;
        const expectedTargetHandle = `store-field-in-${navFieldId}`;
        const edgeId = `edge-type-${typesNodeId}-${typeItem.id}-${storeIdToUse}-${navFieldId}`;
        const currentEdges = storeState.edges;
        const edgeExists = currentEdges.some(
          (e) =>
            e.source === typesNodeId &&
            e.target === storeIdToUse &&
            e.sourceHandle === expectedSourceHandle &&
            e.targetHandle === expectedTargetHandle,
        );
        if (!edgeExists) {
          storeState.addEdge({
            id: edgeId,
            source: typesNodeId,
            target: storeIdToUse,
            sourceHandle: expectedSourceHandle,
            targetHandle: expectedTargetHandle,
            type: "type-reference",
            data: {
              label: typeItem.name,
              isTypeReference: true,
              baseTypeName: typeItem.name,
            },
          });
        }
      }

      // Auto-add "navItems" StateStore variable to target section's stateObjects (Rendered Store State)
      if (storeIdToUse && parentNode?.id && navFieldId) {
        const freshParent = useBackendCanvasStore
          .getState()
          .nodes.find((n) => n.id === parentNode.id);

        if (freshParent) {
          const currentSections: PageSection[] = freshParent.data?.sections || [];
          const currentSec =
            currentSections.find((s) => s.id === targetSection?.id) ||
            currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
            currentSections[0];

          if (currentSec) {
            const currentStates = currentSec.stateObjects || [];
            const exists = currentStates.some(
              (s) => s.name === "navItems" || (s.storeId === storeIdToUse && s.fieldId === navFieldId),
            );

            if (!exists) {
              const navStateObj: PageStateObject = {
                id: `state-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${navFieldId}`,
                name: "navItems",
                type: "NavItem[]",
                defaultValue: defaultItems,
                storeId: storeIdToUse,
                storeName: storeNameToUse,
                fieldId: navFieldId,
                renderConfig: {
                  enabled: true,
                  component: activeRenderComponent === "topbar" ? "topbar" : "sidebar",
                },
              };

              const updatedSections = currentSections.map((sec) =>
                sec.id === currentSec.id
                  ? {
                      ...sec,
                      stateObjects: [...currentStates, navStateObj],
                    }
                  : sec,
              );

              updateNode(parentNode.id, {
                data: {
                  ...freshParent.data,
                  sections: updatedSections,
                },
              });
            }
          }
        }
      }

      handleUpdateActivePropMapping({
        sidebarNavMode: "dynamic",
        sidebarNavBinding: "navItems",
        sidebarNavStoreId: storeIdToUse,
        sidebarNavStoreName: storeNameToUse,
        topbarNavMode: "dynamic",
        topbarNavBinding: "navItems",
        topbarNavStoreId: storeIdToUse,
        topbarNavStoreName: storeNameToUse,
        valueBinding: "navItems",
        valueStoreName: storeNameToUse,
        valueStoreId: storeIdToUse,
        valueMode: "store_var",
      });

      toast.success(`Provisioned NavItem[] type and bound "navItems" state in ${storeNameToUse}!`);
    },
    [parentNode, addNode, updateNode, handleUpdateActivePropMapping, activeRenderComponent],
  );

  const handleCreateChatMessageStateVariable = useCallback(
    (preferredStoreId?: string) => {
      const storeState = useBackendCanvasStore.getState();
      const currentNodes = storeState.nodes;
      const currentStores = currentNodes.filter((n) => n.type === "state_store");

      let targetStore = preferredStoreId
        ? currentStores.find((s) => s.id === preferredStoreId)
        : currentStores[0];

      const defaultMessages = [
        { id: "msg-1", role: "assistant", content: "Hello! How can I assist you today?" },
      ];

      const parentPos = parentNode?.position || { x: 100, y: 100 };
      const storePos = targetStore?.position || { x: parentPos.x + 380, y: parentPos.y };

      // Ensure TypesNode exists on canvas with typed ChatMessage interface
      const { typesNodeId, typeItem } = ensureChatMessageTypeOnCanvas({
        x: storePos.x,
        y: Math.max(20, storePos.y - 260),
      });

      let storeIdToUse = targetStore?.id;
      let storeNameToUse = targetStore?.data?.label || targetStore?.data?.storeName || "ChatStore";
      let msgFieldId = `f-msg-${Date.now()}`;
      let inputFieldId = `f-input-${Date.now()}`;

      if (!targetStore) {
        const newStoreId = `store-${Date.now()}`;
        storeIdToUse = newStoreId;
        storeNameToUse = "ChatStore";

        const newStoreNode = {
          id: newStoreId,
          type: "state_store" as const,
          position: { x: storePos.x, y: storePos.y },
          data: {
            label: "ChatStore",
            storeName: "ChatStore",
            description: "State Store for AI Conversational Thread & Messages",
            fields: [
              {
                id: msgFieldId,
                name: "messages",
                type: "ChatMessage[]",
                isArray: true,
                defaultValue: defaultMessages,
                reducer: "messages_reducer",
                actions: ["set", "append", "pop", "remove", "reset"],
                description: "Conversation message history for AI chat thread",
              },
              {
                id: inputFieldId,
                name: "chatInput",
                type: "string",
                isArray: false,
                defaultValue: "",
                reducer: "chatInput_reducer",
                actions: ["set", "reset"],
                description: "Current message draft input for AI chat thread",
              },
            ],
            actions: [],
          },
        };

        addNode(newStoreNode);
      } else {
        const existingFields = targetStore.data?.fields || [];
        const existingMsgField = existingFields.find((f: any) => f.name === "messages");
        const existingInputField = existingFields.find((f: any) => f.name === "chatInput");

        let fieldsToUpdate = [...existingFields];

        if (!existingMsgField) {
          fieldsToUpdate.push({
            id: msgFieldId,
            name: "messages",
            type: "ChatMessage[]",
            isArray: true,
            defaultValue: defaultMessages,
            reducer: "messages_reducer",
            actions: ["set", "append", "pop", "remove", "reset"],
            description: "Conversation message history for AI chat thread",
          });
        } else {
          msgFieldId = existingMsgField.id;
          fieldsToUpdate = fieldsToUpdate.map((f: any) => {
            if (f.name === "messages") {
              return {
                ...f,
                type: "ChatMessage[]",
                isArray: true,
                defaultValue:
                  f.defaultValue && Array.isArray(f.defaultValue) && f.defaultValue.length > 0
                    ? f.defaultValue
                    : defaultMessages,
                reducer: f.reducer || "messages_reducer",
                actions: f.actions || ["set", "append", "pop", "remove", "reset"],
              };
            }
            return f;
          });
        }

        if (!existingInputField) {
          fieldsToUpdate.push({
            id: inputFieldId,
            name: "chatInput",
            type: "string",
            isArray: false,
            defaultValue: "",
            reducer: "chatInput_reducer",
            actions: ["set", "reset"],
            description: "Current message draft input for AI chat thread",
          });
        }

        updateNode(targetStore.id, {
          data: {
            ...targetStore.data,
            fields: fieldsToUpdate,
          },
        });
      }

      // Auto-wire type-reference edge between TypesNode and StateStoreNode
      if (typesNodeId && storeIdToUse && msgFieldId) {
        const expectedSourceHandle = `type-out-${typeItem.id}`;
        const expectedTargetHandle = `store-field-in-${msgFieldId}`;
        const edgeId = `edge-type-${typesNodeId}-${typeItem.id}-${storeIdToUse}-${msgFieldId}`;
        const currentEdges = storeState.edges;
        const edgeExists = currentEdges.some(
          (e) =>
            e.source === typesNodeId &&
            e.target === storeIdToUse &&
            e.sourceHandle === expectedSourceHandle &&
            e.targetHandle === expectedTargetHandle,
        );
        if (!edgeExists) {
          storeState.addEdge({
            id: edgeId,
            source: typesNodeId,
            target: storeIdToUse,
            sourceHandle: expectedSourceHandle,
            targetHandle: expectedTargetHandle,
            type: "type-reference",
            data: {
              label: typeItem.name,
              isTypeReference: true,
              baseTypeName: typeItem.name,
            },
          });
        }
      }

      // Auto-wire edge between StateStore and WebPageNode if not already connected
      if (storeIdToUse && parentNode?.id) {
        const currentEdges = storeState.edges;
        const webPageEdgeExists = currentEdges.some(
          (e) =>
            (e.source === storeIdToUse && e.target === parentNode.id) ||
            (e.source === parentNode.id && e.target === storeIdToUse),
        );
        if (!webPageEdgeExists) {
          storeState.addEdge({
            id: `edge-store-${storeIdToUse}-${parentNode.id}`,
            source: storeIdToUse,
            target: parentNode.id,
            type: "connection",
          });
        }
      }

      // Auto-add "messages" StateStore variable to target section's stateObjects (Rendered Store State)
      if (storeIdToUse && parentNode?.id) {
        const freshParent = useBackendCanvasStore
          .getState()
          .nodes.find((n) => n.id === parentNode.id);

        if (freshParent) {
          const currentSections: PageSection[] = freshParent.data?.sections || [];
          const currentSec =
            currentSections.find((s) => s.id === targetSection?.id) ||
            currentSections.find((s) => (s.componentBindings || []).some((c) => c.id === id)) ||
            currentSections[0];

          if (currentSec) {
            const currentStates = currentSec.stateObjects || [];
            const exists = currentStates.some(
              (s) => s.name === "messages" || (s.storeId === storeIdToUse && s.fieldId === msgFieldId),
            );

            if (!exists) {
              const chatStateObj: PageStateObject = {
                id: `state-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${msgFieldId}`,
                name: "messages",
                type: "ChatMessage[]",
                defaultValue: defaultMessages,
                storeId: storeIdToUse,
                storeName: storeNameToUse,
                fieldId: msgFieldId,
                renderConfig: {
                  enabled: true,
                  component: "chat",
                },
              };

              const updatedSections = currentSections.map((sec) =>
                sec.id === currentSec.id
                  ? {
                      ...sec,
                      stateObjects: [...currentStates, chatStateObj],
                    }
                  : sec,
              );

              updateNode(parentNode.id, {
                data: {
                  ...freshParent.data,
                  sections: updatedSections,
                },
              });
            }
          }
        }
      }

      handleUpdateActivePropMapping({
        chatMessagesBinding: "messages",
        chatMessagesStoreId: storeIdToUse,
        chatMessagesStoreName: storeNameToUse,
        chatInputBinding: "chatInput",
        chatInputStoreId: storeIdToUse,
        chatInputStoreName: storeNameToUse,
        valueBinding: "messages",
        valueStoreName: storeNameToUse,
        valueStoreId: storeIdToUse,
        valueMode: "store_var",
      });

      toast.success(`Provisioned ChatMessage[] and bound "messages" in ${storeNameToUse}!`);
    },
    [parentNode, addNode, updateNode, handleUpdateActivePropMapping],
  );


  if (!parentNode || !targetSection || !componentBinding) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-3">
        <AlertCircle className="w-8 h-8 text-amber-500" />
        <div className="text-sm font-medium text-foreground">Component Binding Not Found</div>
        <p className="text-xs">
          The selected UI component could not be found in this section.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveConfigItem(null)}
          className="mt-2"
        >
          Close
        </Button>
      </div>
    );
  }

  const targetNavBinding =
    activePropMappings?.topbarNavBinding ||
    activePropMappings?.sidebarNavBinding ||
    activePropMappings?.valueBinding ||
    componentBinding?.valueStateName;

  const boundStateObj = targetSection?.stateObjects?.find(
    (s) => s.name === targetNavBinding || s.name === componentBinding?.valueStateName,
  );
  const storeField = activeSelectedStore?.data?.fields?.find(
    (f: any) => f.name === targetNavBinding || f.name === componentBinding?.valueStateName,
  );
  const sampleValue: JSONValue | undefined = boundStateObj?.defaultValue ?? storeField?.defaultValue;

  const stateName = componentBinding.valueStateName || displayLabel || "value";

  const formattedPreviewValue = String(
    sampleValue !== undefined && sampleValue !== null
      ? typeof sampleValue === "object"
        ? JSON.stringify(sampleValue)
        : sampleValue
      : componentBinding.valueStateName || displayLabel,
  );

  return (
    <div className="flex flex-col gap-5 font-sans text-foreground pb-12">
      {/* 1. Breadcrumbs & Header Banner */}
      <ComponentBreadcrumbsHeader
        pageLabel={parentNode.data?.label || "Page"}
        sectionId={targetSection.id}
        sectionName={targetSection.name}
        displayLabel={displayLabel}
        nodeId={nodeId}
        onNavigateBack={() =>
          setActiveConfigItem({
            type: "pageSection",
            id: targetSection.id,
            nodeId,
          })
        }
        onNavigateToPage={() =>
          setActiveConfigItem({
            type: "webPage",
            id: nodeId,
            nodeId,
          })
        }
        onNavigateToSection={() =>
          setActiveConfigItem({
            type: "pageSection",
            id: targetSection.id,
            nodeId,
          })
        }
        onDelete={handleDeleteEntireComponent}
      />

      {/* 2. Component Identity & Naming */}
      <ComponentIdentityCard
        componentId={componentBinding.id}
        name={componentBinding.name}
        label={componentBinding.label}
        displayLabel={displayLabel}
        description={componentBinding.description}
        onUpdate={handleUpdate}
      />

      {/* 2.5 Quick Auto-Generate / Sync from Endpoint */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/[0.06] border border-purple-500/20">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400">
            <Sparkles size={15} />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">Sync with Endpoint Contract</div>
            <div className="text-[11px] text-muted-foreground">
              Auto-populate fields and Zustand state variables from an API schema
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setGenerateDialogOpen(true)}
          className="h-7 text-xs font-medium border-purple-500/30 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 cursor-pointer shrink-0 ml-2"
        >
          <Sparkles size={11} className="mr-1.5" />
          Auto-Generate Form
        </Button>
      </div>

      {/* 3. Live Component Preview Sandbox */}
      <StateComponentPreview
        currentComponent={activeRenderComponent}
        currentVariant={toValidVariant(activeElement.variant || componentBinding.variant)}
        currentClickAction={toClickAction(activeElement.actionId || componentBinding.actionId)}
        displayLabel={displayLabel}
        customLabel={activeElement.label || activeElement.name || displayLabel}
        formattedPreviewValue={formattedPreviewValue}
        sampleValue={sampleValue}
        propMappings={activePropMappings}
        stateName={activeElement.valueStateName || stateName}
        copyToastMessage={`Copied ${stateName} to clipboard!`}
        targetActionId={activeElement.actionId || componentBinding.actionId}
        elements={currentElements}
        activeElementId={activeElement.id}
        onSelectElement={setActiveElementId}
      />

      {/* 4. Select Shadcn Component (Supports Multiple Components, Adding, and Type Switching) */}
      <ComponentSelector
        elements={currentElements}
        activeElementId={activeElement.id}
        onSelectActiveElement={setActiveElementId}
        onAddComponent={handleAddElement}
        onChangeComponentType={handleChangeElementType}
        onDeleteElement={handleDeleteElement}
        stateType={activeBindingStateType}
        currentComponent={activeRenderComponent}
        selectedOption={activeOption}
      />

      <Separator className="bg-border/50" />

      {/* 5. Component Prop Mappings Section for Active Component */}
      <ComponentPropMappingsSection
        currentComponent={activeRenderComponent}
        selectedOption={activeOption}
        displayLabel={activeElement.label || activeElement.name || displayLabel}
        stateName={activeElement.valueStateName || activeElement.label || stateName}
        stateType={activeBindingStateType}
        storeName={activeElement.valueStoreName}
        storeId={activeSelectedStore?.id}
        availableActions={availableActions}
        availableStateVars={availableStateVars}
        stateStoreNodes={stateStores}
        propMappings={activePropMappings}
        onUpdatePropMapping={handleUpdateActivePropMapping}
        onOpenEventConfig={handleOpenActionFlow}
        onCreateAction={handleCreateActiveElementAction}
        onCreateNavStateVariable={handleCreateNavStateVariable}
        onCreateChatMessageStateVariable={handleCreateChatMessageStateVariable}
        onQuickWireChatActions={handleQuickWireChatActions}
      />

      <Separator className="bg-border/50" />

      {/* 6. Event & Action Trigger Binding for Active Component */}
      <ComponentEventActionCard
        elementLabel={activeElement.label || activeElement.name || displayLabel}
        elementType={activeElement.elementType || activeOption.id || "component"}
        triggerEvent={activeElement.triggerEvent || (activeElement.elementType === "button" ? "click" : "change")}
        actionId={activeElement.actionId}
        actionName={activeElement.actionName}
        availableActions={availableActions}
        onUpdate={(changes) => handleUpdateElement(activeElement.id, changes)}
        onCreateAction={handleCreateActiveElementAction}
        onOpenActionFlow={handleOpenActionFlow}
        chatOnFetchActionId={activePropMappings.chatOnFetchActionId}
        chatOnFetchActionName={activePropMappings.chatOnFetchActionName}
        chatOnSendActionId={activePropMappings.chatOnSendActionId || activeElement.actionId}
        chatOnSendActionName={activePropMappings.chatOnSendActionName || activeElement.actionName}
        onUpdateChatAction={handleUpdateChatAction}
        onQuickWireChatActions={handleQuickWireChatActions}
        realtimeConnections={parentNode.data?.realtimeConnections || []}
        chatStreamConnectionId={activePropMappings.chatStreamConnectionId}
        onUpdateChatStreamConnection={handleUpdateChatStreamConnection}
        onQuickWireChatStreamConnection={handleQuickWireChatStreamConnection}
        onOpenRealtimeConnectionConfig={handleOpenRealtimeConnectionConfig}
      />

      <Separator className="bg-border/50" />

      {/* 6.5 API Response & State Store Mapping */}
      {/* <ComponentResponseMappingCard
        nodeId={nodeId}
        sectionId={targetSection.id}
        componentBinding={componentBinding}
        activeElement={activeElement}
        availableActions={availableActions}
        stateStores={stateStores}
        onUpdateComponent={handleUpdate}
        onUpdateElements={handleUpdateElements}
      /> */}


      {/* 7. Danger Zone - Delete Entire Component */}
      <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-destructive">Danger Zone</span>
            <span className="text-[11px] text-muted-foreground">
              Permanently delete &lt;<span className="font-mono font-medium text-foreground">{displayLabel}</span> /&gt; from this section.
            </span>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeleteEntireComponent}
            className="h-7 text-xs font-medium gap-1.5 shrink-0 cursor-pointer"
          >
            <Trash2 size={12} />
            <span>Delete Component</span>
          </Button>
        </div>
      </div>

      {/* 7. Generate Form Dialog */}
      {generateDialogOpen && (
        <GenerateFormFromEndpointDialog
          open={generateDialogOpen}
          onOpenChange={setGenerateDialogOpen}
          nodeId={nodeId}
          sectionId={targetSection?.id}
          existingComponentId={componentBinding.id}
          onSuccess={() => {
            setGenerateDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};
