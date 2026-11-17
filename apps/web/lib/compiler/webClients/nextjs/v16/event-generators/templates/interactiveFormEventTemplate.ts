import {
  StoreActionBinding,
  FrontendActionStepDraft,
  NavigationPathParamBinding,
  NavigationQueryParamBinding,
} from "@workspace/canvas/types";
import { ResolvedEventParameters } from "../types";
import {
  resolveStoreActionMethodName,
  isValidStoreActionType,
  isArrayTargetField,
  isNumberTargetField,
  isBooleanTargetField,
  isObjectTargetField,
} from "../../storeActionResolver";
import { resolveBaseUrlInfo } from "../paramUtils";
import {
  partitionTransformerSteps,
  resolveTransformerImports,
  renderTransformerInvocationList,
  renderActionStepNavigation,
} from "../transformerStepResolver";
import {
  partitionAuthSteps,
  resolveAuthImports,
  resolveAuthStepRequirements,
  renderAuthStepList,
  filterAuthSteps,
} from "../authStepResolver";

function resolveActionLibImports(libraries?: string[]): string {
  if (!libraries || libraries.length === 0) return "";
  const lines: string[] = [];
  for (const lib of libraries) {
    const clean = lib.trim();
    if (!clean) continue;
    const safeId = clean.replace(/^@/, "").replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+/, "");
    lines.push(`import * as ${safeId} from "${clean}";`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function escapeJsxAttr(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/"/g, "&quot;");
}

export function generateInteractiveFormEventTemplate({
  componentName,
  eventName,
  eventType,
  url,
  upperMethod,
  requireAuth = true,
  typeDefs,
  params,
  libraries = [],
  storeActionBinding,
  storeActionBindings,
  serviceName,
  actionSteps,
  targetRoute,
  pathParamBindings,
  queryParamBindings,
  hasEndpointLink = false,
}: {
  componentName: string;
  eventName: string;
  eventType: string;
  url: string;
  upperMethod: string;
  requireAuth?: boolean;
  typeDefs: string[];
  params: ResolvedEventParameters;
  libraries?: string[];
  storeActionBinding?: StoreActionBinding;
  storeActionBindings?: StoreActionBinding[];
  serviceName?: string;
  actionSteps?: FrontendActionStepDraft[];
  targetRoute?: string;
  pathParamBindings?: NavigationPathParamBinding[];
  queryParamBindings?: NavigationQueryParamBinding[];
  hasEndpointLink?: boolean;
}): string {
  const {
    mergedPathParams,
    mergedQueryParams,
    mergedHeaders,
    bodyFields,
    hasPathParams,
    hasQueryParams,
    hasHeaders,
    hasBodyFields,
    hasRawJson,
    pathParamsDefault,
    queryParamsDefault,
    headersDefault,
    bodyFieldsDefault,
    defaultRawJsonString,
  } = params;

  const libImports = resolveActionLibImports(libraries);
  const urlInfo = resolveBaseUrlInfo(url, serviceName);

  const hasApiUrl = Boolean(url && url.trim() && url !== "#");
  const navStep = Array.isArray(actionSteps)
    ? actionSteps.find((s) => s.type === "navigation")
    : undefined;

  const { preSteps, postSteps } = partitionTransformerSteps(actionSteps, hasApiUrl);
  const allTransformerSteps = [...preSteps, ...postSteps];
  const transImports = resolveTransformerImports(allTransformerSteps);

  const { preAuthSteps, postAuthSteps } = partitionAuthSteps(actionSteps, hasApiUrl);
  const authImports = resolveAuthImports(actionSteps);
  const authReqs = resolveAuthStepRequirements(filterAuthSteps(actionSteps));

  const stepOutputMap = new Map<string, string>();
  const preAuthCode = renderAuthStepList(preAuthSteps, stepOutputMap, {
    hasTriggerResult: false,
    payloadVar: "bodyFields",
  });
  const preStepsCode = renderTransformerInvocationList(preSteps, stepOutputMap, {
    hasTriggerResult: false,
    payloadVar: "bodyFields",
  });
  const postAuthCode = renderAuthStepList(postAuthSteps, stepOutputMap, {
    hasTriggerResult: true,
    resDataVar: "resData",
    payloadVar: "bodyFields",
  });
  const postStepsCode = renderTransformerInvocationList(postSteps, stepOutputMap, {
    hasTriggerResult: true,
    resDataVar: "resData",
    payloadVar: "bodyFields",
  });

  const lastStep =
    postSteps.length > 0
      ? postSteps[postSteps.length - 1]
      : preSteps.length > 0
      ? preSteps[preSteps.length - 1]
      : undefined;
  const lastTransformerOutputVar = lastStep ? stepOutputMap.get(lastStep.id) : undefined;

  const apiStep = Array.isArray(actionSteps)
    ? actionSteps.find((s) => s.type === "api_call")
    : undefined;

  if (apiStep?.id) {
    stepOutputMap.set(apiStep.id, "resData");
    if (apiStep.name) stepOutputMap.set(apiStep.name, "resData");
  }
  if (hasApiUrl) {
    stepOutputMap.set("api_call", "resData");
    stepOutputMap.set("trigger", "resData");
    stepOutputMap.set("triggerResult", "resData");
    stepOutputMap.set("endpoint", "resData");
    stepOutputMap.set("api", "resData");
    stepOutputMap.set("resData", "resData");
  }

  const navResult = renderActionStepNavigation(navStep, targetRoute, stepOutputMap, {
    hasTriggerResult: hasApiUrl,
    resDataVar: "resData",
    lastTransformerOutputVar,
    apiStepId: apiStep?.id,
    pathParamBindings: navStep?.pathParamBindings || pathParamBindings,
    queryParamBindings: navStep?.queryParamBindings || queryParamBindings,
  });

  let bindings: StoreActionBinding[] =
    Array.isArray(storeActionBindings) && storeActionBindings.length > 0
      ? [...storeActionBindings]
      : storeActionBinding
      ? [storeActionBinding]
      : [];

  // Fallback: If no storeActionBindings were passed, but actionSteps has state_mutation steps,
  // infer bindings from those steps so the store update is never omitted.
  if (bindings.length === 0 && Array.isArray(actionSteps)) {
    const mutationSteps = actionSteps.filter((s) => s.type === "state_mutation");
    for (const step of mutationSteps) {
      const targetFieldName = step.stateKey;
      const cap = targetFieldName ? targetFieldName.charAt(0).toUpperCase() + targetFieldName.slice(1) : "";
      const rawAction = step.stateActionName || step.stateUpdateType || "set";
      const actionType = isValidStoreActionType(rawAction) ? rawAction : "set";
      const defaultPrefix = actionType === "set" || actionType === "mutate" ? "set" : actionType;
      const actionName = (step.stateActionName && step.stateActionName !== "set" && step.stateActionName !== "mutate")
        ? step.stateActionName
        : (cap ? `${defaultPrefix}${cap}` : "set");

      let updateSource: StoreActionBinding["updateSource"] = "response";
      let valuePath: string | undefined = undefined;
      let customValue: string | undefined = undefined;

      if (actionType === "reset") {
        updateSource = "direct";
      } else if (step.stateValueSource) {
        const src = step.stateValueSource;
        if (src.kind === "prev_response") {
          updateSource = src.fieldPath && src.fieldPath.trim() ? "response_property" : "response";
          valuePath = src.fieldPath?.trim();
        } else if (src.kind === "literal") {
          updateSource = "static";
          customValue = src.value;
        } else if (src.kind === "user_input") {
          updateSource = "payload";
          valuePath = src.fieldName;
        } else if (src.kind === "route_param" || src.kind === "query_param") {
          updateSource = "payload";
          if ("paramName" in src && typeof src.paramName === "string") {
            valuePath = src.paramName;
          }
        } else if (src.kind === "state_var") {
          updateSource = "payload";
          if ("stateKey" in src && typeof src.stateKey === "string") {
            valuePath = src.stateKey;
          } else if ("fieldPath" in src && typeof src.fieldPath === "string") {
            valuePath = src.fieldPath;
          }
        }
      }

      const isArr = isArrayTargetField(undefined, targetFieldName, step.stateReducerName || step.stateActionName);
      const isNum = !isArr && isNumberTargetField(undefined, targetFieldName);
      const isBool = !isArr && !isNum && isBooleanTargetField(undefined, targetFieldName, actionName);
      const inferredFieldType = isArr ? "array" : isNum ? "number" : isBool ? "boolean" : "string";

      bindings.push({
        id: `bnd-step-${step.id}`,
        storeNodeId: step.stateStoreNodeId || "App",
        storeName: "AppStore",
        actionId: step.id || `field-${actionType}-${targetFieldName || "var"}`,
        actionName,
        actionType,
        targetFieldId: step.stateTargetFieldId,
        targetFieldName,
        targetFieldType: inferredFieldType,
        updateSource,
        valuePath,
        customValue,
      });
    }
  }

  const uniqueStoreNames = Array.from(
    new Set([
      ...bindings
        .map((b) => b.storeName?.replace(/Store$/i, ""))
        .filter((n): n is string => Boolean(n)),
      ...transImports.uniqueStoreNames,
      ...authReqs.storeNames,
      ...navResult.storeNames,
    ]),
  );

  const storeImports =
    uniqueStoreNames.length > 0
      ? uniqueStoreNames
          .map((raw) => {
            const hook = `use${raw.charAt(0).toUpperCase() + raw.slice(1)}Store`;
            return `import { ${hook} } from "@/lib/stores";`;
          })
          .join("\n") + "\n"
      : "";

  // Helper to emit input mapping for store calls
  const generateStoreUpdates = (payloadVar: string) => {
    let preTrigger = "";
    let postTrigger = "";

    bindings.forEach((b) => {
      const rawStoreName = b.storeName?.replace(/Store$/i, "");
      if (!rawStoreName) return;
      const storeHookName = `use${rawStoreName.charAt(0).toUpperCase() + rawStoreName.slice(1)}Store`;
      const storeActionName = resolveStoreActionMethodName(b);

      const src =
        b.updateSource === "response_property" || (hasApiUrl || lastTransformerOutputVar)
          ? b.updateSource || "response"
          : b.updateSource === "static"
          ? "static"
          : hasBodyFields || hasRawJson
          ? "payload"
          : "direct";
      const vPath = b.valuePath?.trim();
      const cVal = b.customValue?.trim();

      const resSourceExpr = lastTransformerOutputVar
        ? `(typeof resData !== "undefined" ? resData : ${lastTransformerOutputVar})`
        : `resData`;

      if (src === "payload") {
        if (
          storeActionName === "populate" &&
          b.parameterMappings &&
          Object.keys(b.parameterMappings).length > 0
        ) {
          const mappedEntries = Object.entries(b.parameterMappings)
            .filter(([_, path]) => path && path.trim())
            .map(([fieldName, path]) => {
              const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
              return `${fieldName}: ${payloadVar}?.${chain}`;
            });
          preTrigger += `      ${storeHookName}.getState().populate({ ${mappedEntries.join(", ")} });\n`;
          return;
        }
        if (
          b.actionType === "custom" &&
          b.parameterMappings &&
          Object.keys(b.parameterMappings).length > 0
        ) {
          const paramArgs = Object.values(b.parameterMappings).map((path) => {
            if (!path || !path.trim()) return "undefined";
            const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
            return `${payloadVar}?.${chain}`;
          });
          preTrigger += `      ${storeHookName}.getState().${storeActionName}(${paramArgs.join(", ")});\n`;
          return;
        }
        if (vPath) {
          const chain = vPath.split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
          preTrigger += `      ${storeHookName}.getState().${storeActionName}(${payloadVar}?.${chain});\n`;
          return;
        }
        preTrigger += `      ${storeHookName}.getState().${storeActionName}(${payloadVar});\n`;
        return;
      }

      if (src === "static") {
        let parsed = "undefined";
        if (cVal) {
          try {
            JSON.parse(cVal);
            parsed = cVal;
          } catch {
            parsed = JSON.stringify(cVal);
          }
        }
        preTrigger += `      ${storeHookName}.getState().${storeActionName}(${parsed});\n`;
        return;
      }

      if (src === "direct") {
        preTrigger += `      ${storeHookName}.getState().${storeActionName}();\n`;
        return;
      }

      if (src === "response_property" && vPath) {
        const rawVPath = vPath.trim();
        const chain = rawVPath.split(".").filter(Boolean).map((k) => `?.[${JSON.stringify(k)}]`).join("");
        const extractionExpr = `resData${chain}`;

        const isArrayTarget = isArrayTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
        const isNumberTarget = isNumberTargetField(b.targetFieldType, b.targetFieldName);
        const isBooleanTarget = isBooleanTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
        const isObjectTarget = isObjectTargetField(b.targetFieldType, b.targetFieldName);

        let passedExpr = "extracted";
        if (isArrayTarget) {
          passedExpr = `Array.isArray(extracted) ? extracted : (extracted !== null && extracted !== undefined ? [extracted] : [])`;
        } else if (isNumberTarget) {
          passedExpr = `typeof extracted === "number" ? extracted : (Number(extracted) || 0)`;
        } else if (isBooleanTarget) {
          passedExpr = `typeof extracted === "boolean" ? extracted : Boolean(extracted)`;
        } else if (isObjectTarget) {
          passedExpr = `typeof extracted === "object" && extracted !== null ? extracted : {}`;
        }

        postTrigger += `  if (${resSourceExpr}) {\n    const extracted = ${extractionExpr};\n    ${storeHookName}.getState().${storeActionName}(${passedExpr});\n  }\n`;
        return;
      }

      // Response with explicit parameter mappings (e.g. for populate or multi-param custom action)
      if (
        storeActionName === "populate" &&
        b.parameterMappings &&
        Object.keys(b.parameterMappings).length > 0
      ) {
        const mappedEntries = Object.entries(b.parameterMappings)
          .filter(([_, path]) => path && path.trim())
          .map(([fieldName, path]) => {
            const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
            return `${fieldName}: resData?.${chain}`;
          });
        if (mappedEntries.length > 0) {
          postTrigger += `  if (${resSourceExpr}) {\n    ${storeHookName}.getState().populate({ ${mappedEntries.join(", ")} });\n  }\n`;
          return;
        }
      }

      if (
        b.actionType === "custom" &&
        b.parameterMappings &&
        Object.keys(b.parameterMappings).length > 0
      ) {
        const paramArgs = Object.values(b.parameterMappings).map((path) => {
          if (!path || !path.trim()) return "undefined";
          const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
          return `resData?.${chain}`;
        });
        postTrigger += `  if (${resSourceExpr}) {\n    ${storeHookName}.getState().${storeActionName}(${paramArgs.join(", ")});\n  }\n`;
        return;
      }

      // Default response:
      const isArrayTarget = isArrayTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
      const isNumberTarget = isNumberTargetField(b.targetFieldType, b.targetFieldName);
      const isBooleanTarget = isBooleanTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
      const isObjectTarget = isObjectTargetField(b.targetFieldType, b.targetFieldName);

      let passedExpr = "resData";
      if (isArrayTarget) {
        passedExpr = `Array.isArray(resData) ? resData : []`;
      } else if (isNumberTarget) {
        passedExpr = `typeof resData === "number" ? resData : (Number(resData) || 0)`;
      } else if (isBooleanTarget) {
        passedExpr = `typeof resData === "boolean" ? resData : Boolean(resData)`;
      } else if (isObjectTarget) {
        passedExpr = `typeof resData === "object" && resData !== null ? resData : {}`;
      } else {
        passedExpr = `typeof resData === "string" ? resData : (resData !== null && resData !== undefined ? String(resData) : "")`;
      }

      postTrigger += `  if (${resSourceExpr}) {\n    ${storeHookName}.getState().${storeActionName}(${passedExpr});\n  }\n`;
    });

    return { preTrigger, postTrigger };
  };

  const storeSnippet = generateStoreUpdates(hasBodyFields || hasRawJson ? "payloadBody" : "undefined");

  const navImports = new Set<string>();
  if (navResult.needsUseRouter || authReqs.needsUseRouter) navImports.add("useRouter");
  if (hasPathParams || transImports.needsUseParams || navResult.needsUseParams || authReqs.needsUseParams) navImports.add("useParams");
  if (hasQueryParams || transImports.needsUseSearchParams || navResult.needsUseSearchParams || authReqs.needsUseSearchParams) navImports.add("useSearchParams");

  const navImportLines =
    navImports.size > 0
      ? `import { ${Array.from(navImports).join(", ")} } from "next/navigation";\n`
      : "";

  const transformerImportLines =
    transImports.importStatements.length > 0
      ? `${transImports.importStatements.join("\n")}\n`
      : "";

  return `"use client";

import React, { useState, useEffect } from "react";
${navImportLines}${storeImports}${transformerImportLines}${authImports.importStatement}${hasApiUrl ? `import { executeApiAction } from "@/lib/api-client";\n` : ""}import { Button } from "@workspace/ui/components/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
${libImports}${typeDefs.join("\n\n")}

export interface ${componentName}ActionContext {
  onTrigger?: ${componentName}Props["onTrigger"];
  router?: { push: (href: string) => void; replace?: (href: string) => void };
  routeParams?: Record<string, string | string[] | undefined>;
  routeSearchParams?: Record<string, string | string[] | undefined> | URLSearchParams;
  payload?: Record<string, string | number | boolean | null | undefined>;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  bodyFields?: Record<string, string | number | boolean | null | undefined>;
  rawJsonBody?: string;
}

export async function handle${componentName}(ctx: ${componentName}ActionContext = {}) {
  const onTrigger = ctx.onTrigger;
${navResult.needsUseRouter || authReqs.needsUseRouter ? `  const routerContext = ctx.router;\n  const router = { push: (url: string) => { if (routerContext) { routerContext.push(url); } else if (typeof window !== "undefined") { window.location.href = url; } }, replace: (url: string) => { if (routerContext?.replace) { routerContext.replace(url); } else if (typeof window !== "undefined") { window.location.replace(url); } } };\n` : ""}${hasPathParams || transImports.needsUseParams || navResult.needsUseParams ? `  const routeParams = ctx.routeParams;\n` : ""}${hasQueryParams || transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `  const routeSearchParams = ctx.routeSearchParams;\n` : ""}  const pathParams: Record<string, string> = { ...(${pathParamsDefault}), ...(ctx.pathParams || {}) };
  const queryParams: Record<string, string> = { ...(${queryParamsDefault}), ...(ctx.queryParams || {}) };
  const customHeaders: Record<string, string> = { ...(${headersDefault}), ...(ctx.headers || {}) };
  const bodyFields: Record<string, string | number | boolean | null | undefined> = { ...(${bodyFieldsDefault}), ...(ctx.bodyFields || ctx.payload || {}) };
  const rawJsonBody: string = ctx.rawJsonBody !== undefined ? ctx.rawJsonBody : ${defaultRawJsonString};

  const computeFinalUrl = (): string => {
    let currentUrl = "${url}";
    let origin = "";
    let pathnameAndRest = currentUrl;
    const matchOrigin = currentUrl.match(/^([a-zA-Z]+:\\/\\/[^/]+)(.*)$/);
    if (matchOrigin) {
      origin = ${urlInfo.hasBaseUrl ? `(process.env.${urlInfo.publicEnvVarName} || process.env.${urlInfo.envVarName} || matchOrigin[1] || "").replace(/\\/$/, "")` : `matchOrigin[1] || ""`};
      pathnameAndRest = matchOrigin[2] || "";
    }
${hasPathParams ? `    Object.entries(pathParams).forEach(([key, val]) => {
      if (val !== undefined && val !== "") {
        pathnameAndRest = pathnameAndRest.replace(new RegExp(":" + key + "\\\\b|\\\\{" + key + "\\\\}", "g"), encodeURIComponent(String(val)));
      }
    });\n` : ""}    let finalUrl = origin + pathnameAndRest;
${hasQueryParams ? `    const search = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, val]) => {
      if (val !== undefined && val !== "") {
        search.append(key, String(val));
      }
    });
    const qs = search.toString();
    if (qs) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;
    }\n` : ""}    return finalUrl;
  };

  const finalUrl = computeFinalUrl();${hasBodyFields || hasRawJson ? `  let payloadBody: Record<string, string | number | boolean | null | undefined> | undefined = undefined;\n` : ""}${hasBodyFields ? `  payloadBody = { ...bodyFields };\n` : ""}${hasRawJson ? `  if (rawJsonBody.trim()) {
    try {
      const parsed = JSON.parse(rawJsonBody);
      payloadBody = typeof parsed === "object" && parsed !== null ? parsed : undefined;
    } catch {
      // programmatic trigger continues with raw/undefined
    }
  }\n` : ""}${preAuthCode}${preStepsCode}${storeSnippet.preTrigger}${hasApiUrl ? `  const result = await executeApiAction<${hasEndpointLink ? `${componentName}Response` : "unknown"}>({\n    eventName: "${eventName}",\n    eventType: "${eventType}",\n    url: finalUrl,\n    method: "${upperMethod}",\n    requireAuth: ${Boolean(requireAuth)},\n    customHeaders: ${hasHeaders ? "Object.keys(customHeaders).length > 0 ? customHeaders : undefined" : "undefined"},\n    queryParams: ${hasQueryParams ? "Object.keys(queryParams).length > 0 ? queryParams : undefined" : "undefined"},\n    requestBody: ${hasBodyFields || hasRawJson ? "payloadBody" : "undefined"},\n  });\n  const resData = result.data;\n  await onTrigger?.(\n    "${eventName}",\n    "${eventType}",\n    finalUrl,\n    "${upperMethod}",\n    ${Boolean(requireAuth)},\n    ${hasHeaders ? "Object.keys(customHeaders).length > 0 ? customHeaders : undefined" : "undefined"},\n    ${hasQueryParams ? "Object.keys(queryParams).length > 0 ? queryParams : undefined" : "undefined"},\n    ${hasBodyFields || hasRawJson ? "payloadBody" : "undefined"},\n  );\n` : ""}
${postAuthCode}${postStepsCode}${storeSnippet.postTrigger}${navResult.navigationCode ? `${navResult.navigationCode}\n` : ""}${hasApiUrl ? "  return resData;\n" : ""}}

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
${navResult.needsUseRouter ? `  const router = useRouter();\n` : ""}${hasPathParams || transImports.needsUseParams || navResult.needsUseParams ? `  const routeParams = useParams();\n` : ""}${hasQueryParams || transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `  const routeSearchParams = useSearchParams();\n` : ""}${hasPathParams ? `  const [pathParams, setPathParams] = useState<Record<string, string>>(${pathParamsDefault});\n` : ""}${hasQueryParams ? `  const [queryParams, setQueryParams] = useState<Record<string, string>>(${queryParamsDefault});\n` : ""}${hasHeaders ? `  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(${headersDefault});\n` : ""}${hasBodyFields ? `  const [bodyFields, setBodyFields] = useState<Record<string, string | number | boolean | null | undefined>>(${bodyFieldsDefault});\n` : ""}${hasRawJson ? `  const [rawJsonBody, setRawJsonBody] = useState<string>(${defaultRawJsonString});\n  const [jsonError, setJsonError] = useState<string | null>(null);\n` : ""}
${hasPathParams ? `  useEffect(() => {
    if (routeParams) {
      setPathParams((prev) => {
        const next = { ...prev };
        Object.entries(routeParams).forEach(([k, v]) => {
          if (v !== undefined) next[k] = Array.isArray(v) ? v.join("/") : String(v);
        });
        return next;
      });
    }
  }, [routeParams]);\n` : ""}${hasQueryParams ? `  useEffect(() => {
    if (routeSearchParams) {
      setQueryParams((prev) => {
        const next = { ...prev };
        routeSearchParams.forEach((v, k) => {
          if (v !== undefined) next[k] = v;
        });
        return next;
      });
    }
  }, [routeSearchParams]);\n` : ""}
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
${hasRawJson ? `    if (rawJsonBody && rawJsonBody.trim()) {
      try {
        JSON.parse(rawJsonBody);
        setJsonError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setJsonError("Invalid JSON: " + message);
        return;
      }
    }\n` : ""}    setIsSubmitting(true);
    try {
      await handle${componentName}({
        onTrigger,
${navResult.needsUseRouter ? `        router,\n` : ""}${hasPathParams || transImports.needsUseParams || navResult.needsUseParams ? `        routeParams: routeParams ? Object.fromEntries(Object.entries(routeParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : String(v)])) : undefined,\n` : ""}${hasQueryParams || transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `        routeSearchParams,\n` : ""}${hasPathParams ? `        pathParams,\n` : ""}${hasQueryParams ? `        queryParams,\n` : ""}${hasHeaders ? `        headers: customHeaders,\n` : ""}${hasBodyFields ? `        bodyFields,\n` : ""}${hasRawJson ? `        rawJsonBody,\n` : ""}      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full border-border shadow-sm">
      <CardHeader className="p-4 pb-3 border-b border-border/50">
        <CardTitle className="text-sm font-bold text-card-foreground">
          ${eventName}
        </CardTitle>
      </CardHeader>

      <form onSubmit={handleFormSubmit}>
        <CardContent className="p-4 space-y-4 text-xs">
${hasPathParams ? `          {/* Path Parameters */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Path Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedPathParams.filter((p) => Boolean(p && p.name && p.name.trim())).map((p) => `              <div key="${p.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  :${p.name}${p.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(p.description || p.defaultValue || p.name)}"
                  value={pathParams["${p.name}"] ?? ""}
                  required={${Boolean(p.required)}}
                  onChange={(e) =>
                    setPathParams((prev) => ({ ...prev, "${p.name}": e.target.value }))
                  }
                />
              </div>`).join("\n")}
            </div>
          </div>
