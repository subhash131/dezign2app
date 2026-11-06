import React from "react";
import { HardDrive, ShieldCheck, Clock, KeyRound, Sparkles, ArrowRight } from "lucide-react";
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
import type { BrowserStorageStepProps } from "./types";
import type { FrontendFieldSource, BrowserStorageKey } from "@workspace/canvas";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { ActionFlowCombobox } from "./ActionFlowCombobox";

export const BrowserStorageStep: React.FC<BrowserStorageStepProps> = ({
  draft,
  allSteps,
  stepIndex,
  allNodes = [],
  endpoints = [],
  webPageNodeId,
  onChange,
}) => {
  const priorSteps = allSteps.slice(0, stepIndex);
  const browserStorageNodes = allNodes.filter((n) => n.type === "browser_storage");

  // Selected browser storage node
  const selectedNode = browserStorageNodes.find(
    (n) => n.id === draft.browserStorageNodeId,
  ) || (browserStorageNodes.length === 1 ? browserStorageNodes[0] : undefined);

  const availableKeys: BrowserStorageKey[] = selectedNode?.data?.keys || [];
  const engine = draft.storageEngine || selectedNode?.data?.storageEngine || "localStorage";
  const operation = draft.storageOperation || "set";
  const currentKey = draft.storageKey || (availableKeys[0]?.name || "auth_token");
  const valueSource: FrontendFieldSource = draft.storageValueSource || {
    kind: "literal",
    value: "",
  };

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

  const stateStores = allNodes.filter((n) => n.type === "state_store");
  const allStateVarOptions = React.useMemo(() => {
    return stateStores.flatMap((s) =>
      (s.data?.fields || []).map((f) => ({
        value: f.name,
        label: `${s.data?.label || s.data?.storeName || "Store"}.${f.name}`,
        type: f.type || "string",
      })),
    );
  }, [stateStores]);

  const targetPriorStep = React.useMemo(() => {
    if (valueSource.kind !== "prev_response") return undefined;
    return priorSteps.find((s) => s.id === valueSource.stepId);
  }, [priorSteps, valueSource]);

  const targetEndpoint = React.useMemo(() => {
    if (!targetPriorStep || targetPriorStep.type !== "api_call") return undefined;
    return endpoints.find((e) => e.id === targetPriorStep.endpointId);
  }, [targetPriorStep, endpoints]);

  return (
    <div className="space-y-3 font-sans">
      {/* Top Banner / Target Storage Node Selector */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <HardDrive size={10} className="text-emerald-500" />
            <span>Target Storage Node</span>
          </Label>
          {browserStorageNodes.length > 0 ? (
            <Select
              value={selectedNode?.id || "standalone"}
              onValueChange={(val) => {
                if (val === "standalone") {
                  onChange({
                    ...draft,
                    browserStorageNodeId: undefined,
                  });
                } else {
                  const matched = browserStorageNodes.find((n) => n.id === val);
                  onChange({
                    ...draft,
                    browserStorageNodeId: val,
                    storageEngine: matched?.data?.storageEngine || draft.storageEngine || "localStorage",
                    storageKey: matched?.data?.keys?.[0]?.name || draft.storageKey || "auth_token",
                  });
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue placeholder="Select storage node..." />
              </SelectTrigger>
              <SelectContent>
                {browserStorageNodes.map((sn) => (
                  <SelectItem key={sn.id} value={sn.id}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{sn.data?.label || sn.data?.storageName || "BrowserStorage"}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        ({sn.data?.storageEngine || "localStorage"})
                      </span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="standalone">Direct Browser Storage (Custom)</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="h-7 px-2 flex items-center rounded border border-border/50 bg-muted/20 text-[11px] text-muted-foreground font-mono">
              Direct window.localStorage
            </div>
          )}
        </div>

        {/* Engine Selector */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ShieldCheck size={10} className="text-emerald-500" />
            <span>Storage Engine</span>
          </Label>
          <Select
            value={engine}
            onValueChange={(val: "localStorage" | "sessionStorage") =>
              onChange({ ...draft, storageEngine: val })
            }
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="localStorage">localStorage (Persistent)</SelectItem>
              <SelectItem value="sessionStorage">sessionStorage (Tab Life)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Operation & Key */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Operation</Label>
          <Select
            value={operation}
            onValueChange={(val: "set" | "remove" | "clear" | "toggle" | "append") =>
              onChange({ ...draft, storageOperation: val })
            }
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="set">Set Item (Write)</SelectItem>
              <SelectItem value="remove">Remove Item (Delete)</SelectItem>
              <SelectItem value="clear">Clear All (Wipe)</SelectItem>
              <SelectItem value="toggle">Toggle Boolean</SelectItem>
              <SelectItem value="append">Append to Array</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {operation !== "clear" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Storage Key</span>
              {availableKeys.length > 0 && (
                <span className="text-[9px] text-emerald-500 font-mono">from node</span>
              )}
            </Label>
            {availableKeys.length > 0 ? (
              <Select
                value={currentKey}
                onValueChange={(val) => onChange({ ...draft, storageKey: val })}
              >
                <SelectTrigger className="h-7 text-xs bg-background font-mono">
                  <SelectValue placeholder="Choose key..." />
                </SelectTrigger>
                <SelectContent>
                  {availableKeys.map((k) => (
                    <SelectItem key={k.id} value={k.name}>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-mono font-semibold">{k.name}</span>
                        <span className="text-[9px] text-muted-foreground uppercase">({k.type})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={draft.storageKey || ""}
                onChange={(e) => onChange({ ...draft, storageKey: e.target.value })}
                placeholder="e.g. auth_token, theme, user_id"
                className="h-7 text-xs font-mono"
              />
            )}
          </div>
        )}
      </div>

      {/* Value Source (Only needed for set and append) */}
      {(operation === "set" || operation === "append") && (
        <div className="space-y-2 p-2.5 rounded-lg border border-border/50 bg-muted/20">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Value Source</Label>
            <Select
              value={valueSource.kind}
              onValueChange={(
                val:
                  | "literal"
                  | "prev_response"
                  | "user_input"
                  | "state_var"
                  | "route_param"
                  | "query_param",
              ) => {
                let nextSource: FrontendFieldSource;
                if (val === "literal") {
                  nextSource = { kind: "literal", value: "" };
                } else if (val === "prev_response") {
                  nextSource = {
                    kind: "prev_response",
                    stepId: priorSteps[0]?.id || "",
                    fieldPath: "",
                  };
                } else if (val === "user_input") {
                  nextSource = { kind: "user_input", fieldName: "" };
                } else if (val === "state_var") {
                  nextSource = { kind: "state_var", stateKey: "" };
                } else if (val === "route_param") {
                  nextSource = {
                    kind: "route_param",
                    paramName: routeParamSuggestions[0]?.value || "",
                  };
                } else {
                  nextSource = {
                    kind: "query_param",
                    paramName: queryParamSuggestions[0]?.value || "",
                  };
                }
                onChange({ ...draft, storageValueSource: nextSource });
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="literal">Static Literal / Constant</SelectItem>
                {priorSteps.length > 0 && (
                  <SelectItem value="prev_response">Prior Step Response (e.g. res.token)</SelectItem>
                )}
                <SelectItem value="user_input">User Form Input</SelectItem>
                <SelectItem value="state_var">State Store Variable</SelectItem>
                {routeParamSuggestions.length > 0 && (
                  <SelectItem value="route_param">Route Parameter</SelectItem>
                )}
                {queryParamSuggestions.length > 0 && (
                  <SelectItem value="query_param">Query Parameter</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Literal Input */}
          {valueSource.kind === "literal" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Static Value</Label>
              <Input
                value={valueSource.value}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    storageValueSource: { kind: "literal", value: e.target.value },
                  })
                }
                placeholder="Value to write..."
                className="h-7 text-xs font-mono"
              />
            </div>
          )}

          {/* User Form Input */}
          {valueSource.kind === "user_input" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Form Field Name</Label>
              <Input
                value={valueSource.fieldName}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    storageValueSource: { kind: "user_input", fieldName: e.target.value },
                  })
                }
                placeholder="e.g. email, token, rememberMe"
                className="h-7 text-xs font-mono"
              />
            </div>
          )}

          {/* Prior API Response Field Picker */}
          {valueSource.kind === "prev_response" && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Source Step</Label>
                <Select
                  value={valueSource.stepId}
                  onValueChange={(val) =>
                    onChange({
                      ...draft,
                      storageValueSource: { ...valueSource, stepId: val },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorSteps.map((s, idx) => (
                      <SelectItem key={s.id} value={s.id}>
                        Step {idx + 1}: {s.name || s.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Field Path</Label>
                <ResponseFieldPicker
                  value={valueSource.fieldPath}
                  onChange={(val) =>
                    onChange({
                      ...draft,
                      storageValueSource: { ...valueSource, fieldPath: val },
                    })
                  }
                  step={targetPriorStep}
                  allNodes={allNodes}
                  endpoints={endpoints}
                  endpoint={targetEndpoint}
                  placeholder="e.g. token, data.id, session.user.id"
                />
              </div>
            </div>
          )}

          {/* State Variable Combobox */}
          {valueSource.kind === "state_var" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">State Variable</Label>
              <ActionFlowCombobox
                value={valueSource.stateKey}
                onChange={(val) =>
                  onChange({
                    ...draft,
                    storageValueSource: { kind: "state_var", stateKey: val },
                  })
                }
                placeholder="Select state variable..."
                options={allStateVarOptions}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BrowserStorageStep;
