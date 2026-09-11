import { BackendNode, BackendEdge } from "@/types/canvas";
import { CompiledFile, ReusableFunction } from "@workspace/canvas/types";
import { toPascalCase, toVarName } from "./utils";
import { parseRelaxedJson } from "./generators/routeGenerator/jsonInterpolation";

export interface CompiledExternalResult {
  /** Files to write into packages/external-apis/ */
  files: CompiledFile[];
  /** ReusableFunction metadata for each compiled tool — used by route generators for imports */
  reusableFunctions: ReusableFunction[];
  /** The global package name, e.g. "@workspace/external-apis" */
  globalPackageName?: string;
}

const GLOBAL_EXTERNAL_PKG = "@workspace/external-apis";

function mapTypeToTs(type: string): string {
  const t = (type || "string").toLowerCase();
  if (["number", "int", "integer", "float", "double"].includes(t)) return "number";
  if (["boolean", "bool"].includes(t)) return "boolean";
  if (["string[]", "array"].includes(t)) return "unknown[]";
  if (["object", "record"].includes(t)) return "Record<string, unknown>";
  if (["any"].includes(t)) return "any";
  return "string";
}

/**
 * Formats a JSON body string (with optional {{varName}} placeholders) into
 * a clean TypeScript `JSON.stringify({ ... })` expression.
 */
function compileJsonBodyExpression(bodyContent: string, baseIndent = 1): string {
  if (!bodyContent || !bodyContent.trim()) {
    return "JSON.stringify(input)";
  }

  const SENTINEL_PREFIX = "__TMP_VAR_TOKEN_";
  const SENTINEL_SUFFIX = "_END__";

  // Replace {{var}} in values (e.g. : {{var}} or : "{{var}}") and in array elements
  let normalized = bodyContent
    .replace(/:\s*\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, `: "${SENTINEL_PREFIX}$1${SENTINEL_SUFFIX}"`)
    .replace(/:\s*"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}"/g, `: "${SENTINEL_PREFIX}$1${SENTINEL_SUFFIX}"`)
    .replace(/([,\[]\s*)\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, `$1"${SENTINEL_PREFIX}$2${SENTINEL_SUFFIX}"`)
    .replace(/([,\[]\s*)"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}"/g, `$1"${SENTINEL_PREFIX}$2${SENTINEL_SUFFIX}"`);

  const { parsed, error } = parseRelaxedJson(normalized);
  if (error || parsed === null) {
    // If parsing fails, fall back to interpolated string
    const interpolatedBody = bodyContent.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
      return `\${typeof input["${k}"] === "object" ? JSON.stringify(input["${k}"]) : input["${k}"] ?? ""}`;
    });
    return `\`${interpolatedBody}\``;
  }

  function formatValue(val: unknown, depth: number): string {
    const pad = "  ".repeat(depth);
    const innerPad = "  ".repeat(depth + 1);

    if (val === null) return "null";
    if (typeof val === "number" || typeof val === "boolean") return String(val);

    if (typeof val === "string") {
      const sentinelRegex = new RegExp(`^${SENTINEL_PREFIX}([a-zA-Z0-9_]+)${SENTINEL_SUFFIX}$`);
      const match = sentinelRegex.exec(val);
      if (match) {
        return `input["${match[1]}"]`;
      }

      // Check if it has embedded {{var}}
      if (/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/.test(val)) {
        const interpolated = val.replace(
          /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
          (_, vk) => `\${input["${vk}"] ?? ""}`,
        );
        return `\`${interpolated}\``;
      }

      return JSON.stringify(val);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return "[]";
      const items = val
        .map((item) => `${innerPad}${formatValue(item, depth + 1)}`)
        .join(",\n");
      return `[\n${items},\n${pad}]`;
    }

    if (typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      const lines = entries.map(([k, v]) => {
        const keyExpr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return `${innerPad}${keyExpr}: ${formatValue(v, depth + 1)}`;
      });
      return `{\n${lines.join(",\n")},\n${pad}}`;
    }

    return String(val);
  }

  const objStr = formatValue(parsed, baseIndent);
  return `JSON.stringify(${objStr})`;
}

/**
 * Generates an async TypeScript function file for an external API node.
 */
