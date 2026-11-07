import type {
  FrontendActionStepDraft,
  FrontendFieldSource,
  NavigationPathParamBinding,
  NavigationQueryParamBinding,
} from "@workspace/canvas";
import { toVarName } from "../../../../utils";

export interface TransformerResolvedImports {
  importStatements: string[];
  uniqueStoreNames: string[];
  needsUseParams: boolean;
  needsUseSearchParams: boolean;
}

export interface SourceResolutionContext {
  stepOutputMap: Map<string, string>;
  hasTriggerResult?: boolean;
  payloadVar?: string;
  resDataVar?: string;
}

export interface PartitionedSteps {
  preSteps: FrontendActionStepDraft[];
  postSteps: FrontendActionStepDraft[];
}

export interface NavigationRenderResult {
  navigationCode: string;
  needsUseRouter: boolean;
  needsUseParams: boolean;
  needsUseSearchParams: boolean;
  storeNames: string[];
}

/**
 * Filters action steps for transformer/transform steps.
 */
export function filterTransformerSteps(
  actionSteps?: FrontendActionStepDraft[],
): FrontendActionStepDraft[] {
  if (!Array.isArray(actionSteps)) return [];
  return actionSteps.filter((s) => s.type === "transform");
}

/**
 * Extracts a safe JavaScript identifier for the transformer function name.
 */
export function getTransformerFunctionName(step: FrontendActionStepDraft): string {
  const rawName =
    step.functionRef?.name || step.transformerName || step.name || "transform";
  return toVarName(rawName);
}

/**
 * Extracts a safe variable name for storing the transformer result.
 */
export function getTransformerOutputVarName(
  step: FrontendActionStepDraft,
  index: number = 0,
): string {
  if (step.outputVariable && step.outputVariable.trim()) {
    return toVarName(step.outputVariable.trim());
  }
  const fn = getTransformerFunctionName(step);
  return `${fn}Result${index > 0 ? String(index + 1) : ""}`;
}

/**
 * Collects and formats import statements for all transformer functions and any stores
 * or next/navigation hooks referenced in transform bindings.
 */
export function resolveTransformerImports(
  steps: FrontendActionStepDraft[],
): TransformerResolvedImports {
  const pathMap = new Map<string, Set<string>>();
  const storeNames = new Set<string>();
  let needsUseParams = false;
  let needsUseSearchParams = false;

  for (const step of steps) {
    const fnName = getTransformerFunctionName(step);
    const importPath =
      step.functionRef?.importPath ||
      (step.functionRef?.isGlobal !== false
        ? "@workspace/transformers"
        : `../transformers/${fnName}`);

    const existingSet = pathMap.get(importPath);
    if (existingSet) {
      existingSet.add(fnName);
    } else {
      pathMap.set(importPath, new Set([fnName]));
    }

    for (const b of step.transformBindings || []) {
      const src = b.source;
      if (src.kind === "state_var" && src.storeName) {
        storeNames.add(src.storeName.replace(/Store$/i, ""));
      } else if (src.kind === "route_param") {
        needsUseParams = true;
      } else if (src.kind === "query_param") {
        needsUseSearchParams = true;
      }
    }
  }

  const importStatements: string[] = [];
  pathMap.forEach((names, impPath) => {
    const sorted = Array.from(names).sort();
    importStatements.push(
      `import { ${sorted.join(", ")} } from "${impPath}";`,
    );
  });

  return {
    importStatements,
    uniqueStoreNames: Array.from(storeNames),
    needsUseParams,
    needsUseSearchParams,
  };
}

/**
 * Resolves a single field source to an executable TypeScript expression.
 */
