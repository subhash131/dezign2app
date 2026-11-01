import {
  Endpoint,
  PipelineStep,
  PipelineStepInputSource,
  ConditionExpr,
  JSONValue,
  JSONObject,
} from "@workspace/canvas/types";
import { parseRelaxedJson } from "./generators/routeGenerator/jsonInterpolation";

/**
 * Derives a stable, human-readable camelCase file name for a route/type file.
 *
 * Rules:
 * 1. Checks `ep.name` (the HTTP route path).
 *    - Converts path params like `/:id` or `/{id}` to `_by_$1` (e.g. `/users/:id` -> `getUsersById`).
 *    - If the resulting name is meaningful and NOT a random ID (e.g. `zaz4xx1`, `tohz6eq`, hex hashes, nanoid, or matches `ep.id`), use it!
 * 2. If `ep.name` is missing, empty, generic (`endpoint_1`), or a random ID:
 *    - Check `ep.summary`: if human-readable text exists (e.g. "Create a product"), clean and use it.
 *    - Check `ep.businessLogic`: if a short descriptive title exists, use it.
 * 3. Fallback:
 *    - If `serviceName` is provided (e.g. "Products", "NotificationService"):
 *      Use method + serviceName (e.g. `getProducts`, `createProducts`, `getNotificationService`).
 *      For multiple fallback endpoints in the same service: `getProducts`, `getProducts_2`, etc.
 *    - If no `serviceName`:
 *      Use method + "endpoint" (e.g. `get_endpoint_1`).
 *
 * Guaranteed: NO random database IDs or nanoids in route names or type definitions.
 */
