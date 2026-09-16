import { BackendNode } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { toPascalCase, toSingular } from "../../utils";
import {
  SchemaItem,
  schemaToTsInterface,
} from "../schemaToTypeScript";
import {
  classifyEndpointShape,
  buildResponseInterfaceBody,
} from "../routeGenerator/endpointTypeClassifier";
import { ResponseFieldItem, ResponseInterfaceResult } from "./types";

function inferRedisStepType(
  step: {
    type?: string;
    name?: string;
    functionRef?: { name?: string; importPath?: string };
    operation?: string;
    redisNodeId?: string;
    tableNodeId?: string;
    databaseId?: string;
    cacheMiss?: {
      enabled?: boolean;
      action?: string;
      functionRef?: { name?: string; importPath?: string };
    };
  },
  nodes: BackendNode[],
  entityImports: Set<string>,
  field?: string,
): string {
  const redisNodeId = step.redisNodeId || step.tableNodeId || step.databaseId;
  const redisNode = redisNodeId
    ? nodes.find((n) => n.id === redisNodeId)
    : nodes.find(
        (n) =>
          n.type === "redis_schema" ||
          n.type === "redis-cache" ||
          n.type === "redis_instance" ||
          n.data?.redisDataStructure ||
          n.data?.dbType === "redis",
      );
  const rawName = redisNode?.data?.label || redisNode?.data?.tableName || "Item";
  const pascalName = toPascalCase(rawName);
  const itemType = `${pascalName}Item`;
  const fnName = (
    step.functionRef?.name ||
    step.operation ||
    step.name ||
    ""
  ).toLowerCase();

  // If a specific nested field was selected (e.g., sender, message)
  if (field && field.trim()) {
    const trimmedField = field.trim();
    if (trimmedField === "message") return "string | undefined";
    if (trimmedField === "success") return "boolean | undefined";

    // 1. Check columns on redisNode
    const col = redisNode?.data?.columns?.find(
      (c: { name?: string }) => c.name?.toLowerCase() === trimmedField.toLowerCase(),
    );
    if (col) {
      const colType = (col.type || "string").toLowerCase();
      let tsType = "string";
      if (["integer", "int", "number", "float", "double", "real"].includes(colType)) {
        tsType = "number";
      } else if (["boolean", "bool"].includes(colType)) {
        tsType = "boolean";
      }
      return `${tsType} | null | undefined`;
    }

    // 2. Check fallback DB entity columns
    if (step.cacheMiss?.enabled && step.cacheMiss.action === "fallback_db") {
      const dbFnName = step.cacheMiss.functionRef?.name || "";
      const dbEntityNode =
        nodes.find(
          (n) =>
            (n.type === "entity" || n.type === "database") &&
            (dbFnName.toLowerCase().includes((n.data?.label || "").toLowerCase()) ||
              (n.data?.label && dbFnName.toLowerCase().includes(toSingular(n.data.label).toLowerCase())) ||
              (n.data?.tableName && dbFnName.toLowerCase().includes(n.data.tableName.toLowerCase())) ||
              (n.data?.tableName && dbFnName.toLowerCase().includes(toSingular(n.data.tableName).toLowerCase()))),
        ) || nodes.find((n) => n.type === "entity");

      const dbCol = dbEntityNode?.data?.columns?.find(
        (c: { name?: string }) => c.name?.toLowerCase() === trimmedField.toLowerCase(),
      );
      if (dbCol) {
        const colType = (dbCol.type || "string").toLowerCase();
        let tsType = "string";
        if (["integer", "int", "number", "float", "double", "real"].includes(colType)) {
          tsType = "number";
        } else if (["boolean", "bool"].includes(colType)) {
          tsType = "boolean";
        }
        return `${tsType} | null | undefined`;
      }
    }

    return "string | number | boolean | null | undefined";
  }

  // Entire step output is selected
  if (
    fnName.includes("recent") ||
    fnName.includes("all") ||
    fnName.includes("list") ||
    fnName.includes("range")
  ) {
    if (itemType) entityImports.add(itemType);
    return `${itemType}[]`;
  }
  if (
    fnName.includes("length") ||
    fnName.includes("len") ||
    fnName.includes("append") ||
    fnName.includes("push") ||
    fnName.includes("count")
  ) {
    return "number";
  }
  if (
    fnName.includes("delete") ||
    fnName.includes("del") ||
    fnName.includes("exist")
  ) {
    return "boolean";
  }

  // Single / get / pop operations:
  const types: string[] = [];
  if (pascalName) {
    entityImports.add(pascalName);
    types.push(pascalName);
  }
  if (itemType && itemType !== pascalName) {
    entityImports.add(itemType);
    types.push(itemType);
  }

  // If cache-aside DB fallback is configured, include the DB row type
  if (
    step.cacheMiss?.enabled &&
    step.cacheMiss.action === "fallback_db" &&
    step.cacheMiss.functionRef?.name
  ) {
    const dbFnName = step.cacheMiss.functionRef.name;
    const dbEntityNode = nodes.find(
      (n) =>
        (n.type === "entity" || n.type === "database") &&
        (dbFnName.toLowerCase().includes((n.data?.label || "").toLowerCase()) ||
          (n.data?.label && dbFnName.toLowerCase().includes(toSingular(n.data.label).toLowerCase())) ||
          (n.data?.tableName && dbFnName.toLowerCase().includes(n.data.tableName.toLowerCase())) ||
          (n.data?.tableName && dbFnName.toLowerCase().includes(toSingular(n.data.tableName).toLowerCase()))),
    );
    const rawDbName =
      dbEntityNode?.data?.label ||
      dbEntityNode?.data?.tableName ||
      dbEntityNode?.data?.tableRef;
    if (rawDbName) {
      const pascalDb = toPascalCase(rawDbName);
      const dbRowType = `${pascalDb}Row`;
      entityImports.add(dbRowType);
      types.push(dbRowType);

      const singularDb = toPascalCase(toSingular(rawDbName));
      if (singularDb && singularDb !== pascalDb) {
        const singularRowType = `${singularDb}Row`;
        entityImports.add(singularRowType);
        types.push(singularRowType);
      }
    } else {
      const cleaned = dbFnName
        .replace(/^(find|get|select)/i, "")
        .replace(/(ById|By.*)$/i, "");
      if (cleaned) {
        const pascalDb = toPascalCase(cleaned);
        const dbRowType = `${pascalDb}Row`;
        entityImports.add(dbRowType);
        types.push(dbRowType);
      }
    }
  }

  const uniqueTypes = [...new Set(types)];
  return uniqueTypes.length > 0 ? `${uniqueTypes.join(" | ")} | null` : `${itemType} | null`;
}

