"use client";

import React from "react";
import { BackendNode, RealtimeConnection, StoreActionType } from "@workspace/canvas/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Database, CheckCircle2, Zap, Sliders, Info, Sparkles, TableProperties } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { SmartPathInput } from "../pipeline-step-editor/SmartPathInput";
import { AvailablePath } from "../pipeline-step-editor/types";
import { toPascalCase } from "./types";
import { StoreCallPreviewCard } from "../state-store-config/StoreCallPreviewCard";

export interface RealtimeStateStoreSectionProps {
  id: string;
  nodeId: string;
  storeBinding?: RealtimeConnection["storeActionBinding"];
  isDerived: boolean;
  stateStoreNodes: BackendNode[];
  suggestedPaths: AvailablePath[];
  onUpdateStoreBinding: (binding?: RealtimeConnection["storeActionBinding"]) => void;
}

export const RealtimeStateStoreSection: React.FC<RealtimeStateStoreSectionProps> = ({
  id,
  nodeId,
  storeBinding,
  isDerived,
  stateStoreNodes,
  suggestedPaths,
  onUpdateStoreBinding,
}) => {
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const selectedStoreNode = stateStoreNodes.find(
    (n) => n.id === storeBinding?.storeNodeId,
  );
  const fields = selectedStoreNode?.data?.fields || [];
  const actions = selectedStoreNode?.data?.actions || [];
  const targetField = fields.find(
    (f) => f.id === storeBinding?.targetFieldId || f.name === storeBinding?.targetFieldName,
  );
  const selectedCustomAction = actions.find((a) => a.id === storeBinding?.actionId);
  const customActionParameters = selectedCustomAction?.parameters || [];

  const syncStoreEdge = (
    storeNodeId: string | undefined,
    targetHandle: string = "mutate-in-left",
    storeName?: string,
    actionDisplayName?: string,
  ) => {
    // 1. Remove existing store edge for this connection
    const existingEdges = edges.filter(
      (e) =>
        e.source === nodeId &&
        e.sourceHandle === `rtc-in-${id}` &&
        stateStoreNodes.some((sn) => sn.id === e.target),
    );
    existingEdges.forEach((e) => deleteEdge(e.id));

    // 2. Re-add edge if store is selected
    if (storeNodeId) {
      addEdge({
        id: `edge-rtc-store-${nodeId}-${id}-${storeNodeId}`,
        source: nodeId,
        target: storeNodeId,
        sourceHandle: `rtc-in-${id}`,
        targetHandle,
        type: "connection",
        data: {
          isStoreActionBinding: true,
          storeName: storeName || "Store",
          actionName: actionDisplayName || "action",
        },
      });
    }
  };

  const handleStoreChange = (storeId: string) => {
    if (storeId === "none" || !storeId) {
      syncStoreEdge(undefined);
      onUpdateStoreBinding(undefined);
      return;
    }

    const sn = stateStoreNodes.find((n) => n.id === storeId);
    if (!sn) return;
    const storeName = sn.data?.storeName || sn.data?.label || "App";
    const storeFields = sn.data?.fields || [];
    const storeActions = sn.data?.actions || [];

    let defaultActionId: string;
    let defaultActionName: string;
    let defaultActionType: StoreActionType;
    let defaultTargetFieldId: string | undefined = undefined;
    let defaultTargetFieldName: string | undefined = undefined;
    let targetHandle: string;

    if (storeFields.length > 0) {
      const firstF = storeFields[0]!;
      defaultActionId = `setter-${firstF.id}`;
      defaultActionName = `set${toPascalCase(firstF.name)}`;
      defaultActionType = "set";
      defaultTargetFieldId = firstF.id;
      defaultTargetFieldName = firstF.name;
      targetHandle = `setter-in-left-${firstF.id}`;
    } else if (storeActions.length > 0) {
      const firstA = storeActions[0]!;
      defaultActionId = firstA.id;
      defaultActionName = firstA.name;
      defaultActionType = firstA.actionType || "custom";
      targetHandle = `store-action-in-left-${firstA.id}`;
    } else {
      defaultActionId = "builtin-reset";
      defaultActionName = "reset";
      defaultActionType = "reset";
      targetHandle = "reset-in-left";
    }

    syncStoreEdge(storeId, targetHandle, storeName, defaultActionName);

    onUpdateStoreBinding({
      storeNodeId: storeId,
      storeName,
      actionId: defaultActionId,
      actionName: defaultActionName,
      actionType: defaultActionType,
      targetFieldId: defaultTargetFieldId,
      targetFieldName: defaultTargetFieldName,
      updateSource: "full_message",
    });
  };

  const handleActionChange = (actionKey: string) => {
    if (!selectedStoreNode || !storeBinding) return;
    const storeName = selectedStoreNode.data?.storeName || selectedStoreNode.data?.label || "App";
    let targetHandle = "mutate-in-left";
    let updated: NonNullable<RealtimeConnection["storeActionBinding"]>;

    if (actionKey === "builtin-reset") {
      targetHandle = "reset-in-left";
      updated = {
        ...storeBinding,
        actionId: "builtin-reset",
        actionName: "reset",
        actionType: "reset",
        targetFieldId: undefined,
        targetFieldName: undefined,
      };
    } else if (actionKey === "builtin-populate") {
      targetHandle = "populate-in-left";
      updated = {
        ...storeBinding,
        actionId: "builtin-populate",
        actionName: "populate",
        actionType: "populate",
        targetFieldId: undefined,
        targetFieldName: undefined,
        parameterMappings: storeBinding.parameterMappings || {},
      };
    } else if (actionKey.startsWith("setter-")) {
      const fieldId = actionKey.replace("setter-", "");
      targetHandle = `setter-in-left-${fieldId}`;
      const matchedField = fields.find((f) => f.id === fieldId);
      const fieldName = matchedField?.name || "field";
      const setterName = `set${toPascalCase(fieldName)}`;
      updated = {
        ...storeBinding,
        actionId: actionKey,
        actionName: setterName,
        actionType: "set",
        targetFieldId: fieldId,
        targetFieldName: fieldName,
      };
    } else {
      const matchedAct = actions.find((a) => a.id === actionKey);
      targetHandle = `store-action-in-left-${actionKey}`;
      updated = {
        ...storeBinding,
        actionId: actionKey,
        actionName: matchedAct?.name || "action",
        actionType: matchedAct?.actionType || "custom",
        targetFieldId: matchedAct?.targetFieldId,
        targetFieldName: undefined,
      };
    }

    syncStoreEdge(storeBinding.storeNodeId, targetHandle, storeName, updated.actionName);
    onUpdateStoreBinding(updated);
  };

  const isRealtimeUpdateSource = (val: string): val is "full_message" | "nested_property" | "static" =>
    val === "full_message" || val === "nested_property" || val === "static";

  const isPopulateAction =
    storeBinding?.actionId === "builtin-populate" ||
    storeBinding?.actionName === "populate" ||
    storeBinding?.actionType === "populate";

  const handleFieldMappingChange = (fieldName: string, path: string) => {
    if (!storeBinding) return;
    const cleanPath = path.trim();
    const currentMappings: Record<string, string> = { ...(storeBinding.parameterMappings || {}) };
    if (cleanPath) {
      currentMappings[fieldName] = cleanPath;
    } else {
      delete currentMappings[fieldName];
    }
    onUpdateStoreBinding({
      ...storeBinding,
      parameterMappings: currentMappings,
    });
  };

  const handleAutoMatchPopulate = () => {
    if (!storeBinding || fields.length === 0) return;
    const nextMappings: Record<string, string> = { ...(storeBinding.parameterMappings || {}) };
    fields.forEach((f) => {
      const fieldLower = f.name.toLowerCase();
      const match = suggestedPaths.find((p) => {
        const parts = p.path.split(".");
        const lastPart = parts[parts.length - 1]?.toLowerCase();
        return lastPart === fieldLower || p.path.toLowerCase() === fieldLower;
      });
      if (match) {
        nextMappings[f.name] = match.path;
      }
    });
    onUpdateStoreBinding({
      ...storeBinding,
      parameterMappings: nextMappings,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-indigo-500" />
          <Label className="text-xs font-semibold text-foreground">
            State Store Update &amp; Message Handler
          </Label>
        </div>
        {storeBinding && (
          <Badge
            variant="secondary"
            className="text-[10px] font-mono font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30"
          >
            {storeBinding.storeName}.{storeBinding.actionName}()
          </Badge>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-normal">
        Automatically update a reactive State Store whenever a real-time message or event is received over this connection.
      </p>

      {/* Target State Store dropdown */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Database size={10} />
          Target State Store
        </Label>
        <Select
          value={storeBinding?.storeNodeId || "none"}
          disabled={isDerived}
          onValueChange={handleStoreChange}
        >
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue placeholder="Select State Store to update..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs text-muted-foreground">
              None (No Store Mutation)
            </SelectItem>
            {stateStoreNodes.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                      s.data?.scope === "global"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-sky-500/15 text-sky-500",
                    )}
                  >
                    {s.data?.scope || "GLOBAL"}
                  </span>
                  <span className="font-semibold text-foreground">
                    {s.data?.storeName || s.data?.label || "Store"}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({(s.data?.fields || []).length} fields, {(s.data?.actions || []).length} actions)
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Action / Mutation Selector */}
      {selectedStoreNode && storeBinding && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Zap size={10} />
              Store Mutation / Action to Call
            </Label>
            <Select
              value={storeBinding.actionId || (fields.length > 0 ? `setter-${fields[0]!.id}` : "builtin-reset")}
              disabled={isDerived}
              onValueChange={handleActionChange}
            >
              <SelectTrigger className="h-8 text-xs bg-background font-mono">
                <SelectValue placeholder="Select mutation or action..." />
              </SelectTrigger>
              <SelectContent>
                {/* Field Setters */}
                {fields.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground">
                      Field Setters (Mutate State)
                    </SelectLabel>
                    {fields.map((f) => {
                      const setterName = `set${toPascalCase(f.name)}`;
                      return (
                        <SelectItem key={`setter-${f.id}`} value={`setter-${f.id}`} className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="font-semibold font-mono">{setterName}(value)</span>
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                              {f.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                )}

                {/* Schema Manipulator: Populate */}
                {fields.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                      Schema Manipulators
                    </SelectLabel>
                    <SelectItem value="builtin-populate" className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-semibold font-mono">populate(data)</span>
                        <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-sans">
                          Explicit Field Mapping
                        </Badge>
                      </div>
                    </SelectItem>
                  </SelectGroup>
                )}

                {/* Custom Actions */}
                {actions.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                      Custom Actions
                    </SelectLabel>
                    {actions.map((act) => (
                      <SelectItem key={act.id} value={act.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                          <span className="font-semibold font-mono">{act.name}()</span>
                          <Badge variant="secondary" className="text-[9px] py-0 px-1 uppercase font-mono">
                            {act.actionType || "action"}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}

                {/* Standard Manipulator: Reset */}
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-muted-foreground mt-1">
                    Reset
                  </SelectLabel>
                  <SelectItem value="builtin-reset" className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="font-semibold">reset()</span>
                      <span className="text-[10px] text-muted-foreground font-sans">
                        - Reset to default state
                      </span>
                    </div>
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Input Values & Argument Mapping */}
          <div className="flex flex-col gap-2.5 p-2.5 rounded-lg bg-background/60 border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sliders size={10} className="text-indigo-500" />
                Function Input &amp; Argument Mapping
              </span>
              {isPopulateAction ? (
                <Badge variant="outline" className="text-[9px] font-mono border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  Target: {fields.length} store fields
                </Badge>
              ) : targetField ? (
                <Badge variant="outline" className="text-[9px] font-mono">
                  Target: {targetField.name} ({targetField.type})
                </Badge>
              ) : null}
            </div>

            {/* Populate Field-by-Field Mapping View */}
            {isPopulateAction ? (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-emerald-500 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold font-mono">populate({`{ field1, field2, ... }`})</div>
                      <div className="text-[10px] text-muted-foreground font-sans">
                        Explicitly map incoming message properties to each store field.
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAutoMatchPopulate}
                    className="h-6 px-2 text-[10px] gap-1 shrink-0 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <Sparkles size={10} />
                    Auto-match by Name
                  </Button>
                </div>

                {/* Field-by-field Mapping List */}
                <div className="flex flex-col gap-2 p-2 rounded-lg border border-border/60 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                      <TableProperties size={12} className="text-emerald-500" />
                      Store Fields Schema Mapping ({fields.length})
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {Object.keys(storeBinding.parameterMappings || {}).length} of {fields.length} mapped
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 mt-0.5">
                    {fields.map((f) => {
                      const mappedPath = storeBinding.parameterMappings?.[f.name] || "";
                      return (
                        <div
                          key={f.id}
                          className="flex flex-col gap-1 p-2 rounded-md bg-background/80 border border-border/50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {f.name}
                              </span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                                {f.isArray ? `${f.type}[]` : f.type}
                              </Badge>
                            </div>
                            {mappedPath ? (
                              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                mapped
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                (unmapped)
                              </span>
                            )}
                          </div>

                          <SmartPathInput
                            value={mappedPath}
                            onChange={(path) => handleFieldMappingChange(f.name, path)}
                            suggestedPaths={suggestedPaths}
                            sourceKindLabel="Message"
                            rootVariableName="message"
                            placeholder={`Select or type path for ${f.name} (e.g. data.${f.name})`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : storeBinding.actionType === "reset" ? (
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 p-1.5 rounded bg-muted/30">
                <Info size={12} className="shrink-0 text-muted-foreground" />
                <span>The <code className="font-mono text-foreground font-semibold">reset()</code> function requires no arguments. It restores all store fields to their initial defaults.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {targetField && (
                  <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
                      <Zap size={11} className="text-indigo-500" />
                      <span>{storeBinding.actionName}(value)</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      mutates state.{targetField.name} ({targetField.type})
                    </span>
                  </div>
                )}

                {/* Multi-parameter Mapping for custom actions with multiple params */}
                {customActionParameters.length > 1 && (
                  <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border/50 bg-muted/20">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span>Action Parameters ({customActionParameters.length})</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        Map each parameter into {storeBinding.actionName}()
                      </span>
                    </Label>
                    <div className="flex flex-col gap-2">
                      {customActionParameters.map((param) => (
                        <div key={param.id} className="flex flex-col gap-1">
                          <Label className="text-[11px] font-mono flex items-center justify-between">
                            <span className="font-semibold">{param.name}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                              {param.type}
                            </Badge>
                          </Label>
                          <SmartPathInput
                            value={storeBinding.parameterMappings?.[param.name] || ""}
                            onChange={(p) => {
                              onUpdateStoreBinding({
                                ...storeBinding,
                                parameterMappings: {
                                  ...(storeBinding.parameterMappings || {}),
                                  [param.name]: p,
                                },
                              });
                            }}
                            suggestedPaths={suggestedPaths}
                            sourceKindLabel="Message"
                            rootVariableName="message"
                            placeholder={`Choose field or type path for ${param.name}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source Selector & Argument Value Extraction */}
                <div className="flex flex-col gap-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Argument Source
                  </Label>
                  <Select
                    value={storeBinding.updateSource || "full_message"}
                    disabled={isDerived}
                    onValueChange={(val) => {
                      if (isRealtimeUpdateSource(val)) {
                        onUpdateStoreBinding({
                          ...storeBinding,
                          updateSource: val,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_message" className="text-xs">
                        <span className="font-semibold">Full Message Payload</span>
                        <span className="text-muted-foreground font-mono text-[10px] ml-1.5">(parsed event.data)</span>
                      </SelectItem>
                      <SelectItem value="nested_property" className="text-xs">
                        <span className="font-semibold">Extract Property / Key</span>
                        <span className="text-muted-foreground font-mono text-[10px] ml-1.5">(message[key])</span>
                      </SelectItem>
                      <SelectItem value="static" className="text-xs">
                        <span className="font-semibold">Static Constant Value</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {storeBinding.updateSource === "nested_property" && (
                    <div className="flex flex-col gap-1 mt-1">
                      <Label className="text-[11px] font-medium flex items-center justify-between">
                        <span>Message Property Path</span>
                        <span className="text-[10px] text-muted-foreground font-normal">Pick property or type path</span>
                      </Label>
                      <SmartPathInput
                        value={storeBinding.valuePath || ""}
                        onChange={(path) => {
                          onUpdateStoreBinding({
                            ...storeBinding,
                            valuePath: path.trim() || undefined,
                          });
                        }}
                        suggestedPaths={suggestedPaths}
                        sourceKindLabel="Message"
                        rootVariableName="message"
                        placeholder="e.g. data, items, message, user"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {storeBinding.valuePath
                          ? `Extracts message.${storeBinding.valuePath} to pass into ${storeBinding.actionName}().`
                          : `Passes the full message directly into ${storeBinding.actionName}().`}
                      </span>
                    </div>
                  )}

                  {storeBinding.updateSource === "static" && (
                    <div className="flex flex-col gap-1 mt-1">
                      <Label className="text-[11px] font-medium">Static Constant Value</Label>
                      <Input
                        className="h-7 text-xs bg-background font-mono"
                        disabled={isDerived}
                        placeholder="e.g. true, 1, 'received'"
                        value={storeBinding.customValue || ""}
                        onChange={(e) =>
                          onUpdateStoreBinding({
                            ...storeBinding,
                            customValue: e.target.value,
                          })
                        }
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Hardcoded literal passed into <code className="font-mono">{storeBinding.actionName}()</code> whenever an event arrives.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live Compiled Store Function Call Preview */}
          <StoreCallPreviewCard
            storeName={storeBinding.storeName || "App"}
            actionName={storeBinding.actionName || "action"}
            actionType={storeBinding.actionType}
            targetFieldName={storeBinding.targetFieldName}
            updateSource={storeBinding.updateSource}
            valuePath={storeBinding.valuePath}
            customValue={storeBinding.customValue}
            parameterMappings={storeBinding.parameterMappings}
            sourceKind="message"
            subtitle="Executes reactively on real-time message received"
          />

          {/* Active Connection Badge Card */}
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 size={11} />
              <span className="text-[9px] font-bold uppercase tracking-wider">
                Live Stream → Store Bound
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-semibold bg-indigo-500/20 text-indigo-500 border border-indigo-500/30">
                {storeBinding.storeName}
              </Badge>
              <span className="text-muted-foreground text-xs">→</span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono border-indigo-500/40">
                <span className="font-bold text-indigo-500">{storeBinding.actionName}()</span>
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
