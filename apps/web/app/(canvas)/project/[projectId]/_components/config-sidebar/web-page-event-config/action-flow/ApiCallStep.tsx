import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  Plus,
  Trash2,
  Globe,
  Server,
  ArrowRight,
  Shield,
  MapPin,
  SlidersHorizontal,
  Package,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Key,
  Box,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
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
import type {
  ApiCallStepProps,
  BindingSlot,
  FrontendRequestFieldBinding,
  FrontendFieldSource,
  BackendNode,
  FrontendActionStepDraft,
  AvailablePath,
  Endpoint,
} from "./types";
import type { PageSection } from "@/types/canvas";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { ActionFlowCombobox, ComboboxOption } from "./ActionFlowCombobox";
import { ensureActionServiceConnection, cleanupActionStepEdge } from "./actionStepCanvasSync";
import { isAuthHeaderName, buildInitialBindingsFromEndpoint, resolveItemPropsFromState } from "./utils";

type SourceKindOption =
  | "auth_token"
  | "item_prop"
  | "user_input"
  | "route_param"
  | "query_param"
  | "session_storage"
  | "local_storage"
  | "cookie"
  | "state_var"
  | "literal"
  | "prev_response"
  | "realtime_payload";

interface BindingSlotRowProps {
  binding: FrontendRequestFieldBinding;
  fieldSuggestions: ComboboxOption[];
  isTargetReadOnly?: boolean;
  onUpdate: (updater: (prev: FrontendRequestFieldBinding) => FrontendRequestFieldBinding) => void;
  onDelete: () => void;
  onKindChange: (newKind: SourceKindOption) => void;
  priorSteps: FrontendActionStepDraft[];
  routeParamSuggestions: ComboboxOption[];
  queryParamSuggestions: ComboboxOption[];
  stateStores: BackendNode[];
  sectionStateVars: Array<{ name: string; type?: string; storeName?: string; storeId?: string }>;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemSourceStateName?: string;
  itemPropSuggestions?: ComboboxOption[];
  endpoints?: (Endpoint & { nodeId: string })[];
  allNodes?: BackendNode[];
}