export function inferBindingType(
  binding: {
    argName?: string;
    source?: { kind?: string; stepId?: string; field?: string; value?: unknown };
  },
  ep: Endpoint | undefined,
  nodes: BackendNode[],
  entityImports: Set<string>,
): string {
  const source = binding?.source;
  if (!source) return "Record<string, string | number | boolean | null>";

  if (source.kind === "step_output" && source.stepId && ep?.pipelineSteps) {
    const step = ep.pipelineSteps.find((s) => s.id === source.stepId);
    if (step) {
      if (step.type === "db_operation") {
        const dbNodeId =
          step.tableNodeId ||
          step.databaseId ||
          (step as { databaseNodeId?: string; targetTableId?: string }).databaseNodeId ||
          (step as { databaseNodeId?: string; targetTableId?: string }).targetTableId ||
          ep.databaseNodeId ||
          (ep.databaseNodeIds && ep.databaseNodeIds[0]);
        const dbNode = dbNodeId
          ? nodes.find((n) => n.id === dbNodeId)
          : nodes.find((n) => n.type === "database" || n.type === "entity");
        const rawTableName = dbNode?.data?.label || dbNode?.data?.tableRef || "Entity";
        const pascalEntity = toPascalCase(rawTableName);
        if (pascalEntity) {
          entityImports.add(pascalEntity);
          const op = ((step as { operation?: string }).operation || "").toLowerCase();
          if (source.field) {
            if (source.field === "message") {
              return "string | undefined";
            }
            if (source.field === "success") {
              return "boolean | undefined";
            }
            const col = dbNode?.data?.columns?.find(
              (c: { name?: string; type?: string; isNotNull?: boolean; isPrimaryKey?: boolean }) =>
                c.name?.toLowerCase() === source.field?.toLowerCase(),
            );
            if (col) {
              const colType = (col.type || "string").toLowerCase();
              let tsType = "string";
              if (["integer", "int", "number", "float", "double", "real"].includes(colType)) {
                tsType = "number";
              } else if (["boolean", "bool"].includes(colType)) {
                tsType = "boolean";
              }
              const isOptional = !col.isNotNull && !col.isPrimaryKey;
              return isOptional ? `${tsType} | null | undefined` : tsType;
            }
            return "string | undefined";
          }
          if (op === "find_all" || op === "query") {
            return `${pascalEntity}[]`;
          }
          if (op === "delete") {
            return "{ success: boolean }";
          }
          return pascalEntity;
        }
      }
      if (step.type === "external_call") {
        if (source.field) {
          return "string | number | boolean | null | undefined";
        }
        return "Record<string, string | number | boolean | null>";
      }
      if (step.type === "redis_operation") {
        return inferRedisStepType(step, nodes, entityImports, source.field);
      }
      if (step.type === "transform") {
        const transformerId = (step as { transformerNodeId?: string }).transformerNodeId;
        const fnName = step.functionRef?.name;
        const transNode = transformerId
          ? nodes.find((n) => n.id === transformerId)
          : nodes.find((n) => n.type === "transformer" || n.data?.label === fnName);
        const returnSchema = transNode?.data?.returnSchema;
        if (Array.isArray(returnSchema) && returnSchema.length > 0) {
          if (source.field) {
            const f = returnSchema.find((f: { name?: string }) => f.name === source.field);
            if (f?.type) return f.type;
          }
          const props = returnSchema.map((f: { name: string; type: string; required?: boolean }) =>
            `  ${f.name}${f.required ? "" : "?"}: ${f.type || "string"};`
          );
          return `{\n${props.join("\n")}\n}`;
        }
      }
    }
  }

  if (source.kind === "req_body") {
    if (source.field && ep?.requestBody?.fields) {
      const f = ep.requestBody.fields.find(
        (field) => field.name === source.field || field.key === source.field,
      );
      if (f?.type) {
        switch (f.type) {
          case "number": return "number";
          case "boolean": return "boolean";
          case "array": return "string[]";
          case "object": return "Record<string, string | number | boolean | null>";
          default: return "string";
        }
      }
    }
    return "Record<string, string | number | boolean | null>";
  }

  if (source.kind === "req_param") {
    if (source.field) {
      const p = [...(ep?.pathParams || []), ...(ep?.queryParams || [])].find(
        (param) => param.name === source.field,
      );
      if (p?.type) {
        switch (p.type) {
          case "number": return "number";
          case "boolean": return "boolean";
          default: return "string";
        }
      }
    }
    return "string";
  }

  if (source.kind === "literal" || source.kind === "inline") {
    if (typeof source.value === "number") return "number";
    if (typeof source.value === "boolean") return "boolean";
    if (typeof source.value === "string") return "string";
    return "string | number | boolean | null";
  }

  if (source.kind === "context") {
    if (source.field === "timestamp") return "string";
    if (source.field === "user") return "Record<string, string | number | boolean | null>";
    return "string";
  }

  return "Record<string, string | number | boolean | null>";
}