export function deriveRouteFileName(
  ep: Pick<Endpoint, "name" | "summary" | "type"> & { id?: string; businessLogic?: string },
  index: number,
  serviceName?: string,
): string {
  const method = (ep.type || "GET").toLowerCase();

  function isRandomId(raw: string): boolean {
    if (!raw) return true;
    const clean = raw.trim();
    if (!clean) return true;

    // Direct check against ep.id if available
    if (ep.id && (clean === ep.id || clean === `/${ep.id}` || clean.toLowerCase() === ep.id.toLowerCase())) {
      return true;
    }

    // Generic placeholders
    if (/^(endpoint|route)(_\d+)?$/i.test(clean)) return true;

    // Strip leading and trailing slashes and take non-empty segments
    const segments = clean.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segments.length === 0) return true;

    return segments.every((seg) => {
      // Direct match with ep.id
      if (ep.id && (seg === ep.id || seg.toLowerCase() === ep.id.toLowerCase())) return true;

      // Pure hex string: e.g. "a1b2c3d4", "deadbeef", "7f8a9b"
      if (/^[0-9a-f]{5,32}$/i.test(seg)) return true;

      // Base36 / nanoid random pattern: 5-14 chars with mixed letters and numbers
      // e.g. "zaz4xx1", "tohz6eq", "k3m8n1p", "9a8b7c"
      if (/^[a-z0-9]{5,14}$/i.test(seg) && /[0-9]/.test(seg) && /[a-z]/i.test(seg)) {
        // Exception: standard common tech abbreviations with numbers
        if (/^(oauth2|v\d+|mp\d+|h\d+|b2b|b2c|p2p|ipv\d+)$/i.test(seg)) return false;
        return true;
      }

      // Pure numbers
      if (/^\d+$/.test(seg)) return true;

      // Random consonant clusters (no vowels in words >= 5 chars, e.g. "zxcvbn")
      if (seg.length >= 5 && !/[aeiouy]/i.test(seg)) return true;

      return false;
    });
  }

  // Helper to convert path with params into readable string
  function cleanPathString(pathStr: string): string {
    return pathStr
      .replace(/:([a-zA-Z0-9_]+)/g, "by_$1")
      .replace(/\{([a-zA-Z0-9_]+)\}/g, "by_$1")
      .replace(/^[\/\s]+|[\/\s]+$/g, "")
      .replace(/^(endpoint|route)[_\s-]+/i, "");
  }

  // 1. Try path name
  if (ep.name && ep.name.trim()) {
    const rawPath = ep.name.trim();
    if (!isRandomId(rawPath)) {
      const cleaned = cleanPathString(rawPath);
      const stripped = cleaned.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "").trim();
      const derived = toVarName(`${method}_${stripped}`);
      if (derived && derived !== method && !isRandomId(derived)) {
        return derived;
      }
    }
  }

  // 2. Try summary
  if (ep.summary && ep.summary.trim()) {
    const rawSummary = ep.summary.trim();
    if (!isRandomId(rawSummary)) {
      const cleaned = cleanPathString(rawSummary);
      const stripped = cleaned
        .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
        .replace(new RegExp(`^(${method})\\s+`, "i"), "")
        .trim();
      const derived = toVarName(`${method}_${stripped}`);
      if (derived && derived !== method) {
        return derived;
      }
    }
  }

  // 3. Try businessLogic if it has a short descriptive title
  if (ep.businessLogic && ep.businessLogic.trim()) {
    const firstLine = ep.businessLogic.trim().split("\n")[0]?.trim() || "";
    if (
      firstLine &&
      firstLine.length <= 40 &&
      !isRandomId(firstLine) &&
      !firstLine.startsWith("import") &&
      !firstLine.startsWith("const") &&
      !firstLine.startsWith("//")
    ) {
      const cleaned = cleanPathString(firstLine);
      const stripped = cleaned
        .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
        .replace(new RegExp(`^(${method})\\s+`, "i"), "")
        .trim();
      const derived = toVarName(`${method}_${stripped}`);
      if (derived && derived !== method) {
        return derived;
      }
    }
  }

  // 4. Meaningful Fallback using Service Name & HTTP Method
  if (serviceName && serviceName.trim()) {
    const cleanServiceName = serviceName.trim();
    const suffix = index > 0 ? `_${index + 1}` : "";
    const methodVerb =
      method === "post"
        ? "create"
        : method === "put" || method === "patch"
          ? "update"
          : method === "delete"
            ? "delete"
            : "get";

    return toVarName(`${methodVerb}_${cleanServiceName}${suffix}`);
  }

  return toVarName(`${method}_endpoint_${index + 1}`);
}


export function parseSchemaJson(rawJson?: string): JSONValue {
  if (!rawJson || !rawJson.trim()) return null;
  const { parsed } = parseRelaxedJson(rawJson);
  return (parsed as JSONValue) ?? null;
}

export function toSqlIdentifier(str: string, fallback = "item"): string {
  if (!str) return fallback;
  const clean = str
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[^a-zA-Z_]+/, "");
  return clean || fallback;
}

export function toVarName(str: string): string {
  const safe = toSqlIdentifier(str, "item");
  const hasLeadingUnderscore = safe.startsWith("_");
  const core = hasLeadingUnderscore ? safe.slice(1) : safe;
  const camel = core.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
  if (!camel) return hasLeadingUnderscore ? "_item" : "item";
  const result = camel.charAt(0).toLowerCase() + camel.slice(1);
  return hasLeadingUnderscore ? `_${result}` : result;
}

export function toPascalCase(str: string): string {
  if (!str) return "Item";
  const snake = str.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const safe = toSqlIdentifier(snake, "Item");
  const hasLeadingUnderscore = safe.startsWith("_");
  const core = hasLeadingUnderscore ? safe.slice(1) : safe;
  const camel = core.replace(/_([a-z0-9])/gi, (_, char) => char.toUpperCase());
  if (!camel) return hasLeadingUnderscore ? "_Item" : "Item";
  const result = camel.charAt(0).toUpperCase() + camel.slice(1);
  return hasLeadingUnderscore ? `_${result}` : result;
}

