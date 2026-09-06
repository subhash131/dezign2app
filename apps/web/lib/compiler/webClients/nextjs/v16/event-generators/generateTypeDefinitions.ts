import { ResolvedEventParameters } from "./types";
import { typeStrToTsAndZod } from "@/lib/compiler/generators/schemaToTypeScript";

function toValidTsIdentifier(name: string): string {
  const clean = name.trim();
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean)) {
    return clean;
  }
  return JSON.stringify(clean);
}

export function generateTypeDefinitions(
  componentName: string,
  params: ResolvedEventParameters,
): string[] {
  const {
    mergedPathParams,
    mergedQueryParams,
    mergedHeaders,
    bodyFields,
    inferredJsonFields,
    isBodyAllowedMethod,
    hasPathParams,
    hasQueryParams,
    hasHeaders,
    hasBodyFields,
    hasRawJson,
  } = params;

  const typeDefs: string[] = [];

  // PathParams Interface
  if (hasPathParams) {
    const validParams = mergedPathParams.filter(
      (p) => Boolean(p && p.name && p.name.trim()),
    );
    if (validParams.length > 0) {
      const fieldsTs = validParams
        .map((p) => {
          const key = toValidTsIdentifier(p.name);
          const tsType = p.type === "number" ? "number" : "string";
          const opt = p.required ? "" : "?";
          return `  ${key}${opt}: ${tsType};`;
        })
        .join("\n");
      typeDefs.push(`export interface ${componentName}PathParams {\n${fieldsTs}\n}`);
    }
  }

  // QueryParams Interface
  if (hasQueryParams) {
    const validParams = mergedQueryParams.filter(
      (q) => Boolean(q && q.name && q.name.trim()),
    );
    if (validParams.length > 0) {
      const fieldsTs = validParams
        .map((q) => {
          const key = toValidTsIdentifier(q.name);
          let tsType = "string";
          if (q.type === "number") tsType = "number";
          else if (q.type === "boolean") tsType = "boolean";
          const opt = q.required ? "" : "?";
          return `  ${key}${opt}: ${tsType};`;
        })
        .join("\n");
      typeDefs.push(`export interface ${componentName}QueryParams {\n${fieldsTs}\n}`);
    }
  }

  // Headers Interface
  if (hasHeaders) {
    const validHeaders = mergedHeaders.filter(
      (h) => Boolean(h && h.name && h.name.trim()),
    );
    if (validHeaders.length > 0) {
      const fieldsTs = validHeaders
        .map((h) => {
          const opt = h.required ? "" : "?";
          return `  ${JSON.stringify(h.name.trim())}${opt}: string;`;
        })
        .join("\n");
      typeDefs.push(`export interface ${componentName}Headers {\n${fieldsTs}\n}`);
    }
  }

  // RequestBody Interface
  if (isBodyAllowedMethod && (hasBodyFields || hasRawJson)) {
    const validBodyFields = bodyFields.filter(
      (f) => Boolean(f && f.name && f.name.trim()),
    );
    const validInferredFields = inferredJsonFields.filter(
      ([k]) => Boolean(k && k.trim()),
    );

    if (validBodyFields.length > 0) {
      const fieldsTs = validBodyFields
        .map((f) => {
          const key = toValidTsIdentifier(f.name);
          let tsType = "string";
          if (f.type === "number") tsType = "number";
          else if (f.type === "boolean") tsType = "boolean";
          else if (f.type === "object") tsType = "Record<string, unknown>";
          else if (f.type === "array") tsType = "unknown[]";
          else if (f.type) {
            const { ts } = typeStrToTsAndZod(f.type, f.enumValues);
            tsType = ts;
          }
          const opt = f.required ? "" : "?";
          return `  ${key}${opt}: ${tsType};`;
        })
        .join("\n");
      typeDefs.push(`export interface ${componentName}RequestBody {\n${fieldsTs}\n}`);
    } else if (validInferredFields.length > 0) {
      const fieldsTs = validInferredFields
        .map(([k, t]) => {
          const key = toValidTsIdentifier(k);
          return `  ${key}?: ${t};`;
        })
        .join("\n");
      typeDefs.push(`export interface ${componentName}RequestBody {\n${fieldsTs}\n}`);
    } else {
      typeDefs.push(`export type ${componentName}RequestBody = Record<string, unknown>;`);
    }
  }

  // Combined RequestPayload Interface
  typeDefs.push(`export interface ${componentName}RequestPayload {
${hasPathParams ? `  pathParams?: ${componentName}PathParams;\n` : ""}${hasQueryParams ? `  queryParams?: ${componentName}QueryParams;\n` : ""}${hasHeaders ? `  headers?: ${componentName}Headers;\n` : ""}${isBodyAllowedMethod && (hasBodyFields || hasRawJson) ? `  body?: ${componentName}RequestBody;\n` : ""}}`);

  // Props Interface
  typeDefs.push(`export interface ${componentName}Props {
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
  onRequestChange?: (payload: ${componentName}RequestPayload) => void;
  className?: string;
}`);

  return typeDefs;
}