export function generateExternalFunctionFile(node: BackendNode): CompiledFile {
  const rawFnName = node.data?.functionName || node.data?.label || "callExternalApi";
  const fnName = toVarName(rawFnName);
  const Pascal = toPascalCase(fnName);

  const inputTypeName = `${Pascal}Input`;
  const outputTypeName = `${Pascal}Output`;

  const inputVars = node.data?.inputVariables || [];
  const method = (node.data?.method || "POST").toUpperCase();
  const rawUrl = node.data?.url || node.data?.baseUrl || "https://api.example.com";
  const authType = node.data?.authType || "none";
  const authHeader = node.data?.authHeader || "Authorization";
  const authQueryParam = node.data?.authQueryParam || "api_key";
  const apiKey = node.data?.apiKey || "";
  const headers = (node.data?.headers || []).filter((h) => h.enabled !== false && (h.key || h.name));
  const queryParams = (node.data?.queryParams || []).filter((q) => q.enabled !== false && (q.key || q.name));
  const bodyType = node.data?.bodyType || (["POST", "PUT", "PATCH"].includes(method) ? "json" : "none");
  const bodyContent = node.data?.bodyContent || "";
  const timeoutSec = Number(node.data?.timeout) || 30;

  // Build input interface fields
  const inputFields =
    inputVars.length > 0
      ? inputVars
          .map((v) => {
            const opt = v.required === false ? "?" : "";
            const desc = v.description ? `  /** ${v.description} */\n` : "";
            return `${desc}  ${v.name}${opt}: ${mapTypeToTs(v.type)};`;
          })
          .join("\n") + "\n  [key: string]: unknown;"
      : "  [key: string]: unknown;";

  // Build URL interpolation string in TypeScript
  // replace {{varName}} with ${encodeURIComponent(String(input.varName ?? ""))}
  const tsUrlTemplate = rawUrl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    return `\${encodeURIComponent(String(input["${k}"] ?? ""))}`;
  });

  // Build Query Params code
  const hasQueryParams = queryParams.length > 0;
  const queryParamsLines: string[] = [];
  if (hasQueryParams) {
    queryParamsLines.push("  const queryParams = new URLSearchParams();");
    queryParams.forEach((qp) => {
      const k = qp.key || qp.name || "";
      const v = qp.value || qp.defaultValue || "";
      // If value is a template like {{varName}}
      if (/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.test(v)) {
        const varName = v.replace(/^\{\{\s*|\s*\}\}$/g, "");
        queryParamsLines.push(
          `  if (input["${varName}"] !== undefined) queryParams.set("${k}", String(input["${varName}"]));`,
        );
      } else {
        const interpolatedVal = v.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, vk) => {
          return `\${input["${vk}"] ?? ""}`;
        });
        queryParamsLines.push(`  queryParams.set("${k}", \`${interpolatedVal}\`);`);
      }
    });
  }

  // Build Headers code with case-insensitive deduplication
  const headerMap = new Map<string, string>();

  if (bodyType === "json" && ["POST", "PUT", "PATCH"].includes(method)) {
    headerMap.set("content-type", '    "Content-Type": "application/json",');
  }

  headers.forEach((h) => {
    const k = (h.key || h.name || "").trim();
    if (!k) return;
    const v = h.value || h.defaultValue || "";
    let line = "";
    if (v.startsWith("process.env.")) {
      line = `    "${k}": ${v} || "",`;
    } else if (/^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.test(v)) {
      const varName = v.replace(/^\{\{\s*|\s*\}\}$/g, "");
      line = `    "${k}": String(input["${varName}"] ?? ""),`;
    } else {
      const interpolatedVal = v.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, vk) => {
        return `\${input["${vk}"] ?? ""}`;
      });
      line = `    "${k}": \`${interpolatedVal}\`,`;
    }
    headerMap.set(k.toLowerCase(), line);
  });

  const rawAuthHeader = node.data?.authHeader;
  const rawAuthQueryParam = node.data?.authQueryParam;

  // Resolve API key / token expression
  const resolveKeyExpr = (keyName: string) => {
    if (apiKey.startsWith("process.env.")) {
      return `${apiKey} || ""`;
    }
    if (apiKey) {
      return `"${apiKey}"`;
    }
    return `(input["${keyName}"] ? String(input["${keyName}"]) : (process.env.${toPascalCase(fnName).toUpperCase()}_API_KEY || ""))`;
  };

  // Auth Header handling (only if not already set in user-configured headers)
  if (authType === "bearer" && !headerMap.has("authorization")) {
    headerMap.set("authorization", `    "Authorization": \`Bearer \${${resolveKeyExpr("token")}}\`,`);
  } else if (authType === "apiKey" && (rawAuthHeader || !rawAuthQueryParam)) {
    const headerName = rawAuthHeader || "X-API-Key";
    if (!headerMap.has(headerName.toLowerCase())) {
      headerMap.set(headerName.toLowerCase(), `    "${headerName}": \`\${${resolveKeyExpr("apiKey")}}\`,`);
    }
  } else if (authType === "basic" && !headerMap.has("authorization")) {
    const secretVal = node.data?.apiSecret || "";
    headerMap.set(
      "authorization",
      `    "Authorization": "Basic " + Buffer.from(\`${apiKey}:\${${secretVal ? `"${secretVal}"` : '""'}}\`).toString("base64"),`,
    );
  }

  const headersLines: string[] = [
    "  const headers: Record<string, string> = {",
    ...Array.from(headerMap.values()),
    "  };",
  ];

  // Query param auth
  const authQueryParamLines: string[] = [];
  if (authType === "apiKey" && rawAuthQueryParam) {
    authQueryParamLines.push(`  queryParams.set("${rawAuthQueryParam}", \`\${${resolveKeyExpr("apiKey")}}\`);`);
  }

  // Request Body handling
  const bodyLines: string[] = [];
  if (["POST", "PUT", "PATCH"].includes(method) && bodyType !== "none") {
    if (bodyType === "json" || (!bodyType && bodyContent.trim().startsWith("{"))) {
      const jsonExpr = compileJsonBodyExpression(bodyContent, 1);
      bodyLines.push(`  const requestBody = ${jsonExpr};`);
    } else if (bodyContent.trim()) {
      const interpolatedBody = bodyContent.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
        return `\${typeof input["${k}"] === "object" ? JSON.stringify(input["${k}"]) : input["${k}"] ?? ""}`;
      });
      bodyLines.push(`  const requestBody = \`${interpolatedBody}\`;`);
    } else {
      bodyLines.push(`  const requestBody = JSON.stringify(input);`);
    }
  } else {
    bodyLines.push(`  const requestBody: undefined = undefined;`);
  }

  const descriptionDoc = node.data?.description
    ? `/**\n * ${node.data.description}\n *\n * HTTP ${method} ${rawUrl}\n */\n`
    : `/**\n * External API Calling Tool: ${fnName}\n * HTTP ${method} ${rawUrl}\n */\n`;

  const successTypeName = `${Pascal}SuccessOutput`;
  const errorTypeName = `${Pascal}ErrorOutput`;

  // Build Success interface fields if responseSchema is configured
  let successFields = "  [key: string]: unknown;";
  if (node.data?.responseSchema && typeof node.data.responseSchema === "object") {
    const s = node.data.responseSchema;
    if (s.fields && Array.isArray(s.fields) && s.fields.length > 0) {
      successFields = s.fields
        .map((f: { name?: string; type?: string; required?: boolean }) => {
          const opt = f.required === false ? "?" : "";
          return `  ${f.name || "field"}${opt}: ${mapTypeToTs(f.type || "string")};`;
        })
        .join("\n") + "\n  [key: string]: unknown;";
    } else if (!Array.isArray(s)) {
      const keys = Object.keys(s);
      if (keys.length > 0) {
        successFields = keys
          .map((k) => `  ${k}?: ${typeof (s as Record<string, unknown>)[k] === "number" ? "number" : typeof (s as Record<string, unknown>)[k] === "boolean" ? "boolean" : typeof (s as Record<string, unknown>)[k] === "object" ? "Record<string, unknown>" : "string"};`)
          .join("\n") + "\n  [key: string]: unknown;";
      }
    }
  }

  // Build Error interface fields
  let errorFields = "  error: string;\n  message?: string;\n  statusCode?: number;\n  [key: string]: unknown;";
  if (node.data?.errorResponseSchema && typeof node.data.errorResponseSchema === "object") {
    const es = node.data.errorResponseSchema;
    if (es.fields && Array.isArray(es.fields) && es.fields.length > 0) {
      errorFields = es.fields
        .map((f: { name?: string; type?: string; required?: boolean }) => {
          const opt = f.required === false ? "?" : "";
          return `  ${f.name || "field"}${opt}: ${mapTypeToTs(f.type || "string")};`;
        })
        .join("\n") + "\n  [key: string]: unknown;";
    } else if (!Array.isArray(es)) {
      const keys = Object.keys(es);
      if (keys.length > 0) {
        errorFields = keys
          .map((k) => `  ${k}?: ${typeof (es as Record<string, unknown>)[k] === "number" ? "number" : typeof (es as Record<string, unknown>)[k] === "boolean" ? "boolean" : typeof (es as Record<string, unknown>)[k] === "object" ? "Record<string, unknown>" : "string"};`)
          .join("\n") + "\n  [key: string]: unknown;";
      }
    }
  }

  const content = `${descriptionDoc}export interface ${inputTypeName} {
${inputFields}
}

export interface ${successTypeName} {
${successFields}
}

export interface ${errorTypeName} {
${errorFields}
}

export interface ${outputTypeName} {
  success: boolean;
  status: number;
  data?: ${successTypeName};
  error?: ${errorTypeName};
  [key: string]: unknown;
}

export async function ${fnName}(
  input: ${inputTypeName},
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<${outputTypeName}> {
  let targetUrl = \`${tsUrlTemplate}\`;
${hasQueryParams || authQueryParamLines.length > 0 ? queryParamsLines.join("\n") + "\n" + authQueryParamLines.join("\n") + "\n  const qs = queryParams.toString();\n  if (qs) targetUrl += (targetUrl.includes('?') ? '&' : '?') + qs;\n" : ""}
${headersLines.join("\n")}
${bodyLines.join("\n")}

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? ${timeoutSec * 1000};
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "${method}",
      headers,
      body: requestBody,
      signal: options?.signal || controller.signal,
    });

    if (!response.ok) {
      let errPayload: unknown;
      try {
        errPayload = await response.json();
      } catch {
        const text = await response.text().catch(() => "");
        errPayload = { error: response.statusText || "Request failed", message: text, statusCode: response.status };
      }
      return {
        success: false,
        status: response.status,
        error: (typeof errPayload === "object" && errPayload !== null
          ? errPayload
          : { error: String(errPayload), statusCode: response.status }) as ${errorTypeName},
      } as ${outputTypeName};
    }

    const contentType = response.headers.get("content-type") || "";
    let dataPayload: unknown;
    if (contentType.includes("application/json")) {
      dataPayload = await response.json();
    } else {
      dataPayload = { data: await response.text() };
    }
    return {
      success: true,
      status: response.status,
      data: dataPayload as ${successTypeName},
      ...(typeof dataPayload === "object" && dataPayload !== null ? dataPayload : {}),
    } as ${outputTypeName};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 500,
      error: {
        error: err instanceof Error ? err.name : "FetchError",
        message,
        statusCode: 500,
      } as ${errorTypeName},
    } as ${outputTypeName};
  } finally {
    clearTimeout(timer);
  }
}
`;

  return {
    filename: `src/${fnName}.ts`,
    language: "typescript",
    content,
  };
}