export function toTableName(str: string): string {
  if (!str) return "table";
  const snake = str.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return toSqlIdentifier(snake.toLowerCase(), "table");
}

export function toEnvVarName(str: string): string {
  if (!str) return "SERVICE";
  const clean = str.replace(/[^a-zA-Z0-9]/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2");
  const env = clean.replace(/_+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
  return env || "SERVICE";
}

export function toServiceBaseUrlEnvName(serviceName: string): { envVarName: string; publicEnvVarName: string } {
  const raw = toEnvVarName(serviceName || "SERVICE");
  const prefix = raw.endsWith("_SERVICE") ? raw : `${raw}_SERVICE`;
  return {
    envVarName: `${prefix}_BASE_URL`,
    publicEnvVarName: `NEXT_PUBLIC_${prefix}_BASE_URL`,
  };
}

export function toFolderName(label: string): string {
  if (!label) return "item";
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

export function toSingular(str: string): string {
  if (!str) return str;
  const lower = str.toLowerCase();

  const irregulars: Record<string, string> = {
    people: "person",
    children: "child",
    men: "man",
    women: "woman",
    data: "data",
    media: "media",
    species: "species",
    series: "series",
  };

  if (irregulars[lower]) {
    const s = irregulars[lower];
    return str.charAt(0) === str.charAt(0).toUpperCase()
      ? s.charAt(0).toUpperCase() + s.slice(1)
      : s;
  }

  if (lower.endsWith("ies") && lower.length > 3) {
    return str.slice(0, -3) + (str.charAt(str.length - 3) === "I" ? "Y" : "y");
  }
  if (
    lower.endsWith("sses") ||
    lower.endsWith("shes") ||
    lower.endsWith("ches") ||
    lower.endsWith("xes") ||
    lower.endsWith("zes")
  ) {
    return str.slice(0, -2);
  }
  if (lower.endsWith("ses") && lower.length > 4) {
    if (
      lower.endsWith("status") ||
      lower.endsWith("statuses") ||
      lower.endsWith("process") ||
      lower.endsWith("processes")
    ) {
      return str.slice(0, -2);
    }
    return str.slice(0, -1);
  }
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us") &&
    !lower.endsWith("is") &&
    lower.length > 2
  ) {
    return str.slice(0, -1);
  }

  return str;
}

export function toPlural(str: string): string {
  if (!str) return str;
  const lower = str.toLowerCase();

  if (
    lower.endsWith("ies") ||
    lower.endsWith("ses") ||
    (lower.endsWith("s") &&
      !lower.endsWith("ss") &&
      !lower.endsWith("us") &&
      !lower.endsWith("is"))
  ) {
    return str;
  }

  const irregulars: Record<string, string> = {
    person: "people",
    child: "children",
    man: "men",
    woman: "women",
    data: "data",
    media: "media",
    species: "species",
    series: "series",
  };

  if (irregulars[lower]) {
    const p = irregulars[lower];
    return str.charAt(0) === str.charAt(0).toUpperCase()
      ? p.charAt(0).toUpperCase() + p.slice(1)
      : p;
  }

  if (lower.endsWith("y") && !/[aeiou]y$/i.test(str)) {
    return str.slice(0, -1) + (str.charAt(str.length - 1) === "Y" ? "IES" : "ies");
  }
  if (
    lower.endsWith("s") ||
    lower.endsWith("sh") ||
    lower.endsWith("ch") ||
    lower.endsWith("x") ||
    lower.endsWith("z")
  ) {
    return str + (str.charAt(str.length - 1) === str.charAt(str.length - 1).toUpperCase() ? "ES" : "es");
  }

  return str + (str.charAt(str.length - 1) === str.charAt(str.length - 1).toUpperCase() ? "S" : "s");
}

/**
 * Strips comments from TypeScript/JavaScript code for AST/identifier scanning.
 */
export function stripComments(code: string): string {
  if (!code) return "";
  const noBlock = code.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
  return noBlock.replace(/\/\/.*$/gm, "");
}

/**
 * Parses import declarations in a TypeScript/JavaScript source file and removes any imported symbols
 * that are not actually referenced in the file content (outside of comments and import statements).
 * Completely removes import declarations that have no remaining symbols.
 */
export function cleanUnusedImports(sourceCode: string): string {
  if (!sourceCode || !sourceCode.includes("import")) return sourceCode;

  // Code body without imports or comments to verify true identifier usage
  let codeWithoutImports = sourceCode.replace(/(?:^|\n)[ \t]*import\s+['"][^'"]+['"]\s*;?/g, "\n");
  codeWithoutImports = codeWithoutImports.replace(
    /(?:^|\n)[ \t]*import(?:\s+type)?\s+(?:(?!\bfrom\b)[^;])*?\s+from\s+['"][^'"]+['"]\s*;?/g,
    "\n",
  );
  const codeWithoutComments = stripComments(codeWithoutImports);

  function isUsed(id: string): boolean {
    if (!id) return false;
    const cleanId = id.trim();
    if (!cleanId) return false;
    const re = new RegExp(`\\b${cleanId}\\b`);
    return re.test(codeWithoutComments);
  }

  // Match only import statements that have `from` and do not cross semicolons or preceding imports
  const importStmtRegex =
    /(?:^|\n)([ \t]*import(?:\s+type)?\s+((?:(?!\bfrom\b|\bimport\b)[^;])+?)\s+from\s+['"][^'"]+['"]\s*;?)/g;

  return sourceCode
    .replace(importStmtRegex, (fullMatch, fullImport, clause) => {
      const fromIndex = fullImport.indexOf("from");
      if (fromIndex === -1) return fullMatch;
      const fromPart = fullImport.slice(fromIndex);
      const importPrefix = fullImport.slice(0, fullImport.indexOf(clause));

      let defaultSpecifier: string | null = null;
      let namespaceSpecifier: string | null = null;
      let namedSpecifiersStr: string | null = null;

      let remainingClause = clause.trim();

      // Check for namespace: "* as foo"
      const nsMatch = remainingClause.match(/\*\s+as\s+([a-zA-Z0-9_$]+)/);
      if (nsMatch) {
        namespaceSpecifier = nsMatch[1];
        remainingClause = remainingClause.replace(/\*\s+as\s+[a-zA-Z0-9_$]+/, "").trim();
      }

      // Check for named: "{ ... }"
      const namedMatch = remainingClause.match(/\{([^}]*)\}/);
      if (namedMatch) {
        namedSpecifiersStr = namedMatch[1];
        remainingClause = remainingClause.replace(/\{[^}]*\}/, "").trim();
      }

      // Any remaining identifier before comma or alone is default:
      const defMatch = remainingClause.replace(/,/g, "").trim();
      if (defMatch && /^[a-zA-Z0-9_$]+$/.test(defMatch)) {
        defaultSpecifier = defMatch;
      }

      let keepDefault = false;
      if (defaultSpecifier) {
        keepDefault = isUsed(defaultSpecifier);
      }

      let keepNamespace = false;
      if (namespaceSpecifier) {
        keepNamespace = isUsed(namespaceSpecifier);
      }

      const remainingNamed: string[] = [];
      if (namedSpecifiersStr !== null) {
        const specifiers = namedSpecifiersStr
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);

        for (const spec of specifiers) {
          const asMatch = spec.match(/^[a-zA-Z0-9_$]+\s+as\s+([a-zA-Z0-9_$]+)$/);
          const localName = asMatch && asMatch[1] ? asMatch[1] : spec;
          if (localName && isUsed(localName)) {
            remainingNamed.push(spec);
          }
        }
      }

      const hasNamed = remainingNamed.length > 0;
      if (!keepDefault && !keepNamespace && !hasNamed) {
        return fullMatch.startsWith("\n") ? "" : "";
      }

      const parts: string[] = [];
      if (keepDefault && defaultSpecifier) {
        parts.push(defaultSpecifier);
      }
      if (keepNamespace && namespaceSpecifier) {
        parts.push(`* as ${namespaceSpecifier}`);
      }
      if (hasNamed) {
        if (namedSpecifiersStr && namedSpecifiersStr.includes("\n") && remainingNamed.length > 2) {
          parts.push(`{\n  ${remainingNamed.join(",\n  ")}\n}`);
        } else {
          parts.push(`{ ${remainingNamed.join(", ")} }`);
        }
      }

      const reconstructed = `${importPrefix}${parts.join(", ")} ${fromPart}`;
      return fullMatch.startsWith("\n") ? `\n${reconstructed}` : reconstructed;
    })
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Recursively collects all body property field names that pipeline steps reference
 * (e.g., from `langGraphStateMapping`, `langGraphThreadIdSource`, `inputBindings`, conditions, etc.).
 */
