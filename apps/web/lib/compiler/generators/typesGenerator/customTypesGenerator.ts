import { BackendNode } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";

export function sanitizeCustomTypeString(rawType: string): string {
  const trimmed = (rawType || "string").trim();
  if (!trimmed || trimmed === "any" || trimmed === "unknown") {
    return "string";
  }
  // Guard against truncated type strings ending with ellipsis (e.g. "conn..." or "string | ...")
  if (/\.\.\.\s*$/.test(trimmed) || trimmed.endsWith("...")) {
    if (trimmed.startsWith("(") || trimmed.includes("=>")) {
      return "(...args: any[]) => any";
    }
    return "any";
  }
  return trimmed;
}

export function generateCustomTypesModule(
  nodes: BackendNode[],
): { file?: CompiledFile; exportStatement?: string } {
  const typesNodes = nodes.filter((n) => n.type === "types");
  if (typesNodes.length === 0) {
    return {};
  }

  let customTypesCode = `// @ts-nocheck\n/* eslint-disable */\n/**\n * Custom Reusable Types & Domain Models\n * Defined via Architecture Canvas Types Nodes\n */\n\n// Ambient helper types for package-extracted types & React compatibility\ntype ReactMouseEvent<T = any> = any;\ntype ReactNode = any;\ntype CSSProperties = any;\ntype SVGProps<T = any> = any;\ntype RefAttributes<T = any> = any;\ntype ForwardRefExoticComponent<P = any> = any;\ntype HTMLAttributes<T = any> = any;\ntype ComponentType<P = any> = any;\ntype SVGSVGElement = any;\ntype HTMLDivElement = any;\ntype NodeType = any;\ntype EdgeType = any;\n\n`;

  typesNodes.forEach((tNode) => {
    const nodeLabel = tNode.data?.label || "Custom Types";
    const isRaw = tNode.data?.definitionMode === "raw";
    const rawCode = tNode.data?.rawTypeScript;
    const typesList = tNode.data?.types || [];

    customTypesCode += `// ─── ${nodeLabel} ───────────────────────────────────────────\n`;

    if (isRaw && rawCode) {
      customTypesCode += `${rawCode.trim()}\n\n`;
    } else if (typesList.length > 0) {
      typesList.forEach((item) => {
        if (item.description) {
          customTypesCode += `/**\n * ${item.description}\n */\n`;
        }
        if (item.kind === "enum") {
          const vals = item.enumValues || [];
          if (vals.length > 0) {
            const enumLines = vals.map((v) => `  ${v} = "${v}",`).join("\n");
            customTypesCode += `export enum ${item.name || "MyEnum"} {\n${enumLines}\n}\n\n`;
          } else {
            customTypesCode += `export enum ${item.name || "MyEnum"} {}\n\n`;
          }
        } else if (item.kind === "type") {
          if (item.typeAliasValue) {
            const cleanAlias = sanitizeCustomTypeString(item.typeAliasValue);
            customTypesCode += `export type ${item.name || "MyType"} = ${cleanAlias};\n\n`;
          } else {
            const fields = item.fields || [];
            const fieldLines = fields
              .map((f) => {
                const isArr = Boolean(f.isArray || f.type?.endsWith("[]"));
                const base = sanitizeCustomTypeString((f.type || "string").replace(/\[\]$/, ""));
                const finalType = isArr ? `${base}[]` : base;
                return `  ${f.name}${f.required === false ? "?" : ""}: ${finalType};`;
              })
              .join("\n");
            customTypesCode += `export type ${item.name || "MyType"} = {\n${fieldLines}\n};\n\n`;
          }
        } else {
          // interface
          const fields = item.fields || [];
          if (fields.length === 0) {
            customTypesCode += `export interface ${item.name || "MyInterface"} {\n  [key: string]: unknown;\n}\n\n`;
          } else {
            const fieldLines = fields
              .map((f) => {
                const isArr = Boolean(f.isArray || f.type?.endsWith("[]"));
                const base = sanitizeCustomTypeString((f.type || "string").replace(/\[\]$/, ""));
                const finalType = isArr ? `${base}[]` : base;
                return `  ${f.name}${f.required === false ? "?" : ""}: ${finalType};`;
              })
              .join("\n");
            customTypesCode += `export interface ${item.name || "MyInterface"} {\n${fieldLines}\n}\n\n`;
          }
        }
      });
    }
  });

  return {
    file: {
      filename: "src/custom.ts",
      language: "typescript",
      content: customTypesCode,
    },
    exportStatement: `export * from "./custom";`,
  };
}