/**
 * Compiles all external API nodes into a shared package:
 * packages/external-apis/
 *
 * Exporting typed functions for each external node that can be called directly
 * or imported into route handlers.
 */
export function compileExternalNodes(
  allNodes: BackendNode[],
  allEdges: BackendEdge[] = [],
): CompiledExternalResult {
  const externalNodes = allNodes.filter((n) => n.type === "external");

  if (externalNodes.length === 0) {
    return { files: [], reusableFunctions: [] };
  }

  const allFiles: CompiledFile[] = [];
  const allReusable: ReusableFunction[] = [];
  const barrelExports: string[] = [];

  externalNodes.forEach((node) => {
    const rawFnName = node.data?.functionName || node.data?.label || "callExternalApi";
    const fnName = toVarName(rawFnName);
    const Pascal = toPascalCase(fnName);
    const inputTypeName = `${Pascal}Input`;
    const outputTypeName = `${Pascal}Output`;

    const file = generateExternalFunctionFile(node);
    allFiles.push({
      filename: `packages/external-apis/${file.filename}`,
      language: file.language,
      content: file.content,
    });

    barrelExports.push(`export * from "./${fnName}";`);

    allReusable.push({
      name: fnName,
      importPath: GLOBAL_EXTERNAL_PKG,
      signature: `${fnName}(input: ${inputTypeName}): Promise<${outputTypeName}>`,
      targetName: node.data?.label || fnName,
      kind: "custom",
    });
  });

  // packages/external-apis/src/index.ts
  allFiles.push({
    filename: "packages/external-apis/src/index.ts",
    language: "typescript",
    content: `/**\n * External API Calling Tools (@workspace/external-apis)\n * Auto-generated by Dezign2App Monorepo Compiler\n */\n\n${barrelExports.join("\n")}\n`,
  });

  // packages/external-apis/package.json
  allFiles.push({
    filename: "packages/external-apis/package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: GLOBAL_EXTERNAL_PKG,
        version: "0.0.1",
        private: true,
        type: "module",
        main: "src/index.ts",
        types: "src/index.ts",
        exports: {
          ".": "./src/index.ts",
          "./*": "./src/*.ts",
        },
        scripts: { build: "tsc", "check-types": "tsc --noEmit" },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          typescript: "^5.3.3",
        },
      },
      null,
      2,
    ),
  });

  // packages/external-apis/tsconfig.json
  allFiles.push({
    filename: "packages/external-apis/tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "./dist", rootDir: "./src" },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  });

  return {
    files: allFiles,
    reusableFunctions: allReusable,
    globalPackageName: GLOBAL_EXTERNAL_PKG,
  };
}
