import { StoreActionBinding } from "@workspace/canvas/types";
import { resolveStoreActionMethodName } from "../../storeActionResolver";
import { resolveBaseUrlInfo } from "../paramUtils";

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
}): string {
  const libImports = resolveActionLibImports(libraries);

  const bindings: StoreActionBinding[] =
    Array.isArray(storeActionBindings) && storeActionBindings.length > 0
      ? storeActionBindings
      : storeActionBinding
      ? [storeActionBinding]
      : [];

  const uniqueStoreNames = Array.from(
    new Set(
      bindings
        .map((b) => b.storeName?.replace(/Store$/i, ""))
        .filter((n): n is string => Boolean(n)),
    ),
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
  const generateStoreUpdates = () => {
    let preTrigger = "";
    let postTrigger = "";

    bindings.forEach((b) => {
      const rawStoreName = b.storeName?.replace(/Store$/i, "");
      if (!rawStoreName) return;
      const storeHookName = `use${rawStoreName.charAt(0).toUpperCase() + rawStoreName.slice(1)}Store`;
      const storeActionName = resolveStoreActionMethodName(b);

      const hasApiUrl = Boolean(url && url.trim() && url !== "#");
      const src = !hasApiUrl ? "direct" : (b.updateSource || "response");
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

      if (src === "response_property" && vPath) {
        const isFullPayload = vPath === "*" || vPath === "$" || vPath === "data" || vPath === "response";
        const chain = vPath.split(".").filter(Boolean).map((k) => `?.[${JSON.stringify(k)}]`).join("");
        const extractionExpr = isFullPayload
          ? `(resData${chain} !== undefined ? resData${chain} : resData)`
          : `resData${chain}`;
        const isStringTarget =
          b.targetFieldType === "string" ||
          (!b.targetFieldType &&
            (b.targetFieldName?.toLowerCase().includes("message") ||
              b.targetFieldName?.toLowerCase().includes("text") ||
              b.targetFieldName?.toLowerCase().includes("title") ||
              b.targetFieldName?.toLowerCase().includes("desc") ||
              b.targetFieldName?.toLowerCase().includes("input") ||
              storeActionName.toLowerCase().includes("message") ||
              storeActionName.toLowerCase().includes("text")));
        const isNumberTarget = b.targetFieldType === "number";
        const isBooleanTarget = b.targetFieldType === "boolean";
        const isArrayTarget = b.targetFieldType === "array" || Boolean(b.targetFieldType?.endsWith("[]"));

        let passedExpr = "extracted";
        if (isStringTarget) {
          passedExpr = `typeof extracted === "string" ? extracted : (extracted !== null && extracted !== undefined ? String(extracted) : "")`;
        } else if (isNumberTarget) {
          passedExpr = `typeof extracted === "number" ? extracted : (Number(extracted) || 0)`;
        } else if (isBooleanTarget) {
          passedExpr = `typeof extracted === "boolean" ? extracted : Boolean(extracted)`;
        } else if (isArrayTarget) {
          passedExpr = `Array.isArray(extracted) ? extracted : (extracted !== null && extracted !== undefined ? [extracted] : [])`;
        }

        postTrigger += `      if (triggerResult) {
        const resData =
          triggerResult && typeof triggerResult === "object" && "data" in triggerResult && triggerResult.data !== undefined
            ? triggerResult.data
            : triggerResult;
        const extracted = ${extractionExpr};
        ${storeHookName}.getState().${storeActionName}(${passedExpr});
      }\n`;
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
          postTrigger += `      if (triggerResult) {
        const resData =
          triggerResult && typeof triggerResult === "object" && "data" in triggerResult && triggerResult.data !== undefined
            ? triggerResult.data
            : triggerResult;
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
        postTrigger += `      if (triggerResult) {
        const resData =
          triggerResult && typeof triggerResult === "object" && "data" in triggerResult && triggerResult.data !== undefined
            ? triggerResult.data
            : triggerResult;
        ${storeHookName}.getState().${storeActionName}(${paramArgs.join(", ")});
      }\n`;
        return;
      }

      // Default response:
      const isStringTarget =
        b.targetFieldType === "string" ||
        (!b.targetFieldType &&
          (b.targetFieldName?.toLowerCase().includes("message") ||
            b.targetFieldName?.toLowerCase().includes("text") ||
            b.targetFieldName?.toLowerCase().includes("title") ||
            b.targetFieldName?.toLowerCase().includes("desc") ||
            b.targetFieldName?.toLowerCase().includes("input") ||
            storeActionName.toLowerCase().includes("message") ||
            storeActionName.toLowerCase().includes("text")));
      const isNumberTarget = b.targetFieldType === "number";
      const isBooleanTarget = b.targetFieldType === "boolean";
      const isArrayTarget = b.targetFieldType === "array" || Boolean(b.targetFieldType?.endsWith("[]"));

      let passedExpr = "resData";
      if (isStringTarget) {
        passedExpr = `typeof resData === "string" ? resData : (resData !== null && resData !== undefined ? String(resData) : "")`;
      } else if (isNumberTarget) {
        passedExpr = `typeof resData === "number" ? resData : (Number(resData) || 0)`;
      } else if (isBooleanTarget) {
        passedExpr = `typeof resData === "boolean" ? resData : Boolean(resData)`;
      } else if (isArrayTarget) {
        passedExpr = `Array.isArray(resData) ? resData : (resData !== null && resData !== undefined ? [resData] : [])`;
      }

      postTrigger += `      if (triggerResult) {
        const resData =
          triggerResult && typeof triggerResult === "object" && "data" in triggerResult && triggerResult.data !== undefined
            ? triggerResult.data
            : triggerResult;
        ${storeHookName}.getState().${storeActionName}(${passedExpr});
      }\n`;
    });

    return { preTrigger, postTrigger };
  };

  const urlInfo = resolveBaseUrlInfo(url, serviceName);
  const storeSnippet = generateStoreUpdates();

  return `"use client";

import React, { useState } from "react";
import { Button } from "@workspace/ui/components/button";
${storeImports}${libImports}
${typeDefs.join("\n\n")}

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
${urlInfo.baseUrlDeclaration ? `      ${urlInfo.baseUrlDeclaration}\n` : ""}${storeSnippet.preTrigger}      const triggerResult = await onTrigger?.(
        "${eventName}",
        "${eventType}",
        ${urlInfo.urlExpression},
        "${upperMethod}",
        ${Boolean(requireAuth)},
      );
${storeSnippet.postTrigger}    } finally {
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
