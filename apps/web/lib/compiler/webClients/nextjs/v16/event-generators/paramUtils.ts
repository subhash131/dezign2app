/**
 * Extracts only valid path parameter names from a URL pathname (e.g. /users/:id or /orgs/{orgId})
 * Ignores host:port (e.g. :8080 or :3000) and only matches parameter names starting with a letter or underscore.
 */
export function extractPathPlaceholders(pathStr: string): string[] {
  const matches = new Set<string>();
  let pathname = pathStr;
  try {
    if (pathStr.includes("://")) {
      const parsed = new URL(pathStr);
      pathname = parsed.pathname;
    }
  } catch {
    pathname = pathStr.replace(/^[a-zA-Z]+:\/\/[^/]+/, "");
  }

  // Regex for :paramName (must start with letter or underscore, not numbers)
  const colonRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = colonRegex.exec(pathname)) !== null) {
    if (m[1]) matches.add(m[1]);
  }
  const braceRegex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  while ((m = braceRegex.exec(pathname)) !== null) {
    if (m[1]) matches.add(m[1]);
  }
  return Array.from(matches);
}

/**
 * Infers TypeScript types from a JSON string or object
 */
export function inferTypesFromJson(jsonStr: string): [string, string][] {
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return Object.entries(obj)
        .filter(([key]) => Boolean(key && key.trim()))
        .map(([key, val]) => {
          let tsType = "string";
          if (typeof val === "number") tsType = "number";
          else if (typeof val === "boolean") tsType = "boolean";
          else if (Array.isArray(val)) tsType = "unknown[]";
          else if (val !== null && typeof val === "object")
            tsType = "Record<string, unknown>";
          return [key.trim(), tsType];
        });
    }
  } catch {}
  return [];
}
