import { PageSection } from "@workspace/canvas/types";
import { EventComponentMeta } from "./eventGenerators";

export interface SectionMeta {
  id: string;
  name: string;
  folderName: string;
  componentName: string;
  renderMode?: "server" | "client";
  actions?: EventComponentMeta[];
}

const CLIENT_ONLY_PACKAGES = new Set([
  "framer-motion",
  "canvas-confetti",
  "@tanstack/react-query",
  "@tanstack/react-table",
  "zustand",
]);

function resolveLibraryImports(libraries?: string[]): {
  libraryImports: string;
  requiresClient: boolean;
} {
  if (!libraries || libraries.length === 0) {
    return { libraryImports: "", requiresClient: false };
  }

  let requiresClient = false;
  const statements: string[] = [];

  for (const lib of libraries) {
    const clean = lib.trim();
    if (!clean) continue;
    if (CLIENT_ONLY_PACKAGES.has(clean)) {
      requiresClient = true;
    }
    const safeIdentifier = clean
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/^_+/, "");
    statements.push(`import * as ${safeIdentifier} from "${clean}";`);
  }

  return {
    libraryImports: statements.length > 0 ? `${statements.join("\n")}\n` : "",
    requiresClient,
  };
}

function mapStateTypeToTs(type: string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

function formatStateDefaultValue(type: string, defVal: unknown): string {
  if (defVal !== undefined && defVal !== null) {
    if (typeof defVal === "string") return JSON.stringify(defVal);
    if (typeof defVal === "number" || typeof defVal === "boolean") return String(defVal);
    try {
      return JSON.stringify(defVal);
    } catch {
      // fallback
    }
  }
  switch (type) {
    case "string":
      return '""';
    case "number":
      return "0";
    case "boolean":
      return "false";
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      return "null";
  }
}

function toCamelCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "state";
  if (/[\s\-_]/.test(clean)) {
    const words = clean.split(/[\s\-_]+/);
    return words[0]!.toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function generateSectionComponent(
  section: PageSection,
  sectionCompName: string,
  eventComponents: EventComponentMeta[],
): string {
  const { libraryImports, requiresClient: libRequiresClient } = resolveLibraryImports(section.libraries);
  const hasStates = Array.isArray(section.states) && section.states.length > 0;

  const boundStores = (section.actions || [])
    .map((a) => a.storeActionBinding)
    .filter((b): b is NonNullable<typeof b> => Boolean(b && b.storeName));
  const hasStoreBindings = boundStores.length > 0;

  const isClient = section.renderMode === "client" || libRequiresClient || hasStates || hasStoreBindings;

  const actionImports = eventComponents
    .map((c) => `import { ${c.componentName} } from "./${c.componentName}";`)
    .join("\n");

  const uniqueStoreNames = Array.from(new Set(boundStores.map((b) => b.storeName!)));
  const storeImports = uniqueStoreNames
    .map((sName) => {
      const clean = sName.replace(/Store$/i, "");
      const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
      return `import { ${hookName} } from "@/lib/stores";`;
    })
    .join("\n");

  const storeHookCalls = uniqueStoreNames
    .map((sName) => {
      const clean = sName.replace(/Store$/i, "");
      const hookName = `use${clean.charAt(0).toUpperCase() + clean.slice(1)}Store`;
      return `  const ${toCamelCase(clean)}Store = ${hookName}();`;
    })
    .join("\n");

  const hasActions = eventComponents.length > 0;
  const isNavOnly =
    hasActions && eventComponents.every((c) => c.eventType === "navigateToPage") && !hasStates && !hasStoreBindings;

  const reactImport = hasStates
    ? `import React, { useState } from "react";`
    : `import React from "react";`;

  // Generate useState statements
  const stateDeclarations = hasStates
    ? (section.states || [])
        .map((st) => {
          const varName = toCamelCase(st.name || "state");
          const setterName = `set${toPascalCase(st.name || "state")}`;
          const tsType = mapStateTypeToTs(st.type || "string");
          const defaultVal = formatStateDefaultValue(st.type || "string", st.defaultValue);
          return `  const [${varName}, ${setterName}] = useState<${tsType}>(${defaultVal});`;
        })
        .join("\n")
    : "";

  const combinedSetupLines = [
    stateDeclarations,
    storeHookCalls,
  ].filter(Boolean).join("\n");

  if (isNavOnly) {
    return `${isClient ? `"use client";\n\n` : ""}${reactImport}
${libraryImports}${storeImports ? `${storeImports}\n` : ""}${actionImports ? `${actionImports}\n` : ""}export interface ${sectionCompName}Props {
  onTrigger?: (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: unknown,
  ) => void;
}

export function ${sectionCompName}({ onTrigger }: ${sectionCompName}Props) {
${combinedSetupLines ? `${combinedSetupLines}\n\n` : ""}  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
${eventComponents
  .map((c) => `      <${c.componentName} onTrigger={onTrigger} />`)
  .join("\n")}
    </div>
  );
}

export default ${sectionCompName};
`;
  }

  const descriptionJsx = section.description
    ? `\n        <CardDescription className="text-xs text-muted-foreground">${section.description}</CardDescription>`
    : "";

  const contentJsx = hasActions
    ? `\n      <CardContent>\n        <div className="flex flex-wrap gap-3">\n${eventComponents
        .map((c) => `          <${c.componentName} onTrigger={onTrigger} />`)
        .join("\n")}\n        </div>\n      </CardContent>`
    : "";

  return `${isClient ? `"use client";\n\n` : ""}${reactImport}
import { Card, CardHeader, CardTitle${section.description ? ", CardDescription" : ""}${hasActions ? ", CardContent" : ""} } from "@workspace/ui/components/card";
${libraryImports}${storeImports ? `${storeImports}\n` : ""}${actionImports ? `${actionImports}\n` : ""}export interface ${sectionCompName}Props {
  onTrigger?: (
    eventName: string,
    eventType: string,
    url: string,
    method: string,
    requireAuth?: boolean,
    customHeaders?: Record<string, string>,
    queryParams?: Record<string, string>,
    requestBody?: unknown,
  ) => void;
}

export function ${sectionCompName}({ onTrigger }: ${sectionCompName}Props) {
${combinedSetupLines ? `${combinedSetupLines}\n\n` : ""}  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-card-foreground">${section.name || "Section"}</CardTitle>${descriptionJsx}
      </CardHeader>${contentJsx}
    </Card>
  );
}

export default ${sectionCompName};
`;
}
