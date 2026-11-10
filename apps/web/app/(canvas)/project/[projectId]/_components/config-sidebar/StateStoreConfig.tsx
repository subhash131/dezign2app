"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Badge } from "@workspace/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Database, Sliders, Zap, AlertCircle, AlertTriangle, GitMerge } from "lucide-react";
import { GlobalStoreField, GlobalStoreAction, StateStoreTestCase, StoreActionType } from "@workspace/canvas/types";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import {
  StorePreset,
  StoreIdentitySection,
  StoreFieldsSection,
  StoreDefaultManipulatorsSection,
  DefaultManipulatorKey,
  StoreActionsSection,
  StoreLiveTestPlayground,
} from "./state-store-config";
import { getSupportedActionsForType } from "../backend-nodes/graph-nodes/nodes/frontend/StateStoreNode";
import {
  getSuggestedReducerCodeForChannelType,
  getAvailableCustomTypes,
  resolveCustomType,
} from "../backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";

export interface StateStoreConfigProps {
  id: string;
  nodeId: string;
  className?: string;
}

function isStoreTab(val: string): val is "schema" | "playground" {
  return val === "schema" || val === "playground";
}

const StateStoreConfigContent: React.FC<
  StateStoreConfigProps & {
    node: NonNullable<ReturnType<typeof useBackendCanvasStore.getState>["nodes"][0]>;
  }