export function resolveFieldSourceExpression(
  source: FrontendFieldSource,
  ctx: SourceResolutionContext,
): string {
  switch (source.kind) {
    case "literal":
      return JSON.stringify(source.value ?? "");
    case "state_var": {
      if (source.storeName) {
        const cleanStore = source.storeName.replace(/Store$/i, "");
        const hook = `use${cleanStore.charAt(0).toUpperCase() + cleanStore.slice(1)}Store`;
        const key = source.stateKey || source.fieldPath || "";
        return `${hook}.getState().${key}`;
      }
      const localKey = source.stateKey || source.fieldPath || "";
      return `${ctx.payloadVar || "bodyFields"}?.["${localKey}"]`;
    }
    case "prev_response": {
      if (source.stepId && ctx.stepOutputMap.has(source.stepId)) {
        const varName = ctx.stepOutputMap.get(source.stepId);
        return source.fieldPath ? `${varName}?.${source.fieldPath}` : (varName ?? "undefined");
      }
      if (ctx.hasTriggerResult) {
        const target = ctx.resDataVar || "resData";
        return source.fieldPath ? `${target}?.${source.fieldPath}` : target;
      }
      return "undefined";
    }
    case "user_input": {
      const targetVar = ctx.payloadVar || "bodyFields";
      return `${targetVar}?.["${source.fieldName}"]`;
    }
    case "route_param": {
      return `routeParams?.["${source.paramName}"]`;
    }
    case "query_param": {
      return `(routeSearchParams?.get("${source.paramName}") ?? "")`;
    }
    case "item_prop": {
      const field = source.propPath || source.fieldPath || "id";
      return `props?.item?.${field}`;
    }
    case "session_storage": {
      return `(typeof window !== "undefined" ? sessionStorage.getItem("${source.key}") : null)`;
    }
    case "local_storage": {
      return `(typeof window !== "undefined" ? localStorage.getItem("${source.key}") : null)`;
    }
    case "cookie": {
      return `(typeof document !== "undefined" ? document.cookie : "")`;
    }
    default:
      return "undefined";
  }
}

/**
 * Partitions transformer steps into pre-trigger and post-trigger based on an API call step
 * or endpoint configuration.
 */
export function partitionTransformerSteps(
  actionSteps?: FrontendActionStepDraft[],
  hasApiUrl?: boolean,
): PartitionedSteps {
  if (!Array.isArray(actionSteps)) {
    return { preSteps: [], postSteps: [] };
  }

  const transformerSteps = filterTransformerSteps(actionSteps);
  if (transformerSteps.length === 0) {
    return { preSteps: [], postSteps: [] };
  }

  const apiStep = actionSteps.find((s) => s.type === "api_call");

  if (apiStep) {
    const apiOrder = apiStep.order;
    return {
      preSteps: transformerSteps.filter((s) => s.order < apiOrder),
      postSteps: transformerSteps.filter((s) => s.order >= apiOrder),
    };
  }

  if (hasApiUrl) {
    const preSteps: FrontendActionStepDraft[] = [];
    const postSteps: FrontendActionStepDraft[] = [];
    const preStepIds = new Set<string>();

    for (const step of transformerSteps) {
      const referencesTriggerResponse = (step.transformBindings || []).some(
        (b) =>
          b.source.kind === "prev_response" &&
          (!b.source.stepId || !preStepIds.has(b.source.stepId)),
      );

      if (referencesTriggerResponse || (step.order > 1 && preSteps.length > 0)) {
        postSteps.push(step);
      } else {
        preSteps.push(step);
        preStepIds.add(step.id);
      }
    }
    return { preSteps, postSteps };
  }

  return {
    preSteps: transformerSteps,
    postSteps: [],
  };
}

/**
 * Renders sequential code statements for a list of transformer steps.
 */
