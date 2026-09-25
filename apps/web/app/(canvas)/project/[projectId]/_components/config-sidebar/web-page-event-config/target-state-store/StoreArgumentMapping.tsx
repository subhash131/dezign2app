"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Sliders, Globe, Layers, Sparkles, Info, Zap } from "lucide-react";
import { AvailablePath } from "../../pipeline-step-editor/types";
import { SmartPathInput } from "../../pipeline-step-editor/SmartPathInput";
import { SourceKind } from "./types";
import { StoreActionSelectorField } from "./StoreActionSelector";
import { Endpoint } from "@workspace/canvas";

export interface CustomActionParam {
  id: string;
  name: string;
  type: string;
}

export interface StoreArgumentMappingProps {
  isResetAction: boolean;
  targetField?: StoreActionSelectorField;
  customActionParameters?: CustomActionParam[];
  actionName?: string;
  storeName?: string;
  boundActionName?: string;
  parameterMappings?: Record<string, string>;
  onUpdateParameterMapping: (paramName: string, path: string) => void;
  selectedSourceKind: SourceKind;
  onSourceKindChange: (srcKind: string) => void;
  isEndpointConnected: boolean;
  connectedEndpoint?: Endpoint;
  connectedEndpointName?: string;
  valuePath?: string;
  onPathChange: (path: string) => void;
  customValue?: string;
  onCustomValueChange: (val: string) => void;
  currentSuggestedPaths: AvailablePath[];
}

