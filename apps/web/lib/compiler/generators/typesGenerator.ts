import { BackendNode } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";
import { CompiledFile } from "@workspace/canvas/types";
import {
  toVarName,
  toPascalCase,
  toSingular,
  toPlural,
  deriveRouteFileName,
} from "../utils";
import {
  ParameterItem,
  SchemaItem,
  parametersToTsInterface,
  parametersToZodSchema,
  schemaToTsInterface,
  schemaToZodSchema,
} from "./schemaToTypeScript";
import {
  classifyEndpointShape,
  buildResponseInterfaceBody,
} from "./routeGenerator/endpointTypeClassifier";

export interface ResponseFieldItem extends ParameterItem {
  selectedColumns?: string[];
}

function generateEntitiesModule(
  nodes: BackendNode[],
  referencedEntityNames?: Set<string>,
): string {
  let code = `/**\n * Shared Data Models & Schemas\n */\n\n`;
  const seenNames = new Set<string>();

  function renderEntityInterface(pascal: string, rawName: string, cols: Array<{ name?: string; type?: string; isPrimaryKey?: boolean; isPrimary?: boolean; primaryKey?: boolean; isNotNull?: boolean; required?: boolean }>) {
    const singularPascal = toPascalCase(toSingular(rawName));
    const pluralPascal = toPascalCase(toPlural(rawName));

    if (!cols || cols.length === 0) {
      code += `export interface ${pascal} {\n  id: string;\n  [key: string]: unknown;\n}\n`;
    } else {
      const fieldLines = cols.map((col) => {
        const fieldName = col.name || "field";
        const isReq = col.isPrimaryKey || col.isPrimary || col.primaryKey || col.isNotNull || col.required;
        let tsType = "string";
        switch (col.type?.toLowerCase()) {
          case "integer":
          case "int":
          case "number":
          case "float":
          case "double":
          case "real":
            tsType = "number";
            break;
          case "boolean":
          case "bool":
            tsType = "boolean";
            break;
          case "json":
          case "object":
            tsType = "Record<string, unknown>";
            break;
          default:
            tsType = "string";
        }
        return `  ${fieldName}${isReq ? "" : "?"}: ${tsType};`;
      });

      fieldLines.push("  [key: string]: unknown;");
      code += `export interface ${pascal} {\n${fieldLines.join("\n")}\n}\n`;
    }

    // Generate dual singular/plural type aliases so both "Product" and "Products" work seamlessly
    if (singularPascal && singularPascal !== pascal && !seenNames.has(singularPascal)) {
      seenNames.add(singularPascal);
      code += `export type ${singularPascal} = ${pascal};\n`;
    }
    if (pluralPascal && pluralPascal !== pascal && !seenNames.has(pluralPascal)) {
      seenNames.add(pluralPascal);
      code += `export type ${pluralPascal} = ${pascal};\n`;
    }
    code += `\n`;
  }

  // 1. Entity and Ref nodes
  const entityNodes = nodes.filter(
    (n) =>
      n.type === "entity" ||
      n.type === "db_ref" ||
      n.type === "redis_schema" ||
      n.type === "redis-cache",
  );

  entityNodes.forEach((node) => {
    const rawName = node.data?.label || node.data?.tableRef || "Entity";
    const pascal = toPascalCase(rawName);
    if (!pascal || seenNames.has(pascal)) return;
    seenNames.add(pascal);

    const cols = node.data?.columns || [];
    renderEntityInterface(pascal, rawName, cols);
  });

  // 2. Database nodes with embedded tables
  const dbNodes = nodes.filter(
    (n) => n.type === "database",
  );

  dbNodes.forEach((dbNode) => {
    const tables: Array<{ name?: string; label?: string; tableRef?: string; columns?: Array<{ name?: string; type?: string }>; fields?: Array<{ name?: string; type?: string }> }> =
      (dbNode.data as unknown as { tables?: Array<{ name?: string; label?: string; tableRef?: string; columns?: Array<{ name?: string; type?: string }>; fields?: Array<{ name?: string; type?: string }> }> })?.tables || [];
    tables.forEach((tbl) => {
      const rawName = tbl.name || tbl.label || tbl.tableRef || "Entity";
      const pascal = toPascalCase(rawName);
      if (!pascal || seenNames.has(pascal)) return;
      seenNames.add(pascal);

      const cols = tbl.columns || tbl.fields || [];
      renderEntityInterface(pascal, rawName, cols);
    });
  });

  // 3. Fallback for any entities referenced by endpoints (e.g. Products, Users)
  if (referencedEntityNames) {
    referencedEntityNames.forEach((entName) => {
      const pascal = toPascalCase(entName);
      if (pascal && !seenNames.has(pascal)) {
        seenNames.add(pascal);
        renderEntityInterface(pascal, entName, []);
      }
    });
  }

  if (seenNames.size === 0) {
    code += `export type GenericEntity = Record<string, unknown>;\n`;
  }

  return code;
}

