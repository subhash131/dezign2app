import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { BackendNode } from "@workspace/canvas";
import type {
  FrontendActionStepDraft,
  FrontendFieldSource,
  QueryParamUpdateItem,
} from "./types";
import { ActionFlowCombobox } from "./ActionFlowCombobox";
import { ResponseFieldPicker } from "./ResponseFieldPicker";

export interface QueryParamsStepProps {
  draft: FrontendActionStepDraft;
  allSteps: FrontendActionStepDraft[];
  stepIndex: number;
  allNodes: BackendNode[];
  webPageNodeId?: string;
  onChange: (updated: FrontendActionStepDraft) => void;
}

export const QueryParamsStep: React.FC<QueryParamsStepProps> = ({
  draft,
  allSteps,
  stepIndex,
  allNodes,
  webPageNodeId,
  onChange,
}) => {
  const priorSteps = allSteps.slice(0, stepIndex);

  const currentPageNode = React.useMemo(
    () => allNodes.find((n) => n.id === webPageNodeId),
    [allNodes, webPageNodeId],
  );

  const queryParamSuggestions = React.useMemo(() => {
    const queries = currentPageNode?.data?.queryParams || [];
    return queries.map((q) => ({
      value: q.name,
      label: q.name,
      type: q.type || "string",
      description: q.description || undefined,
    }));
  }, [currentPageNode?.data?.queryParams]);

  const routeParamSuggestions = React.useMemo(() => {
    const params = currentPageNode?.data?.pathParams || [];
    return params.map((p) => ({
      value: p.name,
      label: p.name,
      type: p.type || "string",
    }));
  }, [currentPageNode?.data?.pathParams]);

  const stateStores = React.useMemo(
    () => allNodes.filter((n) => n.type === "state_store"),
    [allNodes],
  );

  const stateKeySuggestions = React.useMemo(() => {
    const list: { value: string; label: string; type: string }[] = [
      { value: "selectedTab", label: "selectedTab", type: "string" },
      { value: "activeFilter", label: "activeFilter", type: "string" },
      { value: "searchQuery", label: "searchQuery", type: "string" },
      { value: "currentPage", label: "currentPage", type: "number" },
      { value: "selectedId", label: "selectedId", type: "string" },
    ];
    for (const store of stateStores) {
      const storeName = store.data?.label || store.data?.storeName || "Store";
      for (const field of store.data?.fields || []) {
        list.push({
          value: `${storeName}.${field.name}`,
          label: `${storeName}.${field.name}`,
          type: field.type || "string",
        });
      }
    }
    return list;
  }, [stateStores]);

  const suggestedFormInputs = React.useMemo(
    () => [
      { value: "search", type: "string" },
      { value: "query", type: "string" },
      { value: "limit", type: "number" },
      { value: "offset", type: "number" },
      { value: "page", type: "number" },
      { value: "tab", type: "string" },
      { value: "category", type: "string" },
      { value: "filter", type: "string" },
    ],
    [],
  );

  const navMode = draft.queryParamNavMode || "replace";
  const scroll = draft.queryParamScroll ?? false;

  // Unify parameters: support multiple params uniformly while keeping single fields in sync
  const paramUpdates: QueryParamUpdateItem[] = React.useMemo(() => {
    if (draft.queryParamsUpdates && draft.queryParamsUpdates.length > 0) {
      return draft.queryParamsUpdates;
    }
    if (draft.queryParamKey || draft.queryParamMode) {
      return [
        {
          key: draft.queryParamKey || "",
          mode: draft.queryParamMode || "set",
          valueSource: draft.queryParamValueSource || {
            kind: "literal",
            value: "",
          },
        },
      ];
    }
    return [
      {
        key: "",
        mode: "set",
        valueSource: { kind: "literal", value: "" },
      },
    ];
  }, [
    draft.queryParamsUpdates,
    draft.queryParamKey,
    draft.queryParamMode,
    draft.queryParamValueSource,
  ]);

  const updateParamItems = (nextUpdates: QueryParamUpdateItem[]) => {
    const first = nextUpdates[0];
    onChange({
      ...draft,
      queryParamsUpdates: nextUpdates,
      queryParamKey: first ? first.key : "",
      queryParamMode: first ? first.mode : "set",
      queryParamValueSource: first
        ? first.valueSource
        : { kind: "literal", value: "" },
    });
  };

  const handleAddParam = () => {
    const nextUpdates: QueryParamUpdateItem[] = [
      ...paramUpdates,
      {
        key: "",
        mode: "set",
        valueSource: { kind: "literal", value: "" },
      },
    ];
    updateParamItems(nextUpdates);
  };

  const handleUpdateParam = (
    index: number,
    updated: Partial<QueryParamUpdateItem>,
  ) => {
    const nextUpdates = paramUpdates.map((item, idx) =>
      idx === index ? { ...item, ...updated } : item,
    );
    updateParamItems(nextUpdates);
  };

  const handleRemoveParam = (index: number) => {
    if (paramUpdates.length <= 1) {
      // Clear the single remaining item rather than leaving 0 items
      updateParamItems([
        {
          key: "",
          mode: "set",
          valueSource: { kind: "literal", value: "" },
        },
      ]);
      return;
    }
    const nextUpdates = paramUpdates.filter((_, idx) => idx !== index);
    updateParamItems(nextUpdates);
  };

  return (
    <div className="space-y-3 pt-1 text-xs">
      {/* Step-Level History & Scroll Settings */}
      <div className="p-2.5 rounded-lg border bg-secondary/20 space-y-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          History & Navigation Transition
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Browser History
            </Label>
            <Select
              value={navMode}
              onValueChange={(val: string) => {
                if (val === "replace" || val === "push") {
                  onChange({ ...draft, queryParamNavMode: val });
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Replace URL (router.replace)</SelectItem>
                <SelectItem value="push">Push New Entry (router.push)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Scroll Behavior
            </Label>
            <Select
              value={scroll ? "true" : "false"}
              onValueChange={(val: string) =>
                onChange({ ...draft, queryParamScroll: val === "true" })
              }
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Preserve Scroll Position</SelectItem>
                <SelectItem value="true">Scroll to Top</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Unified Parameters Section */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-foreground">
              Query Parameters ({paramUpdates.length})
            </span>
            <p className="text-[11px] text-muted-foreground">
              Parameters updated together atomically in a single URL transition
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddParam}
            className="h-7 text-[11px] px-2 flex items-center gap-1 border-dashed cursor-pointer"
          >
            <Plus size={12} /> Add Parameter
          </Button>
        </div>

        {/* Column Headers like PipelineStepEditor */}
        <div className="grid grid-cols-[1fr_auto_140px_1.2fr_auto] gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-2">
          <span>Parameter Key</span>
          <span className="w-3"></span>
          <span>Source / Action</span>
          <span>Value</span>
          <span className="w-7"></span>
        </div>

        <div className="space-y-1.5">
          {paramUpdates.map((item, pIdx) => {
            const vSource = item.valueSource || {
              kind: "literal",
              value: "",
            };

            const currentAction =
              item.mode === "remove"
                ? "remove"
                : item.mode === "toggle"
                  ? "toggle"
                  : item.valueSource?.kind || "literal";

            return (
              <div
                key={pIdx}
                className="grid grid-cols-[1fr_auto_140px_1.2fr_auto] gap-1.5 items-center bg-card/60 p-1.5 rounded-lg border border-border/50 hover:border-border/80 transition-colors"
              >
                {/* Box 1: Parameter Key */}
                <div className="min-w-0">
                  <ActionFlowCombobox
                    value={item.key}
                    onChange={(key) => handleUpdateParam(pIdx, { key })}
                    placeholder="e.g. limit, page, tab, query"
                    headerLabel="Page Query Parameters"
                    options={queryParamSuggestions}
                  />
                </div>

                {/* Arrow (PipelineStepEditor style) */}
                <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none font-mono">
                  ←
                </span>

                {/* Box 2: Source / Action Mode */}
                <div className="w-[140px] shrink-0">
                  <Select
                    value={currentAction}
                    onValueChange={(val: string) => {
                      if (val === "remove") {
                        handleUpdateParam(pIdx, { mode: "remove" });
                      } else if (val === "toggle") {
                        handleUpdateParam(pIdx, { mode: "toggle" });
                      } else if (val === "literal") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "literal",
                            value:
                              item.valueSource?.kind === "literal"
                                ? item.valueSource.value
                                : "",
                          },
                        });
                      } else if (val === "user_input") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "user_input",
                            fieldName:
                              item.valueSource?.kind === "user_input"
                                ? item.valueSource.fieldName
                                : suggestedFormInputs[0]?.value || "",
                          },
                        });
                      } else if (val === "state_var") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "state_var",
                            stateKey:
                              item.valueSource?.kind === "state_var"
                                ? item.valueSource.stateKey
                                : stateKeySuggestions[0]?.value || "",
                          },
                        });
                      } else if (val === "route_param") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "route_param",
                            paramName:
                              item.valueSource?.kind === "route_param"
                                ? item.valueSource.paramName
                                : routeParamSuggestions[0]?.value || "",
                          },
                        });
                      } else if (val === "prev_response") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "prev_response",
                            stepId:
                              item.valueSource?.kind === "prev_response"
                                ? item.valueSource.stepId
                                : priorSteps[0]?.id || "",
                            fieldPath:
                              item.valueSource?.kind === "prev_response"
                                ? item.valueSource.fieldPath
                                : "",
                          },
                        });
                      } else if (val === "session_storage") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "session_storage",
                            key:
                              item.valueSource?.kind === "session_storage"
                                ? item.valueSource.key
                                : "",
                          },
                        });
                      } else if (val === "local_storage") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "local_storage",
                            key:
                              item.valueSource?.kind === "local_storage"
                                ? item.valueSource.key
                                : "",
                          },
                        });
                      } else if (val === "cookie") {
                        handleUpdateParam(pIdx, {
                          mode: "set",
                          valueSource: {
                            kind: "cookie",
                            cookieName:
                              item.valueSource?.kind === "cookie"
                                ? item.valueSource.cookieName
                                : "",
                          },
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel className="text-[10px] text-muted-foreground uppercase font-semibold">
                          Set Value
                        </SelectLabel>
                        <SelectItem value="literal">Static Literal</SelectItem>
                        <SelectItem value="user_input">User Form Input</SelectItem>
                        <SelectItem value="session_storage">Session Storage</SelectItem>
                        <SelectItem value="local_storage">Local Storage</SelectItem>
                        <SelectItem value="cookie">Browser Cookie</SelectItem>
                        <SelectItem value="state_var">State Variable</SelectItem>
                        <SelectItem value="route_param">Route Param</SelectItem>
                        {priorSteps.length > 0 && (
                          <SelectItem value="prev_response">Step Response</SelectItem>
                        )}
                      </SelectGroup>
                      <SelectSeparator />
                      <SelectGroup>
                        <SelectLabel className="text-[10px] text-muted-foreground uppercase font-semibold">
                          URL Operation
                        </SelectLabel>
                        <SelectItem value="remove">Remove Parameter</SelectItem>
                        <SelectItem value="toggle">Toggle Presence</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {/* Box 3: Value / Field / Editor */}
                <div className="min-w-0">
                  {currentAction === "remove" && (
                    <div className="h-7 px-2 text-[11px] text-muted-foreground/60 italic flex items-center bg-muted/20 border border-dashed border-border/40 rounded truncate select-none">
                      Removes param from URL
                    </div>
                  )}

                  {currentAction === "toggle" && (
                    <div className="h-7 px-2 text-[11px] text-muted-foreground/60 italic flex items-center bg-muted/20 border border-dashed border-border/40 rounded truncate select-none">
                      Toggles presence (on / off)
                    </div>
                  )}

                  {currentAction === "literal" && (
                    <Input
                      value={vSource.kind === "literal" ? vSource.value : ""}
                      onChange={(e) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "literal",
                            value: e.target.value,
                          },
                        })
                      }
                      placeholder="e.g. details, active, 1"
                      className="h-7 text-xs bg-background"
                    />
                  )}

                  {currentAction === "user_input" && (
                    <ActionFlowCombobox
                      value={vSource.kind === "user_input" ? vSource.fieldName : ""}
                      onChange={(val) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "user_input",
                            fieldName: val,
                          },
                        })
                      }
                      placeholder="e.g. search, query, limit"
                      headerLabel="Suggested Form Inputs"
                      options={suggestedFormInputs}
                    />
                  )}

                  {currentAction === "state_var" && (
                    <ActionFlowCombobox
                      value={vSource.kind === "state_var" ? vSource.stateKey : ""}
                      onChange={(val) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "state_var",
                            stateKey: val,
                          },
                        })
                      }
                      placeholder="Select state variable"
                      headerLabel="Available State Variables"
                      options={stateKeySuggestions}
                    />
                  )}

                  {currentAction === "route_param" && (
                    <ActionFlowCombobox
                      value={vSource.kind === "route_param" ? vSource.paramName : ""}
                      onChange={(val) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "route_param",
                            paramName: val,
                          },
                        })
                      }
                      placeholder="e.g. id, slug"
                      headerLabel="Page Route Params"
                      options={routeParamSuggestions}
                    />
                  )}

                  {currentAction === "prev_response" && (() => {
                    const selStepId = vSource.kind === "prev_response" ? vSource.stepId || priorSteps[0]?.id : priorSteps[0]?.id;
                    const selectedPriorStep = priorSteps.find((s) => s.id === selStepId);
                    return (
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <Select
                          value={vSource.kind === "prev_response" ? vSource.stepId || "" : ""}
                          onValueChange={(val) =>
                            handleUpdateParam(pIdx, {
                              valueSource: {
                                kind: "prev_response",
                                stepId: val,
                                fieldPath:
                                  vSource.kind === "prev_response"
                                    ? vSource.fieldPath
                                    : "",
                              },
                            })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs bg-background w-24 shrink-0">
                            <SelectValue placeholder="Step" />
                          </SelectTrigger>
                          <SelectContent>
                            {priorSteps.map((s, idx) => (
                              <SelectItem key={s.id} value={s.id}>
                                Step {idx + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex-1 min-w-0">
                          <ResponseFieldPicker
                            value={vSource.kind === "prev_response" ? vSource.fieldPath || "" : ""}
                            onChange={(val) =>
                              handleUpdateParam(pIdx, {
                                valueSource: {
                                  kind: "prev_response",
                                  stepId:
                                    vSource.kind === "prev_response"
                                      ? vSource.stepId
                                      : priorSteps[0]?.id || "",
                                  fieldPath: val,
                                },
                              })
                            }
                            step={selectedPriorStep}
                            allNodes={allNodes}
                            placeholder="Path: e.g. data.id"
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {currentAction === "session_storage" && (
                    <Input
                      value={vSource.kind === "session_storage" ? vSource.key : ""}
                      onChange={(e) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "session_storage",
                            key: e.target.value,
                          },
                        })
                      }
                      placeholder="Storage key: e.g. token"
                      className="h-7 text-xs bg-background font-mono"
                    />
                  )}

                  {currentAction === "local_storage" && (
                    <Input
                      value={vSource.kind === "local_storage" ? vSource.key : ""}
                      onChange={(e) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "local_storage",
                            key: e.target.value,
                          },
                        })
                      }
                      placeholder="Storage key: e.g. token"
                      className="h-7 text-xs bg-background font-mono"
                    />
                  )}

                  {currentAction === "cookie" && (
                    <Input
                      value={vSource.kind === "cookie" ? vSource.cookieName : ""}
                      onChange={(e) =>
                        handleUpdateParam(pIdx, {
                          valueSource: {
                            kind: "cookie",
                            cookieName: e.target.value,
                          },
                        })
                      }
                      placeholder="Cookie name: e.g. session"
                      className="h-7 text-xs bg-background font-mono"
                    />
                  )}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleRemoveParam(pIdx)}
                  className="h-7 w-7 p-0 flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded transition-colors cursor-pointer shrink-0"
                  title={
                    paramUpdates.length > 1
                      ? "Remove parameter"
                      : "Clear parameter"
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
