import { Endpoint } from "@workspace/canvas/types";
import { BackendNode } from "@/types/canvas";
import { toPascalCase } from "../../utils";

/**
 * Discriminated union representing the inferred response shape of an endpoint.
 * Used by typesGenerator, endpointHandlerGenerator, and pipelineRenderer to
 * produce fully typed interfaces instead of `any`-based fallbacks.
 */
export type EndpointTypeShape =
  | { kind: "health" }
  | { kind: "entity"; entity: string; cardinality: "one" | "many" }
  | { kind: "schema" }
  | { kind: "void" }
  | { kind: "unknown" };

/**
 * Classifies an endpoint into a TypeShape using a deterministic decision tree.
 *
 * Priority order:
 *  1. health — canonical health-check endpoints
 *  2. schema — explicit responseFields or responseBody schema on canvas
 *  3. entity — linked to a database node (entity type resolved from graph)
 *  4. void   — DELETE or 204 responses
 *  5. unknown — no information available; falls back to Record<string, …>
 *
 * None of these shapes produce `any` in generated code.
 */
export function classifyEndpointShape(
  ep: Endpoint & { nodeId?: string },
  allNodes: BackendNode[] = [],
): EndpointTypeShape {
  const method = (ep.type || "GET").toLowerCase();
  const name = (ep.name || "").trim();
  const summary = (ep.summary || "").trim().toLowerCase();

  // ── 1. DB linkage ────────────────────────────────────────────────────────
  // Check entity linkage first — an endpoint linked to a database table should drive entity types
  const entityName = resolveEntityName(ep, allNodes);
  if (entityName) {
    const cardinality = inferCardinality(ep, name);
    return { kind: "entity", entity: entityName, cardinality };
  }

  // ── 2. Explicit Schema or Pipeline (responseFields / responseBody / pipelineSteps / output) ──
  const hasResponseFields =
    Array.isArray(ep.responseFields) && ep.responseFields.length > 0;
  const hasLegacySchema =
    Boolean(ep.responseBody?.rawJson?.trim()) ||
    (Array.isArray(ep.responseBody?.fields) &&
      (ep.responseBody?.fields?.length ?? 0) > 0);
  const hasPipelineSteps =
    Array.isArray(ep.pipelineSteps) && ep.pipelineSteps.length > 0;
  const hasOutput = Boolean(ep.output?.trim());

  if (hasResponseFields || hasLegacySchema || hasPipelineSteps || hasOutput) {
    return { kind: "schema" };
  }

  // ── 3. Health Check (only if no explicit schema, pipeline, or entity linkage) ─
  const isHealthName =
    name === "/" ||
    name === "/health" ||
    name.endsWith("/health") ||
    name === "health";
  const isHealthSummary =
    summary === "health check" ||
    summary.includes("health") ||
    summary === "test the health of the server";

  if (method === "get" && (isHealthName || isHealthSummary)) {
    return { kind: "health" };
  }

  // ── 4. Void ───────────────────────────────────────────────────────────────
  if (method === "delete") {
    return { kind: "void" };
  }

  // ── 5. Unknown ────────────────────────────────────────────────────────────
  return { kind: "unknown" };
}

/**
 * Resolves the PascalCase entity name from the endpoint's db linkage, or null.
 */
function resolveEntityName(
  ep: Endpoint & { nodeId?: string },
  allNodes: BackendNode[],
): string | null {
  const targetIds = [
    ...(ep.databaseNodeIds || []),
    ...(ep.databaseNodeId && ep.databaseNodeId !== "none"
      ? [ep.databaseNodeId]
      : []),
    ...Object.keys(ep.crudOperations || {}),
  ];

  if (targetIds.length === 0) return null;

  for (const nodeId of targetIds) {
    const tableNode = allNodes.find((n) => n.id === nodeId);
    if (!tableNode) continue;

    // db_ref: resolve via tableRef pointer
    const entityNode =
      tableNode.type === "db_ref" && tableNode.data?.tableRef
        ? allNodes.find((n) => n.id === tableNode.data?.tableRef)
        : tableNode;

    if (!entityNode) continue;

    // For database-type nodes, check sub-table matching
    if (entityNode.type === "database") {
      const tables = (
        entityNode.data as unknown as {
          tables?: Array<{ id?: string; name?: string }>;
        }
      )?.tables;
      if (tables && tables.length > 0) {
        const matchedTable =
          tables.find(
            (t) =>
              ep.crudOperations &&
              (ep.crudOperations[t.id || ""] || ep.crudOperations[t.name || ""]),
          ) || tables[0];
        if (matchedTable?.name) {
          return toPascalCase(matchedTable.name);
        }
      }
    }

    const rawName =
      entityNode.data?.label || entityNode.data?.tableRef || null;
    if (rawName) {
      return toPascalCase(rawName);
    }
  }

  return null;
}

/**
 * Infers whether an endpoint returns a single entity or a collection.
 * - Path ends with /:id or /{id} → "one"
 * - POST → "one" (creates a single record)
 * - Otherwise → "many"
 */
function inferCardinality(
  ep: Endpoint,
  path: string,
): "one" | "many" {
  const method = (ep.type || "GET").toLowerCase();
  const hasIdParam =
    path.includes(":id") ||
    path.includes("{id}") ||
    /:\w+$/.test(path);

  if (method === "post" || method === "put" || method === "patch") {
    return "one";
  }
  if (hasIdParam) {
    return "one";
  }
  return "many";
}

/**
 * Returns the TypeScript type string for the `data` field of a response
 * given a resolved TypeShape. Never returns `any`.
 */
export function responseDataType(shape: EndpointTypeShape): string {
  switch (shape.kind) {
    case "health":
      // Inline literal — no import needed
      return "{ status: string; service: string; timestamp: string }";
    case "entity":
      if (shape.cardinality === "one") {
        return shape.entity;
      }
      return `${shape.entity}[]`;
    case "schema":
      // Caller references the generated ${pascalName}Response type
      return "__SCHEMA__";
    case "void":
      return "undefined";
    case "unknown":
      return "Record<string, string | number | boolean | null>";
  }
}

/**
 * Returns the TypeScript type string for the whole response interface body.
 * Used by typesGenerator.ts when generating the fallback (no responseFields).
 */
export function buildResponseInterfaceBody(
  interfaceName: string,
  shape: EndpointTypeShape,
  entityImports: Set<string>,
): string {
  switch (shape.kind) {
    case "health":
    case "void":
      return (
        `export interface ${interfaceName} {\n` +
        `  message: string;\n` +
        `}\n`
      );
    case "entity": {
      entityImports.add(shape.entity);
      const dataType =
        shape.cardinality === "one"
          ? shape.entity
          : `${shape.entity}[]`;
      return (
        `export interface ${interfaceName} {\n` +
        `  message: string;\n` +
        `  data: ${dataType};\n` +
        (shape.cardinality === "many" ? `  total?: number;\n` : "") +
        `}\n`
      );
    }
    case "schema":
    case "unknown":
      return (
        `export interface ${interfaceName} {\n` +
        `  message?: string;\n` +
        `  data?: Record<string, string | number | boolean | null>;\n` +
        `}\n`
      );
  }
}
