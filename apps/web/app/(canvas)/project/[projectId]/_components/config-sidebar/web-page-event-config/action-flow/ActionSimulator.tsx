"use client";

import React, { useState, useMemo } from "react";
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  Zap,
  Globe,
  Bell,
  Navigation,
  Upload,
  Sliders,
  ChevronDown,
  ChevronRight,
  Sparkles,
  HardDrive,
  Radio,
  Box,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";
import type { BackendNode, Endpoint, UIEventItem, JSONValue, JSONObject, FrontendFieldSource } from "@workspace/canvas";
import type { FrontendActionStepDraft, FrontendRequestFieldBinding, QueryParamUpdateItem, AvailablePath } from "./types";
import type { ActionStepItem } from "../TargetEndpointSection";
import { isAuthHeaderName, deriveStepsFromEdges } from "./utils";

export interface ActionSimulatorProps {
  item: UIEventItem;
  steps: FrontendActionStepDraft[];
  canvasSteps?: ActionStepItem[];
  allNodes: BackendNode[];
  endpoints: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  isProtected?: boolean;
  isRealtime?: boolean;
  incomingPaths?: AvailablePath[];
}

interface SimulatedStepLog {
  stepIndex: number;
  stepId: string;
  type: string;
  name: string;
  status: "success" | "skipped" | "failed";
  details?: {
    request?: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: JSONValue;
      params?: Record<string, string>;
    };
    response?: {
      status: number;
      data: JSONValue;
    };
    transformer?: {
      functionName: string;
      inputs: Record<string, JSONValue>;
      output: Record<string, JSONValue>;
      outputVariable: string;
    };
    mutation?: {
      targetStore?: string;
      field: string;
      prevValue?: JSONValue;
      nextValue?: JSONValue;
    };
    notification?: {
      level: string;
      message: string;
    };
    navigation?: {
      targetRoute: string;
      resolvedRoute?: string;
      method?: string;
    };
    storage?: {
      engine: string;
      operation: string;
      key: string;
      prevValue?: string;
      nextValue?: string;
    };
    auth?: {
      operation: string;
      sessionCleared?: boolean;
      clearedCookies?: string[];
      clearedStorage?: string[];
      user?: Record<string, string>;
      sessionToken?: string;
      outputVariable?: string;
      activeOrgId?: string;
    };
  };
}

