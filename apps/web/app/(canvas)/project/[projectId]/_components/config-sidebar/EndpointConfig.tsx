import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Parameter, PageSection, UIEventItem } from "@/types/canvas";
import {
  ParameterEditor,
} from "../backend-nodes/graph-nodes/Editors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useParams } from "next/navigation";
import { useCallerWebPageZone } from "./hooks/useCallerWebPageZone";
import { AuthAwarenessBanner } from "./AuthAwarenessBanner";
import { RoleMultiSelectDropdown } from "./RoleMultiSelectDropdown";
import { resolveAuthNodeForService } from "@/lib/compiler/generators/routeGenerator/handlers/authResolver";
import { RequestBodyEditor } from "./RequestBodyEditor";
import { NestedResponseSchemaEditor } from "./NestedResponseSchemaEditor";
import { EndpointTestCasesSection } from "./endpoint-testing/EndpointTestCasesSection";
import {
  PipelineStepEditor,
  type PipelineStepDraft,
} from "./PipelineStepEditor";
import { ChevronDown, ChevronRight, Globe, AlertCircle } from "lucide-react";
import { isEndpointPipelineUnconfigured } from "@/lib/utils/pipelineValidation";
import { useBufferedInput } from "@/lib/hooks/useBufferedInput";
import { cn } from "@workspace/ui/lib/utils";
import {
  formatEndpointRoute,
  sanitizeEndpointRoute,
  syncEndpointRouteWithPathParams,
  reconcileEndpointPathParams,
  parseEndpointRouteWithParams,
  computeCompiledEndpointRoute,
  Endpoint,
} from "@workspace/canvas";
import {
  isHealthEndpoint,
  getHealthCheckPipelineSteps,
  getHealthCheckResponseBody,
} from "@/lib/utils/healthCheckEndpoint";

interface EndpointConfigProps {
  id: string;
  nodeId: string;
}

