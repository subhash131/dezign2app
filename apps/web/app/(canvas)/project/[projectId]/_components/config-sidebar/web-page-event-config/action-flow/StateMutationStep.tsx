import React from "react";
import { Sliders, Database, ArrowRight, Info, Sparkles } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { BackendNode, UIEventItem } from "@workspace/canvas";
import type {
  FrontendActionStepDraft,
  FrontendFieldSource,
  AvailablePath,
} from "./types";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { ActionFlowCombobox, type ComboboxOption } from "./ActionFlowCombobox";
import {
  getActionsForReducer,
  isValuelessAction,
  getActionMetadata,
  getChannelReducerName,
  type ReducerActionMeta,
} from "../../../backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";
import {
  ensureActionStateStoreConnection,
  cleanupActionStepEdge,
} from "./actionStepCanvasSync";

export interface StateMutationStepProps {
  draft: FrontendActionStepDraft;
  allSteps: FrontendActionStepDraft[];
  stepIndex: number;
  allNodes: BackendNode[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemPropSuggestions?: ComboboxOption[];
  onChange: (updated: FrontendActionStepDraft) => void;
}

export const StateMutationStep: React.FC<StateMutationStepProps> = ({
  draft,
  allSteps,
  stepIndex,
  allNodes,
  webPageNodeId,
  actionId,
  actionItem,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemPropSuggestions,
  onChange,
}) => {
  const stateStores = allNodes.filter((n) => n.type === "state_store");
  const priorSteps = allSteps.slice(0, stepIndex);

  const currentPageNode = React.useMemo(
    () => allNodes.find((n) => n.id === webPageNodeId),
    [allNodes, webPageNodeId],
  );

  const routeParamSuggestions = React.useMemo(() => {
    const params = currentPageNode?.data?.pathParams || [];
    return params.map((p) => ({
      value: p.name,
      label: p.name,
      type: p.type || "string",
    }));
  }, [currentPageNode?.data?.pathParams]);

  const queryParamSuggestions = React.useMemo(() => {
    const queries = currentPageNode?.data?.queryParams || [];
    return queries.map((q) => ({
      value: q.name,
      label: q.name,
      type: q.type || "string",
    }));
  }, [currentPageNode?.data?.queryParams]);

  const sectionStateVars = React.useMemo(() => {
    const sections = currentPageNode?.data?.sections || [];
    const list: Array<{ name: string; type?: string; storeName?: string; storeId?: string }> = [];
    sections.forEach((sec) => {
      (sec.stateObjects || []).forEach((st) => {
        if (st.name && !list.some((existing) => existing.name === st.name)) {
          list.push({ name: st.name, type: st.type, storeName: st.storeName, storeId: st.storeId });
        }
      });
      (sec.states || []).forEach((st) => {
        if (st.name && !list.some((existing) => existing.name === st.name)) {
          list.push({ name: st.name, type: st.type });
        }
      });
    });
    return list;
  }, [currentPageNode]);

  const selectedTargetStore = React.useMemo(() => {
    return stateStores.find((s) => s.id === draft.stateStoreNodeId);
  }, [stateStores, draft.stateStoreNodeId]);

  const selectedField = React.useMemo(() => {
    if (!selectedTargetStore) return undefined;
    const fields = selectedTargetStore.data?.fields || [];
    return (
      fields.find((f) => f.id === draft.stateTargetFieldId) ||
      fields.find((f) => f.name === draft.stateKey) ||
      fields[0]
    );
  }, [selectedTargetStore, draft.stateTargetFieldId, draft.stateKey]);

  const targetStoreFieldOptions = React.useMemo(() => {
    if (!selectedTargetStore) return [];
    return (selectedTargetStore.data?.fields || []).map((f) => ({
      value: f.name,
      label: `${f.name} (${f.type || "string"}${f.isArray ? "[]" : ""})`,
      type: f.type || "string",
    }));
  }, [selectedTargetStore]);

  const allStateVarOptions = React.useMemo(() => {
    return [
      ...stateStores.flatMap((s) =>
        (s.data?.fields || []).map((f) => ({
          value: f.name,
          label: `${s.data?.label || s.data?.storeName || "Store"}.${f.name}`,
          type: f.type || "string",
        })),
      ),
      ...sectionStateVars.map((v) => ({
        value: v.name,
        label: `Local: ${v.name}`,
        type: v.type || "string",
      })),
    ];
  }, [stateStores, sectionStateVars]);

  const targetKind = draft.stateTargetKind || "local";
  const stateKey = draft.stateKey || "";
  const currentAction = draft.stateActionName || draft.stateUpdateType || "set";
  const isValueless = isValuelessAction(currentAction);

  const availableFieldActions: ReducerActionMeta[] = React.useMemo(() => {
    if (targetKind !== "store" || !selectedField) {
      return [
        { action: "set", label: "set (value)", description: "Direct assignment", requiresValue: true },
        { action: "toggle", label: "toggle (no value)", description: "Inverts boolean", requiresValue: false },
        { action: "increment", label: "increment (value)", description: "Adds to number", requiresValue: true },
        { action: "decrement", label: "decrement (value)", description: "Subtracts from number", requiresValue: true },
        { action: "reset", label: "reset (no value)", description: "Resets to initial/default", requiresValue: false },
      ];
    }

    const actions = getActionsForReducer(
      selectedField.type,
      selectedField.reducer,
      selectedField.customReducerCode,
    );

    if (Array.isArray(selectedField.actions) && selectedField.actions.length > 0) {
      selectedField.actions.forEach((actName) => {
        if (!actions.some((a) => a.action === actName)) {
          actions.push(getActionMetadata(actName, selectedField.type));
        }
      });
    }

    return actions.length > 0
      ? actions
      : [
          { action: "set", label: "set (value)", description: "Direct assignment", requiresValue: true },
          { action: "reset", label: "reset (no value)", description: "Resets value", requiresValue: false },
        ];
  }, [targetKind, selectedField]);

  const handleScopeChange = (val: "local" | "store") => {
    if (val === "local") {
      if (draft.edgeId) {
        cleanupActionStepEdge(draft.edgeId);
      }
      onChange({
        ...draft,
        stateTargetKind: "local",
        stateStoreNodeId: undefined,
        stateTargetFieldId: undefined,
        edgeId: undefined,
        stateActionName: "set",
        stateUpdateType: "set",
      });
    } else {
      const firstStore = stateStores[0];
      const firstField = firstStore?.data?.fields?.[0];
      let edgeId = draft.edgeId;
      if (webPageNodeId && actionId && firstStore) {
        edgeId = ensureActionStateStoreConnection({
          webPageNodeId,
          actionId,
          stateStoreNodeId: firstStore.id,
          targetFieldId: firstField?.id,
          stepOrder: stepIndex + 1,
          previousEdgeId: draft.edgeId,
        });
      }
      onChange({
        ...draft,
        stateTargetKind: "store",
        stateStoreNodeId: firstStore?.id,
        stateTargetFieldId: firstField?.id,
        stateKey: firstField?.name || draft.stateKey,
        stateActionName: "set",
        stateUpdateType: "set",
        stateReducerName: firstField?.reducer || getChannelReducerName(firstField?.name),
        edgeId,
      });
    }
  };

  const handleStoreSelect = (val: string) => {
    const storeObj = stateStores.find((s) => s.id === val);
    const firstField = storeObj?.data?.fields?.[0];
    const targetFieldId = firstField?.id;
    let edgeId = draft.edgeId;

    if (webPageNodeId && actionId) {
      edgeId = ensureActionStateStoreConnection({
        webPageNodeId,
        actionId,
        stateStoreNodeId: val,
        targetFieldId,
        stepOrder: stepIndex + 1,
        previousEdgeId: draft.edgeId,
      });
    }

    const firstFieldActions = firstField
      ? getActionsForReducer(firstField.type, firstField.reducer, firstField.customReducerCode)
      : [];
    const defaultAction = firstFieldActions[0]?.action || "set";

    onChange({
      ...draft,
      stateStoreNodeId: val,
      stateTargetFieldId: targetFieldId,
      stateKey: firstField?.name || draft.stateKey,
      stateActionName: defaultAction,
      stateUpdateType: defaultAction,
      stateReducerName: firstField?.reducer || getChannelReducerName(firstField?.name),
      edgeId,
    });
  };

  const handleFieldSelect = (fieldName: string) => {
    const fieldObj = selectedTargetStore?.data?.fields?.find((f) => f.name === fieldName);
    const targetFieldId = fieldObj?.id;
    let edgeId = draft.edgeId;

    if (webPageNodeId && actionId && draft.stateStoreNodeId) {
      edgeId = ensureActionStateStoreConnection({
        webPageNodeId,
        actionId,
        stateStoreNodeId: draft.stateStoreNodeId,
        targetFieldId,
        stepOrder: stepIndex + 1,
        previousEdgeId: draft.edgeId,
      });
    }

    const fieldActions = fieldObj
      ? getActionsForReducer(fieldObj.type, fieldObj.reducer, fieldObj.customReducerCode)
      : [];
    const defaultAction = fieldActions.some((a) => a.action === draft.stateActionName)
      ? draft.stateActionName
      : (fieldActions[0]?.action || "set");

    onChange({
      ...draft,
      stateKey: fieldName,
      stateTargetFieldId: targetFieldId,
      stateActionName: defaultAction,
      stateUpdateType: defaultAction,
      stateReducerName: fieldObj?.reducer || getChannelReducerName(fieldObj?.name),
      edgeId,
    });
  };

  const handleActionSelect = (newAction: string) => {
    onChange({
      ...draft,
      stateActionName: newAction,
      stateUpdateType: newAction,
    });
  };

  const valueSource = draft.stateValueSource || {
    kind: "literal",
    value: "",
  };

  return (
    <div className="space-y-3 pt-1 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Target State Scope
          </Label>
          <Select
            value={targetKind}
            onValueChange={handleScopeChange}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Component / Page State</SelectItem>
              <SelectItem value="store">State Store Node</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {targetKind === "store" ? (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Select State Store
            </Label>
            <Select
              value={draft.stateStoreNodeId || ""}
              onValueChange={handleStoreSelect}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue placeholder="Choose store node" />
              </SelectTrigger>
              <SelectContent>
                {stateStores.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    ⚡ {st.data?.label || st.data?.storeName || st.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Local State Key / Property Name
            </Label>
            <ActionFlowCombobox
              value={stateKey}
              onChange={(val) =>
                onChange({ ...draft, stateKey: val })
              }
              placeholder="e.g. currentUser, selectedItem, isSubmitting"
              headerLabel="Suggested State Keys"
              options={sectionStateVars.map((v) => ({
                value: v.name,
                label: `${v.name} (${v.type || "state"})`,
                type: v.type || "string",
              }))}
            />
          </div>
        )}
      </div>

      {targetKind === "store" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground">
              Target Field in Store to Mutate
            </Label>
            {selectedField && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">
                  {selectedField.type || "string"}{selectedField.isArray ? "[]" : ""}
                </Badge>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-normal text-purple-400 bg-purple-500/10 border border-purple-500/20">
                  {selectedField.reducer || (selectedField.customReducerCode ? "custom" : "replace")}
                </Badge>
              </div>
            )}
          </div>
          <ActionFlowCombobox
            value={stateKey}
            onChange={handleFieldSelect}
            placeholder="e.g. searchResults, items, count"
            headerLabel="Fields in Selected Store"
            options={targetStoreFieldOptions}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            {targetKind === "store" ? "Reducer Action to Dispatch" : "Operation Type"}
          </Label>
          <Select
            value={currentAction}
            onValueChange={handleActionSelect}
          >
            <SelectTrigger className="h-7 text-xs bg-background font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableFieldActions.map((act) => (
                <SelectItem key={act.action} value={act.action} className="text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    {act.action !== "set" && act.action !== "default" && (
                      <span className="text-amber-500 text-[10px]">⚡</span>
                    )}
                    <span className="font-medium">{act.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isValueless && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Value Source
            </Label>
            <Select
              value={valueSource.kind}
              onValueChange={(
                val:
                  | "literal"
                  | "state_var"
                  | "user_input"
                  | "prev_response"
                  | "route_param"
                  | "query_param"
                  | "session_storage"
                  | "local_storage"
                  | "cookie"
                  | "item_prop"
                  | "realtime_payload",
              ) => {
                let nextSource: FrontendFieldSource;
                if (val === "literal") {
                  nextSource = { kind: "literal", value: "" };
                } else if (val === "realtime_payload") {
                  nextSource = {
                    kind: "realtime_payload",
                    fieldPath: incomingPaths?.[0]?.path || "",
                  };
                } else if (val === "state_var") {
                  nextSource = { kind: "state_var", stateKey: "" };
                } else if (val === "route_param") {
                  nextSource = {
                    kind: "route_param",
                    paramName: routeParamSuggestions[0]?.value || "",
                  };
                } else if (val === "query_param") {
                  nextSource = {
                    kind: "query_param",
                    paramName: queryParamSuggestions[0]?.value || "",
                  };
                } else if (val === "prev_response") {
                  nextSource = {
                    kind: "prev_response",
                    stepId: priorSteps[0]?.id || "",
                    fieldPath: "",
                  };
                } else if (val === "session_storage") {
                  nextSource = { kind: "session_storage", key: "" };
                } else if (val === "local_storage") {
                  nextSource = { kind: "local_storage", key: "" };
                } else if (val === "item_prop") {
                  nextSource = { kind: "item_prop", propPath: "id", fieldPath: "id" };
                } else if (val === "cookie") {
                  nextSource = { kind: "cookie", cookieName: "" };
                } else {
                  nextSource = { kind: "user_input", fieldName: "" };
                }
                onChange({ ...draft, stateValueSource: nextSource });
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {incomingPaths && incomingPaths.length > 0 && (
                  <SelectItem value="realtime_payload" className="text-purple-400 font-medium">
                    ⚡ Incoming Stream Data
                  </SelectItem>
                )}
                <SelectItem value="item_prop" className="text-violet-400 font-medium">
                  Current Element Prop (Array Item)
                </SelectItem>
                <SelectItem value="literal">Static Literal</SelectItem>
                <SelectItem value="user_input">User Form Input</SelectItem>
                <SelectItem value="route_param">Page Route Param</SelectItem>
                <SelectItem value="query_param">Page Query Param</SelectItem>
                <SelectItem value="session_storage">Session Storage</SelectItem>
                <SelectItem value="local_storage">Local Storage</SelectItem>
                <SelectItem value="cookie">Browser Cookie</SelectItem>
                <SelectItem value="state_var">Another State Var</SelectItem>
                {priorSteps.length > 0 && (
                  <SelectItem value="prev_response">Prior Step Response</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isValueless ? (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-secondary/40 border border-border text-muted-foreground text-[11px] font-mono">
          <Info className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
          <span>No value required for &ldquo;{currentAction}&rdquo; (dispatches action without payload)</span>
        </div>
      ) : (
        <div className="pt-1">
          {valueSource.kind === "item_prop" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Item Property Key (item.*)
              </Label>
              {itemPropSuggestions && itemPropSuggestions.length > 0 ? (
                <ActionFlowCombobox
                  value={valueSource.propPath || valueSource.fieldPath || ""}
                  onChange={(val) =>
                    onChange({
                      ...draft,
                      stateValueSource: { kind: "item_prop", propPath: val, fieldPath: val },
                    })
                  }
                  placeholder={itemKeyField || "id"}
                  headerLabel="Suggested Item Properties"
                  options={itemPropSuggestions}
                />
              ) : (
                <Input
                  value={valueSource.propPath || valueSource.fieldPath || ""}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      stateValueSource: { kind: "item_prop", propPath: e.target.value, fieldPath: e.target.value },
                    })
                  }
                  placeholder={itemKeyField || "id"}
                  className="h-7 text-xs bg-background font-mono"
                />
              )}
            </div>
          )}

          {valueSource.kind === "literal" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Value to Assign
              </Label>
              <Input
                value={valueSource.value}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "literal", value: e.target.value },
                  })
                }
                placeholder="String, number, or JSON value"
                className="h-7 text-xs bg-background"
              />
            </div>
          )}

          {valueSource.kind === "user_input" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Form Input Field Name
              </Label>
              <ActionFlowCombobox
                value={valueSource.fieldName || ""}
                onChange={(val) =>
                  onChange({
                    ...draft,
                    stateValueSource: {
                      kind: "user_input",
                      fieldName: val,
                    },
                  })
                }
                placeholder="e.g. email, message, query"
                headerLabel="Suggested Form Inputs"
                options={[
                  { value: "file", type: "file" },
                  { value: "file.name", type: "string" },
                  { value: "file.type", type: "string" },
                  { value: "file.size", type: "number" },
                  { value: "email", type: "string" },
                  { value: "username", type: "string" },
                  { value: "message", type: "string" },
                  { value: "query", type: "string" },
                ]}
              />
            </div>
          )}

          {valueSource.kind === "route_param" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Route Parameter Name (e.g. id from /c/[id])
              </Label>
              <ActionFlowCombobox
                value={valueSource.paramName || ""}
                onChange={(name) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "route_param", paramName: name },
                  })
                }
                placeholder="e.g. id, slug"
                headerLabel="Page Route Params"
                options={routeParamSuggestions}
              />
            </div>
          )}

          {valueSource.kind === "query_param" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Query Parameter Name (e.g. limit from ?limit=10)
              </Label>
              <ActionFlowCombobox
                value={valueSource.paramName || ""}
                onChange={(name) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "query_param", paramName: name },
                  })
                }
                placeholder="e.g. limit, offset"
                headerLabel="Page Query Params"
                options={queryParamSuggestions}
              />
            </div>
          )}

          {valueSource.kind === "state_var" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Source State Key
              </Label>
              <ActionFlowCombobox
                value={valueSource.stateKey || ""}
                onChange={(val) =>
                  onChange({
                    ...draft,
                    stateValueSource: {
                      kind: "state_var",
                      stateKey: val,
                    },
                  })
                }
                placeholder="e.g. otherState"
                headerLabel="Available State Variables"
                options={allStateVarOptions}
              />
            </div>
          )}

          {valueSource.kind === "prev_response" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  From Step
                </Label>
                <Select
                  value={valueSource.stepId}
                  onValueChange={(val) =>
                    onChange({
                      ...draft,
                      stateValueSource: {
                        kind: "prev_response",
                        stepId: val,
                        fieldPath: valueSource.fieldPath || "",
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue placeholder="Select step" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorSteps.map((pStep, pIdx) => (
                      <SelectItem key={pStep.id} value={pStep.id}>
                        Step {pIdx + 1}: {pStep.name || pStep.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Response Property
                </Label>
                <ResponseFieldPicker
                  value={valueSource.fieldPath}
                  onChange={(val) =>
                    onChange({
                      ...draft,
                      stateValueSource: {
                        kind: "prev_response",
                        stepId: valueSource.stepId || priorSteps[0]?.id || "",
                        fieldPath: val,
                      },
                    })
                  }
                  placeholder="e.g. data.user or token"
                />
              </div>
            </div>
          )}

          {valueSource.kind === "session_storage" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Session Storage Key (sessionStorage.getItem)
              </Label>
              <Input
                value={valueSource.key}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "session_storage", key: e.target.value },
                  })
                }
                placeholder="e.g. authToken, session_id"
                className="h-7 text-xs bg-background"
              />
            </div>
          )}

          {valueSource.kind === "local_storage" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Local Storage Key (localStorage.getItem)
              </Label>
              <Input
                value={valueSource.key}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "local_storage", key: e.target.value },
                  })
                }
                placeholder="e.g. theme, token, user_prefs"
                className="h-7 text-xs bg-background"
              />
            </div>
          )}

          {valueSource.kind === "cookie" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Cookie Name
              </Label>
              <Input
                value={valueSource.cookieName}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    stateValueSource: { kind: "cookie", cookieName: e.target.value },
                  })
                }
                placeholder="e.g. session_token, csrftoken"
                className="h-7 text-xs bg-background"
              />
            </div>
          )}

          {valueSource.kind === "realtime_payload" && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">
                  Stream Payload Field / Property
                </Label>
                <span className="text-[9px] text-purple-400 font-mono">
                  stream.{valueSource.fieldPath || "(entire payload)"}
                </span>
              </div>
              <ActionFlowCombobox
                value={valueSource.fieldPath || ""}
                onChange={(path) =>
                  onChange({
                    ...draft,
                    stateValueSource: {
                      kind: "realtime_payload",
                      fieldPath: path,
                    },
                  })
                }
                placeholder="e.g. data.message, id, status (or leave empty for full payload)"
                headerLabel="Detected Incoming Stream Fields"
                options={[
                  { value: "", label: "(Full Payload: incomingData)", type: "object" },
                  ...(incomingPaths || []).map((p) => ({
                    value: p.path,
                    label: p.path,
                    type: p.type || "string",
                  })),
                ]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