export const ActionSimulator: React.FC<ActionSimulatorProps> = ({
  item,
  steps = [],
  canvasSteps = [],
  allNodes = [],
  endpoints = [],
  webPageNodeId = "",
  isProtected = false,
  isRealtime = false,
  incomingPaths = [],
}) => {
  const currentPageNode = useMemo(
    () => allNodes.find((n) => n.id === webPageNodeId),
    [allNodes, webPageNodeId],
  );

  const stateStores = useMemo(
    () => allNodes.filter((n) => n.type === "state_store"),
    [allNodes],
  );

  const effectiveSteps = useMemo(() => {
    if (steps && steps.length > 0) return steps;
    return deriveStepsFromEdges(canvasSteps, undefined, isProtected);
  }, [steps, canvasSteps, isProtected]);

  // Discover all inputs required across all steps
  const initialContext = useMemo(() => {
    const ctx: {
      stores: Record<string, Record<string, JSONValue>>;
      localState: Record<string, JSONValue>;
      inputs: Record<string, JSONValue>;
      routeParams: Record<string, string>;
      queryParams: Record<string, string>;
      sessionStorage: Record<string, string>;
      localStorage: Record<string, string>;
      cookies: Record<string, string>;
      incomingPayload: Record<string, JSONValue>;
      itemContext: Record<string, JSONValue>;
    } = {
      stores: {},
      localState: {},
      inputs: {},
      routeParams: {},
      queryParams: {},
      sessionStorage: {},
      localStorage: {},
      cookies: {},
      incomingPayload: {},
      itemContext: {},
    };

    // Initialize stores with their actual node field default values
    stateStores.forEach((st) => {
      const sName = st.data?.label || st.data?.storeName || st.id;
      ctx.stores[sName] = {};
      (st.data?.fields || []).forEach((f) => {
        ctx.stores[sName]![f.name] = f.defaultValue ?? (f.type === "number" ? 0 : f.type === "boolean" ? false : f.type === "array" ? [] : "");
      });
    });

    // Initialize local section state
    (currentPageNode?.data?.sections || []).forEach((sec) => {
      (sec.stateObjects || []).forEach((st) => {
        ctx.localState[st.name] = st.defaultValue ?? (st.type === "number" ? 0 : st.type === "boolean" ? false : "");
      });
      (sec.states || []).forEach((st) => {
        ctx.localState[st.name] = st.defaultValue ?? "";
      });
    });

    // Initialize route and query params
    (currentPageNode?.data?.pathParams || []).forEach((p) => {
      ctx.routeParams[p.name] = p.defaultValue || "sample-id";
    });
    (currentPageNode?.data?.queryParams || []).forEach((q) => {
      ctx.queryParams[q.name] = q.defaultValue || "sample-query";
    });

    // Initialize incoming stream payload if realtime connection
    if (isRealtime) {
      const samplePayload: Record<string, JSONValue> = {};
      if (incomingPaths && incomingPaths.length > 0) {
        incomingPaths.forEach((ip) => {
          const parts = ip.path.split(".");
          let target: Record<string, any> = samplePayload;
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i]!;
            if (!target[p] || typeof target[p] !== "object") {
              target[p] = {};
            }
            target = target[p];
          }
          const last = parts[parts.length - 1]!;
          target[last] = ip.type === "number" ? 123 : ip.type === "boolean" ? true : `sample_${last}`;
        });
      } else {
        samplePayload["message"] = "Simulated real-time message";
        samplePayload["id"] = "evt_sim_101";
        samplePayload["status"] = "delivered";
      }
      ctx.incomingPayload = samplePayload;
    }

    // Scan steps for specific form inputs or values used
    const scanSource = (src?: FrontendFieldSource) => {
      if (!src) return;
      if (src.kind === "user_input" && src.fieldName) {
        if (!(src.fieldName in ctx.inputs)) {
          ctx.inputs[src.fieldName] = `test_${src.fieldName}`;
        }
      } else if (src.kind === "session_storage" && src.key) {
        if (!(src.key in ctx.sessionStorage)) {
          ctx.sessionStorage[src.key] = `test_${src.key}`;
        }
      } else if (src.kind === "local_storage" && src.key) {
        if (!(src.key in ctx.localStorage)) {
          ctx.localStorage[src.key] = `test_${src.key}`;
        }
      } else if (src.kind === "cookie" && src.cookieName) {
        if (!(src.cookieName in ctx.cookies)) {
          ctx.cookies[src.cookieName] = `test_${src.cookieName}`;
        }
      } else if (src.kind === "auth_token") {
        if (!ctx.cookies["better-auth.session_token"]) {
          ctx.cookies["better-auth.session_token"] = "session_token_simulated_auth";
        }
        if (!ctx.localStorage["auth_token"]) {
          ctx.localStorage["auth_token"] = "Bearer simulated-session-token";
        }
      } else if (src.kind === "item_prop") {
        const prop = src.propPath || src.fieldPath || item?.itemContextFields?.[0] || "id";
        if (!(prop in ctx.itemContext)) {
          ctx.itemContext[prop] = prop === "id" ? "item_101" : `sample_${prop}`;
        }
      } else if (src.kind === "realtime_payload") {
        if (!ctx.incomingPayload || Object.keys(ctx.incomingPayload).length === 0) {
          ctx.incomingPayload = { message: "Sample live payload", id: "evt_101" };
        }
      }
    };

    effectiveSteps.forEach((s: FrontendActionStepDraft) => {
      (s.requestBindings || []).forEach((b: FrontendRequestFieldBinding) => scanSource(b.source));
      scanSource(s.stateValueSource);
      scanSource(s.queryParamValueSource);
      (s.queryParamsUpdates || []).forEach((u: QueryParamUpdateItem) => scanSource(u.valueSource));
    });

    if (isProtected) {
      if (!ctx.cookies["better-auth.session_token"]) {
        ctx.cookies["better-auth.session_token"] = "session_token_simulated_auth";
      }
      if (!ctx.localStorage["auth_token"]) {
        ctx.localStorage["auth_token"] = "Bearer simulated-session-token";
      }
    }

    return ctx;
  }, [stateStores, currentPageNode, effectiveSteps, isProtected, isRealtime, incomingPaths]);

  const [testContext, setTestContext] = useState(initialContext);
  const [isRunning, setIsRunning] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<SimulatedStepLog[] | null>(null);
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  const handleResetContext = () => {
    setTestContext(initialContext);
    setExecutionLogs(null);
  };

  const runSimulation = async () => {
    setIsRunning(true);
    setExecutionLogs(null);

    const logs: SimulatedStepLog[] = [];
    const runtimeState: {
      stores: Record<string, Record<string, JSONValue>>;
      localState: Record<string, JSONValue>;
      inputs: Record<string, JSONValue>;
      routeParams: Record<string, string>;
      queryParams: Record<string, string>;
      sessionStorage: Record<string, string>;
      localStorage: Record<string, string>;
      cookies: Record<string, string>;
      incomingPayload: Record<string, JSONValue>;
      itemContext: Record<string, JSONValue>;
    } = JSON.parse(JSON.stringify(testContext));
    const stepResponses: Record<string, JSONValue> = {};

    // Helper to evaluate source
    const resolveSourceValue = (source: FrontendFieldSource | undefined): JSONValue | undefined => {
      if (!source) return undefined;
      if (source.kind === "literal") return source.value;
      if (source.kind === "state_var") {
        const storeObj = source.storeName ? runtimeState.stores[source.storeName] : undefined;
        if (storeObj) {
          return storeObj[source.stateKey];
        }
        return runtimeState.localState[source.stateKey];
      }
      if (source.kind === "item_prop") {
        const prop = source.propPath || source.fieldPath || item?.itemContextFields?.[0] || "id";
        return runtimeState.itemContext?.[prop] ?? runtimeState.itemContext?.["id"] ?? `sim_${prop}`;
      }
      if (source.kind === "user_input") {
        return runtimeState.inputs[source.fieldName];
      }
      if (source.kind === "route_param") {
        return runtimeState.routeParams[source.paramName];
      }
      if (source.kind === "query_param") {
        return runtimeState.queryParams[source.paramName];
      }
      if (source.kind === "session_storage") {
        return runtimeState.sessionStorage?.[source.key] ?? `<sessionStorage:${source.key}>`;
      }
      if (source.kind === "local_storage") {
        return runtimeState.localStorage?.[source.key] ?? `<localStorage:${source.key}>`;
      }
      if (source.kind === "cookie") {
        return runtimeState.cookies?.[source.cookieName] ?? `<cookie:${source.cookieName}>`;
      }
      if (source.kind === "realtime_payload") {
        if (!source.fieldPath) return runtimeState.incomingPayload;
        const parts = source.fieldPath.split(".");
        let cur: JSONValue | undefined = runtimeState.incomingPayload;
        for (const p of parts) {
          if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
          cur = cur[p];
        }
        return cur !== undefined ? cur : `<stream:${source.fieldPath}>`;
      }
      if (source.kind === "auth_token") {
        if (source.tokenType === "cookie") {
          const cookieVal = runtimeState.cookies?.["better-auth.session_token"];
          return cookieVal
            ? (cookieVal.startsWith("Bearer ") ? cookieVal : `Bearer ${cookieVal}`)
            : "Bearer simulated-cookie-token";
        }
        if (source.tokenType === "local_storage") {
          const localVal = runtimeState.localStorage?.["auth_token"];
          return localVal
            ? (localVal.startsWith("Bearer ") ? localVal : `Bearer ${localVal}`)
            : "Bearer simulated-local-token";
        }
        const cookieVal = runtimeState.cookies?.["better-auth.session_token"];
        const localVal = runtimeState.localStorage?.["auth_token"];
        const sessionVal = runtimeState.sessionStorage?.["auth_token"];
        if (cookieVal) {
          return cookieVal.startsWith("Bearer ") ? cookieVal : `Bearer ${cookieVal}`;
        }
        if (localVal) {
          return localVal.startsWith("Bearer ") ? localVal : `Bearer ${localVal}`;
        }
        if (sessionVal) {
          return sessionVal.startsWith("Bearer ") ? sessionVal : `Bearer ${sessionVal}`;
        }
        return "Bearer simulated-session-token";
      }
      if (source.kind === "prev_response") {
        const resp = stepResponses[source.stepId];
        if (resp === undefined) return undefined;
        if (!source.fieldPath) return resp;
        const parts = source.fieldPath.split(".");
        let cur: JSONValue | undefined = resp;
        for (const p of parts) {
          if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
            const obj: JSONObject = cur;
            cur = obj[p];
          } else {
            return undefined;
          }
        }
        return cur;
      }
      return undefined;
    };

    // Sequential step evaluation
    for (let idx = 0; idx < effectiveSteps.length; idx++) {
      const step = effectiveSteps[idx]!;
      const stepName = step.name || `${step.type} (Step ${idx + 1})`;

      if (step.type === "api_call") {
        const targetEpId = step.endpointId;
        const targetEndpoint = endpoints.find((ep) => ep.id === targetEpId);

        const simHeaders: Record<string, string> = { "Content-Type": "application/json" };
        const simPathParams: Record<string, string> = {};
        const simQueryParams: Record<string, string> = {};
        const simBody: Record<string, JSONValue> = {};

        (step.requestBindings || []).forEach((b: FrontendRequestFieldBinding) => {
          if (!b.targetField) return;
          const resolvedVal = resolveSourceValue(b.source);

          if (b.slot === "header") {
            if (isAuthHeaderName(b.targetField)) {
              const activeToken =
                runtimeState.cookies["better-auth.session_token"]
                  ? `Bearer ${runtimeState.cookies["better-auth.session_token"]}`
                  : runtimeState.localStorage["auth_token"] || "Bearer simulated-session-token";
              simHeaders[b.targetField] = String(
                resolvedVal !== undefined && resolvedVal !== "" && resolvedVal !== "Bearer <token>"
                  ? resolvedVal
                  : isProtected
                  ? activeToken
                  : resolvedVal ?? ""
              );
            } else if (resolvedVal !== undefined) {
              simHeaders[b.targetField] = String(resolvedVal);
            }
          } else if (b.slot === "path_param") {
            if (resolvedVal !== undefined) {
              simPathParams[b.targetField] = String(resolvedVal);
            }
          } else if (b.slot === "query_param") {
            if (resolvedVal !== undefined) {
              simQueryParams[b.targetField] = String(resolvedVal);
            }
          } else if (b.slot === "body") {
            if (resolvedVal !== undefined) {
              simBody[b.targetField] = resolvedVal;
            }
          }
        });

        if (isProtected && !simHeaders["Authorization"] && targetEndpoint?.requireAuth !== false) {
          simHeaders["Authorization"] =
            runtimeState.cookies["better-auth.session_token"]
              ? `Bearer ${runtimeState.cookies["better-auth.session_token"]}`
              : runtimeState.localStorage["auth_token"] || "Bearer simulated-session-token";
        }

        // Build resolved URL with pathParams and queryParams substituted
        let targetUrl = targetEndpoint?.name || "/api/endpoint";
        Object.entries(simPathParams).forEach(([pk, pv]) => {
          targetUrl = targetUrl.replace(`:${pk}`, encodeURIComponent(pv)).replace(`{${pk}}`, encodeURIComponent(pv));
        });
        const queryEntries = Object.entries(simQueryParams);
        if (queryEntries.length > 0) {
          const qs = new URLSearchParams(queryEntries).toString();
          targetUrl += (targetUrl.includes("?") ? "&" : "?") + qs;
        }

        // Mock response resolution
        let mockResponseData: JSONValue = {
          success: true,
          data: {
            id: `sim-${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...simBody,
          },
        };

        if (targetEndpoint?.simulationOutput) {
          mockResponseData = JSON.parse(JSON.stringify(targetEndpoint.simulationOutput));
        } else if (targetEndpoint?.responseBody?.rawJson) {
          try {
            mockResponseData = JSON.parse(targetEndpoint.responseBody.rawJson);
          } catch {
            // fallback
          }
        }

        stepResponses[step.id] = mockResponseData;

        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "api_call",
          name: stepName,
          status: "success",
          details: {
            request: {
              method: targetEndpoint?.type || "POST",
              url: targetUrl,
              headers: simHeaders,
              body: Object.keys(simBody).length > 0 ? simBody : undefined,
            },
            response: {
              status: 200,
              data: mockResponseData,
            },
          },
        });
      } else if (step.type === "state_mutation") {
        const storeNode = allNodes.find((n) => n.id === step.stateStoreNodeId);
        const storeName = storeNode?.data?.label || storeNode?.data?.storeName || "Store";
        const fKey = step.stateKey || "data";

        const prevVal =
          step.stateTargetKind === "store"
            ? runtimeState.stores[storeName]?.[fKey]
            : runtimeState.localState[fKey];

        let nextVal: JSONValue = prevVal ?? "";
        const resolvedVal = resolveSourceValue(step.stateValueSource);

        const action = step.stateActionName || step.stateUpdateType || "set";

        const safeResolvedVal: JSONValue = resolvedVal !== undefined ? resolvedVal : "";

        if (action === "toggle") {
          nextVal = !prevVal;
        } else if (action === "increment" || action === "add") {
          nextVal = (Number(prevVal) || 0) + (Number(safeResolvedVal) || 1);
        } else if (action === "decrement" || action === "subtract") {
          nextVal = (Number(prevVal) || 0) - (Number(safeResolvedVal) || 1);
        } else if (action === "append") {
          nextVal = Array.isArray(prevVal)
            ? [...prevVal, safeResolvedVal]
            : String(prevVal ?? "") + String(safeResolvedVal);
        } else if (action === "prepend") {
          nextVal = Array.isArray(prevVal)
            ? [safeResolvedVal, ...prevVal]
            : String(safeResolvedVal) + String(prevVal ?? "");
        } else if (action === "pop") {
          nextVal = Array.isArray(prevVal) ? prevVal.slice(0, -1) : (prevVal ?? "");
        } else if (action === "reset" || action === "clear") {
          nextVal = Array.isArray(prevVal)
            ? []
            : typeof prevVal === "number"
              ? 0
              : typeof prevVal === "boolean"
                ? false
                : "";
        } else {
          nextVal = resolvedVal !== undefined ? resolvedVal : "updated";
        }

        if (step.stateTargetKind === "store") {
          if (!runtimeState.stores[storeName]) runtimeState.stores[storeName] = {};
          runtimeState.stores[storeName][fKey] = nextVal;
        } else {
          runtimeState.localState[fKey] = nextVal;
        }

        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "state_mutation",
          name: stepName,
          status: "success",
          details: {
            mutation: {
              targetStore: step.stateTargetKind === "store" ? storeName : "Local Page State",
              field: fKey,
              prevValue: prevVal,
              nextValue: nextVal,
            },
          },
        });
      } else if (step.type === "notification") {
        const msg = step.notifyMessage || "Action triggered successfully!";
        const lvl = step.notifyLevel || "success";
        if (lvl === "error") toast.error(msg);
        else if (lvl === "warning") toast.warning(msg);
        else toast.success(msg);

        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "notification",
          name: stepName,
          status: "success",
          details: {
            notification: {
              level: lvl,
              message: msg,
            },
          },
        });
      } else if (step.type === "navigation") {
        let resolvedRoute = step.targetRoute || "/";
        const bindings = step.pathParamBindings || [];
        bindings.forEach((b) => {
          const val = resolveSourceValue(b.source);
          const strVal =
            val !== undefined && val !== null && val !== ""
              ? String(val)
              : `[${b.paramName}]`;
          resolvedRoute = resolvedRoute.replace(
            new RegExp(`\\[${b.paramName}\\]`, "g"),
            strVal,
          );
        });
        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "navigation",
          name: stepName,
          status: "success",
          details: {
            navigation: {
              targetRoute: step.targetRoute || "/",
              resolvedRoute,
              method: step.navMethod || "router_push",
            },
          },
        });
      } else if (step.type === "transform") {
        const trNode = allNodes.find(
          (n) =>
            n.id === step.transformerNodeId ||
            n.id === step.transformerRefNodeId ||
            (n.type === "transformer_ref" &&
              n.data?.transformerRef === step.transformerNodeId),
        );
        const resolvedInputs: Record<string, JSONValue> = {};
        (step.transformBindings || []).forEach((b) => {
          resolvedInputs[b.argName] = resolveSourceValue(b.source) ?? "";
        });

        const mockOutput: Record<string, JSONValue> = {
          result: `Transformed(${Object.values(resolvedInputs).join(", ") || "data"})`,
        };
        (step.functionRef?.returnSchema || trNode?.data?.returnSchema || []).forEach((ret: { name?: string }) => {
          if (ret.name) {
            mockOutput[ret.name] = `mock_${ret.name}_val`;
          }
        });

        stepResponses[step.id] = mockOutput;

        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "transform",
          name: stepName || step.transformerName || "Transformer",
          status: "success",
          details: {
            transformer: {
              functionName: step.functionRef?.name || step.transformerName || "transformer",
              inputs: resolvedInputs,
              output: mockOutput,
              outputVariable: step.outputVariable || `${step.transformerName || "transform"}Result`,
            },
          },
        });
      } else if (step.type === "browser_storage") {
        const engine = step.storageEngine || "localStorage";
        const op = step.storageOperation || "set";
        const key = step.storageKey || "auth_token";
        const targetStorage =
          engine === "sessionStorage"
            ? runtimeState.sessionStorage
            : runtimeState.localStorage;
        const prevVal = targetStorage[key];
        let nextVal: string | undefined = prevVal;

        if (op === "clear") {
          if (engine === "sessionStorage") runtimeState.sessionStorage = {};
          else runtimeState.localStorage = {};
          nextVal = undefined;
        } else if (op === "remove") {
          delete targetStorage[key];
          nextVal = undefined;
        } else if (op === "toggle") {
          const isTrue = prevVal === "true";
          nextVal = (!isTrue).toString();
          targetStorage[key] = nextVal;
        } else if (op === "append") {
          const resolved = resolveSourceValue(step.storageValueSource);
          let list: (JSONValue | undefined)[] = [];
          try {
            const parsed = JSON.parse(prevVal || "[]");
            if (Array.isArray(parsed)) {
              list = parsed;
            } else if (prevVal !== undefined) {
              list = [prevVal];
            }
          } catch {
            list = prevVal !== undefined ? [prevVal] : [];
          }
          if (resolved !== undefined) {
            list.push(resolved);
          }
          nextVal = JSON.stringify(list);
          targetStorage[key] = nextVal;
        } else {
          // "set"
          const resolved = resolveSourceValue(step.storageValueSource);
          nextVal =
            typeof resolved === "object"
              ? JSON.stringify(resolved)
              : String(resolved ?? "");
          targetStorage[key] = nextVal;
        }

        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: "browser_storage",
          name: stepName || `${engine}.${op}(${key})`,
          status: "success",
          details: {
            storage: {
              engine,
              operation: op,
              key,
              prevValue: prevVal,
              nextValue: nextVal,
            },
          },
        });
      } else if (step.type === "auth") {
        const op = step.authOperation || "signOut";
        const outVar = step.authOutputVariable || "authResult";

        if (op === "signOut") {
          delete runtimeState.cookies["better-auth.session_token"];
          delete runtimeState.localStorage["auth_token"];
          logs.push({
            stepIndex: idx + 1,
            stepId: step.id,
            type: "auth",
            name: stepName || "Sign Out (Better Auth)",
            status: "success",
            details: {
              auth: {
                operation: "signOut",
                sessionCleared: true,
                clearedCookies: ["better-auth.session_token"],
                clearedStorage: ["auth_token"],
              },
            },
          });
        } else if (op === "signInEmail" || op === "signUpEmail" || op === "signInSocial") {
          runtimeState.cookies["better-auth.session_token"] = "session_token_simulated_auth";
          runtimeState.localStorage["auth_token"] = "Bearer simulated-session-token";
          const mockUser = { id: "user_simulated_123", email: "user@example.com", name: "Simulated User" };
          runtimeState.localState[outVar] = { user: mockUser, session: { id: "sess_simulated" } };
          logs.push({
            stepIndex: idx + 1,
            stepId: step.id,
            type: "auth",
            name: stepName || `Better Auth ${op}`,
            status: "success",
            details: {
              auth: {
                operation: op,
                user: mockUser,
                sessionToken: "session_token_simulated_auth",
                outputVariable: outVar,
              },
            },
          });
        } else if (op === "setActiveOrg") {
          logs.push({
            stepIndex: idx + 1,
            stepId: step.id,
            type: "auth",
            name: stepName || "Set Active Organization",
            status: "success",
            details: {
              auth: {
                operation: "setActiveOrg",
                activeOrgId: "org_simulated_active",
              },
            },
          });
        } else {
          logs.push({
            stepIndex: idx + 1,
            stepId: step.id,
            type: "auth",
            name: stepName || "Auth Action",
            status: "success",
            details: {
              auth: {
                operation: op,
              },
            },
          });
        }
      } else {
        logs.push({
          stepIndex: idx + 1,
          stepId: step.id,
          type: step.type,
          name: stepName,
          status: "success",
        });
      }
    }

    // Small delay to feel alive
    await new Promise((r) => setTimeout(r, 200));
    setExecutionLogs(logs);
    setExpandedLogIdx(0);
    setIsRunning(false);
  };

  const boundStoreKeys = useMemo(() => {
    const list: Array<{ storeName: string; field: string; value: JSONValue }> = [];
    steps.forEach((s) => {
      (s.requestBindings || []).forEach((b) => {
        const source = b.source;
        if (source.kind === "state_var" && source.stateKey) {
          const fieldKey = source.stateKey;
          const sName = source.storeName || Object.keys(testContext.stores)[0] || "Store";
          const val = testContext.stores[sName]?.[fieldKey] ?? "";
          if (!list.some((item) => item.storeName === sName && item.field === fieldKey)) {
            list.push({ storeName: sName, field: fieldKey, value: val });
          }
        }
      });
      if (s.type === "state_mutation" && s.stateTargetKind === "store" && s.stateKey) {
        const fieldKey = s.stateKey;
        const storeNode = allNodes.find((n) => n.id === s.stateStoreNodeId);
        const sName = storeNode?.data?.label || storeNode?.data?.storeName || "Store";
        const val = testContext.stores[sName]?.[fieldKey] ?? "";
        if (!list.some((item) => item.storeName === sName && item.field === fieldKey)) {
          list.push({ storeName: sName, field: fieldKey, value: val });
        }
      }
    });
    return list;
  }, [effectiveSteps, testContext, allNodes]);

  return (
    <div className="flex flex-col gap-4 font-sans text-xs">
      {/* 1. Header & Trigger */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/25">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Sparkles size={14} className="text-cyan-500" />
            <span>Interactive Action Test Runner</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Execute action steps sequentially with bound state store data.
          </p>
        </div>

        <Button
          type="button"
          onClick={runSimulation}
          disabled={isRunning || effectiveSteps.length === 0}
          size="sm"
          className="h-8 gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium cursor-pointer shadow-xs"
        >
          <Play size={12} className={cn(isRunning && "animate-spin")} />
          <span>{isRunning ? "Simulating..." : "Run Action"}</span>
        </Button>
      </div>

      {/* 2. Test Inputs & State Store Context */}
      <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-card border border-border/60">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Database size={12} className="text-primary" />
            <span>Active State Store &amp; Form Inputs</span>
          </Label>
          <button
            type="button"
            onClick={handleResetContext}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer"
          >
            <RefreshCw size={10} />
            <span>Reset Context</span>
          </button>
        </div>

        {boundStoreKeys.length === 0 &&
        !isRealtime &&
        Object.keys(testContext.inputs).length === 0 &&
        Object.keys(testContext.sessionStorage || {}).length === 0 &&
        Object.keys(testContext.localStorage || {}).length === 0 &&
        Object.keys(testContext.cookies || {}).length === 0 &&
        Object.keys(testContext.itemContext || {}).length === 0 ? (
          <div className="text-[11px] text-muted-foreground/80 py-1 italic">
            No dynamic store bindings or inputs detected. Configure an API request with store variables or browser storage to test bindings.
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {/* Realtime Stream Payload */}
            {isRealtime && (
              <div className="p-2 rounded bg-purple-950/20 border border-purple-500/30 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-purple-400 font-semibold">
                    <Radio size={12} className="text-purple-400" />
                    <span>stream.incomingData (Simulated Payload)</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 text-purple-400 border-purple-400/30 bg-purple-400/10 font-mono">
                    JSON Object
                  </Badge>
                </div>
                <textarea
                  value={
                    typeof testContext.incomingPayload === "object"
                      ? JSON.stringify(testContext.incomingPayload, null, 2)
                      : String(testContext.incomingPayload ?? "{}")
                  }
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setTestContext((prev) => ({
                        ...prev,
                        incomingPayload: parsed,
                      }));
                    } catch {
                      // ignore parse error while user edits
                    }
                  }}
                  rows={4}
                  className="w-full p-1.5 text-[11px] font-mono rounded bg-background border border-border/50 text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-purple-400"
                  placeholder='{"message": "hello", "id": "123"}'
                />
              </div>
            )}

            {/* Item Context (Current Element Properties) */}
            {Object.keys(testContext.itemContext || {}).length > 0 && (
              <div className="p-2 rounded bg-violet-950/20 border border-violet-500/30 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-violet-400 font-semibold">
                    <Box size={12} className="text-violet-400" />
                    <span>item.* (Simulated Element Context)</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 text-violet-400 border-violet-400/30 bg-violet-400/10 font-mono">
                    Item Scoped
                  </Badge>
                </div>
                {Object.entries(testContext.itemContext).map(([propKey, propVal]) => (
                  <div key={propKey} className="grid grid-cols-2 items-center gap-2">
                    <span className="text-muted-foreground truncate">item.{propKey}</span>
                    <Input
                      value={String(propVal ?? "")}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setTestContext((prev) => ({
                          ...prev,
                          itemContext: {
                            ...prev.itemContext,
                            [propKey]: nextVal,
                          },
                        }));
                      }}
                      className="h-6 text-[11px] font-mono bg-background"
                      placeholder={`Value for ${propKey}`}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Bound Stores */}
            {boundStoreKeys.map((item) => (
              <div
                key={`${item.storeName}-${item.field}`}
                className="grid grid-cols-2 items-center gap-2 p-1.5 rounded bg-muted/30 border border-border/40 font-mono text-[11px]"
              >
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <span className="text-cyan-500 font-semibold">{item.storeName}</span>
                  <span>.</span>
                  <span className="text-foreground">{item.field}</span>
                </div>
                <Input
                  value={
                    typeof testContext.stores[item.storeName]?.[item.field] === "object"
                      ? JSON.stringify(testContext.stores[item.storeName]?.[item.field])
                      : String(testContext.stores[item.storeName]?.[item.field] ?? "")
                  }
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestContext((prev) => ({
                      ...prev,
                      stores: {
                        ...prev.stores,
                        [item.storeName]: {
                          ...prev.stores[item.storeName],
                          [item.field]: nextVal,
                        },
                      },
                    }));
                  }}
                  className="h-6 text-[11px] font-mono bg-background"
                  placeholder="Test value"
                />
              </div>
            ))}

            {/* Form Inputs */}
            {Object.entries(testContext.inputs).map(([inputKey, inputVal]) => (
              <div
                key={inputKey}
                className="grid grid-cols-2 items-center gap-2 p-1.5 rounded bg-muted/30 border border-border/40 font-mono text-[11px]"
              >
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <span className="text-indigo-400 font-semibold">input</span>
                  <span>.</span>
                  <span className="text-foreground">{inputKey}</span>
                </div>
                <Input
                  value={String(inputVal ?? "")}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestContext((prev) => ({
                      ...prev,
                      inputs: {
                        ...prev.inputs,
                        [inputKey]: nextVal,
                      },
                    }));
                  }}
                  className="h-6 text-[11px] font-mono bg-background"
                  placeholder="Test input"
                />
              </div>
            ))}

            {/* Session Storage */}
            {Object.entries(testContext.sessionStorage || {}).map(([key, val]) => (
              <div
                key={`session-${key}`}
                className="grid grid-cols-2 items-center gap-2 p-1.5 rounded bg-muted/30 border border-border/40 font-mono text-[11px]"
              >
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <span className="text-cyan-400 font-semibold">sessionStorage</span>
                  <span>.</span>
                  <span className="text-foreground">{key}</span>
                </div>
                <Input
                  value={String(val ?? "")}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestContext((prev) => ({
                      ...prev,
                      sessionStorage: {
                        ...prev.sessionStorage,
                        [key]: nextVal,
                      },
                    }));
                  }}
                  className="h-6 text-[11px] font-mono bg-background"
                  placeholder="Storage value"
                />
              </div>
            ))}

            {/* Local Storage */}
            {Object.entries(testContext.localStorage || {}).map(([key, val]) => (
              <div
                key={`local-${key}`}
                className="grid grid-cols-2 items-center gap-2 p-1.5 rounded bg-muted/30 border border-border/40 font-mono text-[11px]"
              >
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <span className="text-emerald-400 font-semibold">localStorage</span>
                  <span>.</span>
                  <span className="text-foreground">{key}</span>
                </div>
                <Input
                  value={String(val ?? "")}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestContext((prev) => ({
                      ...prev,
                      localStorage: {
                        ...prev.localStorage,
                        [key]: nextVal,
                      },
                    }));
                  }}
                  className="h-6 text-[11px] font-mono bg-background"
                  placeholder="Storage value"
                />
              </div>
            ))}

            {/* Cookies */}
            {Object.entries(testContext.cookies || {}).map(([cName, cVal]) => (
              <div
                key={`cookie-${cName}`}
                className="grid grid-cols-2 items-center gap-2 p-1.5 rounded bg-muted/30 border border-border/40 font-mono text-[11px]"
              >
                <div className="flex items-center gap-1 truncate text-muted-foreground">
                  <span className="text-purple-400 font-semibold">cookie</span>
                  <span>.</span>
                  <span className="text-foreground">{cName}</span>
                </div>
                <Input
                  value={String(cVal ?? "")}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setTestContext((prev) => ({
                      ...prev,
                      cookies: {
                        ...prev.cookies,
                        [cName]: nextVal,
                      },
                    }));
                  }}
                  className="h-6 text-[11px] font-mono bg-background"
                  placeholder="Cookie value"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Execution Trace Output */}
      {executionLogs && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-card border border-border/60">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Zap size={12} className="text-amber-500" />
              <span>Simulation Execution Trace ({executionLogs.length} steps)</span>
            </Label>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 font-mono">
              Completed
            </Badge>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            {executionLogs.map((log, lIdx) => {
              const isExpanded = expandedLogIdx === lIdx;
              return (
                <div
                  key={log.stepId || lIdx}
                  className="flex flex-col rounded-md border border-border/50 bg-background/60 overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedLogIdx(isExpanded ? null : lIdx)}
                    className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                        {log.stepIndex}
                      </span>
                      <span className="font-medium text-foreground">{log.name}</span>
                      <Badge variant="secondary" className="text-[9px] uppercase font-mono px-1 py-0">
                        {log.type}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </div>
                  </div>

                  {isExpanded && log.details && (
                    <div className="p-3 pt-2 border-t border-border/40 bg-muted/15 flex flex-col gap-2 text-[11px] font-mono">
                      {log.details.request && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            Outbound Request:
                          </span>
                          <div className="p-2 rounded bg-background border text-[10px] whitespace-pre-wrap">
                            <div className="text-cyan-500 font-semibold mb-1">
                              {log.details.request.method} {log.details.request.url}
                            </div>
                            {log.details.request.body && (
                              <div>
                                <span className="text-muted-foreground">Payload: </span>
                                {JSON.stringify(log.details.request.body, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {log.details.response && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            Simulated Response:
                          </span>
                          <div className="p-2 rounded bg-background border text-[10px] whitespace-pre-wrap text-emerald-600 dark:text-emerald-400">
                            {JSON.stringify(log.details.response.data, null, 2)}
                          </div>
                        </div>
                      )}

                      {log.details.transformer && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            Transformer Execution ({log.details.transformer.functionName}):
                          </span>
                          <div className="p-2 rounded bg-background border text-[10px] whitespace-pre-wrap flex flex-col gap-1">
                            <div>
                              <span className="text-muted-foreground">Inputs: </span>
                              {JSON.stringify(log.details.transformer.inputs, null, 2)}
                            </div>
                            <div className="text-purple-400">
                              <span className="text-muted-foreground">Result ({log.details.transformer.outputVariable}): </span>
                              {JSON.stringify(log.details.transformer.output, null, 2)}
                            </div>
                          </div>
                        </div>
                      )}

                      {log.details.mutation && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            Store Mutation Effect:
                          </span>
                          <div className="p-2 rounded bg-background border text-[10px] flex items-center gap-2">
                            <span className="text-cyan-500 font-semibold">
                              {log.details.mutation.targetStore}.{log.details.mutation.field}
                            </span>
                            <span className="text-muted-foreground">=&gt;</span>
                            <span className="text-emerald-500 font-bold">
                              {JSON.stringify(log.details.mutation.nextValue)}
                            </span>
                          </div>
                        </div>
                      )}

                      {log.details.notification && (
                        <div className="flex items-center gap-1.5 p-2 rounded bg-background border text-amber-500">
                          <Bell size={12} />
                          <span>Toast: &quot;{log.details.notification.message}&quot;</span>
                        </div>
                      )}

                      {log.details.navigation && (
                        <div className="flex items-center gap-1.5 p-2 rounded bg-background border text-indigo-400">
                          <Navigation size={12} />
                          <span>
                            {log.details.navigation.method === "history_push"
                              ? "History pushState: "
                              : log.details.navigation.method === "history_replace"
                              ? "History replaceState: "
                              : log.details.navigation.method === "router_replace"
                              ? "Router replace: "
                              : "Navigated to: "}
                            {log.details.navigation.resolvedRoute ||
                              log.details.navigation.targetRoute}
                          </span>
                        </div>
                      )}

                      {log.details.storage && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                            <HardDrive size={11} className="text-emerald-500" />
                            <span>Browser Storage Operation:</span>
                          </span>
                          <div className="p-2 rounded bg-background border text-[10px] flex items-center gap-2">
                            <span className="text-emerald-500 font-semibold">
                              {log.details.storage.engine}.{log.details.storage.operation}(&quot;{log.details.storage.key}&quot;)
                            </span>
                            {log.details.storage.nextValue !== undefined && (
                              <>
                                <span className="text-muted-foreground">=&gt;</span>
                                <span className="text-cyan-400 font-bold truncate">
                                  {log.details.storage.nextValue}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionSimulator;
