import { Endpoint, CompiledFile } from "@workspace/canvas/types";
import { parseSchemaJson } from "../../../../utils";
import {
  toPascalCase,
  toGoFieldName,
  toGoPrimitiveType,
  toGoHandlerName,
} from "./utils";

interface FieldDefinition {
  name: string;
  goType: string;
  jsonTag: string;
  bindingTag?: string;
  comment?: string;
}

interface StructDefinition {
  name: string;
  fields: FieldDefinition[];
  comment?: string;
}

/**
 * Generates Go models (structs) for endpoint request and response payloads
 */
export function generateModels(
  endpoints: (Endpoint & { nodeId?: string })[],
): {
  files: CompiledFile[];
  requestModelMap: Map<string, string>; // endpointId -> structName
  responseModelMap: Map<string, string>; // endpointId -> structName
} {
  const structs: StructDefinition[] = [];
  const requestModelMap = new Map<string, string>();
  const responseModelMap = new Map<string, string>();
  let needsTimeImport = false;

  endpoints.forEach((ep, index) => {
    const method = (ep.type || "GET").toUpperCase();
    const rawPath = ep.name || `/endpoint_${index + 1}`;
    const baseName = toGoHandlerName(method, rawPath, index).replace(/Handler$/, "");

    // 1. Generate Request Body Model if applicable (POST, PUT, PATCH, etc.)
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && ep.requestBody) {
      const structName = `${baseName}Request`;
      const fields: FieldDefinition[] = [];

      // Check fields array
      if (Array.isArray(ep.requestBody.fields) && ep.requestBody.fields.length > 0) {
        ep.requestBody.fields.forEach((field) => {
          if (!field.name) return;
          const goType = toGoPrimitiveType(field.type);
          if (goType.includes("time.Time")) needsTimeImport = true;

          const isRequired = field.required ?? true;
          const binding = isRequired ? 'binding:"required"' : 'binding:"omitempty"';

          fields.push({
            name: toGoFieldName(field.name),
            goType,
            jsonTag: `json:"${field.name}${isRequired ? "" : ",omitempty"}"`,
            bindingTag: binding,
            comment: field.description,
          });
        });
      }
      // Check rawJson string
      else if (ep.requestBody.rawJson) {
        const parsed = parseSchemaJson(ep.requestBody.rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([key, val]) => {
            let goType = "string";
            if (typeof val === "number") {
              goType = Number.isInteger(val) ? "int64" : "float64";
            } else if (typeof val === "boolean") {
              goType = "bool";
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === "string") goType = "[]string";
              else if (val.length > 0 && typeof val[0] === "number") goType = "[]float64";
              else goType = "[]interface{}";
            } else if (typeof val === "object" && val !== null) {
              goType = "map[string]interface{}";
            }

            fields.push({
              name: toGoFieldName(key),
              goType,
              jsonTag: `json:"${key}"`,
              bindingTag: 'binding:"omitempty"',
            });
          });
        }
      }

      if (fields.length > 0) {
        structs.push({
          name: structName,
          fields,
          comment: `Payload for ${method} ${rawPath}`,
        });
        requestModelMap.set(ep.id, structName);
      }
    }

    // 2. Generate Response Body Model if defined
    if (ep.responseBody) {
      const structName = `${baseName}Response`;
      const fields: FieldDefinition[] = [];

      if (Array.isArray(ep.responseBody.fields) && ep.responseBody.fields.length > 0) {
        ep.responseBody.fields.forEach((field) => {
          if (!field.name) return;
          const goType = toGoPrimitiveType(field.type);
          if (goType.includes("time.Time")) needsTimeImport = true;

          fields.push({
            name: toGoFieldName(field.name),
            goType,
            jsonTag: `json:"${field.name}"`,
            comment: field.description,
          });
        });
      } else if (ep.responseBody.rawJson) {
        const parsed = parseSchemaJson(ep.responseBody.rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([key, val]) => {
            let goType = "string";
            if (typeof val === "number") {
              goType = Number.isInteger(val) ? "int64" : "float64";
            } else if (typeof val === "boolean") {
              goType = "bool";
            } else if (Array.isArray(val)) {
              if (val.length > 0 && typeof val[0] === "string") goType = "[]string";
              else if (val.length > 0 && typeof val[0] === "number") goType = "[]float64";
              else goType = "[]interface{}";
            } else if (typeof val === "object" && val !== null) {
              goType = "map[string]interface{}";
            }

            fields.push({
              name: toGoFieldName(key),
              goType,
              jsonTag: `json:"${key}"`,
            });
          });
        }
      }

      if (fields.length > 0) {
        structs.push({
          name: structName,
          fields,
          comment: `Response structure for ${method} ${rawPath}`,
        });
        responseModelMap.set(ep.id, structName);
      }
    }
  });

  const imports: string[] = [];
  if (needsTimeImport) {
    imports.push('"time"');
  }

  let content = `package models\n\n`;
  if (imports.length > 0) {
    content += `import (\n\t${imports.join("\n\t")}\n)\n\n`;
  }

  if (structs.length === 0) {
    // Provide a standard response model as fallback
    content += `// StandardResponse provides a generic JSON envelope\ntype StandardResponse struct {\n\tSuccess bool        \`json:"success"\`\n\tMessage string      \`json:"message,omitempty"\`\n\tData    interface{} \`json:"data,omitempty"\`\n}\n`;
  } else {
    structs.forEach((s) => {
      if (s.comment) {
        content += `// ${s.name} - ${s.comment}\n`;
      }
      content += `type ${s.name} struct {\n`;
      s.fields.forEach((f) => {
        const tags = [f.jsonTag, f.bindingTag].filter(Boolean).join(" ");
        const comment = f.comment ? ` // ${f.comment}` : "";
        content += `\t${f.name.padEnd(20)} ${f.goType.padEnd(16)} \`${tags}\`${comment}\n`;
      });
      content += `}\n\n`;
    });
  }

  return {
    files: [
      {
        filename: "models/models.go",
        language: "go",
        content,
      },
    ],
    requestModelMap,
    responseModelMap,
  };
}

