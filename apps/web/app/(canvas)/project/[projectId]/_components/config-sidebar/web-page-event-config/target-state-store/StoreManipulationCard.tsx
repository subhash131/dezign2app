"use client";

import React, { useState, useMemo } from "react";
import { BackendNode, Endpoint, Schema, StoreActionBinding, StoreActionType } from "@/types/canvas";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Database,
  Trash2,
  ChevronUp,
  ChevronDown,
  Zap,
} from "lucide-react";
import { StoreCallPreviewCard } from "../../state-store-config/StoreCallPreviewCard";
import { StoreSelector } from "./StoreSelector";
import { StoreActionSelector } from "./StoreActionSelector";
import { StorePopulateMapping } from "./StorePopulateMapping";
import { StoreArgumentMapping } from "./StoreArgumentMapping";
import { AvailablePath } from "../../pipeline-step-editor/types";
import { extractPathsFromObject } from "../../pipeline-step-editor/sourcePaths";
import { parseSchemaJson } from "@/lib/compiler/utils";
import { toPascalCase, isSourceKind, SourceKind } from "./types";
import { cn } from "@workspace/ui/lib/utils";

export interface StoreManipulationCardProps {
  index: number;
  totalCount: number;
  binding: StoreActionBinding;
  stateStoreNodes: BackendNode[];
  isEndpointConnected: boolean;
  connectedEndpointName?: string;
  connectedEndpoint?: Endpoint;
  eventRequestBody?: Schema;
  actionName?: string;
  onUpdateBinding: (updated: StoreActionBinding) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export const StoreManipulationCard: React.FC<StoreManipulationCardProps> = ({
  index,
  totalCount,
  binding,
  stateStoreNodes,
  isEndpointConnected,
  connectedEndpointName,
  connectedEndpoint,
  eventRequestBody,
  actionName = "action",
  onUpdateBinding,
  onRemove,
  onMoveUp,
  onMoveDown,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const selectedStoreNode = useMemo(() => {
    return stateStoreNodes.find((n) => n.id === binding.storeNodeId);
  }, [stateStoreNodes, binding.storeNodeId]);

  const fields = useMemo(() => selectedStoreNode?.data?.fields || [], [selectedStoreNode?.data?.fields]);
  const customActions = useMemo(() => selectedStoreNode?.data?.actions || [], [selectedStoreNode?.data?.actions]);

  const handleStoreChange = (storeId: string) => {
    if (storeId === "none" || !storeId) {
      onUpdateBinding({
        ...binding,
        storeNodeId: undefined,
        storeName: undefined,
        actionId: undefined,
        actionName: undefined,
        actionType: undefined,
        targetFieldId: undefined,
        targetFieldName: undefined,
      });
      return;
    }

    const sn = stateStoreNodes.find((s) => s.id === storeId);
    if (!sn) return;

    const storeName = sn.data?.storeName || sn.data?.label || "App";
    const storeFields = sn.data?.fields || [];
    const storeActions = sn.data?.actions || [];

    let defaultActionId: string;
    let defaultActionName: string;
    let defaultActionType: StoreActionType;
    let defaultTargetFieldId: string | undefined = undefined;
    let defaultTargetFieldName: string | undefined = undefined;

    if (storeFields.length > 0) {
      const firstField = storeFields[0]!;
      defaultActionId = `setter-${firstField.id}`;
      defaultActionName = `set${toPascalCase(firstField.name)}`;
      defaultActionType = "set";
      defaultTargetFieldId = firstField.id;
      defaultTargetFieldName = firstField.name;
    } else if (storeActions.length > 0) {
      const firstAct = storeActions[0]!;
      defaultActionId = firstAct.id;
      defaultActionName = firstAct.name;
      defaultActionType = firstAct.actionType || "custom";
    } else {
      defaultActionId = "builtin-reset";
      defaultActionName = "reset";
      defaultActionType = "reset";
    }

    const defaultSource = isEndpointConnected ? "response" : "payload";

    onUpdateBinding({
      ...binding,
      storeNodeId: storeId,
      storeName,
      actionId: defaultActionId,
      actionName: defaultActionName,
      actionType: defaultActionType,
      targetFieldId: defaultTargetFieldId,
      targetFieldName: defaultTargetFieldName,
      updateSource: defaultSource,
    });
  };

  const handleActionChange = (actionKey: string) => {
    if (!selectedStoreNode) return;

    let updated: Partial<StoreActionBinding>;

    if (actionKey === "builtin-reset") {
      updated = {
        actionId: "builtin-reset",
        actionName: "reset",
        actionType: "reset",
        targetFieldId: undefined,
        targetFieldName: undefined,
        updateSource: "direct",
        valuePath: undefined,
      };
    } else if (actionKey === "builtin-populate") {
      updated = {
        actionId: "builtin-populate",
        actionName: "populate",
        actionType: "populate",
        targetFieldId: undefined,
        targetFieldName: undefined,
        updateSource: isEndpointConnected ? "response" : "payload",
        parameterMappings: binding.parameterMappings || {},
      };
    } else if (actionKey.startsWith("setter-")) {
      const fieldId = actionKey.replace("setter-", "");
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const setterName = `set${toPascalCase(fieldName)}`;
      updated = {
        actionId: actionKey,
        actionName: setterName,
        actionType: "set",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    } else if (actionKey.startsWith("append-")) {
      const fieldId = actionKey.replace("append-", "");
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const appendName = `append${toPascalCase(fieldName)}`;
      updated = {
        actionId: actionKey,
        actionName: appendName,
        actionType: "append",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    } else if (actionKey.startsWith("pop-")) {
      const fieldId = actionKey.replace("pop-", "");
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const popName = `pop${toPascalCase(fieldName)}`;
      updated = {
        actionId: actionKey,
        actionName: popName,
        actionType: "remove",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
        updateSource: "direct",
      };
    } else {
      // Custom action
      const matchedAct = customActions.find((a) => a.id === actionKey);
      updated = {
        actionId: actionKey,
        actionName: matchedAct?.name || "action",
        actionType: matchedAct?.actionType || "custom",
        targetFieldId: matchedAct?.targetFieldId,
        targetFieldName: undefined,
        updateSource: isEndpointConnected ? "response" : "payload",
      };
    }

    onUpdateBinding({
      ...binding,
      ...updated,
    });
  };

  const endpointResponsePaths = useMemo((): AvailablePath[] => {
    if (!connectedEndpoint?.responseBody) return [];
    const paths: AvailablePath[] = [];

    if (Array.isArray(connectedEndpoint.responseBody.fields) && connectedEndpoint.responseBody.fields.length > 0) {
      connectedEndpoint.responseBody.fields.forEach((f) => {
        if (f.name) {
          paths.push({
            path: f.name,
            type: f.type,
            description: f.description,
          });
        }
      });
    }

    if (connectedEndpoint.responseBody.rawJson) {
      const parsed = parseSchemaJson(connectedEndpoint.responseBody.rawJson);
      if (parsed && typeof parsed === "object") {
        const jsonPaths = extractPathsFromObject(parsed);
        jsonPaths.forEach((jp: AvailablePath) => {
          if (!paths.some((p) => p.path === jp.path)) {
            paths.push(jp);
          }
        });
      }
    }

    return paths;
  }, [connectedEndpoint?.responseBody]);

  const payloadPaths = useMemo((): AvailablePath[] => {
    if (!eventRequestBody) return [];
    const paths: AvailablePath[] = [];

    if (Array.isArray(eventRequestBody.fields) && eventRequestBody.fields.length > 0) {
      eventRequestBody.fields.forEach((f) => {
        if (f.name) {
          paths.push({
            path: f.name,
            type: f.type,
            description: f.description,
          });
        }
      });
    }

    if (eventRequestBody.rawJson) {
      const parsed = parseSchemaJson(eventRequestBody.rawJson);
      if (parsed && typeof parsed === "object") {
        const jsonPaths = extractPathsFromObject(parsed);
        jsonPaths.forEach((jp: AvailablePath) => {
          if (!paths.some((p) => p.path === jp.path)) {
            paths.push(jp);
          }
        });
      }
    }

    return paths;
  }, [eventRequestBody]);

  const selectedSourceKind = useMemo((): SourceKind => {
    if (binding.updateSource === "response" || binding.updateSource === "response_property") {
      return isEndpointConnected ? "endpoint" : "payload";
    }
    if (binding.updateSource === "payload") {
      return "payload";
    }
    if (binding.updateSource === "static") {
      return "static";
    }
    if (binding.updateSource === "direct") {
      return "direct";
    }
    return isEndpointConnected ? "endpoint" : "payload";
  }, [binding.updateSource, isEndpointConnected]);

  const currentSuggestedPaths = useMemo(() => {
    if (selectedSourceKind === "endpoint") return endpointResponsePaths;
    if (selectedSourceKind === "payload") return payloadPaths;
    return [];
  }, [selectedSourceKind, endpointResponsePaths, payloadPaths]);

  const handleSourceKindChange = (srcKind: string) => {
    if (!isSourceKind(srcKind)) return;
    if (srcKind === "endpoint") {
      onUpdateBinding({
        ...binding,
        updateSource: binding.valuePath ? "response_property" : "response",
      });
    } else if (srcKind === "payload") {
      onUpdateBinding({
        ...binding,
        updateSource: "payload",
      });
    } else if (srcKind === "static") {
      onUpdateBinding({
        ...binding,
        updateSource: "static",
        customValue: binding.customValue || "true",
      });
    } else if (srcKind === "direct") {
      onUpdateBinding({
        ...binding,
        updateSource: "direct",
      });
    }
  };

  const handlePathChange = (path: string) => {
    const cleanPath = path.trim();
    if (selectedSourceKind === "endpoint") {
      onUpdateBinding({
        ...binding,
        updateSource: cleanPath ? "response_property" : "response",
        valuePath: cleanPath || undefined,
      });
    } else if (selectedSourceKind === "payload") {
      onUpdateBinding({
        ...binding,
        updateSource: "payload",
        valuePath: cleanPath || undefined,
      });
    }
  };

  const handleCustomValueChange = (val: string) => {
    onUpdateBinding({
      ...binding,
      customValue: val,
    });
  };

  const handleFieldMappingChange = (fieldName: string, path: string) => {
    const cleanPath = path.trim();
    const currentMappings: Record<string, string> = { ...(binding.parameterMappings || {}) };
    if (cleanPath) {
      currentMappings[fieldName] = cleanPath;
    } else {
      delete currentMappings[fieldName];
    }
    onUpdateBinding({
      ...binding,
      parameterMappings: currentMappings,
    });
  };

  const handleAutoMatchPopulate = () => {
    if (fields.length === 0) return;
    const nextMappings: Record<string, string> = { ...(binding.parameterMappings || {}) };
    fields.forEach((f) => {
      const fieldLower = f.name.toLowerCase();
      const match = currentSuggestedPaths.find((p) => {
        const parts = p.path.split(".");
        const lastPart = parts[parts.length - 1]?.toLowerCase();
        return lastPart === fieldLower || p.path.toLowerCase() === fieldLower;
      });
      if (match) {
        nextMappings[f.name] = match.path;
      }
    });
    onUpdateBinding({
      ...binding,
      parameterMappings: nextMappings,
    });
  };

  const isResetAction = binding.actionType === "reset";
  const targetField = fields.find((f) => f.id === binding.targetFieldId || f.name === binding.targetFieldName);

  const selectedCustomAction = useMemo(() => {
    return customActions.find((a) => a.id === binding.actionId);
  }, [customActions, binding.actionId]);

  const customActionParameters = selectedCustomAction?.parameters || [];

  const isPopulateAction =
    binding.actionId === "builtin-populate" ||
    binding.actionName === "populate" ||
    binding.actionType === "populate";

  return (
    <div className="border border-border/70 rounded-xl overflow-hidden bg-card/60 transition-all hover:border-indigo-500/30">
      {/* Manipulation Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/30 border-b border-border/40 select-none">
        <div
          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 bg-background shrink-0"
          >
            #{index + 1}
          </Badge>
          <div className="flex items-center gap-1.5 truncate text-xs font-medium">
            <Database size={12} className="text-indigo-500 shrink-0" />
            <span className="font-semibold text-foreground truncate">
              {binding.storeName || "Unassigned Store"}
            </span>
            {binding.actionName && (
              <>
                <span className="text-muted-foreground text-[11px]">→</span>
                <span className="font-mono text-indigo-500 truncate">
                  {binding.actionName}()
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onMoveUp && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={index === 0}
              onClick={onMoveUp}
              title="Move up"
            >
              <ChevronUp size={13} />
            </Button>
          )}
          {onMoveDown && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              disabled={index === totalCount - 1}
              onClick={onMoveDown}
              title="Move down"
            >
              <ChevronDown size={13} />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            title="Remove manipulation"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Manipulation Body */}
      {isExpanded && (
        <div className="p-3.5 flex flex-col gap-3.5">
          {/* Store Selector */}
          <StoreSelector
            selectedStoreNodeId={binding.storeNodeId}
            stateStoreNodes={stateStoreNodes}
            onStoreChange={handleStoreChange}
          />

          {/* Action / Mutation Selector */}
          {selectedStoreNode && binding.storeNodeId && (
            <div className="flex flex-col gap-3 pt-1 border-t border-border/30">
              <StoreActionSelector
                actionId={binding.actionId}
                fields={fields}
                customActions={customActions}
                onActionChange={handleActionChange}
              />

              {/* Data Argument or Populate Mapping */}
              {isPopulateAction ? (
                <StorePopulateMapping
                  fields={fields}
                  parameterMappings={binding.parameterMappings}
                  isEndpointConnected={isEndpointConnected}
                  connectedEndpoint={connectedEndpoint}
                  connectedEndpointName={connectedEndpointName}
                  actionName={actionName}
                  selectedSourceKind={selectedSourceKind}
                  currentSuggestedPaths={currentSuggestedPaths}
                  onSourceKindChange={handleSourceKindChange}
                  onFieldMappingChange={handleFieldMappingChange}
                  onAutoMatchPopulate={handleAutoMatchPopulate}
                />
              ) : (
                <StoreArgumentMapping
                  isResetAction={isResetAction}
                  targetField={targetField}
                  customActionParameters={customActionParameters}
                  actionName={actionName}
                  storeName={binding.storeName}
                  boundActionName={binding.actionName}
                  parameterMappings={binding.parameterMappings}
                  onUpdateParameterMapping={(paramName, p) => {
                    onUpdateBinding({
                      ...binding,
                      parameterMappings: {
                        ...(binding.parameterMappings || {}),
                        [paramName]: p,
                      },
                    });
                  }}
                  selectedSourceKind={selectedSourceKind}
                  onSourceKindChange={handleSourceKindChange}
                  isEndpointConnected={isEndpointConnected}
                  connectedEndpoint={connectedEndpoint}
                  connectedEndpointName={connectedEndpointName}
                  valuePath={binding.valuePath}
                  onPathChange={handlePathChange}
                  customValue={binding.customValue}
                  onCustomValueChange={handleCustomValueChange}
                  currentSuggestedPaths={currentSuggestedPaths}
                />
              )}

              {/* Live Preview Card */}
              <StoreCallPreviewCard
                storeName={binding.storeName || "App"}
                actionName={binding.actionName || "action"}
                actionType={binding.actionType}
                targetFieldName={binding.targetFieldName}
                updateSource={binding.updateSource}
                valuePath={binding.valuePath}
                customValue={binding.customValue}
                parameterMappings={binding.parameterMappings}
                sourceKind={selectedSourceKind === "endpoint" ? "response" : "payload"}
                subtitle={
                  selectedSourceKind === "endpoint"
                    ? `Executes on ${connectedEndpointName || "API"} response`
                    : `Executes on ${actionName || "event"} trigger`
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