export function collectReferencedBodyFields(steps?: PipelineStep[]): Set<string> {
  const fields = new Set<string>();
  if (!Array.isArray(steps) || steps.length === 0) return fields;

  function visitSource(src?: PipelineStepInputSource) {
    if (src && "field" in src && src.field && src.kind === "req_body") {
      const trimmed = src.field.trim();
      if (trimmed) {
        const rootField = trimmed.split(".")[0];
        if (rootField && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(rootField)) {
          fields.add(rootField);
        }
      }
    }
  }

  function visitConditionExpr(expr?: ConditionExpr) {
    if (!expr) return;
    if ("left" in expr) {
      visitSource(expr.left);
      if (expr.right) {
        visitSource(expr.right);
      }
    } else if ("and" in expr && Array.isArray(expr.and)) {
      for (const sub of expr.and) {
        visitConditionExpr(sub);
      }
    } else if ("or" in expr && Array.isArray(expr.or)) {
      for (const sub of expr.or) {
        visitConditionExpr(sub);
      }
    } else if ("not" in expr && expr.not) {
      visitConditionExpr(expr.not);
    }
  }

  function visitPath(path?: string) {
    if (!path || typeof path !== "string") return;
    const trimmed = path.trim();
    if (trimmed.startsWith("body.")) {
      const field = trimmed.slice(5).trim();
      if (field) {
        const rootField = field.split(".")[0];
        if (rootField && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(rootField)) {
          fields.add(rootField);
        }
      }
    } else if (
      !trimmed.includes(".") &&
      !trimmed.startsWith("inline:") &&
      !trimmed.startsWith("`") &&
      !trimmed.startsWith('"') &&
      !trimmed.startsWith("'") &&
      trimmed !== "body" &&
      trimmed !== "headers" &&
      trimmed !== "params" &&
      trimmed !== "query" &&
      trimmed !== "env" &&
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(trimmed)
    ) {
      fields.add(trimmed);
    }
  }

  for (const step of steps) {
    if (!step || step.enabled === false) continue;

    // 1. LangGraph invoke step
    if (step.type === "langgraph_invoke") {
      if (step.langGraphThreadIdSource) {
        visitPath(step.langGraphThreadIdSource);
      }
      if (step.langGraphStateMapping && typeof step.langGraphStateMapping === "object") {
        for (const p of Object.values(step.langGraphStateMapping)) {
          visitPath(p);
        }
      } else if (!step.inputBindings || step.inputBindings.length === 0) {
        fields.add("message");
      }
      if (step.langGraphStreamingRoom) {
        visitPath(step.langGraphStreamingRoom);
      }
      if (step.langGraphStreamingKafkaKey) {
        visitPath(step.langGraphStreamingKafkaKey);
      }
      if (step.langGraphStreamingRedisKey) {
        visitPath(step.langGraphStreamingRedisKey);
      }
    }

    // 2. Input bindings
    if (Array.isArray(step.inputBindings)) {
      for (const b of step.inputBindings) {
        visitSource(b.source);
      }
    }

    // 3. Condition step
    if (step.conditionExpr) {
      visitConditionExpr(step.conditionExpr);
    }

    // 4. Switch step
    if (step.switchSource) {
      visitSource(step.switchSource);
    }

    // 5. Loop step
    if (step.loopSource) {
      visitSource(step.loopSource);
    }

    // 6. Nested control flow steps
    if (Array.isArray(step.thenSteps)) {
      for (const f of collectReferencedBodyFields(step.thenSteps)) fields.add(f);
    }
    if (Array.isArray(step.elseSteps)) {
      for (const f of collectReferencedBodyFields(step.elseSteps)) fields.add(f);
    }
    if (Array.isArray(step.trySteps)) {
      for (const f of collectReferencedBodyFields(step.trySteps)) fields.add(f);
    }
    if (Array.isArray(step.catchSteps)) {
      for (const f of collectReferencedBodyFields(step.catchSteps)) fields.add(f);
    }
    if (Array.isArray(step.switchCases)) {
      for (const c of step.switchCases) {
        if (Array.isArray(c.steps)) {
          for (const f of collectReferencedBodyFields(c.steps)) fields.add(f);
        }
      }
    }
    if (Array.isArray(step.switchDefault)) {
      for (const f of collectReferencedBodyFields(step.switchDefault)) fields.add(f);
    }
    if (Array.isArray(step.parallelBranches)) {
      for (const br of step.parallelBranches) {
        if (Array.isArray(br.steps)) {
          for (const f of collectReferencedBodyFields(br.steps)) fields.add(f);
        }
      }
    }
    if (Array.isArray(step.loopBody)) {
      for (const f of collectReferencedBodyFields(step.loopBody)) fields.add(f);
    }
  }

  return fields;
}