export const EndpointConfig = ({ id, nodeId }: EndpointConfigProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  const [pipelineExpanded, setPipelineExpanded] = React.useState(true);
  const [responseSchemaTab, setResponseSchemaTab] = React.useState<"success" | "error">("success");
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const item = endpoints.find((e) => e.id === id);
  const targetNodeId = item?.nodeId || nodeId;
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === targetNodeId),
  );
  const isExternal = node?.type === "external";
  const authRules = node?.data.authRules || [];

  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const governingAuthNode = React.useMemo(
    () => resolveAuthNodeForService(node, allNodes, allEdges),
    [node, allNodes, allEdges],
  );

  // Must be called before any early returns (rules of hooks)
  const { isProtected, zoneName } = useCallerWebPageZone(nodeId, id);
  const isAuthEnabled =
    !isExternal &&
    (item?.requireAuth !== undefined ? item.requireAuth : isProtected);

  // Clean stale auth headers from any WebPage nodes or action events calling this endpoint
  const cleanConnectedWebPageNodes = React.useCallback(() => {
    if (!item) return;
    const currentNodes = useBackendCanvasStore.getState().nodes;
    const currentEdges = useBackendCanvasStore.getState().edges;

    currentNodes.forEach((n) => {
      if (n.type !== "webPage") return;

      const isDirectlyConnected = currentEdges.some((e) => {
        const matches =
          (e.target === targetNodeId && e.source === n.id) ||
          (e.source === targetNodeId && e.target === n.id);
        if (!matches) return false;
        const handle = e.target === targetNodeId ? e.targetHandle : e.sourceHandle;
        return !handle || handle.includes(item.id);
      });

      if (!isDirectlyConnected) return;

      let changed = false;
      const nextData = { ...n.data };

      // 1. Clean node.data.headers
      if (nextData.headers && nextData.headers.length > 0) {
        const filteredHeaders = nextData.headers.filter(
          (h: Parameter) =>
            h.name?.toLowerCase() !== "authorization" &&
            h.id !== "auth-bearer-header" &&
            !h.id?.startsWith("auth-"),
        );
        if (filteredHeaders.length !== nextData.headers.length) {
          nextData.headers = filteredHeaders;
          changed = true;
        }
      }

      // 2. Clean action headers in nextData.sections
      if (nextData.sections && nextData.sections.length > 0) {
        const updatedSections = nextData.sections.map((sec: PageSection) => {
          let secChanged = false;
          const updatedActions = (sec.actions || []).map((act: UIEventItem) => {
            const isActionConnected = currentEdges.some(
              (e) =>
                ((e.source === n.id && e.sourceHandle === `events-${act.id}`) ||
                  (e.target === n.id && e.targetHandle === `events-${act.id}`)) &&
                ((e.target === targetNodeId && e.targetHandle?.includes(item.id)) ||
                  (e.source === targetNodeId && e.sourceHandle?.includes(item.id))),
            );

            let stepBindingsChanged = false;
            let updatedSteps = act.actionSteps;
            if (act.actionSteps && act.actionSteps.length > 0) {
              updatedSteps = act.actionSteps.map((step) => {
                if (step.type === "api_call" && (step.endpointId === item.id || isActionConnected)) {
                  const filteredBindings = (step.requestBindings || []).filter(
                    (b) =>
                      !(
                        (b.targetField?.toLowerCase() === "authorization" ||
                          b.targetField?.toLowerCase() === "auth-bearer-header") &&
                        (b.source.kind === "auth_token" ||
                          (b.source.kind === "literal" && b.source.value === "Bearer <token>"))
                      ),
                  );
                  if (filteredBindings.length !== (step.requestBindings || []).length) {
                    stepBindingsChanged = true;
                    return { ...step, requestBindings: filteredBindings };
                  }
                }
                return step;
              });
            }

            if (isActionConnected || isDirectlyConnected) {
              const hasAuth = act.headers?.some(
                (h: Parameter) =>
                  h.name?.toLowerCase() === "authorization" ||
                  h.id === "auth-bearer-header" ||
                  h.id?.startsWith("auth-"),
              );
              if (hasAuth || stepBindingsChanged) {
                secChanged = true;
                return {
                  ...act,
                  headers: (act.headers || []).filter(
                    (h: Parameter) =>
                      h.name?.toLowerCase() !== "authorization" &&
                      h.id !== "auth-bearer-header" &&
                      !h.id?.startsWith("auth-"),
                  ),
                  ...(stepBindingsChanged ? { actionSteps: updatedSteps } : {}),
                };
              }
            } else if (stepBindingsChanged) {
              secChanged = true;
              return {
                ...act,
                actionSteps: updatedSteps,
              };
            }
            return act;
          });

          if (secChanged) {
            changed = true;
            return { ...sec, actions: updatedActions };
          }
          return sec;
        });

        if (changed) {
          nextData.sections = updatedSections;
        }
      }

      if (changed) {
        updateNode(n.id, { data: nextData });
      }
    });
  }, [item, targetNodeId, updateNode]);

  // Auto-clean any legacy or accidental auth headers/params on external endpoints or when auth is disabled
  React.useEffect(() => {
    if (isExternal && item) {
      const hasStaleAuthHeaders = item.headers?.some(
        (x: Parameter) =>
          x.id === "auth-bearer-header" ||
          x.id === "auth-header-external" ||
          x.id === "auth-query-external",
      );
      const hasStaleAuthQueries = item.queryParams?.some(
        (x: Parameter) => x.id === "auth-query-external",
      );
      if (hasStaleAuthHeaders || hasStaleAuthQueries) {
        updateEndpoint(item.id, {
          ...(hasStaleAuthHeaders
            ? {
                headers: (item.headers || []).filter(
                  (x: Parameter) =>
                    x.id !== "auth-bearer-header" &&
                    x.id !== "auth-header-external" &&
                    x.id !== "auth-query-external",
                ),
              }
            : {}),
          ...(hasStaleAuthQueries
            ? {
                queryParams: (item.queryParams || []).filter(
                  (x: Parameter) => x.id !== "auth-query-external",
                ),
              }
            : {}),
        });
      }
    } else if (!isAuthEnabled && item) {
      cleanConnectedWebPageNodes();
      const hasStaleAuthHeaders = item.headers?.some(
        (x: Parameter) =>
          x.id === "auth-bearer-header" ||
          x.id === "auth-header-external" ||
          x.id?.startsWith("auth-") ||
          x.name?.toLowerCase() === "authorization",
      );
      if (hasStaleAuthHeaders) {
        updateEndpoint(item.id, {
          headers: (item.headers || []).filter(
            (x: Parameter) =>
              x.id !== "auth-bearer-header" &&
              x.id !== "auth-header-external" &&
              !x.id?.startsWith("auth-") &&
              x.name?.toLowerCase() !== "authorization",
          ),
        });
      }
    }
  }, [isExternal, isAuthEnabled, item?.id, item?.headers, item?.queryParams, updateEndpoint, cleanConnectedWebPageNodes]);

  // Auto-initialize health check endpoints with standard contract if blank
  React.useEffect(() => {
    if (!item || isExternal) return;
    if (isHealthEndpoint(item)) {
      const needsPipelineInit =
        !item.pipelineSteps ||
        item.pipelineSteps.length === 0 ||
        (item.pipelineSteps.length === 1 &&
          item.pipelineSteps[0]?.type === "return_response" &&
          (!item.pipelineSteps[0]?.inputBindings || item.pipelineSteps[0]?.inputBindings.length === 0));

      const needsResponseBodyInit =
        !item.responseBody ||
        !item.responseBody.fields ||
        item.responseBody.fields.length === 0;

      const serviceName = node?.data?.label || "service";
      const servicePort = String(node?.data?.port || "8080");

      const returnStep = item.pipelineSteps?.find((s) => s.type === "return_response");
      const serviceBinding = returnStep?.inputBindings?.find((b) => b.argName === "service");
      const hasStaleServiceName =
        serviceBinding?.source.kind === "inline" &&
        serviceBinding.source.value !== serviceName &&
        (serviceBinding.source.value === "service" || serviceName !== "service");

      if (needsPipelineInit || needsResponseBodyInit || item.name === "/" || hasStaleServiceName) {
        updateEndpoint(item.id, {
          ...(item.name === "/" ? { name: "/health" } : {}),
          ...(needsPipelineInit || hasStaleServiceName
            ? { pipelineSteps: getHealthCheckPipelineSteps(serviceName, servicePort) }
            : {}),
          ...(needsResponseBodyInit || hasStaleServiceName
            ? { responseBody: getHealthCheckResponseBody(item.id, serviceName, servicePort) }
            : {}),
        });
      }
    }
  }, [item?.id, item?.name, item?.summary, item?.businessLogic, item?.pipelineSteps, item?.responseBody, isExternal, node?.data?.label, node?.data?.port, updateEndpoint]);

  const handleRouteChange = React.useCallback(
    (rawInput: string) => {
      const parsed = parseEndpointRouteWithParams(rawInput);
      const cleanNewRoute = parsed.route;
      const oldRoute = item?.name || "";

      // Reconcile path params
      const reconciledPathParams = reconcileEndpointPathParams({
        currentPathParams: item?.pathParams || [],
        newRoute: cleanNewRoute,
        oldRoute,
      });

      // Merge any query params that were typed in the route (e.g. ?limit=10)
      const existingQueryParams = item?.queryParams || [];
      const mergedQueryParams = [...existingQueryParams];
      let queryParamsChanged = false;
      const pathParamNames = new Set(
        reconciledPathParams
          .map((p) => (p.name || "").trim().toLowerCase())
          .filter((n) => n.length > 0),
      );
      parsed.extractedQueryParams.forEach((eq) => {
        const lower = eq.name.toLowerCase();
        if (pathParamNames.has(lower)) {
          return;
        }
        if (!mergedQueryParams.some((q) => q.name.toLowerCase() === lower)) {
          mergedQueryParams.push(eq);
          queryParamsChanged = true;
        }
      });

      const updates: Partial<Endpoint> = { name: cleanNewRoute };
      const pathParamsChanged =
        reconciledPathParams.length !== (item?.pathParams || []).length ||
        JSON.stringify(reconciledPathParams) !== JSON.stringify(item?.pathParams || []);

      if (pathParamsChanged) {
        updates.pathParams = reconciledPathParams;
      }
      if (queryParamsChanged) {
        updates.queryParams = mergedQueryParams;
      }

      updateEndpoint(id, updates);
    },
    [id, item?.name, item?.pathParams, item?.queryParams, updateEndpoint],
  );

  const nameBuffer = useBufferedInput(
    formatEndpointRoute(item?.name || ""),
    handleRouteChange,
    200,
  );

  // Auto-synchronize endpoint route with pathParams if any are missing or out of sync
  React.useEffect(() => {
    if (!item) return;
    const currentRoute = item.name || "";
    const syncedRoute = syncEndpointRouteWithPathParams({
      currentRoute,
      oldPathParams: [],
      newPathParams: item.pathParams || [],
    });
    if (syncedRoute && syncedRoute !== currentRoute) {
      updateEndpoint(item.id, { name: syncedRoute });
    }
  }, [item?.id, item?.name, item?.pathParams, updateEndpoint]);

  const summaryBuffer = useBufferedInput(
    item?.summary || "",
    React.useCallback(
      (summary: string) => updateEndpoint(id, { summary }),
      [id, updateEndpoint],
    ),
    200,
  );

  const scopesBuffer = useBufferedInput(
    item?.requiredScopes?.join(", ") || "",
    React.useCallback(
      (val: string) =>
        updateEndpoint(id, {
          requiredScopes: val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      [id, updateEndpoint],
    ),
    200,
  );

  const audienceBuffer = useBufferedInput(
    item?.audience || "",
    React.useCallback(
      (audience: string) => updateEndpoint(id, { audience }),
      [id, updateEndpoint],
    ),
    200,
  );

  if (!item) return null;

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      {/* Endpoint Header - Method and Path are editable */}
      <div className="flex flex-col gap-2.5 border-b border-border/50 pb-6">
        {isExternal && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              External API Endpoint
            </span>
            {node?.data?.baseUrl?.trim() ? (
              <span className="text-[11px] font-mono text-muted-foreground truncate">
                Base: {node.data.baseUrl}
              </span>
            ) : (
              <span className="text-[10px] font-bold text-destructive bg-destructive/15 px-2 py-0.5 rounded border border-destructive/30 flex items-center gap-1">
                <AlertCircle size={11} /> Base URL not configured
              </span>
            )}
          </div>
        )}

        {isExternal && !node?.data?.baseUrl?.trim() && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs leading-relaxed">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[11px]">
                Base URL Not Configured
              </span>
              <span className="text-[10px] opacity-90">
                The parent external service does not have a Base URL configured. Calling this endpoint from pipelines or code will fail without a target host URL.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Select
            value={item.type || (isExternal ? "POST" : "GET")}
            onValueChange={(type) => updateEndpoint(item.id, { type })}
          >
            <SelectTrigger className="h-8 w-[95px] text-xs font-mono font-bold bg-primary/15 text-primary border-primary/30 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                <SelectItem key={m} value={m} className="text-xs font-mono">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="h-8 text-sm font-semibold tracking-tight text-foreground bg-background font-mono flex-1"
            placeholder="/v1/resource"
            value={nameBuffer.value}
            onChange={(e) => nameBuffer.onChange(formatEndpointRoute(e.target.value))}
            onBlur={nameBuffer.flush}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {isExternal
              ? "Configure request parameters and declare the output structure callers bind to."
              : "Configure endpoint details and behavior."}
          </span>
          {Boolean(
            (item.queryParams && item.queryParams.length > 0) ||
            (item.pathParams && item.pathParams.length > 0)
          ) && (
            <span
              className="text-[11px] font-mono text-muted-foreground/80 truncate max-w-[280px]"
              title={`Full Pattern: ${computeCompiledEndpointRoute({ route: nameBuffer.value || "/", queryParams: item.queryParams, pathParams: item.pathParams })}`}
            >
              Pattern:{" "}
              <span className="text-foreground font-semibold">
                {computeCompiledEndpointRoute({
                  route: nameBuffer.value || "/",
                  queryParams: item.queryParams,
                  pathParams: item.pathParams,
                })}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Authentication */}
      {!isExternal && (
        <AuthAwarenessBanner
          zoneName={zoneName}
          isProtected={isProtected}
          requireAuth={isAuthEnabled}
          onRequireAuthChange={(requireAuth) => {
            let updatedHeaders = [...(item.headers || [])];
            if (requireAuth) {
              if (
                !updatedHeaders.some(
                  (h) =>
                    h.name?.toLowerCase() === "authorization" ||
                    h.id === "auth-bearer-header",
                )
              ) {
                updatedHeaders = [
                  {
                    id: "auth-bearer-header",
                    name: "Authorization",
                    type: "string",
                    required: true,
                    description: "Bearer <token>",
                    defaultValue: "Bearer <token>",
                    key: "Authorization",
                    value: "Bearer <token>",
                  },
                  ...updatedHeaders,
                ];
              }
            } else {
              updatedHeaders = updatedHeaders.filter(
                (h) =>
                  h.name?.toLowerCase() !== "authorization" &&
                  h.id !== "auth-bearer-header" &&
                  !h.id?.startsWith("auth-"),
              );
            }
            if (!requireAuth) {
              cleanConnectedWebPageNodes();
            }
            updateEndpoint(item.id, { requireAuth, headers: updatedHeaders });
          }}
        />
      )}

      {/* Per-endpoint role restriction for regular service endpoints */}
      {!isExternal && node?.type !== "api_gateway" && isAuthEnabled && (
        <div className="flex flex-col gap-1.5 px-1">
          <Label className="text-xs text-muted-foreground">
            Required Roles (Optional)
          </Label>
          <RoleMultiSelectDropdown
            selectedRoles={item.requiredRoles || []}
            onChange={(requiredRoles) => updateEndpoint(item.id, { requiredRoles })}
            authNode={governingAuthNode}
            placeholder="Any authenticated user"
          />
        </div>
      )}

      {node?.type === "api_gateway" && (
        <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Auth Rule
            </span>
            <Select
              value={item.authRuleId || "__none__"}
              onValueChange={(authRuleId) =>
                updateEndpoint(item.id, {
                  authRuleId:
                    authRuleId === "__none__" ? undefined : authRuleId,
                })
              }
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select an auth rule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No auth rule</SelectItem>
                {authRules
                  .filter((rule) => rule.name.trim())
                  .map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name} ({rule.type})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Choose a reusable gateway policy for this endpoint.
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Authorization
            </span>
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">
                  Required Roles
                </Label>
                <RoleMultiSelectDropdown
                  selectedRoles={item.requiredRoles || []}
                  onChange={(requiredRoles) => updateEndpoint(item.id, { requiredRoles })}
                  authNode={governingAuthNode}
                  placeholder="Any authenticated user"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">
                  Required Scopes (Comma separated)
                </Label>
                <Input
                  className="h-7 text-xs bg-background"
                  placeholder="e.g. read:users, write:users"
                  value={scopesBuffer.value}
                  onChange={(e) => scopesBuffer.onChange(e.target.value)}
                  onBlur={scopesBuffer.flush}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Audience</Label>
                <Input
                  className="h-7 text-xs bg-background"
                  placeholder="e.g. my-api"
                  value={audienceBuffer.value}
                  onChange={(e) => audienceBuffer.onChange(e.target.value)}
                  onBlur={audienceBuffer.flush}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
          Summary
        </Label>
        <Input
          className="bg-background/50"
          placeholder="e.g. Returns all users."
          value={summaryBuffer.value}
          onChange={(e) => summaryBuffer.onChange(e.target.value)}
          onBlur={summaryBuffer.flush}
        />
      </div>



      <ParameterEditor
        title="Headers"
        isExternal={isExternal}
        parameters={(() => {
          let h = item.headers || [];
          if (isExternal) {
            return h.filter(
              (x: Parameter) =>
                x.id !== "auth-bearer-header" &&
                x.id !== "auth-header-external" &&
                x.id !== "auth-query-external",
            );
          }
          if (isAuthEnabled) {
            if (
              !h.some(
                (x: Parameter) =>
                  x.name?.toLowerCase() === "authorization" ||
                  x.id === "auth-bearer-header",
              )
            ) {
              h = [
                {
                  id: "auth-bearer-header",
                  name: "Authorization",
                  type: "string",
                  required: true,
                  description: "Bearer <token>",
                  defaultValue: "Bearer <token>",
                  key: "Authorization",
                  value: "Bearer <token>",
                },
                ...h,
              ];
            }
          } else {
            h = h.filter(
              (x: Parameter) =>
                x.name?.toLowerCase() !== "authorization" &&
                x.id !== "auth-bearer-header" &&
                !x.id?.startsWith("auth-"),
            );
          }
          return h;
        })()}
        onChange={(headers) => {
          const sanitized = isAuthEnabled
            ? headers
            : headers.filter(
                (x: Parameter) =>
                  x.name?.toLowerCase() !== "authorization" &&
                  x.id !== "auth-bearer-header" &&
                  !x.id?.startsWith("auth-"),
              );
          updateEndpoint(item.id, { headers: sanitized });
          if (!isAuthEnabled) {
            cleanConnectedWebPageNodes();
          }
        }}
      />
      <ParameterEditor
        title="Path Params"
        isExternal={isExternal}
        parameters={item.pathParams || []}
        disallowedNames={(item.queryParams || [])
          .map((q) => (q.name || "").trim().toLowerCase())
          .filter((n) => n.length > 0)}
        disallowedReason="Query Params"
        onChange={(newPathParams) => {
          const currentRoute = item.name || "";
          const nextRoute = syncEndpointRouteWithPathParams({
            currentRoute,
            oldPathParams: item.pathParams || [],
            newPathParams,
          });
          const updates: Partial<Endpoint> = { pathParams: newPathParams };
          if (nextRoute !== currentRoute) {
            updates.name = nextRoute;
          }
          updateEndpoint(item.id, updates);
        }}
      />
      <ParameterEditor
        title="Query Params"
        isExternal={isExternal}
        parameters={(() => {
          let q = item.queryParams || [];
          if (isExternal) {
            return q.filter((x: Parameter) => x.id !== "auth-query-external");
          }
          return q;
        })()}
        disallowedNames={(item.pathParams || [])
          .map((p) => (p.name || "").trim().toLowerCase())
          .filter((n) => n.length > 0)}
        disallowedReason="Path Params"
        onChange={(queryParams) => updateEndpoint(item.id, { queryParams })}
      />
      <RequestBodyEditor
        mode={
          item.requestBodyMode ??
          (item.requestBody?.rawJson ? "raw_json" : "field_builder")
        }
        onModeChange={(requestBodyMode) =>
          updateEndpoint(item.id, { requestBodyMode })
        }
        schema={
          item.requestBody ||
          (item.params && item.params.length > 0
            ? { id: item.id, fields: item.params, rawJson: item.body || "" }
            : item.body
            ? { id: item.id, rawJson: item.body, fields: [] }
            : { id: item.id, fields: [] })
        }
        onSchemaChange={(requestBody) =>
          updateEndpoint(item.id, { requestBody })
        }
      />

      {/* Dual Return Schemas: External APIs only (internal endpoints configure return contract in Return Response step) */}
      {isExternal && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-secondary/30 border border-border/50">
            <button
              type="button"
              onClick={() => setResponseSchemaTab("success")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                responseSchemaTab === "success"
                  ? "bg-background text-foreground shadow-xs font-semibold border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Success Output Schema (2xx)</span>
            </button>
            <button
              type="button"
              onClick={() => setResponseSchemaTab("error")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                responseSchemaTab === "error"
                  ? "bg-background text-foreground shadow-xs font-semibold border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
              <span>Error Output Schema (4xx/5xx)</span>
              {item.errorResponseBody &&
                item.errorResponseBody.fields &&
                item.errorResponseBody.fields.length > 0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-destructive/15 text-destructive font-mono">
                    {item.errorResponseBody.fields.length}
                  </span>
                )}
            </button>
          </div>

          {responseSchemaTab === "success" ? (
            <NestedResponseSchemaEditor
              title="Success Output Schema (2xx)"
              subtitle="External API return contract for 2xx responses. Declare the nested JSON structure returned by this endpoint so callers can bind to its fields."
              isExternal={true}
              mode={item.responseMode === "raw_json" ? "raw_json" : "field_builder"}
              onModeChange={(responseMode) => updateEndpoint(item.id, { responseMode })}
              schema={item.responseBody || { id: `res_${item.id}`, fields: [] }}
              onSchemaChange={(responseBody) => updateEndpoint(item.id, { responseBody })}
            />
          ) : (
            <NestedResponseSchemaEditor
              title="Error Output Schema (4xx/5xx)"
              subtitle="External API error contract. Declare the error JSON payload returned on failure (e.g. 400, 404, 500) so callers can inspect error details."
              isExternal={true}
              mode={item.responseMode === "raw_json" ? "raw_json" : "field_builder"}
              onModeChange={(responseMode) => updateEndpoint(item.id, { responseMode })}
              schema={
                item.errorResponseBody || {
                  id: `res_err_${item.id}`,
                  fields: [
                    { id: "err_1", name: "error", type: "string", required: true, key: "error", value: "" },
                    { id: "err_2", name: "message", type: "string", required: true, key: "message", value: "" },
                    { id: "err_3", name: "statusCode", type: "number", required: false, key: "statusCode", value: "" },
                  ],
                }
              }
              onSchemaChange={(errorResponseBody) => updateEndpoint(item.id, { errorResponseBody })}
            />
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* PIPELINE STEPS SECTION (Internal Microservices only)              */}
      {/* ---------------------------------------------------------------- */}
      {isExternal ? (
        <div className="p-4 rounded-xl border border-dashed border-border/80 bg-muted/20 text-xs text-muted-foreground flex flex-col gap-1.5">
          <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
            <Globe size={14} className="text-emerald-500" />
            External Service Contract
          </span>
          <span className="text-[11px] leading-relaxed">
            This endpoint is hosted externally by a third party. Microservices on your canvas can invoke this endpoint using an <strong>External API Call</strong> step, and subsequent pipeline steps will automatically have access to all nested output properties defined in the schema above.
          </span>
        </div>
      ) : (
        (() => {
          const isPipelineRed = isEndpointPipelineUnconfigured(
            item,
            nodeId,
            allNodes,
            allEdges,
          );

          return (
            <div className="flex flex-col gap-2 border border-border/40 rounded-xl overflow-hidden transition-colors">
              {/* Collapsible header */}
              <button
                className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors text-left"
                onClick={() => setPipelineExpanded((v) => !v)}
              >
                <div>
                  <p className="text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5 flex-wrap">
                    <span>Pipeline Steps</span>
                    {item.pipelineSteps && item.pipelineSteps.length > 0 && (
                      <span className="text-[9px] text-primary/70 font-mono bg-primary/10 px-1.5 py-0.5 rounded-full">
                        {item.pipelineSteps.length} step{item.pipelineSteps.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isPipelineRed && (
                      <span className="text-[9px] font-bold text-destructive font-mono bg-destructive/15 border border-destructive/30 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        ⚠️ Unconfigured Inputs
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                    Explicit field-level bindings per step — compiler generates exactly what you configure.
                  </p>
                </div>
                {pipelineExpanded ? (
                  <ChevronDown size={13} className="text-muted-foreground/50 shrink-0" />
                ) : (
                  <ChevronRight size={13} className="text-muted-foreground/50 shrink-0" />
                )}
              </button>

              {pipelineExpanded && (
                <div className="px-3 pb-3">
                  <PipelineStepEditor
                    steps={item.pipelineSteps || []}
                    onChange={(steps) =>
                      updateEndpoint(item.id, { pipelineSteps: steps })
                    }
                    onEndpointChange={(changes) =>
                      updateEndpoint(item.id, changes)
                    }
                    endpoint={item}
                    allNodes={allNodes}
                    allEdges={allEdges}
                    serviceNodeId={nodeId}
                  />
                </div>
              )}
            </div>
          );
        })()
      )}

      <EndpointTestCasesSection
        endpoint={item}
        nodeId={nodeId}
        serviceNode={node}
      />
    </div>
  );
};