function inferBindingType(
  binding: { argName?: string; source?: { kind?: string; stepId?: string; field?: string; value?: unknown } },
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
            return "string";
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

function generateResponseInterface(
  interfaceName: string,
  responseFields: ResponseFieldItem[] = [],
  legacyResponseBody?: SchemaItem,
  nodes: BackendNode[] = [],
  ep?: Endpoint,
  serviceNode?: BackendNode,
): { code: string; entityImports: Set<string> } {
  const entityImports = new Set<string>();

  // 1. Explicit response fields (from EndpointConfig.tsx)
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

  // 2. Explicit responseBody (from EndpointConfig.tsx / NestedResponseSchemaEditor)
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

  // 3. Pipeline Steps (from EndpointConfig.tsx -> PipelineStepEditor)
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
    } else {
      // Pipeline steps without explicit return_response step
      const lastStep = [...ep.pipelineSteps].reverse().find((s) => s.enabled !== false);
      let lastDataType = "Record<string, string | number | boolean | null>";
      if (lastStep?.type === "db_operation") {
        const dbNodeId =
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
  }

  // 4. Output JSON string (from EndpointList.tsx / Endpoint)
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

  // 5. Database linkage
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

  // 6. Endpoint on ServiceNode (Health check or Default endpoint without custom schema)
  const isHealth = shape.kind === "health";
  if (isHealth) {
    const code =
      `export interface ${interfaceName} {\n` +
      `  message: string;\n` +
      `}\n`;
    return { code, entityImports };
  }

  // 7. General fallback
  const code = buildResponseInterfaceBody(interfaceName, shape, entityImports);
  return { code, entityImports };
}

export function generateTypesPackage(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  servicesInfo?: { id: string; name: string; folderName: string }[],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const barrelExports: string[] = [];

  // 1. package.json - Zero internal workspace dependencies to prevent cyclic dependencies
  const packageJson = JSON.stringify(
    {
      name: "@workspace/types",
      version: "0.0.0",
      private: true,
      description:
        "Shared TypeScript interfaces and Zod schemas across microservices and frontend clients",
      main: "src/index.ts",
      types: "src/index.ts",
      scripts: {
        build: "tsc",
        "check-types": "tsc --noEmit",
      },
      dependencies: {
        zod: "^3.24.2",
      },
      devDependencies: {
        "@workspace/typescript-config": "workspace:*",
        typescript: "^5.3.3",
      },
    },
    null,
    2,
  );
  files.push({
    filename: "package.json",
    language: "json",
    content: packageJson,
  });

  // 2. tsconfig.json
  const tsconfig = JSON.stringify(
    {
      extends: "@workspace/typescript-config/base.json",
      compilerOptions: {
        outDir: "./dist",
        rootDir: "./src",
      },
      include: ["src/**/*"],
    },
    null,
    2,
  );
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: tsconfig,
  });

  // 2. Scan all endpoints to discover all referenced entities before generating entities module
  const referencedEntities = new Set<string>();
  const endpointNodes = nodes.filter(
    (n) =>
      n.type === "service" ||
      n.type === "api_gateway" ||
      n.type === "serverless" ||
      Boolean(n.data && (n.data.endpoints || n.data.routeGroups)),
  );

  endpointNodes.forEach((serviceNode) => {
    let nodeEndpoints = endpoints.filter(
      (e) =>
        e.nodeId === serviceNode.id ||
        (e.nodeId &&
          ((serviceNode.data?.label && e.nodeId === serviceNode.data.label) ||
            (serviceNode.data?.label && e.nodeId === serviceNode.data.label.toLowerCase()))),
    );
    if (nodeEndpoints.length === 0 && serviceNode.data?.endpoints) {
      nodeEndpoints = serviceNode.data.endpoints.map((ep) => ({
        ...ep,
        nodeId: serviceNode.id,
      }));
    }
    nodeEndpoints.forEach((ep) => {
      const res = generateResponseInterface("Temp", ep.responseFields, ep.responseBody, nodes, ep, serviceNode);
      res.entityImports.forEach((ent) => referencedEntities.add(ent));
    });
  });

  // 2.5 Entities & Schemas: src/entities/index.ts
  const entitiesModuleCode = generateEntitiesModule(nodes, referencedEntities);
  files.push({
    filename: "src/entities/index.ts",
    language: "typescript",
    content: entitiesModuleCode,
  });
  barrelExports.push(`export * from "./entities";`);

  // 3. Service Folders: src/<serviceFolderName>/<routeFileName>.ts
  const processedServiceFolders = new Set<string>();

  endpointNodes.forEach((serviceNode) => {
    const srvInfo = servicesInfo?.find((s) => s.id === serviceNode.id);
    const rawServiceName =
      srvInfo?.name || serviceNode.data?.label || serviceNode.id || "Service";
    const folderBase = srvInfo?.folderName || rawServiceName;
    let serviceFolderName = toVarName(folderBase) || "service";
    let pascalServiceName = toPascalCase(folderBase);

    let dupCount = 1;
    const baseFolderName = serviceFolderName;
    const basePascalName = pascalServiceName;
    while (processedServiceFolders.has(serviceFolderName)) {
      dupCount += 1;
      serviceFolderName = `${baseFolderName}_${dupCount}`;
      pascalServiceName = `${basePascalName}${dupCount}`;
    }
    processedServiceFolders.add(serviceFolderName);

    // Gather all endpoints for this node
    let nodeEndpoints = endpoints.filter(
      (e) =>
        e.nodeId === serviceNode.id ||
        (e.nodeId &&
          ((serviceNode.data?.label && e.nodeId === serviceNode.data.label) ||
            (serviceNode.data?.label && e.nodeId === serviceNode.data.label.toLowerCase()))),
    );
    if (nodeEndpoints.length === 0 && serviceNode.data?.endpoints) {
      nodeEndpoints = serviceNode.data.endpoints.map((ep) => ({
        ...ep,
        nodeId: serviceNode.id,
      }));
    }

    const routeFileExports: string[] = [];
    const usedFileNames = new Set<string>();

    if (nodeEndpoints.length > 0) {
      nodeEndpoints.forEach((ep, index) => {
        let routeFileName = deriveRouteFileName(ep, index, rawServiceName);

        if (usedFileNames.has(routeFileName)) {
          routeFileName = `${routeFileName}_${index + 1}`;
        }
        usedFileNames.add(routeFileName);

        // Disambiguate type names with PascalCase Service Name to prevent TS2308 collisions across modules
        const method = (ep.type || "GET").toLowerCase();
        const pascalName = `${pascalServiceName}${toPascalCase(routeFileName)}`;
        const schemaVarPrefix = `${serviceFolderName}${toPascalCase(routeFileName)}`;
        const isBodyMethod = ["post", "put", "patch"].includes(method);


        const paramsTypeRes = parametersToTsInterface(
          `${pascalName}Params`,
          ep.pathParams,
          true,
        );
        const queryTypeRes = parametersToTsInterface(
          `${pascalName}Query`,
          ep.queryParams,
          false,
        );
        const bodyTypeRes = schemaToTsInterface(
          `${pascalName}Body`,
          ep.requestBody,
        );
        const responseResInfo = generateResponseInterface(
          `${pascalName}Response`,
          ep.responseFields,
          ep.responseBody,
          nodes,
          ep,
          serviceNode,
        );

        const queryZodRes = parametersToZodSchema(
          `${schemaVarPrefix}QuerySchema`,
          ep.queryParams,
          false,
        );
        const bodyZodRes = schemaToZodSchema(
          `${schemaVarPrefix}BodySchema`,
          ep.requestBody,
        );

        const entityImportStatement =
          responseResInfo.entityImports.size > 0
            ? `import type { ${Array.from(responseResInfo.entityImports).join(", ")} } from "../entities";\n`
            : "";

        let singleRouteCode = `import { z } from "zod";\n${entityImportStatement}\n`;
        singleRouteCode += `/**\n * ${ep.type || "GET"} ${ep.name || "/"}\n * Service: ${rawServiceName}\n * ${ep.summary || "Route Schema"}\n */\n`;
        singleRouteCode += `// --- Input Schemas ---\n`;
        singleRouteCode += paramsTypeRes.code + "\n";
        singleRouteCode += queryTypeRes.code + "\n";
        if (isBodyMethod) {
          singleRouteCode += bodyTypeRes.code + "\n";
        } else {
          singleRouteCode += `export type ${pascalName}Body = never;\n\n`;
        }

        singleRouteCode += `// --- Output Schemas (Success & Error) ---\n`;
        singleRouteCode += responseResInfo.code + "\n";
        if (ep.errorResponseBody) {
          const errorRes = schemaToTsInterface(`${pascalName}ErrorResponse`, ep.errorResponseBody);
          if (errorRes.hasContent) {
            singleRouteCode += errorRes.code + "\n";
          } else {
            singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: unknown;\n}\n\n`;
          }
        } else {
          singleRouteCode += `export interface ${pascalName}ErrorResponse {\n  error: string;\n  message: string;\n  statusCode?: number;\n  details?: unknown;\n}\n\n`;
        }

        singleRouteCode += `// --- Zod Validation Schemas ---\n`;
        if (queryTypeRes.hasContent) {
          singleRouteCode += queryZodRes.code + "\n";
        }
        if (isBodyMethod && bodyTypeRes.hasContent) {
          singleRouteCode += bodyZodRes.code + "\n";
        }

        // File per route: src/<serviceFolderName>/<routeFileName>.ts
        files.push({
          filename: `src/${serviceFolderName}/${routeFileName}.ts`,
          language: "typescript",
          content: singleRouteCode,
        });

        routeFileExports.push(`export * from "./${routeFileName}";`);
      });

      // Service barrel file: src/<serviceFolderName>/index.ts
      files.push({
        filename: `src/${serviceFolderName}/index.ts`,
        language: "typescript",
        content: `/**\n * Schemas for ${rawServiceName}\n */\n${routeFileExports.join("\n")}\n`,
      });

      barrelExports.push(`export * from "./${serviceFolderName}";`);
      barrelExports.push(
        `export * as ${pascalServiceName} from "./${serviceFolderName}";`,
      );
    }
  });

  // 4. Events Types: src/events/index.ts
  const seenEventIds = new Set<string>(events.map((e) => e.id));
  const allEvents: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [...events];

  nodes.forEach((n) => {
    if (n.data?.publishedEvents) {
      n.data.publishedEvents.forEach((e) => {
        if (!seenEventIds.has(e.id)) {
          seenEventIds.add(e.id);
          allEvents.push({ ...e, nodeId: n.id, variant: "publish" as const });
        }
      });
    }
    if (n.data?.consumedEvents) {
      n.data.consumedEvents.forEach((e) => {
        if (!seenEventIds.has(e.id)) {
          seenEventIds.add(e.id);
          allEvents.push({ ...e, nodeId: n.id, variant: "consume" as const });
        }
      });
    }
  });

  let eventsCode = `import { z } from "zod";\n\n`;
  if (allEvents.length === 0) {
    eventsCode += `// No messaging events configured\nexport type GenericEventPayload = Record<string, string | number | boolean | null>;\n`;
  } else {
    const processedEventNames = new Set<string>();

    allEvents.forEach((ev) => {
      const eventName = ev.name || "event";
      const eventPascalName = toPascalCase(eventName);
      if (processedEventNames.has(eventPascalName)) return;
      processedEventNames.add(eventPascalName);

      const payloadInterfaceName = `${eventPascalName}EventPayload`;
      const schemaName = `${toVarName(eventName)}PayloadSchema`;

      let payloadSchema = ev.payloadSchema;
      if (ev.brokerNodeId && ev.messagingResourceId) {
        const brokerNode = nodes.find((n) => n.id === ev.brokerNodeId);
        const brokerResources = [
          ...(brokerNode?.data?.topics || []),
          ...(brokerNode?.data?.streams || []),
          ...(brokerNode?.data?.queues || []),
          ...(brokerNode?.data?.channels || []),
        ];
        const brokerResource = brokerResources.find((r) => r.id === ev.messagingResourceId);
        if (brokerResource?.payloadSchema) {
          payloadSchema = brokerResource.payloadSchema;
        }
      }

      const schemaObj = {
        rawJson: payloadSchema?.rawJson,
        fields: payloadSchema?.fields,
        mode: payloadSchema?.mode,
        requestBodyMode: payloadSchema?.requestBodyMode,
      };

      const interfaceRes = schemaToTsInterface(payloadInterfaceName, schemaObj);
      const zodRes = schemaToZodSchema(schemaName, schemaObj);

      eventsCode += `// --- Event Contract: "${eventName}" ---\n`;
      eventsCode += interfaceRes.code + "\n";
      if (zodRes.hasContent) {
        eventsCode += zodRes.code + "\n";
      }
    });
  }

  files.push({
    filename: "src/events/index.ts",
    language: "typescript",
    content: eventsCode,
  });

  barrelExports.push(`export * from "./events";`);

function sanitizeCustomTypeString(rawType: string): string {
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

  // 4.9 Custom Reusable Types (defined on canvas via Types nodes)
  const typesNodes = nodes.filter((n) => n.type === "types");
  if (typesNodes.length > 0) {
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

    files.push({
      filename: "src/custom.ts",
      language: "typescript",
      content: customTypesCode,
    });

    barrelExports.push(`export * from "./custom";`);
  }

  // 5. Root Index barrel: src/index.ts
  const indexContent = `/**
 * Shared Type Definitions & Zod Validation Schemas
 * Reused across all microservices (@workspace/*) and frontend web pages
 */
${barrelExports.join("\n")}
`;

  files.push({
    filename: "src/index.ts",
    language: "typescript",
    content: indexContent,
  });

  return files;
}