` : ""}${hasQueryParams ? `          {/* Query Parameters */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Query Parameters
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedQueryParams.filter((q) => Boolean(q && q.name && q.name.trim())).map((q) => `              <div key="${q.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${q.name}${q.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  type="${q.type === "number" ? "number" : "text"}"
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(q.description || q.defaultValue || q.name)}"
                  value={queryParams["${q.name}"] ?? ""}
                  required={${Boolean(q.required)}}
                  onChange={(e) =>
                    setQueryParams((prev) => ({ ...prev, "${q.name}": e.target.value }))
                  }
                />
              </div>`).join("\n")}
            </div>
          </div>
` : ""}${hasHeaders ? `          {/* Headers */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Headers
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${mergedHeaders.filter((h) => Boolean(h && h.name && h.name.trim())).map((h) => `              <div key="${h.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${h.name}${h.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(h.description || h.defaultValue || h.name)}"
                  value={customHeaders["${h.name}"] ?? ""}
                  required={${Boolean(h.required)}}
                  onChange={(e) =>
                    setCustomHeaders((prev) => ({ ...prev, "${h.name}": e.target.value }))
                  }
                />
              </div>`).join("\n")}
            </div>
          </div>
` : ""}${hasBodyFields ? `          {/* Request Body Fields */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Request Body
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
${bodyFields.filter((f) => Boolean(f && f.name && f.name.trim())).map((f) => {
  if (f.type === "boolean") {
    return `              <div key="${f.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name}${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                  value={String(bodyFields["${f.name}"] ?? "false")}
                  onChange={(e) =>
                    setBodyFields((prev) => ({ ...prev, "${f.name}": e.target.value === "true" }))
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>`;
  }
  if (f.type === "object" || f.type === "array") {
    const defaultPlaceholder = f.type === "array" ? '["item1", "item2"]' : '{"key": "val"}';
    const placeholderAttr = f.description
      ? `placeholder={${JSON.stringify(f.description)}}`
      : `placeholder='${defaultPlaceholder}'`;
    return `              <div key="${f.name}" className="space-y-1 sm:col-span-2">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name} (${f.type})${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Textarea
                  className="min-h-[60px] text-xs font-mono bg-background"
                  ${placeholderAttr}
                  value={typeof bodyFields["${f.name}"] === "object" ? JSON.stringify(bodyFields["${f.name}"]) : (bodyFields["${f.name}"] !== undefined && bodyFields["${f.name}"] !== null ? String(bodyFields["${f.name}"]) : "")}
                  onChange={(e) => {
                    const text = e.target.value;
                    try {
                      const parsed = JSON.parse(text);
                      setBodyFields((prev) => ({ ...prev, "${f.name}": parsed }));
                    } catch {
                      setBodyFields((prev) => ({ ...prev, "${f.name}": text }));
                    }
                  }}
                />
              </div>`;
  }
  return `              <div key="${f.name}" className="space-y-1">
                <Label className="text-[11px] font-mono text-muted-foreground">
                  ${f.name}${f.required ? ` <span className="text-destructive font-sans">*</span>` : ""}
                </Label>
                <Input
                  type="${f.type === "number" ? "number" : "text"}"
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="${escapeJsxAttr(f.description || f.defaultValue || f.name)}"
                  value={bodyFields["${f.name}"] !== undefined && bodyFields["${f.name}"] !== null ? String(bodyFields["${f.name}"]) : ""}
                  required={${Boolean(f.required)}}
                  onChange={(e) =>
                    setBodyFields((prev) => ({
                      ...prev,
                      "${f.name}": ${f.type === "number" ? `Number(e.target.value)` : `e.target.value`},
                    }))
                  }
                />
              </div>`;
}).join("\n")}
            </div>
          </div>
` : ""}${hasRawJson ? `          {/* Raw JSON Body */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Request Body (JSON)
            </Label>
            <Textarea
              className="min-h-[90px] text-xs font-mono bg-background"
              value={rawJsonBody}
              onChange={(e) => {
                setRawJsonBody(e.target.value);
                if (jsonError) setJsonError(null);
              }}
            />
            {jsonError && (
              <span className="text-[10px] text-destructive font-mono">{jsonError}</span>
            )}
          </div>
` : ""}        </CardContent>

        <CardFooter className="p-4 pt-2 border-t border-border/50 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="cursor-pointer font-semibold shadow"
          >
            {isSubmitting ? "Executing..." : "${eventName}"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default ${componentName};
`;
}