const BindingSlotRow: React.FC<BindingSlotRowProps> = ({
  binding,
  fieldSuggestions,
  isTargetReadOnly = false,
  onUpdate,
  onDelete,
  onKindChange,
  priorSteps,
  routeParamSuggestions,
  queryParamSuggestions,
  stateStores,
  sectionStateVars,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemSourceStateName,
  itemPropSuggestions,
  endpoints = [],
  allNodes = [],
}) => {
  const isAuth = binding.slot === "header" && isAuthHeaderName(binding.targetField);

  return (
    <div className="p-2.5 rounded-md border border-border/50 bg-card/60 hover:border-border/80 transition-colors space-y-2 text-xs">
      <div className="flex items-center gap-2">
        {/* Target Field Name / Pill */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between pb-0.5">
            <Label className="text-[10px] text-muted-foreground">
              {binding.slot === "header"
                ? "Header Name"
                : binding.slot === "path_param"
                ? "Path Param"
                : binding.slot === "query_param"
                ? "Query Param"
                : "Field Name"}
            </Label>
            {isAuth && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 font-mono text-amber-500 border-amber-500/30 bg-amber-500/10 flex items-center gap-0.5"
              >
                <Key size={8} /> Auth Header
              </Badge>
            )}
          </div>

          {isTargetReadOnly ? (
            <div className="h-7 px-2 flex items-center bg-muted/40 border border-border/50 rounded text-foreground font-mono font-medium text-xs truncate">
              {binding.targetField || "(unnamed param)"}
            </div>
          ) : (
            <ActionFlowCombobox
              value={binding.targetField}
              onChange={(val) =>
                onUpdate((prev) => {
                  const targetIsAuth = isAuthHeaderName(val);
                  let nextSource = prev.source;
                  if (
                    prev.slot === "header" &&
                    targetIsAuth &&
                    prev.source.kind === "literal" &&
                    (!prev.source.value || prev.source.value === "Bearer <token>")
                  ) {
                    nextSource = { kind: "auth_token", tokenType: "session" };
                  }
                  return { ...prev, targetField: val, source: nextSource };
                })
              }
              placeholder={
                binding.slot === "header"
                  ? "e.g. Authorization, X-Api-Key"
                  : binding.slot === "query_param"
                  ? "e.g. limit, search, tab"
                  : "e.g. userId, email, payload"
              }
              headerLabel="Available Field Names"
              options={fieldSuggestions}
            />
          )}
        </div>

        {/* Source Type Selector */}
        <div className="w-36 shrink-0">
          <Label className="text-[10px] text-muted-foreground block pb-0.5">
            Source Type
          </Label>
          <Select
            value={binding.source.kind}
            onValueChange={(val: SourceKindOption) => onKindChange(val)}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {incomingPaths && incomingPaths.length > 0 && (
                <SelectItem value="realtime_payload">
                  <span className="flex items-center gap-1.5 text-purple-400 font-medium">
                    ⚡ Incoming Stream Data
                  </span>
                </SelectItem>
              )}
              <SelectItem value="item_prop">
                <span className="flex items-center gap-1.5 text-violet-400 font-medium">
                  <Box size={11} />
                  Current item {!isItemScoped && "(Array Item)"}
                </span>
              </SelectItem>
              <SelectItem value="auth_token">
                <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                  <Key size={11} />
                  Auth Session Token
                </span>
              </SelectItem>
              <SelectItem value="cookie">Browser Cookie</SelectItem>
              <SelectItem value="local_storage">Local Storage</SelectItem>
              <SelectItem value="session_storage">Session Storage</SelectItem>
              <SelectItem value="user_input">User Form Input</SelectItem>
              <SelectItem value="route_param">Page Route Param</SelectItem>
              <SelectItem value="query_param">Page Query Param</SelectItem>
              <SelectItem value="state_var">State Variable</SelectItem>
              <SelectItem value="literal">Static Value</SelectItem>
              {priorSteps.length > 0 && (
                <SelectItem value="prev_response">Prior Step Response</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Delete Row Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive self-end shrink-0 cursor-pointer"
          title="Delete binding"
        >
          <Trash2 size={13} />
        </Button>
      </div>

      {/* Source Details Editor */}
      <div className="pt-0.5">
        {binding.source.kind === "item_prop" && (
          <div className="p-2.5 rounded border border-violet-500/25 bg-violet-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-violet-400 flex items-center gap-1.5">
                <Box size={12} />
                Current item Property (Array Item)
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono text-violet-400 border-violet-500/30 bg-violet-500/10">
                {itemSourceStateName ? `${itemSourceStateName}[]` : "item context"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Item Property Key</Label>
                <ActionFlowCombobox
                  value={binding.source.propPath || binding.source.fieldPath || ""}
                  onChange={(val) =>
                    onUpdate((prev) => ({
                      ...prev,
                      source: { kind: "item_prop", propPath: val, fieldPath: val },
                    }))
                  }
                  placeholder={itemKeyField || binding.targetField || "id"}
                  headerLabel="Suggested Item Properties"
                  options={itemPropSuggestions || []}
                />
              </div>
              <div className="flex flex-col justify-end text-[10px] text-muted-foreground leading-tight pb-0.5">
                <span>
                  Runtime value: <code className="text-violet-300 font-mono">item.{binding.source.propPath || binding.source.fieldPath || itemKeyField || binding.targetField || "id"}</code>
                </span>
                <span className="text-[9px] text-muted-foreground/80 mt-0.5">
                  Passed into request when array item is clicked.
                </span>
              </div>
            </div>
          </div>
        )}

        {binding.source.kind === "auth_token" && (
          <div className="p-2.5 rounded border border-amber-500/25 bg-amber-500/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1.5">
                <Key size={12} />
                Dynamic Authorization Token
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono text-amber-500 border-amber-500/30 bg-amber-500/10">
                Runtime Resolved
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Token Provider Source</Label>
                <Select
                  value={binding.source.tokenType || "session"}
                  onValueChange={(val: "session" | "cookie" | "local_storage") =>
                    onUpdate((prev) => ({
                      ...prev,
                      source: { kind: "auth_token", tokenType: val },
                    }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="session">Auto Active Session (Recommended)</SelectItem>
                    <SelectItem value="cookie">Browser Cookie (better-auth.session_token)</SelectItem>
                    <SelectItem value="local_storage">Local Storage (auth_token)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end text-[10px] text-muted-foreground leading-tight pb-0.5">
                {binding.source.tokenType === "cookie" ? (
                  <span>Reads <code className="text-foreground">better-auth.session_token</code> cookie.</span>
                ) : binding.source.tokenType === "local_storage" ? (
                  <span>Reads <code className="text-foreground">localStorage["auth_token"]</code>.</span>
                ) : (
                  <span>Auto-resolves from Better Auth session, cookies, or storage via <code className="text-foreground">getAuthBearerToken()</code>.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {binding.source.kind === "literal" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Literal Value
            </Label>
            <Input
              value={binding.source.value}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "literal", value: e.target.value },
                }))
              }
              placeholder={isAuth ? "Bearer <token>" : "Static string or JSON value"}
              className="h-7 text-xs bg-background"
            />
          </div>
        )}

        {binding.source.kind === "user_input" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Form Input Field Name
            </Label>
            <ActionFlowCombobox
              value={binding.source.fieldName}
              onChange={(name) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "user_input", fieldName: name },
                }))
              }
              placeholder="e.g. email, password, query"
              headerLabel="Suggested Form Inputs"
              options={[
                { value: "email", type: "string" },
                { value: "username", type: "string" },
                { value: "password", type: "string" },
                { value: "file", type: "file" },
                { value: "file.name", type: "string" },
                { value: "file.type", type: "string" },
                { value: "file.size", type: "number" },
                { value: "query", type: "string" },
                { value: "search", type: "string" },
                ...(binding.targetField ? [{ value: binding.targetField, type: "field" }] : []),
              ]}
            />
          </div>
        )}

        {binding.source.kind === "route_param" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Page Route Parameter Name
            </Label>
            <ActionFlowCombobox
              value={binding.source.paramName}
              onChange={(name) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "route_param", paramName: name },
                }))
              }
              placeholder="e.g. id, slug"
              headerLabel="Page Route Params"
              options={routeParamSuggestions}
            />
          </div>
        )}

        {binding.source.kind === "query_param" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Page Query Parameter Name
            </Label>
            <ActionFlowCombobox
              value={binding.source.paramName}
              onChange={(name) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "query_param", paramName: name },
                }))
              }
              placeholder="e.g. limit, offset, tab"
              headerLabel="Page Query Params"
              options={queryParamSuggestions}
            />
          </div>
        )}

        {binding.source.kind === "session_storage" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Session Storage Key (sessionStorage.getItem)
            </Label>
            <Input
              value={binding.source.key}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "session_storage", key: e.target.value },
                }))
              }
              placeholder="e.g. authToken, session_id"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>
        )}

        {binding.source.kind === "local_storage" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Local Storage Key (localStorage.getItem)
            </Label>
            <Input
              value={binding.source.key}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "local_storage", key: e.target.value },
                }))
              }
              placeholder="e.g. token, theme, user_prefs"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>
        )}

        {binding.source.kind === "cookie" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Cookie Name (document.cookie)
            </Label>
            <Input
              value={binding.source.cookieName}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "cookie", cookieName: e.target.value },
                }))
              }
              placeholder="e.g. session_token, csrftoken"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>
        )}

        {binding.source.kind === "state_var" && (() => {
          const source = binding.source;
          if (source.kind !== "state_var") return null;

          const currentStoreId = source.storeNodeId;
          const selectedStore = stateStores.find((s) => s.id === currentStoreId);
          const isLocal =
            source.sourceType === "local" ||
            (!selectedStore &&
              !source.storeName &&
              sectionStateVars.some((v) => v.name === source.stateKey));

          // Determine the type of the currently selected field
          const selectedFieldType: string = (() => {
            const key = source.stateKey;
            if (!key) return "";
            if (selectedStore) {
              return (selectedStore.data?.fields || []).find((f: any) => f.name === key)?.type || "";
            }
            if (isLocal) {
              return sectionStateVars.find((v) => v.name === key)?.type || "";
            }
            for (const s of stateStores) {
              const f = (s.data?.fields || []).find((f: any) => f.name === key);
              if (f) return f.type || "";
            }
            return "";
          })();

          const isArrayField =
            selectedFieldType.includes("[]") ||
            selectedFieldType.startsWith("Array<") ||
            selectedFieldType.startsWith("List<");

          const storeFieldOptions: ComboboxOption[] = selectedStore
            ? (selectedStore.data?.fields || []).map((f) => ({
                value: f.name,
                label: `${f.name} (${f.type || "string"})`,
                type: f.type || "string",
              }))
            : isLocal
            ? sectionStateVars.map((v) => ({
                value: v.name,
                label: `${v.name} (${v.type || "state"})`,
                type: v.type || "string",
              }))
            : [
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

          // Quick-access expression presets for arrays
          const arrayExprPresets = source.stateKey
            ? [
                { label: "Last item", expr: `${source.stateKey}[${source.stateKey}.length - 1]` },
                { label: "First item", expr: `${source.stateKey}[0]` },
                { label: "Count / length", expr: `${source.stateKey}.length` },
                { label: "Last item ID", expr: `${source.stateKey}[${source.stateKey}.length - 1]?.id` },
                { label: "Last item createdAt", expr: `${source.stateKey}[${source.stateKey}.length - 1]?.createdAt` },
              ]
            : [];

          return (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Source Store
                  </Label>
                  <Select
                    value={
                      isLocal
                        ? "__local__"
                        : selectedStore?.id || (stateStores[0]?.id ?? "__local__")
                    }
                    onValueChange={(val) => {
                      if (val === "__local__") {
                        const firstLocal = sectionStateVars[0]?.name || "";
                        onUpdate((prev) => ({
                          ...prev,
                          source: {
                            kind: "state_var",
                            sourceType: "local",
                            storeNodeId: undefined,
                            storeName: undefined,
                            stateKey:
                              firstLocal ||
                              (prev.source.kind === "state_var"
                                ? prev.source.stateKey
                                : ""),
                            fieldPath: undefined,
                          },
                        }));
                      } else {
                        const targetStore = stateStores.find((s) => s.id === val);
                        const storeName =
                          targetStore?.data?.label ||
                          targetStore?.data?.storeName ||
                          "Store";
                        const firstField = targetStore?.data?.fields?.[0]?.name || "";
                        onUpdate((prev) => ({
                          ...prev,
                          source: {
                            kind: "state_var",
                            sourceType: "store",
                            storeNodeId: targetStore?.id,
                            storeName,
                            stateKey:
                              firstField ||
                              (prev.source.kind === "state_var"
                                ? prev.source.stateKey
                                : ""),
                            fieldPath: undefined,
                          },
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue placeholder="Choose store..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stateStores.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          ⚡ {st.data?.label || st.data?.storeName || "Store"} (Zustand)
                        </SelectItem>
                      ))}
                      <SelectItem value="__local__">
                        📄 Page / Section State
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Store Field / Property
                  </Label>
                  <ActionFlowCombobox
                    value={source.stateKey}
                    onChange={(key) => {
                      onUpdate((prev) => {
                        const prevSrc =
                          prev.source.kind === "state_var"
                            ? prev.source
                            : { kind: "state_var", stateKey: key };
                        return {
                          ...prev,
                          source: {
                            ...prevSrc,
                            kind: "state_var",
                            stateKey: key,
                            fieldPath: undefined, // reset accessor when field changes
                          },
                        };
                      });
                    }}
                    placeholder="e.g. keyword, userId"
                    headerLabel="Available Store Fields"
                    options={storeFieldOptions}
                  />
                </div>
              </div>

              {/* Array accessor expression — shown when selected field is an array type */}
              {isArrayField && (
                <div className="p-2.5 rounded border border-blue-500/25 bg-blue-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1.5">
                      <Box size={12} />
                      Array Accessor Expression
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-4 font-mono text-blue-400 border-blue-500/30 bg-blue-500/10"
                    >
                      {selectedFieldType}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">
                      JS expression to extract a scalar value from the array
                    </Label>
                    <Input
                      value={source.fieldPath ?? ""}
                      onChange={(e) =>
                        onUpdate((prev) => ({
                          ...prev,
                          source: {
                            ...(prev.source as Extract<typeof prev.source, { kind: "state_var" }>),
                            kind: "state_var",
                            fieldPath: e.target.value,
                          },
                        }))
                      }
                      placeholder={`e.g. ${source.stateKey}[${source.stateKey}.length - 1]?.id`}
                      className="h-7 text-xs bg-background font-mono"
                      spellCheck={false}
                    />

                    {/* Quick preset chips */}
                    {arrayExprPresets.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {arrayExprPresets.map((p) => (
                          <button
                            key={p.expr}
                            type="button"
                            onClick={() =>
                              onUpdate((prev) => ({
                                ...prev,
                                source: {
                                  ...(prev.source as Extract<typeof prev.source, { kind: "state_var" }>),
                                  kind: "state_var",
                                  fieldPath: p.expr,
                                },
                              }))
                            }
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono border transition-colors cursor-pointer ${
                              source.fieldPath === p.expr
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-300"
                                : "bg-muted/40 border-border/50 text-muted-foreground hover:border-blue-500/40 hover:text-blue-400"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="text-[9px] text-muted-foreground/70 leading-tight">
                      Runtime:{" "}
                      <code className="text-blue-300 font-mono">
                        {source.fieldPath || source.stateKey}
                      </code>
                      {" "}— any valid JS expression evaluated at runtime.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {binding.source.kind === "prev_response" && (() => {
          const source = binding.source;
          if (source.kind !== "prev_response") return null;

          const selectedPriorStep = priorSteps.find(
            (s) => s.id === source.stepId,
          );
          const priorEndpoint = selectedPriorStep?.endpointId
            ? endpoints.find((ep) => ep.id === selectedPriorStep.endpointId)
            : undefined;

          return (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  From Step
                </Label>
                <Select
                  value={source.stepId}
                  onValueChange={(val) => {
                    onUpdate((prev) => ({
                      ...prev,
                      source: {
                        kind: "prev_response",
                        stepId: val,
                        fieldPath:
                          prev.source.kind === "prev_response"
                            ? prev.source.fieldPath
                            : "",
                      },
                    }));
                  }}
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
                  Response Field Path
                </Label>
                <ResponseFieldPicker
                  value={source.fieldPath}
                  onChange={(val) => {
                    onUpdate((prev) => ({
                      ...prev,
                      source: {
                        kind: "prev_response",
                        stepId:
                          prev.source.kind === "prev_response"
                            ? prev.source.stepId
                            : priorSteps[0]?.id || "",
                        fieldPath: val,
                      },
                    }));
                  }}
                  step={selectedPriorStep}
                  allNodes={allNodes}
                  endpoints={endpoints}
                  endpoint={priorEndpoint}
                  placeholder="e.g. data.id or token"
                />
              </div>
            </div>
          );
        })()}

        {binding.source.kind === "realtime_payload" && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">
                Stream Payload Property
              </Label>
              <span className="text-[9px] text-purple-400 font-mono">
                stream.{binding.source.fieldPath || "(entire payload)"}
              </span>
            </div>
            <ActionFlowCombobox
              value={binding.source.fieldPath || ""}
              onChange={(path) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "realtime_payload", fieldPath: path },
                }))
              }
              placeholder="e.g. data.id, message, userId (or leave empty for full payload)"
              headerLabel="Detected Incoming Stream Fields"
              options={[
                { value: "", label: "(Full Payload: incomingData)", type: "object" },
                ...(incomingPaths || []).map((p) => ({
                  value: p.path,
                  label: p.path,
                  type: p.type || "any",
                })),
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const ApiCallStep: React.FC<ApiCallStepProps> = ({
  draft,
  canvasStep,
  stepIndex,
  allSteps,
  serviceNodes = [],
  allNodes = [],
  endpoints = [],
  webPageNodeId,
  actionId,
  actionItem,
  isProtected = false,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemSourceStateName,
  itemPropSuggestions,
  onChange,
}) => {
  const bindings = draft.requestBindings || [];
  const priorSteps = allSteps.slice(0, stepIndex);

  const [collapsedSlots, setCollapsedSlots] = React.useState<Record<BindingSlot, boolean>>({
    header: false,
    path_param: false,
    query_param: false,
    body: false,
  });

  const toggleSlot = (slot: BindingSlot) => {
    setCollapsedSlots((prev) => ({ ...prev, [slot]: !prev[slot] }));
  };

  // Available services: either passed serviceNodes or filtered from allNodes
  const availableServices =
    serviceNodes.length > 0
      ? serviceNodes
      : allNodes.filter(
          (n) =>
            n.type === "service" ||
            n.type === "api_gateway" ||
            n.type === "serverless" ||
            n.type === "worker",
        );

  const currentServiceId = draft.serviceNodeId || canvasStep?.targetNodeId || "";
  const currentEndpointId = draft.endpointId || canvasStep?.endpointId || "";

  // Available endpoints for the currently selected service
  const serviceEndpoints = endpoints.filter(
    (ep) => ep.nodeId === currentServiceId,
  );

  const selectedEndpoint =
    serviceEndpoints.find((ep) => ep.id === currentEndpointId) ||
    canvasStep?.endpoint;

  const currentPageNode = React.useMemo(
    () => allNodes.find((n) => n.id === webPageNodeId),
    [allNodes, webPageNodeId],
  );

  const routeParamSuggestions: ComboboxOption[] = React.useMemo(() => {
    const params = currentPageNode?.data?.pathParams || [];
    return params.map((p) => ({
      value: p.name,
      label: p.name,
      type: p.type || "string",
    }));
  }, [currentPageNode?.data?.pathParams]);

  const queryParamSuggestions: ComboboxOption[] = React.useMemo(() => {
    const queries = currentPageNode?.data?.queryParams || [];
    return queries.map((q) => ({
      value: q.name,
      label: q.name,
      type: q.type || "string",
    }));
  }, [currentPageNode?.data?.queryParams]);

  const stateStores = React.useMemo(() => {
    return allNodes.filter((n) => n.type === "state_store");
  }, [allNodes]);

  const sectionStateVars = React.useMemo(() => {
    const pageNode = allNodes.find((n) => n.id === webPageNodeId);
    const sections: PageSection[] = pageNode?.data?.sections || [];
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
  }, [allNodes, webPageNodeId]);

  const currentAction = React.useMemo(() => {
    if (actionItem) return actionItem;
    const sections: PageSection[] = currentPageNode?.data?.sections || [];
    return sections
      .flatMap((s) => s.actions || [])
      .find((a) => a.id === actionId);
  }, [actionItem, currentPageNode, actionId]);

  const effectiveIsItemScoped = isItemScoped ?? Boolean(
    currentAction?.scope === "item" || currentAction?.itemSourceStateId,
  );
  const effectiveItemKeyField = itemKeyField || currentAction?.itemContextFields?.[0] || "id";

  const targetArrayState = React.useMemo(() => {
    const targetStateId = currentAction?.itemSourceStateId;
    const storeNodes =
      typeof useBackendCanvasStore?.getState === "function"
        ? useBackendCanvasStore.getState().nodes || []
        : [];
    const pool = allNodes && allNodes.length > 0 ? allNodes : storeNodes;
    if (targetStateId) {
      for (const n of pool) {
        const sections: PageSection[] = n.data?.sections || [];
        for (const s of sections) {
          const found = (s.stateObjects || []).find(
            (st) => st.id === targetStateId || st.name === targetStateId,
          );
          if (found) return found;
        }
      }
    }
    const pageSections: PageSection[] = currentPageNode?.data?.sections || [];
    return pageSections
      .flatMap((s) => s.stateObjects || [])
      .find(
        (st) =>
          st.type === "array" ||
          st.type?.endsWith("[]") ||
          st.type?.includes("[]"),
      );
  }, [allNodes, currentPageNode, currentAction?.itemSourceStateId]);

  const effectiveItemSourceStateName = itemSourceStateName || targetArrayState?.name;

  const effectiveItemPropSuggestions: ComboboxOption[] = React.useMemo(() => {
    const list: ComboboxOption[] = [];
    const seen = new Set<string>();

    const addOption = (opt: ComboboxOption) => {
      if (opt.value && !seen.has(opt.value)) {
        seen.add(opt.value);
        list.push(opt);
      }
    };

    // 1. Suggestions from props if passed
    (itemPropSuggestions || []).forEach(addOption);

    // 2. Dynamically resolved properties from targetArrayState and canvas defined types
    const fromState = resolveItemPropsFromState(targetArrayState, allNodes, effectiveItemKeyField, currentAction?.itemSourceStateId || effectiveItemSourceStateName);
    fromState.forEach(addOption);

    // 3. Current action context fields or identifier key
    if (effectiveItemKeyField && !seen.has(effectiveItemKeyField)) {
      list.unshift({
        value: effectiveItemKeyField,
        label: `${effectiveItemKeyField} (Key)`,
        type: "identifier",
      });
      seen.add(effectiveItemKeyField);
    }
    (currentAction?.itemContextFields || []).forEach((f: string) => {
      if (f && !seen.has(f)) {
        addOption({ value: f, label: f, type: "field" });
      }
    });

    // 4. Common identifier fallbacks if list is still empty
    if (list.length === 0) {
      ["id", "_id", "uuid", "name", "title", "slug", "key"].forEach((c) => {
        addOption({ value: c, label: c, type: "string" });
      });
    }

    return list;
  }, [effectiveItemKeyField, currentAction?.itemContextFields, itemPropSuggestions, targetArrayState, allNodes]);

  // Slot-specific field suggestions
  const headerSuggestions: ComboboxOption[] = React.useMemo(() => {
    const list: ComboboxOption[] = [];
    const seen = new Set<string>();

    if (isProtected || selectedEndpoint?.requireAuth !== false) {
      seen.add("Authorization");
      list.push({ value: "Authorization", label: "Authorization", type: "auth" });
    }

    (selectedEndpoint?.headers || []).forEach((h) => {
      if (h.name && !seen.has(h.name)) {
        seen.add(h.name);
        list.push({
          value: h.name,
          label: h.name,
          type: isAuthHeaderName(h.name) ? "auth" : "header",
        });
      }
    });

    const common = ["Content-Type", "Accept", "X-Api-Key", "X-Requested-With"];
    common.forEach((c) => {
      if (!seen.has(c)) {
        seen.add(c);
        list.push({ value: c, label: c, type: "header" });
      }
    });

    return list;
  }, [selectedEndpoint, isProtected]);

  const pathParamSuggestions: ComboboxOption[] = React.useMemo(() => {
    return (selectedEndpoint?.pathParams || []).map((p) => ({
      value: p.name,
      label: p.name,
      type: p.type || "path",
    }));
  }, [selectedEndpoint]);

  const epQueryParamSuggestions: ComboboxOption[] = React.useMemo(() => {
    const list: ComboboxOption[] = [];
    const seen = new Set<string>();

    (selectedEndpoint?.queryParams || []).forEach((q) => {
      if (q.name && !seen.has(q.name)) {
        seen.add(q.name);
        list.push({ value: q.name, label: q.name, type: q.type || "query" });
      }
    });

    return list;
  }, [selectedEndpoint]);

  const bodyFieldSuggestions: ComboboxOption[] = React.useMemo(() => {
    const list: ComboboxOption[] = [];
    const seen = new Set<string>();

    (selectedEndpoint?.requestBody?.fields || []).forEach((f) => {
      if (f.name && !seen.has(f.name)) {
        seen.add(f.name);
        list.push({ value: f.name, label: f.name, type: f.type || "body" });
      }
    });

    const rawJson = selectedEndpoint?.requestBody?.rawJson || selectedEndpoint?.body;
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [key, val] of Object.entries(parsed)) {
            if (!seen.has(key)) {
              seen.add(key);
              let valType = "body";
              if (typeof val === "string") valType = "string";
              else if (typeof val === "number") valType = "number";
              else if (typeof val === "boolean") valType = "boolean";
              else if (Array.isArray(val)) valType = "array";
              else if (typeof val === "object" && val !== null) valType = "object";
              list.push({ value: key, label: key, type: valType });
            }
          }
        }
      } catch {}
    }

    return list;
  }, [selectedEndpoint]);

  const handleServiceSelect = (newServiceId: string) => {
    const eps = endpoints.filter((ep) => ep.nodeId === newServiceId);
    const defaultEp = eps[0];
    const defaultEpId = defaultEp?.id || "";
    const oldEdgeId =
      draft.edgeId ||
      canvasStep?.edgeId ||
      canvasStep?.edge?.id;

    if (!newServiceId || !defaultEpId) {
      if (oldEdgeId) {
        cleanupActionStepEdge(oldEdgeId);
      }
      onChange({
        ...draft,
        serviceNodeId: newServiceId,
        endpointId: "",
        edgeId: undefined,
        requestBindings: [],
      });
      return;
    }

    let newEdgeId: string | undefined;
    if (webPageNodeId && actionId && defaultEpId) {
      newEdgeId = ensureActionServiceConnection({
        webPageNodeId,
        actionId,
        serviceNodeId: newServiceId,
        endpointId: defaultEpId,
        stepOrder: stepIndex + 1,
        previousEdgeId: oldEdgeId,
      });
    }

    const updatedBindings = defaultEp
      ? buildInitialBindingsFromEndpoint(defaultEp, isProtected, effectiveIsItemScoped, effectiveItemKeyField)
      : [];

    onChange({
      ...draft,
      serviceNodeId: newServiceId,
      endpointId: defaultEpId,
      edgeId: newEdgeId || oldEdgeId,
      requestBindings: updatedBindings,
    });
  };

  const handleEndpointSelect = (newEndpointId: string) => {
    const oldEdgeId =
      draft.edgeId ||
      canvasStep?.edgeId ||
      canvasStep?.edge?.id;

    if (!newEndpointId) {
      if (oldEdgeId) {
        cleanupActionStepEdge(oldEdgeId);
      }
      onChange({
        ...draft,
        endpointId: "",
        edgeId: undefined,
        requestBindings: [],
      });
      return;
    }

    let newEdgeId: string | undefined;
    if (webPageNodeId && actionId && currentServiceId) {
      newEdgeId = ensureActionServiceConnection({
        webPageNodeId,
        actionId,
        serviceNodeId: currentServiceId,
        endpointId: newEndpointId,
        stepOrder: stepIndex + 1,
        previousEdgeId: oldEdgeId,
      });
    }

    const newEndpoint = serviceEndpoints.find((ep) => ep.id === newEndpointId);
    const updatedBindings = newEndpoint
      ? buildInitialBindingsFromEndpoint(newEndpoint, isProtected, effectiveIsItemScoped, effectiveItemKeyField)
      : [];

    onChange({
      ...draft,
      endpointId: newEndpointId,
      edgeId: newEdgeId || oldEdgeId,
      requestBindings: updatedBindings,
    });
  };

  const handleResetToEndpointDefaults = () => {
    if (!selectedEndpoint) return;
    const freshBindings = buildInitialBindingsFromEndpoint(selectedEndpoint, isProtected, effectiveIsItemScoped, effectiveItemKeyField);
    onChange({
      ...draft,
      requestBindings: freshBindings,
    });
  };

  const handleAddBinding = (slot: BindingSlot, defaultTargetField = "") => {
    let defaultSource: FrontendFieldSource;
    if (slot === "header") {
      defaultSource = isAuthHeaderName(defaultTargetField)
        ? { kind: "auth_token", tokenType: "session" }
        : { kind: "literal", value: "" };
    } else if (slot === "path_param") {
      defaultSource = effectiveIsItemScoped
        ? {
            kind: "item_prop",
            propPath: defaultTargetField || effectiveItemKeyField || "id",
            fieldPath: defaultTargetField || effectiveItemKeyField || "id",
          }
        : {
            kind: "route_param",
            paramName: defaultTargetField || routeParamSuggestions[0]?.value || "",
          };
    } else if (slot === "query_param") {
      defaultSource = {
        kind: "query_param",
        paramName: defaultTargetField || queryParamSuggestions[0]?.value || "",
      };
    } else {
      defaultSource = { kind: "user_input", fieldName: defaultTargetField || "" };
    }

    const newBinding: FrontendRequestFieldBinding = {
      id: `bind-${slot[0]}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slot,
      targetField: defaultTargetField,
      source: defaultSource,
    };
    onChange({
      ...draft,
      requestBindings: [...bindings, newBinding],
    });
  };

  const handleUpdateBinding = (
    bindingId: string,
    updater: (prev: FrontendRequestFieldBinding) => FrontendRequestFieldBinding,
  ) => {
    const next = bindings.map((b) => (b.id === bindingId ? updater(b) : b));
    onChange({
      ...draft,
      requestBindings: next,
    });
  };

  const handleDeleteBinding = (bindingId: string) => {
    const next = bindings.filter((b) => b.id !== bindingId);
    onChange({
      ...draft,
      requestBindings: next,
    });
  };

  const handleKindChange = (
    bindingId: string,
    newKind: SourceKindOption,
  ) => {
    handleUpdateBinding(bindingId, (b) => {
      let nextSource: FrontendFieldSource;
      const isAuth = isAuthHeaderName(b.targetField);
      if (newKind === "auth_token") {
        nextSource = { kind: "auth_token", tokenType: "session" };
      } else if (newKind === "item_prop") {
        const prop = effectiveItemKeyField || b.targetField || "id";
        nextSource = { kind: "item_prop", propPath: prop, fieldPath: prop };
      } else if (newKind === "literal") {
        nextSource = { kind: "literal", value: "" };
      } else if (newKind === "state_var") {
        const firstStore = stateStores[0];
        const firstField = firstStore?.data?.fields?.[0]?.name || sectionStateVars[0]?.name || "";
        nextSource = {
          kind: "state_var",
          sourceType: firstStore ? "store" : "local",
          storeNodeId: firstStore?.id,
          storeName: firstStore?.data?.label || firstStore?.data?.storeName || "Store",
          stateKey: firstField,
        };
      } else if (newKind === "route_param") {
        nextSource = {
          kind: "route_param",
          paramName: routeParamSuggestions[0]?.value || b.targetField || "",
        };
      } else if (newKind === "query_param") {
        nextSource = {
          kind: "query_param",
          paramName: queryParamSuggestions[0]?.value || b.targetField || "",
        };
      } else if (newKind === "session_storage") {
        nextSource = {
          kind: "session_storage",
          key: isAuth ? "auth_token" : (b.targetField || ""),
        };
      } else if (newKind === "local_storage") {
        nextSource = {
          kind: "local_storage",
          key: isAuth ? "auth_token" : (b.targetField || ""),
        };
      } else if (newKind === "cookie") {
        nextSource = {
          kind: "cookie",
          cookieName: isAuth ? "better-auth.session_token" : (b.targetField || ""),
        };
      } else if (newKind === "prev_response") {
        const firstPrior = priorSteps[0];
        nextSource = {
          kind: "prev_response",
          stepId: firstPrior?.id || "",
          fieldPath: "",
        };
      } else if (newKind === "realtime_payload") {
        nextSource = {
          kind: "realtime_payload",
          fieldPath: incomingPaths?.[0]?.path || "",
        };
      } else {
        nextSource = { kind: "user_input", fieldName: b.targetField || "" };
      }
      return { ...b, source: nextSource };
    });
  };

  // Split bindings into the four request slots
  const headerBindings = bindings.filter((b) => b.slot === "header");
  const pathBindings = bindings.filter((b) => b.slot === "path_param");
  const queryBindings = bindings.filter((b) => b.slot === "query_param");
  const bodyBindings = bindings.filter((b) => b.slot === "body");

  // Endpoint defined path param names for read-only status
  const endpointPathParamNames = new Set(
    (selectedEndpoint?.pathParams || []).map((p) => p.name),
  );

  return (
    <div className="space-y-3 pt-1 text-xs">
      {/* Target Service & Endpoint Selection */}
      <div className="p-2.5 rounded-lg border bg-secondary/15 space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground text-[11px]">
          <Server size={13} className="text-primary" />
          <span>Connected Service &amp; Endpoint</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Service Picker */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Target Service</Label>
            <Select
              value={currentServiceId}
              onValueChange={handleServiceSelect}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue placeholder="Select service..." />
              </SelectTrigger>
              <SelectContent>
                {availableServices.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No backend services found on canvas
                  </SelectItem>
                ) : (
                  availableServices.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.data?.label || node.id} ({node.type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Endpoint Picker */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Endpoint / Route</Label>
            <Select
              value={currentEndpointId}
              onValueChange={handleEndpointSelect}
              disabled={!currentServiceId}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue placeholder="Select endpoint..." />
              </SelectTrigger>
              <SelectContent>
                {serviceEndpoints.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    No endpoints in selected service
                  </SelectItem>
                ) : (
                  serviceEndpoints.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      <span className="font-semibold text-primary uppercase text-[10px] mr-1">
                        {ep.type || "POST"}
                      </span>
                      <span>{ep.name || "/endpoint"}</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedEndpoint && (
          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5 truncate">
              <Badge variant="outline" className="text-[9px] uppercase font-mono px-1 py-0 h-4">
                {selectedEndpoint.type || "POST"}
              </Badge>
              <span className="font-mono text-foreground truncate">
                {selectedEndpoint.name || "/endpoint"}
              </span>
            </div>
            {selectedEndpoint.summary && (
              <span className="truncate max-w-[180px] italic">
                {selectedEndpoint.summary}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Slot-Aware Request Field Bindings Accordion */}
      {selectedEndpoint ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-foreground">
                Request Field Bindings ({bindings.length})
              </span>
              <p className="text-[11px] text-muted-foreground">
                Map page inputs, route params, storage, and state into endpoint slots
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetToEndpointDefaults}
              className="h-6 text-[10px] px-2 flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Regenerate all bindings fresh from endpoint schema"
            >
              <RefreshCw size={10} /> Reset Schema
            </Button>
          </div>

          {/* 1. HEADERS SLOT */}
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div
              onClick={() => toggleSlot("header")}
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/30 select-none transition-colors border-b border-border/40"
            >
              <div className="flex items-center gap-1.5">
                {collapsedSlots.header ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <Shield size={13} className="text-amber-500" />
                <span className="font-semibold text-foreground text-[11px]">HTTP Headers</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                  {headerBindings.length}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBinding("header");
                }}
                className="h-6 text-[10px] px-2 flex items-center gap-1 border-dashed cursor-pointer"
              >
                <Plus size={10} /> Add Header
              </Button>
            </div>

            {!collapsedSlots.header && (
              <div className="p-2 space-y-2">
                {headerBindings.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/80 py-1.5 text-center italic">
                    No headers configured. Add Authorization or custom HTTP request headers.
                  </div>
                ) : (
                  headerBindings.map((b) => (
                    <BindingSlotRow
                      key={b.id}
                      binding={b}
                      fieldSuggestions={headerSuggestions}
                      onUpdate={(updater) => handleUpdateBinding(b.id, updater)}
                      onDelete={() => handleDeleteBinding(b.id)}
                      onKindChange={(kind) => handleKindChange(b.id, kind)}
                      priorSteps={priorSteps}
                      endpoints={endpoints}
                      allNodes={allNodes}
                      routeParamSuggestions={routeParamSuggestions}
                      queryParamSuggestions={queryParamSuggestions}
                      stateStores={stateStores}
                      sectionStateVars={sectionStateVars}
                      incomingPaths={incomingPaths}
                      isItemScoped={effectiveIsItemScoped}
                      itemKeyField={effectiveItemKeyField}
                      itemSourceStateName={effectiveItemSourceStateName}
                      itemPropSuggestions={effectiveItemPropSuggestions}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. PATH PARAMS SLOT */}
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div
              onClick={() => toggleSlot("path_param")}
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/30 select-none transition-colors border-b border-border/40"
            >
              <div className="flex items-center gap-1.5">
                {collapsedSlots.path_param ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <MapPin size={13} className="text-blue-500" />
                <span className="font-semibold text-foreground text-[11px]">Path Parameters</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                  {pathBindings.length}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBinding("path_param");
                }}
                className="h-6 text-[10px] px-2 flex items-center gap-1 border-dashed cursor-pointer"
              >
                <Plus size={10} /> Add Param
              </Button>
            </div>

            {!collapsedSlots.path_param && (
              <div className="p-2 space-y-2">
                {pathBindings.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/80 py-1.5 text-center italic">
                    No path parameters in endpoint URL (e.g. :id or &#123;id&#125;).
                  </div>
                ) : (
                  pathBindings.map((b) => (
                    <BindingSlotRow
                      key={b.id}
                      binding={b}
                      fieldSuggestions={pathParamSuggestions}
                      isTargetReadOnly={endpointPathParamNames.has(b.targetField)}
                      onUpdate={(updater) => handleUpdateBinding(b.id, updater)}
                      onDelete={() => handleDeleteBinding(b.id)}
                      onKindChange={(kind) => handleKindChange(b.id, kind)}
                      priorSteps={priorSteps}
                      endpoints={endpoints}
                      allNodes={allNodes}
                      routeParamSuggestions={routeParamSuggestions}
                      queryParamSuggestions={queryParamSuggestions}
                      stateStores={stateStores}
                      sectionStateVars={sectionStateVars}
                      incomingPaths={incomingPaths}
                      isItemScoped={effectiveIsItemScoped}
                      itemKeyField={effectiveItemKeyField}
                      itemSourceStateName={effectiveItemSourceStateName}
                      itemPropSuggestions={effectiveItemPropSuggestions}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 3. QUERY PARAMS SLOT */}
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div
              onClick={() => toggleSlot("query_param")}
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/30 select-none transition-colors border-b border-border/40"
            >
              <div className="flex items-center gap-1.5">
                {collapsedSlots.query_param ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <SlidersHorizontal size={13} className="text-purple-500" />
                <span className="font-semibold text-foreground text-[11px]">Query Parameters</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                  {queryBindings.length}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBinding("query_param");
                }}
                className="h-6 text-[10px] px-2 flex items-center gap-1 border-dashed cursor-pointer"
              >
                <Plus size={10} /> Add Query
              </Button>
            </div>

            {!collapsedSlots.query_param && (
              <div className="p-2 space-y-2">
                {queryBindings.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/80 py-1.5 text-center italic">
                    No query parameters configured (e.g. ?search=...&amp;limit=...).
                  </div>
                ) : (
                  queryBindings.map((b) => (
                    <BindingSlotRow
                      key={b.id}
                      binding={b}
                      fieldSuggestions={epQueryParamSuggestions}
                      onUpdate={(updater) => handleUpdateBinding(b.id, updater)}
                      onDelete={() => handleDeleteBinding(b.id)}
                      onKindChange={(kind) => handleKindChange(b.id, kind)}
                      priorSteps={priorSteps}
                      endpoints={endpoints}
                      allNodes={allNodes}
                      routeParamSuggestions={routeParamSuggestions}
                      queryParamSuggestions={queryParamSuggestions}
                      stateStores={stateStores}
                      sectionStateVars={sectionStateVars}
                      incomingPaths={incomingPaths}
                      isItemScoped={effectiveIsItemScoped}
                      itemKeyField={effectiveItemKeyField}
                      itemSourceStateName={effectiveItemSourceStateName}
                      itemPropSuggestions={effectiveItemPropSuggestions}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* 4. REQUEST BODY SLOT */}
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <div
              onClick={() => toggleSlot("body")}
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/30 select-none transition-colors border-b border-border/40"
            >
              <div className="flex items-center gap-1.5">
                {collapsedSlots.body ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <Package size={13} className="text-emerald-500" />
                <span className="font-semibold text-foreground text-[11px]">Request Body</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                  {bodyBindings.length}
                </Badge>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddBinding("body");
                }}
                className="h-6 text-[10px] px-2 flex items-center gap-1 border-dashed cursor-pointer"
              >
                <Plus size={10} /> Add Field
              </Button>
            </div>

            {!collapsedSlots.body && (
              <div className="p-2 space-y-2">
                {bodyBindings.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/80 py-1.5 text-center italic">
                    {selectedEndpoint.type === "GET"
                      ? "GET requests typically do not have a body, but you can configure fields if required."
                      : "No request body fields configured."}
                  </div>
                ) : (
                  bodyBindings.map((b) => (
                    <BindingSlotRow
                      key={b.id}
                      binding={b}
                      fieldSuggestions={bodyFieldSuggestions}
                      onUpdate={(updater) => handleUpdateBinding(b.id, updater)}
                      onDelete={() => handleDeleteBinding(b.id)}
                      onKindChange={(kind) => handleKindChange(b.id, kind)}
                      priorSteps={priorSteps}
                      endpoints={endpoints}
                      allNodes={allNodes}
                      routeParamSuggestions={routeParamSuggestions}
                      queryParamSuggestions={queryParamSuggestions}
                      stateStores={stateStores}
                      sectionStateVars={sectionStateVars}
                      incomingPaths={incomingPaths}
                      isItemScoped={effectiveIsItemScoped}
                      itemKeyField={effectiveItemKeyField}
                      itemSourceStateName={effectiveItemSourceStateName}
                      itemPropSuggestions={effectiveItemPropSuggestions}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-dashed border-border/60 text-center text-muted-foreground">
          <Globe size={24} className="mx-auto mb-1.5 opacity-40" />
          <p className="text-[11px] font-medium text-foreground">No Endpoint Selected</p>
          <p className="text-[10px]">Select a backend service and endpoint above to configure request slot bindings.</p>
        </div>
      )}
    </div>
  );
};