export function generateResponseInterface(
  interfaceName: string,
  responseFields: ResponseFieldItem[] = [],
  legacyResponseBody?: SchemaItem,
  nodes: BackendNode[] = [],
  ep?: Endpoint,
  serviceNode?: BackendNode,
): ResponseInterfaceResult {
  const entityImports = new Set<string>();

  // 1. Explicit Pipeline Steps with return_response (from PipelineStepEditor)
  // When an endpoint has a return_response step, that step defines the actual code emitted by the route handler.
  if (ep?.pipelineSteps && ep.pipelineSteps.length > 0) {
    const returnStep = ep.pipelineSteps.find(
      (s) => s.type === "return_response" && s.enabled !== false,
    );

    if (returnStep) {
      const bindings = returnStep.inputBindings || [];
      const firstBinding = bindings[0];
      if (
        bindings.length === 1 &&
        firstBinding &&
        (firstBinding.argName === "data" ||
          firstBinding.argName === "_spread" ||
          !firstBinding.argName)
      ) {
        if (
          firstBinding.source.kind === "req_body" &&
          !firstBinding.source.field
        ) {
          const bodyInterfaceName = interfaceName.replace(/Response$/, "Body");
          return {
            code: `export type ${interfaceName} = ${bodyInterfaceName};\n`,
            entityImports,
          };
        }
        const bindingType = inferBindingType(firstBinding, ep, nodes, entityImports);
        return {
          code: `export type ${interfaceName} = ${bindingType};\n`,
          entityImports,
        };
      } else if (bindings.length > 0) {
        const props: string[] = [];
        for (const b of bindings) {
          const propName = b.argName?.trim() || "data";
          const tsType = inferBindingType(b, ep, nodes, entityImports);
          props.push(`  ${propName}: ${tsType};`);
        }
        return {
          code: `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`,
          entityImports,
        };
      } else {
        return {
          code: `export interface ${interfaceName} {\n  message: string;\n}\n`,
          entityImports,
        };
      }
    }
  }

  // 2. Explicit response fields (from EndpointConfig.tsx)
  if (responseFields && responseFields.length > 0) {
    const props: string[] = [];

    for (const field of responseFields) {
      const isRequired = field.required !== false;
      const propName = field.name || "field";
      let tsType = "string";

      if (field.type && field.type.startsWith("db:")) {
        const parts = field.type.split(":");
        const tableNodeId = parts[1];
        const category = parts[2] || "single";
        const tableNode = nodes.find((n) => n.id === tableNodeId);
        const rawTableName =
          tableNode?.data?.label || tableNode?.data?.tableRef || "Entity";
        const pascalEntity = toPascalCase(rawTableName);

        if (pascalEntity) {
          entityImports.add(pascalEntity);
        }

        const cols: string[] = field.selectedColumns || [];
        const hasPick = category.startsWith("partial") && cols.length > 0;
        const pickUnion = hasPick ? cols.map((c) => `"${c}"`).join(" | ") : "";

        if (category === "single") {
          tsType = pascalEntity;
        } else if (category === "array") {
          tsType = `${pascalEntity}[]`;
        } else if (category === "partial_single") {
          tsType = hasPick ? `Pick<${pascalEntity}, ${pickUnion}>` : pascalEntity;
        } else if (category === "partial_array") {
          tsType = hasPick ? `Pick<${pascalEntity}, ${pickUnion}>[]` : `${pascalEntity}[]`;
        }
      } else {
        switch (field.type) {
          case "string":
          case "UUID":
          case "timestamp":
            tsType = "string";
            break;
          case "number":
            tsType = "number";
            break;
          case "boolean":
            tsType = "boolean";
            break;
          case "object":
            tsType = "Record<string, string | number | boolean | null>";
            break;
          case "array":
            tsType = "string[]";
            break;
          default:
            tsType = "string";
        }
      }

      props.push(`  ${propName}${isRequired ? "" : "?"}: ${tsType};`);
    }

    const code = `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`;
    return { code, entityImports };
  }

  // 3. Explicit responseBody (from EndpointConfig.tsx / NestedResponseSchemaEditor)
  const legacy = schemaToTsInterface(interfaceName, legacyResponseBody);
  if (legacy.hasContent) {
    // Augment with `data?` field if schema doesn't already have it
    if (
      legacy.code.includes(`export interface ${interfaceName}`) &&
      !legacy.code.includes("data:") &&
      !legacy.code.includes("data?:")
    ) {
      const lastBraceIndex = legacy.code.lastIndexOf("}");
      if (lastBraceIndex !== -1) {
        const entityShape = ep ? classifyEndpointShape(ep, nodes) : { kind: "unknown" as const };
        if (entityShape.kind === "entity") {
          entityImports.add(entityShape.entity);
          const dataType = entityShape.cardinality === "one" ? entityShape.entity : `${entityShape.entity}[]`;
          const augmentedCode =
            legacy.code.slice(0, lastBraceIndex) +
            `  data?: ${dataType};\n` +
            legacy.code.slice(lastBraceIndex);
          return { code: augmentedCode, entityImports };
        }
      }
    }
    return { code: legacy.code, entityImports };
  }

  // 4. Pipeline Steps without explicit return_response step
  if (ep?.pipelineSteps && ep.pipelineSteps.length > 0) {
    const lastStep = [...ep.pipelineSteps].reverse().find((s) => s.enabled !== false);
    let lastDataType = "Record<string, string | number | boolean | null>";
    if (lastStep?.type === "db_operation") {
      const dbNodeId =
        lastStep.tableNodeId ||
        lastStep.databaseId ||
        (lastStep as { databaseNodeId?: string; targetTableId?: string }).databaseNodeId ||
        (lastStep as { databaseNodeId?: string; targetTableId?: string }).targetTableId ||
        ep.databaseNodeId ||
        (ep.databaseNodeIds && ep.databaseNodeIds[0]);
      const dbNode = dbNodeId
        ? nodes.find((n) => n.id === dbNodeId)
        : nodes.find((n) => n.type === "database" || n.type === "entity");
      const rawTableName = dbNode?.data?.label || dbNode?.data?.tableRef || "Entity";
      const pascalEntity = toPascalCase(rawTableName);
      if (pascalEntity) {
        entityImports.add(pascalEntity);
        const op = ((lastStep as { operation?: string }).operation || "").toLowerCase();
        lastDataType = op === "find_all" || op === "query" ? `${pascalEntity}[]` : pascalEntity;
      }
    } else if (lastStep?.type === "redis_operation") {
      lastDataType = inferRedisStepType(lastStep, nodes, entityImports);
    } else if (lastStep?.type === "transform") {
      const transformerId = (lastStep as { transformerNodeId?: string }).transformerNodeId;
      const fnName = lastStep.functionRef?.name;
      const transNode = transformerId
        ? nodes.find((n) => n.id === transformerId)
        : nodes.find((n) => n.type === "transformer" || n.data?.label === fnName);
      const returnSchema = transNode?.data?.returnSchema;
      if (Array.isArray(returnSchema) && returnSchema.length > 0) {
        const props = returnSchema.map((f: { name: string; type: string; required?: boolean }) =>
          `  ${f.name}${f.required ? "" : "?"}: ${f.type || "string"};`
        );
        lastDataType = `{\n${props.join("\n")}\n}`;
      }
    }
    return {
      code: `export interface ${interfaceName} {\n  data: ${lastDataType};\n}\n`,
      entityImports,
    };
  }

  // 5. Output JSON string (from EndpointList.tsx / Endpoint)
  if (ep?.output && ep.output.trim()) {
    try {
      const parsed = JSON.parse(ep.output.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const props: string[] = [];
        for (const [key, val] of Object.entries(parsed)) {
          const valType =
            typeof val === "number"
              ? "number"
              : typeof val === "boolean"
              ? "boolean"
              : typeof val === "string"
              ? "string"
              : Array.isArray(val)
              ? val.length > 0 && typeof val[0] === "number"
                ? "number[]"
                : val.length > 0 && typeof val[0] === "boolean"
                ? "boolean[]"
                : "string[]"
              : "Record<string, string | number | boolean | null>";
          props.push(`  ${key}: ${valType};`);
        }
        return {
          code: `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`,
          entityImports,
        };
      }
    } catch {
      // Proceed to fallback inference
    }
  }

  // 6. Database linkage
  const shape = ep ? classifyEndpointShape(ep, nodes) : { kind: "unknown" as const };
  if (shape.kind === "entity") {
    entityImports.add(shape.entity);
    const dataType =
      shape.cardinality === "one"
        ? shape.entity
        : `${shape.entity}[]`;
    const code =
      `export interface ${interfaceName} {\n` +
      `  message: string;\n` +
      `  data: ${dataType};\n` +
      (shape.cardinality === "many" ? `  total?: number;\n` : "") +
      `}\n`;
    return { code, entityImports };
  }

  // 7. Endpoint on ServiceNode (Health check or Default endpoint without custom schema)
  const isHealth = shape.kind === "health";
  if (isHealth) {
    const code =
      `export interface ${interfaceName} {\n` +
      `  message: string;\n` +
      `}\n`;
    return { code, entityImports };
  }

  // 8. General fallback
  const code = buildResponseInterfaceBody(interfaceName, shape, entityImports);
  return { code, entityImports };
}