> = ({
  id,
  nodeId,
  className,
  node,
}) => {
  const targetNodeId = nodeId || id;
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  const [activeTab, setActiveTab] = useState<"schema" | "playground">(() => {
    if (activeConfigItem?.initialTab === "playground" || activeConfigItem?.initialTab === "test") {
      return "playground";
    }
    return "schema";
  });
  const [selectedFieldForTest, setSelectedFieldForTest] = useState<string | null>(
    activeConfigItem?.sectionId || null,
  );

  const fields: GlobalStoreField[] = useMemo(() => node.data.fields || [], [node.data.fields]);
  const actions: GlobalStoreAction[] = useMemo(() => node.data.actions || [], [node.data.actions]);
  const savedTestCases: StateStoreTestCase[] = useMemo(() => node.data.testCases || [], [node.data.testCases]);
  const disabledDefaultManipulators: string[] = useMemo(
    () => node.data.disabledDefaultManipulators || [],
    [node.data.disabledDefaultManipulators],
  );
  const deletedDefaultManipulators: string[] = useMemo(
    () => node.data.deletedDefaultManipulators || [],
    [node.data.deletedDefaultManipulators],
  );
  const availableCustomTypes = useMemo(() => getAvailableCustomTypes(allNodes), [allNodes]);

  const connectedPages = useMemo(() => {
    if (!targetNodeId) return [];
    const connectedPageIds = new Set(
      allEdges
        .filter((e) => e.source === targetNodeId || e.target === targetNodeId)
        .map((e) => (e.source === targetNodeId ? e.target : e.source))
    );
    return allNodes.filter((n) => n.type === "webPage" && connectedPageIds.has(n.id));
  }, [allNodes, allEdges, targetNodeId]);

  const handleApplyPreset = useCallback((preset: StorePreset) => {
    if (!node) return;
    const newFields: GlobalStoreField[] = preset.fields.map((f, idx) => ({
      id: `f-${Date.now()}-${idx}`,
      name: f.name,
      type: f.type,
      defaultValue: f.defaultValue,
    }));

    const newActions: GlobalStoreAction[] = preset.actions.map((a, idx) => {
      const matchedField = newFields.find((f) => f.name === a.targetFieldName);
      return {
        id: `act-${Date.now()}-${idx}`,
        name: a.name,
        targetFieldId: matchedField?.id,
        actionType: a.actionType,
        code: a.code,
        parameters: a.parameters,
      };
    });

    updateNode(node.id, {
      data: {
        ...node.data,
        label: `${preset.name}Store`,
        storeName: preset.name,
        description: preset.description,
        fields: newFields,
        actions: newActions,
      },
    });
    toast.success(`Applied ${preset.name} preset!`);
  }, [node, updateNode]);

  const handleAddField = useCallback(() => {
    if (!node) return;
    const existingNames = new Set(fields.map((f) => f.name.trim().toLowerCase()));
    let nextNum = fields.length + 1;
    while (existingNames.has(`field${nextNum}`.toLowerCase())) {
      nextNum++;
    }
    const newFieldId = `f-${Date.now()}`;
    const newFieldName = `field${nextNum}`;
    const newField: GlobalStoreField = {
      id: newFieldId,
      name: newFieldName,
      type: "string",
      defaultValue: "",
      reducer: `${newFieldName}_reducer`,
      actions: getSupportedActionsForType("string", false),
      customReducerCode: getSuggestedReducerCodeForChannelType("string", null, false),
    };
    updateNode(node.id, {
      data: {
        ...node.data,
        fields: [...fields, newField],
      },
    });
  }, [node, fields, updateNode]);

  const handleUpdateField = useCallback(
    (fieldId: string, patch: Partial<GlobalStoreField>) => {
      if (!node) return;
      const oldField = fields.find((f) => f.id === fieldId);
      let updatedActions = actions;

      if (patch.name && oldField && patch.name.trim() !== oldField.name.trim()) {
        const oldCap = oldField.name.charAt(0).toUpperCase() + oldField.name.slice(1);
        const newCap = patch.name.trim().charAt(0).toUpperCase() + patch.name.trim().slice(1);
        updatedActions = actions.map((a) => {
          if (a.targetFieldId === fieldId) {
            let updatedName = a.name;
            if (a.name === `set${oldCap}`) updatedName = `set${newCap}`;
            else if (a.name === `toggle${oldCap}`) updatedName = `toggle${newCap}`;
            else if (a.name === `append${oldCap}`) updatedName = `append${newCap}`;
            else if (a.name === `pop${oldCap}`) updatedName = `pop${newCap}`;
            else if (a.name === `remove${oldCap}`) updatedName = `remove${newCap}`;
            else if (a.name === `increment${oldCap}`) updatedName = `increment${newCap}`;
            else if (a.name === `decrement${oldCap}`) updatedName = `decrement${newCap}`;
            else if (a.name === `reset${oldCap}`) updatedName = `reset${newCap}`;
            return {
              ...a,
              name: updatedName,
              targetFieldName: patch.name?.trim(),
            };
          }
          return a;
        });
      }

      const updated = fields.map((f) => {
        if (f.id !== fieldId) return f;
        const res = { ...f, ...patch };
        const isArray = Boolean(
          res.isArray || res.type?.endsWith("[]") || res.type === "array",
        );
        const cleanBase = (res.type || "string").replace(/\[\]$/, "").trim();
        const availableCustomTypes = getAvailableCustomTypes(allNodes);
        const matchedCustom = resolveCustomType({
          availableTypes: availableCustomTypes,
          typeName: cleanBase,
          typeId: res.customTypeId,
        });

        if ((patch.type !== undefined || patch.isArray !== undefined) && !patch.actions) {
          res.actions = getSupportedActionsForType(res.type, isArray);
        }
        if (
          (patch.type !== undefined || patch.isArray !== undefined) &&
          patch.customReducerCode === undefined
        ) {
          res.customReducerCode = getSuggestedReducerCodeForChannelType(
            res.type,
            matchedCustom,
            isArray,
          );
        }
        if (patch.name && (!f.reducer || f.reducer === `${f.name}_reducer` || f.reducer.endsWith("_reducer"))) {
          res.reducer = `${patch.name.trim() || "state"}_reducer`;
        }
        return res;
      });
      updateNode(node.id, {
        data: {
          ...node.data,
          fields: updated,
          actions: updatedActions,
        },
      });
    },
    [node, fields, actions, allNodes, updateNode],
  );

  const handleSelectFieldAction = useCallback(
    (fieldId: string, actionType: StoreActionType | "none", selectedActionId?: string) => {
      if (!node) return;
      const targetField = fields.find((f) => f.id === fieldId);
      if (!targetField) return;

      const capitalized = targetField.name
        ? targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1)
        : "Field";

      // If "none", remove any specific action tied to this field
      if (actionType === "none") {
        const filteredActions = actions.filter((a) => a.targetFieldId !== fieldId && a.id !== selectedActionId);
        const handlesToRemove = [
          `setter-in-left-${fieldId}`,
          `setter-in-${fieldId}`,
          `setter-out-${fieldId}`,
          `append-in-left-${fieldId}`,
          `append-in-${fieldId}`,
          `append-out-${fieldId}`,
          `pop-in-left-${fieldId}`,
          `pop-in-${fieldId}`,
          `pop-out-${fieldId}`,
          `mutate-in-left-${fieldId}`,
          `mutate-out-${fieldId}`,
        ];
        allEdges
          .filter(
            (e) =>
              (e.source === node.id && handlesToRemove.includes(e.sourceHandle || "")) ||
              (e.target === node.id && handlesToRemove.includes(e.targetHandle || "")),
          )
          .forEach((e) => deleteEdge(e.id));

        updateNode(node.id, {
          data: {
            ...node.data,
            actions: filteredActions,
            fields: fields.map((f) =>
              f.id === fieldId ? { ...f, actionType: "none", actionId: undefined } : f,
            ),
          },
        });
        toast.info(`Action disabled for "${targetField.name}"`);
        return;
      }

      // Generate standard action name based on actionType
      let actionName = `set${capitalized}`;
      let description = `Sets ${targetField.name}`;
      let manipulatorType: "setter" | "append" | "pop" | undefined = undefined;

      if (actionType === "set") {
        actionName = `set${capitalized}`;
        description = `Sets ${targetField.name}`;
        manipulatorType = "setter";
      } else if (actionType === "toggle") {
        actionName = `toggle${capitalized}`;
        description = `Toggles ${targetField.name} boolean`;
      } else if (actionType === "append") {
        actionName = `append${capitalized}`;
        description = `Appends item to ${targetField.name}`;
        manipulatorType = "append";
      } else if (actionType === "pop") {
        actionName = `pop${capitalized}`;
        description = `Removes last item from ${targetField.name}`;
        manipulatorType = "pop";
      } else if (actionType === "remove") {
        actionName = `remove${capitalized}`;
        description = `Removes item from ${targetField.name}`;
      } else if (actionType === "increment") {
        actionName = `increment${capitalized}`;
        description = `Increments ${targetField.name}`;
      } else if (actionType === "reset") {
        actionName = `reset${capitalized}`;
        description = `Resets ${targetField.name} to default`;
      }

      // Check if action already exists for this field or has selectedActionId
      const existingActionIndex = actions.findIndex(
        (a) => (selectedActionId && a.id === selectedActionId) || a.targetFieldId === fieldId,
      );
      const existingAction = existingActionIndex >= 0 ? actions[existingActionIndex] : undefined;

      let updatedActions: GlobalStoreAction[];
      let targetActionId: string;

      if (existingAction) {
        targetActionId = existingAction.id;
        updatedActions = actions.map((a, idx) =>
          idx === existingActionIndex
            ? {
                ...a,
                name: actionName,
                actionType,
                targetFieldId: fieldId,
                targetFieldName: targetField.name,
                description,
                defaultManipulatorType: manipulatorType,
              }
            : a,
        );
      } else {
        targetActionId = `act-${Date.now()}`;
        const newAction: GlobalStoreAction = {
          id: targetActionId,
          name: actionName,
          actionType,
          targetFieldId: fieldId,
          targetFieldName: targetField.name,
          description,
          defaultManipulatorType: manipulatorType,
        };
        updatedActions = [...actions, newAction];
      }

      // Ensure this manipulator is not marked as disabled or deleted
      const nextDisabled = (node.data?.disabledDefaultManipulators || []).filter(
        (k: string) =>
          k !== `setter-${fieldId}` &&
          k !== `append-${fieldId}` &&
          k !== `pop-${fieldId}` &&
          k !== actionName,
      );
      const nextDeleted = (node.data?.deletedDefaultManipulators || []).filter(
        (k: string) =>
          k !== `setter-${fieldId}` &&
          k !== `append-${fieldId}` &&
          k !== `pop-${fieldId}` &&
          k !== actionName,
      );

      updateNode(node.id, {
        data: {
          ...node.data,
          actions: updatedActions,
          disabledDefaultManipulators: nextDisabled,
          deletedDefaultManipulators: nextDeleted,
          fields: fields.map((f) =>
            f.id === fieldId ? { ...f, actionType, actionId: targetActionId } : f,
          ),
        },
      });

      toast.success(`Selected action "${actionName}" for "${targetField.name}"`);
    },
    [node, fields, actions, allEdges, deleteEdge, updateNode],
  );

  const handleRemoveField = useCallback((fieldId: string) => {
    if (!node) return;
    const updatedFields = fields.filter((f) => f.id !== fieldId);
    const updatedActions = actions.filter((a) => a.targetFieldId !== fieldId);
    const fieldHandles = [
      `store-field-in-${fieldId}`,
      `store-field-out-${fieldId}`,
      `setter-in-left-${fieldId}`,
      `setter-in-${fieldId}`,
      `setter-out-${fieldId}`,
      `append-in-left-${fieldId}`,
      `append-in-${fieldId}`,
      `append-out-${fieldId}`,
      `pop-in-left-${fieldId}`,
      `pop-in-${fieldId}`,
      `pop-out-${fieldId}`,
      `mutate-in-left-${fieldId}`,
      `mutate-out-${fieldId}`,
    ];
    allEdges
      .filter(
        (e) =>
          (e.source === node.id && fieldHandles.includes(e.sourceHandle || "")) ||
          (e.target === node.id && fieldHandles.includes(e.targetHandle || "")),
      )
      .forEach((e) => deleteEdge(e.id));

    updateNode(node.id, {
      data: {
        ...node.data,
        fields: updatedFields,
        actions: updatedActions,
      },
    });
  }, [node, fields, actions, allEdges, deleteEdge, updateNode]);

  const handleAddAction = useCallback(() => {
    if (!node) return;
    const newAction: GlobalStoreAction = {
      id: `act-${Date.now()}`,
      name: `update${fields[0]?.name ? fields[0].name.charAt(0).toUpperCase() + fields[0].name.slice(1) : "State"}`,
      targetFieldId: fields[0]?.id,
      actionType: "set",
    };
    updateNode(node.id, {
      data: {
        ...node.data,
        actions: [...actions, newAction],
      },
    });
  }, [node, fields, actions, updateNode]);

  const handleUpdateAction = useCallback((actionId: string, patch: Partial<GlobalStoreAction>) => {
    if (!node) return;
    const updated = actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a));
    updateNode(node.id, {
      data: {
        ...node.data,
        actions: updated,
      },
    });
  }, [node, actions, updateNode]);

  const handleRemoveAction = useCallback((actionId: string) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...node.data,
        actions: actions.filter((a) => a.id !== actionId),
      },
    });
  }, [node, actions, updateNode]);

  const handleModifyDefaultManipulator = useCallback(
    (
      manipulatorKey: DefaultManipulatorKey,
      patch: Partial<GlobalStoreAction>,
    ) => {
      if (!node) return;
      const isPopulate = manipulatorKey === "populate";
      const isReset = manipulatorKey === "reset";
      const isSetter = manipulatorKey.startsWith("setter-");
      const isAppend = manipulatorKey.startsWith("append-");
      const isPop = manipulatorKey.startsWith("pop-");
      const targetFieldId = isSetter
        ? manipulatorKey.slice("setter-".length)
        : isAppend
        ? manipulatorKey.slice("append-".length)
        : isPop
        ? manipulatorKey.slice("pop-".length)
        : patch.targetFieldId;

      const existingIndex = actions.findIndex((a) => {
        if (a.defaultManipulatorType === manipulatorKey) return true;
        if (isPopulate) {
          return (
            a.defaultManipulatorType === "populate" ||
            a.actionType === "populate" ||
            a.name.toLowerCase() === "populate" ||
            a.name.toLowerCase() === "load"
          );
        }
        if (isReset) {
          return (
            a.defaultManipulatorType === "reset" ||
            a.actionType === "reset" ||
            a.name.toLowerCase() === "reset"
          );
        }
        if (isSetter) {
          const field = fields.find((f) => f.id === targetFieldId);
          const setterName = field ? `set${field.name.toLowerCase()}` : "";
          return (
            (a.defaultManipulatorType === "setter" && a.targetFieldId === targetFieldId) ||
            (Boolean(setterName) &&
              a.name.toLowerCase() === setterName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isAppend) {
          const field = fields.find((f) => f.id === targetFieldId);
          const appendName = field ? `append${field.name.toLowerCase()}` : "";
          return (
            (a.defaultManipulatorType === "append" && a.targetFieldId === targetFieldId) ||
            (Boolean(appendName) &&
              a.name.toLowerCase() === appendName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isPop) {
          const field = fields.find((f) => f.id === targetFieldId);
          const popName = field ? `pop${field.name.toLowerCase()}` : "";
          return (
            (a.defaultManipulatorType === "pop" && a.targetFieldId === targetFieldId) ||
            (Boolean(popName) &&
              a.name.toLowerCase() === popName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        return false;
      });

      const manipulatorType = isPopulate
        ? "populate"
        : isReset
        ? "reset"
        : isSetter
        ? "setter"
        : isAppend
        ? "append"
        : "pop";
      let updatedActions: GlobalStoreAction[];

      if (existingIndex >= 0) {
        updatedActions = actions.map((a, idx) =>
          idx === existingIndex
            ? {
                ...a,
                ...patch,
                defaultManipulatorType: manipulatorType,
              }
            : a,
        );
      } else {
        const fieldName = fields.find((f) => f.id === targetFieldId)?.name;
        const capitalizedField = fieldName ? fieldName.charAt(0).toUpperCase() + fieldName.slice(1) : "Field";
        const newAction: GlobalStoreAction = {
          id: `manipulator-${Date.now()}`,
          name:
            patch.name ||
            (isPopulate
              ? "populate"
              : isReset
              ? "reset"
              : isAppend
              ? `append${capitalizedField}`
              : isPop
              ? `pop${capitalizedField}`
              : `set${capitalizedField}`),
          actionType:
            patch.actionType ||
            (isSetter
              ? "set"
              : isAppend
              ? "append"
              : isPop
              ? "remove"
              : isPopulate
              ? "populate"
              : "reset"),
          targetFieldId,
          code: patch.code,
          parameters: patch.parameters,
          prompt: patch.prompt,
          description: patch.description,
          defaultManipulatorType: manipulatorType,
          ...patch,
        };
        updatedActions = [...actions, newAction];
      }

      updateNode(node.id, {
        data: {
          ...node.data,
          actions: updatedActions,
        },
      });
      toast.success(`Updated ${patch.name || manipulatorKey} manipulator!`);
    },
    [node, actions, fields, updateNode],
  );

  const handleRevertDefaultManipulator = useCallback(
    (manipulatorKey: DefaultManipulatorKey) => {
      if (!node) return;
      const isPopulate = manipulatorKey === "populate";
      const isReset = manipulatorKey === "reset";
      const isSetter = manipulatorKey.startsWith("setter-");
      const isAppend = manipulatorKey.startsWith("append-");
      const isPop = manipulatorKey.startsWith("pop-");
      const targetFieldId = isSetter
        ? manipulatorKey.slice("setter-".length)
        : isAppend
        ? manipulatorKey.slice("append-".length)
        : isPop
        ? manipulatorKey.slice("pop-".length)
        : undefined;

      const filteredActions = actions.filter((a) => {
        if (a.defaultManipulatorType === manipulatorKey) return false;
        if (isPopulate) {
          return !(
            a.defaultManipulatorType === "populate" ||
            a.actionType === "populate" ||
            a.name.toLowerCase() === "populate" ||
            a.name.toLowerCase() === "load"
          );
        }
        if (isReset) {
          return !(
            a.defaultManipulatorType === "reset" ||
            a.actionType === "reset" ||
            a.name.toLowerCase() === "reset"
          );
        }
        if (isSetter) {
          const field = fields.find((f) => f.id === targetFieldId);
          const setterName = field ? `set${field.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "setter" && a.targetFieldId === targetFieldId) ||
            (Boolean(setterName) &&
              a.name.toLowerCase() === setterName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isAppend) {
          const field = fields.find((f) => f.id === targetFieldId);
          const appendName = field ? `append${field.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "append" && a.targetFieldId === targetFieldId) ||
            (Boolean(appendName) &&
              a.name.toLowerCase() === appendName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isPop) {
          const field = fields.find((f) => f.id === targetFieldId);
          const popName = field ? `pop${field.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "pop" && a.targetFieldId === targetFieldId) ||
            (Boolean(popName) &&
              a.name.toLowerCase() === popName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        return true;
      });

      updateNode(node.id, {
        data: {
          ...node.data,
          actions: filteredActions,
        },
      });
      toast.success(`Reverted ${manipulatorKey} to built-in default`);
    },
    [node, actions, fields, updateNode],
  );

  const handleToggleDefaultManipulator = useCallback(
    (manipulatorKey: DefaultManipulatorKey, enabled: boolean) => {
      if (!node) return;
      const isPopulate = manipulatorKey === "populate";
      const isReset = manipulatorKey === "reset";
      const isSetter = manipulatorKey.startsWith("setter-");
      const isAppend = manipulatorKey.startsWith("append-");
      const isPop = manipulatorKey.startsWith("pop-");
      const targetFieldId = isSetter
        ? manipulatorKey.slice("setter-".length)
        : isAppend
        ? manipulatorKey.slice("append-".length)
        : isPop
        ? manipulatorKey.slice("pop-".length)
        : undefined;
      const targetField = fields.find((f) => f.id === targetFieldId);

      const currentDisabled = new Set(node.data?.disabledDefaultManipulators || []);
      if (enabled) {
        currentDisabled.delete(manipulatorKey);
        if (isPopulate) {
          currentDisabled.delete("populate");
          currentDisabled.delete("load");
        }
        if (isReset) currentDisabled.delete("reset");
        if (isSetter && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.delete(`set${cap}`);
        }
        if (isAppend && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.delete(`append${cap}`);
        }
        if (isPop && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.delete(`pop${cap}`);
        }
      } else {
        currentDisabled.add(manipulatorKey);
        if (isPopulate) {
          currentDisabled.add("populate");
          currentDisabled.add("load");
        }
        if (isReset) currentDisabled.add("reset");
        if (isSetter && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.add(`set${cap}`);
        }
        if (isAppend && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.add(`append${cap}`);
        }
        if (isPop && targetField) {
          const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
          currentDisabled.add(`pop${cap}`);
        }

        // Clean up connected canvas edges since disabled hides from node
        const handlesToRemove: string[] = [];
        if (isPopulate) {
          handlesToRemove.push("populate-in", "populate-out", "populate-in-left");
        } else if (isReset) {
          handlesToRemove.push("reset-in", "reset-out", "reset-in-left");
        } else if (isSetter && targetFieldId) {
          handlesToRemove.push(
            `setter-in-left-${targetFieldId}`,
            `setter-in-${targetFieldId}`,
            `setter-out-${targetFieldId}`,
            `mutate-in-left-${targetFieldId}`,
            `mutate-out-${targetFieldId}`,
          );
        } else if (isAppend && targetFieldId) {
          handlesToRemove.push(
            `append-in-left-${targetFieldId}`,
            `append-in-${targetFieldId}`,
            `append-out-${targetFieldId}`,
          );
        } else if (isPop && targetFieldId) {
          handlesToRemove.push(
            `pop-in-left-${targetFieldId}`,
            `pop-in-${targetFieldId}`,
            `pop-out-${targetFieldId}`,
          );
        }

        if (handlesToRemove.length > 0) {
          allEdges
            .filter(
              (e) =>
                (e.source === node.id && handlesToRemove.includes(e.sourceHandle || "")) ||
                (e.target === node.id && handlesToRemove.includes(e.targetHandle || "")),
            )
            .forEach((e) => deleteEdge(e.id));
        }
      }

      updateNode(node.id, {
        data: {
          ...node.data,
          disabledDefaultManipulators: Array.from(currentDisabled),
        },
      });

      const labelName = isPopulate
        ? "populate"
        : isReset
        ? "reset"
        : targetField?.name
        ? `set${targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1)}`
        : manipulatorKey;
      toast.success(
        enabled
          ? `Enabled manipulator "${labelName}"`
          : `Disabled manipulator "${labelName}" (hidden from node)`,
      );
    },
    [node, fields, allEdges, deleteEdge, updateNode],
  );

  const handleDeleteDefaultManipulator = useCallback(
    (manipulatorKey: DefaultManipulatorKey) => {
      if (!node) return;
      const isPopulate = manipulatorKey === "populate";
      const isReset = manipulatorKey === "reset";
      const isSetter = manipulatorKey.startsWith("setter-");
      const isAppend = manipulatorKey.startsWith("append-");
      const isPop = manipulatorKey.startsWith("pop-");
      const targetFieldId = isSetter
        ? manipulatorKey.slice("setter-".length)
        : isAppend
        ? manipulatorKey.slice("append-".length)
        : isPop
        ? manipulatorKey.slice("pop-".length)
        : undefined;
      const targetField = fields.find((f) => f.id === targetFieldId);

      // 1. Add to deletedDefaultManipulators
      const currentDeleted = new Set(node.data?.deletedDefaultManipulators || []);
      currentDeleted.add(manipulatorKey);
      if (isPopulate) {
        currentDeleted.add("populate");
        currentDeleted.add("load");
      }
      if (isReset) {
        currentDeleted.add("reset");
      }
      if (isSetter && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDeleted.add(`set${cap}`);
      }
      if (isAppend && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDeleted.add(`append${cap}`);
      }
      if (isPop && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDeleted.add(`pop${cap}`);
      }

      // Also clean from disabled if present
      const currentDisabled = new Set(node.data?.disabledDefaultManipulators || []);
      currentDisabled.delete(manipulatorKey);
      if (isPopulate) {
        currentDisabled.delete("populate");
        currentDisabled.delete("load");
      }
      if (isReset) currentDisabled.delete("reset");
      if (isSetter && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDisabled.delete(`set${cap}`);
      }
      if (isAppend && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDisabled.delete(`append${cap}`);
      }
      if (isPop && targetField) {
        const cap = targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1);
        currentDisabled.delete(`pop${cap}`);
      }

      // 2. Remove any custom action override in actions
      const filteredActions = actions.filter((a) => {
        if (a.defaultManipulatorType === manipulatorKey) return false;
        if (isPopulate) {
          return !(
            a.defaultManipulatorType === "populate" ||
            a.actionType === "populate" ||
            a.name.toLowerCase() === "populate" ||
            a.name.toLowerCase() === "load"
          );
        }
        if (isReset) {
          return !(
            a.defaultManipulatorType === "reset" ||
            a.actionType === "reset" ||
            a.name.toLowerCase() === "reset"
          );
        }
        if (isSetter) {
          const setterName = targetField ? `set${targetField.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "setter" && a.targetFieldId === targetFieldId) ||
            (Boolean(setterName) &&
              a.name.toLowerCase() === setterName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isAppend) {
          const appendName = targetField ? `append${targetField.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "append" && a.targetFieldId === targetFieldId) ||
            (Boolean(appendName) &&
              a.name.toLowerCase() === appendName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        if (isPop) {
          const popName = targetField ? `pop${targetField.name.toLowerCase()}` : "";
          return !(
            (a.defaultManipulatorType === "pop" && a.targetFieldId === targetFieldId) ||
            (Boolean(popName) &&
              a.name.toLowerCase() === popName &&
              (!a.targetFieldId || a.targetFieldId === targetFieldId))
          );
        }
        return true;
      });

      // 3. Clean up connected canvas edges for the deleted manipulator
      const handlesToRemove: string[] = [];
      if (isPopulate) {
        handlesToRemove.push("populate-in", "populate-out", "populate-in-left");
      } else if (isReset) {
        handlesToRemove.push("reset-in", "reset-out", "reset-in-left");
      } else if (isSetter && targetFieldId) {
        handlesToRemove.push(
          `setter-in-left-${targetFieldId}`,
          `setter-in-${targetFieldId}`,
          `setter-out-${targetFieldId}`,
          `mutate-in-left-${targetFieldId}`,
          `mutate-out-${targetFieldId}`,
        );
      } else if (isAppend && targetFieldId) {
        handlesToRemove.push(
          `append-in-left-${targetFieldId}`,
          `append-in-${targetFieldId}`,
          `append-out-${targetFieldId}`,
        );
      } else if (isPop && targetFieldId) {
        handlesToRemove.push(
          `pop-in-left-${targetFieldId}`,
          `pop-in-${targetFieldId}`,
          `pop-out-${targetFieldId}`,
        );
      }

      if (handlesToRemove.length > 0) {
        allEdges
          .filter(
            (e) =>
              (e.source === node.id && handlesToRemove.includes(e.sourceHandle || "")) ||
              (e.target === node.id && handlesToRemove.includes(e.targetHandle || "")),
          )
          .forEach((e) => deleteEdge(e.id));
      }

      updateNode(node.id, {
        data: {
          ...node.data,
          deletedDefaultManipulators: Array.from(currentDeleted),
          disabledDefaultManipulators: Array.from(currentDisabled),
          actions: filteredActions,
        },
      });

      const labelName = isPopulate
        ? "populate"
        : isReset
        ? "reset"
        : targetField?.name
        ? `set${targetField.name.charAt(0).toUpperCase() + targetField.name.slice(1)}`
        : manipulatorKey;
      toast.success(`Deleted default manipulator "${labelName}"`);
    },
    [node, actions, fields, allEdges, deleteEdge, updateNode],
  );

  const handleSaveTestCases = useCallback((tc: StateStoreTestCase[]) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...node.data,
        testCases: tc,
      },
    });
  }, [node, updateNode]);

  const handleUpdateStoreName = useCallback((name: string) => {
    if (!node) return;
    updateNode(node.id, { data: { ...node.data, storeName: name, label: name } });
  }, [node, updateNode]);

  const handleUpdateDescription = useCallback((desc: string) => {
    if (!node) return;
    updateNode(node.id, { data: { ...node.data, description: desc } });
  }, [node, updateNode]);

  const data = node.data;
  const storeName = data.storeName || data.label || "App";

  const rawBase = storeName.trim().replace(/[^a-zA-Z0-9_$]/g, "");
  const baseName = rawBase.charAt(0).toUpperCase() + rawBase.slice(1);
  const hookName = baseName.endsWith("Store") ? `use${baseName}` : `use${baseName}Store`;

  const currentStoreName = storeName.trim();
  const duplicateStoreNodes = useMemo(() => {
    const key = currentStoreName.toLowerCase();
    if (!key) return [];
    return allNodes.filter(
      (n) =>
        n.id !== node.id &&
        n.type === "state_store" &&
        (n.data?.storeName || n.data?.label || "App").trim().toLowerCase() === key,
    );
  }, [allNodes, node.id, currentStoreName]);
  const isDuplicateStoreName = duplicateStoreNodes.length > 0;

  const duplicateFieldNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fields) {
      const key = f.name?.trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const duplicates = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count > 1) duplicates.add(key);
    }
    return duplicates;
  }, [fields]);

  const duplicateActionNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of actions) {
      const key = a.name?.trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const duplicates = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count > 1) duplicates.add(key);
    }
    return duplicates;
  }, [actions]);

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-y-auto hide-scrollbar p-4 text-xs gap-4 select-none pb-60",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-muted text-foreground border border-border">
            <Database size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              State Store
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              {hookName}()
            </p>
          </div>
        </div>
      </div>

      {/* Validation Warnings / Error Alerts */}
      {isDuplicateStoreName && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/15 border border-destructive/40 text-destructive text-xs">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs">Duplicate App Store Name</span>
            <span className="text-[11px] text-destructive/90">
              Another App Store on this canvas is already named &quot;{storeName}&quot; (Node: {duplicateStoreNodes[0]?.data?.label || duplicateStoreNodes[0]?.id}). Each App Store must have a unique name.
            </span>
          </div>
        </div>
      )}

      {duplicateFieldNames.size > 0 && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/15 border border-destructive/40 text-destructive text-xs">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs">Duplicate State Field Names</span>
            <span className="text-[11px] text-destructive/90">
              {duplicateFieldNames.size} duplicate field {duplicateFieldNames.size === 1 ? "name" : "names"} detected ({Array.from(duplicateFieldNames).join(", ")}). Field names must be unique within this store.
            </span>
          </div>
        </div>
      )}

      {duplicateActionNames.size > 0 && (
        <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/15 border border-destructive/40 text-destructive text-xs">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs">Duplicate Store Action Names</span>
            <span className="text-[11px] text-destructive/90">
              {duplicateActionNames.size} duplicate action {duplicateActionNames.size === 1 ? "name" : "names"} detected ({Array.from(duplicateActionNames).join(", ")}). Each action name in this store must be unique.
            </span>
          </div>
        </div>
      )}

      {/* Main Tabs: Store & Logic vs. Live Test Area */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => {
          if (isStoreTab(val)) setActiveTab(val);
        }}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 w-full h-8 bg-muted p-0.5 rounded-lg border border-border">
          <TabsTrigger
            value="schema"
            className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Database size={13} className="text-foreground" />
            <span>Variables &amp; Reducers</span>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 rounded-full font-mono ml-1 font-semibold"
            >
              {fields.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="playground"
            className="text-xs font-medium data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Zap size={13} className="text-amber-500 dark:text-amber-400" />
            <span>Live Test Area</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-1" />
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Variables & Reducers (1 Reducer Architecture) */}
        <TabsContent value="schema" className="mt-4 space-y-4">
          <StoreIdentitySection
            storeName={storeName}
            description={data.description || ""}
            connectedPages={connectedPages}
            isDuplicateStoreName={isDuplicateStoreName}
            duplicateStoreMessage={
              isDuplicateStoreName
                ? `Another App Store is already named "${storeName}" (${duplicateStoreNodes[0]?.data?.label || duplicateStoreNodes[0]?.id}). Store names must be unique.`
                : undefined
            }
            onUpdateStoreName={handleUpdateStoreName}
            onUpdateDescription={handleUpdateDescription}
          />

          <StoreFieldsSection
            fields={fields}
            actions={actions}
            onAddField={handleAddField}
            onUpdateField={handleUpdateField}
            onRemoveField={handleRemoveField}
            onSelectFieldAction={handleSelectFieldAction}
            onOpenTestForField={(field) => {
              setSelectedFieldForTest(field.id);
              setActiveTab("playground");
            }}
          />
        </TabsContent>

        {/* TAB 2: Live Test Area (State Manipulator Playground & Test Cases) */}
        <TabsContent value="playground" className="mt-4 space-y-4">
          <StoreLiveTestPlayground
            fields={fields}
            actions={actions}
            savedTestCases={savedTestCases}
            onSaveTestCases={handleSaveTestCases}
            disabledDefaultManipulators={disabledDefaultManipulators}
            deletedDefaultManipulators={deletedDefaultManipulators}
            initialSelectedFieldId={selectedFieldForTest || activeConfigItem?.sectionId}
            availableCustomTypes={availableCustomTypes}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export const StateStoreConfig: React.FC<StateStoreConfigProps> = ({
  id,
  nodeId,
  className,
}) => {
  const targetNodeId = nodeId || id;
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === targetNodeId),
  );

  if (!node) return null;

  return (
    <StateStoreConfigContent
      id={id}
      nodeId={nodeId}
      className={className}
      node={node}
    />
  );
};

export default StateStoreConfig;
