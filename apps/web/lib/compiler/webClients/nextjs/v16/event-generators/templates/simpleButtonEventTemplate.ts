import {
  StoreActionBinding,
  FrontendActionStepDraft,
  NavigationPathParamBinding,
  NavigationQueryParamBinding,
} from "@workspace/canvas/types";
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

export function generateSimpleButtonEventTemplate({
  componentName,
  eventName,
  eventType,
  url,
  upperMethod,
  requireAuth = true,
  typeDefs,
  libraries = [],
  storeActionBinding,
  storeActionBindings,
  serviceName,
  actionSteps,
  targetRoute,
  pathParamBindings,
  queryParamBindings,
}: {
  componentName: string;
  eventName: string;
  eventType: string;
  url: string;
  upperMethod: string;
  requireAuth?: boolean;
  typeDefs: string[];
  libraries?: string[];
  storeActionBinding?: StoreActionBinding;
  storeActionBindings?: StoreActionBinding[];
  serviceName?: string;
  actionSteps?: FrontendActionStepDraft[];
  targetRoute?: string;
  pathParamBindings?: NavigationPathParamBinding[];
  queryParamBindings?: NavigationQueryParamBinding[];
}): string {
  const libImports = resolveActionLibImports(libraries);
  const hasApiUrl = Boolean(url && url.trim() && url !== "#");

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
  });
  const preStepsCode = renderTransformerInvocationList(preSteps, stepOutputMap, {
    hasTriggerResult: false,
  });
  const postAuthCode = renderAuthStepList(postAuthSteps, stepOutputMap, {
    hasTriggerResult: true,
    resDataVar: "resData",
  });
  const postStepsCode = renderTransformerInvocationList(postSteps, stepOutputMap, {
    hasTriggerResult: true,
    resDataVar: "resData",
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

  const navImports = new Set<string>();
  if (navResult.needsUseRouter || authReqs.needsUseRouter) navImports.add("useRouter");
  if (transImports.needsUseParams || navResult.needsUseParams || authReqs.needsUseParams) navImports.add("useParams");
  if (transImports.needsUseSearchParams || navResult.needsUseSearchParams || authReqs.needsUseSearchParams) navImports.add("useSearchParams");

  const navImportLines =
    navImports.size > 0
      ? `import { ${Array.from(navImports).join(", ")} } from "next/navigation";\n`
      : "";

  const transformerImportLines =
    transImports.importStatements.length > 0
      ? `${transImports.importStatements.join("\n")}\n`
      : "";

  // Helper to emit input mapping for store calls
  const generateStoreUpdates = () => {
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
          : b.updateSource === "payload"
          ? "payload"
          : "direct";
      const vPath = b.valuePath?.trim();
      const cVal = b.customValue?.trim();

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

      const resSourceExpr = lastTransformerOutputVar
        ? `(typeof triggerResult !== "undefined" ? triggerResult : ${lastTransformerOutputVar})`
        : `triggerResult`;

      if (src === "response_property" && vPath) {
        const rawVPath = vPath.trim();
        const isFullPayload =
          rawVPath === "*" ||
          rawVPath === "$" ||
          rawVPath === "data" ||
          rawVPath === "response";

        const cleanPath = rawVPath
          .replace(/^(data|response)\./, "")
          .replace(/^(\*|\$)\.?/, "")
          .trim();
        const finalProp = isFullPayload ? "" : cleanPath;

        let extractionExpr = "resData";
        if (finalProp) {
          extractionExpr = `(typeof resData === "object" && resData !== null && "${finalProp}" in resData ? resData.${finalProp} : resData)`;
        }

        const isArrayTarget = isArrayTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
        const isNumberTarget = isNumberTargetField(b.targetFieldType, b.targetFieldName);
        const isBooleanTarget = isBooleanTargetField(b.targetFieldType, b.targetFieldName, storeActionName);
        const isObjectTarget = isObjectTargetField(b.targetFieldType, b.targetFieldName);

        let passedExpr = extractionExpr;
        if (isArrayTarget) {
          passedExpr = `Array.isArray(${extractionExpr}) ? ${extractionExpr} : []`;
        } else if (isNumberTarget) {
          passedExpr = `typeof ${extractionExpr} === "number" ? ${extractionExpr} : (Number(${extractionExpr}) || 0)`;
        } else if (isBooleanTarget) {
          passedExpr = `typeof ${extractionExpr} === "boolean" ? ${extractionExpr} : Boolean(${extractionExpr})`;
        } else if (isObjectTarget) {
          passedExpr = `typeof ${extractionExpr} === "object" && ${extractionExpr} !== null ? ${extractionExpr} : {}`;
        } else {
          passedExpr = `typeof ${extractionExpr} === "string" ? ${extractionExpr} : (${extractionExpr} !== null && ${extractionExpr} !== undefined ? String(${extractionExpr}) : "")`;
        }

        postTrigger += `  if (${resSourceExpr}) {\n    ${storeHookName}.getState().${storeActionName}(${passedExpr});\n  }\n`;
        return;
      }

      // Response with explicit parameter mappings (e.g. for populate or multi-param custom action)
      if (storeActionName === "populate" && b.parameterMappings && Object.keys(b.parameterMappings).length > 0) {
        const mappedEntries = Object.entries(b.parameterMappings)
          .filter(([_, path]) => path && path.trim())
          .map(([fieldName, path]) => {
            const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
            return `${fieldName}: resData?.${chain}`;
          });
        if (mappedEntries.length > 0) {
          postTrigger += `      if (${resSourceExpr}) {
        const rawRes = ${resSourceExpr};
        const resData =
          rawRes && typeof rawRes === "object" && "data" in rawRes && rawRes.data !== undefined
            ? rawRes.data
            : rawRes;
        ${storeHookName}.getState().populate({ ${mappedEntries.join(", ")} });
      }\n`;
          return;
        }
      }

      if (b.actionType === "custom" && b.parameterMappings && Object.keys(b.parameterMappings).length > 0) {
        const paramArgs = Object.values(b.parameterMappings).map((path) => {
          if (!path || !path.trim()) return "undefined";
          const chain = path.trim().split(".").map((p, i) => (i === 0 ? p : `?.${p}`)).join("");
          return `resData?.${chain}`;
        });
        postTrigger += `      if (${resSourceExpr}) {
        const rawRes = ${resSourceExpr};
        const resData =
          rawRes && typeof rawRes === "object" && "data" in rawRes && rawRes.data !== undefined
            ? rawRes.data
            : rawRes;
        ${storeHookName}.getState().${storeActionName}(${paramArgs.join(", ")});
      }\n`;
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

  const urlInfo = resolveBaseUrlInfo(url, serviceName);
  const storeSnippet = generateStoreUpdates();

  return `"use client";

import React, { useState } from "react";
${navImportLines}${storeImports}${transformerImportLines}${authImports.importStatement}${libImports}import { Button } from "@workspace/ui/components/button";
${typeDefs.join("\n\n")}

export interface ${componentName}ActionContext {
  onTrigger?: ${componentName}Props["onTrigger"];
  router?: { push: (href: string) => void; replace?: (href: string) => void };
  routeParams?: Record<string, string | string[] | undefined>;
  routeSearchParams?: Record<string, string | string[] | undefined> | URLSearchParams;
}

export async function handle${componentName}(ctx: ${componentName}ActionContext = {}) {
  const onTrigger = ctx.onTrigger;
${navResult.needsUseRouter || authReqs.needsUseRouter ? `  const routerContext = ctx.router;\n  const router = { push: (url: string) => { if (routerContext) { routerContext.push(url); } else if (typeof window !== "undefined") { window.location.href = url; } }, replace: (url: string) => { if (routerContext?.replace) { routerContext.replace(url); } else if (typeof window !== "undefined") { window.location.replace(url); } } };\n` : ""}${transImports.needsUseParams || navResult.needsUseParams ? `  const routeParams = ctx.routeParams;\n` : ""}${transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `  const routeSearchParams = ctx.routeSearchParams;\n` : ""}
${urlInfo.baseUrlDeclaration ? `  ${urlInfo.baseUrlDeclaration}\n` : ""}${preAuthCode}${preStepsCode}${storeSnippet.preTrigger}  const triggerResult = await onTrigger?.(
    "${eventName}",
    "${eventType}",
    ${urlInfo.urlExpression},
    "${upperMethod}",
    ${Boolean(requireAuth)},
  );
  const resData =
    triggerResult && typeof triggerResult === "object" && "data" in triggerResult && triggerResult.data !== undefined
      ? triggerResult.data
      : triggerResult;
${postAuthCode}${postStepsCode}${storeSnippet.postTrigger}${navResult.navigationCode ? `${navResult.navigationCode}\n` : ""}  return resData;
}

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
${navResult.needsUseRouter ? `  const router = useRouter();\n` : ""}${transImports.needsUseParams || navResult.needsUseParams ? `  const routeParams = useParams();\n` : ""}${transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `  const routeSearchParams = useSearchParams();\n` : ""}
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await handle${componentName}({
        onTrigger,
${navResult.needsUseRouter ? `        router,\n` : ""}${transImports.needsUseParams || navResult.needsUseParams ? `        routeParams,\n` : ""}${transImports.needsUseSearchParams || navResult.needsUseSearchParams ? `        routeSearchParams,\n` : ""}      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isSubmitting}
      className="cursor-pointer font-medium shadow-sm"
    >
      {isSubmitting ? "Executing..." : "${eventName}"}
    </Button>
  );
}

export default ${componentName};
`;
}
