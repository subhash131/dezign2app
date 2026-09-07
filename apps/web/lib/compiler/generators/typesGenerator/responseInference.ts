import { BackendNode } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { toPascalCase } from "../../utils";
import {
  SchemaItem,
  schemaToTsInterface,
} from "../schemaToTypeScript";
import {
  classifyEndpointShape,
  buildResponseInterfaceBody,
} from "../routeGenerator/endpointTypeClassifier";
import { ResponseFieldItem, ResponseInterfaceResult } from "./types";

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
        return "string | null";
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
          case "array": return "unknown[]";
          case "object": return "Record<string, unknown>";
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
    return "unknown";
  }

  if (source.kind === "context") {
    if (source.field === "timestamp") return "string";
    if (source.field === "user") return "Record<string, unknown>";
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
        let dataType = "Record<string, string | number | boolean | null>";
        if (entityShape.kind === "entity") {
          entityImports.add(entityShape.entity);
          dataType = entityShape.cardinality === "one" ? entityShape.entity : `${entityShape.entity}[]`;
        } else if (entityShape.kind === "health") {
          dataType = "{ status: string; service: string; timestamp: string }";
        }
        const augmentedCode =
          legacy.code.slice(0, lastBraceIndex) +
          `  data?: ${dataType};\n` +
          legacy.code.slice(lastBraceIndex);
        return { code: augmentedCode, entityImports };
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
              ? "unknown[]"
              : "Record<string, unknown>";
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