/**
 * Ensures that all body fields referenced by an endpoint's pipeline steps
 * are present in the endpoint's requestBody schema and TypeScript definition.
 */
export function normalizeEndpointRequestBody<T extends Endpoint>(ep: T): T {
  const referencedFields = collectReferencedBodyFields(ep.pipelineSteps);
  if (referencedFields.size === 0) return ep;

  const currentReqBody = ep.requestBody;
  const currentFields = currentReqBody?.fields ? [...currentReqBody.fields] : [];
  const existingFieldNames = new Set(
    currentFields.map((f) => f.name?.toLowerCase().trim()).filter(Boolean),
  );

  let rawJsonObj: JSONObject | null = null;
  if (currentReqBody?.rawJson) {
    const parsed = parseSchemaJson(currentReqBody.rawJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      rawJsonObj = { ...parsed };
      for (const k of Object.keys(rawJsonObj)) {
        existingFieldNames.add(k.toLowerCase().trim());
      }
    }
  }

  let hasAdded = false;
  for (const field of referencedFields) {
    if (!field || existingFieldNames.has(field.toLowerCase().trim())) continue;

    hasAdded = true;
    existingFieldNames.add(field.toLowerCase().trim());

    const lower = field.toLowerCase();
    const type =
      lower.includes("messages") || lower.includes("items") || lower.includes("list")
        ? "array"
        : "string";

    currentFields.push({
      id: `field_auto_${field}`,
      name: field,
      type,
      required: false,
      description: `Auto-provisioned parameter for pipeline step: ${field}`,
    });

    if (rawJsonObj) {
      rawJsonObj[field] = type === "array" ? [] : "";
    }
  }

  if (!hasAdded) return ep;

  const nextReqBody = {
    ...(currentReqBody || { id: `req_${ep.id || "ep"}` }),
    fields: currentFields,
    ...(rawJsonObj ? { rawJson: JSON.stringify(rawJsonObj, null, 2) } : {}),
  };

  return {
    ...ep,
    requestBody: nextReqBody,
  };
}


