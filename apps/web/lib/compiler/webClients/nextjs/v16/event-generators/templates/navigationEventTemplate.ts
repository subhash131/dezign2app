import type { NavigationPathParamBinding, NavigationQueryParamBinding } from "@workspace/canvas";

export function generateNavigationEventTemplate(
  componentName: string,
  eventName: string,
  targetRoute?: string,
  pathParamBindings: NavigationPathParamBinding[] = [],
  queryParamBindings: NavigationQueryParamBinding[] = [],
): string {
  const route = targetRoute || "/";

  // Match all [param], [...slug], [[...slug]], or :param in route
  const dynamicParamMatches: string[] = [];
  const bracketMatches = route.matchAll(
    /\[\[?\.\.\.?([a-zA-Z0-9_-]+)\]?\]|\[([a-zA-Z0-9_-]+)\]/g,
  );
  for (const m of bracketMatches) {
    const name = m[1] || m[2];
    if (name && !dynamicParamMatches.includes(name)) {
      dynamicParamMatches.push(name);
    }
  }
  const colonMatches = route.matchAll(/:([a-zA-Z0-9_-]+)/g);
  for (const m of colonMatches) {
    const name = m[1];
    if (name && !dynamicParamMatches.includes(name)) {
      dynamicParamMatches.push(name);
    }
  }

  const hasDynamicSegments = dynamicParamMatches.length > 0;
  const hasQueryParams = queryParamBindings.length > 0;

  if (!hasDynamicSegments && !hasQueryParams) {
    return `"use client";

import React from "react";
import Link from "next/link";

export interface ${componentName}Props {
  onTrigger?: (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: Record<string, string | number | boolean | null | undefined>,
  ) => Promise<Record<string, string | number | boolean | null | undefined> | void> | void;
}

export interface ${componentName}ActionContext {
  router?: { push: (href: string) => void; replace?: (href: string) => void };
}

export async function handle${componentName}(ctx: ${componentName}ActionContext = {}) {
  const targetHref = "${route}";
  if (ctx.router?.push) {
    ctx.router.push(targetHref);
  } else if (typeof window !== "undefined") {
    window.location.href = targetHref;
  }
}

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  return (
    <Link
      href="${route}"
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
    >
      <span>${eventName}</span>
    </Link>
  );
}

export default ${componentName};
`;
  }

  // Dynamic route generation
  let needsUseParams = false;
  let needsUseSearchParams = false;
  const zustandStoreImports = new Set<string>();

  // Determine what each dynamic param needs
  const paramExpressions = new Map<string, string>();
  for (const param of dynamicParamMatches) {
    const binding = pathParamBindings.find((b) => b.paramName === param);
    const src = binding?.source;

    if (!src || src.kind === "literal") {
      const val = src?.value || "";
      if (val) {
        paramExpressions.set(param, val);
      } else {
        paramExpressions.set(
          param,
          `\${props?.${param} ?? (typeof routeParams?.["${param}"] === "string" ? routeParams["${param}"] : "")}`,
        );
        needsUseParams = true;
      }
    } else if (src.kind === "route_param") {
      needsUseParams = true;
      const key = src.paramName || param;
      paramExpressions.set(
        param,
        `\${typeof routeParams?.["${key}"] === "string" ? routeParams["${key}"] : ""}`,
      );
    } else if (src.kind === "query_param") {
      needsUseSearchParams = true;
      const key = src.paramName || param;
      paramExpressions.set(param, `\${routeSearchParams?.get("${key}") ?? ""}`);
    } else if (src.kind === "state_var") {
      if (src.sourceType !== "local" && src.storeName) {
        const storeHook = `use${src.storeName.charAt(0).toUpperCase() + src.storeName.slice(1).replace(/Store$/i, "")}Store`;
        zustandStoreImports.add(storeHook);
        const storeField = src.stateKey || src.fieldPath || param;
        paramExpressions.set(
          param,
          `\${String(${storeHook}.getState?.().${storeField} ?? "")}`,
        );
      } else {
        paramExpressions.set(param, `\${props?.${param} ?? ""}`);
      }
    } else if (src.kind === "item_prop") {
      const propField = src.propPath || src.fieldPath || param;
      paramExpressions.set(
        param,
        `\${props?.item?.${propField} ?? props?.${param} ?? ""}`,
      );
    } else if (src.kind === "prev_response") {
      const field = src.fieldPath || param;
      paramExpressions.set(
        param,
        `\${props?.${param} ?? props?.response?.${field} ?? ""}`,
      );
    } else {
      paramExpressions.set(param, `\${props?.${param} ?? ""}`);
    }
  }

  // Build template literal expression for the path
  let pathTemplate = route;
  for (const param of dynamicParamMatches) {
    const expr = paramExpressions.get(param) || `\${props?.${param} ?? ""}`;
    pathTemplate = pathTemplate
      .replace(new RegExp(`\\[\\[?\\.\\.\\.?${param}\\]?\\]`, "g"), expr)
      .replace(new RegExp(`\\[${param}\\]`, "g"), expr)
      .replace(new RegExp(`:${param}\\b`, "g"), expr);
  }

  const navImports: string[] = [];
  if (needsUseParams) navImports.push("useParams");
  if (needsUseSearchParams) navImports.push("useSearchParams");

  const importNavLine =
    navImports.length > 0
      ? `import { ${navImports.join(", ")} } from "next/navigation";\n`
      : "";
  const storeImportLines =
    zustandStoreImports.size > 0
      ? `import { ${Array.from(zustandStoreImports).join(", ")} } from "@/lib/stores";\n`
      : "";

  const propFields = dynamicParamMatches
    .map((p) => `  ${p}?: string;`)
    .concat([
      "  item?: Record<string, string | number | boolean | null | undefined>;",
      "  response?: Record<string, string | number | boolean | null | undefined>;",
    ])
    .join("\n");

  return `"use client";

import React from "react";
import Link from "next/link";
${importNavLine}${storeImportLines}
export interface ${componentName}Props {
${propFields}
  onTrigger?: (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: Record<string, string | number | boolean | null | undefined>,
  ) => Promise<Record<string, string | number | boolean | null | undefined> | void> | void;
}

export interface ${componentName}ActionContext {
  router?: { push: (href: string) => void; replace?: (href: string) => void };
  routeParams?: Record<string, string | string[] | undefined>;
  routeSearchParams?: Record<string, string | string[] | undefined> | URLSearchParams;
  props?: ${componentName}Props;
}

export async function handle${componentName}(ctx: ${componentName}ActionContext = {}) {
  const router = ctx.router;
  const routeParams = ctx.routeParams;
  const routeSearchParams = ctx.routeSearchParams;
  const props = ctx.props || {};
  const targetHref = \`${pathTemplate}\`;
  if (router?.push) {
    router.push(targetHref);
  } else if (typeof window !== "undefined") {
    window.location.href = targetHref;
  }
}

export function ${componentName}(props: ${componentName}Props) {
${needsUseParams ? `  const routeParams = useParams();\n` : ""}${needsUseSearchParams ? `  const routeSearchParams = useSearchParams();\n` : ""}  const targetHref = \`${pathTemplate}\`;

  return (
    <Link
      href={targetHref}
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 cursor-pointer"
    >
      <span>${eventName}</span>
    </Link>
  );
}

export default ${componentName};
`;
}