export const StoreArgumentMapping: React.FC<StoreArgumentMappingProps> = ({
  isResetAction,
  targetField,
  customActionParameters = [],
  actionName,
  storeName = "Store",
  boundActionName = "action",
  parameterMappings = {},
  onUpdateParameterMapping,
  selectedSourceKind,
  onSourceKindChange,
  isEndpointConnected,
  connectedEndpoint,
  connectedEndpointName,
  valuePath,
  onPathChange,
  customValue,
  onCustomValueChange,
  currentSuggestedPaths,
}) => {
  if (isResetAction) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-2">
        <Info size={12} className="shrink-0 text-muted-foreground" />
        <span>
          The <code className="font-mono text-foreground font-semibold">reset()</code> function requires no arguments. It restores all store fields to their initial defaults.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Multi-parameter Mapping for custom actions with multiple params */}
      {customActionParameters.length > 1 && (
        <div className="flex flex-col gap-2.5 p-3 rounded-lg border border-border/50 bg-muted/20">
          <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Action Parameters ({customActionParameters.length})</span>
            <span className="text-[10px] text-muted-foreground font-normal">
              Map each parameter into {boundActionName}()
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
                  value={parameterMappings[param.name] || ""}
                  onChange={(p) => onUpdateParameterMapping(param.name, p)}
                  suggestedPaths={currentSuggestedPaths}
                  sourceKindLabel={selectedSourceKind === "endpoint" ? "API Response" : "Event Payload"}
                  rootVariableName={selectedSourceKind === "endpoint" ? "response" : "payload"}
                  placeholder={`Choose field or type path for ${param.name}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source & Argument Mapping (Pipeline-Step style) */}
      <div className="flex flex-col gap-3 p-3 rounded-lg border border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sliders size={12} className="text-indigo-500" />
            Argument &amp; Value Source
          </Label>
          <span className="text-[10px] text-muted-foreground">
            Passed to <code className="font-mono text-foreground font-semibold">{boundActionName}()</code>
          </span>
        </div>

        {/* Step 1: Data Source Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Source
          </Label>
          <Select
            value={selectedSourceKind}
            onValueChange={onSourceKindChange}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {isEndpointConnected && (
                <SelectItem value="endpoint" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Globe size={13} className="text-emerald-500 shrink-0" />
                    <span className="font-medium text-foreground">
                      API Response
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ({connectedEndpoint?.type || "GET"} {connectedEndpoint?.name || connectedEndpointName || "Endpoint"})
                    </span>
                  </div>
                </SelectItem>
              )}
              <SelectItem value="payload" className="text-xs">
                <div className="flex items-center gap-2">
                  <Layers size={13} className="text-blue-500 shrink-0" />
                  <span className="font-medium text-foreground">
                    Form / Event Payload
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({actionName || "action"})
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="static" className="text-xs">
                <div className="flex items-center gap-2">
                  <Sparkles size={13} className="text-amber-500 shrink-0" />
                  <span className="font-medium text-foreground">
                    Static Constant Value
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    (hardcoded literal)
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="direct" className="text-xs">
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-purple-500 shrink-0" />
                  <span className="font-medium text-foreground">
                    Direct Trigger (No Arguments)
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Step 2: Return Field / Property Selector (when Source is endpoint or payload) */}
        {(selectedSourceKind === "endpoint" || selectedSourceKind === "payload") && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center justify-between">
              <span>
                {selectedSourceKind === "endpoint" ? "Response Return Field / Property" : "Payload Field / Property"}
              </span>
              <span className="text-[10px] font-normal normal-case text-muted-foreground">
                Pick field or select whole {selectedSourceKind === "endpoint" ? "response" : "payload"}
              </span>
            </Label>

            <SmartPathInput
              value={valuePath || ""}
              onChange={onPathChange}
              suggestedPaths={currentSuggestedPaths}
              sourceKindLabel={selectedSourceKind === "endpoint" ? "API Response" : "Event Payload"}
              rootVariableName={selectedSourceKind === "endpoint" ? "response" : "payload"}
              placeholder={selectedSourceKind === "endpoint" ? "(whole response body)" : "(whole payload object)"}
            />

            <span className="text-[10px] text-muted-foreground">
              {valuePath
                ? `Extracts ${selectedSourceKind === "endpoint" ? `response.${valuePath}` : `payload.${valuePath}`} to pass into ${boundActionName}().`
                : `Passes the complete ${selectedSourceKind === "endpoint" ? "API response payload" : "event input payload"} directly into ${boundActionName}().`}
            </span>
          </div>
        )}

        {/* Step 2 (Static): Constant Value Input */}
        {selectedSourceKind === "static" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Constant Value
            </Label>
            <Input
              className="h-8 text-xs bg-background font-mono"
              placeholder="e.g. true, 10, 'active', { status: 'ready' }"
              value={customValue || ""}
              onChange={(e) => onCustomValueChange(e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground">
              Hardcoded literal passed into <code className="font-mono">{boundActionName}()</code> whenever triggered.
            </span>
          </div>
        )}

        {/* Step 2 (Direct): No Arguments Notice */}
        {selectedSourceKind === "direct" && (
          <div className="flex items-center gap-2 p-2 rounded bg-muted/40 text-[11px] text-muted-foreground">
            <Info size={12} className="shrink-0 text-muted-foreground" />
            <span>Calls <code className="font-mono text-foreground font-semibold">{boundActionName}()</code> directly with zero parameters.</span>
          </div>
        )}

        {/* Context Explanation */}
        {selectedSourceKind === "endpoint" && (
          <p className="text-[10px] text-muted-foreground leading-normal border-t border-border/30 pt-2 mt-1">
            When <code className="font-mono text-foreground font-semibold">{actionName || "action"}</code> triggers, the API request executes first, and its response data automatically updates <code className="font-mono text-foreground font-semibold">{storeName}.{boundActionName}()</code>.
          </p>
        )}
        {selectedSourceKind === "payload" && (
          <p className="text-[10px] text-muted-foreground leading-normal border-t border-border/30 pt-2 mt-1">
            When <code className="font-mono text-foreground font-semibold">{actionName || "action"}</code> triggers, input form fields or action arguments will be passed directly into <code className="font-mono text-foreground font-semibold">{storeName}.{boundActionName}()</code>.
          </p>
        )}
      </div>
    </div>
  );
};
