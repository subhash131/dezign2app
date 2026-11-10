/**
 * Common string manipulation and Go naming convention utilities
 */

/**
 * Converts a string to PascalCase (e.g. "user_id" -> "UserId", "create-user" -> "CreateUser")
 */
export function toPascalCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (chr) => chr.toUpperCase());
}

/**
 * Converts a string to camelCase (e.g. "user_id" -> "userId", "CreateUser" -> "createUser")
 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Converts a string to snake_case (e.g. "CreateUser" -> "create_user", "userId" -> "user_id")
 */
export function toSnakeCase(str: string): string {
  if (!str) return "";
  return str
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

/**
 * Acronyms that should remain uppercase in idiomatic Go (e.g. ID, URL, HTTP, API, JSON, IP)
 */
const GO_INITIALISMS = new Set([
  "ID",
  "URL",
  "HTTP",
  "HTTPS",
  "API",
  "JSON",
  "IP",
  "UUID",
  "URI",
  "SQL",
  "DB",
  "TTL",
  "RPC",
  "GRPC",
]);

/**
 * Formats a field name into idiomatic Go struct field name (e.g. "user_id" -> "UserID", "api_url" -> "APIURL")
 */
export function toGoFieldName(fieldName: string): string {
  if (!fieldName) return "Field";
  const cleaned = fieldName.replace(/[^a-zA-Z0-9_]/g, "");
  const parts = cleaned.split("_").filter(Boolean);

  if (parts.length > 0) {
    return parts
      .map((part) => {
        const upper = part.toUpperCase();
        if (GO_INITIALISMS.has(upper)) {
          return upper;
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("");
  }

  const pascal = toPascalCase(fieldName);
  for (const initialism of GO_INITIALISMS) {
    const regex = new RegExp(`(^|[a-z])${initialism}([A-Z]|$)`, "g");
    if (regex.test(pascal)) {
      return pascal.replace(regex, `$1${initialism}$2`);
    }
  }
  return pascal;
}

/**
 * Converts route paths to Gin route syntax:
 * Ensures leading slash, converts {param} to :param
 */
export function convertGinPathParams(path: string): string {
  if (!path) return "/";
  let formatted = path.startsWith("/") ? path : `/${path}`;
  // Replace {param} with :param
  formatted = formatted.replace(/\{([a-zA-Z0-9_]+)\}/g, ":$1");
  return formatted.trim();
}

/**
 * Generates an idiomatic Go route file name (e.g. "get_users.go", "post_users_by_id.go")
 */
export function toGoRouteFileName(method: string, rawPath: string, index: number): string {
  const m = (method || "get").toLowerCase();
  const cleanedPath = rawPath
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[:{}*?]/g, "by_")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!cleanedPath) {
    return `${m}_endpoint_${index + 1}.go`;
  }
  return `${m}_${cleanedPath}.go`;
}

/**
 * Generates an idiomatic Go handler function name (e.g. "GetUsersHandler", "PostUsersByIdHandler")
 */
export function toGoHandlerName(method: string, rawPath: string, index: number): string {
  const m = toPascalCase(method || "get");
  const cleanedPath = rawPath
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/[:{}]/g, "By_")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  if (!cleanedPath) {
    return `${m}Endpoint${index + 1}Handler`;
  }
  return `${m}${toPascalCase(cleanedPath)}Handler`;
}

/**
 * Maps schema type to Go type
 */
export function toGoPrimitiveType(typeStr: string | undefined): string {
  if (!typeStr) return "string";
  const raw = typeStr.trim();
  const isArray = raw.endsWith("[]");
  const base = (isArray ? raw.slice(0, -2) : raw).toLowerCase();

  let goType = "string";
  if (base === "string" || base === "text" || base === "uuid" || base === "email") {
    goType = "string";
  } else if (base === "int" || base === "integer") {
    goType = "int64";
  } else if (base === "number" || base === "float" || base === "double" || base === "decimal" || base === "real") {
    goType = "float64";
  } else if (base === "boolean" || base === "bool") {
    goType = "bool";
  } else if (base === "date" || base === "datetime" || base === "timestamp") {
    goType = "time.Time";
  } else if (base === "object" || base === "json" || base === "dict") {
    goType = "map[string]interface{}";
  } else if (base === "any" || base === "unknown") {
    goType = "interface{}";
  }

  return isArray ? `[]${goType}` : goType;
}