export function renderTransformerInvocationList(
  steps: FrontendActionStepDraft[],
  stepOutputMap: Map<string, string>,
  ctx: {
    hasTriggerResult?: boolean;
    payloadVar?: string;
    resDataVar?: string;
    indent?: string;
  },
): string {
  const indent = ctx.indent ?? "      ";
  const lines: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    const fnName = getTransformerFunctionName(step);
    const outVar = getTransformerOutputVarName(step, i);
    stepOutputMap.set(step.id, outVar);
    if (step.name) {
      stepOutputMap.set(step.name, outVar);
    }
    if (step.outputVariable) {
      stepOutputMap.set(step.outputVariable, outVar);
    }
    if (step.transformerName) {
      stepOutputMap.set(step.transformerName, outVar);
    }
    if (step.functionRef?.name) {
      stepOutputMap.set(step.functionRef.name, outVar);
    }
    if (step.transformerNodeId) {
      stepOutputMap.set(step.transformerNodeId, outVar);
    }
    if (step.transformerRefNodeId) {
      stepOutputMap.set(step.transformerRefNodeId, outVar);
    }
    if (step.edgeId) {
      stepOutputMap.set(step.edgeId, outVar);
    }

    const bindings = step.transformBindings || [];
    if (bindings.length > 0) {
      const argProps = bindings.map((b) => {
        const val = resolveFieldSourceExpression(b.source, {
          stepOutputMap,
          hasTriggerResult: ctx.hasTriggerResult,
          payloadVar: ctx.payloadVar,
          resDataVar: ctx.resDataVar,
        });
        return `${b.argName}: ${val}`;
      });
      lines.push(
        `${indent}const ${outVar} = await ${fnName}({ ${argProps.join(", ")} });`,
      );
    } else {
      lines.push(`${indent}const ${outVar} = await ${fnName}();`);
    }
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * Renders navigation router.push(...) invocation with resolved path parameters and query parameters.
 */
export function renderActionStepNavigation(
  navStep: FrontendActionStepDraft | undefined,
  targetRoute: string | undefined,
  stepOutputMap: Map<string, string>,
  ctx: {
    hasTriggerResult?: boolean;
    resDataVar?: string;
    lastTransformerOutputVar?: string;
    apiStepId?: string;
    indent?: string;
  },
): NavigationRenderResult {
  const route = navStep?.targetRoute || targetRoute;
  if (!route) {
    return {
      navigationCode: "",
      needsUseRouter: false,
      needsUseParams: false,
      needsUseSearchParams: false,
      storeNames: [],
    };
  }

  const indent = ctx.indent ?? "      ";
  const storeNames = new Set<string>();
  let needsUseParams = false;
  let needsUseSearchParams = false;

  const pathParamBindings: NavigationPathParamBinding[] =
    navStep?.pathParamBindings || [];
  const queryParamBindings: NavigationQueryParamBinding[] =
    navStep?.queryParamBindings || [];

  let pathTemplate = route;
  const paramMatches: string[] = [];

  const bracketMatches = route.matchAll(
    /\[\[?\.\.\.?([a-zA-Z0-9_-]+)\]?\]|\[([a-zA-Z0-9_-]+)\]/g,
  );
  for (const m of bracketMatches) {
    const name = m[1] || m[2];
    if (name && !paramMatches.includes(name)) paramMatches.push(name);
  }
  const colonMatches = route.matchAll(/:([a-zA-Z0-9_-]+)/g);
  for (const m of colonMatches) {
    const name = m[1];
    if (name && !paramMatches.includes(name)) paramMatches.push(name);
  }

  for (const param of paramMatches) {
    const binding = pathParamBindings.find((b) => b.paramName === param);
    const src = binding?.source;
    let expr = `""`;

    if (!src || src.kind === "literal") {
      const val = src?.value || "";
      if (val) {
        expr = JSON.stringify(val);
      } else {
        needsUseParams = true;
        expr = `(typeof routeParams?.["${param}"] === "string" ? routeParams["${param}"] : "")`;
      }
    } else if (src.kind === "prev_response") {
      const field = src.fieldPath || param;
      if (src.stepId && stepOutputMap.has(src.stepId)) {
        const varName = stepOutputMap.get(src.stepId);
        expr = `String((typeof ${varName} === "object" && ${varName} !== null ? (${varName} as Record<string, unknown>)?.["${field}"] : ${varName}) ?? "")`;
      } else if (ctx.apiStepId && src.stepId === ctx.apiStepId) {
        const target = ctx.resDataVar || "resData";
        expr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      } else if (ctx.lastTransformerOutputVar) {
        const varName = ctx.lastTransformerOutputVar;
        expr = `String((typeof ${varName} === "object" && ${varName} !== null ? (${varName} as Record<string, unknown>)?.["${field}"] : ${varName}) ?? "")`;
      } else if (ctx.resDataVar) {
        const target = ctx.resDataVar;
        expr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      } else if (ctx.hasTriggerResult) {
        const target = "resData";
        expr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      } else {
        expr = `""`;
      }
    } else if (src.kind === "state_var") {
      if (src.storeName) {
        const cleanStore = src.storeName.replace(/Store$/i, "");
        const hook = `use${cleanStore.charAt(0).toUpperCase() + cleanStore.slice(1)}Store`;
        storeNames.add(cleanStore);
        const field = src.stateKey || src.fieldPath || param;
        expr = `String(${hook}.getState().${field} ?? "")`;
      } else {
        expr = `""`;
      }
    } else if (src.kind === "route_param") {
      needsUseParams = true;
      const key = src.paramName || param;
      expr = `(typeof routeParams?.["${key}"] === "string" ? routeParams["${key}"] : "")`;
    } else if (src.kind === "query_param") {
      needsUseSearchParams = true;
      const key = src.paramName || param;
      expr = `(routeSearchParams?.get("${key}") ?? "")`;
    } else if (src.kind === "item_prop") {
      const field = src.propPath || src.fieldPath || param;
      expr = `String(props?.item?.${field} ?? "")`;
    }

    const replacement = `\${${expr}}`;
    pathTemplate = pathTemplate
      .replace(new RegExp(`\\[\\[?\\.\\.\\.?${param}\\]?\\]`, "g"), replacement)
      .replace(new RegExp(`\\[${param}\\]`, "g"), replacement)
      .replace(new RegExp(`:${param}\\b`, "g"), replacement);
  }

  const queryParts: string[] = [];
  for (const q of queryParamBindings) {
    const src = q.source;
    let valExpr = `""`;
    if (src.kind === "literal") {
      valExpr = JSON.stringify(src.value);
    } else if (src.kind === "prev_response") {
      const field = src.fieldPath || q.key;
      if (src.stepId && stepOutputMap.has(src.stepId)) {
        const varName = stepOutputMap.get(src.stepId);
        valExpr = `String((typeof ${varName} === "object" && ${varName} !== null ? (${varName} as Record<string, unknown>)?.["${field}"] : ${varName}) ?? "")`;
      } else if (ctx.apiStepId && src.stepId === ctx.apiStepId) {
        const target = ctx.resDataVar || "resData";
        valExpr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      } else if (ctx.lastTransformerOutputVar) {
        const varName = ctx.lastTransformerOutputVar;
        valExpr = `String((typeof ${varName} === "object" && ${varName} !== null ? (${varName} as Record<string, unknown>)?.["${field}"] : ${varName}) ?? "")`;
      } else if (ctx.resDataVar) {
        const target = ctx.resDataVar;
        valExpr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      } else if (ctx.hasTriggerResult) {
        const target = "resData";
        valExpr = `String((typeof ${target} === "object" && ${target} !== null ? (${target} as Record<string, unknown>)?.["${field}"] : ${target}) ?? "")`;
      }
    } else if (src.kind === "state_var" && src.storeName) {
      const cleanStore = src.storeName.replace(/Store$/i, "");
      const hook = `use${cleanStore.charAt(0).toUpperCase() + cleanStore.slice(1)}Store`;
      storeNames.add(cleanStore);
      valExpr = `String(${hook}.getState().${src.stateKey || q.key} ?? "")`;
    } else if (src.kind === "route_param") {
      needsUseParams = true;
      valExpr = `(typeof routeParams?.["${src.paramName}"] === "string" ? routeParams["${src.paramName}"] : "")`;
    } else if (src.kind === "query_param") {
      needsUseSearchParams = true;
      valExpr = `(routeSearchParams?.get("${src.paramName}") ?? "")`;
    }
    queryParts.push(`searchParams.set("${q.key}", ${valExpr});`);
  }

  let navCode = "";
  if (queryParts.length > 0) {
    navCode = `${indent}const navUrl = new URL(\`${pathTemplate}\`, "http://localhost");
${queryParts.map((qp) => `${indent}${qp}`).join("\n")}
${indent}router.push(navUrl.pathname + navUrl.search);`;
  } else {
    navCode = `${indent}router.push(\`${pathTemplate}\`);`;
  }

  return {
    navigationCode: navCode,
    needsUseRouter: true,
    needsUseParams,
    needsUseSearchParams,
    storeNames: Array.from(storeNames),
  };
}
